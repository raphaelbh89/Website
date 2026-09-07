import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getSessionCookieName, normalizeEmail } from '@platform/auth';
import type { createDatabase } from '@platform/database';
import { AuthService, type AuthenticatedUserSession } from './auth.service.js';
import { extractSessionToken, requireAuthentication, requirePermission } from './auth.guard.js';

export interface AppOptions {
  checkDatabase: () => Promise<void>;
  database?: ReturnType<typeof createDatabase>;
  logger?: boolean;
  nodeEnv?: 'development' | 'test' | 'production';
  cookieSecret?: string;
  corsOrigin?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthenticatedUserSession;
  }
}

export { extractSessionToken, requireAuthentication, requirePermission } from './auth.guard.js';

export function buildApp(
  checkDatabaseOrOptions: (() => Promise<void>) | AppOptions,
  legacyLogger = false
): FastifyInstance {
  const options: AppOptions =
    typeof checkDatabaseOrOptions === 'function'
      ? { checkDatabase: checkDatabaseOrOptions, logger: legacyLogger }
      : checkDatabaseOrOptions;

  const isProduction = options.nodeEnv === 'production';
  const cookieName = getSessionCookieName(isProduction);
  const allowedOrigins = (options.corsOrigin ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1048576,
    requestTimeout: 10000,
  });

  const authService = options.database ? new AuthService(options.database) : null;

  // 1. Register Fastify Cookie Plugin
  void app.register(cookie, {
    secret: options.cookieSecret ?? 'development-only-insecure-cookie-secret-32-chars-min!',
  });

  // 2. Register Fastify CORS Plugin
  void app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  });

  // 3. Register Fastify Rate Limit Plugin
  void app.register(rateLimit, {
    global: false,
  });

  let loginLimiter: ReturnType<FastifyInstance['createRateLimit']> | null = null;
  app.addHook('onReady', () => {
    loginLimiter = app.createRateLimit({
      max: 5,
      timeWindow: 60000,
      keyGenerator: (request) => {
        const ip = request.ip;
        const body = request.body as { email?: unknown } | undefined;
        if (body && typeof body.email === 'string' && body.email.trim()) {
          return `${ip}:${normalizeEmail(body.email)}`;
        }
        return ip;
      },
    });
  });

  // 4. Hardened CSRF & Origin Verification Pre-handler Hook on Mutating Endpoints
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(request.method)) {
      return;
    }

    const origin = request.headers.origin;
    const referer = request.headers.referer;

    // A. Origin header verification
    if (origin) {
      if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid request origin' });
      }
    } else if (referer) {
      // B. Referer header fallback verification
      try {
        const refererOrigin = new URL(referer).origin;
        if (!allowedOrigins.includes(refererOrigin) && !allowedOrigins.includes('*')) {
          return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid request referer' });
        }
      } catch {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Malformed referer header' });
      }
    }

    // C. Content-Type verification for JSON endpoints with payload
    if (request.body && request.headers['content-type']) {
      const contentType = request.headers['content-type'].toLowerCase();
      if (!contentType.includes('application/json')) {
        return reply.code(415).send({
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Expected application/json Content-Type',
        });
      }
    }
  });

  // 5. Health check endpoints
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      await options.checkDatabase();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  // 6. Authentication Endpoints
  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    // Enforce brute-force rate limit by IP + normalized email
    if (loginLimiter) {
      const limitStatus = await loginLimiter(request);
      if (!limitStatus.isAllowed && limitStatus.isExceeded) {
        return reply.code(429).send({
          error: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Please try again later.',
        });
      }
    }

    if (!authService) {
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
    }

    const body = request.body as { email?: unknown; password?: unknown };
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Email and password are required' });
    }

    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await authService.login(body.email, body.password, { ipAddress, userAgent });
    if (!result) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid email or password' });
    }

    // Set secure HttpOnly cookie (strictly without Domain attribute for __Host- compatibility)
    void reply.setCookie(cookieName, result.rawToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    return {
      user: result.user,
      token: result.rawToken,
    };
  });

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    const token = extractSessionToken(request, cookieName);
    if (token && authService) {
      await authService.logout(token);
    }

    void reply.clearCookie(cookieName, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });

    return { status: 'ok' };
  });

  app.get('/auth/me', {
    preHandler: [requireAuthentication(authService, cookieName)],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    return request.authSession;
  });

  // 7. M2.3 Scoped Authorization Proof Endpoints
  app.get(
    '/admin/proof',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.read', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        status: 'ok',
        message: 'Global admin proof accessed',
        user: request.authSession?.user,
      };
    }
  );

  app.get(
    '/sites/:siteId/proof',
    {
      preHandler: [
        requirePermission(authService, cookieName, 'sites.read', (req) => ({
          kind: 'site',
          siteId: (req.params as { siteId: string }).siteId,
        })),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      const { siteId } = request.params as { siteId: string };
      return {
        status: 'ok',
        message: 'Site proof accessed',
        siteId,
        user: request.authSession?.user,
      };
    }
  );

  return app;
}

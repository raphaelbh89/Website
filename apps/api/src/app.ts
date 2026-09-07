import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getSessionCookieName } from '@platform/auth';
import type { createDatabase } from '@platform/database';
import { AuthService, type AuthenticatedUserSession } from './auth.service.js';

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

  // 1. Register plugins
  void app.register(cookie, {
    secret: options.cookieSecret ?? 'development-only-insecure-cookie-secret-32-chars-min!',
  });

  void app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, server-to-server, mobile apps)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      // For CORS policy, passing false will not add CORS headers but not crash with 500
      return cb(null, false);
    },
    credentials: true,
  });

  void app.register(rateLimit, {
    global: false,
  });

  let loginLimiter: ReturnType<FastifyInstance['createRateLimit']> | null = null;
  app.addHook('onReady', () => {
    loginLimiter = app.createRateLimit({
      max: 5,
      timeWindow: 60000,
    });
  });

  // 2. CSRF / Origin Verification Pre-handler Hook on Mutating Endpoints
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(request.method)) {
      return;
    }

    const origin = request.headers.origin;
    const referer = request.headers.referer;

    // If an Origin header is present in the browser request, it must be in allowedOrigins
    if (origin) {
      if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid request origin' });
      }
    } else if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (!allowedOrigins.includes(refererOrigin) && !allowedOrigins.includes('*')) {
          return reply.code(403).send({ error: 'FORBIDDEN', message: 'Invalid request referer' });
        }
      } catch {
        return reply.code(403).send({ error: 'FORBIDDEN', message: 'Malformed referer header' });
      }
    }
  });

  // Helper: Extract session token from cookie (precedence) or Authorization Bearer header
  function extractSessionToken(request: FastifyRequest): string | null {
    // 1. Cookie precedence (Browser Admin)
    const cookieToken = request.cookies[cookieName];
    if (cookieToken) return cookieToken;

    // 2. Bearer Header precedence (API/Mobile clients)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    return null;
  }

  // 3. Health check endpoints
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

  // 4. Authentication Endpoints
  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    // Enforce brute-force rate limit
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

    // Set secure HttpOnly cookie
    void reply.setCookie(cookieName, result.rawToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    return {
      user: result.user,
      token: result.rawToken, // Also return token for mobile/API clients
    };
  });

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    const token = extractSessionToken(request);
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

  app.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');

    if (!authService) {
      return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
    }

    const token = extractSessionToken(request);
    if (!token) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const sessionData = await authService.resolveSession(token);
    if (!sessionData) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired session' });
    }

    return sessionData;
  });

  return app;
}

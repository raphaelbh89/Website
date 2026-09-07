import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getSessionCookieName, normalizeEmail } from '@platform/auth';
import type { createDatabase } from '@platform/database';
import { AuthService, type AuthenticatedUserSession } from './auth.service.js';
import { AdminService } from './admin.service.js';
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
  const adminService = options.database ? new AdminService(options.database) : null;

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

  // ---------------------------------------------------------------------------
  // 8. M2.4 User Management Endpoints
  // ---------------------------------------------------------------------------

  app.get(
    '/users',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.read', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const query = request.query as { page?: string; limit?: string; search?: string; isActive?: string };
      const page = query.page ? parseInt(query.page, 10) : 1;
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const isActive = query.isActive !== undefined ? query.isActive === 'true' : undefined;

      const result = await adminService.listUsers({ page, limit, search: query.search, isActive });
      return result;
    }
  );

  app.post(
    '/users',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.create', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const body = request.body as { email?: string; name?: string; password?: string; isActive?: boolean };
      if (!body) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Request body required' });
      }

      const res = await adminService.createUser({
        email: body.email ?? '',
        name: body.name ?? '',
        password: body.password ?? '',
        isActive: body.isActive,
      });

      if (res.error) {
        return reply.code(res.status ?? 400).send({ error: res.status === 409 ? 'CONFLICT' : 'BAD_REQUEST', message: res.error });
      }

      return reply.code(201).send(res);
    }
  );

  app.get(
    '/users/:id',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.read', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const user = await adminService.getUser(id);
      if (!user) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'User not found' });
      }

      return { user };
    }
  );

  app.patch(
    '/users/:id',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.update', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { email?: string; name?: string; password?: string; isActive?: boolean };
      if (!body) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Request body required' });
      }

      const res = await adminService.updateUser(id, body);
      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return res;
    }
  );

  app.post(
    '/users/:id/deactivate',
    {
      preHandler: [requirePermission(authService, cookieName, 'users.deactivate', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const res = await adminService.deactivateUser(id);
      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return { status: 'ok', user: res.user };
    }
  );

  // ---------------------------------------------------------------------------
  // 9. M2.4 Role Management Endpoints
  // ---------------------------------------------------------------------------

  app.get(
    '/roles',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.read', () => ({ kind: 'global' }))],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const rolesList = await adminService.listRoles();
      return { roles: rolesList };
    }
  );

  app.post(
    '/roles',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.manage', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const body = request.body as { key?: string; name?: string; description?: string; permissions?: string[] };
      if (!body) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Request body required' });
      }

      const res = await adminService.createRole({
        key: body.key ?? '',
        name: body.name ?? '',
        description: body.description,
        permissions: body.permissions,
      });

      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return reply.code(201).send(res);
    }
  );

  app.get(
    '/roles/:id',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.read', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const role = await adminService.getRole(id);
      if (!role) {
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'Role not found' });
      }

      return { role };
    }
  );

  app.patch(
    '/roles/:id',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.manage', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { name?: string; description?: string };
      if (!body) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'Request body required' });
      }

      const res = await adminService.updateRole(id, body);
      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return res;
    }
  );

  app.put(
    '/roles/:id/permissions',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.manage', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { permissions?: string[] };
      if (!body || !Array.isArray(body.permissions)) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'permissions array required' });
      }

      const res = await adminService.updateRolePermissions(id, body.permissions);
      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return res;
    }
  );

  app.get(
    '/permissions',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.read', () => ({ kind: 'global' }))],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const perms = await adminService.listPermissions();
      return { permissions: perms };
    }
  );

  app.get(
    '/sites',
    {
      preHandler: [requirePermission(authService, cookieName, 'sites.read', () => ({ kind: 'global' }))],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const sitesList = await adminService.listSites();
      return { sites: sitesList };
    }
  );

  // ---------------------------------------------------------------------------
  // 10. M2.4 Role Assignment Endpoints
  // ---------------------------------------------------------------------------

  app.get(
    '/users/:id/roles',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.assign', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const assignments = await adminService.listUserRoleAssignments(id);
      return { assignments };
    }
  );

  app.post(
    '/users/:id/roles',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.assign', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { roleId?: string; scopeKind?: 'global' | 'site'; scopeId?: string | null };
      if (!body || !body.roleId || !body.scopeKind) {
        return reply.code(400).send({ error: 'BAD_REQUEST', message: 'roleId and scopeKind required' });
      }

      const res = await adminService.assignRole(id, {
        roleId: body.roleId,
        scopeKind: body.scopeKind,
        scopeId: body.scopeId,
      });

      if (res.error) {
        const statusCode = res.status ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return reply.code(201).send(res);
    }
  );

  app.delete(
    '/users/:id/roles/:assignmentId',
    {
      preHandler: [requirePermission(authService, cookieName, 'roles.assign', () => ({ kind: 'global' }))],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      if (!adminService) {
        return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      }

      const { id, assignmentId } = request.params as { id: string; assignmentId: string };
      const res = await adminService.removeRoleAssignment(id, assignmentId);
      if (res.error) {
        const statusCode = res.status_code ?? 400;
        const errType = statusCode === 404 ? 'NOT_FOUND' : 'BAD_REQUEST';
        return reply.code(statusCode).send({ error: errType, message: res.error });
      }

      return { status: 'ok' };
    }
  );

  return app;
}

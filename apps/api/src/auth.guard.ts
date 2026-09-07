import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission, type Scope } from '@platform/auth';
import type { AuthService, AuthenticatedUserSession } from './auth.service.js';

export type ScopeResolver = (request: FastifyRequest) => Scope | string | undefined | Promise<Scope | string | undefined>;

export function extractSessionToken(request: FastifyRequest, cookieName: string): string | null {
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

/**
 * Fastify preHandler hook to enforce that a request is authenticated.
 * Attaches request.authSession on success.
 * Returns 401 Unauthorized if unauthenticated, expired, or inactive.
 */
export function requireAuthentication(authService: AuthService | null, cookieName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!authService) {
      void reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: 'Database not configured' });
      return;
    }

    if (request.authSession) {
      return;
    }

    const token = extractSessionToken(request, cookieName);
    if (!token) {
      void reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    const sessionData: AuthenticatedUserSession | null = await authService.resolveSession(token);
    if (!sessionData) {
      void reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired session' });
      return;
    }

    request.authSession = sessionData;
  };
}

/**
 * Fastify preHandler hook to enforce required permission and scope.
 * Follows allow-list, deny-by-default, and hierarchical scoped RBAC.
 * - Returns 401 if unauthenticated.
 * - Returns 403 if authenticated but lacking required permission for target scope.
 */
export function requirePermission(
  authService: AuthService | null,
  cookieName: string,
  permission: string,
  scopeResolver?: ScopeResolver
) {
  const authenticate = requireAuthentication(authService, cookieName);

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 1. Enforce authentication first
    if (!request.authSession) {
      await authenticate(request, reply);
      if (reply.sent) return;
    }

    const authSession = request.authSession;
    if (!authSession) {
      void reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    // 2. Resolve target scope
    const targetScope = scopeResolver ? await scopeResolver(request) : { kind: 'global' as const };

    // 3. Evaluate permission grants
    const allowed = hasPermission(authSession.grants, permission, targetScope);
    if (!allowed) {
      void reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions for target scope',
      });
      return;
    }
  };
}

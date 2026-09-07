/** M1 contract only. Callers must supply grants from trusted server-side storage, never request input. */
export type Grant = { permission: string; scope: { kind: 'global' } | { kind: 'site'; siteId: string } };
export function hasPermission(grants: readonly Grant[], permission: string, siteId?: string): boolean {
  return grants.some(grant => grant.permission === permission &&
    (grant.scope.kind === 'global' || (siteId !== undefined && grant.scope.siteId === siteId)));
}


import { expect, it } from 'vitest';
import { hasPermission, type Grant } from './index.js';
it('denies by default and prevents site grants from crossing boundaries', () => {
  const grants: Grant[] = [{ permission: 'content.read', scope: { kind: 'site', siteId: 'a' } }];
  expect(hasPermission([], 'content.read', 'a')).toBe(false);
  expect(hasPermission(grants, 'content.read', 'a')).toBe(true);
  expect(hasPermission(grants, 'content.write', 'a')).toBe(false);
  expect(hasPermission(grants, 'content.read', 'b')).toBe(false);
  expect(hasPermission(grants, 'content.read')).toBe(false);
  expect(hasPermission([{ permission: 'content.read', scope: { kind: 'global' } }], 'content.read', 'b')).toBe(true);
});


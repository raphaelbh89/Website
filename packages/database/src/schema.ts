import { pgTable, text, timestamp, uuid, boolean, primaryKey, index } from 'drizzle-orm/pg-core';
import { v7 } from 'uuid';

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_expires_at_idx').on(table.expiresAt),
]);

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  module: text('module').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId] }),
  index('role_permissions_role_id_idx').on(table.roleId),
  index('role_permissions_permission_id_idx').on(table.permissionId),
]);

export const userRoleAssignments = pgTable('user_role_assignments', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  scopeKind: text('scope_kind').notNull(), // 'global' | 'site' | 'campus' | 'resource'
  scopeId: text('scope_id'), // siteId, campusId, or resourceId (NULL for global)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('user_role_assignments_user_id_idx').on(table.userId),
  index('user_role_assignments_role_id_idx').on(table.roleId),
  index('user_role_assignments_scope_idx').on(table.scopeKind, table.scopeId),
]);

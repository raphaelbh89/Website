import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
  uniqueIndex('user_role_assignments_unique_idx').on(
    table.userId,
    table.roleId,
    table.scopeKind,
    table.scopeId
  ),
]);

export const contentTypes = pgTable('content_types', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  kind: text('kind').notNull(), // 'single' | 'collection'
  scopeKind: text('scope_kind').notNull(), // 'global' | 'site'
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  isSystem: boolean('is_system').notNull().default(false),
  dataSchema: jsonb('data_schema').notNull(),
  uiSchema: jsonb('ui_schema'),
  capabilities: jsonb('capabilities'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('content_types_site_id_idx').on(table.siteId),
  uniqueIndex('content_types_scope_site_key_idx').on(table.scopeKind, table.siteId, table.key),
]);

export const contentEntries = pgTable('content_entries', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  contentTypeId: uuid('content_type_id').notNull().references(() => contentTypes.id, { onDelete: 'cascade' }),
  locale: text('locale').notNull(),
  translationGroupId: uuid('translation_group_id').notNull().$defaultFn(v7),
  entryKind: text('entry_kind').notNull(), // 'single' | 'collection'
  currentRevisionId: uuid('current_revision_id'),
  publishedRevisionId: uuid('published_revision_id'),
  publishedSlug: text('published_slug'),
  lifecycleState: text('lifecycle_state').notNull().default('active'), // 'active' | 'archived'
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('content_entries_site_type_locale_idx').on(table.siteId, table.contentTypeId, table.locale, table.lifecycleState),
  uniqueIndex('content_entries_translation_locale_unique_idx').on(table.translationGroupId, table.locale),
  uniqueIndex('content_entries_single_unique_idx').on(table.siteId, table.contentTypeId, table.locale, table.entryKind),
  uniqueIndex('content_entries_published_slug_unique_idx').on(table.siteId, table.contentTypeId, table.locale, table.publishedSlug),
]);

export const contentEntryRevisions = pgTable('content_entry_revisions', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  entryId: uuid('entry_id').notNull().references(() => contentEntries.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  title: text('title').notNull(),
  slug: text('slug'),
  data: jsonb('data').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('content_entry_revisions_entry_version_unique_idx').on(table.entryId, table.versionNumber),
  index('content_entry_revisions_entry_created_idx').on(table.entryId, table.createdAt),
]);


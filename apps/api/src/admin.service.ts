import type { createDatabase } from '@platform/database';
import {
  users,
  roles,
  permissions,
  rolePermissions,
  userRoleAssignments,
  sites,
  sessions,
} from '@platform/database';
import { hashPassword, normalizeEmail } from '@platform/auth';
import { eq, and, or, ilike, sql, count } from 'drizzle-orm';

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  permissions: string[];
}

export interface UserRoleAssignmentDetail {
  id: string;
  userId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  scopeKind: 'global' | 'site';
  scopeId: string | null;
  siteName?: string | null;
  createdAt: string;
}

export class AdminService {
  constructor(private database: ReturnType<typeof createDatabase>) {}

  // ---------------------------------------------------------------------------
  // User Management
  // ---------------------------------------------------------------------------

  async listUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }): Promise<{ items: UserSummary[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (options.isActive !== undefined) {
      conditions.push(eq(users.isActive, options.isActive));
    }

    if (options.search && options.search.trim()) {
      const query = `%${options.search.trim()}%`;
      conditions.push(or(ilike(users.email, query), ilike(users.name, query)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Query items
    const rows = await this.database.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(sql`${users.createdAt} DESC`, sql`${users.id} DESC`)
      .limit(limit)
      .offset(offset);

    // Query total count
    const [totalRow] = await this.database.db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    const total = Number(totalRow?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUser(id: string): Promise<UserSummary | null> {
    const user = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, id),
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async createUser(data: {
    email: string;
    name: string;
    password: string;
    isActive?: boolean;
  }): Promise<{ user?: UserSummary; error?: string; status?: number }> {
    const normalized = normalizeEmail(data.email);
    if (!normalized || !normalized.includes('@')) {
      return { error: 'Invalid email address', status: 400 };
    }
    if (!data.name || !data.name.trim()) {
      return { error: 'Name is required', status: 400 };
    }
    if (!data.password || data.password.length < 8) {
      return { error: 'Password must be at least 8 characters', status: 400 };
    }

    const existing = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.email, normalized),
    });
    if (existing) {
      return { error: 'Email already exists', status: 409 };
    }

    const passwordHash = await hashPassword(data.password);
    const [created] = await this.database.db
      .insert(users)
      .values({
        email: normalized,
        name: data.name.trim(),
        passwordHash,
        isActive: data.isActive ?? true,
      })
      .returning();

    if (!created) {
      return { error: 'Failed to create user', status: 500 };
    }

    return {
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        isActive: created.isActive,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    };
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      name?: string;
      password?: string;
      isActive?: boolean;
    }
  ): Promise<{ user?: UserSummary; error?: string; status?: number }> {
    const existing = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, id),
    });
    if (!existing) {
      return { error: 'User not found', status: 404 };
    }

    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      if (!data.name.trim()) return { error: 'Name cannot be empty', status: 400 };
      updates.name = data.name.trim();
    }

    if (data.email !== undefined) {
      const normalized = normalizeEmail(data.email);
      if (!normalized || !normalized.includes('@')) {
        return { error: 'Invalid email address', status: 400 };
      }
      if (normalized !== existing.email) {
        const duplicate = await this.database.db.query.users.findFirst({
          where: (u, { eq: eqOp }) => eqOp(u.email, normalized),
        });
        if (duplicate) {
          return { error: 'Email already exists', status: 409 };
        }
        updates.email = normalized;
      }
    }

    let passwordChanged = false;
    if (data.password !== undefined) {
      if (data.password.length < 8) {
        return { error: 'Password must be at least 8 characters', status: 400 };
      }
      updates.passwordHash = await hashPassword(data.password);
      passwordChanged = true;
    }

    let deactivating = false;
    if (data.isActive !== undefined) {
      if (data.isActive === false && existing.isActive === true) {
        deactivating = true;
        // Check Last Super Admin Protection
        const isLast = await this.isLastActiveGlobalSuperAdmin(id);
        if (isLast) {
          return {
            error: 'Cannot deactivate the last active global system super admin',
            status: 400,
          };
        }
      }
      updates.isActive = data.isActive;
    }

    const [updated] = await this.database.db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return { error: 'Failed to update user', status: 500 };
    }

    // If password changed or user was deactivated, revoke all active sessions for this user
    if (passwordChanged || deactivating) {
      await this.database.db.delete(sessions).where(eq(sessions.userId, id));
    }

    return {
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  async deactivateUser(id: string): Promise<{ user?: UserSummary; error?: string; status?: number }> {
    return this.updateUser(id, { isActive: false });
  }

  // ---------------------------------------------------------------------------
  // Role Management
  // ---------------------------------------------------------------------------

  async listRoles(): Promise<RoleDetail[]> {
    const allRoles = await this.database.db.select().from(roles).orderBy(roles.createdAt);
    const allRolePerms = await this.database.db
      .select({
        roleId: rolePermissions.roleId,
        permissionKey: permissions.key,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

    const permMap = new Map<string, string[]>();
    for (const rp of allRolePerms) {
      const list = permMap.get(rp.roleId) ?? [];
      list.push(rp.permissionKey);
      permMap.set(rp.roleId, list);
    }

    return allRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      createdAt: r.createdAt.toISOString(),
      permissions: permMap.get(r.id) ?? [],
    }));
  }

  async getRole(id: string): Promise<RoleDetail | null> {
    const role = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, id),
    });
    if (!role) return null;

    const perms = await this.database.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, role.id));

    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt.toISOString(),
      permissions: perms.map((p) => p.key),
    };
  }

  async createRole(data: {
    key: string;
    name: string;
    description?: string;
    permissions?: string[];
  }): Promise<{ role?: RoleDetail; error?: string; status?: number }> {
    const key = data.key.trim().toLowerCase();
    if (!key || !/^[a-z0-9_]+$/.test(key)) {
      return { error: 'Role key must contain only lowercase letters, numbers, and underscores', status: 400 };
    }
    if (!data.name || !data.name.trim()) {
      return { error: 'Role name is required', status: 400 };
    }

    const existing = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, key),
    });
    if (existing) {
      return { error: 'Role key already exists', status: 409 };
    }

    // Validate permission keys if supplied
    const targetPerms: string[] = data.permissions ?? [];
    const validPermRecords = targetPerms.length > 0
      ? await this.database.db.query.permissions.findMany()
      : [];

    const validPermMap = new Map(validPermRecords.map((p) => [p.key, p.id]));
    for (const pk of targetPerms) {
      if (!validPermMap.has(pk)) {
        return { error: `Invalid permission key: ${pk}`, status: 400 };
      }
    }

    const [createdRole] = await this.database.db
      .insert(roles)
      .values({
        key,
        name: data.name.trim(),
        description: data.description?.trim() ?? null,
        isSystem: false,
      })
      .returning();

    if (!createdRole) {
      return { error: 'Failed to create role', status: 500 };
    }

    // Attach permissions
    for (const pk of targetPerms) {
      const permId = validPermMap.get(pk)!;
      await this.database.db.insert(rolePermissions).values({
        roleId: createdRole.id,
        permissionId: permId,
      });
    }

    return {
      role: {
        id: createdRole.id,
        key: createdRole.key,
        name: createdRole.name,
        description: createdRole.description,
        isSystem: createdRole.isSystem,
        createdAt: createdRole.createdAt.toISOString(),
        permissions: targetPerms,
      },
    };
  }

  async updateRole(
    id: string,
    data: {
      name?: string;
      description?: string;
    }
  ): Promise<{ role?: RoleDetail; error?: string; status?: number }> {
    const existing = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, id),
    });
    if (!existing) {
      return { error: 'Role not found', status: 404 };
    }

    const updates: Partial<typeof roles.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) {
      if (!data.name.trim()) return { error: 'Name cannot be empty', status: 400 };
      updates.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updates.description = data.description.trim() || null;
    }

    const [updated] = await this.database.db
      .update(roles)
      .set(updates)
      .where(eq(roles.id, id))
      .returning();

    if (!updated) {
      return { error: 'Failed to update role', status: 500 };
    }

    const perms = await this.database.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, updated.id));

    return {
      role: {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        description: updated.description,
        isSystem: updated.isSystem,
        createdAt: updated.createdAt.toISOString(),
        permissions: perms.map((p) => p.key),
      },
    };
  }

  async updateRolePermissions(
    id: string,
    permissionKeys: string[]
  ): Promise<{ role?: RoleDetail; error?: string; status?: number }> {
    const role = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, id),
    });
    if (!role) {
      return { error: 'Role not found', status: 404 };
    }

    // Protect system_super_admin from being stripped of core permissions
    if (role.isSystem && role.key === 'system_super_admin') {
      const allSystemPerms = await this.database.db.query.permissions.findMany();
      if (permissionKeys.length < allSystemPerms.length) {
        return {
          error: 'Cannot remove system permissions from system_super_admin role',
          status: 400,
        };
      }
    }

    // Validate all permission keys
    const allDbPerms = await this.database.db.query.permissions.findMany();
    const permMap = new Map(allDbPerms.map((p) => [p.key, p.id]));

    for (const pk of permissionKeys) {
      if (!permMap.has(pk)) {
        return { error: `Invalid permission key: ${pk}`, status: 400 };
      }
    }

    // Delete existing permissions for this role and insert new ones
    await this.database.db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));

    for (const pk of permissionKeys) {
      const permId = permMap.get(pk)!;
      await this.database.db.insert(rolePermissions).values({
        roleId: role.id,
        permissionId: permId,
      });
    }

    return {
      role: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        createdAt: role.createdAt.toISOString(),
        permissions: permissionKeys,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Role Assignment Management
  // ---------------------------------------------------------------------------

  async listUserRoleAssignments(userId: string): Promise<UserRoleAssignmentDetail[]> {
    const user = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, userId),
    });
    if (!user) return [];

    const assignments = await this.database.db
      .select({
        id: userRoleAssignments.id,
        userId: userRoleAssignments.userId,
        roleId: userRoleAssignments.roleId,
        roleKey: roles.key,
        roleName: roles.name,
        scopeKind: userRoleAssignments.scopeKind,
        scopeId: userRoleAssignments.scopeId,
        createdAt: userRoleAssignments.createdAt,
      })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(userRoleAssignments.roleId, roles.id))
      .where(eq(userRoleAssignments.userId, userId))
      .orderBy(userRoleAssignments.createdAt);

    // Populate site names for site-scoped assignments
    const allSites = await this.database.db.select().from(sites);
    const siteMap = new Map(allSites.map((s) => [s.id, s.name]));

    return assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      roleId: a.roleId,
      roleKey: a.roleKey,
      roleName: a.roleName,
      scopeKind: a.scopeKind as 'global' | 'site',
      scopeId: a.scopeId,
      siteName: a.scopeId ? siteMap.get(a.scopeId) ?? null : null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async assignRole(
    userId: string,
    data: {
      roleId: string;
      scopeKind: 'global' | 'site';
      scopeId?: string | null;
    }
  ): Promise<{ assignment?: UserRoleAssignmentDetail; error?: string; status?: number }> {
    // 1. Verify User exists
    const user = await this.database.db.query.users.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, userId),
    });
    if (!user) {
      return { error: 'User not found', status: 404 };
    }

    // 2. Verify Role exists
    const role = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, data.roleId),
    });
    if (!role) {
      return { error: 'Role not found', status: 404 };
    }

    // 3. Verify Scope Invariants
    let normalizedScopeId: string | null = null;
    let siteName: string | null = null;

    if (data.scopeKind === 'global') {
      if (data.scopeId !== undefined && data.scopeId !== null && data.scopeId !== '') {
        return { error: 'GLOBAL scope cannot have a scopeId', status: 400 };
      }
      normalizedScopeId = null;
    } else if (data.scopeKind === 'site') {
      if (!data.scopeId || !data.scopeId.trim()) {
        return { error: 'SITE scope requires a valid siteId', status: 400 };
      }
      const siteRecord = await this.database.db.query.sites.findFirst({
        where: (s, { eq: eqOp }) => eqOp(s.id, data.scopeId!.trim()),
      });
      if (!siteRecord) {
        return { error: 'Site does not exist', status: 400 };
      }
      normalizedScopeId = siteRecord.id;
      siteName = siteRecord.name;
    } else {
      return { error: 'Invalid scope kind. Only GLOBAL and SITE are supported in M2', status: 400 };
    }

    // 4. Duplicate Assignment Check
    const existing = await this.database.db.query.userRoleAssignments.findFirst({
      where: (ura, { eq: eqOp, and: andOp, isNull: isNullOp }) =>
        andOp(
          eqOp(ura.userId, userId),
          eqOp(ura.roleId, role.id),
          eqOp(ura.scopeKind, data.scopeKind),
          normalizedScopeId ? eqOp(ura.scopeId, normalizedScopeId) : isNullOp(ura.scopeId)
        ),
    });
    if (existing) {
      return { error: 'Role assignment already exists for this user and scope', status: 409 };
    }

    const [created] = await this.database.db
      .insert(userRoleAssignments)
      .values({
        userId,
        roleId: role.id,
        scopeKind: data.scopeKind,
        scopeId: normalizedScopeId,
      })
      .returning();

    if (!created) {
      return { error: 'Failed to create role assignment', status: 500 };
    }

    return {
      assignment: {
        id: created.id,
        userId: created.userId,
        roleId: created.roleId,
        roleKey: role.key,
        roleName: role.name,
        scopeKind: created.scopeKind as 'global' | 'site',
        scopeId: created.scopeId,
        siteName,
        createdAt: created.createdAt.toISOString(),
      },
    };
  }

  async removeRoleAssignment(
    userId: string,
    assignmentId: string
  ): Promise<{ status?: string; error?: string; status_code?: number }> {
    const assignment = await this.database.db.query.userRoleAssignments.findFirst({
      where: (ura, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(ura.id, assignmentId), eqOp(ura.userId, userId)),
    });
    if (!assignment) {
      return { error: 'Role assignment not found', status_code: 404 };
    }

    // Check if this assignment is the last active global system super admin
    const isLast = await this.isLastActiveGlobalSuperAdmin(userId, assignmentId);
    if (isLast) {
      return {
        error: 'Cannot remove the last active global system super admin assignment',
        status_code: 400,
      };
    }

    await this.database.db.delete(userRoleAssignments).where(eq(userRoleAssignments.id, assignmentId));

    return { status: 'ok' };
  }

  // ---------------------------------------------------------------------------
  // Helper / Utility APIs
  // ---------------------------------------------------------------------------

  async listPermissions(): Promise<{ key: string; name: string; module: string; description: string | null }[]> {
    const perms = await this.database.db.select().from(permissions).orderBy(permissions.module, permissions.key);
    return perms.map((p) => ({
      key: p.key,
      name: p.name,
      module: p.module,
      description: p.description,
    }));
  }

  async listSites(): Promise<{ id: string; key: string; name: string }[]> {
    const allSites = await this.database.db.select().from(sites).orderBy(sites.name);
    return allSites.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
    }));
  }

  /**
   * Evaluates if a given user is the ONLY active user with a GLOBAL system_super_admin assignment.
   */
  private async isLastActiveGlobalSuperAdmin(
    targetUserId: string,
    excludeAssignmentId?: string
  ): Promise<boolean> {
    const superAdminRole = await this.database.db.query.roles.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.key, 'system_super_admin'),
    });
    if (!superAdminRole) return false;

    // Check if the target user even has an active global super admin assignment
    const targetHasSuperAdmin = await this.database.db.query.userRoleAssignments.findFirst({
      where: (ura, { eq: eqOp, and: andOp, isNull: isNullOp, ne: neOp }) => {
        const conds = [
          eqOp(ura.userId, targetUserId),
          eqOp(ura.roleId, superAdminRole.id),
          eqOp(ura.scopeKind, 'global'),
          isNullOp(ura.scopeId),
        ];
        if (excludeAssignmentId) {
          conds.push(neOp(ura.id, excludeAssignmentId));
        }
        return andOp(...conds);
      },
    });

    // If target doesn't have it (or the one being removed is it), check how many OTHER active users have it
    const otherSuperAdminAssignments = await this.database.db
      .select({ userId: userRoleAssignments.userId })
      .from(userRoleAssignments)
      .innerJoin(users, eq(userRoleAssignments.userId, users.id))
      .where(
        and(
          eq(userRoleAssignments.roleId, superAdminRole.id),
          eq(userRoleAssignments.scopeKind, 'global'),
          sql`${userRoleAssignments.scopeId} IS NULL`,
          eq(users.isActive, true)
        )
      );

    const activeSuperAdminUserIds = new Set(otherSuperAdminAssignments.map((a) => a.userId));

    if (excludeAssignmentId) {
      // We are removing an assignment for targetUserId
      // If targetUserId was in activeSuperAdminUserIds, after removing this assignment will targetUserId still have another assignment or will active count be 0?
      if (activeSuperAdminUserIds.has(targetUserId)) {
        if (targetHasSuperAdmin) {
          // target user still has another global super admin assignment
          return false;
        }
        // target user has no other assignment; check if other users exist
        const remainingCount = activeSuperAdminUserIds.size - 1;
        return remainingCount <= 0;
      }
      return false;
    } else {
      // We are deactivating targetUserId
      if (activeSuperAdminUserIds.has(targetUserId)) {
        const remainingCount = activeSuperAdminUserIds.size - 1;
        return remainingCount <= 0;
      }
      return false;
    }
  }
}

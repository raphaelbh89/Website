import { createDatabase, v7 } from '@platform/database';
import { isValidLocale, normalizeLocale } from './locale.js';

export interface CreateTaxonomyInput {
  key: string;
  name: string;
  description?: string;
  scopeKind: 'global' | 'site';
  siteId?: string;
  isHierarchical?: boolean;
}

export interface UpdateTaxonomyInput {
  name?: string;
  description?: string;
  isHierarchical?: boolean;
  isActive?: boolean;
}

export interface CreateTermInput {
  key: string;
  name: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface UpdateTermInput {
  name?: string;
  description?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface ContentTypeTaxonomyBindingInput {
  taxonomyId: string;
  isRequired?: boolean;
  minTerms?: number;
  maxTerms?: number | null;
  sortOrder?: number;
}

export interface TermTreeNode {
  id: string;
  taxonomyId: string;
  siteId: string;
  parentId: string | null;
  depth: number;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children: TermTreeNode[];
}

export class TaxonomyService {
  constructor(private readonly database: ReturnType<typeof createDatabase>) {}

  // ---------------------------------------------------------------------------
  // 1. Taxonomy Definition CRUD & No-Shadowing
  // ---------------------------------------------------------------------------

  async createTaxonomy(
    input: CreateTaxonomyInput
  ): Promise<{ taxonomy?: Record<string, unknown>; error?: string; status?: number }> {
    const rawKey = input.key?.trim()?.toLowerCase();
    if (!rawKey || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawKey)) {
      return {
        error: 'Taxonomy key must be lowercase alphanumeric characters separated by hyphens (e.g. "category", "news-tags")',
        status: 400,
      };
    }
    if (!input.name || !input.name.trim()) {
      return { error: 'Taxonomy name cannot be empty', status: 400 };
    }
    if (input.scopeKind !== 'global' && input.scopeKind !== 'site') {
      return { error: 'scopeKind must be "global" or "site"', status: 400 };
    }
    if (input.scopeKind === 'site' && !input.siteId) {
      return { error: 'siteId is required for site-scoped taxonomy', status: 400 };
    }
    if (input.scopeKind === 'global' && input.siteId) {
      return { error: 'siteId must be null for global-scoped taxonomy', status: 400 };
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // PostgreSQL transaction-level advisory lock for no-shadowing race prevention
      await client.query('SELECT pg_advisory_xact_lock(hashtext(LOWER($1)))', [`tax:${rawKey}`]);

      // Bi-directional No-Shadowing Check:
      // 1. If creating SITE taxonomy, ensure no GLOBAL taxonomy exists with same key
      if (input.scopeKind === 'site') {
        const globalConflict = await client.query(
          `SELECT id FROM taxonomies WHERE scope_kind = 'global' AND LOWER(key) = LOWER($1) LIMIT 1`,
          [rawKey]
        );
        if (globalConflict.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Cannot create site taxonomy "${rawKey}": a global taxonomy with this key already exists`,
            status: 409,
          };
        }
      }

      // 2. If creating GLOBAL taxonomy, ensure no SITE taxonomy exists with same key anywhere
      if (input.scopeKind === 'global') {
        const siteConflict = await client.query(
          `SELECT id FROM taxonomies WHERE scope_kind = 'site' AND LOWER(key) = LOWER($1) LIMIT 1`,
          [rawKey]
        );
        if (siteConflict.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Cannot create global taxonomy "${rawKey}": a site-specific taxonomy with this key already exists`,
            status: 409,
          };
        }
      }

      // 3. Exact collision check within scope
      const existing = await client.query(
        input.scopeKind === 'global'
          ? `SELECT id FROM taxonomies WHERE scope_kind = 'global' AND LOWER(key) = LOWER($1) LIMIT 1`
          : `SELECT id FROM taxonomies WHERE scope_kind = 'site' AND site_id = $1 AND LOWER(key) = LOWER($2) LIMIT 1`,
        input.scopeKind === 'global' ? [rawKey] : [input.siteId, rawKey]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          error: `Taxonomy with key "${rawKey}" already exists`,
          status: 409,
        };
      }

      const taxonomyId = v7();
      const insertRes = await client.query(
        `INSERT INTO taxonomies (
          id, key, name, description, scope_kind, site_id, is_hierarchical, is_system, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, true, NOW(), NOW())
        RETURNING *`,
        [
          taxonomyId,
          rawKey,
          input.name.trim(),
          input.description?.trim() || null,
          input.scopeKind,
          input.siteId || null,
          Boolean(input.isHierarchical),
        ]
      );

      await client.query('COMMIT');
      return { taxonomy: insertRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to create taxonomy';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async listTaxonomies(query: {
    scopeKind?: string;
    siteId?: string;
    activeOnly?: boolean;
  }): Promise<{ taxonomies: Record<string, unknown>[] }> {
    let whereClause = '';
    const params: unknown[] = [];

    if (query.scopeKind === 'global') {
      whereClause += `WHERE scope_kind = 'global'`;
    } else if (query.scopeKind === 'site' && query.siteId) {
      params.push(query.siteId);
      whereClause += `WHERE (scope_kind = 'site' AND site_id = $${params.length})`;
    } else if (query.siteId) {
      params.push(query.siteId);
      whereClause += `WHERE (scope_kind = 'global' OR (scope_kind = 'site' AND site_id = $${params.length}))`;
    }

    if (query.activeOnly) {
      whereClause += whereClause ? ` AND is_active = true` : `WHERE is_active = true`;
    }

    const res = await this.database.pool.query(
      `SELECT * FROM taxonomies ${whereClause} ORDER BY scope_kind ASC, name ASC`,
      params
    );

    return { taxonomies: res.rows };
  }

  async getTaxonomy(id: string): Promise<{ taxonomy?: Record<string, unknown>; error?: string; status?: number }> {
    const res = await this.database.pool.query('SELECT * FROM taxonomies WHERE id = $1', [id]);
    if (res.rows.length === 0) return { error: 'Taxonomy not found', status: 404 };
    return { taxonomy: res.rows[0] };
  }

  async updateTaxonomy(
    id: string,
    data: UpdateTaxonomyInput
  ): Promise<{ taxonomy?: Record<string, unknown>; error?: string; status?: number }> {
    const existingRes = await this.database.pool.query('SELECT * FROM taxonomies WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) return { error: 'Taxonomy not found', status: 404 };
    const existing = existingRes.rows[0];

    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];

    if (data.name !== undefined) {
      if (!data.name.trim()) return { error: 'Name cannot be empty', status: 400 };
      params.push(data.name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (data.description !== undefined) {
      params.push(data.description.trim() || null);
      updates.push(`description = $${params.length}`);
    }
    if (data.isActive !== undefined) {
      params.push(Boolean(data.isActive));
      updates.push(`is_active = $${params.length}`);
    }
    if (data.isHierarchical !== undefined && data.isHierarchical !== existing.is_hierarchical) {
      // Rule: is_hierarchical cannot be mutated if terms exist
      const termsCountRes = await this.database.pool.query(
        'SELECT COUNT(*)::int as count FROM taxonomy_terms WHERE taxonomy_id = $1',
        [id]
      );
      const termsCount = termsCountRes.rows[0].count;
      if (termsCount > 0) {
        return {
          error: 'Cannot change is_hierarchical property once terms exist for this taxonomy',
          status: 400,
        };
      }
      params.push(Boolean(data.isHierarchical));
      updates.push(`is_hierarchical = $${params.length}`);
    }

    const res = await this.database.pool.query(
      `UPDATE taxonomies SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return { taxonomy: res.rows[0] };
  }

  // ---------------------------------------------------------------------------
  // 2. Taxonomy Terms Management & Hierarchy Engine
  // ---------------------------------------------------------------------------

  async resolveTaxonomyByKey(key: string, siteId: string): Promise<{ taxonomy?: Record<string, unknown>; error?: string; status?: number }> {
    const rawKey = key.trim().toLowerCase();
    // 1. Check Global taxonomy
    const globalRes = await this.database.pool.query(
      `SELECT * FROM taxonomies WHERE scope_kind = 'global' AND LOWER(key) = LOWER($1) LIMIT 1`,
      [rawKey]
    );
    if (globalRes.rows.length > 0) {
      return { taxonomy: globalRes.rows[0] };
    }

    // 2. Check Site-specific taxonomy
    const siteRes = await this.database.pool.query(
      `SELECT * FROM taxonomies WHERE scope_kind = 'site' AND site_id = $1 AND LOWER(key) = LOWER($2) LIMIT 1`,
      [siteId, rawKey]
    );
    if (siteRes.rows.length > 0) {
      return { taxonomy: siteRes.rows[0] };
    }

    return { error: `Taxonomy "${key}" not found for this site`, status: 404 };
  }

  async createTerm(
    siteId: string,
    taxKey: string,
    input: CreateTermInput
  ): Promise<{ term?: Record<string, unknown>; error?: string; status?: number }> {
    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status };
    const taxonomy = taxRes.taxonomy;

    if (!taxonomy.is_active) {
      return { error: 'Cannot create term in an inactive taxonomy', status: 400 };
    }

    const rawKey = input.key?.trim()?.toLowerCase();
    if (!rawKey || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawKey)) {
      return {
        error: 'Term key must be lowercase alphanumeric characters separated by hyphens (e.g. "news", "admission-2026")',
        status: 400,
      };
    }
    if (!input.name || !input.name.trim()) {
      return { error: 'Term name cannot be empty', status: 400 };
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // Tree mutation advisory lock: (taxonomy_id + site_id)
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tree:${taxonomy.id}:${siteId}`]);

      // Uniqueness check: UNIQUE(site_id, taxonomy_id, key)
      const conflictCheck = await client.query(
        'SELECT id FROM taxonomy_terms WHERE site_id = $1 AND taxonomy_id = $2 AND key = $3 LIMIT 1',
        [siteId, taxonomy.id, rawKey]
      );
      if (conflictCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return { error: `Term with key "${rawKey}" already exists in this taxonomy for this site`, status: 409 };
      }

      let depth = 0;
      let parentId: string | null = null;

      if (input.parentId) {
        if (!taxonomy.is_hierarchical) {
          await client.query('ROLLBACK');
          return { error: 'Cannot assign parent_id in a non-hierarchical taxonomy', status: 400 };
        }

        const parentRes = await client.query(
          'SELECT * FROM taxonomy_terms WHERE id = $1 FOR UPDATE',
          [input.parentId]
        );
        if (parentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { error: 'Parent term not found', status: 404 };
        }
        const parent = parentRes.rows[0];

        if (parent.site_id !== siteId) {
          await client.query('ROLLBACK');
          return { error: 'Cross-site parent term is rejected', status: 400 };
        }
        if (parent.taxonomy_id !== taxonomy.id) {
          await client.query('ROLLBACK');
          return { error: 'Cross-taxonomy parent term is rejected', status: 400 };
        }
        if (!parent.is_active) {
          await client.query('ROLLBACK');
          return { error: 'Cannot create child under an inactive parent term', status: 400 };
        }

        depth = parent.depth + 1;
        if (depth > 5) {
          await client.query('ROLLBACK');
          return { error: 'Hierarchy depth exceeds maximum allowed limit (maxDepth = 5)', status: 400 };
        }
        parentId = parent.id;
      }

      const termId = v7();
      const insertRes = await client.query(
        `INSERT INTO taxonomy_terms (
          id, taxonomy_id, site_id, parent_id, depth, key, name, description, sort_order, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())
        RETURNING *`,
        [
          termId,
          taxonomy.id,
          siteId,
          parentId,
          depth,
          rawKey,
          input.name.trim(),
          input.description?.trim() || null,
          input.sortOrder || 0,
        ]
      );

      await client.query('COMMIT');
      return { term: insertRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to create taxonomy term';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async listTerms(
    siteId: string,
    taxKey: string,
    options: { asTree?: boolean; activeOnly?: boolean } = {}
  ): Promise<{ terms: TermTreeNode[] | Record<string, unknown>[]; error?: string; status?: number }> {
    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status, terms: [] };
    const taxonomy = taxRes.taxonomy;

    const whereClauses = ['taxonomy_id = $1', 'site_id = $2'];
    const params: unknown[] = [taxonomy.id, siteId];

    if (options.activeOnly) {
      whereClauses.push('is_active = true');
    }

    const res = await this.database.pool.query(
      `SELECT * FROM taxonomy_terms WHERE ${whereClauses.join(' AND ')} ORDER BY sort_order ASC, name ASC`,
      params
    );

    const flatTerms = res.rows;

    if (!options.asTree) {
      return { terms: flatTerms };
    }

    // Build hierarchy tree
    const termMap = new Map<string, TermTreeNode>();
    for (const t of flatTerms) {
      termMap.set(t.id, {
        id: t.id,
        taxonomyId: t.taxonomy_id,
        siteId: t.site_id,
        parentId: t.parent_id,
        depth: t.depth,
        key: t.key,
        name: t.name,
        description: t.description,
        sortOrder: t.sort_order,
        isActive: t.is_active,
        createdAt: t.created_at.toISOString(),
        updatedAt: t.updated_at.toISOString(),
        children: [],
      });
    }

    const roots: TermTreeNode[] = [];
    for (const node of termMap.values()) {
      if (node.parentId && termMap.has(node.parentId)) {
        termMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return { terms: roots };
  }

  async updateTerm(
    siteId: string,
    taxKey: string,
    termId: string,
    input: UpdateTermInput
  ): Promise<{ term?: Record<string, unknown>; error?: string; status?: number }> {
    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status };
    const taxonomy = taxRes.taxonomy;

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // Tree mutation advisory lock
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tree:${taxonomy.id}:${siteId}`]);

      const termRes = await client.query(
        'SELECT * FROM taxonomy_terms WHERE id = $1 AND site_id = $2 FOR UPDATE',
        [termId, siteId]
      );
      if (termRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Term not found', status: 404 };
      }
      const term = termRes.rows[0];

      // Handle Reparenting / Subtree move if parentId is explicitly passed
      if (input.parentId !== undefined && input.parentId !== term.parent_id) {
        if (!taxonomy.is_hierarchical && input.parentId !== null) {
          await client.query('ROLLBACK');
          return { error: 'Cannot set parent_id in a non-hierarchical taxonomy', status: 400 };
        }

        let newParentDepth = -1;
        let newParentId: string | null = null;

        if (input.parentId !== null) {
          // Self-parent rejection
          if (input.parentId === term.id) {
            await client.query('ROLLBACK');
            return { error: 'A term cannot be its own parent', status: 400 };
          }

          const parentRes = await client.query(
            'SELECT * FROM taxonomy_terms WHERE id = $1 FOR UPDATE',
            [input.parentId]
          );
          if (parentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { error: 'New parent term not found', status: 404 };
          }
          const parent = parentRes.rows[0];

          if (parent.site_id !== siteId) {
            await client.query('ROLLBACK');
            return { error: 'Cross-site parent term is rejected', status: 400 };
          }
          if (parent.taxonomy_id !== taxonomy.id) {
            await client.query('ROLLBACK');
            return { error: 'Cross-taxonomy parent term is rejected', status: 400 };
          }
          if (!parent.is_active) {
            await client.query('ROLLBACK');
            return { error: 'Cannot reparent under an inactive parent term', status: 400 };
          }

          // Cycle detection using Recursive CTE: verify term.id is NOT an ancestor of newParent
          const cycleCheck = await client.query(
            `WITH RECURSIVE ancestors AS (
              SELECT id, parent_id FROM taxonomy_terms WHERE id = $1
              UNION ALL
              SELECT t.id, t.parent_id FROM taxonomy_terms t
              JOIN ancestors a ON a.parent_id = t.id
            )
            SELECT id FROM ancestors WHERE id = $2 LIMIT 1`,
            [parent.id, term.id]
          );

          if (cycleCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return { error: 'Cannot move term inside its own descendant subtree (cycle detected)', status: 400 };
          }

          newParentDepth = parent.depth;
          newParentId = parent.id;
        }

        // Calculate subtree height of term
        const subtreeRes = await client.query(
          `WITH RECURSIVE descendants AS (
            SELECT id, depth FROM taxonomy_terms WHERE id = $1
            UNION ALL
            SELECT t.id, t.depth FROM taxonomy_terms t
            JOIN descendants d ON t.parent_id = d.id
          )
          SELECT COALESCE(MAX(depth) - MIN(depth), 0) as height FROM descendants`,
          [term.id]
        );
        const subtreeHeight = Number(subtreeRes.rows[0].height || 0);

        const targetDepth = newParentDepth + 1;
        if (targetDepth + subtreeHeight > 5) {
          await client.query('ROLLBACK');
          return { error: 'Move exceeds maximum hierarchy depth of 5', status: 400 };
        }

        const depthDelta = targetDepth - term.depth;

        // Atomically update term parent_id
        await client.query(
          'UPDATE taxonomy_terms SET parent_id = $1, updated_at = NOW() WHERE id = $2',
          [newParentId, term.id]
        );

        // Atomically recompute depth for term and all descendants
        if (depthDelta !== 0) {
          await client.query(
            `WITH RECURSIVE descendants AS (
              SELECT id FROM taxonomy_terms WHERE id = $1
              UNION ALL
              SELECT t.id FROM taxonomy_terms t
              JOIN descendants d ON t.parent_id = d.id
            )
            UPDATE taxonomy_terms 
            SET depth = depth + $2, updated_at = NOW() 
            WHERE id IN (SELECT id FROM descendants)`,
            [term.id, depthDelta]
          );
        }
      }

      // Update name, description, sortOrder
      const updates: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [termId];

      if (input.name !== undefined) {
        if (!input.name.trim()) {
          await client.query('ROLLBACK');
          return { error: 'Term name cannot be empty', status: 400 };
        }
        params.push(input.name.trim());
        updates.push(`name = $${params.length}`);
      }
      if (input.description !== undefined) {
        params.push(input.description.trim() || null);
        updates.push(`description = $${params.length}`);
      }
      if (input.sortOrder !== undefined) {
        params.push(input.sortOrder);
        updates.push(`sort_order = $${params.length}`);
      }

      const updateRes = await client.query(
        `UPDATE taxonomy_terms SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );

      await client.query('COMMIT');
      return { term: updateRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to update taxonomy term';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async deactivateTerm(
    siteId: string,
    taxKey: string,
    termId: string
  ): Promise<{ term?: Record<string, unknown>; error?: string; status?: number }> {
    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status };
    const taxonomy = taxRes.taxonomy;

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tree:${taxonomy.id}:${siteId}`]);

      const termRes = await client.query(
        'SELECT * FROM taxonomy_terms WHERE id = $1 AND site_id = $2 FOR UPDATE',
        [termId, siteId]
      );
      if (termRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Term not found', status: 404 };
      }

      // Check if any active descendant exists
      const activeDescendantRes = await client.query(
        `WITH RECURSIVE descendants AS (
          SELECT id, parent_id, is_active FROM taxonomy_terms WHERE parent_id = $1
          UNION ALL
          SELECT t.id, t.parent_id, t.is_active FROM taxonomy_terms t
          JOIN descendants d ON t.parent_id = d.id
        )
        SELECT id FROM descendants WHERE is_active = true LIMIT 1`,
        [termId]
      );

      if (activeDescendantRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          error: 'Cannot deactivate parent term while active descendant terms exist. Deactivate or reparent descendants first.',
          status: 400,
        };
      }

      const updateRes = await client.query(
        'UPDATE taxonomy_terms SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
        [termId]
      );

      await client.query('COMMIT');
      return { term: updateRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to deactivate term';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async activateTerm(
    siteId: string,
    taxKey: string,
    termId: string
  ): Promise<{ term?: Record<string, unknown>; error?: string; status?: number }> {
    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status };
    const taxonomy = taxRes.taxonomy;

    if (!taxonomy.is_active) {
      return { error: 'Cannot activate term when parent taxonomy is inactive', status: 400 };
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tree:${taxonomy.id}:${siteId}`]);

      const termRes = await client.query(
        'SELECT * FROM taxonomy_terms WHERE id = $1 AND site_id = $2 FOR UPDATE',
        [termId, siteId]
      );
      if (termRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Term not found', status: 404 };
      }
      const term = termRes.rows[0];

      // Check if all ancestors are active
      if (term.parent_id) {
        const inactiveAncestorRes = await client.query(
          `WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, is_active FROM taxonomy_terms WHERE id = $1
            UNION ALL
            SELECT t.id, t.parent_id, t.is_active FROM taxonomy_terms t
            JOIN ancestors a ON a.parent_id = t.id
          )
          SELECT id FROM ancestors WHERE is_active = false LIMIT 1`,
          [term.parent_id]
        );

        if (inactiveAncestorRes.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: 'Cannot activate child term because one or more ancestor terms are inactive. Activate ancestors first.',
            status: 400,
          };
        }
      }

      const updateRes = await client.query(
        'UPDATE taxonomy_terms SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING *',
        [termId]
      );

      await client.query('COMMIT');
      return { term: updateRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to activate term';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 3. ContentType ↔ Taxonomy Bindings
  // ---------------------------------------------------------------------------

  async getContentTypeTaxonomies(contentTypeId: string): Promise<{ bindings: Record<string, unknown>[]; error?: string; status?: number }> {
    const res = await this.database.pool.query(
      `SELECT ctt.*, t.key as taxonomy_key, t.name as taxonomy_name, t.scope_kind as taxonomy_scope_kind, t.is_hierarchical
       FROM content_type_taxonomies ctt
       JOIN taxonomies t ON t.id = ctt.taxonomy_id
       WHERE ctt.content_type_id = $1
       ORDER BY ctt.sort_order ASC`,
      [contentTypeId]
    );
    return { bindings: res.rows };
  }

  async setContentTypeTaxonomies(
    contentTypeId: string,
    bindings: ContentTypeTaxonomyBindingInput[]
  ): Promise<{ bindings?: Record<string, unknown>[]; error?: string; status?: number }> {
    const ctRes = await this.database.pool.query('SELECT * FROM content_types WHERE id = $1', [contentTypeId]);
    if (ctRes.rows.length === 0) {
      return { error: 'Content type not found', status: 404 };
    }
    const contentType = ctRes.rows[0];

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing bindings (old revisions retain content_revision_terms!)
      await client.query('DELETE FROM content_type_taxonomies WHERE content_type_id = $1', [contentTypeId]);

      const inserted: Record<string, unknown>[] = [];
      const seenTaxonomies = new Set<string>();

      for (let i = 0; i < bindings.length; i++) {
        const b = bindings[i];
        if (!b) continue;
        if (seenTaxonomies.has(b.taxonomyId)) {
          await client.query('ROLLBACK');
          return { error: `Duplicate taxonomy binding for taxonomy ID "${b.taxonomyId}"`, status: 400 };
        }
        seenTaxonomies.add(b.taxonomyId);

        const taxRes = await client.query('SELECT * FROM taxonomies WHERE id = $1', [b.taxonomyId]);
        if (taxRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { error: `Taxonomy "${b.taxonomyId}" not found`, status: 404 };
        }
        const taxonomy = taxRes.rows[0];

        // Scope validation:
        // GLOBAL ContentType -> GLOBAL Taxonomies ONLY
        if (contentType.scope_kind === 'global' && taxonomy.scope_kind !== 'global') {
          await client.query('ROLLBACK');
          return {
            error: `Global ContentType cannot attach site-specific taxonomy "${taxonomy.key}"`,
            status: 400,
          };
        }

        // SITE ContentType A -> GLOBAL Taxonomy OR SITE Taxonomy A ONLY (reject SITE Taxonomy B)
        if (contentType.scope_kind === 'site') {
          if (taxonomy.scope_kind === 'site' && taxonomy.site_id !== contentType.site_id) {
            await client.query('ROLLBACK');
            return {
              error: `Site ContentType cannot attach taxonomy "${taxonomy.key}" belonging to another site`,
              status: 400,
            };
          }
        }

        const isRequired = Boolean(b.isRequired);
        const minTerms = b.minTerms !== undefined ? Math.max(0, b.minTerms) : (isRequired ? 1 : 0);
        const maxTerms = b.maxTerms !== undefined && b.maxTerms !== null ? b.maxTerms : null;

        if (maxTerms !== null && maxTerms < minTerms) {
          await client.query('ROLLBACK');
          return {
            error: `maxTerms (${maxTerms}) cannot be less than minTerms (${minTerms}) for taxonomy "${taxonomy.key}"`,
            status: 400,
          };
        }

        if (isRequired && minTerms < 1) {
          await client.query('ROLLBACK');
          return {
            error: `Required taxonomy "${taxonomy.key}" must have minTerms >= 1`,
            status: 400,
          };
        }

        const insertRes = await client.query(
          `INSERT INTO content_type_taxonomies (
            content_type_id, taxonomy_id, is_required, min_terms, max_terms, sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [contentTypeId, b.taxonomyId, isRequired, minTerms, maxTerms, b.sortOrder !== undefined ? b.sortOrder : i]
        );
        inserted.push({
          ...insertRes.rows[0],
          taxonomy_key: taxonomy.key,
          taxonomy_name: taxonomy.name,
        });
      }

      await client.query('COMMIT');
      return { bindings: inserted };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to configure content type taxonomies';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Public Proof of Filtering by Taxonomy & Term
  // ---------------------------------------------------------------------------

  async queryPublicContentByTerm(
    siteId: string,
    typeKey: string,
    taxKey: string,
    termSlug: string,
    locale: string
  ): Promise<{ items: Record<string, unknown>[]; total: number; error?: string; status?: number }> {
    if (!locale || typeof locale !== 'string' || !locale.trim()) {
      return { error: 'Query parameter "locale" is required', status: 400, items: [], total: 0 };
    }
    if (!isValidLocale(locale)) {
      return { error: `Invalid locale "${locale}". Must be a valid BCP-47 tag`, status: 400, items: [], total: 0 };
    }
    const normalizedLocale = normalizeLocale(locale);
    const siteRes = await this.database.pool.query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (siteRes.rows.length === 0) {
      return { error: `Site "${siteId}" not found`, status: 404, items: [], total: 0 };
    }

    const taxRes = await this.resolveTaxonomyByKey(taxKey, siteId);
    if (!taxRes.taxonomy) return { error: taxRes.error, status: taxRes.status, items: [], total: 0 };
    const taxonomy = taxRes.taxonomy;
    if (!taxonomy.is_active) {
      return { items: [], total: 0 };
    }

    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) return { error: typeRes.error, status: typeRes.status, items: [], total: 0 };
    const contentType = typeRes.contentType;

    const termRes = await this.database.pool.query(
      'SELECT id, name, key, is_active FROM taxonomy_terms WHERE site_id = $1 AND taxonomy_id = $2 AND key = $3 LIMIT 1',
      [siteId, taxonomy.id, termSlug.toLowerCase()]
    );
    if (termRes.rows.length === 0) {
      return { items: [], total: 0 };
    }
    const term = termRes.rows[0];
    if (!term.is_active) {
      return { items: [], total: 0 };
    }

    const queryRes = await this.database.pool.query(
      `SELECT e.id, e.site_id, e.published_slug, r.title, r.version_number, r.data, r.created_at as published_at,
              tt.id as term_id, tt.key as term_key, tt.name as term_name
       FROM content_entries e
       JOIN content_entry_revisions r ON r.id = e.published_revision_id
       JOIN content_revision_terms crt ON crt.revision_id = r.id
       JOIN taxonomy_terms tt ON tt.id = crt.taxonomy_term_id
       WHERE e.site_id = $1
         AND e.content_type_id = $2
         AND e.locale = $3
         AND e.lifecycle_state = 'active'
         AND e.published_revision_id IS NOT NULL
         AND tt.id = $4
       ORDER BY r.created_at DESC`,
      [siteId, contentType.id, normalizedLocale, term.id]
    );

    return {
      items: queryRes.rows,
      total: queryRes.rows.length,
    };
  }

  private async resolveContentTypeByKey(key: string, siteId: string) {
    const rawKey = key.trim().toLowerCase();
    const globalRes = await this.database.pool.query(
      `SELECT * FROM content_types WHERE scope_kind = 'global' AND LOWER(key) = LOWER($1) LIMIT 1`,
      [rawKey]
    );
    if (globalRes.rows.length > 0) return { contentType: globalRes.rows[0] };

    const siteRes = await this.database.pool.query(
      `SELECT * FROM content_types WHERE scope_kind = 'site' AND site_id = $1 AND LOWER(key) = LOWER($2) LIMIT 1`,
      [siteId, rawKey]
    );
    if (siteRes.rows.length > 0) return { contentType: siteRes.rows[0] };

    return { error: `Content type "${key}" not found`, status: 404 };
  }
}

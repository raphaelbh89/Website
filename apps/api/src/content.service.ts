import { eq, and, sql, desc } from 'drizzle-orm';
import {
  createDatabase,
  contentTypes,
  contentEntries,
  v7,
} from '@platform/database';
import { isValidLocale, normalizeLocale } from './locale.js';

export { isValidLocale, normalizeLocale } from './locale.js';

export type SupportedFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select';

export interface SelectOption {
  label: string;
  value: string;
}

export interface CmsFieldDefinition {
  key: string;
  label: string;
  type: SupportedFieldType;
  required?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  integerOnly?: boolean;
  options?: SelectOption[];
}

export interface CmsDataSchema {
  version: number;
  fields: CmsFieldDefinition[];
}

export interface CmsUiSchema {
  version: number;
  elements?: {
    fieldKey: string;
    widget?: string;
    placeholder?: string;
    helpText?: string;
    colSpan?: number;
    group?: string;
  }[];
}

export function validateCmsDataSchema(schema: unknown): { valid: boolean; error?: string; dataSchema?: CmsDataSchema } {
  if (!schema || typeof schema !== 'object') {
    return { valid: false, error: 'Data schema must be a valid object' };
  }
  const s = schema as Record<string, unknown>;
  const allowedSchemaProps = new Set(['version', 'fields']);
  for (const prop of Object.keys(s)) {
    if (!allowedSchemaProps.has(prop)) {
      return { valid: false, error: `Unsupported top-level schema property "${prop}"` };
    }
  }
  if (typeof s.version !== 'number' || !Number.isInteger(s.version) || s.version < 1) {
    return { valid: false, error: 'Data schema version must be a positive integer' };
  }
  if (!Array.isArray(s.fields)) {
    return { valid: false, error: 'Data schema fields must be an array' };
  }

  const fieldKeys = new Set<string>();
  const validFields: CmsFieldDefinition[] = [];

  for (const f of s.fields as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object') {
      return { valid: false, error: 'Field definition must be an object' };
    }
    if (typeof f.key !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.key)) {
      return { valid: false, error: `Invalid field key "${f.key}". Must be alphanumeric identifier.` };
    }
    if (fieldKeys.has(f.key)) {
      return { valid: false, error: `Duplicate field key "${f.key}" in schema` };
    }
    fieldKeys.add(f.key);

    if (typeof f.label !== 'string' || !f.label.trim()) {
      return { valid: false, error: `Field "${f.key}" must have a non-empty label` };
    }

    const allowedTypes: SupportedFieldType[] = ['text', 'textarea', 'number', 'boolean', 'select'];
    if (!allowedTypes.includes(f.type as SupportedFieldType)) {
      return { valid: false, error: `Unsupported field type "${String(f.type)}" for field "${f.key}". M3.1 supported types: ${allowedTypes.join(', ')}` };
    }

    const allowedFieldProps = new Set([
      'key',
      'label',
      'type',
      'required',
      'default',
      'minLength',
      'maxLength',
      'min',
      'max',
      'integerOnly',
      'options',
    ]);
    for (const prop of Object.keys(f)) {
      if (!allowedFieldProps.has(prop)) {
        return { valid: false, error: `Unsupported schema property "${prop}" in field "${f.key}"` };
      }
    }

    if (f.minLength !== undefined && (typeof f.minLength !== 'number' || !Number.isInteger(f.minLength) || f.minLength < 0)) {
      return { valid: false, error: `Field "${f.key}": minLength must be a non-negative integer` };
    }
    if (f.maxLength !== undefined && (typeof f.maxLength !== 'number' || !Number.isInteger(f.maxLength) || f.maxLength < 0)) {
      return { valid: false, error: `Field "${f.key}": maxLength must be a non-negative integer` };
    }
    if (
      f.minLength !== undefined &&
      f.maxLength !== undefined &&
      (f.minLength as number) > (f.maxLength as number)
    ) {
      return { valid: false, error: `Field "${f.key}": minLength cannot be greater than maxLength` };
    }

    if (f.min !== undefined && (typeof f.min !== 'number' || !Number.isFinite(f.min))) {
      return { valid: false, error: `Field "${f.key}": min must be a valid number` };
    }
    if (f.max !== undefined && (typeof f.max !== 'number' || !Number.isFinite(f.max))) {
      return { valid: false, error: `Field "${f.key}": max must be a valid number` };
    }
    if (
      f.min !== undefined &&
      f.max !== undefined &&
      (f.min as number) > (f.max as number)
    ) {
      return { valid: false, error: `Field "${f.key}": min cannot be greater than max` };
    }

    const fieldType = f.type as SupportedFieldType;

    if (f.required !== undefined && typeof f.required !== 'boolean') {
      return { valid: false, error: `Field "${f.key}": required must be a boolean` };
    }
    if (f.integerOnly !== undefined && typeof f.integerOnly !== 'boolean') {
      return { valid: false, error: `Field "${f.key}": integerOnly must be a boolean` };
    }

    const textOnlyProps = ['minLength', 'maxLength'];
    const numberOnlyProps = ['min', 'max', 'integerOnly'];
    if (fieldType !== 'text' && fieldType !== 'textarea') {
      const invalidTextProp = textOnlyProps.find((prop) => f[prop] !== undefined);
      if (invalidTextProp) {
        return { valid: false, error: `Field "${f.key}": property "${invalidTextProp}" is not supported for type "${fieldType}"` };
      }
    }
    if (fieldType !== 'number') {
      const invalidNumberProp = numberOnlyProps.find((prop) => f[prop] !== undefined);
      if (invalidNumberProp) {
        return { valid: false, error: `Field "${f.key}": property "${invalidNumberProp}" is not supported for type "${fieldType}"` };
      }
    }
    if (fieldType !== 'select' && f.options !== undefined) {
      return { valid: false, error: `Field "${f.key}": property "options" is not supported for type "${fieldType}"` };
    }

    let selectOptions: SelectOption[] | undefined = undefined;
    if (fieldType === 'select') {
      if (!Array.isArray(f.options) || f.options.length === 0) {
        return { valid: false, error: `Field "${f.key}" of type "select" must define a non-empty options array` };
      }
      const optionValues = new Set<string>();
      for (const opt of f.options as Record<string, unknown>[]) {
        if (!opt || typeof opt !== 'object') {
          return { valid: false, error: `Options for field "${f.key}" must be objects` };
        }
        const unsupportedOptionProp = Object.keys(opt).find((prop) => prop !== 'label' && prop !== 'value');
        if (unsupportedOptionProp) {
          return { valid: false, error: `Unsupported option property "${unsupportedOptionProp}" in select field "${f.key}"` };
        }
        if (typeof opt.value !== 'string' || !opt.value.trim() || typeof opt.label !== 'string' || !opt.label.trim()) {
          return { valid: false, error: `Options for field "${f.key}" must have non-empty label and value strings` };
        }
        if (optionValues.has(opt.value)) {
          return { valid: false, error: `Duplicate option value "${opt.value}" in select field "${f.key}"` };
        }
        optionValues.add(opt.value);
      }
      selectOptions = (f.options as Array<{ value: string; label: string }>).map((o) => ({
        value: String(o.value),
        label: String(o.label).trim(),
      }));
    }

    // Default value validation at definition time
    if (f.default !== undefined) {
      const def = f.default;
      if (fieldType === 'text' || fieldType === 'textarea') {
        if (typeof def !== 'string') {
          return { valid: false, error: `Field "${f.key}": default must be a string` };
        }
        if (typeof f.minLength === 'number' && def.length < f.minLength) {
          return { valid: false, error: `Field "${f.key}": default length must be >= minLength (${f.minLength})` };
        }
        if (typeof f.maxLength === 'number' && def.length > f.maxLength) {
          return { valid: false, error: `Field "${f.key}": default length must be <= maxLength (${f.maxLength})` };
        }
      } else if (fieldType === 'number') {
        if (typeof def !== 'number' || isNaN(def)) {
          return { valid: false, error: `Field "${f.key}": default must be a number` };
        }
        if (f.integerOnly && !Number.isInteger(def)) {
          return { valid: false, error: `Field "${f.key}": default must be an integer` };
        }
        if (typeof f.min === 'number' && def < f.min) {
          return { valid: false, error: `Field "${f.key}": default must be >= min (${f.min})` };
        }
        if (typeof f.max === 'number' && def > f.max) {
          return { valid: false, error: `Field "${f.key}": default must be <= max (${f.max})` };
        }
      } else if (fieldType === 'boolean') {
        if (typeof def !== 'boolean') {
          return { valid: false, error: `Field "${f.key}": default must be a boolean (true/false)` };
        }
      } else if (fieldType === 'select') {
        if (typeof def !== 'string') {
          return { valid: false, error: `Field "${f.key}": default must be a string` };
        }
        const allowedVals = selectOptions?.map((o) => o.value) || [];
        if (!allowedVals.includes(def)) {
          return { valid: false, error: `Field "${f.key}": default value "${def}" is not in allowed select options` };
        }
      }
    }

    validFields.push({
      key: f.key as string,
      label: (f.label as string).trim(),
      type: fieldType,
      required: Boolean(f.required),
      default: f.default !== undefined ? f.default : undefined,
      minLength: typeof f.minLength === 'number' ? f.minLength : undefined,
      maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
      min: typeof f.min === 'number' ? f.min : undefined,
      max: typeof f.max === 'number' ? f.max : undefined,
      integerOnly: typeof f.integerOnly === 'boolean' ? f.integerOnly : undefined,
      options: selectOptions,
    });
  }

  return {
    valid: true,
    dataSchema: {
      version: s.version as number,
      fields: validFields,
    },
  };
}

export function validateEntryDataAgainstSchema(
  data: unknown,
  dataSchema: CmsDataSchema
): { valid: boolean; error?: string; validatedData?: Record<string, unknown> } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Content entry data must be a JSON object' };
  }
  const d = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of dataSchema.fields) {
    let val = d[field.key];

    // Apply default if undefined
    if (val === undefined || val === null) {
      if (field.default !== undefined) {
        val = field.default;
      }
    }

    if (field.required) {
      if (val === undefined || val === null || val === '') {
        return { valid: false, error: `Field "${field.label}" (${field.key}) is required` };
      }
    }

    if (val !== undefined && val !== null) {
      if (field.type === 'text' || field.type === 'textarea') {
        if (typeof val !== 'string') {
          return { valid: false, error: `Field "${field.key}" must be a string` };
        }
        if (field.minLength !== undefined && val.length < field.minLength) {
          return { valid: false, error: `Field "${field.key}" length must be at least ${field.minLength} characters` };
        }
        if (field.maxLength !== undefined && val.length > field.maxLength) {
          return { valid: false, error: `Field "${field.key}" length must not exceed ${field.maxLength} characters` };
        }
        result[field.key] = val;
      } else if (field.type === 'number') {
        if (typeof val !== 'number' || isNaN(val)) {
          return { valid: false, error: `Field "${field.key}" must be a valid number` };
        }
        if (field.integerOnly && !Number.isInteger(val)) {
          return { valid: false, error: `Field "${field.key}" must be an integer` };
        }
        if (field.min !== undefined && val < field.min) {
          return { valid: false, error: `Field "${field.key}" must be >= ${field.min}` };
        }
        if (field.max !== undefined && val > field.max) {
          return { valid: false, error: `Field "${field.key}" must be <= ${field.max}` };
        }
        result[field.key] = val;
      } else if (field.type === 'boolean') {
        if (typeof val !== 'boolean') {
          return { valid: false, error: `Field "${field.key}" must be a boolean (true/false)` };
        }
        result[field.key] = val;
      } else if (field.type === 'select') {
        if (typeof val !== 'string') {
          return { valid: false, error: `Field "${field.key}" must be a string` };
        }
        const allowedValues = field.options?.map((o) => o.value) || [];
        if (!allowedValues.includes(val)) {
          return { valid: false, error: `Value "${val}" is not a valid option for select field "${field.key}"` };
        }
        result[field.key] = val;
      }
    } else {
      result[field.key] = null;
    }
  }

  return { valid: true, validatedData: result };
}

export class ContentService {
  constructor(private database: ReturnType<typeof createDatabase>) {}

  // ---------------------------------------------------------------------------
  // Content Type Operations
  // ---------------------------------------------------------------------------

  async createContentType(data: {
    key: string;
    name: string;
    description?: string;
    kind: 'single' | 'collection';
    scopeKind: 'global' | 'site';
    siteId?: string | null;
    dataSchema: unknown;
    uiSchema?: unknown;
  }): Promise<{ contentType?: Record<string, unknown>; error?: string; status?: number }> {
    const key = data.key.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(key)) {
      return { error: 'Content type key must contain only lowercase letters, numbers, and underscores', status: 400 };
    }
    if (!data.name?.trim()) {
      return { error: 'Content type name cannot be empty', status: 400 };
    }
    if (data.kind !== 'single' && data.kind !== 'collection') {
      return { error: 'Content type kind must be "single" or "collection"', status: 400 };
    }
    if (data.scopeKind !== 'global' && data.scopeKind !== 'site') {
      return { error: 'Content type scopeKind must be "global" or "site"', status: 400 };
    }
    if (data.scopeKind === 'site' && !data.siteId) {
      return { error: 'siteId is required when scopeKind is "site"', status: 400 };
    }

    const schemaValidation = validateCmsDataSchema(data.dataSchema);
    if (!schemaValidation.valid || !schemaValidation.dataSchema) {
      return { error: schemaValidation.error || 'Invalid data schema', status: 400 };
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // Acquire advisory xact lock on hashed normalized key to serialize concurrent creations
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

      // Bi-directional No-Shadowing Check
      if (data.scopeKind === 'global') {
        const globalDuplicate = await client.query(
          'SELECT id FROM content_types WHERE scope_kind = $1 AND key = $2 LIMIT 1',
          ['global', key]
        );
        if (globalDuplicate.rows.length > 0) {
          await client.query('ROLLBACK');
          return { error: `Global content type with key "${key}" already exists`, status: 409 };
        }

        const siteExisting = await client.query(
          'SELECT id, site_id FROM content_types WHERE scope_kind = $1 AND key = $2 LIMIT 1',
          ['site', key]
        );
        if (siteExisting.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Content type key "${key}" already exists or conflicts with an existing site-specific content type`,
            status: 409,
          };
        }
      } else {
        const globalExisting = await client.query(
          'SELECT id FROM content_types WHERE scope_kind = $1 AND key = $2 LIMIT 1',
          ['global', key]
        );
        if (globalExisting.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Content type key "${key}" shadows an existing global content type`,
            status: 409,
          };
        }

        const siteDuplicate = await client.query(
          'SELECT id FROM content_types WHERE scope_kind = $1 AND site_id = $2 AND key = $3 LIMIT 1',
          ['site', data.siteId, key]
        );
        if (siteDuplicate.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Site content type with key "${key}" already exists for site ${data.siteId}`,
            status: 409,
          };
        }
      }

      const contentTypeId = v7();
      const insertRes = await client.query(
        `INSERT INTO content_types (
          id, key, name, description, kind, scope_kind, site_id, schema_version, data_schema, ui_schema, capabilities, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, NOW(), NOW())
        RETURNING *`,
        [
          contentTypeId,
          key,
          data.name.trim(),
          data.description?.trim() || null,
          data.kind,
          data.scopeKind,
          data.siteId || null,
          JSON.stringify(schemaValidation.dataSchema),
          data.uiSchema ? JSON.stringify(data.uiSchema) : null,
          JSON.stringify({ hasDrafts: true, hasRevisions: true, hasSlug: data.kind === 'collection' }),
        ]
      );

      await client.query('COMMIT');
      return { contentType: insertRes.rows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to create content type';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async listContentTypes(options: {
    scopeKind?: 'global' | 'site';
    siteId?: string;
  }): Promise<{ contentTypes: Record<string, unknown>[] }> {
    const list = await this.database.db.query.contentTypes.findMany({
      where: (ct, { eq: eqOp, or: orOp }) => {
        if (options.scopeKind === 'global') {
          return eqOp(ct.scopeKind, 'global');
        }
        if (options.siteId) {
          return orOp(
            eqOp(ct.scopeKind, 'global'),
            and(eqOp(ct.scopeKind, 'site'), eqOp(ct.siteId, options.siteId))
          );
        }
        return undefined;
      },
      orderBy: (ct, { asc: ascOp }) => [ascOp(ct.name)],
    });
    return { contentTypes: list as unknown as Record<string, unknown>[] };
  }

  async getContentType(id: string): Promise<{ contentType?: Record<string, unknown>; error?: string; status?: number }> {
    const ct = await this.database.db.query.contentTypes.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.id, id),
    });
    if (!ct) return { error: 'Content type not found', status: 404 };
    return { contentType: ct as unknown as Record<string, unknown> };
  }

  async resolveContentTypeByKey(
    typeKey: string,
    siteId?: string
  ): Promise<{ contentType?: typeof contentTypes.$inferSelect; error?: string; status?: number }> {
    const normalized = typeKey.trim().toLowerCase();

    // 1. Check Global
    const globalType = await this.database.db.query.contentTypes.findFirst({
      where: (ct, { eq: eqOp, and: andOp }) =>
        andOp(eqOp(ct.scopeKind, 'global'), eqOp(ct.key, normalized)),
    });
    if (globalType) return { contentType: globalType };

    // 2. Check Site
    if (siteId) {
      const siteType = await this.database.db.query.contentTypes.findFirst({
        where: (ct, { eq: eqOp, and: andOp }) =>
          andOp(eqOp(ct.scopeKind, 'site'), eqOp(ct.siteId, siteId), eqOp(ct.key, normalized)),
      });
      if (siteType) return { contentType: siteType };
    }

    return { error: `Content type "${typeKey}" not found`, status: 404 };
  }

  async updateContentType(
    id: string,
    data: {
      name?: string;
      description?: string;
      kind?: 'single' | 'collection';
      key?: string;
      scopeKind?: 'global' | 'site';
      siteId?: string | null;
      dataSchema?: unknown;
      uiSchema?: unknown;
    }
  ): Promise<{ contentType?: Record<string, unknown>; error?: string; status?: number }> {
    const existing = await this.database.db.query.contentTypes.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.id, id),
    });
    if (!existing) return { error: 'Content type not found', status: 404 };

    // Invariant: key, scopeKind, siteId are strictly immutable after creation
    if (data.key !== undefined && data.key.trim().toLowerCase() !== existing.key) {
      return { error: 'ContentType key is immutable after creation', status: 400 };
    }
    if (data.scopeKind !== undefined && data.scopeKind !== existing.scopeKind) {
      return { error: 'ContentType scopeKind is immutable after creation', status: 400 };
    }
    if (data.siteId !== undefined && (data.siteId || null) !== (existing.siteId || null)) {
      return { error: 'ContentType siteId is immutable after creation', status: 400 };
    }

    // Check entry count once for kind & schema mutations
    const entryCountRes = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(contentEntries)
      .where(eq(contentEntries.contentTypeId, existing.id));
    const entryCount = Number(entryCountRes[0]?.count || 0);

    // Invariant: kind is immutable once any ContentEntry exists
    if (data.kind !== undefined && data.kind !== existing.kind) {
      if (entryCount > 0) {
        return {
          error: `ContentType kind cannot be changed to "${data.kind}" because content entries already exist`,
          status: 400,
        };
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) {
      if (!data.name.trim()) return { error: 'Name cannot be empty', status: 400 };
      updates.name = data.name.trim();
    }
    if (data.description !== undefined) {
      updates.description = data.description.trim() || null;
    }
    if (data.kind !== undefined && entryCount === 0) {
      updates.kind = data.kind;
    }
    if (data.uiSchema !== undefined) {
      updates.uiSchema = data.uiSchema;
    }

    if (data.dataSchema !== undefined) {
      const validation = validateCmsDataSchema(data.dataSchema);
      if (!validation.valid || !validation.dataSchema) {
        return { error: validation.error || 'Invalid data schema', status: 400 };
      }

      if (entryCount > 0) {
        // Breaking change detection
        const oldFields = (existing.dataSchema as CmsDataSchema).fields || [];
        const newFields = validation.dataSchema.fields;
        const newFieldMap = new Map(newFields.map((f) => [f.key, f]));

        for (const oldF of oldFields) {
          const newF = newFieldMap.get(oldF.key);
          if (!newF) {
            return {
              error: `Breaking change rejected: field "${oldF.key}" cannot be removed because content entries exist`,
              status: 400,
            };
          }
          if (newF.type !== oldF.type) {
            return {
              error: `Breaking change rejected: field "${oldF.key}" type cannot be changed from "${oldF.type}" to "${newF.type}"`,
              status: 400,
            };
          }
        }

        for (const newF of newFields) {
          const oldF = oldFields.find((f) => f.key === newF.key);
          if (!oldF && newF.required && (newF.default === undefined || newF.default === '')) {
            return {
              error: `Breaking change rejected: new required field "${newF.key}" must provide a valid default value`,
              status: 400,
            };
          }
        }
      }

      updates.dataSchema = validation.dataSchema;
      updates.schemaVersion = existing.schemaVersion + 1;
    }

    const [updated] = await this.database.db
      .update(contentTypes)
      .set(updates)
      .where(eq(contentTypes.id, id))
      .returning();

    return { contentType: updated };
  }

  // ---------------------------------------------------------------------------
  // Content Entry Operations (Revision-Pointer Architecture)
  // ---------------------------------------------------------------------------

  async createContentEntry(
    siteId: string,
    typeKey: string,
    data: {
      title: string;
      slug?: string;
      locale?: string;
      data: Record<string, unknown>;
      taxonomyAssignments?: Record<string, string[]>;
    },
    userId?: string
  ): Promise<{ entry?: Record<string, unknown>; revision?: Record<string, unknown>; error?: string; status?: number }> {
    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) {
      return { error: typeRes.error || 'Content type not found', status: typeRes.status || 404 };
    }
    const contentType = typeRes.contentType;
    if (!data.locale || typeof data.locale !== 'string' || !data.locale.trim()) {
      return { error: 'Locale is required for creating content entries', status: 400 };
    }
    const targetLocale = data.locale.trim();
    if (!isValidLocale(targetLocale)) {
      return { error: `Invalid locale "${data.locale}". Must be a valid BCP-47 tag (e.g. "vi", "en", "zh-CN")`, status: 400 };
    }
    const locale = normalizeLocale(targetLocale);

    if (!data.title?.trim()) {
      return { error: 'Entry title is required', status: 400 };
    }

    const dataValidation = validateEntryDataAgainstSchema(data.data, contentType.dataSchema as CmsDataSchema);
    if (!dataValidation.valid || !dataValidation.validatedData) {
      return { error: dataValidation.error || 'Invalid content data', status: 400 };
    }

    let slug: string | null = null;
    if (contentType.kind === 'collection') {
      const rawSlug = data.slug || data.title;
      slug = rawSlug
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      if (!slug) {
        slug = `entry-${Date.now()}`;
      }
    }

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // Singleton Invariant Check
      if (contentType.kind === 'single') {
        const existingSingle = await client.query(
          'SELECT id FROM content_entries WHERE site_id = $1 AND content_type_id = $2 AND locale = $3 AND entry_kind = $4 LIMIT 1',
          [siteId, contentType.id, locale, 'single']
        );
        if (existingSingle.rows.length > 0) {
          await client.query('ROLLBACK');
          return { error: `A single content entry already exists for this site and locale`, status: 409 };
        }
      }

      // Validate taxonomy bindings if taxonomyAssignments provided or if required bindings exist
      const taxonomyTermsToInsert = await this.validateTaxonomyAssignments(
        client,
        siteId,
        contentType.id,
        data.taxonomyAssignments || {}
      );
      if (taxonomyTermsToInsert.error) {
        await client.query('ROLLBACK');
        return { error: taxonomyTermsToInsert.error, status: 400 };
      }

      // 1. Insert content_entries (with pointers NULL initially)
      const entryId = v7();
      const translationGroupId = v7();
      const entryRes = await client.query(
        `INSERT INTO content_entries (
          id, site_id, content_type_id, locale, translation_group_id, entry_kind, current_revision_id, published_revision_id, published_slug, lifecycle_state, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, 'active', $7, NOW(), NOW())
        RETURNING *`,
        [entryId, siteId, contentType.id, locale, translationGroupId, contentType.kind, userId || null]
      );
      const newEntry = entryRes.rows[0];

      // 2. Insert content_entry_revisions (version_number = 1)
      const revisionId = v7();
      const revRes = await client.query(
        `INSERT INTO content_entry_revisions (
          id, entry_id, version_number, schema_version, title, slug, data, created_by, created_at
        ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          revisionId,
          newEntry.id,
          contentType.schemaVersion,
          data.title.trim(),
          slug,
          JSON.stringify(dataValidation.validatedData),
          userId || null,
        ]
      );
      const newRevision = revRes.rows[0];

      // 3. Insert content_revision_terms
      if (taxonomyTermsToInsert.termIds && taxonomyTermsToInsert.termIds.length > 0) {
        for (let i = 0; i < taxonomyTermsToInsert.termIds.length; i++) {
          await client.query(
            `INSERT INTO content_revision_terms (revision_id, taxonomy_term_id, sort_order)
             VALUES ($1, $2, $3)`,
            [newRevision.id, taxonomyTermsToInsert.termIds[i], i]
          );
        }
      }

      // 4. Update current_revision_id pointer
      await client.query(
        'UPDATE content_entries SET current_revision_id = $1, updated_at = NOW() WHERE id = $2',
        [newRevision.id, newEntry.id]
      );

      await client.query('COMMIT');

      return {
        entry: {
          ...newEntry,
          current_revision_id: newRevision.id,
        },
        revision: newRevision,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to create content entry';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async updateContentEntry(
    siteId: string,
    typeKey: string,
    entryId: string,
    data: {
      expectedRevision: number;
      title?: string;
      slug?: string;
      data?: Record<string, unknown>;
      taxonomyAssignments?: Record<string, string[]>;
    },
    userId?: string
  ): Promise<{ entry?: Record<string, unknown>; revision?: Record<string, unknown>; error?: string; status?: number }> {
    if (data.expectedRevision === undefined || data.expectedRevision === null || typeof data.expectedRevision !== 'number') {
      return {
        error: 'expectedRevision is required for updating content entries (optimistic concurrency control)',
        status: 400,
      };
    }

    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) {
      return { error: typeRes.error || 'Content type not found', status: typeRes.status || 404 };
    }
    const contentType = typeRes.contentType;

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. SELECT entry and current revision FOR UPDATE
      const entryRes = await client.query(
        'SELECT * FROM content_entries WHERE id = $1 AND site_id = $2 FOR UPDATE',
        [entryId, siteId]
      );
      if (entryRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Content entry not found', status: 404 };
      }
      const entry = entryRes.rows[0];

      const currentRevRes = await client.query(
        'SELECT * FROM content_entry_revisions WHERE id = $1',
        [entry.current_revision_id]
      );
      const currentRev = currentRevRes.rows[0];

      // 2. Optimistic Concurrency Check (strictly required)
      if (currentRev) {
        if (currentRev.version_number !== data.expectedRevision) {
          await client.query('ROLLBACK');
          return {
            error: `Optimistic concurrency conflict. Current revision is ${currentRev.version_number}, but expected ${data.expectedRevision}`,
            status: 409,
          };
        }
      }

      const nextVersionNumber = currentRev ? currentRev.version_number + 1 : 1;
      const title = data.title !== undefined ? data.title.trim() : (currentRev?.title || 'Untitled');
      if (!title) {
        await client.query('ROLLBACK');
        return { error: 'Title cannot be empty', status: 400 };
      }

      let slug: string | null = null;
      if (entry.entry_kind === 'collection') {
        const rawSlug = data.slug !== undefined ? data.slug : (currentRev?.slug || title);
        slug = rawSlug
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');
      }

      const mergedData = data.data !== undefined ? { ...(currentRev?.data || {}), ...data.data } : (currentRev?.data || {});
      const dataValidation = validateEntryDataAgainstSchema(mergedData, contentType.dataSchema as CmsDataSchema);
      if (!dataValidation.valid || !dataValidation.validatedData) {
        await client.query('ROLLBACK');
        return { error: dataValidation.error || 'Invalid content data', status: 400 };
      }

      // Determine term IDs to assign to new revision:
      // If taxonomyAssignments is supplied -> validate and use supplied snapshot
      // If taxonomyAssignments is omitted -> copy forward existing terms from currentRev
      let termIdsToAssign: string[] = [];

      if (data.taxonomyAssignments !== undefined) {
        const validated = await this.validateTaxonomyAssignments(
          client,
          siteId,
          contentType.id,
          data.taxonomyAssignments
        );
        if (validated.error) {
          await client.query('ROLLBACK');
          return { error: validated.error, status: 400 };
        }
        termIdsToAssign = validated.termIds || [];
      } else if (currentRev) {
        // Copy-forward existing terms from previous revision
        const existingTermsRes = await client.query(
          'SELECT taxonomy_term_id FROM content_revision_terms WHERE revision_id = $1 ORDER BY sort_order ASC',
          [currentRev.id]
        );
        termIdsToAssign = existingTermsRes.rows.map((r) => r.taxonomy_term_id);
      }

      // 3. INSERT new immutable revision
      const revisionId = v7();
      const newRevRes = await client.query(
        `INSERT INTO content_entry_revisions (
          id, entry_id, version_number, schema_version, title, slug, data, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          revisionId,
          entry.id,
          nextVersionNumber,
          contentType.schemaVersion,
          title,
          slug,
          JSON.stringify(dataValidation.validatedData),
          userId || null,
        ]
      );
      const newRevision = newRevRes.rows[0];

      // 4. INSERT content_revision_terms for new revision
      if (termIdsToAssign.length > 0) {
        for (let i = 0; i < termIdsToAssign.length; i++) {
          await client.query(
            `INSERT INTO content_revision_terms (revision_id, taxonomy_term_id, sort_order)
             VALUES ($1, $2, $3)`,
            [newRevision.id, termIdsToAssign[i], i]
          );
        }
      }

      // 5. UPDATE content_entries current_revision_id pointer (published_revision_id remains unchanged!)
      const updatedEntryRes = await client.query(
        `UPDATE content_entries SET current_revision_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [newRevision.id, entry.id]
      );

      await client.query('COMMIT');
      return {
        entry: updatedEntryRes.rows[0],
        revision: newRevision,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to update content entry';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  private async validateTaxonomyAssignments(
    client: { query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
    siteId: string,
    contentTypeId: string,
    assignments: Record<string, string[]>
  ): Promise<{ termIds?: string[]; error?: string }> {
    // 1. Load active taxonomy bindings for ContentType
    const bindingsRes = await client.query(
      `SELECT ctt.*, t.key as tax_key, t.name as tax_name, t.is_active as tax_is_active
       FROM content_type_taxonomies ctt
       JOIN taxonomies t ON t.id = ctt.taxonomy_id
       WHERE ctt.content_type_id = $1`,
      [contentTypeId]
    );
    const bindings = bindingsRes.rows;
    const bindingMap = new Map<string, Record<string, unknown>>();
    for (const b of bindings) {
      bindingMap.set(b.tax_key as string, b);
    }

    // Check if client provided taxonomies not bound to ContentType
    for (const taxKey of Object.keys(assignments)) {
      if (!bindingMap.has(taxKey)) {
        return { error: `Taxonomy "${taxKey}" is not attached to this content type` };
      }
    }

    const collectedTermIds: string[] = [];
    const seenTermIds = new Set<string>();

    for (const b of bindings) {
      const taxKey = b.tax_key as string;
      const termsForTax = assignments[taxKey] || [];

      // Check required & min/max constraints
      const isRequired = Boolean(b.is_required);
      const minTerms = Number(b.min_terms || 0);
      const maxTerms = b.max_terms !== null && b.max_terms !== undefined ? Number(b.max_terms) : null;

      if (isRequired && termsForTax.length === 0) {
        return { error: `Taxonomy "${taxKey}" is required and must have at least 1 term assigned` };
      }
      if (termsForTax.length < minTerms) {
        return { error: `Taxonomy "${taxKey}" requires at least ${minTerms} term(s) (received ${termsForTax.length})` };
      }
      if (maxTerms !== null && termsForTax.length > maxTerms) {
        return { error: `Taxonomy "${taxKey}" allows at most ${maxTerms} term(s) (received ${termsForTax.length})` };
      }

      // Validate each term ID
      for (const termId of termsForTax) {
        if (seenTermIds.has(termId)) {
          return { error: `Duplicate term assignment for term ID "${termId}"` };
        }
        seenTermIds.add(termId);

        const termRes = await client.query(
          'SELECT id, taxonomy_id, site_id, is_active FROM taxonomy_terms WHERE id = $1',
          [termId]
        );
        if (termRes.rows.length === 0) {
          return { error: `Taxonomy term "${termId}" not found` };
        }
        const term = termRes.rows[0];
        if (!term) {
          return { error: `Taxonomy term "${termId}" not found` };
        }

        if (term.site_id !== siteId) {
          return { error: `Cross-site taxonomy term "${termId}" cannot be assigned to this site entry` };
        }
        if (term.taxonomy_id !== b.taxonomy_id) {
          return { error: `Term "${termId}" does not belong to taxonomy "${taxKey}"` };
        }
        if (!term.is_active) {
          return { error: `Cannot assign inactive taxonomy term "${termId}" to new revision` };
        }
        if (!b.tax_is_active) {
          return { error: `Cannot assign term from inactive taxonomy "${taxKey}"` };
        }

        collectedTermIds.push(term.id as string);
      }
    }

    return { termIds: collectedTermIds };
  }

  async publishContentEntry(
    siteId: string,
    typeKey: string,
    entryId: string
  ): Promise<{ entry?: Record<string, unknown>; publishedRevision?: Record<string, unknown>; error?: string; status?: number }> {
    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) {
      return { error: typeRes.error || 'Content type not found', status: typeRes.status || 404 };
    }
    const contentType = typeRes.contentType;

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');

      const entryRes = await client.query(
        'SELECT * FROM content_entries WHERE id = $1 AND site_id = $2 FOR UPDATE',
        [entryId, siteId]
      );
      if (entryRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Content entry not found', status: 404 };
      }
      const entry = entryRes.rows[0];

      const currentRevRes = await client.query(
        'SELECT * FROM content_entry_revisions WHERE id = $1',
        [entry.current_revision_id]
      );
      if (currentRevRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { error: 'Current revision not found', status: 500 };
      }
      const currentRev = currentRevRes.rows[0];

      // Invariant: Revision ownership integrity
      if (currentRev.entry_id !== entry.id) {
        await client.query('ROLLBACK');
        return { error: 'Integrity violation: revision does not belong to this content entry', status: 400 };
      }

      // Slug conflict check for collection entries
      let publishedSlug: string | null = null;
      if (entry.entry_kind === 'collection') {
        if (!currentRev.slug) {
          await client.query('ROLLBACK');
          return { error: 'Collection entry requires a valid slug to publish', status: 400 };
        }
        publishedSlug = currentRev.slug;

        const slugConflict = await client.query(
          `SELECT id FROM content_entries 
           WHERE site_id = $1 AND content_type_id = $2 AND locale = $3 AND published_slug = $4 AND id != $5
           LIMIT 1`,
          [siteId, contentType.id, entry.locale, publishedSlug, entry.id]
        );
        if (slugConflict.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            error: `Published slug "${publishedSlug}" is already in use by another entry`,
            status: 409,
          };
        }
      }

      // Atomic publish update
      const updateRes = await client.query(
        `UPDATE content_entries 
         SET published_revision_id = current_revision_id, published_slug = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [publishedSlug, entry.id]
      );

      await client.query('COMMIT');
      return {
        entry: updateRes.rows[0],
        publishedRevision: currentRev,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : 'Failed to publish content entry';
      return { error: msg, status: 500 };
    } finally {
      client.release();
    }
  }

  async archiveContentEntry(
    siteId: string,
    typeKey: string,
    entryId: string
  ): Promise<{ entry?: Record<string, unknown>; error?: string; status?: number }> {
    const [updated] = await this.database.db
      .update(contentEntries)
      .set({ lifecycleState: 'archived', updatedAt: new Date() })
      .where(and(eq(contentEntries.id, entryId), eq(contentEntries.siteId, siteId)))
      .returning();
    if (!updated) return { error: 'Content entry not found', status: 404 };
    return { entry: updated as unknown as Record<string, unknown> };
  }

  async listContentEntries(
    siteId: string,
    typeKey: string,
    options: {
      page?: number;
      limit?: number;
      locale?: string;
      lifecycleState?: string;
    }
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) return { items: [], total: 0, page: 1, limit: 20 };
    const contentType = typeRes.contentType;

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(contentEntries.siteId, siteId),
      eq(contentEntries.contentTypeId, contentType.id),
    ];
    if (options.locale) {
      conditions.push(eq(contentEntries.locale, options.locale.toLowerCase()));
    }
    if (options.lifecycleState) {
      conditions.push(eq(contentEntries.lifecycleState, options.lifecycleState));
    }

    const countRes = await this.database.db
      .select({ count: sql<number>`count(*)` })
      .from(contentEntries)
      .where(and(...conditions));
    const total = Number(countRes[0]?.count || 0);

    const entries = await this.database.db
      .select()
      .from(contentEntries)
      .where(and(...conditions))
      .orderBy(desc(contentEntries.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch revision metadata for listed entries
    const items: Record<string, unknown>[] = [];
    for (const e of entries) {
      const curRev = e.currentRevisionId
        ? await this.database.db.query.contentEntryRevisions.findFirst({
            where: (r, { eq: eqOp }) => eqOp(r.id, e.currentRevisionId!),
          })
        : null;

      let status = 'draft';
      if (e.lifecycleState === 'archived') {
        status = 'archived';
      } else if (e.publishedRevisionId) {
        status = e.publishedRevisionId === e.currentRevisionId ? 'published' : 'published_with_draft';
      }

      items.push({
        id: e.id,
        siteId: e.siteId,
        contentTypeId: e.contentTypeId,
        locale: e.locale,
        entryKind: e.entryKind,
        lifecycleState: e.lifecycleState,
        status,
        publishedSlug: e.publishedSlug,
        currentRevisionId: e.currentRevisionId,
        publishedRevisionId: e.publishedRevisionId,
        title: curRev?.title || 'Untitled',
        slug: curRev?.slug || null,
        currentVersionNumber: curRev?.versionNumber || 1,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      });
    }

    return { items, total, page, limit };
  }

  async getContentEntry(
    siteId: string,
    typeKey: string,
    entryId: string
  ): Promise<{ entry?: Record<string, unknown>; currentRevision?: Record<string, unknown>; publishedRevision?: Record<string, unknown>; error?: string; status?: number }> {
    const entry = await this.database.db.query.contentEntries.findFirst({
      where: (e, { eq: eqOp, and: andOp }) => andOp(eqOp(e.id, entryId), eqOp(e.siteId, siteId)),
    });
    if (!entry) return { error: 'Content entry not found', status: 404 };

    const currentRev = entry.currentRevisionId
      ? await this.database.db.query.contentEntryRevisions.findFirst({
          where: (r, { eq: eqOp }) => eqOp(r.id, entry.currentRevisionId!),
        })
      : null;

    const publishedRev = entry.publishedRevisionId
      ? await this.database.db.query.contentEntryRevisions.findFirst({
          where: (r, { eq: eqOp }) => eqOp(r.id, entry.publishedRevisionId!),
        })
      : null;

    let status = 'draft';
    if (entry.lifecycleState === 'archived') {
      status = 'archived';
    } else if (entry.publishedRevisionId) {
      status = entry.publishedRevisionId === entry.currentRevisionId ? 'published' : 'published_with_draft';
    }

    let currentRevisionTerms: Record<string, unknown>[] = [];
    if (entry.currentRevisionId) {
      const termsRes = await this.database.pool.query(
        `SELECT tt.id, tt.key, tt.name, tt.description, tt.sort_order, tt.is_active, tt.parent_id, tt.depth,
                t.id as taxonomy_id, t.key as taxonomy_key, t.name as taxonomy_name
         FROM content_revision_terms crt
         JOIN taxonomy_terms tt ON tt.id = crt.taxonomy_term_id
         JOIN taxonomies t ON t.id = tt.taxonomy_id
         WHERE crt.revision_id = $1
         ORDER BY crt.sort_order ASC`,
        [entry.currentRevisionId]
      );
      currentRevisionTerms = termsRes.rows;
    }

    let publishedRevisionTerms: Record<string, unknown>[] = [];
    if (entry.publishedRevisionId) {
      const pubTermsRes = await this.database.pool.query(
        `SELECT tt.id, tt.key, tt.name, tt.description, tt.sort_order, tt.is_active, tt.parent_id, tt.depth,
                t.id as taxonomy_id, t.key as taxonomy_key, t.name as taxonomy_name
         FROM content_revision_terms crt
         JOIN taxonomy_terms tt ON tt.id = crt.taxonomy_term_id
         JOIN taxonomies t ON t.id = tt.taxonomy_id
         WHERE crt.revision_id = $1
         ORDER BY crt.sort_order ASC`,
        [entry.publishedRevisionId]
      );
      publishedRevisionTerms = pubTermsRes.rows;
    }

    return {
      entry: {
        ...entry,
        status,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      } as unknown as Record<string, unknown>,
      currentRevision: currentRev
        ? ({
            ...currentRev,
            terms: currentRevisionTerms,
          } as unknown as Record<string, unknown>)
        : undefined,
      publishedRevision: publishedRev
        ? ({
            ...publishedRev,
            terms: publishedRevisionTerms,
          } as unknown as Record<string, unknown>)
        : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Public Content Resolver (Reads ONLY published_revision_id)
  // ---------------------------------------------------------------------------

  async getPublicContentEntry(
    siteId: string,
    typeKey: string,
    slug: string,
    locale: string
  ): Promise<{ entry?: Record<string, unknown>; error?: string; status?: number }> {
    if (!locale || typeof locale !== 'string' || !locale.trim()) {
      return { error: 'Query parameter "locale" is required', status: 400 };
    }
    const typeRes = await this.resolveContentTypeByKey(typeKey, siteId);
    if (!typeRes.contentType) return { error: 'Content type not found', status: 404 };
    const contentType = typeRes.contentType;

    const normalizedSlug = slug.trim().toLowerCase();
    if (!isValidLocale(locale)) {
      return { error: `Invalid locale "${locale}". Must be a valid BCP-47 tag`, status: 400 };
    }
    const normalizedLocale = normalizeLocale(locale);

    // Query entry where lifecycle_state = 'active', published_revision_id IS NOT NULL, published_slug = slug
    const entry = await this.database.db.query.contentEntries.findFirst({
      where: (e, { eq: eqOp, and: andOp, isNotNull: isNotNullOp }) =>
        andOp(
          eqOp(e.siteId, siteId),
          eqOp(e.contentTypeId, contentType.id),
          eqOp(e.locale, normalizedLocale),
          eqOp(e.lifecycleState, 'active'),
          isNotNullOp(e.publishedRevisionId),
          eqOp(e.publishedSlug, normalizedSlug)
        ),
    });

    if (!entry || !entry.publishedRevisionId) {
      return { error: 'Published content not found', status: 404 };
    }

    // Read ONLY published revision
    const publishedRev = await this.database.db.query.contentEntryRevisions.findFirst({
      where: (r, { eq: eqOp }) => eqOp(r.id, entry.publishedRevisionId!),
    });

    if (!publishedRev) {
      return { error: 'Published revision snapshot not found', status: 404 };
    }

    // Load taxonomy terms attached to this published revision
    const termsRes = await this.database.pool.query(
      `SELECT tt.id, tt.key, tt.name, tt.description, tt.sort_order, tt.is_active,
              t.key as taxonomy_key, t.name as taxonomy_name
       FROM content_revision_terms crt
       JOIN taxonomy_terms tt ON tt.id = crt.taxonomy_term_id
       JOIN taxonomies t ON t.id = tt.taxonomy_id
       WHERE crt.revision_id = $1
       ORDER BY crt.sort_order ASC`,
      [publishedRev.id]
    );

    return {
      entry: {
        id: entry.id,
        siteId: entry.siteId,
        contentTypeKey: contentType.key,
        locale: entry.locale,
        title: publishedRev.title,
        slug: entry.publishedSlug,
        versionNumber: publishedRev.versionNumber,
        data: publishedRev.data,
        taxonomies: termsRes.rows,
        publishedAt: publishedRev.createdAt.toISOString(),
      },
    };
  }
}

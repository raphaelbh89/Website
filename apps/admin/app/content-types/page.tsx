'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface CmsField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select';
  required?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
}

interface ContentType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: 'single' | 'collection';
  scopeKind: 'global' | 'site';
  siteId: string | null;
  schemaVersion: number;
  isSystem: boolean;
  dataSchema: {
    version: number;
    fields: CmsField[];
  };
  createdAt: string;
}

interface Site {
  id: string;
  key: string;
  name: string;
}

export default function ContentTypesPage() {
  const [types, setTypes] = useState<ContentType[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'collection' | 'single'>('collection');
  const [scopeKind, setScopeKind] = useState<'global' | 'site'>('global');
  const [siteId, setSiteId] = useState('');
  const [fields, setFields] = useState<CmsField[]>([
    { key: 'title_field', label: 'Summary', type: 'text', required: true },
  ]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View Schema Modal state
  const [viewingType, setViewingType] = useState<ContentType | null>(null);

  const fetchTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:4000/content-types', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(`Failed to load content types (${res.status})`);
      }
      const data = await res.json();
      setTypes(data.contentTypes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading content types');
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    try {
      const res = await fetch('http://localhost:4000/sites', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites || []);
        if (data.sites?.length > 0) setSiteId(data.sites[0].id);
      }
    } catch {
      // Ignore sites fetch error if not available
    }
  };

  useEffect(() => {
    fetchTypes();
    fetchSites();
  }, []);

  const addField = () => {
    setFields([
      ...fields,
      {
        key: `field_${fields.length + 1}`,
        label: `Field ${fields.length + 1}`,
        type: 'text',
        required: false,
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<CmsField>) => {
    const updated = [...fields];
    if (updated[index]) {
      updated[index] = { ...updated[index]!, ...patch } as CmsField;
      setFields(updated);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setSubmitting(true);

    try {
      const res = await fetch('http://localhost:4000/content-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          key,
          name,
          description: description || undefined,
          kind,
          scopeKind,
          siteId: scopeKind === 'site' ? siteId : null,
          dataSchema: {
            version: 1,
            fields,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create content type');
      }

      setShowCreateModal(false);
      setKey('');
      setName('');
      setDescription('');
      setFields([{ key: 'title_field', label: 'Summary', type: 'text', required: true }]);
      fetchTypes();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error creating content type');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '2rem', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>CMS Content Types</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>Manage dynamic content definitions and schemas (M3.1)</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
          >
            + Create Content Type
          </button>
        </div>
      </header>

      {/* Top Nav */}
      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>Dashboard</Link>
        <Link href="/users" style={{ color: '#94a3b8', textDecoration: 'none' }}>Users</Link>
        <Link href="/roles" style={{ color: '#94a3b8', textDecoration: 'none' }}>Roles</Link>
        <Link href="/content-types" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}>Content Types</Link>
        <Link href="/content" style={{ color: '#94a3b8', textDecoration: 'none' }}>Content Entries</Link>
      </nav>

      {error && (
        <div style={{ padding: '1rem', background: '#ef444422', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading content types...</div>
      ) : types.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', background: '#1e293b', borderRadius: '8px', color: '#94a3b8' }}>
          No content types found. Click &quot;+ Create Content Type&quot; to define your first schema.
        </div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.875rem' }}>
                <th style={{ padding: '1rem' }}>Name / Key</th>
                <th style={{ padding: '1rem' }}>Kind</th>
                <th style={{ padding: '1rem' }}>Scope</th>
                <th style={{ padding: '1rem' }}>Schema Version</th>
                <th style={{ padding: '1rem' }}>Fields</th>
                <th style={{ padding: '1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{t.key}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: t.kind === 'collection' ? '#1e3a8a' : '#581c87',
                      color: t.kind === 'collection' ? '#93c5fd' : '#e9d5ff',
                    }}>
                      {t.kind.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: t.scopeKind === 'global' ? '#065f46' : '#854d0e',
                      color: t.scopeKind === 'global' ? '#6ee7b7' : '#fde047',
                    }}>
                      {t.scopeKind.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#cbd5e1' }}>v{t.schemaVersion}</td>
                  <td style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                    {t.dataSchema?.fields?.length || 0} fields
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button
                      onClick={() => setViewingType(t)}
                      style={{ padding: '0.35rem 0.75rem', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      View Schema
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem' }}>Create Content Type</h2>

            {modalError && (
              <div style={{ padding: '0.75rem', background: '#ef444422', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Key (machine-readable)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. article, course"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bài viết, Khóa học"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Kind</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as 'collection' | 'single')}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                  >
                    <option value="collection">Collection (Multiple entries with slugs)</option>
                    <option value="single">Single (Singleton config / single entry)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Scope</label>
                  <select
                    value={scopeKind}
                    onChange={(e) => setScopeKind(e.target.value as 'global' | 'site')}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                  >
                    <option value="global">GLOBAL (Shared for all platform sites)</option>
                    <option value="site">SITE (Specific to one site)</option>
                  </select>
                </div>
              </div>

              {scopeKind === 'site' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Select Target Site</label>
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.key})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Dynamic Fields Section */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#cbd5e1' }}>CMS Field Schema Definitions</h3>
                  <button
                    type="button"
                    onClick={addField}
                    style={{ padding: '0.3rem 0.6rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    + Add Field
                  </button>
                </div>

                {fields.map((f, idx) => (
                  <div key={idx} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', padding: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Field key"
                        value={f.key}
                        onChange={(e) => updateField(idx, { key: e.target.value })}
                        style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                      <input
                        type="text"
                        placeholder="Label"
                        value={f.label}
                        onChange={(e) => updateField(idx, { label: e.target.value })}
                        style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '4px', fontSize: '0.85rem' }}
                      />
                      <select
                        value={f.type}
                        onChange={(e) => updateField(idx, { type: e.target.value as CmsField['type'] })}
                        style={{ padding: '0.4rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '4px', fontSize: '0.85rem' }}
                      >
                        <option value="text">Text (short)</option>
                        <option value="textarea">Textarea (multiline)</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean (true/false)</option>
                        <option value="select">Select (dropdown)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        disabled={fields.length === 1}
                        style={{ padding: '0.4rem 0.6rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={f.required || false}
                          onChange={(e) => updateField(idx, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      {f.type === 'select' && (
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            placeholder="Options comma-separated (e.g. Red,Green,Blue)"
                            onChange={(e) => {
                              const opts = e.target.value.split(',').map((v) => ({ label: v.trim(), value: v.trim().toLowerCase() })).filter((o) => o.label);
                              updateField(idx, { options: opts });
                            }}
                            style={{ width: '100%', padding: '0.3rem', background: '#1e293b', border: '1px solid #475569', color: 'white', borderRadius: '4px', fontSize: '0.8rem' }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '0.5rem 1rem', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {submitting ? 'Creating...' : 'Save Content Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Schema Modal */}
      {viewingType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', width: '100%', maxWidth: '550px', padding: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>{viewingType.name} ({viewingType.key})</h2>
            <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
              Schema Version: v{viewingType.schemaVersion} | Kind: {viewingType.kind} | Scope: {viewingType.scopeKind}
            </p>
            <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem', color: '#38bdf8' }}>
              {JSON.stringify(viewingType.dataSchema, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setViewingType(null)}
                style={{ padding: '0.5rem 1rem', background: '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface CmsField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select';
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
}

interface ContentType {
  id: string;
  key: string;
  name: string;
  kind: 'single' | 'collection';
  scopeKind: 'global' | 'site';
  dataSchema: {
    version: number;
    fields: CmsField[];
  };
}

interface ContentEntryItem {
  id: string;
  siteId: string;
  contentTypeId: string;
  locale: string;
  entryKind: 'single' | 'collection';
  lifecycleState: 'active' | 'archived';
  status: 'draft' | 'published' | 'published_with_draft' | 'archived';
  title: string;
  slug: string | null;
  publishedSlug: string | null;
  currentVersionNumber: number;
  currentRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Site {
  id: string;
  key: string;
  name: string;
}

export default function ContentEntriesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string>('');

  const [entries, setEntries] = useState<ContentEntryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic Form Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number | undefined>(undefined);
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch initial sites
  useEffect(() => {
    fetch('http://localhost:4000/sites', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.sites?.length > 0) {
          setSites(data.sites);
          setSelectedSiteId(data.sites[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch content types when site selected
  useEffect(() => {
    if (!selectedSiteId) return;
    fetch(`http://localhost:4000/content-types?siteId=${selectedSiteId}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((data) => {
        const types = data.contentTypes || [];
        setContentTypes(types);
        if (types.length > 0) {
          setSelectedTypeKey(types[0].key);
        } else {
          setSelectedTypeKey('');
        }
      })
      .catch(() => {});
  }, [selectedSiteId]);

  // Fetch entries when type or site changes
  const fetchEntries = async () => {
    if (!selectedSiteId || !selectedTypeKey) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error(`Failed to load content entries (${res.status})`);
      }
      const data = await res.json();
      setEntries(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [selectedSiteId, selectedTypeKey]);

  const activeContentType = contentTypes.find((t) => t.key === selectedTypeKey);

  const openCreateModal = () => {
    setEditingEntryId(null);
    setExpectedRevision(undefined);
    setFormTitle('');
    setFormSlug('');
    const initialData: Record<string, unknown> = {};
    activeContentType?.dataSchema.fields.forEach((f) => {
      initialData[f.key] = f.default !== undefined ? f.default : f.type === 'boolean' ? false : f.type === 'number' ? 0 : '';
    });
    setFormData(initialData);
    setFormError(null);
    setShowFormModal(true);
  };

  const openEditModal = async (entry: ContentEntryItem) => {
    setEditingEntryId(entry.id);
    setExpectedRevision(entry.currentVersionNumber);
    setFormTitle(entry.title);
    setFormSlug(entry.slug || '');
    setFormError(null);

    // Fetch full entry details
    try {
      const res = await fetch(`http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}/${entry.id}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setFormData(data.currentRevision?.data || {});
      }
    } catch {
      // Use fallback
    }

    setShowFormModal(true);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const url = editingEntryId
        ? `http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}/${editingEntryId}`
        : `http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}`;
      const method = editingEntryId ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        title: formTitle,
        slug: formSlug || undefined,
        data: formData,
      };
      if (editingEntryId && expectedRevision !== undefined) {
        payload.expectedRevision = expectedRevision;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || 'Failed to save content entry');
      }

      setShowFormModal(false);
      fetchEntries();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error saving entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (entryId: string) => {
    if (!confirm('Are you sure you want to publish this revision to the public website?')) return;
    try {
      const res = await fetch(`http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}/${entryId}/publish`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to publish entry');
      } else {
        fetchEntries();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error publishing entry');
    }
  };

  const handleArchive = async (entryId: string) => {
    if (!confirm('Are you sure you want to archive this entry?')) return;
    try {
      const res = await fetch(`http://localhost:4000/sites/${selectedSiteId}/content/${selectedTypeKey}/${entryId}/archive`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      if (res.ok) {
        fetchEntries();
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '2rem', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Content Entries</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>Dynamic multi-site content management (M3.1)</p>
        </div>
        {activeContentType && (
          <button
            onClick={openCreateModal}
            style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
          >
            + Create {activeContentType.name}
          </button>
        )}
      </header>

      {/* Top Nav */}
      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '0.75rem' }}>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>Dashboard</Link>
        <Link href="/users" style={{ color: '#94a3b8', textDecoration: 'none' }}>Users</Link>
        <Link href="/roles" style={{ color: '#94a3b8', textDecoration: 'none' }}>Roles</Link>
        <Link href="/content-types" style={{ color: '#94a3b8', textDecoration: 'none' }}>Content Types</Link>
        <Link href="/content" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}>Content Entries</Link>
      </nav>

      {/* Site and Type Selectors */}
      <div style={{ display: 'flex', gap: '1rem', background: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #334155', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Site:</label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            style={{ padding: '0.4rem 0.8rem', background: '#0f172a', border: '1px solid #475569', color: 'white', borderRadius: '4px' }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.key})</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Content Type:</label>
          <select
            value={selectedTypeKey}
            onChange={(e) => setSelectedTypeKey(e.target.value)}
            style={{ padding: '0.4rem 0.8rem', background: '#0f172a', border: '1px solid #475569', color: 'white', borderRadius: '4px' }}
          >
            {contentTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.name} ({t.key}) - {t.kind}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#ef444422', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading entries...</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', background: '#1e293b', borderRadius: '8px', color: '#94a3b8' }}>
          No entries found for {activeContentType?.name || 'this content type'}. Click &quot;+ Create {activeContentType?.name || 'Entry'}&quot; to create one.
        </div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.875rem' }}>
                <th style={{ padding: '1rem' }}>Title</th>
                <th style={{ padding: '1rem' }}>Slug (Draft / Published)</th>
                <th style={{ padding: '1rem' }}>Revision</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Updated</th>
                <th style={{ padding: '1rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '1rem', fontWeight: 600, color: '#f8fafc' }}>{entry.title}</td>
                  <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {entry.slug || '-'}
                    {entry.publishedSlug && (
                      <span style={{ display: 'block', color: '#38bdf8', fontSize: '0.75rem' }}>
                        🌐 {entry.publishedSlug}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: '#cbd5e1' }}>rev #{entry.currentVersionNumber}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background:
                        entry.status === 'published'
                          ? '#065f46'
                          : entry.status === 'published_with_draft'
                          ? '#854d0e'
                          : entry.status === 'archived'
                          ? '#475569'
                          : '#1e3a8a',
                      color:
                        entry.status === 'published'
                          ? '#6ee7b7'
                          : entry.status === 'published_with_draft'
                          ? '#fde047'
                          : entry.status === 'archived'
                          ? '#cbd5e1'
                          : '#93c5fd',
                    }}>
                      {entry.status === 'published'
                        ? 'PUBLISHED'
                        : entry.status === 'published_with_draft'
                        ? 'PUBLISHED + DRAFT'
                        : entry.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {new Date(entry.updatedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => openEditModal(entry)}
                        style={{ padding: '0.35rem 0.6rem', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Edit Draft
                      </button>
                      {entry.status !== 'published' && (
                        <button
                          onClick={() => handlePublish(entry.id)}
                          style={{ padding: '0.35rem 0.6rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                          Publish
                        </button>
                      )}
                      {entry.status !== 'archived' && (
                        <button
                          onClick={() => handleArchive(entry.id)}
                          style={{ padding: '0.35rem 0.6rem', background: '#475569', color: '#f8fafc', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dynamic Form Modal */}
      {showFormModal && activeContentType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
              {editingEntryId ? `Edit ${activeContentType.name} (Draft Rev #${expectedRevision})` : `New ${activeContentType.name}`}
            </h2>
            <p style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
              Editing creates an immutable draft revision. Published version remains live until published.
            </p>

            {formError && (
              <div style={{ padding: '0.75rem', background: '#ef444422', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEntry}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Title (required)</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                />
              </div>

              {activeContentType.kind === 'collection' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Slug (optional, auto-generated from title if blank)</label>
                  <input
                    type="text"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px', fontFamily: 'monospace' }}
                  />
                </div>
              )}

              {/* Dynamic Field Renderer keyed by FIELD TYPE */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#cbd5e1' }}>Dynamic Fields ({activeContentType.name})</h3>

                {activeContentType.dataSchema.fields.map((field) => (
                  <div key={field.key} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '0.3rem' }}>
                      {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>

                    {/* FIELD TYPE: text */}
                    {field.type === 'text' && (
                      <input
                        type="text"
                        required={field.required}
                        value={(formData[field.key] as string | undefined) ?? ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                      />
                    )}

                    {/* FIELD TYPE: textarea */}
                    {field.type === 'textarea' && (
                      <textarea
                        rows={3}
                        required={field.required}
                        value={(formData[field.key] as string | undefined) ?? ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                      />
                    )}

                    {/* FIELD TYPE: number */}
                    {field.type === 'number' && (
                      <input
                        type="number"
                        required={field.required}
                        value={(formData[field.key] as number | undefined) ?? 0}
                        onChange={(e) => setFormData({ ...formData, [field.key]: Number(e.target.value) })}
                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                      />
                    )}

                    {/* FIELD TYPE: boolean */}
                    {field.type === 'boolean' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(formData[field.key])}
                          onChange={(e) => setFormData({ ...formData, [field.key]: e.target.checked })}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{field.label} (Yes/No)</span>
                      </label>
                    )}

                    {/* FIELD TYPE: select */}
                    {field.type === 'select' && (
                      <select
                        required={field.required}
                        value={(formData[field.key] as string | undefined) ?? ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '4px' }}
                      >
                        <option value="">-- Select {field.label} --</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  style={{ padding: '0.5rem 1rem', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {submitting ? 'Saving...' : 'Save Draft Revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Taxonomy {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope_kind: 'global' | 'site';
  site_id: string | null;
  is_hierarchical: boolean;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

interface TaxonomyTerm {
  id: string;
  taxonomy_id: string;
  site_id: string;
  parent_id: string | null;
  depth: number;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  children?: TaxonomyTerm[];
}

interface Site {
  id: string;
  key: string;
  name: string;
}

export default function TaxonomiesAdminPage() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<Taxonomy | null>(null);
  const [terms, setTerms] = useState<TaxonomyTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Taxonomy Modal
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [taxKey, setTaxKey] = useState('');
  const [taxName, setTaxName] = useState('');
  const [taxDesc, setTaxDesc] = useState('');
  const [taxScope, setTaxScope] = useState<'global' | 'site'>('global');
  const [taxHierarchical, setTaxHierarchical] = useState(false);
  const [taxSubmitting, setTaxSubmitting] = useState(false);

  // Term Form State
  const [showTermModal, setShowTermModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<TaxonomyTerm | null>(null);
  const [termKey, setTermKey] = useState('');
  const [termName, setTermName] = useState('');
  const [termDesc, setTermDesc] = useState('');
  const [termParentId, setTermParentId] = useState<string>('');
  const [termSortOrder, setTermSortOrder] = useState<number>(0);
  const [termSubmitting, setTermSubmitting] = useState(false);

  // Load sites and taxonomies
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [sitesRes, taxRes] = await Promise.all([
          apiFetch<{ sites?: Site[] }>('/sites'),
          apiFetch<{ taxonomies?: Taxonomy[] }>('/taxonomies'),
        ]);

        if (sitesRes.ok && sitesRes.data) {
          const siteList = sitesRes.data.sites || [];
          setSites(siteList);
          if (siteList.length > 0 && siteList[0]) {
            setSelectedSiteId(siteList[0].id);
          }
        }

        if (taxRes.ok && taxRes.data) {
          const tData = taxRes.data;
          setTaxonomies(tData.taxonomies || []);
          if (tData.taxonomies && tData.taxonomies.length > 0 && tData.taxonomies[0]) {
            setSelectedTaxonomy(tData.taxonomies[0]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load taxonomies');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Load terms when taxonomy or site changes
  useEffect(() => {
    if (!selectedTaxonomy || !selectedSiteId) return;
    const taxKey = selectedTaxonomy.key;
    const siteId = selectedSiteId;

    async function loadTerms() {
      try {
        const { data, ok } = await apiFetch<{ terms?: TaxonomyTerm[] }>(
          `/sites/${siteId}/taxonomies/${taxKey}/terms?tree=true`
        );
        if (ok && data) {
          setTerms(data.terms || []);
        } else {
          setTerms([]);
        }
      } catch (err) {
        console.error('Failed to load terms:', err);
      }
    }
    loadTerms();
  }, [selectedTaxonomy, selectedSiteId]);

  const handleCreateTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaxSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        key: taxKey,
        name: taxName,
        description: taxDesc || undefined,
        scopeKind: taxScope,
        isHierarchical: taxHierarchical,
      };
      if (taxScope === 'site') {
        payload.siteId = selectedSiteId;
      }

      const { data, ok, error } = await apiFetch<{ taxonomy: Taxonomy }>('/taxonomies', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!ok || !data) {
        throw new Error(error || 'Failed to create taxonomy');
      }

      setTaxonomies((prev) => [...prev, data.taxonomy]);
      setSelectedTaxonomy(data.taxonomy);
      setShowTaxModal(false);
      setTaxKey('');
      setTaxName('');
      setTaxDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating taxonomy');
    } finally {
      setTaxSubmitting(false);
    }
  };

  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxonomy || !selectedSiteId) return;
    setTermSubmitting(true);
    setError(null);

    try {
      if (editingTerm) {
        // Update / Move term
        const { ok, error } = await apiFetch(
          `/sites/${selectedSiteId}/taxonomies/${selectedTaxonomy.key}/terms/${editingTerm.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: termName,
              description: termDesc || null,
              parentId: termParentId ? termParentId : null,
              sortOrder: Number(termSortOrder),
            }),
          }
        );

        if (!ok) {
          throw new Error(error || 'Failed to update term');
        }
      } else {
        // Create new term
        const { ok, error } = await apiFetch(
          `/sites/${selectedSiteId}/taxonomies/${selectedTaxonomy.key}/terms`,
          {
            method: 'POST',
            body: JSON.stringify({
              key: termKey,
              name: termName,
              description: termDesc || undefined,
              parentId: termParentId ? termParentId : undefined,
              sortOrder: Number(termSortOrder),
            }),
          }
        );

        if (!ok) {
          throw new Error(error || 'Failed to create term');
        }
      }

      // Reload terms
      const refRes = await apiFetch<{ terms?: TaxonomyTerm[] }>(
        `/sites/${selectedSiteId}/taxonomies/${selectedTaxonomy.key}/terms?tree=true`
      );
      if (refRes.ok && refRes.data) {
        setTerms(refRes.data.terms || []);
      }

      setShowTermModal(false);
      setEditingTerm(null);
      setTermKey('');
      setTermName('');
      setTermDesc('');
      setTermParentId('');
      setTermSortOrder(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving term');
    } finally {
      setTermSubmitting(false);
    }
  };

  const handleToggleTermActivation = async (term: TaxonomyTerm) => {
    if (!selectedTaxonomy || !selectedSiteId) return;
    setError(null);

    const action = term.is_active ? 'deactivate' : 'activate';
    try {
      const { ok, error } = await apiFetch(
        `/sites/${selectedSiteId}/taxonomies/${selectedTaxonomy.key}/terms/${term.id}/${action}`,
        {
          method: 'POST',
        }
      );

      if (!ok) {
        throw new Error(error || `Failed to ${action} term`);
      }

      // Reload terms
      const refRes = await apiFetch<{ terms?: TaxonomyTerm[] }>(
        `/sites/${selectedSiteId}/taxonomies/${selectedTaxonomy.key}/terms?tree=true`
      );
      if (refRes.ok && refRes.data) {
        setTerms(refRes.data.terms || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error toggling term activation`);
    }
  };

  const renderTermTree = (nodeList: TaxonomyTerm[]) => {
    return (
      <div className="space-y-2">
        {nodeList.map((node) => (
          <div key={node.id} className="border border-neutral-200 rounded-md p-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-mono text-xs text-neutral-400">D:{node.depth}</span>
                <span className={`font-medium ${!node.is_active ? 'line-through text-neutral-400' : 'text-neutral-900'}`}>
                  {node.name}
                </span>
                <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-mono">
                  {node.key}
                </span>
                {!node.is_active && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Inactive</span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setEditingTerm(node);
                    setTermKey(node.key);
                    setTermName(node.name);
                    setTermDesc(node.description || '');
                    setTermParentId(node.parent_id || '');
                    setTermSortOrder(node.sort_order);
                    setShowTermModal(true);
                  }}
                  className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2.5 py-1 rounded"
                >
                  Edit / Move
                </button>
                <button
                  onClick={() => handleToggleTermActivation(node)}
                  className={`text-xs px-2.5 py-1 rounded ${
                    node.is_active
                      ? 'bg-red-50 text-red-700 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {node.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
            {node.children && node.children.length > 0 && (
              <div className="ml-6 mt-3 pl-3 border-l-2 border-neutral-100 space-y-2">
                {renderTermTree(node.children)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top Bar */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/" className="font-bold text-lg tracking-tight">
            Platform Admin
          </Link>
          <nav className="flex space-x-4 text-sm font-medium">
            <Link href="/users" className="text-neutral-600 hover:text-neutral-900">
              Users
            </Link>
            <Link href="/roles" className="text-neutral-600 hover:text-neutral-900">
              Roles & Permissions
            </Link>
            <Link href="/content-types" className="text-neutral-600 hover:text-neutral-900">
              Content Types
            </Link>
            <Link href="/content" className="text-neutral-600 hover:text-neutral-900">
              Content Entries
            </Link>
            <Link href="/taxonomies" className="text-neutral-900 font-semibold border-b-2 border-neutral-900 pb-1">
              Taxonomies
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          <label className="text-xs font-medium text-neutral-600">Site Context:</label>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="border border-neutral-300 rounded px-2.5 py-1 text-sm bg-white"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.key})
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Taxonomies & Categories</h1>
            <p className="text-sm text-neutral-500">
              Manage hierarchical and flat classification schemes (Categories, Tags, Departments).
            </p>
          </div>
          <button
            onClick={() => setShowTaxModal(true)}
            className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            + Create Taxonomy
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-neutral-500 py-12 text-center">Loading taxonomies...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Column 1: Taxonomies List */}
            <div className="bg-white border border-neutral-200 rounded-lg p-4">
              <h2 className="font-semibold text-sm text-neutral-700 uppercase tracking-wider mb-4">
                Taxonomy Definitions
              </h2>
              <div className="space-y-2">
                {taxonomies.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTaxonomy(t)}
                    className={`w-full text-left p-3 rounded-md text-sm transition-colors ${
                      selectedTaxonomy?.id === t.id
                        ? 'bg-neutral-900 text-white'
                        : 'hover:bg-neutral-100 text-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{t.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-mono ${
                          selectedTaxonomy?.id === t.id ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {t.scope_kind}
                      </span>
                    </div>
                    <div className="text-xs opacity-75 flex items-center space-x-2">
                      <span>{t.key}</span>
                      <span>•</span>
                      <span>{t.is_hierarchical ? 'Hierarchical (maxDepth=5)' : 'Flat'}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Column 2 & 3: Term Management & Tree */}
            <div className="md:col-span-2 bg-white border border-neutral-200 rounded-lg p-6">
              {selectedTaxonomy ? (
                <div>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-6">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h2 className="text-xl font-bold">{selectedTaxonomy.name}</h2>
                        <span className="text-xs bg-neutral-100 text-neutral-700 font-mono px-2 py-0.5 rounded">
                          {selectedTaxonomy.key}
                        </span>
                        <span className="text-xs bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">
                          {selectedTaxonomy.is_hierarchical ? 'Hierarchical' : 'Flat'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        Site-bound Terms for site ID: <span className="font-mono">{selectedSiteId}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingTerm(null);
                        setTermKey('');
                        setTermName('');
                        setTermDesc('');
                        setTermParentId('');
                        setTermSortOrder(0);
                        setShowTermModal(true);
                      }}
                      className="bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium px-3.5 py-2 rounded-md"
                    >
                      + Add Term
                    </button>
                  </div>

                  {/* Terms Display */}
                  {terms.length === 0 ? (
                    <div className="text-center py-12 text-neutral-400 text-sm">
                      No terms created in this taxonomy for this site yet.
                    </div>
                  ) : (
                    renderTermTree(terms)
                  )}
                </div>
              ) : (
                <div className="text-neutral-400 py-12 text-center text-sm">
                  Select a taxonomy to manage its terms.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Create Taxonomy */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">Create Taxonomy Definition</h3>
            <form onSubmit={handleCreateTaxonomy} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Scope</label>
                <select
                  value={taxScope}
                  onChange={(e) => setTaxScope(e.target.value as 'global' | 'site')}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm bg-white"
                >
                  <option value="global">GLOBAL (Shared contract across sites)</option>
                  <option value="site">SITE (Specific to current site)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Key (Identifier)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. category, tags, department"
                  value={taxKey}
                  onChange={(e) => setTaxKey(e.target.value.toLowerCase())}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chuyên mục, Thẻ từ khóa"
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={taxDesc}
                  onChange={(e) => setTaxDesc(e.target.value)}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hierarchical_cb"
                  checked={taxHierarchical}
                  onChange={(e) => setTaxHierarchical(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                <label htmlFor="hierarchical_cb" className="text-sm text-neutral-700">
                  Hierarchical (supports Parent-Child, maxDepth = 5)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowTaxModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded text-sm text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taxSubmitting}
                  className="px-4 py-2 bg-neutral-900 text-white rounded text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
                >
                  {taxSubmitting ? 'Creating...' : 'Create Taxonomy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Term */}
      {showTermModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">
              {editingTerm ? 'Edit / Move Term' : 'Add Taxonomy Term'}
            </h3>
            <form onSubmit={handleSaveTerm} className="space-y-4">
              {!editingTerm && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Key (Slug)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. tin-tuc, tuyen-sinh"
                    value={termKey}
                    onChange={(e) => setTermKey(e.target.value.toLowerCase())}
                    className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tin tức, Tuyển sinh"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={termDesc}
                  onChange={(e) => setTermDesc(e.target.value)}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                />
              </div>
              {selectedTaxonomy?.is_hierarchical && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Parent Term (Move)</label>
                  <select
                    value={termParentId}
                    onChange={(e) => setTermParentId(e.target.value)}
                    className="w-full border border-neutral-300 rounded px-3 py-2 text-sm bg-white"
                  >
                    <option value="">(None - Root level)</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id} disabled={editingTerm?.id === t.id}>
                        {t.name} ({t.key})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-400 mt-1">
                    Moving a term recomputes all descendant depths atomically up to maxDepth = 5.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={termSortOrder}
                  onChange={(e) => setTermSortOrder(Number(e.target.value))}
                  className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowTermModal(false)}
                  className="px-4 py-2 border border-neutral-300 rounded text-sm text-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={termSubmitting}
                  className="px-4 py-2 bg-neutral-900 text-white rounded text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
                >
                  {termSubmitting ? 'Saving...' : 'Save Term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

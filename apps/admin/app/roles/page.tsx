'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface RoleItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  permissions: string[];
}

interface PermissionCatalogItem {
  key: string;
  name: string;
  module: string;
  description: string | null;
}

export default function RolesManagementPage() {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

  const [rolesList, setRolesList] = useState<RoleItem[]>([]);
  const [allPermissions, setAllPermissions] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create Role Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createKey, setCreateKey] = useState('');
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSelectedPerms, setCreateSelectedPerms] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Permissions Modal
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editSelectedPerms, setEditSelectedPerms] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const fetchRolesData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch(`${apiBase}/roles`, { credentials: 'include' }),
        fetch(`${apiBase}/permissions`, { credentials: 'include' }),
      ]);

      if (rolesRes.status === 401 || permsRes.status === 401) {
        router.push('/login');
        return;
      }

      if (rolesRes.ok && permsRes.ok) {
        const rolesData = await rolesRes.json();
        const permsData = await permsRes.json();
        setRolesList(rolesData.roles);
        setAllPermissions(permsData.permissions);
      } else {
        setErrorMessage('Failed to load roles and permissions.');
      }
    } catch {
      setErrorMessage('Network error loading roles.');
    } finally {
      setLoading(false);
    }
  }, [apiBase, router]);

  useEffect(() => {
    void fetchRolesData();
  }, [fetchRolesData]);

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch(`${apiBase}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          key: createKey,
          name: createName,
          description: createDesc,
          permissions: createSelectedPerms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || 'Failed to create role');
        setCreateLoading(false);
        return;
      }

      setShowCreateModal(false);
      setCreateKey('');
      setCreateName('');
      setCreateDesc('');
      setCreateSelectedPerms([]);
      void fetchRolesData();
    } catch {
      setCreateError('Network error while creating role');
    } finally {
      setCreateLoading(false);
    }
  }

  function openEditRoleModal(role: RoleItem) {
    setEditingRole(role);
    setEditRoleName(role.name);
    setEditRoleDesc(role.description || '');
    setEditSelectedPerms([...role.permissions]);
    setEditError(null);
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRole) return;

    setEditLoading(true);
    setEditError(null);

    try {
      // 1. Update basic info
      const updateInfoRes = await fetch(`${apiBase}/roles/${editingRole.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: editRoleName,
          description: editRoleDesc,
        }),
      });

      if (!updateInfoRes.ok) {
        const d = await updateInfoRes.json();
        setEditError(d.message || 'Failed to update role details');
        setEditLoading(false);
        return;
      }

      // 2. Update permissions if not system_super_admin
      if (!editingRole.isSystem || editingRole.key !== 'system_super_admin') {
        const updatePermsRes = await fetch(`${apiBase}/roles/${editingRole.id}/permissions`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
          body: JSON.stringify({
            permissions: editSelectedPerms,
          }),
        });

        if (!updatePermsRes.ok) {
          const d = await updatePermsRes.json();
          setEditError(d.message || 'Failed to update role permissions');
          setEditLoading(false);
          return;
        }
      }

      setEditingRole(null);
      void fetchRolesData();
    } catch {
      setEditError('Network error while saving role');
    } finally {
      setEditLoading(false);
    }
  }

  function togglePermSelection(permKey: string, isCreate: boolean) {
    if (isCreate) {
      setCreateSelectedPerms((prev) =>
        prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
      );
    } else {
      setEditSelectedPerms((prev) =>
        prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
      );
    }
  }

  // Group permissions by module
  const permissionsByModule = allPermissions.reduce<Record<string, PermissionCatalogItem[]>>((acc, p) => {
    const list = acc[p.module] || [];
    list.push(p);
    acc[p.module] = list;
    return acc;
  }, {});

  return (
    <main style={{ maxWidth: 1040, margin: '5vh auto', padding: '0 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Navigation Header */}
      <nav style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 24 }}>
        <Link href="/" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
        <Link href="/users" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Users</Link>
        <Link href="/roles" style={{ color: '#0f172a', textDecoration: 'none', fontWeight: 700, borderBottom: '2px solid #0f172a', paddingBottom: 10 }}>Roles & Permissions</Link>
      </nav>

      {/* Header and Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>Roles & Permissions</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>Configure roles and fine-grained authorization policies.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '9px 16px',
            backgroundColor: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          + Create Custom Role
        </button>
      </div>

      {errorMessage && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>
          {errorMessage}
        </div>
      )}

      {/* Roles Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Role Name</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Key</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Type</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Permissions</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading roles...</td>
              </tr>
            ) : (
              rolesList.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                    {r.name}
                    {r.description && <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b', marginTop: 2 }}>{r.description}</div>}
                  </td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#475569' }}>{r.key}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: r.isSystem ? '#f3e8ff' : '#f1f5f9',
                        color: r.isSystem ? '#7e22ce' : '#334155',
                      }}
                    >
                      {r.isSystem ? 'System' : 'Custom'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>
                    <strong>{r.permissions.length}</strong> granted
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => openEditRoleModal(r)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, width: 620, maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#0f172a' }}>Create Custom Role</h2>
            {createError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateRole}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Role Key (slug)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. content_publisher"
                  value={createKey}
                  onChange={(e) => setCreateKey(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Role Name</label>
                <input
                  type="text"
                  required
                  placeholder="Content Publisher"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Description</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>

              {/* Permission Matrix */}
              <h3 style={{ fontSize: 14, color: '#334155', marginBottom: 8 }}>Select Permissions</h3>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 20, maxHeight: 240, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
                {Object.entries(permissionsByModule).map(([module, perms]) => (
                  <div key={module} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      {module}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                      {perms.map((p) => (
                        <label key={p.key} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={createSelectedPerms.includes(p.key)}
                            onChange={() => togglePermSelection(p.key, true)}
                          />
                          <span>{p.name} <code style={{ fontSize: 11, color: '#64748b' }}>({p.key})</code></span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 4, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: 4, backgroundColor: '#0f172a', color: '#fff', fontWeight: 600, cursor: createLoading ? 'not-allowed' : 'pointer' }}
                >
                  {createLoading ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, width: 620, maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#0f172a' }}>Configure Role: {editingRole.name}</h2>
            {editError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                {editError}
              </div>
            )}
            <form onSubmit={handleSaveRole}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Role Name</label>
                <input
                  type="text"
                  required
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Description</label>
                <textarea
                  value={editRoleDesc}
                  onChange={(e) => setEditRoleDesc(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>

              {/* Permission Matrix */}
              <h3 style={{ fontSize: 14, color: '#334155', marginBottom: 8 }}>
                Permissions {editingRole.isSystem && editingRole.key === 'system_super_admin' ? '(System Super Admin retains all permissions)' : ''}
              </h3>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 20, maxHeight: 240, overflowY: 'auto', backgroundColor: '#f8fafc' }}>
                {Object.entries(permissionsByModule).map(([module, perms]) => (
                  <div key={module} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', textTransform: 'uppercase', marginBottom: 6 }}>
                      {module}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                      {perms.map((p) => (
                        <label key={p.key} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="checkbox"
                            disabled={editingRole.isSystem && editingRole.key === 'system_super_admin'}
                            checked={editSelectedPerms.includes(p.key)}
                            onChange={() => togglePermSelection(p.key, false)}
                          />
                          <span>{p.name} <code style={{ fontSize: 11, color: '#64748b' }}>({p.key})</code></span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditingRole(null)}
                  style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 4, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: 4, backgroundColor: '#0f172a', color: '#fff', fontWeight: 600, cursor: editLoading ? 'not-allowed' : 'pointer' }}
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

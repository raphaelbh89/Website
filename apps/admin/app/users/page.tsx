'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface UserItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

interface SiteItem {
  id: string;
  key: string;
  name: string;
}

interface AssignmentItem {
  id: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  scopeKind: 'global' | 'site';
  scopeId: string | null;
  siteName?: string | null;
  createdAt: string;
}

export default function UsersManagementPage() {
  const router = useRouter();

  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Role Assignment Modal state
  const [selectedUserForRoles, setSelectedUserForRoles] = useState<UserItem | null>(null);
  const [userAssignments, setUserAssignments] = useState<AssignmentItem[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleItem[]>([]);
  const [availableSites, setAvailableSites] = useState<SiteItem[]>([]);
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignScopeKind, setAssignScopeKind] = useState<'global' | 'site'>('global');
  const [assignSiteId, setAssignSiteId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchUsers = useCallback(async (targetPage = 1, searchQuery = search) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const q = new URLSearchParams({
        page: targetPage.toString(),
        limit: '15',
      });
      if (searchQuery.trim()) {
        q.set('search', searchQuery.trim());
      }

      const { data, ok, status } = await apiFetch<{ items: UserItem[]; total: number; page: number }>(`/users?${q.toString()}`);

      if (status === 401) {
        router.push('/login');
        return;
      }

      if (!ok || !data) {
        setErrorMessage('Failed to load users.');
        setLoading(false);
        return;
      }

      setUsersList(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      setErrorMessage('Network error loading users.');
    } finally {
      setLoading(false);
    }
  }, [router, search]);

  useEffect(() => {
    void fetchUsers(1);
  }, [fetchUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const { data, ok, error } = await apiFetch<{ user?: UserItem; message?: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createEmail,
          name: createName,
          password: createPassword,
          isActive: true,
        }),
      });

      if (!ok) {
        setCreateError(error || data?.message || 'Failed to create user');
        setCreateLoading(false);
        return;
      }

      setShowCreateModal(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      void fetchUsers(1);
    } catch {
      setCreateError('Network error creating user');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleDeactivateUser(user: UserItem) {
    if (!confirm(`Are you sure you want to deactivate user ${user.email}? All active sessions will be terminated.`)) {
      return;
    }

    try {
      const { ok, error } = await apiFetch(`/users/${user.id}/deactivate`, {
        method: 'POST',
      });

      if (!ok) {
        alert(`Error: ${error || 'Failed to deactivate user'}`);
        return;
      }

      void fetchUsers(page);
    } catch {
      alert('Network error while deactivating user.');
    }
  }

  async function openRoleAssignmentsModal(user: UserItem) {
    setSelectedUserForRoles(user);
    setAssignError(null);
    try {
      // Fetch user's current assignments
      const assignRes = await apiFetch<{ assignments: AssignmentItem[] }>(`/users/${user.id}/roles`);
      if (assignRes.ok && assignRes.data) {
        setUserAssignments(assignRes.data.assignments);
      }

      // Fetch available roles
      const rolesRes = await apiFetch<{ roles: RoleItem[] }>('/roles');
      if (rolesRes.ok && rolesRes.data) {
        setAvailableRoles(rolesRes.data.roles);
        if (rolesRes.data.roles.length > 0 && rolesRes.data.roles[0]) {
          setAssignRoleId(rolesRes.data.roles[0].id);
        }
      }

      // Fetch available sites
      const sitesRes = await apiFetch<{ sites: SiteItem[] }>('/sites');
      if (sitesRes.ok && sitesRes.data) {
        setAvailableSites(sitesRes.data.sites);
        if (sitesRes.data.sites.length > 0 && sitesRes.data.sites[0]) {
          setAssignSiteId(sitesRes.data.sites[0].id);
        }
      }
    } catch {
      setAssignError('Error loading role assignments metadata.');
    }
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserForRoles || !assignRoleId) return;

    setAssignLoading(true);
    setAssignError(null);

    try {
      const body: { roleId: string; scopeKind: 'global' | 'site'; scopeId?: string | null } = {
        roleId: assignRoleId,
        scopeKind: assignScopeKind,
        scopeId: assignScopeKind === 'site' ? assignSiteId : null,
      };

      const { ok, error } = await apiFetch(`/users/${selectedUserForRoles.id}/roles`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!ok) {
        setAssignError(error || 'Failed to assign role');
        setAssignLoading(false);
        return;
      }

      // Refresh assignments
      const refreshRes = await apiFetch<{ assignments: AssignmentItem[] }>(`/users/${selectedUserForRoles.id}/roles`);
      if (refreshRes.ok && refreshRes.data) {
        setUserAssignments(refreshRes.data.assignments);
      }
    } catch {
      setAssignError('Network error while assigning role.');
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!selectedUserForRoles) return;
    if (!confirm('Are you sure you want to remove this role assignment?')) return;

    try {
      const { ok, error } = await apiFetch(`/users/${selectedUserForRoles.id}/roles/${assignmentId}`, {
        method: 'DELETE',
      });

      if (!ok) {
        alert(`Error: ${error || 'Failed to remove role assignment'}`);
        return;
      }

      // Refresh assignments
      const refreshRes = await apiFetch<{ assignments: AssignmentItem[] }>(`/users/${selectedUserForRoles.id}/roles`);
      if (refreshRes.ok && refreshRes.data) {
        setUserAssignments(refreshRes.data.assignments);
      }
    } catch {
      alert('Network error while removing role assignment.');
    }
  }

  return (
    <main style={{ maxWidth: 1040, margin: '5vh auto', padding: '0 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Navigation Header */}
      <nav style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 24 }}>
        <Link href="/" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Dashboard</Link>
        <Link href="/users" style={{ color: '#0f172a', textDecoration: 'none', fontWeight: 700, borderBottom: '2px solid #0f172a', paddingBottom: 10 }}>Users</Link>
        <Link href="/roles" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Roles</Link>
        <Link href="/content-types" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Content Types</Link>
        <Link href="/content" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 500 }}>Content Entries</Link>
      </nav>

      {/* Header and Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>User Management</h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>Manage administrator and operator accounts across sites.</p>
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
          + Create User
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void fetchUsers(1, search); }}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <button
          onClick={() => void fetchUsers(1, search)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Search
        </button>
      </div>

      {errorMessage && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>
          {errorMessage}
        </div>
      )}

      {/* Users Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Name</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Email</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Status</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Created At</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading users...</td>
              </tr>
            ) : usersList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>No users found.</td>
              </tr>
            ) : (
              usersList.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{u.name}</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: u.isActive ? '#dcfce7' : '#fee2e2',
                        color: u.isActive ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => void openRoleAssignmentsModal(u)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginRight: 8,
                      }}
                    >
                      Roles
                    </button>
                    {u.isActive && (
                      <button
                        onClick={() => void handleDeactivateUser(u)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#fff1f2',
                          border: '1px solid #fecdd3',
                          color: '#be123c',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Total users: {total}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={page <= 1 || loading}
            onClick={() => void fetchUsers(page - 1)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: 13,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: '#334155' }}>Page {page}</span>
          <button
            disabled={usersList.length < 15 || loading}
            onClick={() => void fetchUsers(page + 1)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: 13,
              cursor: usersList.length < 15 ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, width: 440, maxWidth: '90%' }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#0f172a' }}>Create New User</h2>
            {createError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Full Name</label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="John Doe"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Email Address</label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4, boxSizing: 'border-box' }}
                />
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
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Assignment Modal */}
      {selectedUserForRoles && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', padding: 24, borderRadius: 8, width: 560, maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Manage Roles</h2>
                <p style={{ margin: '2px 0 0 0', fontSize: 13, color: '#64748b' }}>{selectedUserForRoles.name} ({selectedUserForRoles.email})</p>
              </div>
              <button
                onClick={() => setSelectedUserForRoles(null)}
                style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {assignError && (
              <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                {assignError}
              </div>
            )}

            {/* Current Assignments List */}
            <h3 style={{ fontSize: 14, color: '#334155', marginBottom: 8 }}>Active Assignments</h3>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 20, overflow: 'hidden' }}>
              {userAssignments.length === 0 ? (
                <p style={{ padding: 16, margin: 0, fontSize: 13, color: '#64748b', textAlign: 'center' }}>No roles currently assigned.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {userAssignments.map((a) => (
                    <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>{a.roleName}</strong>
                        <div style={{ marginTop: 2 }}>
                          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, backgroundColor: a.scopeKind === 'global' ? '#eff6ff' : '#f0fdf4', color: a.scopeKind === 'global' ? '#1d4ed8' : '#15803d', fontWeight: 600 }}>
                            {a.scopeKind === 'global' ? 'GLOBAL' : `SITE: ${a.siteName || a.scopeId}`}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => void handleRemoveAssignment(a.id)}
                        style={{ padding: '4px 8px', border: '1px solid #fecdd3', backgroundColor: '#fff1f2', color: '#be123c', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Add New Assignment Form */}
            <h3 style={{ fontSize: 14, color: '#334155', marginBottom: 8 }}>Assign New Role</h3>
            <form onSubmit={handleAddAssignment} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 16, backgroundColor: '#f8fafc' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Select Role</label>
                <select
                  value={assignRoleId}
                  onChange={(e) => setAssignRoleId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                >
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.isSystem ? '(System)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Scope Kind</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ fontSize: 13 }}>
                    <input
                      type="radio"
                      name="scopeKind"
                      value="global"
                      checked={assignScopeKind === 'global'}
                      onChange={() => setAssignScopeKind('global')}
                    /> GLOBAL
                  </label>
                  <label style={{ fontSize: 13 }}>
                    <input
                      type="radio"
                      name="scopeKind"
                      value="site"
                      checked={assignScopeKind === 'site'}
                      onChange={() => setAssignScopeKind('site')}
                    /> SITE
                  </label>
                </div>
              </div>

              {assignScopeKind === 'site' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Select Target Site</label>
                  <select
                    value={assignSiteId}
                    onChange={(e) => setAssignSiteId(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 4 }}
                  >
                    {availableSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={assignLoading}
                style={{ width: '100%', padding: '9px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: 13, cursor: assignLoading ? 'not-allowed' : 'pointer' }}
              >
                {assignLoading ? 'Assigning...' : 'Assign Role'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

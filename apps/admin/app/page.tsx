'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  session: {
    id: string;
    expiresAt: string;
  };
  grants: Array<{
    permission: string;
    scopeKind: string;
    scopeId: string | null;
  }>;
}

export default function ProtectedAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authData, setAuthData] = useState<AuthMeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

    fetch(`${apiBase}/auth/me`, {
      method: 'GET',
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) {
          router.push('/login');
          return null;
        }
        return res.json() as Promise<AuthMeResponse>;
      })
      .then((data) => {
        if (data) {
          setAuthData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

    try {
      await fetch(`${apiBase}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '10vh auto', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>M2 · Protected Admin</p>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 24, color: '#0f172a' }}>Admin CMS</h1>
        </div>
        {authData && (
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              padding: '8px 14px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
            }}
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ marginTop: 24, padding: 20, color: '#64748b' }}>
          <p>Verifying authenticated session...</p>
        </div>
      ) : (
        <div style={{ marginTop: 24, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#334155' }}>Authenticated User Information</h2>
          <p style={{ margin: '6px 0', fontSize: 14 }}><strong>Name:</strong> {authData?.user.name}</p>
          <p style={{ margin: '6px 0', fontSize: 14 }}><strong>Email:</strong> {authData?.user.email}</p>
          <p style={{ margin: '6px 0', fontSize: 14 }}><strong>User ID:</strong> {authData?.user.id}</p>
          <p style={{ margin: '6px 0', fontSize: 14 }}><strong>Session Expires At:</strong> {authData?.session.expiresAt}</p>
          <p style={{ margin: '6px 0', fontSize: 14 }}><strong>Effective Grants Count:</strong> {authData?.grants.length}</p>
        </div>
      )}
    </main>
  );
}

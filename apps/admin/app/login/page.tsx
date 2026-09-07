'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include', // sends and stores HttpOnly cookie
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setErrorMessage('Invalid email or password.');
        } else if (res.status === 429) {
          setErrorMessage('Too many login attempts. Please wait 1 minute.');
        } else {
          setErrorMessage('Server error. Please try again later.');
        }
        setLoading(false);
        return;
      }

      // Login success -> redirect to protected admin dashboard
      router.push('/');
      router.refresh();
    } catch {
      setErrorMessage('Network error: Unable to connect to API server.');
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 32, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Modular Website Platform
        </p>
        <h1 style={{ marginTop: 8, marginBottom: 24, fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
          Admin Sign In
        </h1>

        {errorMessage && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              color: '#991b1b',
              fontSize: 14,
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email-input"
              style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}
            >
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@platform.example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password-input"
              style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#334155', marginBottom: 6 }}
            >
              Password
            </label>
            <input
              id="password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: loading ? '#94a3b8' : '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  );
}

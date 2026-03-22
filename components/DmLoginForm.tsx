'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchJson } from '@/lib/client-fetch';

export function DmLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await fetchJson('/api/dm/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      router.push('/dm');
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Could not log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell landing-shell">
      <section className="hero-card narrow-card">
        <p className="eyebrow">DM Access</p>
        <h1>Enter the control room.</h1>
        <p className="lede">The admin side lets you edit missions, manage story arcs, and open or cancel table votes.</p>

        <form className="stack-md" onSubmit={handleSubmit}>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter the DM password"
              required
            />
          </label>

          {error ? <div className="banner banner-error">{error}</div> : null}

          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Opening…' : 'Log in'}
            </button>
            <Link className="button button-secondary" href="/player">
              Back to player view
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

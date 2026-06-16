'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('redirect') || '/crm';
  const notAuthorized = params.get('error') === 'not_authorized';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    notAuthorized ? 'Your account is not authorized for this platform.' : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message || 'Sign in failed');
      setBusy(false);
      return;
    }

    // Full navigation so the Proxy re-evaluates the now-authenticated session
    // and the destination renders with fresh server data.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted uppercase tracking-wide">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-deep-charcoal border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted uppercase tracking-wide">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-deep-charcoal border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold"
        />
      </label>

      {error && (
        <p className="text-xs text-status-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 px-4 py-2 text-sm font-semibold rounded-md bg-gold text-pitch-black hover:bg-gold-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

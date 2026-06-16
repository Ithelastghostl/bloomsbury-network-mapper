import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in · Bloomsbury Network Mapper',
};

// Never prerender — this page reads search params (redirect target / error).
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-pitch-black text-text-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xs font-semibold tracking-widest uppercase text-gold mb-1">
            Bloomsbury Football Foundation
          </h1>
          <h2 className="text-2xl font-semibold text-text-primary">Network Mapper</h2>
          <p className="text-sm text-text-muted mt-2">Sign in to continue</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

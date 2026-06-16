import { createClient } from '@/lib/supabase/server';
import { forbidden } from '@/lib/api-error';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

// Roles permitted to use the platform (kept in sync with src/proxy.ts).
const ALLOWED_ROLES = new Set(['admin', 'engineering_admin']);

/**
 * Page/layout-level auth guard. The Proxy already blocks unauthenticated traffic
 * at the edge, but Next's docs warn Proxy may not cover every Server Function /
 * render path — so data-bearing pages re-verify here as defense in depth.
 * Redirects to /login when there is no authorized user; otherwise returns it.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const role = user.app_metadata?.role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) {
    redirect('/login?error=not_authorized');
  }
  return user;
}

/**
 * Local-mode bypass for the CRM augment routes.
 *
 * These endpoints are driven by the local Claude Code tether, not a logged-in
 * browser user, so in local development there's no admin session to satisfy.
 * Setting CRM_LOCAL_MODE=true skips the admin gate — but ONLY when NODE_ENV is
 * not 'production', so a real deployment can never be opened up by the flag.
 */
function localModeEnabled(): boolean {
  return process.env.CRM_LOCAL_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * Returns a `Response` (403) if the caller is not an admin, or `null` if allowed.
 * Allowed when local mode is on, or when an authenticated admin/engineering_admin
 * user is present.
 *
 * NOTE: this gate IS the authorization layer for the CRM API routes. They all use
 * the Supabase service-role client (`getAdminClient`), which bypasses RLS entirely
 * — so the RLS policies on app.entity_notes / connection_overrides / lead_scores
 * do NOT constrain the app path. They are defense-in-depth for direct SQL/PostgREST
 * access only. Don't drop this check assuming RLS will catch it.
 */
export async function requireAdminOrLocal(): Promise<Response | null> {
  if (localModeEnabled()) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return forbidden('Authentication required');
  const role = user.app_metadata?.role as string | undefined;
  if (role !== 'admin' && role !== 'engineering_admin') {
    return forbidden('Admin role required');
  }
  return null;
}

import { createClient } from '@/lib/supabase/server';
import { forbidden } from '@/lib/api-error';

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

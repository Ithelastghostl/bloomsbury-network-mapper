import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Roles permitted to use the platform. Access is invite-only: signups are
// disabled in Supabase, and approved users are provisioned with one of these
// roles in their app_metadata. Anyone authenticated without an allowed role is
// treated as not authorized.
const ALLOWED_ROLES = new Set(['admin', 'engineering_admin']);

// Paths reachable without a session. Everything else requires an authorized
// user. `/auth/*` carries the sign-out handler; `/login` is the sign-in page.
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/auth' ||
    pathname.startsWith('/auth/')
  );
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const role = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  const authorized = !!user && typeof role === 'string' && ALLOWED_ROLES.has(role);

  if (isPublicPath(pathname)) {
    // Already signed in and authorized → skip the login page.
    if (authorized && pathname === '/login') {
      return NextResponse.redirect(new URL('/crm', request.url));
    }
    return response;
  }

  if (!user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (!authorized) {
    // Authenticated but not on the allowlist — bounce to login with a notice.
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'not_authorized');
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on every route (so /api and the static public/ docs are gated too),
  // except Next's build assets and the favicon. Auth cookies still refresh on
  // matched routes; login/auth paths are allowed through in the handler above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

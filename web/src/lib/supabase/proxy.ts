import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on the incoming request and returns both
 * the response (carrying any rotated auth cookies) and the resolved user.
 *
 * This runs inside the Next.js Proxy (the file convention formerly called
 * "middleware" — renamed in Next 16). Because Proxy executes before every route,
 * keeping the session fresh here means Server Components downstream see a valid
 * session. We never trust this alone for authorization — pages re-check via
 * `requireUser()` — but it is the edge gate that keeps unauthenticated traffic
 * out entirely.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the token against Supabase Auth — do not switch to
  // getSession() here, which only reads the (spoofable) cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}

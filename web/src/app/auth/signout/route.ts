import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /auth/signout — clears the Supabase session cookies and returns to login.
// Triggered by the sign-out form in the sidebar. The server client's signOut()
// writes the cleared auth cookies via next/headers, so the redirect response
// lands the user fully signed out.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}

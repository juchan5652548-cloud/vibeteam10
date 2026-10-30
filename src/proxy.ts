import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresh cookies before rendering the protected page. Authorization is also
// checked inside the page and each data handler; Proxy alone is not sufficient.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return NextResponse.redirect(new URL('/?login=1', request.url));
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items)
          response.cookies.set(name, value, options);
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: init?.signal ?? AbortSignal.timeout(10000),
        }),
    },
  });
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      const redirect = NextResponse.redirect(new URL('/?login=1', request.url));
      for (const cookie of response.cookies.getAll())
        redirect.cookies.set(cookie);
      return redirect;
    }
  } catch {
    return NextResponse.redirect(new URL('/?login=1', request.url));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/my/:path*', '/admin/:path*'] };

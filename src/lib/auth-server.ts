import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function authConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

// Only Route Handlers use this client. Tokens stay in HttpOnly cookies;
// every data request is verified with Auth and also constrained by database RLS.
export async function authClient(readOnly = false) {
  if (!authConfigured()) throw new Error('AUTH_NOT_CONFIGURED');
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          if (readOnly) return;
          for (const { name, value, options } of items)
            jar.set(name, value, options);
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
    },
  );
}

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

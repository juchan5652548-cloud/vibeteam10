import { NextResponse } from 'next/server';
import { authClient, authConfigured } from '@/lib/auth-server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (authConfigured() && url.searchParams.get('code')) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(
        url.searchParams.get('code')!,
      );
      if (!error) {
        const next = new URL('/', url.origin);
        if (url.searchParams.get('recovery') === '1')
          next.searchParams.set('reset', '1');
        return NextResponse.redirect(next, {
          headers: {
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }
    } catch {
      /* Show a safe retry screen through the login dialog. */
    }
  }
  return NextResponse.redirect(new URL('/?auth_error=1', url.origin), {
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

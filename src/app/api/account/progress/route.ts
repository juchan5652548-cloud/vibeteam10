import { GET as getAccount } from '../route';
import { privateHeaders } from '@/lib/auth-server';

export async function GET() {
  const response = await getAccount();
  if (!response.ok) return response;
  const body = await response.json();
  if (!body.user)
    return Response.json(
      { error: '로그인이 필요해요.' },
      { status: 401, headers: privateHeaders },
    );
  return Response.json(
    { progress: body.progress },
    { headers: privateHeaders },
  );
}

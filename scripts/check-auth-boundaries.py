"""Read-only auth boundaries plus rejected writes; no accounts or emails created."""
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3100'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


opener = urllib.request.build_opener(NoRedirect)


def request(path, payload=None, origin=base):
    req = urllib.request.Request(
        base + path,
        data=None if payload is None else payload.encode(),
        headers={'Origin': origin, 'Content-Type': 'application/json'},
    )
    try:
        with opener.open(req, timeout=20) as response:
            return response.status, response.headers, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read().decode()


status, headers, _ = request('/my')
assert status == 307 and '/?login=1' in headers.get('Location', ''), status
status, _, _ = request('/api/account/progress')
assert status == 401, status
cases = [
    ('anonymous bookmark', '/api/account', '{"questionId":"E001","saved":true}', base, 401),
    ('foreign origin', '/api/auth', '{"action":"logout"}', 'https://example.com', 403),
    ('invalid credentials format', '/api/auth', '{"action":"login","email":"bad","password":"x"}', base, 400),
    ('extra field', '/api/auth', '{"action":"logout","userId":"forged"}', base, 400),
    ('oversized input', '/api/auth', 'x' * 2049, base, 413),
    ('invalid choice', '/api/practice/check', '{"questionId":"E001","choiceId":"Z"}', base, 400),
]
for name, path, payload, origin, expected in cases:
    status, _, _ = request(path, payload, origin)
    assert status == expected, (name, status)
print('PASS: protected page redirect, protected API 401, rejected anonymous writes, Origin, format, extra fields, size and choice validation')
status, _, body = request('/api/account')
assert status == 200 and json.loads(body)['configured'] is True
print('PASS: Supabase configuration detected; this does not test successful login')

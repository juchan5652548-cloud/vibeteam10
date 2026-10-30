"""Check original question data, optionally all guest grading routes (no DB writes)."""
import argparse
import collections
import json
from pathlib import Path
import re
import subprocess
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', help='Local app URL; no cookies or account writes')
parser.add_argument('--baseline', help='Git revision whose existing questions must remain identical')
parser.add_argument('--per-track', type=int, default=300)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
files = ['data/questions/enterprise-v1.json', 'data/questions/hospital-public-v1.json']
questions = [q for name in files for q in json.loads((root / name).read_text(encoding='utf-8-sig'))['questions']]
by_id = {q['id']: q for q in questions}
assert len(by_id) == len(questions), 'Duplicate IDs'
assert collections.Counter(q['track'] for q in questions) == {
    'enterprise': args.per_track, 'public_ncs': args.per_track, 'hospital': args.per_track,
}, 'Unexpected track counts'
assert set(by_id) == {f'{prefix}{i:03}' for prefix in 'EPH' for i in range(1, args.per_track + 1)}
seen = set()
for q in questions:
    assert q['track'] == {'E': 'enterprise', 'P': 'public_ncs', 'H': 'hospital'}[q['id'][0]], q['id']
    for field in ['area', 'subtype', 'passage', 'prompt', 'explanation']:
        assert isinstance(q[field], str) and q[field].strip(), (q['id'], field)
        assert '\ufffd' not in q[field], (q['id'], 'encoding')
    assert q['origin_type'] == 'original_practice', q['id']
    assert q['difficulty'] in ['easy', 'medium'], q['id']
    assert len(q['choices']) == 4, q['id']
    assert {c['id'] for c in q['choices']} == set('ABCD'), q['id']
    assert q['answer_id'] in 'ABCD', q['id']
    assert len({c['text'].strip() for c in q['choices']}) == 4, q['id']
    signature = re.sub(r'\s+', '', q['passage'] + q['prompt'])
    assert signature not in seen, (q['id'], 'duplicate passage + prompt')
    seen.add(signature)
    for c in q['choices']:
        assert c['text'].strip() and c['feedback'].strip(), (q['id'], c['id'])
        assert (c['misconception_tag'] is None) == (c['id'] == q['answer_id']), (q['id'], c['id'])
        if int(q['id'][1:]) > 12:
            assert len(c['feedback']) >= 12, (q['id'], 'feedback too short')
    if int(q['id'][1:]) > 12:
        assert len({c['feedback'] for c in q['choices']}) == 4, (q['id'], 'repeated feedback')

if args.baseline:
    previous = []
    for name in files:
        raw = subprocess.check_output(['git', 'show', f'{args.baseline}:{name}'], cwd=root)
        previous.extend(json.loads(raw.decode('utf-8-sig'))['questions'])
    assert all(by_id.get(q['id']) == q for q in previous), 'Existing question was altered'
    print(f'PASS: {len(previous)} baseline questions preserved')

print(f'PASS: {len(questions)} questions, {args.per_track} per track; IDs, choices, answer links, feedback and duplicates')
for track in ['enterprise', 'public_ncs', 'hospital']:
    group = [q for q in questions if q['track'] == track]
    print(track, dict(collections.Counter(q['area'] for q in group)))

if args.base:
    base = args.base.rstrip('/')
    checked = 0
    for q in questions:
        for choice in q['choices']:
            payload = json.dumps({'questionId': q['id'], 'choiceId': choice['id']}).encode()
            req = urllib.request.Request(base + '/api/practice/check', data=payload, headers={
                'Origin': base, 'Content-Type': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=20) as response:
                assert response.status == 200, q['id']
                body = json.load(response)
            assert body['correct'] == (choice['id'] == q['answer_id']), q['id']
            assert body['answerId'] == q['answer_id'], q['id']
            assert body['feedback'] == choice['feedback'], q['id']
            assert body['explanation'] == q['explanation'], q['id']
            checked += 1
    print(f'PASS: {checked} guest grading responses; no account cookies supplied')

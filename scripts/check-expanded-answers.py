"""Independently solve calculable new questions from their displayed text.

Does not import the authoring script or use its parameters/answer calculation.
Language/ethics judgments require editorial review; structural checks live in
check-question-bank.py. No network or account writes.
"""
import itertools
import json
import re
from fractions import Fraction as F
from pathlib import Path

root = Path(__file__).resolve().parents[1]
questions = [q for p in (root/'data/questions').glob('*.json')
             for q in json.loads(p.read_text(encoding='utf-8-sig'))['questions']
             if int(q['id'][1:]) > 50]


def solve(q):
    passage, subtype = q['passage'], q['subtype']
    nums = [int(v) for v in re.findall(r'\d+', passage)]
    if subtype == '연속 비율 변화':
        base, increase, decrease = nums
        # Percentage-point subtraction must differ from successive bases.
        return F(base*(100+increase)*(100-decrease),10000), '건'
    if subtype == '가중평균':
        a,x,b,y = nums
        return F(a*x+b*y,a+b), '점'
    if subtype == '공동 작업':
        a,b = nums
        # Find a duration whose completed fractions sum to one.
        durations = [h for h in range(1,max(a,b)) if F(h,a)+F(h,b)==1]
        assert len(durations)==1
        return durations[0], '시간'
    if subtype == '비율 배분':
        total,a,b = nums
        return F(total*b,a+b), '부'
    if subtype == '포함과 배제':
        a,b,both = nums
        # Build disjoint regions, not the authoring formula.
        return (a-both)+(b-both)+both, '명'
    if subtype == '정수 인력 배치':
        people,capacity = nums
        return next(count for count in range(people+1) if count*capacity>=people), '개'
    if subtype == '평균 역산':
        average,last = nums
        return 5*average-last, '건'
    if subtype == '증가율 비교':
        rows = re.findall(r'([ABC]): (\d+) → (\d+)',passage)
        rates = {name:F(int(new),int(old))-1 for name,old,new in rows}
        maximum = max(rates.values())
        assert list(rates.values()).count(maximum)==1
        return max(rates,key=rates.get), None
    if subtype == '누적값 차분':
        first,second,third = [int(v) for v in re.findall(r'누적 처리량은 (\d+)건|말은 (\d+)건',passage) for v in v if v]
        return third-second, '건'
    if subtype == '목표 달성률':
        target,actual = nums[:2]
        return F(actual*100,target), '%'
    if subtype == '부분집합 비율':
        total,selected,completed = nums
        return F(completed*100,selected), '%'
    if subtype == '중앙값':
        values = nums
        assert len(values)==5
        return sorted(values)[len(values)//2], '명'
    if subtype == '가중 평가':
        a,b,c,d,w1,w2 = nums
        diff = F((a-c)*w1+(b-d)*w2,100)
        assert diff>0
        return f'A가 {diff}점 높다', None
    if subtype == '등차수열':
        assert len(set(b-a for a,b in zip(nums,nums[1:])))==1
        return 2*nums[-1]-nums[-2], ''
    if subtype == '명시된 반복 규칙':
        multiplier,offset,*values = nums
        assert all(b==a*multiplier+offset for a,b in zip(values,values[1:]))
        return values[-1]*multiplier+offset, ''
    if subtype == '선후관계':
        edges = re.findall(r'([^\n]+업무)는 ([^\n]+업무)보다 먼저 한다',passage)
        names = set(itertools.chain.from_iterable(edges))
        possible = [p for p in itertools.permutations(names) if all(p.index(a)<p.index(b) for a,b in edges)]
        assert len(possible)==1
        return possible[0][2], None
    if subtype == '자원 제약 최적화':
        budget = nums[0]
        rows = [(name,int(cost),int(benefit)) for name,cost,benefit in re.findall(r'([ABC]): 비용 (\d+)만원·효과 (\d+)점',passage)]
        candidates = []
        for bits in itertools.product([0,1],repeat=3):
            if sum(row[1]*b for row,b in zip(rows,bits))<=budget:
                candidates.append((sum(row[2]*b for row,b in zip(rows,bits)),bits))
        best = max(score for score,_ in candidates)
        winners = [bits for score,bits in candidates if score==best]
        assert len(winners)==1
        return '와 '.join(row[0] for row,b in zip(rows,winners[0]) if b), None
    if subtype == '최종 시각 역산':
        hour,minute,setup,travel = nums
        # Enumerate feasible departure minutes; verify the latest one.
        latest = max(m for m in range(24*60) if m+setup+travel<=hour*60+minute)
        return f'{latest//60:02}:{latest%60:02}', None
    return None


checked = 0
for question in questions:
    expected = solve(question)
    if expected is None:
        continue
    answer,unit = expected
    selected = next(c for c in question['choices'] if c['id']==question['answer_id'])['text']
    if unit is None:
        assert selected==answer, (question['id'],selected,answer)
    else:
        assert not unit or selected.endswith(unit)
        number = selected[:-len(unit)] if unit else selected
        assert F(number)==answer, (question['id'],selected,answer)
    checked += 1
assert checked==500, checked
print(f'PASS: {checked} new numerical/ordering/optimization answers independently solved from displayed passages')

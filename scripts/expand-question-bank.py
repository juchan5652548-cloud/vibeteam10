"""Reproduce 750 original practice variants; preserve the first 50 per track.

25 reasoning families x 10 parameter/context variants x 3 tracks.
All situations are fictional. No clinical, legal or external factual knowledge
is required. This checks construction, not expert psychometric validity.
"""
import collections
import itertools
import json
import random
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRACKS = [
    ('E', 'enterprise', ['기획팀', '생산팀', '영업팀', '인사팀', '물류팀', '교육팀', '품질팀', '개발팀', '구매팀', '지원팀'], '응용수리', '언어', '추리'),
    ('P', 'public_ncs', ['민원지원팀', '문화사업팀', '시설운영팀', '교육지원팀', '교통지원팀', '도서관운영팀', '환경사업팀', '지역협력팀', '체육시설팀', '행정지원팀'], '수리', '의사소통', '문제해결'),
    ('H', 'hospital', ['외래접수팀', '예약지원팀', '검진안내팀', '원무지원팀', '시설지원팀', '교육행정팀', '물품관리팀', '고객안내팀', '문서관리팀', '인사행정팀'], '수리', '의사소통', '문제해결'),
]


def fmt(value):
    value = Fraction(value)
    return str(value.numerator) if value.denominator == 1 else f'{float(value):g}'


def numeric(answer, wrong, unit, explanation, tag):
    """Keep distractors distinct, meaningful, and individually explained."""
    assert len({Fraction(answer), *(Fraction(v) for v, _ in wrong)}) == 4
    return [(fmt(answer) + unit, explanation, None)] + [
        (fmt(value) + unit, reason, tag) for value, reason in wrong
    ]


def family(k, v, t):
    prefix, track, teams, math, language, logic = TRACKS[t]
    team = teams[v]
    n = v + 2 + 11 * t
    context = f'가상 {team}의 업무 자료다. '
    area, subtype = math, ''
    if k == 0:
        subtype = '연속 비율 변화'
        base, rate = 200 * (n + 4), 15 + 5 * (v % 3)
        after = base * Fraction(100 + rate, 100)
        answer = after * Fraction(90, 100)
        passage = context + f'이번 주 처리 목표는 {base}건이다. 다음 주에는 이보다 {rate}% 늘리고, 그다음 주에는 다음 주 목표보다 10% 줄인다.'
        prompt = '그다음 주 처리 목표는 몇 건인가?'
        exp = f'다음 주는 {base}×{fmt(Fraction(100+rate,100))}={fmt(after)}건이다. 여기에 0.9를 곱하면 {fmt(answer)}건이다.'
        choices = numeric(answer, [(base, '두 번의 비율 변화를 모두 무시한 값이다. 각 주의 목표를 차례로 계산해야 한다.'), (base * Fraction(90 + rate, 100), '증가율과 감소율을 단순히 더하면 안 된다. 감소의 기준은 늘어난 다음 주 목표다.'), (after, '한 번 늘린 다음 주 목표다. 그다음 주의 10% 감소를 아직 반영하지 않았다.')], '건', exp, '비율의 기준값')
    elif k == 1:
        subtype = '가중평균'
        a, b, x, y = n + 3, 2 * (n + 3), 60 + v, 84 + v
        answer = Fraction(a*x+b*y, a+b)
        passage = context + f'교육 A반 {a}명의 평균 점수는 {x}점, B반 {b}명의 평균 점수는 {y}점이다. 두 반에 중복 인원은 없다.'
        prompt = '전체 참여자의 평균 점수는?'
        exp = f'전체 점수 합은 {a}×{x}+{b}×{y}={a*x+b*y}점이다. 전체 {a+b}명으로 나누면 {fmt(answer)}점이다.'
        choices = numeric(answer, [(Fraction(x+y,2), '인원수가 다른 두 반의 평균을 단순 평균한 값이다. 각 반 인원으로 가중해야 한다.'), (x, 'A반 평균만 적용했다. 전체 평균에는 B반 점수와 인원도 포함해야 한다.'), (y, 'B반 평균만 적용했다. 전체에는 평균이 더 낮은 A반도 포함되므로 이 값보다 작다.')], '점', exp, '인원 가중치')
    elif k == 2:
        subtype = '공동 작업'
        a, b = 3 * n, 6 * n
        answer = 2 * n
        assert Fraction(1,a)+Fraction(1,b) == Fraction(1,answer)
        passage = context + f'같은 자료 정리를 A는 혼자 {a}시간, B는 혼자 {b}시간에 끝낸다. 두 사람은 일정한 속도로 중복 작업 없이 함께 일한다.'
        prompt = '함께 끝내는 데 걸리는 시간은?'
        exp = f'시간당 작업률은 1/{a}+1/{b}=1/{answer}이다. 전체 1을 이 작업률로 나누면 {answer}시간이다.'
        choices = numeric(answer, [(a, 'A 혼자 걸리는 시간이다. B도 함께 일하므로 완료 시간은 이보다 짧다.'), (Fraction(a+b,2), '완료 시간을 평균하면 안 된다. 시간당 작업량을 더한 뒤 역수를 구해야 한다.'), (a+b, '혼자 걸리는 시간을 더한 값이다. 동시 작업에서는 작업률을 더한다.')], '시간', exp, '작업률 합산')
    elif k == 3:
        subtype = '비율 배분'
        scale, a, b = n + 4, v % 3 + 2, v % 3 + 5
        total = scale * (a+b)
        passage = context + f'안내 책자 {total}부를 A창구와 B창구에 {a}:{b}로 나누며 남는 책자는 없다.'
        prompt = 'B창구에 배정할 책자는 몇 부인가?'
        answer = scale*b
        exp = f'비율의 합은 {a+b}이다. 한 비율 단위는 {total}÷{a+b}={scale}부이고 B는 {scale}×{b}={answer}부다.'
        choices = numeric(answer, [(scale*a, 'A창구에 배정할 양이다. 물어본 B창구에는 더 큰 비율을 적용해야 한다.'), (total, '전체 책자 수다. 두 창구에 배분하므로 B에 전체를 줄 수 없다.'), (scale, '비율 한 단위의 양이다. B의 비율만큼 곱해야 한다.')], '부', exp, '부분과 전체의 비')
    elif k == 4:
        subtype = '포함과 배제'
        a, b, both = 20+n, 15+n, 4+v
        answer = a+b-both
        passage = context + f'교육 신청자 중 A과정 신청자는 {a}명, B과정 신청자는 {b}명이며 두 과정 모두 신청한 사람은 {both}명이다.'
        prompt = '두 과정 중 적어도 하나를 신청한 사람은 몇 명인가?'
        exp = f'두 과정 신청자 수를 더하면 중복 신청자가 두 번 세어진다. {a}+{b}−{both}={answer}명이다.'
        choices = numeric(answer, [(a+b, '두 과정에 모두 신청한 사람을 두 번 센 값이다. 중복 인원을 한 번 빼야 한다.'), (a+b-2*both, '한 과정만 신청한 사람 수다. 적어도 하나에는 두 과정 모두 신청한 사람도 포함한다.'), (both, '두 과정에 모두 신청한 사람 수만 센 것이다. 한 과정만 신청한 사람도 포함해야 한다.')], '명', exp, '합집합의 중복 제거')
    elif k == 5:
        subtype = '정수 인력 배치'
        people, capacity = 7*n+3, 7
        answer = (people+capacity-1)//capacity
        assert (answer-1)*capacity < people <= answer*capacity
        passage = context + f'행사 참가자는 {people}명이다. 한 안내 조는 최대 {capacity}명을 담당한다. 모든 참가자를 배정하고 각 조의 정원을 넘기지 않는다.'
        prompt = '필요한 안내 조의 최소 개수는?'
        exp = f'{people}=7×{n}+3이므로 {n}개 조로는 3명이 남는다. 한 조를 더 두어 최소 {answer}개 조가 필요하다.'
        choices = numeric(answer, [(n, '나머지 3명을 배정할 곳이 없다. 나눗셈에서 남는 인원에도 한 조가 필요하다.'), (n+2, '모든 인원을 배정할 수는 있지만 한 조가 더 많아 최소 조건을 만족하지 않는다.'), (people, '한 명마다 한 조를 둘 필요는 없다. 한 조에 최대 7명까지 배정할 수 있다.')], '개', exp, '올림과 최소 조건')
    elif k == 6:
        subtype = '평균 역산'
        mean, count, last = 30+n, 4, 38+n
        answer = mean*5-last
        passage = context + f'월요일부터 금요일까지 하루 평균 처리량은 {mean}건이며 금요일 처리량은 {last}건이다.'
        prompt = '월요일부터 목요일까지의 총처리량은?'
        exp = f'5일 합계는 {mean}×5={mean*5}건이다. 금요일 {last}건을 빼면 {answer}건이다.'
        choices = numeric(answer, [(mean*4, '전체 평균을 앞의 4일 평균으로 잘못 적용했다. 금요일이 전체 평균보다 높다는 점을 반영해야 한다.'), (mean*5, '금요일을 포함한 5일 합계다. 앞의 4일만 구하려면 금요일 처리량을 뺀다.'), (mean*5+last, '5일 합계에 이미 포함된 금요일 값을 다시 더했다. 제외하려면 빼야 한다.')], '건', exp, '평균과 합계')
    elif k == 7:
        area, subtype = '자료해석', '증가율 비교'
        base = 100*(n+1)
        rows = [(base, base*12//10), (base*2, base*23//10), (base*3, base*39//10)]
        passage = context + '세 사업의 전기·당기 처리량(건)은 다음과 같다.\n' + '\n'.join(f'{name}: {x} → {y}' for name,(x,y) in zip('ABC',rows))
        prompt = '전기 대비 증가율이 가장 높은 사업은?'
        exp = '증가율은 증가량÷전기 값이다. A는 20%, B는 15%, C는 30%이므로 C가 가장 높다.'
        choices = [('C', exp, None), ('A', 'A의 증가율은 20%다. C의 30%보다 작으므로 가장 높지 않다.', '증가율의 분모'), ('B', 'B의 증가율은 15%다. 당기 값이 크다고 증가율도 가장 높은 것은 아니다.', '증가량과 증가율'), ('세 사업이 같다', '세 증가율은 각각 20%, 15%, 30%로 서로 다르다. 전기 값으로 나누어 비교해야 한다.', '증가율 비교')]
    elif k == 8:
        area, subtype = '자료해석', '누적값 차분'
        a, b, c = 20+n, 30+2*n, 45+3*n
        passage = context + f'1월 말 누적 처리량은 {a}건, 2월 말은 {a+b}건, 3월 말은 {a+b+c}건이다. 연초부터 누적하며 취소는 없다.'
        prompt = '3월 한 달 동안의 처리량은?'
        exp = f'3월 말 누적값에서 2월 말 누적값을 뺀다. {a+b+c}−{a+b}={c}건이다.'
        choices = numeric(c, [(a+b+c, '1월부터 3월까지 누적한 합계다. 3월 한 달 분량과 구분해야 한다.'), (b+c, '3월 말에서 1월 말을 뺀 값으로 2월과 3월을 모두 포함한다.'), (b, '2월 한 달 동안의 처리량이다. 3월 값은 3월 말과 2월 말의 차이다.')], '건', exp, '누적과 기간값')
    elif k == 9:
        area, subtype = '자료해석', '목표 달성률'
        target, actual = 20*n, 23*n
        passage = context + f'이번 달 목표는 {target}건이고 실제 완료는 {actual}건이다. 달성률은 실제 완료÷목표×100으로 정의한다.'
        prompt = '목표 달성률은?'
        exp = f'{actual}÷{target}×100=115%다. 15%는 목표를 초과한 비율이며 달성률과 다르다.'
        choices = numeric(115, [(15, '목표를 초과한 부분의 비율이다. 달성률에는 목표에 해당하는 100%도 포함한다.'), (100, '실제 완료량이 목표보다 많으므로 달성률은 100%보다 커야 한다.'), (85, '목표 초과를 미달로 처리한 값이다. 실제 완료를 목표로 나누어야 한다.')], '%', exp, '달성률과 초과율')
    elif k == 10:
        area, subtype = '자료해석', '부분집합 비율'
        all_count, selected, finished = 100*n, 40*n, 30*n
        passage = context + f'전체 {all_count}건 중 온라인 접수가 {selected}건이다. 온라인 접수 중 완료가 {finished}건이다.'
        prompt = '온라인 접수만을 기준으로 한 완료 비율은?'
        exp = f'기준 집단은 온라인 접수 {selected}건이다. {finished}÷{selected}×100=75%다.'
        choices = numeric(75, [(30, '완료 건수를 전체 접수로 나눈 비율이다. 이 문제의 분모는 온라인 접수다.'), (40, '온라인 접수가 전체에서 차지하는 비율이다. 온라인 내부의 완료 비율과 다르다.'), (25, '온라인 접수 중 미완료 비율이다. 문제는 완료 비율을 묻는다.')], '%', exp, '기준 집단 선택')
    elif k == 11:
        area, subtype = '자료해석', '중앙값'
        values = [n+5, n+1, n+12, n+3, n+7]
        answer = sorted(values)[2]
        passage = context + f'다섯 창구의 대기 인원은 각각 {", ".join(map(str, values))}명이다. 중앙값은 크기순으로 정렬했을 때 가운데 값이다.'
        prompt = '대기 인원의 중앙값은?'
        exp = f'작은 값부터 정렬하면 {", ".join(map(str,sorted(values)))}명이다. 세 번째 값 {answer}명이 중앙값이다.'
        choices = numeric(answer, [(values[2], '정렬 전 세 번째 값을 고르면 안 된다. 먼저 크기순으로 정렬해야 한다.'), (min(values), '최솟값이다. 다섯 자료의 중앙값은 정렬 후 세 번째 값이다.'), (n+3, '정렬 후 두 번째 값이다. 다섯 자료에서 가운데 위치는 세 번째다.')], '명', exp, '정렬 후 중앙값')
    elif k == 12:
        area, subtype = '자료해석', '가중 평가'
        weight = 60
        a, b = (70+v,90+v), (80+v,70+v)
        sa, sb = Fraction(3*a[0]+2*a[1],5), Fraction(3*b[0]+2*b[1],5)
        assert sa-sb == 2
        passage = context + f'제안 A의 품질·납기 점수는 {a[0]}점·{a[1]}점, B는 {b[0]}점·{b[1]}점이다. 총점은 품질 60%, 납기 40%를 반영한다.'
        prompt = '가중 총점 비교로 옳은 것은?'
        exp = f'A={a[0]}×0.6+{a[1]}×0.4={fmt(sa)}, B={b[0]}×0.6+{b[1]}×0.4={fmt(sb)}다. A가 2점 높다.'
        choices = [('A가 2점 높다', exp, None), ('B가 2점 높다', '품질 점수만으로 판단하면 안 된다. 납기의 가중 점수를 합하면 A가 더 높다.', '가중 합산'), ('두 제안이 같다', '가중 총점의 차이는 0점이 아니다. 품질과 납기 각각에 가중치를 곱해야 한다.', '가중 합산'), ('A가 10점 높다', '품질과 납기의 단순 합계 차이 10을 사용한 것이다. 가중치를 반영한 차이는 2점이다.', '가중치 누락')]
    elif k == 13 and t > 0:
        area, subtype = '조직이해', '역할과 승인 권한'
        limit = 20+v*5+t*10
        passage = context + f'이 가상 조직의 규정은 다음과 같다. 담당자는 변경안을 작성하고, 팀장은 {limit}만원 이하 변경안을 승인한다. {limit}만원을 초과하면 본부장 승인이 필요하다. 변경액은 {limit+1}만원이며 긴급 예외 규정은 없다.'
        prompt = '규정에 맞는 처리 방법은?'
        exp = f'변경액 {limit+1}만원은 팀장 승인 한도 {limit}만원을 초과한다. 담당자가 변경안을 작성하고 본부장 승인을 받아야 한다.'
        choices = [('담당자가 변경안을 작성하고 본부장 승인을 받는다',exp,None),('담당자가 작성과 최종 승인을 모두 한다','담당자의 권한은 변경안 작성이다. 최종 승인 권한까지 있다고 규정하지 않았다.','역할 경계'),('팀장이 승인한 뒤 본부장 승인 없이 집행한다','변경액이 팀장 승인 한도를 초과한다. 본부장 승인이 필요한 조건에 해당한다.','승인 한도'),('금액을 숨기고 팀장 승인 한도 안으로 표시한다','실제 변경액을 왜곡하면 주어진 승인 절차를 준수할 수 없다. 실제 금액으로 권한을 판단한다.','정확한 보고')]
    elif k == 14 and t > 0:
        area, subtype = '직업윤리', '자료의 목적과 접근 권한'
        document = ['연락처 목록', '상담 신청 명단', '교육 신청 명단', '예약자 목록', '직원 면담 자료', '문의자 명단', '민원 접수 목록', '설문 참여자 명단', '행사 신청 명단', '방문자 목록'][v]
        passage = context + f'이 문제의 내부 규칙은 다음과 같다. {document}은 배정된 업무 목적으로 승인된 담당자만 사용하며, 다른 목적의 이용이나 개인 메신저 전송은 허용하지 않는다. 다른 부서 동료가 사적인 모임 홍보에 쓰겠다며 자료를 보내 달라고 한다.'
        prompt = '내부 규칙에 맞는 대응은?'
        exp = '요청 목적은 승인된 업무 목적이 아니며 개인 메신저 전송도 금지되어 있다. 자료를 보내지 않고 허용 범위와 정식 문의 절차를 안내한다.'
        choices = [('전달하지 않고 목적 제한과 정식 문의 절차를 안내한다',exp,None),('같은 조직 동료이므로 전체 자료를 보낸다','같은 조직에 속한다는 사실만으로 승인되지 않은 목적의 자료 이용 권한이 생기지 않는다.','목적 제한'),('일부 인원의 정보만 골라 개인 메신저로 보낸다','일부만 보내도 다른 목적의 이용과 개인 메신저 전송을 금지한 규칙에 어긋난다.','부분 제공의 오해'),('이용 후 삭제한다는 약속을 받고 보낸다','나중에 삭제한다는 약속은 현재 요청의 목적 제한과 전송 금지를 해제하지 않는다.','사후 삭제와 권한')]
    elif k == 13:
        area, subtype = logic, '등차수열'
        start, step = n+1, v%4+3
        values = [start+i*step for i in range(5)]
        passage = context + f'문서 번호는 처음 번호에 일정한 양의 정수를 계속 더해 만든다.\n{", ".join(map(str,values))}, ( ? )'
        prompt = '다음 번호는?'
        answer = start+5*step
        exp = f'인접한 두 번호의 차이가 모두 {step}이다. 마지막 {values[-1]}에 {step}을 더해 {answer}다.'
        choices = numeric(answer, [(values[-1], '마지막 번호를 그대로 반복한 값이다. 같은 양의 정수를 한 번 더 더해야 한다.'), (answer+step, '두 단계 뒤의 번호다. 빈칸은 마지막 번호에서 한 단계만 진행한다.'), (answer-step*2, '이전 번호로 되돌아간 값이다. 번호는 일정한 양수만큼 증가한다.')], '', exp, '일정한 차이')
    elif k == 14:
        area, subtype = logic, '명시된 반복 규칙'
        start, add = n, v%4+1
        values = [start]
        for _ in range(3):
            values.append(values[-1]*2+add)
        answer = values[-1]*2+add
        passage = context + f'관리 코드는 앞의 수에 2를 곱하고 {add}을 더하는 규칙으로 만든다.\n{", ".join(map(str,values))}, ( ? )'
        prompt = '빈칸에 들어갈 수는?'
        exp = f'명시된 규칙을 마지막 수에 적용하면 {values[-1]}×2+{add}={answer}다.'
        choices = numeric(answer, [(values[-1]*2, '두 배만 하고 마지막 덧셈을 빠뜨렸다. 명시된 규칙의 두 단계를 모두 적용해야 한다.'), (values[-1]+add, '덧셈만 적용했다. 먼저 앞의 수에 2를 곱해야 한다.'), ((values[-1]+add)*2, '덧셈과 곱셈의 순서를 바꾼 값이다. 두 배한 뒤에 더해야 한다.')], '', exp, '연산 순서')
    elif k == 15:
        area, subtype = logic, '선후관계'
        names = [f'{team} {letter}업무' for letter in 'ABCD']
        order = [names[i] for i in [2,0,3,1]]
        constraints = [(order[0], order[1]), (order[1], order[2]), (order[2], order[3])]
        valid = [p for p in itertools.permutations(names) if all(p.index(a)<p.index(b) for a,b in constraints)]
        assert valid == [tuple(order)]
        passage = '네 업무를 겹치지 않게 하나씩 처리한다.\n' + '\n'.join(f'{a}는 {b}보다 먼저 한다.' for a,b in constraints)
        prompt = '세 번째로 처리하는 업무는?'
        exp = f'조건을 연결한 순서는 {" → ".join(order)}다. 세 번째는 {order[2]}다.'
        choices = [(order[2],exp,None),(order[0], '이 업무는 조건상 첫 번째다. 이어지는 선후관계를 끝까지 연결해야 한다.', '선후관계 연결'),(order[1], '이 업무는 두 번째다. 세 번째는 이 업무 다음이면서 마지막 업무 이전에 놓인다.', '순서 위치'),(order[3], '이 업무는 마지막인 네 번째다. 세 번째 업무보다 뒤에 놓인다는 조건을 확인한다.', '순서 위치')]
    elif k == 16:
        area, subtype = logic, '충분조건과 대우'
        label = f'{team}의 자료 {n}호'
        passage = f'이 문제의 규칙은 다음과 같다. 승인된 모든 자료에는 확인 도장이 있다. {label}에는 확인 도장이 없다.'
        prompt = '규칙에 따라 반드시 참인 결론은?'
        exp = '승인되면 도장이 있어야 한다. 도장이 없는 해당 자료는 승인된 자료일 수 없다. 이는 주어진 명제의 대우다.'
        choices = [(f'{label}는 승인되지 않았다',exp,None), (f'{label}는 승인되었다', '도장이 없다는 사실은 승인되면 도장이 있다는 규칙과 함께 승인되었다는 결론을 배제한다.', '대우 적용'), ('도장이 있는 모든 자료는 승인되었다', '승인되면 도장이 있다는 규칙의 역이다. 도장이 있는 미승인 자료의 가능성은 배제되지 않았다.', '역과 대우 혼동'), ('승인되지 않은 자료에는 모두 도장이 없다', '원래 규칙은 미승인 자료의 도장 여부를 정하지 않는다. 원명제의 이가 참이라고 결론 내릴 수 없다.', '이의 오류')]
    elif k == 17:
        area, subtype = logic, '조건부 처리 절차'
        limit = 30+5*v+10*t
        passage = context + f'업무 규칙: 긴급 표시가 있으면 다른 조건과 관계없이 즉시 검토한다. 긴급 표시가 없고 금액이 {limit}만원 이상이면 추가 확인한다. 나머지는 일반 처리한다. 자료 X는 긴급 표시가 없고 금액이 정확히 {limit}만원이다.'
        prompt = '자료 X에 적용할 처리는?'
        exp = f'긴급 표시가 없으므로 두 번째 조건을 본다. 정확히 {limit}만원은 {limit}만원 이상에 포함되므로 추가 확인이다.'
        choices = [('추가 확인',exp,None),('즉시 검토', '즉시 검토는 긴급 표시가 있을 때다. 자료 X에는 긴급 표시가 없다.', '우선 조건'),('일반 처리','기준 금액과 같은 경우도 이상에 포함된다. 일반 처리는 추가 확인 조건에도 해당하지 않을 때다.','경계값 포함'),('처리 규칙이 없다','긴급 여부와 금액 조건으로 처리 결과가 결정된다. 기준 금액과 같은 경우를 제외하지 않는다.','조건 분기')]
    elif k == 18:
        area, subtype = logic, '자원 제약 최적화'
        budget = 12+2*v+2*t
        costs = [budget, budget//2, budget//2]
        benefits = [13+v, 8+v, 9+v]
        feasible = [(sum(benefits[i] for i in comb),comb) for r in range(4) for comb in itertools.combinations(range(3),r) if sum(costs[i] for i in comb)<=budget]
        best = max(feasible)
        assert best[1] == (1,2)
        passage = context + f'예산 한도는 {budget}만원이다. 과제는 각각 한 번만 선택하며 효과는 합산한다.\nA: 비용 {costs[0]}만원·효과 {benefits[0]}점\nB: 비용 {costs[1]}만원·효과 {benefits[1]}점\nC: 비용 {costs[2]}만원·효과 {benefits[2]}점'
        prompt = '예산 안에서 효과 합계가 최대인 선택은?'
        exp = f'B+C는 비용 {budget}만원, 효과 {benefits[1]+benefits[2]}점이다. A 단독 {benefits[0]}점보다 높고 A와 다른 과제를 함께 고르면 예산을 넘는다.'
        choices = [('B와 C',exp,None),('A만','A는 예산에 맞지만 B와 C를 함께 고른 효과 합계가 더 높다. 한 과제의 효과만 비교하면 안 된다.','조합 최적화'),('A와 B','A만으로 예산을 모두 사용하므로 B를 추가하면 예산 한도를 넘는다.','예산 제약'),('C만','C만 선택해도 가능하지만 남는 예산으로 B도 선택할 수 있어 최대 효과가 아니다.','자원 활용')]
    elif k == 19:
        area, subtype = language, '공지의 적용 범위'
        day, start, end = v+10, 9+v%3, 12+v%3
        passage = context + f'{day}일 {start}시부터 {end}시까지 온라인 신청만 중단한다. 방문 신청은 평소대로 운영한다. 온라인으로 이미 접수된 건은 취소하지 않는다.'
        prompt = '공지 내용과 일치하는 것은?'
        exp = '중단 대상은 지정 시간의 온라인 신규 신청이다. 방문 신청은 계속 운영하며 기존 접수를 취소한다는 뜻이 아니다.'
        choices = [('중단 시간에도 방문 신청은 가능하다',exp,None),('모든 신청 방식이 하루 종일 중단된다','온라인 신청만 지정 시간 동안 중단한다. 방식과 시간을 모두 지나치게 확대했다.','범위 확대'),('기존 온라인 접수는 모두 취소된다','지문은 이미 접수된 건을 취소하지 않는다고 명시했다. 신규 신청 중단과 구분한다.','기존 처리와 신규 신청'),('방문 신청도 온라인과 동시에 중단한다','방문 신청은 평소대로 운영한다는 문장과 모순된다. 중단 대상은 온라인 신청뿐이다.','대상 구분')]
    elif k == 20:
        area, subtype = language, '인과 추론의 한계'
        before, after = 15+v+t, 10+v+t
        passage = context + f'안내문을 바꾼 달에 평균 대기시간이 {before}분에서 {after}분으로 줄었다. 같은 달에 창구 인력도 늘었고 신청 건수도 줄었다. 각 변화의 효과를 분리한 분석은 하지 않았다.'
        prompt = '자료에 근거한 가장 타당한 결론은?'
        exp = f'대기시간이 {before-after}분 줄어든 사실은 확인된다. 다른 변화도 동시에 있었으므로 안내문만의 효과 크기는 이 자료로 알 수 없다.'
        choices = [('대기시간은 줄었지만 안내문만의 효과는 분리할 수 없다',exp,None),('대기시간 감소는 전적으로 안내문 변경 때문이다','인력과 신청 건수도 달라졌다. 다른 원인을 통제하지 않아 하나의 변화에만 원인을 돌릴 수 없다.','동시 변화와 인과'),('안내문은 대기시간에 아무 영향도 주지 않았다','효과를 분리하지 못했다는 것은 효과가 없다는 뜻이 아니다. 무효과 역시 단정할 수 없다.','근거 없는 부정'),('앞으로 모든 달에도 같은 폭으로 줄어든다','한 달의 관찰 결과로 미래의 모든 달에 같은 효과가 난다고 일반화할 수 없다.','과도한 일반화')]
    elif k == 21:
        area, subtype = language, '수정 사항 요약'
        old, new = 14+v, 17+v
        passage = context + f'교육 신청 마감일은 이번 달 {old}일에서 {new}일로 변경한다. 시작 시간과 장소는 기존 공지와 같다. 이미 제출한 신청서는 다시 내지 않는다.'
        prompt = '업무 전달용 요약으로 가장 정확한 것은?'
        exp = f'변경은 마감일을 {new}일로 늦춘 것뿐이다. 시간·장소 유지와 기존 신청서 재제출 불필요도 함께 전달해야 한다.'
        choices = [(f'마감 {new}일로 연장, 시간·장소 유지, 기존 신청 재제출 불필요',exp,None),(f'마감 {old}일 유지, 장소만 변경','지문은 마감일 변경과 장소 유지를 명시한다. 변경 대상과 유지 대상을 반대로 요약했다.','변경 대상 구분'),('모든 신청자는 기존 신청서를 취소하고 다시 제출','이미 제출한 신청서는 다시 내지 않는다는 조건과 모순된다. 불필요한 재작업을 지시한다.','예외 조건 누락'),(f'교육 시작일을 {new}일로 변경','변경된 날짜는 신청 마감일이다. 교육 시작일 변경으로 해석할 근거가 없다.','날짜의 역할')]
    elif k == 22:
        area = language if t == 0 else '정보'
        subtype = '정보 필터의 논리곱'
        limit = 40+5*n
        passage = context + f'목록에서 금액이 {limit}만원 이상이면서 상태가 완료인 자료만 선택한다.\nA: {limit-1}만원·완료\nB: {limit}만원·완료\nC: {limit+10}만원·검토 중\nD: {limit+20}만원·취소'
        prompt = '선택되는 자료는?'
        exp = f'두 조건을 동시에 만족해야 한다. B만 {limit}만원 이상이고 완료다. 같은 금액도 이상에 포함된다.'
        choices = [('B만',exp,None),('A와 B','A는 완료이지만 금액이 기준보다 1만원 적다. 상태 조건만으로 선택할 수 없다.','AND 조건'),('B와 C','C는 금액 조건을 충족하지만 상태가 완료가 아니다. 두 조건을 모두 충족해야 한다.','AND 조건'),('C와 D','두 자료 모두 완료 상태가 아니다. 기준 금액과 같은 B는 금액 조건을 충족한다.','경계값과 상태')]
    elif k == 23:
        area = math if t == 0 else '자원관리'
        subtype = '최종 시각 역산'
        end = 14*60+v*5+t*15
        setup, travel = 20+v, 10+t*3
        answer = end-setup-travel
        clock = lambda m: f'{m//60:02}:{m%60:02}'
        passage = context + f'행사는 {clock(end)}에 시작한다. 도착 후 준비에 {setup}분, 이동에 {travel}분이 걸린다. 이동과 준비를 순서대로 하고 중간 대기 없이 시작 시각까지 준비를 끝내야 한다.'
        prompt = '준비를 제시간에 끝내기 위한 가장 늦은 출발 시각은?'
        exp = f'시작에서 준비 {setup}분과 이동 {travel}분을 모두 뺀다. {clock(end)}에서 총 {setup+travel}분 전인 {clock(answer)}다.'
        choices = [(clock(answer),exp,None),(clock(end-setup),'준비 시간만 뺀 시각이다. 이동에도 시간이 걸리므로 더 일찍 출발해야 한다.','역산 단계 누락'),(clock(end-travel),'이동 시간만 뺀 시각이다. 도착 후 준비에 필요한 시간까지 빼야 한다.','역산 단계 누락'),(clock(answer-10),'이 시각에 출발해도 가능하지만 정답보다 10분 일러 가장 늦은 출발 시각은 아니다.','최종 가능 시각')]
    else:
        area = language if t == 0 else '대인관계'
        subtype = '갈등 상황의 확인과 조정'
        item = ['회의실', '교육실', '안내 공간', '상담실', '자료실', '세미나실', '다목적실', '면담실', '작업 공간', '대기 공간'][v]
        passage = context + f'두 팀이 같은 시간에 {item}을 사용하려 한다. 예약 기록에 중복이 있고 우선순위 규정은 아직 확인하지 못했다. 두 팀 모두 예정된 업무가 있다고 설명한다.'
        prompt = '담당자의 첫 대응으로 가장 적절한 것은?'
        exp = '양쪽의 예약 근거와 업무 제약을 확인하고 적용할 규정과 대체안을 함께 검토해야 한다. 확인하지 않은 우선순위를 임의로 적용하지 않는다.'
        choices = [('양쪽 예약 근거와 제약을 확인하고 규정·대체안을 함께 검토한다',exp,None),('목소리가 큰 팀에 즉시 우선권을 준다','발언 강도는 예약 우선권의 근거가 아니다. 양쪽 자료와 적용 규정을 확인해야 한다.','객관적 근거 부족'),('먼저 연락한 팀의 말만 듣고 다른 팀의 일정을 취소한다','중복 기록과 상대 팀의 근거를 확인하지 않았다. 한쪽 주장만으로 취소를 결정하면 안 된다.','일방적 판단'),('문제가 저절로 해결되도록 시작 시각까지 아무 조치도 하지 않는다','확인과 조정을 미루면 양쪽 업무에 차질이 커질 수 있다. 필요한 정보를 모아 조정해야 한다.','갈등 회피')]
    assert len(choices) == 4 and len({c[0] for c in choices}) == 4, (k, v, t)
    return area, subtype, passage, prompt, choices


def generate():
    result = []
    answer_counts = collections.Counter()
    for t, (prefix, track, *_rest) in enumerate(TRACKS):
        for v in range(10):
            for k in range(25):
                number = 51+v*25+k
                area, subtype, passage, prompt, choices = family(k,v,t)
                # Rotate and shuffle distractors deterministically, balanced by track.
                correct = choices[0]
                distractors = choices[1:]
                random.Random(number+1000*t).shuffle(distractors)
                slot = (number-51+t) % 4
                distractors.insert(slot, correct)
                answer = 'ABCD'[slot]
                q = dict(id=f'{prefix}{number:03}', track=track, area=area,
                         subtype=subtype, difficulty='easy' if k in [3,5,11,13,19,21,22,24] else 'medium',
                         passage=passage, prompt=prompt,
                         choices=[dict(id='ABCD'[i],text=c[0],feedback=c[1],misconception_tag=c[2]) for i,c in enumerate(distractors)],
                         answer_id=answer, explanation=correct[1], origin_type='original_practice')
                result.append(q)
                answer_counts[(track,answer)] += 1
    return result, answer_counts


if __name__ == '__main__':
    generated, counts = generate()
    for filename, tracks in [('enterprise-v1.json', ['enterprise']), ('hospital-public-v1.json', ['public_ncs','hospital'])]:
        path = ROOT/'data'/'questions'/filename
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        original = [q for q in data['questions'] if int(q['id'][1:]) <= 50]
        assert len(original) == 50*len(tracks)
        data['questions'] = original + [q for q in generated if q['track'] in tracks]
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Generated 750 practice variants in 25 families per track; preserved existing 150.')
    print(dict(counts))

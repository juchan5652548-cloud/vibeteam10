# JOBFIT AI 로그인과 개인 오답노트

## 연결 구성

2026-10-29 후속 변경: 사용자가 Google Cloud 최초 이용 양식의 상업적 이용 확인에 동의하지 않아 해당 설정을 중단했다. 이후 사용자가 GitHub 간편 로그인 전환과 앱 등록·연결 키 저장을 승인했다. 현재 간편 로그인은 GitHub이며, Supabase 제공자 설정과 `GITHUB_AUTH_ENABLED=true`를 함께 사용한다. 기존 이메일 로그인은 접힌 보조 메뉴에서 계속 이용할 수 있다.

Supabase Auth로 이메일·비밀번호 가입, 로그인·로그아웃, 이메일 확인, 비밀번호 복구를 처리한다. 앱은 관리자 키를 사용하지 않는다. 공개 연결 값 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 필요하다. 실제 비밀번호·토큰은 저장소나 클라이언트 props에 넣지 않는다.

서버 Route Handler에서 Supabase SSR 클라이언트를 사용한다. 세션 쿠키는 HttpOnly, SameSite=Lax이며 Production에서는 Secure다. 브라우저용 Supabase 클라이언트를 만들지 않으므로 인증 토큰을 localStorage에 저장하지 않는다. 새로고침·계정 전환 시 서버에서 사용자를 다시 확인한다.

프로젝트: `jobfit-ai` / 서울 리전. [대시보드](https://supabase.com/dashboard/project/bpkamwzqwvsxundnxshr). Production 연결은 `vibeteam10.vercel.app`에 사용한다. Preview에는 이 DB 환경 변수를 복제하지 않는다.

## 이용 흐름

1. 오른쪽 위 로그인 → GitHub 계정으로 계속하기 → 기본 프로필·이메일 접근 승인. 처음 이용하면 계정을 만들고, 이후에는 같은 계정으로 로그인한다. 이메일 방식은 보조 메뉴에 유지한다.
2. 로그인하면 `/my` 개인 오답노트를 연다. 문제 풀이와 북마크가 내 계정에 저장된다.
3. 오답노트의 ‘내가 고른 답과 해설 보기’에서 선택 답, 정답, 해설, 풀이 시간을 확인한다. 다시 맞히면 해결된다.
4. 로그아웃하면 화면의 개인 기록을 비우고 게스트 화면으로 돌아간다. `/my`를 다시 열면 로그인 화면으로 이동한다. 계정의 DB 기록은 보존한다.

게스트의 기존 브라우저 기록은 보존하지만 계정에 자동으로 합치지 않는다. 계정 기록과 게스트 기록을 같은 저장소에 섞지 않는다. 다른 기기에서는 같은 계정으로 로그인해야 한다. 최근 500회 기록과 최대 200개 북마크를 조회한다.

## 보안 기준별 구현

| 기준        | 근거                                                                                                                     | 처리                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 로그인      | `src/app/api/auth/route.ts`, `src/lib/auth-server.ts`                                                                    | Supabase Auth, 안전한 쿠키, 로그아웃                                                   |
| 로그인 확인 | `src/proxy.ts`, `src/app/my/page.tsx`, `src/app/api/account/progress/route.ts`                                           | 개인 페이지의 서버 세션 확인과 로그인 이동, 비로그인 API 401                           |
| 내 자료만   | `src/lib/account-progress.ts`, `src/app/api/account/route.ts`, `supabase/migrations/20261029070000_account_progress.sql` | 서버에서 검증한 user ID로 조회·저장·삭제, DB RLS로 본인 행만 허용                      |
| 비밀값      | `.env.example`, `src/lib/auth-server.ts`                                                                                 | 공개 publishable 키만 사용, 비밀번호·토큰 응답/로그 제외, 내부 예외 대신 안전한 메시지 |
| 입력        | 인증·계정·채점 API와 `src/lib/limited-json.ts`                                                                           | Zod strict 검증, 본문 크기 제한, Origin 검사, React 일반 텍스트 출력                   |

풀이 기록은 수정·삭제 권한을 주지 않는다. 정답 여부·해설은 저장된 선택지를 기준으로 서버 문제은행에서 다시 계산한다. 로그인한 상태에서는 DB 저장에 실패하면 채점 성공으로 처리하지 않고 다시 시도하도록 안내한다. 요청 UUID로 같은 답안의 재시도 중복 저장을 막는다. 풀이 시간은 사용자가 보내는 학습 참고값이며 부정행위 방지용 측정값이 아니다.

## DB 변경 관리

개인 기록은 Supabase Data API와 RLS로 처리한다. 스키마의 원본은 `supabase/migrations/20261029070000_account_progress.sql`이다. 신규 빈 프로젝트임을 읽기 전용 조회로 확인한 후 SQL Editor에서 하나의 트랜잭션으로 적용했다. 두 테이블의 RLS 활성화도 조회했다.

기존 Prisma User 모델·DB 드라이버는 변경하지 않았다. 이 기능의 테이블을 Prisma 마이그레이션으로 중복 관리하거나 `prisma db push`로 덮어쓰지 않는다. Supabase CLI 마이그레이션 이력 등록은 아직 하지 않았으므로 추후 CLI로 전환할 때 SQL Editor 적용분을 기준선으로 대조해야 한다. 이미 존재하는 DB에 초기 SQL을 재실행하지 않는다.

## 검증

- Node 24에서 타입·린트·포맷 검사 및 Next.js 프로덕션 빌드.
- `scripts/check-auth-boundaries.py`: `/my` 비로그인 리디렉션, 개인 기록 API 401, 비로그인 쓰기 거부, 외부 Origin 403, 잘못된 형식·추가 필드·대용량 본문 거부.
- `supabase/tests/account-rls.sql`: 실제 DB 정책에 두 일회성 Auth ID의 claims를 적용해 본인 행만 조회, 타인 행 삽입 거부, 기록 수정 거부, 타인 북마크 삭제 0건, 본인 북마크 삭제 성공을 확인. 테스트는 ROLLBACK하며 실제 비밀번호 로그인 검증과는 구분한다.
- 브라우저에서 기존 디자인의 로그인 창과 빈 이메일 입력 오류 표시 확인.
- 실제 DB 테스트 후 일회성 Auth ID 0건, 풀이 기록 0건, 북마크 0건을 조회해 테스트 자료 롤백 확인.
- 브라우저에서 게스트 오답의 선택 답·정답·해설·풀이 시간 펼쳐보기 확인.

### Production 확인

- GitHub 전환 소스 커밋 `a62570af73caf74d2158e481015e15085b504ae4`, Vercel 배포 `6emFWbEhxj3jfvgBTF5hHj3rzJXF` Ready 확인.
- 실제 GitHub OAuth 승인 화면에서 프로필·이메일 읽기 권한만 확인하고 로그인 성공. `/my`에서 계정 학습 기록 표시 확인.
- 자체 문제 E001에 오답 제출 후 선택 답·정답·해설·풀이 시간 표시 확인. 북마크 추가 후 새로고침해 오답 1건과 북마크 유지 확인.
- 로그아웃 후 `/my`를 직접 열면 `/?login=1` 로그인 창으로 이동하고 계정 표시가 사라짐. GitHub 재로그인 후 같은 오답·북마크와 해설 복원 확인. 이 확인용 E001 오답·북마크는 승인된 테스트 계정에 남아 있다.
- 실제 두 계정 로그인 비교와 다른 기기 검증은 수행하지 않았다. DB의 두 사용자 격리는 위 RLS 트랜잭션 테스트로 확인했다.

다음은 이메일 로그인 구현 시점의 이전 배포 검사 기록이다.

- 소스 커밋 `7784c6f02730a94773a2bf25b215fe8ef1ace8f9`, Vercel 배포 `6LqokMtSRnibtrNrci3JgX4MQu6J` Ready 확인.
- 실제 배포 주소에서 `/my` → `/?login=1` 리디렉션과 로그인 창 표시 확인.
- `check-auth-boundaries.py https://vibeteam10.vercel.app` 통과: 비로그인 개인 API 401, 쓰기 거부, Origin·입력 경계 검사.
- `.env.local`이 Git 제외 대상임을 확인. 소스·문서·데이터·빌드된 브라우저 정적 파일에서 OpenAI 프로젝트 키·Supabase secret 키 패턴이 검출되지 않음. 이 패턴 검사는 모든 종류의 비밀값 검사를 대체하지 않음.

이메일 회원가입·인증 메일 수신·비밀번호 재설정 및 다른 기기 로그인은 추가 확인이 필요하다. 공급자의 가입·로그인·메일 제한을 사용하며 별도의 분산 요청 제한은 구현하지 않았다.

## 이메일 설정과 운영 전 확인

GitHub 간편 로그인은 별도 JOBFIT 비밀번호나 Supabase 가입 확인 메일이 필요 없다. GitHub 제공자에는 `read:user`, `user:email`만 요청하며 `repo`·저장소 권한은 요청하지 않는다. GitHub OAuth Client Secret은 Supabase GitHub 제공자 설정에만 저장하며 코드·Vercel 공개 변수에 넣지 않는다. 와일드카드 복귀 주소와 Device Flow를 사용하지 않는다. [GitHub 연결 공식 안내](https://supabase.com/docs/guides/auth/social-sign-in/auth-github).

이메일 인증은 끄지 않는다. Supabase 기본 메일 발송은 수신 대상·횟수 제한이 있으므로 일반 참가자에게 공개하기 전 운영용 SMTP 설정과 실제 수신 검증이 필요하다. 메일을 받지 못하면 무조건 가입 완료로 안내하지 않는다. [Supabase SMTP 공식 안내](https://supabase.com/docs/guides/auth/auth-smtp).

Site URL은 배포 주소이며 허용 콜백은 `/auth/callback`과 비밀번호 복구용 `/auth/callback?recovery=1`이다. 개발·Preview에서 메일 인증을 시험하려면 별도 환경과 명시적인 허용 주소를 준비한다. 비밀번호 재설정 코드 경로가 있다는 것만으로 메일 수신 검증 완료를 주장하지 않는다.

## 이메일 가입 제한 개선 (2026-10-29)

실제 인증 로그에서 가입 429 응답이 반복된 것을 확인했다. 현재 Custom SMTP는 꺼져 있고, Supabase 기본 메일의 시간당 2통·프로젝트 팀 수신자 제한이 적용된다. 일반 사용자 이메일 가입에는 별도 SMTP 연결과 실제 수신 검증이 필요하다. [공식 SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp).

인증 API는 메일 발송 제한과 반복 요청 제한을 구분해 안전한 문구로 안내한다. 이메일 작업별로 60초의 재제출 대기를 표시한다. 이 대기는 공급자의 한도 초기화 시간이 아니며 브라우저 보안 제한을 대신하지 않는다. GitHub 로그인과 다른 이메일 작업은 계속 이용할 수 있다. 이메일 인증·RLS·기존 계정·학습 기록은 유지한다.

Brevo 무료 가입 화면을 준비했다. 아직 가입 약관·연결 키 생성·Supabase SMTP 저장을 완료한 것으로 간주하지 않는다. 서비스 가입과 자격 증명 연결에는 사용자의 해당 단계 확인이 필요하다. 별도 메일 연결 전 오류 문구 개선만으로 가입 문제가 해결됐다고 보고하지 않는다.

`node scripts/check-auth-rate-limits.mjs`에서 실제 Route Handler를 격리 실행해 가입·로그인·복구의 제한/일반 오류12개와 정상3개, 총15개 사례를 확인했다. 공급자 네트워크·메일 발송·계정 생성은 없었다. 클라이언트의 대기 타이머는 별도 코드 검토했으며 실제 이메일 가입 성공 검증을 대신하지 않는다.

후속으로 사용자가 Brevo 무료 가입·Google 프로필/이메일 공유·약관 동의를 승인했다. 현재 Google 휴대전화 본인 확인 단계를 진행 중이다. SMTP 자격 증명 발급·저장 및 가입 메일 수신 검증은 별도 후속 단계다.

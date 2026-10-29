# JOBFIT AI 배포 기록

## 접속 주소

- 사이트: [https://vibeteam10.vercel.app](https://vibeteam10.vercel.app)
- GitHub: [juchan5652548-cloud/vibeteam10](https://github.com/juchan5652548-cloud/vibeteam10)
- Vercel 프로젝트: [vibeteam10](https://vercel.com/juchan5652548-6664s-projects/vibeteam10)

## 최초 배포

| 항목              | 결과                                                   |
| ----------------- | ------------------------------------------------------ |
| 확인 시각         | 2026-10-29 14:28 KST                                   |
| 환경              | Vercel Production, Hobby                               |
| 저장소 / 브랜치   | `juchan5652548-cloud/vibeteam10` / `main`              |
| 배포 소스 커밋    | `b341a766d5c7f510efaaf67ffe1b766b92822246`             |
| 배포 ID           | `dpl_ovvfA1sUwzxRLjqT44qC6LaQQSVo`                     |
| 프로젝트 루트     | `./`                                                   |
| 프레임워크        | Next.js                                                |
| 설치 명령         | `npm ci`                                               |
| 빌드 명령         | `npm run check && npm run build`                       |
| 로컬 검사 런타임  | Node.js 24.22.1                                        |
| Node.js 버전 지정 | `package.json`의 `engines.node: 24.x`, `.nvmrc`의 `24` |
| DB                | 이번 배포에서 DB 기능·실제 연결·마이그레이션 사용 없음 |
| 추가 서비스       | 별도 DB·유료 통합 서비스 추가 없음                     |

## 확인한 결과

- 로컬 `npm run check`: 타입·린트·포맷 검사 통과.
- 로컬 `npm run build`: 프로덕션 빌드 통과.
- 로컬 빌드 실행 후 `/`: HTTP 200, 첫 화면 제목 확인. 확인용 서버는 종료.
- Vercel 화면: `Deployed to Production` 확인.
- 실제 사이트 `/`: HTTP 200과 브라우저 첫 화면 확인.
- `/data/questions/hospital-public-v1.json`: HTTP 404. 소스의 정답 데이터가 해당 경로로 정적 제공되지 않음.
- `/research/aptitude/references/hackers_gsat_33_reference.pdf`: HTTP 404. 외부 참고 PDF를 배포 자산에 포함하지 않음.
- 문서·JSON 서식 정리 전후 JSON 데이터가 동일함을 확인.

현재 사이트는 저장소에 있던 기본 개발 안내 페이지입니다. JOBFIT AI의 로그인, 문제 풀이, 학습 기록 저장, AI 분석은 아직 구현·배포되지 않았습니다. 기획 문서와 자체 문제 24개는 저장소에 준비되어 있습니다.

## 수정하고 배포하는 흐름

1. 이 저장소에서 화면이나 기능을 수정합니다.
2. 변경 범위에 맞는 검사를 실행하고, 일반 앱 변경은 `npm run check`와 `npm run build`를 확인합니다.
3. 검증한 변경을 커밋하고 GitHub에 푸시합니다.
4. Vercel의 Git 연결을 통해 프로덕션 브랜치 `main` 변경을 배포합니다. 자동 배포 실행 여부와 Ready 상태를 해당 배포 화면에서 확인합니다.
5. 같은 접속 주소에서 새 버전의 동작을 확인합니다. 빌드 실패 시 실패 로그를 확인하고 수정합니다.

로그인·DB·AI API를 추가하면 필요한 환경 변수와 권한을 별도로 구성하고 실제 기능을 검증해야 합니다. 상세 배포 원칙은 [Vercel 배포 안내](VERCEL_DEPLOYMENT.md)를 따릅니다.

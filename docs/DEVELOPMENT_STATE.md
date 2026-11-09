# ButterToast 개발 상태

## 0.4.1 릴리스 진행 — 2026-11-09

- 오너가 이 채팅에서 GitHub Release 게시를 승인했다. 새 태그 `v0.4.1-dev.1`로 사전 릴리스를 준비하며 기존 태그·사용자 데이터는 보존한다.
- Windows·Ubuntu의 같은 소스 커밋에 대한 Security regression 통과 후, 기존 배포 workflow로 Windows CI 산출물의 설치 프로그램·ZIP을 만든다. 서버 업로드 해시까지 일치할 때 공개한다.
- Toast Torture 결함 회귀 검사를 CI에 추가했다. 이전 로컬 검사 298개와 50분 실험 결과는 아래 QA 당시 기록이며, 릴리스 파일 해시는 릴리스의 SHA256SUMS.txt로 확인해야 한다.
- Windows 실기기 설치·제거·업데이트와 실제 AI 모델 검증은 별도 미검증 항목이다. 게시 URL과 최종 CI 결과는 완료 후 기록한다.

## Operation Toast Torture 완료 — 2026-11-09

- 기준: 깨끗한 `d22be6e954eac38b61cd66b2f3159502d77e9b45` / 0.4.0. 기존 산출물과 사용자 데이터 보존.
- 06:33:55 UTC에 기준 dist를 `artifacts/torture/baseline-app`에 고정하고 A 10탭/15분 → B 20탭/30분 → C 50탭/5분 측정 시작. Chrome for Testing과 같은 로컬 HTTP fixture·742×686 콘텐츠 크기를 사용. 동일 호스트에서 동시에 실행하므로 자원 경합/다른 QA 부하와 드라이버 차이를 명시하며 성능 우열을 주장하지 않는다.
- 진행 JSON: `artifacts/torture/long-baseline/*.progress.json`, 실행 로그: `/tmp/bt-torture-long-baseline.log`. 짧은 예비 실행은 별도 `long-pilot`이며 장시간 통과로 집계하지 않는다.
- 장시간 실행 세션: `91930`. A 시작 06:33:55 UTC. 기준 코드의 고정 복사본만 실행하므로 수정 중 dist와 섞이지 않는다.
- Mock 공급자, 실제 DOM 작업, 강제 종료 복구, 보안/회귀 검사와 최종 QA 보고서 완료. 실제 AI/OAuth 호출·공개 릴리스 없음.
- 재현·수정: Shadow DOM FILL의 composed input 누락, 페이지 이벤트 무한 대기 시 ToastIR perform 제한 누락. 전자는 실제 host listener 0→1, 후자는 6.5초 미종료→5.0초 실패/권한 회수.
- Mock HTTP 9개 검사(실제 60.002초 timeout 포함), 생산 AI/DOM 27개, 강제 SIGKILL 10탭 복구, Xvfb 실제 포인터/키/주소 Enter/파일 선택 요청 검증. 저장 복구는 테스트 AES-GCM 주입이며 OS DPAPI 증거가 아님.
- 세 번째 P1 결함도 수정: 승인된 CLICK/NAVIGATE 전달 receipt와 같은 origin 로딩을 main에서 확인한 뒤 새 controller/snapshot으로 진행. 이전 권한/본문은 폐기. 중단·직접 입력·외부 origin·승인 중 교체 회귀 통과.
- 수정 소스 `63b917b` / 0.4.1. 최종 기능/보안 298개 그룹 통과(단위 120 + 기존 Electron 133 포함). CDP/ToastIR 각각 7작업×3회 성공. 수정 전 탐색/SPA 6회 실패 원자료 보존.
- A/B/C 두 엔진 모두 실제 900초/1800초/300초 충족, 비의도 충돌 0. B 12탭 suspend/20 URL 복구, C 의도적 crash 복구 성공. Chrome D 자동 복구 실패는 별도 한계로 보존.
- Windows x64 폴더 빌드와 96파일/ASAR/fuse 검사 완료. 보고서 `docs/QA/TOAST-TORTURE-REPORT.md`와 raw JSON/로그 요약을 작성했으며 장시간 결과와 installer/ZIP 최종 해시 확정. 서명 및 Windows 실행은 미검증. GitHub 공개 Release/push 없음.


갱신: 2026-11-09 UTC. Operation Golden Toast의 **0.4.0 개발 빌드**를 준비했다. 이전 게시 릴리스는 0.3.0-dev.1이며 이번 변경을 아직 원격으로 push/공개 게시하지 않았다.

## 기준과 구조

- 시작: `2a75990` / 0.3.0, 미커밋 사용자 변경 없음. [원본 요청](requirements/GOLDEN-TOAST.md), [시작 감사](audit/GOLDEN-TOAST-BASELINE.md).
- Electron main → 고정 앱 UI / 사람 페이지 / AI별 임시 페이지·모델 네트워크 / Supabase 인증. sandbox, Site Isolation, TLS, 실제 창/프레임 IPC 바인딩 유지.
- 오너의 Butter / Browser / Toast 디자인·Pretendard·로컬 SVG를 유지했다. 최종 UI 결정권은 오너에게 있다.
- 일반 개발/로컬 검증은 자율 수행. 실제 결제/삭제/외부 게시·인증 등록은 수행하지 않음.

## 완료한 변경

- ToastIR 열린 Shadow DOM/개인정보·disabled/체크 상태 검사, bounded traversal와 통계, 5초 scope 회수 timeout. `toastir/model.ts`의 compact JSON/delta 검증과 승인된 workflow의 임시 wire history.
- 실행 관찰 결과 전달, 명시적 done 처리, 실제 시간·바이트·실행 지표, 인위적인 AI 1.5초/30회 제한 제거. 텍스트/링크 드래그 초안.
- 로컬 주소 추천, native 탭 드래그 정렬, 강력 새로고침/F11/Ctrl+N, 추가 일반 창, 승인 팝업, export 파일 기반 가져오기, opt-in idle memory saver, 암호화 다운로드 기록.
- 계정 프로필의 로컬 기본 저장/sync opt-in, 기억한 refresh token의 OS 암호화·로그아웃/만료/저장 실패 정리, 다른 기기 로그아웃의 현재 세션 바인딩.
- 계정 삭제 서버 함수/선택적 RLS SQL(미배포), 무료 핵심 기능 중앙 정책/미판매 플랜·Support 상태, 공식 ChatGPT 조사와 비활성 인터페이스.
- [실제 변경/결함/잔여 로드맵](GOLDEN-TOAST-0.4.md), [ToastIR 설명](TOASTIR.md), [성능 조건·원본 JSON](performance/GOLDEN-TOAST-0.4.md), 실제 light/dark UI 스크린샷.

## 검증 결과

- 전체 security 체인: 단위 116/Electron 132그룹, dependency audit 0 advisory/지원 secret pattern 미검출.
- 마지막 저장 실패 정리/표시 보완 후 `npm test`: **117개**; account **8**, profile **9**, Golden **7**그룹 재통과. native drag 1그룹 추가를 포함한 현재 중복 제외 Electron security 범위 **133그룹**.
- ToastIR 실제 Electron **29그룹**. 모델 fixture는 실제 wire request의 기준 snapshot과 delta를 재구성해 행동을 선택한다. 실제 모델 호출 성공이라고 주장하지 않음.
- 10/25/50탭 로컬 코어·공식 Chrome 참조, RSS/PSS/private/CPU·로딩/전환·ToastIR 표현/dispatch 측정. 조건 차이로 제품 성능 우열을 주장하지 않음.
- 실제 production UI 50탭/301.4초/454전환/22reload, 관찰된 crash/unresponsive 0. fresh profile startup 3회 475/461/436ms(OS 파일 캐시 유지).
- 공개 첫 화면 6곳 로드, YouTube proxy tunnel 실패. 인증 후 사이트 동작 미검증.
- 로컬 VP9 디코딩과 fixture multipart POST 통과. CDP 선택/웹 form 제출이며 native 파일 chooser/포인터 제출·DRM은 미검증.
- Windows 포터블 95개 payload·x64 PE·7개 fuse·ASAR hash·SBOM 검증 완료. 설치 프로그램/ZIP 생성과 해시는 artifacts에 둔다. 미서명, Windows 직접 실행/설치/제거/DPAPI 미검증.
- 원본 로그 `/tmp/bt-golden-security-release.log`, `...-unit-final.log`, `...-account-final.log`, `...-profile-final.log`, `...-browser-final.log`, `...-benchmark-final.log`, `...-soak-final.log`, `...-package.log`. 로그 전체를 공개하지 않으며 보존할 sanitized 결과는 docs에 있다.

## 주요 파일과 결정

- `src/toastir/{runtime,controller,model}.ts`, `src/ai/{service,adapter,panel,subscription}.ts`: 변경분은 권한이 아니며 실행 전 문서/승인 재검사. delta보다 전체가 작거나 기준이 없으면 전체.
- `src/browser/{tabs,idle,popups,windows,import,suggestions,download-store,downloads}.ts`: 페이지 상태는 자동 완전 복원하지 않음. idle 보호는 conservative, 기본 끔. 팝업은 detached 새 탭만.
- `src/auth/{storage,service,protocol,window}.ts`, `src/product/access.ts`: 사용자가 동기화를 켜기 전 서버 프로필을 사용하지 않음. 서버 metadata를 entitlement로 신뢰하지 않음. OS 암호화가 없으면 평문 대체 없음.
- `supabase/`: 검토용 삭제 함수/SQL이며 배포되지 않음. 오너의 관리자 키나 사용자 실제 비밀번호를 저장하지 않음.
- `scripts/benchmark-*.cjs`, `soak-golden.cjs`, `site-smoke-golden.cjs`, `test-compatibility.cjs`와 새 test 파일들이 재현 경로. Chrome/CDP 비교와 계정 fixture·실서비스 smoke를 구분.

## 남은 작업 / 다음 순서

1. 새 로컬 빌드/보고서를 오너가 검토한 뒤 별도 승인 범위에서 GitHub 게시/Windows CI·릴리스를 진행한다. 기존 0.3 태그를 덮어쓰지 않는다. 배포 전 actual Windows 설치/업데이트/제거·DPAPI·메일 콜백 확인.
2. 실제 AI 키 또는 로컬 모델로 작업 정확도/청구/토큰·복잡한 사이트 검증. 이미 보낸 제출을 재시도하거나 되돌렸다고 주장하지 않음.
3. Supabase sync/세션 해제 실검증, SMTP, 삭제 함수 서버 배포·RLS/데이터 inventory 검증. 계정 변경은 여전히 같은 OS 브라우징 데이터와 키를 공유한다.
4. iframe/closed shadow/전체 AX/vision/batch, 파일/이미지 모델 첨부·AI 파일 선택, 추가 창의 세션/AI/권한 완성도, 고급 workflow/queue/복구는 후속 과제.
5. 공식 ChatGPT 자격·라이선스·상용 승인 확인 후 OAuth/Responses 구현. 서명/운영 update feed·설치 rollback·후원 링크·결제는 아직 미설정/미구현이다.

이 문서는 전체 지시서를 모두 완료했다는 선언이 아니다. 실제 가능한 구현과 검사, 외부 의존/미검증 작업을 분리해 다음 세션에서 이어간다.

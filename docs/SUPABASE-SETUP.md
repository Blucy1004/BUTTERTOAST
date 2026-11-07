# Supabase 계정 연결과 검증

2026-11-07 구현. 회원가입·로그인·로그아웃 및 교체 가능한 임시 계정 창을 제공한다. 최종 디자인은 프로젝트 오너가 정한다. 계정 없이 브라우저를 사용할 수 있고, 계정 로그인으로 ToastGuard의 AI 권한을 얻지 않는다.

## 프로젝트 연결

프로젝트 URL은 `https://nlnnrmswustfiloqxyxh.supabase.co`다. `/rest/v1/`를 포함하지 않는다. 오너가 제공한 `sb_publishable_…` 공개 클라이언트 식별자는 `src/auth/config.ts`에 반영했다. 공개 식별자는 비밀 API 키가 아니며 관리자 권한을 제공하지 않는다. `service_role`, `sb_secret_`, DB 비밀번호 및 사용자 세션은 이 파일에 넣지 않는다. 서버 데이터 권한은 별도로 RLS 등에서 강제해야 하며 현재 앱은 DB 테이블을 만들거나 조회하지 않는다.

다른 테스트 프로젝트를 연결할 때는 `BUTTERTOAST_SUPABASE_URL`과 `BUTTERTOAST_SUPABASE_PUBLISHABLE_KEY`를 함께 지정할 수 있다. HTTPS의 Supabase 프로젝트 origin과 publishable 키만 허용한다. 실제 서버 주소를 로컬 HTTP 테스트 주소로 바꿔서 보호를 끄지 않는다.

## 오너가 선택한 설정

| Supabase 항목 | 선택 |
| --- | --- |
| Enable email provider | ON |
| Secure email change | ON |
| Secure password change | ON |
| Require current password when updating | ON |
| Prevent use of leaked passwords | OFF — 현재 화면에서 Pro 이상 기능 |
| Minimum password length | 8 |
| Password requirements | 추가 문자 조합 조건 없음 |
| Email OTP expiration | 3600초 |
| Confirm email | ON — 오너 설정 완료 보고 |

Authentication → URL Configuration → Redirect URLs에 정확히 다음 주소를 추가한다. 오너가 설정 완료를 보고했으며, 이 환경에서 관리 API로 재검증한 것은 아니다.

```text
http://127.0.0.1:52149/auth/callback
```

이 주소는 가입을 시작한 컴퓨터에서 잠시 열리는 인증 코드 수신 주소다. 공용 서버나 데이터 API가 아니다. 와일드카드나 다른 URL을 허용 목록에 추가할 필요는 없다. Site URL은 별도 웹서비스가 정해지지 않은 상태에서 임의의 외부 사이트로 바꾸지 않는다. 앱은 위 주소를 `redirect_to`로 명시한다.

Supabase 기본 이메일 템플릿의 인증 링크를 사용한다. 현재 대시보드에서는 커스텀 SMTP 없이 템플릿 편집이 제한되므로 OTP 템플릿 변경을 요구하지 않는다. Supabase 기본 메일 발송은 프로젝트 조직 팀원 주소로 제한되며 발송 한도가 작다. 일반 사용자의 가입 메일을 보내려면 커스텀 SMTP를 설정해야 한다. 실제 도메인 인증, 발송 한도 및 수신 여부는 해당 프로젝트에서 확인해야 한다.

참고: [Supabase 공식 SMTP 문서 원문](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx), [PKCE 문서](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## 사용 흐름

1. 실행한 ButterToast 우측 위 `로그인` → `회원가입`을 선택한다.
2. 이메일과 8자 이상 비밀번호를 입력한다. 비밀번호 확인이 일치해야 전송한다.
3. ButterToast를 켜 둔 채 같은 컴퓨터에서 가입 메일의 인증 링크를 연다. 성공하면 계정 창과 브라우저 버튼 상태가 바뀐다.
4. 이후에는 이메일·비밀번호로 로그인한다. 앱 종료 후 다시 로그인해야 한다. 현재 자동 로그인/로그인 유지 옵션은 없다.
5. 로그아웃은 이 앱의 계정 정보와 현재 Supabase 세션을 대상으로 한다. 방문한 사이트의 쿠키나 로그인은 별도이며 삭제하지 않는다.

앱이 꺼졌거나 다른 컴퓨터에서 메일을 열면 앱으로 돌아오지 못할 수 있다. 메일 인증이 완료됐다면 원래 앱에서 이메일·비밀번호로 로그인할 수 있다. 52149 포트를 다른 프로그램/다른 ButterToast가 사용하면 가입을 진행하지 않고 안내한다. 인증 대기를 취소하면 이미 발송된 메일 또는 이미 생성된 서버 계정까지 취소되지는 않는다.

비밀번호 변경·분실 재설정·계정 삭제·MFA UI는 이번 범위에 포함하지 않는다. 위 서버 보호 설정을 끄지 않는다. 서버의 Rate Limits/Attack Protection은 앱 내 제한과 별도로 적용된다. 클라이언트의 횟수 제한은 공격자가 Supabase API를 직접 호출하는 것을 막는 서버 방어가 아니다.

## 보안 경계

- 계정 창은 샌드박스·contextIsolation·webSecurity를 유지한 독립 컴포넌트다. 실제 생성된 계정 WebContents, 최상위 프레임, 정확한 `toast-ui://app/account.html` URL, 명령 스키마와 횟수를 메인에서 확인한다.
- 브라우저 UI와 계정 UI 모두 외부 통신을 금지한 CSP를 유지한다. 계정 통신은 별도 메모리 네트워크 세션에서 메인만 수행한다. 사람 탭, AI 작업과 쿠키·브리지를 공유하지 않는다.
- HTTP 요청은 고정 HTTPS 프로젝트 origin 및 가입/토큰/로그아웃 경로만 사용한다. 리디렉션은 거부하고 쿠키를 보내거나 저장하지 않는다. 응답 크기는 64 KiB, 일반 요청 시간은 20초로 제한한다. 오류 본문과 토큰을 UI/로그에 그대로 출력하지 않는다.
- PKCE S256 verifier는 메인 RAM에만 보관한다. 반환 코드는 그 verifier로 교환하고, 인증된 응답 이메일이 가입 이메일과 일치해야 로그인한다. 브라우저에서 전달한 이메일·토큰·인증 완료 플래그로 로그인하지 않는다.
- 수신기는 127.0.0.1에만 바인딩한다. 정확한 Host·경로·GET·단일 code를 검사하고 Origin, 비탐색 요청, 임의 추가 인자를 거부한다. 실패 시도·연결 수·크기를 제한하고 성공/취소/1시간 대기 만료/종료 시 닫는다. 콜백 페이지는 고정 문구만 출력한다. PKCE는 코드 탈취/주입 방어이며 로컬 포트 선점이나 요청 방해까지 막지는 않는다.
- access/refresh 토큰은 메인 RAM에만 유지하며 localStorage, 설정 파일, 탭 복원 파일에 저장하지 않는다. 비밀번호는 전송 후 입력란에서 지우고 보관하지 않는다. 프로세스 메모리 자체에 대한 공격이나 OS 덤프에서 안전한 메모리 삭제까지 보장하는 것은 아니다.
- 갱신 시 이메일과 사용자 ID를 다시 검사한다. 만료, 취소, 로그아웃, 앱 종료 뒤 늦게 도착한 응답은 로그인 상태를 되살릴 수 없다. 갱신이 멈춰도 기존 세션의 만료 시각에 로컬 상태를 해제한다.
- 계정은 AI 태스크/ToastIR/ToastGuard 권한 승인과 별개다. 향후 계정 기반 DB 기능은 서버에서 JWT와 사용자별 정책을 검증해야 한다.

## 검증과 남은 확인

`npm test`와 `npm run test:account`는 실제 계정이나 메일을 만들지 않는 로컬 fixture 검증이다. 계정 E2E는 실제 production main/계정 창/폼/IPC/격리 세션/로컬 콜백을 사용하며 HTTPS 프로토콜 응답만 로컬 fixture로 제공한다. TLS 검증이나 Chromium 샌드박스를 끄지 않는다.

- Node 회귀: 50개 통과. 인증 관련 13개 포함 — 잘못된 설정/스키마, 8자 정책, 응답 상한·리디렉션·오류 노출, 확인된 계정 바인딩, PKCE, 다른 계정 코드, 지연 응답/로그아웃 경쟁, 요청 제한, 세션 갱신/만료, 콜백 위조·재사용, 잘못된 가입 응답/서버 자동 확인, 대기 만료/종료.
- Electron 계정 회귀: 8개 그룹 — 실제 폼과 인증/로그아웃, 비밀번호 확인, 가짜 계정 창·웹 탭·브라우저 IPC, CSP/세션 경계, 코드 주입, 렌더러 토큰 미노출, 서버 오류 미노출, 창 재열기, 지연 응답 취소.
- 전체 `npm run test:security` 통과: Node 50개 및 Electron 66개 그룹(기존 브라우저 16, ToastIR 19, 탭 생명주기 11, 확대 보안 12, 계정 8). 의존성 audit은 알려진 취약점 0건, 저장소의 지원 패턴 비밀정보 검사 통과. Linux OS 키 저장소 암호화 왕복은 사용할 수 없어 미실행이고 fail-closed 경로만 확인했다.
- 프로젝트 URL 및 공개 키는 반영했고 Redirect URLs와 Confirm email은 오너가 설정 완료했다고 보고했다.
- **실제 Supabase 접속, 메일 수신, 실제 계정 가입/로그인, Windows 실행은 이번 검증에 포함하지 않았다.** 이 클라우드에서 프로젝트 `/auth/v1/settings` 접근은 CONNECT 403으로 차단됐다. 도메인 하나만 허용하는 환경 변경 초안을 저장했으며 사용자의 환경 설정 검토·저장·게시 후 적용 여부를 확인하고 새 연결로 재검증해야 한다.
- live 확인 때는 조직 팀원 테스트 주소로 가입 → 메일 수신 → 같은 PC에서 링크 열기 → 재로그인 → 로그아웃을 확인한다. 테스트 비밀번호/메일 링크/세션 토큰을 채팅이나 저장소에 남기지 않는다.

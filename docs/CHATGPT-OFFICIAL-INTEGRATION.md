# 공식 ChatGPT 연결 조사와 통합 경계

확인일: 2026-11-09 KST. 이번 빌드의 ChatGPT 구독 연결은 **설계/비활성**이다. 실제 OAuth·추론을 실행했다고 보고하지 않는다. OpenAI API 키 연결은 이미 별도로 동작한다.

공식 문서에는 **오픈소스·로컬 호스팅 앱용 동적 등록 경로**가 있다. 따라서 “타사 앱에서는 ChatGPT 플랜을 쓸 수 없다”는 결론은 맞지 않는다. 초기 `dynamic_agent_client`, 계정/워크스페이스별 발급 client ID, 기기별 안정적인 `ext_agent_host_id`, PKCE·state·OIDC nonce 및 JWKS 검증을 문서화한다. 유료 또는 원격 호스팅 앱에는 별도 interest form을 안내한다. 상용 client ID 문서는 선별 파트너/대기 명단을 명시한다.

ButterToast는 공개 저장소이지만 라이선스와 향후 유료 상품 범위·공식 승인 상태를 아직 확정하지 않았다. 임의로 오픈소스 등록 자격이나 상용 승인을 간주하지 않는다. 현재 범위는 독립 클라이언트 인터페이스와 메인 프로세스 기능 상태까지다. 토큰을 Codex 설정에서 복사하거나 웹 세션 쿠키를 API 키로 사용하는 경로는 없다.

## 승인·적용 범위 확인 후 구현 순서

1. `OfficialSubscriptionClient`와 BYOK 어댑터를 분리한다. 선택한 계정의 검증된 subject·issuer·client ID·host ID로 등록과 갱신을 묶는다.
2. 시스템 브라우저 + 127.0.0.1 콜백. 매 시도 state/nonce/PKCE 생성, 실제 바인딩된 포트와 URI를 교환까지 동일하게 유지한다. 취소·오래된 콜백·다른 client ID/subject를 거부한다.
3. 공식 JWKS로 ID token 서명·issuer/audience/expiry/nonce 검증. `chatgpt.tokens.use.direct`와 `resource.invoke` 등 실제 granted scope를 확인한다. identity 로그인과 플랜 사용 동의는 서로 다르다.
4. OS 보호 저장소가 없으면 명시적 메모리 사용만 허용한다. 토큰 로테이션은 원자적이고, 연결 해제는 지연 저장보다 마지막에 처리한다. UI·Supabase·로그로 토큰을 보내지 않는다.
5. Responses 전용 SSE 어댑터를 구현한다. 현재 공식 preview는 `store:false`, `stream:true`, 전체 필요한 `input`을 요구하며 HTTP `previous_response_id`, `max_output_tokens` 등 일부 필드를 지원하지 않는다. 기존 Chat Completions 어댑터에 토큰만 넣는 것으로 대체할 수 없다.
6. `response.completed`, 오류/취소/한도 이벤트를 구분한다. 사용자의 실제 플랜 한도를 표시하고 자체 구매를 조건으로 두지 않는다. 데이터와 도구 제안은 기존 ToastGuard와 일회 승인 경계를 통과한다.
7. 로컬 callback·JWKS·SSE fixture 후 소유자가 승인한 실제 계정으로 통합 검증한다. 외부 신청·승인 제출은 별도 수행한다.

## 확인한 공식 출처

- [OSS/local plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Commercial client ID](https://developers.openai.com/siwc/request-client-id)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [사용자용 Sign in with ChatGPT 안내](https://developers.openai.com/codex/sign-in-with-chatgpt)
- [MCP 서비스 인증](https://developers.openai.com/apps-sdk/build/auth/)은 ChatGPT가 서비스에 접근하는 별도 방향의 계약이다.

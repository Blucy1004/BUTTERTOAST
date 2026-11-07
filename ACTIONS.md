# 행동 정책 — v1 (실행기 연결 전)

`src/security/guard.ts`는 protocol/id/tab/origin/version/op/target/value의 정확한 필드를 검사한다. CLICK, FILL, SELECT, SCROLL, NAVIGATE, WAIT, READ, EXTRACT, VERIFY, HANDOFF를 구분한다. 임의 JavaScript나 OS 명령 필드는 없다. NAVIGATE는 승인된 HTTPS origin 안으로 제한한다. WAIT는 최대 5초, SCROLL은 한 번에 최대 1000 단위다.

권한 부여와 일회성 승인 API는 신뢰된 메인 프로세스 전용이다. 모델이나 웹 IPC에 노출하면 안 된다. READ/EXTRACT는 민감 표시 대상의 내용을 읽을 수 없으며 모든 대상은 허용 동작·가시성·활성 상태를 검사한다. CLICK은 전송·삭제·결제 효과를 알 수 없으므로 관련 권한과 정확한 행동 승인을 모두 요구한다.

claim 결과는 실행 허가일 뿐 DOM 실행이 아니다. ToastCore는 실제 실행 직전 버전과 대상 매핑을 원자적으로 재확인하고 AbortSignal을 준수해야 한다. 현재 ToastCore는 미구현이다.

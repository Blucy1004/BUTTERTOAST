# 행동 정책 — v2

`src/security/guard.ts`는 protocol/document/id/tab/origin/version/op/target/value의 정확한 필드를 검사한다. document는 필수 문서 ID이며 예전 v1 요청은 거부한다. 승인에는 정확한 행동, 문서, 버전, 탭과 origin을 함께 결합한다. 만료는 단조 시계를 사용한다.

Guard는 CLICK, FILL, SELECT, SCROLL, NAVIGATE, WAIT, READ, EXTRACT, VERIFY, HANDOFF를 구분하지만 실제 실험 실행기(`src/toastir/controller.ts`)는 CLICK/READ/EXTRACT/VERIFY만 지원한다. 나머지는 실행하지 않고 거부한다. 임의 JavaScript·OS 명령 필드는 없다.

권한 부여, 승인 확인 callback과 승인 토큰은 신뢰된 메인 프로세스 전용이다. 웹페이지·모델에서 제공한 approved 값이나 확인 함수는 신뢰하면 안 된다. CLICK은 전송·삭제·결제 결과를 분류할 수 없으므로 write/transmit/delete/pay 권한과 정확한 행동 승인을 모두 요구한다. 실제 승인 UI는 아직 없다.

승인 대기 전후 상태를 다시 수집해 확인하며 실행 직전 동일 Node/버전/문서를 재확인한다. 페이지 스크립트의 event handler는 계속 불신 대상이다. 이 검증이 클릭 이후 서버 효과나 거래 금액을 증명하지는 않는다. 이미 전달된 click을 소급 취소한다고 보장하지 않는다.

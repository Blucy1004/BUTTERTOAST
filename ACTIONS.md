# 행동 정책 — 문서 v2 / Action protocol v2

모델 응답은 reply와 action을 가진 JSON이다. action은 null 또는 op/target/value만 포함한다. CLICK·FILL·SELECT·READ·EXTRACT·VERIFY는 현재 요소 ID를 사용한다. SCROLL·NAVIGATE·WAIT·HANDOFF는 빈 target을 사용한다. 메인이 protocol/document/id/tab/origin/version을 실제 캡처와 결합한다. 모델이 승인·권한·문서 버전을 지정할 수 없다.

CLICK/FILL/SELECT/SCROLL/NAVIGATE는 각각 정확한 문서·버전·인자에 묶인 네이티브 일회성 승인이 필요하다. 웹 이벤트는 전송·삭제·결제를 일으킬 수 있어 write/transmit/delete/pay 권한을 모두 요구한다. 승인은 30초 후 만료된다.

FILL은 민감하지 않은 텍스트 필드만, SELECT는 유일하게 일치하는 옵션 값 또는 표시 이름만 지원한다. SCROLL은 -1000..1000의 0이 아닌 픽셀, WAIT는 1..5000ms다. NAVIGATE는 같은 origin의 HTTPS 주소만 허용한다. VERIFY는 표시 이름과 value의 정확한 일치를 검사한다. HANDOFF는 권한을 회수한다.

행동 하나 뒤에는 새 페이지 상태를 확인한다. 요소 교체·버전 변경·회수·중복 ID를 무시하지 않는다. 클릭/탐색 뒤 결과가 불확실하면 사용자 확인을 기다리고 같은 제출을 반복하지 않는다. 이미 전송된 효과를 되돌렸다고 주장하지 않는다.

# 제어권 인계 — 정책 v2

ToastGuard의 stop은 현재 AbortSignal을 중단하고 권한 범위와 승인을 폐기한다. HANDOFF 정책도 권한을 폐기하지만 실험 실행기는 HANDOFF 명령 실행을 아직 지원하지 않는다. host는 controller.stop으로 권한을 회수한다. 새 grant는 신뢰된 사용자 동의 경로에서만 호출해야 한다.

controller는 캡처 대기 중 회수된 작업을 실행하지 않으며 회수 후 결과 데이터도 내보내지 않는다. 실제 테스트에서 대기 중 click이 발생하지 않는 것을 확인했다. 이미 Chromium에 dispatch한 클릭이나 이미 서버에 전송된 효과는 되돌릴 수 있다고 보장하지 않는다. 협업 UI의 제어권 회수 흐름은 미구현이다.

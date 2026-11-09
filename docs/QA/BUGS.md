# Toast Torture 결함과 재현

기준: `d22be6e954eac38b61cd66b2f3159502d77e9b45`, 0.4.0. 수정: 0.4.1 개발 빌드. 모든 공격 fixture는 로컬 테스트용이다.

## TT-001 · P1 · ToastIR 실행이 무한 대기 — 수정

- 조건: 승인한 버튼의 페이지 이벤트 핸들러가 종료되지 않음 (`while(true){}`). 웹페이지 renderer는 untrusted 영역이다.
- 0.4.0: capture에는 5초 제한이 있지만 perform에는 없어, 6.5초 관측 한도까지 실행 Promise가 끝나지 않았다. AI 작업이 바쁜 상태에 남을 수 있다.
- 수정: 고정 isolated-world 호출 모두에 5초 제한. 시간 초과 시 scope/lease를 폐기하고 실패를 반환한다. 이미 페이지에 전달된 효과는 자동 재시도하지 않는다.
- 검증: `test/torture/blocked-renderer.cjs`. 같은 악성 핸들러에서 약 5.0초 후 `ok:false`, `context-unavailable`. 테스트가 만든 renderer만 강제 종료해 정리한다. 전후 JSON 보존.
- 한계: 응답 제한은 웹페이지 자체의 무한 루프를 중단하지 않는다. 페이지는 복구/재시작이 필요하다. 사용자 페이지를 자동 종료하여 미저장 상태를 잃게 하는 정책은 추가하지 않았다.

## TT-002 · P2 · Shadow DOM 입력 이벤트 누락 — 수정

- 조건: 열린 ShadowRoot 내부 input을 FILL하고 host 바깥에서 `input` 이벤트를 수신하는 웹 컴포넌트.
- 0.4.0: 값은 바뀌지만 `new Event('input', {bubbles:true})`가 shadow 경계를 통과하지 않아 바깥 처리 횟수가 0.
- 수정: 한 번의 `InputEvent`에 `bubbles:true`, `composed:true`, `inputType:'insertText'`, 정확한 입력 data를 사용. 기존 실제 Node/문서/값 승인·민감 필드 제한은 유지한다.
- 검증: 실제 Mock HTTP→앱 UI/IPC→ToastIR 실행의 `SHADOW-02`. 입력값과 host 수신 횟수 1을 함께 확인. nested click, shadow 교체 공격과 전체 보안 회귀도 통과.

## TT-003 · P1 · 정상 탐색 후 연속 작업 중단 — 수정

- 조건: 승인한 NAVIGATE 또는 SPA 라우팅 CLICK이 문서를 바꾸거나 navigation 이벤트를 발생시킴.
- 수정 전: 실제 이동이 일어나도 이전 scope의 폐기가 `task-changed`가 되어 workflow가 중단됐다. 3회씩 측정한 다단계 탐색·SPA 첫 시도는 모두 미완료였고, 명시적 계속으로만 복구됐다. 원본 실패 JSON을 보존했다.
- 수정: 고정 실행기가 정확히 승인한 CLICK/NAVIGATE의 전달을 확인한 경우에만 main에 boolean receipt를 남긴다. 기존 scope·lease·문서 데이터는 계속 폐기한다. 별도의 main navigation observer가 같은 HTTPS origin의 로딩 완료와 NAVIGATE의 정확한 목적지를 확인한다. 이어서 AiService가 새 controller/snapshot을 얻는다. 다음 부작용은 다시 native 승인이 필요하다.
- 차단: receipt 없는 실패, 다른 origin을 거쳤다가 돌아오는 리디렉션, 목적지 불일치, 과도한 navigation, 5초 미완료, 사용자 중단, 직접 키/마우스 입력, task 교체. READ 텍스트·point·승인 token은 이전 문서에서 반환하지 않는다.
- 검증: 실제 Mock 앱의 NAV-01/02 자동 진행과 fresh document, NAV-03 중단, NAV-04 다른 origin, NAV-05 승인 중 문서 교체, NAV-06 탐색 중 직접 키 입력. 모듈 회귀는 되돌아오는 다른 origin redirect·오래된 데이터·receipt 없는 실패 상황도 검사한다. 수정 후 성능 7작업×3회 재측정.
- 이미 서버에 전송한 효과를 되돌리거나 불확실한 제출을 재시도하는 기능은 아니다. 로딩 실패·긴 SPA 작업 등 확인할 수 없는 상황은 멈춘다.

## 계측/환경 실패 (제품 결함 수에 합치지 않음)

- AI DOM 예비 harness가 비동기 IPC의 busy 시작 전에 상태를 읽음: command 전송 후 처리 시작을 기다리도록 수정. 원본 실패 JSON을 보존하고 실제 DOM 부작용으로 재검증.
- native Enter 예비 입력이 keyDown/keyUp만 보내어 form submit용 char 이벤트를 빠뜨림: 실제 Enter sequence를 전달한 재시험 통과. 제품 코드는 변경하지 않음.
- CDP 성능 예비 시험이 숨겨진 window를 사용하여 native 클릭 실패: 가상 display의 보이는 window로 조건을 맞춰 다시 측정. 숨긴 창 결과는 본 비교에서 제외. 중간 측정의 CDP click 1회 누락도 보존했으며 두 rAF 후 렌더링 준비를 확인하는 동일 조건으로 양쪽 경로를 다시 측정.
- Chrome 강제 renderer crash 후 기존 page reload 대기: 별도 새 page + URL 복원으로 C의 명시적 시험 복구. Chrome의 native ‘새로고침’ UI를 검증한 것은 아님.
- Chrome 세션 복구: headless와 Xvfb에서 SIGKILL 후 `--restore-last-session` 재시작 시 새 탭만 관측. 이전 Session 파일에는 fixture URL이 있으나 자동 복구 완료는 확인하지 못했다. Chrome의 수동 복구 UI까지 검증하지 않았으므로 Chrome이 복구를 지원하지 않는다고 일반화하지 않는다.

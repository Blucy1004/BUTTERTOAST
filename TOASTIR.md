# ToastIR 실험 경로 — 문서 v2 / Action protocol v2

현재는 요소 바꿔치기·승인·탭 경계 검증용 수집/실행 모듈이다. `src/toastir/runtime.ts`의 고정 애플리케이션 코드가 외부 페이지와 분리된 Chromium isolated world 1001에서 동작한다. 페이지의 DOM ID나 data 속성을 신뢰하지 않고 WeakMap으로 실제 Node에 요소 ID를 부여한다. 모델은 DOM 객체나 코드 실행 API를 받지 않는다.

스냅샷에는 탭, HTTPS origin, 문서별 무작위 ID, 버전, 요소 ID, 간단한 역할/이름, 가시성·활성·민감 표시와 허용 동작이 있다. 문서가 교체되면 새 문서 ID를 사용한다. 모든 DOM mutation을 보수적으로 버전에 반영하며 실행 직전에 pending mutation과 실제 Node, fingerprint, 가시성/활성 상태를 재확인한다. CLICK은 중심점 가림 검사 후 같은 JS turn에서 해당 Node의 click을 호출한다. form 동작/대상과 링크 주소도 fingerprint에 포함한다.

현재 대상은 최상위 문서의 button/link 및 form-control 메타데이터 최대 500개다. 입력 값은 전달하지 않으며 form-control, contenteditable, data-private 하위/상위 영역은 민감 표시한다. 숨김 요소 이름도 숨긴다. 표시 문자열은 여전히 신뢰할 수 없는 웹 데이터이며 완전한 개인정보 판별은 아니다.

`ToastController`는 생성 시 받은 WebContents 하나에 고정된다. 스냅샷은 명시적인 read 범위를 요구하고, 외부에서 제공한 스냅샷을 권한 검사에 사용하지 않는다. 문서 탐색·렌더러 종료·사용자 중단은 범위와 승인을 폐기한다. 이 경로는 모델/제품 UI에 아직 연결하지 않았다.

미구현: 전체 접근성 트리, 관계·iframe/shadow DOM 수집, 바이너리 인코딩, 선택적 증분 전송, 토큰 최적화. 이 문서는 완성된 바이너리 프로토콜 명세가 아니다.

# ToastIR — Action protocol v2 / BTIR wire v1

isolated world 1001의 고정 앱 코드가 DOM Node와 요소 ID를 매핑한다. 웹페이지에는 이 객체나 앱 IPC를 노출하지 않는다. 읽기 scope 없이 스냅샷을 반환하지 않는다. 문서 ID·mutation 버전·fingerprint·실제 Node를 실행 직전 확인한다.

스냅샷은 document/version/origin/text/elements다. 요소는 id/parent/role/name/visible/enabled/sensitive/actions를 갖는다. 역할·aria-label·가시적인 aria-labelledby와 제한된 부모 관계를 수집한다. 입력값은 fingerprint 내부에서만 비교하고 외부로 내보내지 않는다. SELECT의 표시 선택지는 라벨에 포함한다.

BTIR은 BTIR magic 4바이트, wire version 1바이트, 비압축 UTF-8 길이 4바이트(big endian), 표준 raw DEFLATE payload다. 전체 비압축 크기 상한은 512 KiB다. decode는 스키마·중복 ID·잘못된 부모·순환 관계를 거부한다. `changes(previous)`는 같은 문서/origin의 removed/changed/text 변경을 반환하고 문서가 바뀌면 null을 반환한다.

모델에는 바이너리를 base64로 전달하지 않는다. 실제 모델 연결은 최대 12,000자/100요소의 텍스트 컨텍스트를 사용한다. 바이너리·증분 API는 구현돼 있으나 전체 AX 트리·iframe·shadow DOM 지원이나 실제 모델 토큰 절감의 증거는 아니다.

CLICK/FILL/SELECT/SCROLL/NAVIGATE/WAIT/READ/EXTRACT/VERIFY/HANDOFF 실행 제한은 ACTIONS.md를 따른다. 승인 대기 중 요소·문서·인자가 달라지면 거부한다. 이벤트가 페이지의 네트워크 요청을 일으킨 뒤에는 그 결과를 소급 취소할 수 없다.

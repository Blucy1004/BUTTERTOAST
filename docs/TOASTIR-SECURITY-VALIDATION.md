# ToastIR·승인·탭 경계 공격 검증 — 2026-11-07

> 과거 버전의 구현/검증 기록입니다. 현재 0.4 변경 사항·보안 범위·최신 검사 수치는 [Golden Toast 기록](GOLDEN-TOAST-0.4.md)을 참고하세요.

## 입력 보고서와 이번 범위

사용자 첨부 `ButterToast-security-report.html`을 실행하지 않고 텍스트로 읽었다. 보고서의 EXE SHA-256 `d30aaf21c041ac33541dbd989a3b6dbc53bdcee726c940e93a4acfe69c5dee64`는 보관된 Windows 테스트 빌드와 일치한다. 보고서는 제한된 Windows 블랙박스 검사에서 침투 성공을 확인하지 못했고 미서명을 보완 사항으로 기록한다. Windows 관찰은 **사용자 제공 보고서의 결과**이며 이번 클라우드 실행으로 독립 재현한 결과가 아니다. 원본 보고서 SHA-256: `390e29fe24b953d8f78cd72e8268a1d716020bc9d3ea874070096fdb15db6610`.

이번 작업은 별도로 Linux Electron 45.2.3에서 요소 교체, 승인 재사용, 작업 간 정보 접근을 검사했다. 모델 API나 실제 사용자 데이터는 사용하지 않았다. 완전한 ToastIR와 모델/UI 경로가 없으므로 검증 가능한 최소 수집·실행 모듈을 추가해 시험했다. 새 Windows ZIP을 만들지 않았다.

## 재현한 결함: 문서 변경 후 승인 재사용

기존 Action v1 Guard에는 문서 ID가 없었다. 같은 tab/origin에서 navigation 후 collector가 version과 요소 ID를 재사용하고 host가 별도로 scope를 폐기하지 않으면 이전 승인이 새 문서에서도 허용됐다. 기존 모듈에 대해 다음 순서로 확인했다.

1. tab 1 / `https://example.test` / version 1 / button1의 CLICK을 승인.
2. 스냅샷의 document를 다른 문서로 교체하되 tab/origin/version/요소 ID와 허용 동작은 유지.
3. 이전 행동과 승인 토큰을 claim에 전달.
4. 수정 전 결과:

```json
{"scenario":"same-origin navigation resets version and reuses target id","approved":true,"acceptedAfterDocumentChange":true}
```

이는 **아직 배포 UI에 연결되지 않은 Guard의 설계 결함**을 재현한 것이다. 기존 Windows EXE의 AI 경로 침투를 입증한 것은 아니며, 특정 collector/host 통합 조건이 필요하다.

수정: Action v2에 문서 ID를 필수로 넣고 승인 키에 포함했다. v1 요청은 거부한다. 실험 controller는 navigation/renderer 종료에서 권한을 폐기하고, isolated world마다 다른 문서 ID를 만든다. 문서 ID가 바뀌면 version과 요소 ID가 같아도 거부한다. 버전과 문서를 새 값으로 고쳐 보내도 이전 토큰의 정확한 행동 바인딩이 맞지 않아 거부한다. TTL은 단조 시계를 사용한다.

## 실제 Chromium DOM 실험

앱 코드가 소유한 isolated world의 WeakMap은 DOM ID와 별도로 실제 Node를 매핑한다. Observer callback과 takeRecords로 교체/분리/재삽입을 버전에 반영한다. 승인 대기 전후 및 실행 직전에 문서/버전/노드를 재확인한다. CLICK 검증과 dispatch는 한 동기 JS turn에서 수행한다. 페이지에서 같은 전역 이름을 만들더라도 isolated mapping은 바뀌지 않았다.

아래 16개 그룹을 `npm run test:toastir`로 실행했다. 정상 CLICK·READ와 동일 사람 세션의 저장소/BroadcastChannel 전달도 대조군으로 확인하여 단순히 모든 동작을 막는 결과를 성공으로 집계하지 않았다.

| 그룹 | 시험과 결과 |
| --- | --- |
| 1 | read 범위 부여 전 스냅샷 요청 거부 |
| 2 | 페이지 전역으로 runtime 사칭 불가; form 값 미포함 |
| 3 | hidden/투명 상위 요소/숨김 자식/중첩 form 값 미포함 |
| 4 | 승인 없음·사용자 거절·위조 토큰·추가 approved 필드 거부, 정확한 승인은 1회만 click |
| 5 | 같은 DOM ID·이름·markup의 복제 노드로 바꿔치기 거부; 공격 handler 실행 0 |
| 6 | 원래 Node 제거 후 재삽입(ABA)도 이전 참조 무효화 |
| 7 | 승인 대기 중 버튼 의미 변경 시 승인 발급 거부 |
| 8 | 동일 origin 재탐색 후 이전 문서 승인 재사용 거부 |
| 9 | 캡처 대기 중 stop 호출 시 대기 중 click 발생 0 |
| 10 | 최종 dispatch 직전 DOM 교체를 mutation drain이 감지 |
| 11 | overlay가 덮은 대상 click 거부 |
| 12 | 사람→AI 및 AI 작업 간 cookie/localStorage 미공유; 실제 marker 저장을 대조 확인 |
| 13 | BroadcastChannel이 같은 사람 세션 peer에는 도착하고 AI 작업들에는 미도착 |
| 14 | 다른 tab/document 참조 거부; 모든 scope를 자기 것으로 바꿔도 반환은 자기 탭 데이터뿐 |
| 15 | A 작업의 승인 토큰을 B 작업에서 사용 불가 |
| 16 | 모델 value의 코드 모양 문자열이 실행되지 않고 데이터로만 처리됨 |

시험에서는 각 세션의 HTTPS 프로토콜 handler로 `https://fixture.test`에 정적 HTML을 제공했다. 네트워크 TLS 서버를 가장하거나 인증서 검증을 해제하지 않았다. 이 시험은 DOM/세션 검사이며 TLS 네트워크 검증 결과가 아니다. 실제 TLS 거부는 기존 `test:electron`의 별도 로컬 서버 테스트다. 샌드박스와 Site Isolation은 유지했다.

## 결과와 제한

- `npm test`: 24개 단위·모듈 테스트 통과, 실패/스킵 0.
- `npm run test:toastir`: 위 16개 그룹 통과, 종료 코드 0.
- 기존 `npm run test:electron`: 13개 그룹 재검증 통과. Linux에서 OS 암호화 저장소 불가 상태는 거부 확인, 실제 OS 암호화 왕복은 이전과 동일하게 미실행.
- Windows CI 실행 및 새 Windows 바이너리 검증 결과는 아직 없다.

아직 실제 모델, 제품의 승인·작업 UI, 전체 AX 구조, iframe/shadow DOM, 바이너리 IR와 모든 행동이 연결된 제품은 아니다. controller의 grant/approval callback은 신뢰된 host API이며 웹 IPC로 공개하면 안 된다. 사이트의 표시 이름도 여전히 비신뢰 데이터다. 폼·숨김 값 필터가 페이지에 표시된 모든 비밀을 알아내지는 못한다.

CLICK의 Node 동일성과 상태 검사는 임의 페이지 event handler의 의미나 서버의 전송/결제 결과까지 증명하지 않는다. 이미 Chromium에 전달한 행동을 소급 취소하지 못한다. 네이티브 Chromium 취약점이나 모든 프롬프트 인젝션 방어를 주장하지 않는다. 같은 사람 프로필의 정상 동일 출처 저장소 공유는 의도된 브라우저 동작이며 유출로 분류하지 않았다.

## 같은 날 확대 검사

이후 [확대 보안 검사](EXPANDED-SECURITY-REVIEW.md)에서 이 suite를 19개 그룹으로 늘려 모두 통과했다. IndexedDB 및 CacheStorage의 사람/AI·AI 작업 간 분리와, 종료한 AI 세션의 쿠키/localStorage/IndexedDB/CacheStorage 정리를 실제 Electron으로 추가 확인했다. 같은 사람 세션에서는 데이터가 공유되는 양성 대조군도 사용했다.

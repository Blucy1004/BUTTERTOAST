# 확대 보안 검사 — 2026-11-07

대상: ButterToast 개발 소스, Linux x64. 런타임에서 확인한 Electron **45.2.3**, Chromium **156.0.8078.80**, 내장 Node **24.22.2**, V8 **15.6.75.27-electron.0**. 빌드/모듈 검사 Node는 24.22.1이다. 모든 동적 공격은 로컬 HTTP 서버, 테스트 전용 HTTPS-origin 프로토콜 fixture 및 별도 악성 렌더러로 수행했다. 운영 서비스·다른 계정은 공격하지 않았다.

현재 구현된 공격 표면을 넓게 검사했다. 알려진 취약점 전체를 실행했거나 안전성을 보증하는 결과는 아니다. **새로 확인한 실행 설정 검사의 누락을 수정했고, 아래 공격 회귀에서 성공한 권한 우회나 교차 탭 데이터 탈취는 관찰하지 않았다.** 아직 없는 모델/승인 UI·업데이트 설치 경로는 완료된 제품 보안 검사로 취급하지 않는다.

## 실행 결과

| 검사 | 결과와 의미 |
| --- | --- |
| npm audit | 개발 의존성을 포함한 감사 결과 0건. npm 메타데이터의 의존성 수 54. Chromium 전체 CVE의 부재를 뜻하지 않음 |
| Electron 공지 | 공개 목록 7페이지의 70건 확인. 68건은 현재 버전이 게시된 영향 범위 밖. 나머지 2건은 아래 조건 검토 |
| Electronegativity 1.10.3 | 빌드된 JS/HTML 정적 검사. CSP 관련 LOW 경고 1건(SARIF level: note), 아래에서 검토. 스캐너가 놓친 결함이 없다는 뜻은 아님 |
| Gitleaks 8.30.1 | Git 이력 4개 커밋 및 별도 현재 작업 파일 스냅샷에서 유출 검출 0. 값은 redaction 모드로 검사 |
| npm test | 모듈 검사 37개 통과. 변형 JSON 10,000회, 주소 입력 2,000회, 경로·승인 상한·서명 변조 포함 |
| test:electron | 실제 앱 보안·UI·단축키 16개 그룹 통과 |
| test:toastir | 실제 요소 교체·승인·정보 경계·저장소 정리 19개 그룹 통과 |
| test:browser | 실제 멈춤·충돌·복원·자원 정리·추적 차단 11개 그룹 통과 |
| test:extended | 새 실제 Electron 공격 검사 12개 그룹 통과 |
| 비밀 패턴 검사 / SBOM | 기존 패턴 검사 미검출, CycloneDX SBOM 생성 |
| npm audit signatures | **미완료**. TUF 서명 메타데이터 다운로드에서 HTTP 403. 프록시 환경 변수를 유지한 재시도도 실패. 서명 검증 통과로 기록하지 않음 |

총 **37개 모듈 검사 + 58개 실제 Electron 검증 그룹**이다. 입력 변형 수는 검사 입력 수이며 서로 다른 취약점 수가 아니다. Windows 실행, GitHub Actions 실행 결과 또는 출시 심사 완료를 의미하지 않는다.

## 발견하고 수정한 설정 누락

`assertSafeLaunch`는 `--ignore-certificate-errors` 등 일부 위험 플래그를 거부했지만 `--ignore-certificate-errors-spki-list`, `--allow-insecure-localhost`, `--disable-gpu-sandbox`, `--single-process`, `--unsafely-treat-insecure-origin-as-secure` 등의 변형은 거부하지 않았다.

수정 전에는 실제 정책 함수의 플래그 조회만 모의 처리한 테스트에서 누락이 재현됐다. `launch-policy.ts`로 검사를 분리하고 인증서·격리·디버깅·실험 기능 관련 29개 플래그를 거부하도록 확장했다. 이 검사는 **해당 옵션을 실제 Chromium에 켜지 않고** 수행했다. 원격 페이지가 임의 실행 옵션을 주입하는 경로를 발견했다는 의미는 아니며, 잘못된 실행 설정을 차단하는 보완이다.

확대 검사 중 개발용 Electron이 `allow-file-access-from-files`를 암묵적으로 추가하는 것도 확인했다. 명시적으로 전달된 이 옵션은 거부하고, Electron의 암묵적 기본값은 앱 시작 시 제거한다. 실제 앱 검사에서 제거된 상태와 정상 동작을 확인했다. Windows 패키지의 기존 `GrantFileProtocolExtraPrivileges=false` fuse 정책도 유지한다.

## 실제 추가 공격과 대조군

| 공격/경계 | 확인 결과 |
| --- | --- |
| 외부 페이지 Node·worker·preload·webview | Node/브리지 미노출, worker도 동일. 권한을 요청하는 webview 태그로 콘텐츠 생성 불가 |
| UI 경로 탐색 | 이중 인코딩, 역슬래시, NUL 표현, 임의 파일·호스트·userinfo·POST 거부. 허용 목록의 파일만 제공 |
| UI XSS/통신 | DOM에 주입한 inline/external script, iframe, form, fetch 차단. CSP 위반 이벤트 및 로컬 서버 요청 부재 확인 |
| 팝업 및 권한 옵션 주입 | window.open의 nodeIntegration/contextIsolation/sandbox 옵션으로 새 콘텐츠 생성 불가 |
| 위험 탐색 스킴 | 페이지의 file/data/blob/toast-ui/chrome/devtools/임의 외부 프로토콜 탐색 차단 |
| SOP/CORS | 다른 origin iframe DOM 읽기 및 응답 읽기 거부. 동일 origin 읽기는 성공하는 대조군 포함 |
| 사이트·장치 권한 | 위치·알림·카메라·마이크 query가 denied, 실제 미디어·화면 캡처도 허용되지 않음 |
| TLS/다운그레이드 | 기존 실제 자체서명 인증서 요청 거부 유지. 별도 HTTPS-origin fixture에서 HTTP 탐색·리디렉션이 HTTP 처리 전에 거부됨 |
| IPC/이벤트 사칭 | 잘못된 250개 명령 뒤 정상 명령도 한도 내 거부, 대기 후 정상 입력 복구. 페이지 KeyboardEvent/postMessage로 탭 생성 불가 |
| AI 저장소 | 쿠키/localStorage/BroadcastChannel에 더해 IndexedDB·CacheStorage 분리. 같은 사람 세션의 공유는 성공하는 대조군 포함 |
| AI 종료 후 정리 | 닫힌 작업의 세션을 테스트에서 다시 열어 쿠키·localStorage·IndexedDB·CacheStorage가 비었는지 확인 |
| 승인·서명 | 승인 32개 상한과 만료, 외부 origin 사용 거부. signed manifest/signature/artifact의 각 바이트를 한 번씩 바꾼 변조 거부 |

`toast-ui://app:99/index.html`은 Chromium이 이 사용자 정의 스킴의 포트를 제거한 뒤 처리하여 동일 정적 파일로 정규화됐다. 이를 파일 경로 또는 IPC 인증 우회로 세지 않았다. 다른 호스트는 거부되며 UI의 발신 WebContents·최상위 프레임·정확한 URL 검사와 세션 분리를 유지한다. 직접 asset resolver에 포트가 남아 있는 URL을 전달하면 거부한다.

## Electron 공식 권고 20개 대조

[공식 security checklist](https://github.com/electron/electron/blob/main/docs/tutorial/security.md)를 기준으로 검토했다.

| 항목 | 현재 상태 |
| --- | --- |
| 1 안전한 콘텐츠 로딩 | UI는 secure custom scheme. 사용자가 명시한 HTTP 사이트는 허용하고 경고하므로 HTTPS 전용은 아님 |
| 2 원격 Node 통합 금지 | renderer/worker/subframe 비활성화, 실행 검사 |
| 3 Context Isolation | 활성화, 실제 페이지/isolated world 경계 검사 |
| 4 sandbox | 유지. 샌드박스 해제 옵션 없이 실제 Electron 실행 |
| 5 권한 요청 처리 | 세션 요청·check·device·display 거부 |
| 6 webSecurity | 활성화. SOP/CORS 대조군 검사 |
| 7 CSP | 응답 헤더와 meta 적용. 실제 주입·통신 차단 검사 |
| 8 혼합 활성 콘텐츠 | allowRunningInsecureContent=false. TLS 검증과 탐색 다운그레이드 거부 유지 |
| 9~10 실험/Blink 기능 | 앱에서 활성화하지 않으며 관련 외부 실행 플래그 거부 |
| 11~12 webview/popups | webviewTag=false, 부착·팝업 거부. 외부 페이지 요청 검사 |
| 13 탐색 제한 | HTTP(S) 범위, 자격 증명 URL·위험 스킴 거부 |
| 14 창 생성 제한 | setWindowOpenHandler deny |
| 15 openExternal | 제품 코드에 호출 없음. 외부 프로토콜 기본 거부 |
| 16 최신 버전 | npm latest 45.2.3과 일치, 공식 release·보안 공지 대조 |
| 17 IPC sender 검증 | 실제 UI 콘텐츠 및 최상위 프레임 신원·URL, 스키마·빈도 검사 |
| 18 file 대신 custom scheme | UI 전용 세션·정적 파일 허용 목록. 암묵적 file 권한도 제거 |
| 19 fuses | 기존 패키징 스크립트의 제한 유지. 이번에는 새 Windows 패키지를 생성/실행하지 않음 |
| 20 Electron API 노출 제한 | UI 브리지는 제한된 명령·상태·주소창 포커스만 제공. 원격 페이지에는 없음 |

## 공식 공지 대조 및 도구 해석

70건의 원문 URL·영향/수정 버전·판정은 [기계 판독 기록](ELECTRON-ADVISORY-REVIEW.json)에 저장했다. 최신 10건은 설명의 사용 조건도 읽었다. 인증서 폐기, pointerLock·HID/USB·외부 프로토콜의 출처 혼동, GPU 캡처 메모리 읽기, webview worker Node 통합, 팝업 sandbox 상속, custom protocol CORS·세션 캐시 혼동 등을 포함한다. Chromium/V8 개별 메모리 손상 exploit을 실행한 결과는 아니다.

별도 검토한 두 공지는 다음과 같다.

- [CVE-2026-102672 / GHSA-vv43-5jgx-7qv8](https://github.com/electron/electron/security/advisories/GHSA-vv43-5jgx-7qv8): 게시된 한 영향 범위가 `>=40.0.0-alpha.1`로 상한이 없어 45.2.3도 매칭됐다. 임의로 버전 판정을 통과로 고치지 않았다. 설명상 macOS의 Squirrel.Mac/ShipIt 업데이트가 필요한 문제이며 현재 Windows 대상·해당 업데이트 기능 미사용에는 적용되지 않는다. macOS 배포를 추가하면 재검토해야 한다.
- [GHSA-2hfc-r8fq-92h7](https://github.com/electron/electron/security/advisories/GHSA-2hfc-r8fq-92h7): npm 런타임 버전 대신 commit hash가 있는 Electron 저장소의 issue workflow 코드 주입 문제다. ButterToast에는 해당 workflow가 없고 issue 본문을 실행 스크립트에 삽입하지 않는다. 현재 CI는 SHA 고정 Actions, 읽기 전용 permissions, checkout credential 비보존을 사용한다.

Electronegativity는 외부 번역/버전 다운로드 중 구형 HTTP 클라이언트 오류로 처음 종료됐다. 번역만 로컬 내장 en-US로 고정하고 `AvailableSecurityFixesGlobalCheck` 네트워크 검사를 제외한 뒤 정적 검사를 완료했다. 그 버전 검사는 별도로 npm latest와 위 공식 공지 70건으로 대체했다. 나머지 스캔 규칙은 변경하지 않았다. 결과의 `CSP_GLOBAL_CHECK` LOW 경고(SARIF level: note)의 내부 평가 결과는 “'self' can be problematic if you host JSONP, Angular or user uploaded files.”였다. 현재 UI는 사용자 업로드·JSONP·외부 스크립트를 제공하지 않는 고정 파일 허용 목록이며 실제 주입 검사도 통과했다. 경고를 숨기거나 스캐너의 결함 미발견을 안전 보장으로 해석하지 않는다.

Gitleaks는 공식 v8.30.1 Linux x64 archive를 공식 checksums와 SHA-256 대조 후 실행했다. 조회 결과와 원시 로그/SARIF/SBOM은 작업 환경의 `artifacts/security-review/`, `artifacts/sbom.cdx.json`에 있으며 Git에는 결과 요약과 공지 대조만 저장한다.

## 재실행 및 한계

```sh
npm run test:security
npm run sbom
```

`test:security`는 빌드·모듈 및 네 가지 실제 Electron suite·npm 감사·기존 비밀 패턴 검사를 실행한다. 외부 도구 및 공식 공지 조회는 이번 수동 검토이며 이 명령에 포함되지 않는다. CI에도 `test:extended`를 추가했다. Linux는 정상 Chromium sandbox가 필요하며 Windows는 OpenSSL이 필요하다.

미완료/미적용 항목:

- Windows 실제 실행·DPAPI, macOS, 실제 GPU 드라이버, 네이티브 메모리 손상 exploit 및 sandbox escape 전체, 최신 Chromium/Node CVE 전체의 개별 대조, 장시간/대규모 DoS 검사는 미완료다.
- npm 패키지 서명·provenance 감사는 위 다운로드 403으로 완료하지 못했다. lockfile/SBOM·의존성 감사와 서명 검증은 서로 다른 검사다.
- 모델 제공사/제품 승인 UI, 실제 업데이트 다운로드·설치·복구, 코드 서명은 아직 없다. 현재 Guard/실험 실행기와 서명 검증 모듈의 결과를 미래 통합 경로의 검증으로 취급하지 않는다.
- SQL 서버·웹 백엔드·파일 업로드·로그인 API가 없어 SQL injection·서버 command injection·서버 인증 우회 등은 현재 해당 실행 경로가 없다. 브라우저가 표시하는 외부 사이트 자체의 취약점도 이 감사 대상이 아니다.
- HTTP 사이트의 평문 통신, 같은 사용자 OS 계정/메인 프로세스 장악, 동일 origin 사람 탭의 정상 저장소 공유, 페이지 표시 내용을 통한 프롬프트 인젝션의 모든 의미적 변형을 제거했다는 보장은 없다.

# Operation Toast Torture 재현

0.5.0 신규 기능과 측정 결과는 [Golden Crust 보고서](GOLDEN-CRUST-REPORT.md)에 있다. `npm run test:crust`는 실제 앱의 커맨드바·분할·그룹·창 이동·초안·기록과 별도 프로세스 복원을 검사하며 `test:security`에도 포함된다. 아래 기존 Torture 검사도 계속 실행한다.

현재 결과와 한계는 [보고서](TOAST-TORTURE-REPORT.md)를 참조한다. 실제 키나 계정 없이 로컬 fixture만 사용한다. 프로덕션 패키지는 `test/`, Mock 공급자, 테스트 cipher를 포함하지 않는다.

## 빠른 기능·보안 검증

```sh
npm ci
npm run test:security
npm run test:torture
```

`test:torture`의 공급자 timeout 검사는 실제로 약 60초 기다린다. Node timer를 가속하지 않는다. 테스트 프로필은 OS 임시 폴더에 새로 생성하며 기존 사용자 프로필을 사용하지 않는다. Linux에 정상 동작하는 Chromium sandbox가 필요하며 `--no-sandbox`로 우회하지 않는다. 클라우드 컨테이너 내부의 중첩 sandbox 제한에서는 환경에서 허용한 외부 실행 경로를 이용한다.

`test:torture`는 Mock HTTP → ModelAdapter → 실제 앱 UI/IPC → AiService → ToastController/Guard → Chromium DOM을 검사한다. native dialog 응답만 테스트 코드에서 결정한다. 현재 앱은 비스트리밍 JSON을 요청한다. Mock의 chunked JSON은 정상 조립되며, unsolicited SSE는 실패로 처리된다. 스트리밍 UI가 구현되었다는 의미가 아니다.

Linux display가 없으면 native browser 시험은 미검증으로 기록한다. 실제/가상 X display가 있으면 다음 명령으로 실행한다.

```sh
# 인증된 DISPLAY/XAUTHORITY를 기존 환경에서 상속한다.
node_modules/.bin/electron --disable-gpu test/torture/native-browser.cjs
node_modules/.bin/electron --disable-gpu test/torture/ai-browsing.cjs
npm run benchmark:torture
```

OS 파일 선택창을 자동 조작하지 않는다. native chooser 요청을 CDP로 관측하고 테스트 파일만 선택한 후, 별도 `test:compatibility`가 실제 multipart 전송을 검증한다.

## 장시간 브라우저 시험

공식 Chrome for Testing 바이너리와 Playwright core 경로를 환경에 설정한다. 경로는 로컬 설치 위치이며 API 키가 아니다.

```sh
export BUTTERTOAST_CHROME_PATH=/path/to/chrome
export BUTTERTOAST_PLAYWRIGHT_MODULE=/path/to/playwright-core
npm run benchmark:torture:long -- --quick
npm run benchmark:torture:long
```

첫 명령은 각 5초짜리 장치 점검이다. 15분/30분/5분 통과로 집계하지 않는다. 두 번째 명령은 A 10탭 15분, B 20탭 30분, C 50탭 5분을 실제 monotonic/wall clock으로 잰다. 두 브라우저를 동일 호스트에서 함께 실행하므로 전체 약 50분과 준비/복구 시간이 필요하다. 실행 시작 시 앱 `dist`와 버전을 고정하여 이후 수정과 섞이지 않게 한다. 새 timestamp 출력 디렉터리를 만들고 기존 결과를 덮어쓰지 않는다.

추가 옵션 `--baseline /path/to/frozen-app`과 `--output /new/output/path`로 특정 고정 빌드를 사용할 수 있다. 고정 빌드에는 `dist/main.js`, `package.json`, `source.json`이 필요하다.

두 엔진은 동일한 로컬 fixture, 탭 수, viewport와 작업 순서를 사용한다. Chromium 버전·UI/드라이버·메모리 절약 정책과 동시 부하가 다르므로 제품 성능 우열을 입증하는 벤치마크는 아니다. RSS는 공유 페이지를 중복 집계하므로 PSS도 함께 기록한다. `/proc` CPU 값은 살아 있는 프로세스 합계이며 프로세스 종료가 있는 구간은 누락될 수 있다.

```sh
node scripts/torture-restore.cjs
node scripts/torture-chrome-restore.cjs
node scripts/torture-startup.cjs
```

강제 종료 복구는 테스트 전용 프로필의 프로세스 그룹에만 SIGKILL을 보낸다. ButterToast 복구 시험의 AES-GCM 대체 cipher는 디스크 저장/원자성 확인용이다. Windows DPAPI와 Linux 실제 keyring을 검증하지 않는다. Chrome 복구 실패도 그대로 기록하며 브라우저 자체의 복구 불가능으로 일반화하지 않는다.

## 실패의 해석

ToastIR 성능 시험은 7개 작업을 각 3회 반복하며 첫 시도 실패도 JSON에 보존한다. 수정 전 `task-changed`로 중단된 SPA/문서 탐색의 실패를 보존한다. 수정 후에는 실제 실행 receipt, 같은 origin의 로딩 완료, 새 controller/snapshot과 다음 동작의 재승인을 검증한다. 중단/직접 입력/다른 origin은 계속 막는다. 즉시 통과한 일반 CDP와 다르게 권한/문서 재검증 비용이 포함된다. 실제 모델을 호출하지 않아 청구 토큰이나 비용 절감을 주장하지 않는다.

기준/수정 후 JSON, 실패한 예비 실행과 환경 제약은 결과 보고서에서 구분한다. 패키지·해시만으로 Windows 실행을 검증했다고 표시하지 않는다.

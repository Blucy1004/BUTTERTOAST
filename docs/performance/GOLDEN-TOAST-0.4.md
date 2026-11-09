# Golden Toast 0.4 — 실제 로컬 측정

2026-11-09 UTC. Linux 6.18.57 x86_64, Node 24.22.1, 5개 논리 CPU, 페이지 4096 bytes/CLK_TCK 100. 별도 새 프로필, sandbox/Site Isolation/TLS 유지, headless/소프트웨어 렌더링. 실제 제공사 키·추론·사용자 계정 없음. 비용이나 모델 토큰의 절감률을 주장하지 않는다.

## 같은 fixture의 브라우저 코어와 Chrome 참조

고정 33,288바이트 HTML(본문 120개 section, 버튼/카운터), 서로 다른 50개 `.test` origin, 1050×720 콘텐츠 크기. Electron BrowserTabs는 HTTPS protocol fixture, Chrome은 Playwright CDP route fixture를 사용한다. 두 엔진을 순차 실행했다. 10→25→50 누적 탭이며 각 구간의 새 탭 로딩은 10/15/25표본, 전환은 각 10표본이다. 표는 이 실행의 중앙값이다.

**비교 한계:** ButterToast 코어 fixture는 전체 앱 UI/AI 창이 없고 Chrome은 전체 브라우저와 CDP 드라이버를 사용한다. 엔진 버전도 Electron Chromium 156.0.8078.80과 공식 Chrome for Testing 157.0.8103.38로 다르다. 시작·routing·탭 활성화·백그라운드 프레임 정책의 차이가 포함된다. 실제 네트워크·GPU·확장·Windows 결과가 아니며 Chrome보다 빠르다거나 가볍다는 제품 우열 결론을 내리지 않는다.

| 엔진 | 탭 | 새 탭 로드 ms | 전환+2 RAF ms | RSS 합 MiB | PSS 합 MiB | Private 합 MiB | 1초 idle CPU % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ButterToast 코어 | 10 | 64.18 | 16.62 | 812.4 | 305.8 | 206.2 | 5.87 |
| ButterToast 코어 | 25 | 68.01 | 16.69 | 1498.3 | 487.0 | 381.8 | 3.89 |
| ButterToast 코어 | 50 | 85.66 | 17.95 | 2630.5 | 784.5 | 678.4 | 5.78 |
| Chrome 참조 | 10 | 83.41 | 50.00 | 2679.2 | 599.1 | 363.5 | 5.84 |
| Chrome 참조 | 25 | 76.49 | 35.28 | 4887.2 | 885.1 | 597.6 | 6.69 |
| Chrome 참조 | 50 | 82.66 | 49.64 | 8562.4 | 1358.6 | 985.1 | 8.44 |

RSS는 같은 라이브러리 페이지를 여러 프로세스에서 중복 합산한다. PSS(공유 페이지를 비례 분배)와 private도 `/proc/<pid>/smaps_rollup`으로 측정했다. 위 탭 수별 표는 모든 자식 프로세스의 PSS를 읽었다. 각 앱의 process tree만 합산하고 외부 Playwright 드라이버는 제외한다. Electron fixture driver는 메인 프로세스 안에 있다. CPU는 각 `/proc/<pid>/stat`의 user+system tick 차이/벽시계 시간으로 계산한 1코어 기준 %이며 1초 표본·파일 읽기 오버헤드·프로세스 종료에 민감하다. 실사용 평균/배터리 측정이 아니다. 원본에는 p95와 표본 수를 포함한다.

## ToastIR 표현과 동작

같은 카운터 버튼에 실제 ToastController/Guard CLICK 12회와 fixture용 직접 DOM click 12회를 번갈아 실행했다. native 확인은 fixture가 승인했으며 사람이 읽고 클릭하는 시간과 모델 시간은 포함하지 않는다. 직접 DOM은 보안 경로를 우회하는 **테스트 대조군**이며 production AI 기능이 아니다.

- ToastIR 캡처 중앙값 **17.93 ms**, 원문 DOM 가져오기 **0.69 ms**. 가시성/개인정보/문서 검사가 포함되는 ToastIR가 이 수집에서는 더 오래 걸렸다.
- 검증된 CLICK 전달 **41.52 ms**, 직접 DOM dispatch **0.40 ms**. fixture 카운터 변화 성공 **12/12**, 재시도 0, fixture 승인 12회. 실제 모델의 업무 성공률이 아니다.
- HTML fixture **33,288 bytes**, 전체 내부 IR **101,640 bytes**, 첫 모델 compact frame **27,525 bytes**, 이후 선택 frame **12,948–12,951 bytes**. full IR에는 더 많은 요소/지문/관계가 있고 모델 입력은 100요소/12,000자에 잘려 있어 동일 정보량 비교가 아니다.
- 변경분 수치는 기준 원본이 있는 codec 경로의 프레임 크기다. 실제 AiService는 요청 이력의 길이에 따라 원본을 다시 보낸다. 전체 HTTP payload·제공사 토큰/캐시 과금이 이 비율로 줄어드는 것은 아니다. `realModelTokens: null`을 유지한다.
- 실제 수집된 607노드/362요소, 본문 12,000자에서 잘림이 표시됐다. 필요한 정보가 잘린 경우 스크롤·재수집·사람 확인이 필요하다.

49개 페이지를 수동 해제하고 논리 탭 50개/활성 콘텐츠 1개를 남겼을 때 RSS 합은 **2691.0→396.3 MiB**였다. 해제 후 한 프로세스의 PSS를 읽지 못해 전체 PSS는 null로 기록했다. 이는 WebContents 파괴 효과이며 자동 메모리 절약의 실사용 절감률이나 사이트 상태 복원을 증명하지 않는다.

## 실제 앱 시작과 5분 soak

시작은 매번 새 userData 프로필을 사용했고, 부모 Node spawn 직전부터 production UI가 초기화되어 새 탭 버튼이 활성화될 때까지 측정했다. OS 파일 캐시는 비우지 않았으므로 완전한 디스크 콜드 스타트라고 부르지 않는다. 클라우드 Linux의 3회 표본이며 Windows 시작 시간의 근거가 아니다.

- 프로세스 시작→UI 사용 가능: **475, 461, 436 ms**.
- 별도 전체 production UI 실행: 탭 **50개**, **301.4초**, **454회 탭 전환/22회 새로고침**, 관찰된 충돌/응답 없음 **0**.
- RSS 합 처음 **2737.7 MiB** / 마지막 **2747.3 MiB**. soak에는 PSS 측정 추가 전의 수집기를 사용했다. 수분 결과로 하루 사용/누수 부재를 보증하지 않는다.
- 첫 automation은 새 탭/탐색 명령을 IPC quota보다 빠르게 보내 일부가 거부됐다. 앱 보호를 바꾸지 않고 시험 입력을 125ms 간격으로 수정한 뒤 완료했다. 이 soak는 처리량 벤치마크가 아니다.

## 공개 사이트 smoke

실제 production 앱과 Cloud 프록시/TLS 검증으로 공개 landing page만 읽었다. 계정 로그인·메일 전송·문서 편집·파일 업로드·구매·영상 재생을 하지 않았다. 렌더링 성공은 해당 서비스 전체 호환성의 증거가 아니다.

| 요청 | 결과 | 실제 범위 |
| --- | --- | --- |
| Google | HTTP 200 / complete | 검색 첫 화면 |
| GitHub | HTTP 200 / complete | 공개 홈페이지 |
| Wikipedia | HTTP 200 / complete | 언어 선택 첫 화면 |
| Google Docs | HTTP 200 / complete | Google Accounts 로그인 화면 |
| Google Drive | HTTP 200 / complete | Google Workspace 제품 소개 |
| Gmail | HTTP 200 / complete | Google Workspace 제품 소개 |
| YouTube | 미검증 | ERR_TUNNEL_CONNECTION_FAILED |

Docs는 로그인 화면, Drive/Gmail은 제품 소개로 이동했다. 인증 후 앱 동작은 미검증이다. YouTube는 프록시 터널 연결 오류로 검증하지 못했으며 인증서/보안 옵션을 꺼서 우회하지 않았다. 일부 광고/추적 iframe의 차단 로그는 정책에 따른 것이며 사이트 전체 오류로 집계하지 않는다. 로드된 페이지에서 require/browser/ai 브리지는 모두 undefined였다.

## 재현

```sh
npm ci
node scripts/install-electron.cjs
npm run test:security
# 공식 Chrome 실행파일과 별도로 설치한 playwright-core 경로를 지정한다.
BUTTERTOAST_CHROME_PATH=/path/to/chrome \
BUTTERTOAST_PLAYWRIGHT_MODULE=/path/to/playwright-core \
npm run benchmark:golden
npm run soak:golden
# 실제 외부 공개 페이지 GET, 로그인/제출 없음
node scripts/site-smoke-golden.cjs
```

지원되는 Chromium sandbox가 필요하다. `--no-sandbox`/인증서 검증 해제는 사용하지 않는다. Chrome은 [공식 Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)의 157.0.8103.38 Linux x64를 사용했다. 원본 JSON은 이 폴더의 `performance-golden-*.json`과 `public-site-smoke-golden.json`이다. 수집 코드와 fixture는 `scripts/benchmark-*.cjs`, `scripts/soak-golden.cjs`, `test/benchmark-golden-electron.cjs`, `test/soak-golden.cjs`에 있다.

## 로컬 영상·업로드 호환성

`npm run test:compatibility`는 실제 BrowserTabs와 동일 sandbox 설정으로 자체 생성한 64×64 무음 VP9 WebM의 재생 시간/디코딩 프레임을 확인하고, 민감 정보 없는 임시 텍스트 파일을 로컬 HTTPS fixture의 multipart POST로 제출해 바이트/파일명을 검증한다. 모델이나 외부 사이트로 파일을 보내지 않는다. 결과는 `local-media-upload-golden.json`에 있다.

이 host의 headless WebContentsView는 visible=true여도 document.hidden 상태로 native 포인터 클릭을 전달하지 못했다. 이 테스트에서는 파일 선택을 test-only CDP, 제출을 표준 form.requestSubmit으로 분리했다. **OS 파일 선택창/실제 포인터 제출·오디오·DRM·YouTube 재생은 미검증**이며 이 결과로 통과했다고 표시하지 않는다. 앱의 sandbox/TLS/파일 권한을 변경하지 않았다. 기존 production UI의 native 탭 드래그 검증과는 다른 범위다.

클립은 FFmpeg로 직접 생성한 단색 2초 영상이며 제3자 촬영물을 사용하지 않았다:

```sh
ffmpeg -v error -f lavfi -i color=c=blue:s=64x64:r=10 -t 2 -c:v libvpx-vp9 -an test/fixtures/playback.webm
```

# ButterToast 0.1.0 — Windows x64 공격 실험용 빌드

1. ZIP을 폴더 전체로 압축 해제한다.
2. 폴더의 `ButterToast.exe`를 실행한다. Node.js나 npm 설치는 필요 없다.
3. exe만 별도 위치로 이동하면 안 된다. resources, locales, DLL 등 전체 파일이 필요하다.

Windows 11 x64 대상의 서명되지 않은 개발 테스트 빌드다. Linux에서 교차 패키징했으며 이 Windows 실행 파일을 Windows에서 직접 실행한 결과는 아직 없다. Windows 코드 서명과 설치 프로그램, 자동 업데이트는 제공하지 않는다. 앱 프로필은 Windows 사용자 계정의 AppData/Roaming/ButterToast에 저장된다.

## 실험 범위

현재 실행 가능한 기능은 탭/주소 입력/탐색과 브라우저 보안 경계다. 사이트·장치 권한, 팝업과 다운로드는 기본 거부한다. 메인 IPC 사칭, 악성 페이지, iframe 격리, 인증서 거부, renderer crash 복구 등의 Linux Electron 결과는 `SECURITY-VALIDATION.md`에 있다.

ToastGuard, 키 저장소, 업데이트 검증기는 소스에 포함된 독립 모듈이며 UI/AI/자동 업데이트 실행 경로에 연결되지 않았다. 이 exe에서 AI 결제/삭제나 API 키 입력을 시험할 수 있는 UI는 아직 없다. 모듈 공격 회귀 테스트는 소스 묶음에서 `npm ci` 후 `npm test`로 실행한다.

## 배포 바이너리 보안

Chromium 샌드박스와 사이트 격리를 유지한다. Electron fuse로 RunAsNode, NODE_OPTIONS, Node 검사 인자 및 file 프로토콜 추가 권한을 끈다. ASAR 전용 앱 로딩 및 내장 ASAR 무결성 검증, 쿠키 암호화를 켠다. `BUILD-VERIFICATION.json`에 실제 exe에서 다시 읽은 설정과 해시를 기록한다.

ASAR 무결성은 애플리케이션 코드 변조 감지를 위한 기능이다. 이 테스트 빌드는 코드 서명되지 않았으므로 공격자가 exe 자체와 내장 검증 정보까지 바꾼 경우를 방어한다고 주장하지 않는다. 샌드박스 해제나 TLS 오류 무시 옵션은 사용하지 않는다.

## 재빌드

Node.js 24 권장. 저장소에서:

```text
npm ci
npm test
npm run sbom
npm run package:win
```

`artifacts/windows/ButterToast-win32-x64`가 생성된다. Electron의 공식 Windows 바이너리는 패키징 도구가 체크섬 검증 후 사용한다. 프록시가 필요한 Node.js 24 환경은 플랫폼이 제공한 프록시와 인증서 설정을 유지하고 `NODE_USE_ENV_PROXY=1`을 사용할 수 있다.

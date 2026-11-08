# Windows 11 x64 개발 빌드

최신 소스의 포터블 폴더와 NSIS 설치 프로그램을 만들 수 있다. **서명 없는 개발 빌드이며 Windows 직접 실행·설치·제거는 아직 검증하지 않았다.** Linux 패키징 검증을 Windows 실행 결과로 취급하지 않는다.

## 실행 파일

- 설치 프로그램: `artifacts/ButterToast-0.1.0-Setup-x64.exe`
- 포터블 실행 파일: `artifacts/windows/ButterToast-win32-x64/ButterToast.exe`

포터블은 전체 폴더를 함께 옮겨야 한다. exe 하나만 복사하면 DLL·resources가 없어 실행되지 않는다. 소스 ZIP의 src 폴더에는 실행 파일이 없다.

설치 프로그램은 관리자 권한 없이 현재 사용자의 LocalAppData/Programs/ButterToast에 설치하고 시작 메뉴·프로그램 제거·기본 브라우저 후보 등록을 만든다. 기본 브라우저 선택은 앱의 관리 → 설정 → OS 기본 브라우저 설정에서 사용자가 결정한다. 설치/제거 전 앱을 닫아야 한다. 제거해도 AppData/Roaming/ButterToast 프로필은 자동 삭제하지 않는다.

## 빌드

```sh
npm ci
npm test
npm run package:win
# NSIS makensis가 설치된 환경
npm run package:installer
```

프록시가 필요한 Node 24 환경에서는 제공된 프록시/CA를 유지하고 `NODE_USE_ENV_PROXY=1`을 사용할 수 있다. Electron 다운로드 캐시는 저장소의 무시된 artifacts/.electron-cache에 둔다. NSIS 경로를 별도로 지정하려면 MAKENSIS_BIN 환경변수를 사용한다.

패키징은 허용된 앱 자산·고정 운영 지침만 포함하며 ASAR payload, Windows x64 PE, sandbox 관련 fuse와 내장 ASAR 해시를 재검증한다. BUILD-VERIFICATION.json 및 설치 프로그램 옆 JSON에 서명/Windows 검증 여부와 해시를 남긴다.

## 출시 전

실제 Windows에서 키 암호화·탭 복원·기본 브라우저·다운로드·회원가입/복구 콜백·AI 호출을 확인해야 한다. 설치 프로그램은 Authenticode 서명되지 않았다. 업데이트 서버와 게시자 키가 없으므로 현재 자동 업데이트는 비활성이다. 서명과 배포 준비 절차는 [릴리스 설정](RELEASE-SETUP.md)을 참조한다.

# ButterToast

Chromium 기반 AI 협업 브라우저의 개발 버전입니다. 핵심 기능과 보안을 우선하며 최종 UI/UX는 프로젝트 오너의 명세로 결정합니다. 현재 화면은 기능 검증용 임시 컴포넌트입니다.

## 개발 실행

Node.js 22.12 이상과 npm이 필요합니다.

```sh
npm ci
npx --no-install install-electron
npm start
```

Linux에서는 정상 동작하는 Chromium 샌드박스가 필요합니다. 보안 해제 플래그나 TLS 우회는 사용하지 않습니다.

## 현재 기능

탭·탐색·충돌 복구, 북마크·방문 기록, 승인받은 다운로드, 검색·사이트 권한·개인정보 설정, Google 검색 테마를 제공합니다. 검색은 원래 검색 페이지를 열며 자체 결과 화면으로 재구성하지 않습니다.

Supabase 가입·로그인·복구·비밀번호 변경 UI, OpenAI·Claude·Gemini·호환/로컬 모델 연결, 독립 AI 작업 공간 3개, 페이지 공유·승인 동작·최대 10단계 작업·제어권 회수·사용량 추정·암호화 보관을 구현했습니다. OS 보호 저장소가 없으면 키·기록을 평문으로 대체 저장하지 않습니다.

**실제 모델 추론·Windows 실행·일반 사용자 SMTP·서명된 운영 배포 검증은 남아 있습니다.** [전체 구현 현황](docs/IMPLEMENTATION-STATUS.md), [사용법·검증](docs/BROWSER-AI-IMPLEMENTATION.md), [보안](SECURITY.md)을 참조하세요.

## 검증과 빌드

```sh
npm test
npm run test:security
npm run benchmark
npm run package:win
# NSIS 설치 후
npm run package:installer
```

`test:security`는 실제 Electron 로컬 공격 회귀, 계정·AI·관리 화면, 의존성 audit과 비밀정보 패턴 검사를 포함합니다. 실제 악성 서비스나 다른 사용자 계정을 공격하지 않습니다. 테스트 통과는 취약점 부재를 보증하지 않습니다.

실행 파일은 `artifacts/windows/ButterToast-win32-x64/ButterToast.exe`, 설치 프로그램은 `artifacts/ButterToast-0.1.0-Setup-x64.exe`입니다. 포터블 폴더는 DLL/resources와 함께 옮겨야 합니다. [Windows 빌드 안내](docs/WINDOWS-TEST-BUILD.md)를 확인하세요. 현재 빌드는 코드 서명되지 않았습니다.

- [AI 연결과 작업](docs/AI-CONNECTION.md)
- [Supabase 설정](docs/SUPABASE-SETUP.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [릴리스·업데이트 준비](docs/RELEASE-SETUP.md)
- [원래 제품 요구사항](docs/PRODUCT-REQUIREMENTS.md)

# ButterToast

Chromium 기반 AI 협업 브라우저를 위한 초기 개발 저장소입니다. 현재는 보안 경계를 우선한 브라우저 셸의 첫 단계입니다. 최종 UI는 프로젝트 오너의 디자인 명세에 따라 결정합니다. 현재 UI는 기능 검증용 임시 화면입니다.

## 개발 실행

Node.js 22.12 이상과 npm이 필요합니다. Windows 11 x64에서 PowerShell로:

```powershell
npm ci
npm run build
npx --no-install install-electron
npm start
```

Electron 바이너리 설치에는 GitHub 릴리스 다운로드가 필요합니다. Linux에서 샌드박스와 그래픽 환경을 정상적으로 제공해야 합니다. 샌드박스를 끄는 실행 방법은 지원하지 않습니다.

```powershell
npm test
npm run audit:deps
npm run test:electron
npm run test:toastir
npm run test:browser
npm run test:extended
npm run test:account
npm run test:ai
npm run scan:secrets
npm run sbom
```

## 현재 기능과 제한

주소·검색어 입력, 탭 생성·선택·닫기·순서 이동·최근 닫은 탭 복원, 뒤로·앞으로·새로고침의 초기 구현이 있습니다. 주소에 명시한 HTTP는 허용하며, 별도 인증서 검증 우회는 없습니다. HTTPS 표시는 주소의 프로토콜만 뜻하며 양자내성이나 인증서 상세 상태를 나타내지 않습니다. 사이트 권한, 팝업, 다운로드는 현재 일괄 차단됩니다. AI의 기본 API 연결과 승인 기반 단일 클릭은 구현했고, 북마크·방문 기록·일반 설정·설치 프로그램·업데이트는 아직 구현되지 않았습니다. 자세한 현황은 [아키텍처](docs/ARCHITECTURE.md)와 [보안](SECURITY.md)을 참조하세요.

멈춘 탭 재시작, 수동 메모리 해제, OS 암호화를 사용할 수 있을 때 URL 기반 지연 복원, 제한된 추적 요청 차단 및 개인정보 헤더도 구현했습니다. [사용법·시험 결과·한계](docs/CHROMIUM-IMPROVEMENTS.md)를 참조하세요. 메모리 해제와 재시작 시 입력 내용은 사라집니다.

Supabase 이메일 회원가입·로그인·로그아웃과 임시 계정 창을 추가했습니다. 토큰은 메인 프로세스 메모리에만 보관하고 앱 종료 후 다시 로그인합니다. [연결 설정·사용법·검증 범위](docs/SUPABASE-SETUP.md)를 참조하세요. 실제 프로젝트의 메일 수신·확인된 계정 로그인·세션 갱신·로그아웃을 검증했습니다. 실제 PC에서 메일 링크로 앱에 돌아오는 PKCE 흐름과 Windows 실행은 별도 확인이 남아 있습니다.

## AI 연결

위쪽 `AI` 버튼에서 OpenAI·Claude·OpenAI 호환/로컬 API를 연결할 수 있습니다. 대화·페이지 공유·실행 승인·사용량은 ButterToast가 관리하며, 모델에는 추론만 요청합니다. 키는 이번 실행 동안만 사용하거나 OS 암호화로 저장합니다. 현재 탭은 명시적 읽기 공유, 별도 AI 작업 창은 승인받은 단일 클릭까지 지원합니다. [설정·사용법·검증 범위](docs/AI-CONNECTION.md)를 참조하세요. 실제 유료 모델 호출은 키를 연결한 후 검증해야 합니다.

## 보안 개발 결과

실제 Electron 로컬 공격 테스트와 모듈 회귀 테스트를 추가했습니다. 실행 방법과 검증·미검증 범위는 [보안 검증 보고서](docs/SECURITY-VALIDATION.md)에 있습니다. Electron E2E는 로컬 인증서 생성용 OpenSSL이 필요합니다. Linux에서는 사용자 namespace 또는 정상 구성된 Chromium 샌드박스 도우미가 필요합니다.

## Windows 공격 실험용 빌드

`npm run package:win`은 Windows x64 포터블 실행 폴더를 만듭니다. [실행 방법과 한계](docs/WINDOWS-TEST-BUILD.md)를 참조하세요. 서명되지 않은 테스트 빌드이며 Windows 직접 실행은 아직 검증되지 않았습니다.

ToastIR 요소 교체, 승인 재사용, 작업 간 데이터 경계 실험 결과는 [추가 검증 기록](docs/TOASTIR-SECURITY-VALIDATION.md)에 있습니다.

전체 로컬 보안 회귀는 `npm run test:security`로 실행할 수 있습니다. 공식 Electron 공지 70건, 정적·비밀정보 검사, 확대 공격 회귀 결과와 미검증 범위는 [확대 보안 검사 보고서](docs/EXPANDED-SECURITY-REVIEW.md)에 있습니다.

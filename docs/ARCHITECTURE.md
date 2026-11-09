# ButterToast 아키텍처

Electron/Chromium을 기반으로 메인 프로세스, 신뢰된 앱 UI, 웹 콘텐츠를 격리한다. Chromium 직접 포크보다 유지보수와 Windows 패키징 부담이 작지만 엔진 취약점 패치와 실제 OS 검증은 계속 필요하다. [전체 구현 현황](IMPLEMENTATION-STATUS.md)을 현재 기준으로 삼는다.

## 브라우저

`BrowserTabs`는 사람 탭과 복구를 관리한다. 웹 뷰에는 Node/preload/앱 IPC가 없다. 앱 UI는 `toast-ui://app`의 고정 자산만 로드하고 CSP로 외부 요청과 인라인 실행을 막는다. 각 창의 IPC는 실제 WebContents·최상위 프레임·정확한 URL·명령 스키마·빈도 제한을 검사한다.

0.2의 탭 메뉴·고정·음소거·주소 복제와 네이티브 페이지 찾기/확대도 `BrowserTabs`에 속한다. 탭 저장 v2는 v1을 읽고 URL/고정/음소거만 암호화한다. 찾기 요청 ID와 현재 탭을 확인해 늦은 결과를 버리고, 찾기 바 높이는 메인의 네이티브 뷰 좌표에 함께 반영한다. [0.2 변경·검증](UPGRADE-0.2.md)을 참조한다.

`BrowserLibrary`는 북마크·기록·설정·사이트 권한·감사 메타데이터를 OS 암호화한다. 직렬·원자적 저장을 합치고 방문 기록은 최대 3,000개, 북마크는 1,000개로 제한한다. OS 암호화가 없으면 메모리만 사용한다. `BrowserManager`는 별도 교체 가능한 관리 UI다.

`DownloadManager`는 활성 사람 탭의 HTTP(S) 체인 또는 해당 페이지와 같은 HTTP(S) origin의 단일 Blob URL을 네이티브 확인과 저장 경로 선택 후 허용한다. `file-menu.ts`는 네이티브 링크·이미지 저장 메뉴를 제공하며 메뉴가 열린 뒤 문서가 바뀌면 요청을 폐기한다. 다운로드 진행 UI는 파일 ID와 공개 상태만 받으며 경로/파일 읽기 IPC를 만들지 않는다. AI/UI/인증/모델 세션의 다운로드는 계속 거부한다. 업로드는 Chromium의 네이티브 파일 선택/드롭·multipart 경로이며 AI 파일 첨부 기능과 별개다. `installSitePermissions`도 사람 세션에만 설치하며 활성 HTTPS 최상위 페이지에 묶인 확인을 요구한다. 화면 공유·기기 권한은 거부한다. 권한 차단/초기화는 해당 origin의 문서를 종료하며, 사이트 데이터 삭제는 활성 사람 탭·다운로드를 중단하고 연결·인증 캐시를 정리한 후 수행한다.

`GoogleTheme`는 정확히 허용한 Google 검색 호스트/경로에 고정 CSS만 넣는다. 모델·웹페이지가 CSS/JavaScript나 권한을 공급하지 않는다. 검색 엔진은 정상 검색 URL로 이동한다.

## AI

`AiWorkspaces`는 3개 독립 패널을 필요할 때 생성한다. 각 패널의 모델 네트워크·키 저장 경로·대화 보관·작업 WebContents는 분리된다. `ModelAdapter`는 OpenAI/Claude/Gemini/호환 API로 요청을 변환한다. 패키지의 고정 경로에서만 운영 지침을 읽는다.

`AiService`는 대화·명시적 공유·모델 옵션·토큰/비용 추정·단계 제한을 소유한다. 작업은 승인된 한 origin에서 최대 10단계다. 부작용이 있는 동작마다 네이티브 승인한다. 사용자 중단·탭 변경·페이지 변경·키 변경은 이전 권한과 지연 응답을 무효화한다.

`ToastController`는 하나의 WebContents에 고정된다. isolated world 1001에서 Node 매핑과 문서 버전을 검사하고 `ToastGuard`의 범위·동작·일회성 승인·lease를 통과한 동작만 실행한다. 사람 탭의 직접 조작은 제어 공유를 회수한다. 같은 사람 탭의 제어 소유자는 한 명이다. 모델은 임의 코드·OS·권한 API를 호출하지 못한다.

BTIR v1은 제한된 JSON 스키마를 표준 DEFLATE로 압축한 바이너리다. decode는 헤더·크기·스키마·부모 관계를 검사한다. 변경분 API는 같은 문서/version 계열에만 적용한다. 모델에는 바이너리 문자열을 보내지 않는다.

## 계정·배포

Supabase access token/PKCE verifier는 메인의 별도 인증 네트워크 세션과 RAM에 둔다. 0.4에서 로그인 유지를 선택하면 refresh token과 신원 바인딩을 AccountStorage의 별도 OS 암호화 파일에 보관한다. 가입·복구 콜백은 예상 이메일과 묶고 로그아웃·만료 후 지연 응답을 거부한다. 계정 로그인은 AI 권한을 부여하지 않는다.

`Profile`은 표시용 스키마이며 0.4 기본 저장소는 로컬 AccountStorage다. 계정/기기별 sync opt-in 후에만 `AuthService`가 현재 bearer로 Auth `/user`에 `buttertoast_profile` namespace를 저장/조회한다. 사용자 ID·이메일·인증 상태·revision·세션 세대를 검사한다. 메타데이터의 권한 필드는 사용하지 않는다. 새 테이블이나 관리자 키는 필요 없다.

`UiAppearance`는 로그인 프로필 또는 `BrowserLibrary`의 비로그인 설정에서 가져온 옵션을 등록된 앱 뷰에만 전달한다. `appearance.js`는 허용 dataset 값과 디자인 토큰만 적용하며 네이티브 웹 뷰의 크기·권한을 변경하지 않는다. `profile.js`는 로컬/선택적 서버 저장 전 미리보기와 편집 충돌 표시를 담당한다. `icons.js`는 고정 벡터 path를 생성하며 외부 자산이나 사용자 SVG를 로드하지 않는다. [현재 저장 범위·검증](ACCOUNT-STORAGE-AND-DELETION.md)을 참조한다.

Windows 포터블 패키지는 자산 허용 목록과 ASAR/fuse/PE 해시를 검사한다. NSIS는 현재 사용자 폴더에 설치하고 사용자별 URL 등록을 제공한다. 제거는 패키지 파일 목록만 대상으로 하며 사용자 프로필은 보존한다. 코드 서명과 실제 Windows 실행은 별도다.

업데이트는 패키지에 고정된 공개키/HTTPS origin을 신뢰 기준으로 삼는다. 서명된 manifest를 검증한 다음에만 바이너리를 다운로드하고 크기·해시·버전·만료를 재검사한다. 현재 릴리스 설정은 비어 있으므로 요청·설치를 하지 않는다.

## 오너의 3패널 디자인 적용

`workspaceGeometry`가 Butter/Browser/Toast와 실제 WebContentsView의 경계를 메인에서 계산한다. UI가 임의 뷰 좌표를 공급하지 않는다. 너비 변경은 별도 30Hz 제한과 범위를 검증하고 종료 시 OS 암호화 설정으로 저장한다. 작은 창에서는 측면 패널을 줄이고 Browser/Toast 표시를 전환한다.

Toast 작업은 기존의 독립 임시 세션을 유지한 채 부모 창에 내장한다. 상태·실제 페이지·연결/대화 도구 전환은 표시만 바꾸며 작업이나 세션을 새로 만들지 않는다. 탭 위임은 메인이 원본 WebContents/문서를 확인하고 네이티브 승인 뒤 query·fragment 없는 HTTPS 주소만 새 AI 세션에서 연다. 결과는 승인 후 주소만 사람용 새 탭으로 연다.

선택 공유는 명시적인 버튼과 미리보기를 거치며 한 개의 가시적 텍스트 노드만 지원한다. 입력란·private 영역은 제외하고 모델 권한을 확대하지 않는다. 실행 기록의 가상 커서는 별도의 무권한 신뢰 UI 뷰이며 웹 DOM에 스크립트/요소를 주입하지 않는다. 재생은 실행기에 명령을 보내지 않는다. 문서·뷰포트가 달라진 기록은 화면에 재생하지 않는다.

## Golden Toast 구성요소

`toastir/model.ts`는 모델용 snapshot/delta 스키마와 동일성 검사를 담당한다. `AiService`는 승인된 workflow에만 임시 wire history를 두며 model snapshot과 실행 observation을 외부 데이터로 보낸다. BrowserTabs의 idle probe는 isolated world 1003의 고정 코드이며 메모리 절약은 opt-in이다. `BrowserWindows`는 같은 사람 프로필과 별도의 엄격한 toolbar IPC를 사용한다. PopupPolicy는 native 승인과 navigation revocation을 담당한다.

`AccountStorage`는 프로필과 remembered session을 별도 파일에 직렬 저장한다. `DownloadStore`는 OS 암호화 목록만 저장하며 재시작 후 네트워크 요청을 복원하지 않는다. `product/access.ts`는 무료 핵심 기능과 아직 지원하지 않는 선택 기능을 main에서 구분한다. `ai/subscription.ts`는 비활성 계약이며 OAuth 구현으로 취급하지 않는다. 상세 기능·외부 서버 미배포 상태는 [0.4 기록](GOLDEN-TOAST-0.4.md)에 있다.

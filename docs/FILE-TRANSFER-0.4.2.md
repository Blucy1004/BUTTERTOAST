# 파일 다운로드·업로드 — 0.4.2

## 사용 방법과 구현

- 주소창 옆 다운로드 SVG 버튼 또는 `Ctrl+J`로 다운로드 목록을 연다. 추가 일반 창에서도 같은 목록을 연다.
- 사이트의 다운로드 버튼, 파일 URL 직접 탐색, 링크·이미지의 **다른 이름으로 저장**을 지원한다. 네이티브 출처 확인 후 저장 위치를 고른다.
- 같은 사이트가 만든 Blob 내보내기 파일을 저장할 수 있다. 다른 origin/opaque Blob과 HTTPS→HTTP 다운로드는 차단한다.
- 목록에 용량·진행률·한국어 상태를 표시한다. 전송 중 일시정지·계속·취소, 완료 후 폴더 보기·기록 제거를 제공한다. 재개할 수 없는 전송은 계속 버튼을 비활성화한다. 기록 제거는 파일 삭제가 아니다.
- 업로드는 웹사이트의 **파일 선택/첨부** 버튼을 사용한다. 사이트가 지원하면 여러 파일을 선택하거나 파일을 드롭 영역에 놓을 수 있다. 기존 Chromium 업로드 경로를 통합 검증했으며 별도의 클라우드 파일 보관 서비스를 만들지 않았다.

작은 다운로드의 마지막 `updated` 이벤트가 생략되더라도 `done`에서 실제 전송 바이트를 반영한다. 진행 중 목록 갱신이 버튼의 키보드 포커스를 반복해서 제거하지 않도록 행을 유지한다. 기존 프로필·다운로드 기록 형식과 오너의 UI 디자인을 유지한다.

## 보안 경계

- 자동 저장·자동 실행 없음. 활성 사람 탭에 묶인 네이티브 확인과 목적지 선택을 유지한다. 메뉴/확인 중 문서가 바뀌면 요청을 폐기한다.
- Blob은 활성 문서와 같은 HTTP(S) origin의 단일 URL만 허용한다. 빈 새 탭에서 시작한 일반 파일 URL 다운로드는 지원하지만, 빈 탭/opaque 문서는 Blob 권한의 근거가 될 수 없다.
- 일반 HTTPS 페이지에서 HTTP 파일로 직접 내려받는 경우와 리디렉션 다운그레이드를 모두 차단한다. 파일명 정리·실행 형식 경고·Windows Internet-zone 표시 정책을 유지한다.
- AI·앱 UI·인증·모델 네트워크 세션은 다운로드를 허용하지 않는다. 파일 입력은 ToastIR에 `[private]`로 표시하고 조작을 거부한다. 파일 경로·내용을 모델로 보내지 않는다.
- 앱은 임의 경로의 파일 읽기/업로드 IPC를 제공하지 않는다. 선택한 파일은 웹사이트가 읽거나 전송할 수 있으므로 사용자가 해당 사이트의 파일 선택창에서 고른다. File System Access의 광범위한 읽기/쓰기 권한을 추가하지 않는다.
- 재시작 시 이전 전송을 자동 재요청하지 않는다. 기록은 OS 보호 저장소를 사용할 수 있을 때만 저장한다. 다운로드 정책은 악성코드 검사 서비스가 아니다.

## 검증

환경: Linux x64, Electron 45.2.3 / Chromium 156.0.8078.80. 기존 Chromium sandbox/contextIsolation/Site Isolation/TLS 설정을 유지했다. 사용자 파일·실제 계정·AI API 키는 사용하지 않았다.

| 검사 | 결과 |
| --- | --- |
| 단위 검사 | 123개 통과 |
| 전체 `test:security` | 단위 검사와 기존 Electron 회귀, 당시 파일 전송 12그룹 포함 통과; audit 보고 advisory 0, 지원 secret pattern 미검출 |
| 최종 `test:files` | 새 빈 탭 파일 URL 검사를 추가한 13그룹 통과 |
| 실제 OS 파일 선택창 | 인증된 Xvfb/X11의 GTK 선택창에서 취소·Open 버튼 선택 후 실제 HTTP multipart 전송, 2개 결과 통과 |
| Windows·Ubuntu CI | 소스 커밋의 Security regression 결과에서 별도 확인; 검사/결과 artifact 생성 단계 추가 |

파일 전송 검사에는 HTTP/Blob의 실제 저장 바이트, 최종 용량, 링크·이미지 저장, 탐색 후 오래된 메뉴 거부, 실제 느린 전송의 일시정지·재개·취소, AI 세션 다운로드 거부가 포함된다. 다중 파일의 파일명·길이·SHA-256을 실제 로컬 HTTP 서버가 받은 multipart 내용과 비교했다. 드롭 업로드는 Chromium에 파일 드래그 payload를 전달해 확인했다. 임의 로컬 경로를 input 값으로 지정하는 페이지 코드와 사용자 승인 응답을 반환해도 파일 입력을 조작하려는 ToastIR 명령을 거부했다.

자동 테스트의 선택은 CDP로 테스트 파일만 지정한다. OS 선택창 검사는 CDP 파일 지정 없이 별도 실행했으며 **Linux GTK** 결과다. Windows 실기기 파일 선택/드래그·설치, 실제 외부 사이트 계정에 파일 업로드, OS 파일관리자의 드래그, 모든 사이트의 업로드 API는 이번 검증 범위가 아니다.

초기 테스트 장치 오류도 구분한다. HTTP 페이지에 AI scope를 주려던 검사는 기존 HTTPS 제한으로 거부되어 HTTPS fixture로 옮겼다. 파일 입력의 라벨은 원래 비공개여서 `[private]`/sensitive 상태와 실제 승인·실행 거부를 검사하도록 수정했다. GTK 테스트 장치의 Enter 입력으로 선택이 완료되지 않아 표시된 Open 버튼을 실제 포인터로 누르는 경로로 바꿨다. 보안 정책이나 기대하는 파일 바이트를 낮추지 않았다.

원자료: [파일 전송](QA/data/file-transfer-0.4.2.json), [실제 GTK 선택창](QA/data/native-picker-0.4.2.json). 기존 0.4.1 QA 결과는 변경하지 않았다.

## 재현

```sh
npm ci
node scripts/install-electron.cjs
npm run test:files
npm run test:security
# 선택 사항: Linux X11 + xwininfo/xprop, libX11/libXtst, Python 3
# 기존의 인증된 DISPLAY/XAUTHORITY를 상속한다.
node_modules/.bin/electron --disable-gpu test/file-picker-native.cjs
```

모든 파일은 테스트가 만든 OS 임시 폴더에만 저장한다. 네이티브 선택창 드라이버는 해당 테스트 창의 transient 창만 찾으며, 테스트/Mock/CDP/드라이버 코드는 배포 ASAR에 포함하지 않는다.

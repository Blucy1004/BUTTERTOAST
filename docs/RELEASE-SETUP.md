# 릴리스·업데이트 준비

현재 개발 빌드는 게시하지 않았으며 Authenticode 서명되지 않았다. 실제 Windows 설치/제거·기본 브라우저·DPAPI·메일 콜백과 모델 호출을 먼저 검증한다.

## 서명된 업데이트

1. 별도 안전한 환경에서 Ed25519 릴리스 키를 준비한다. 개인키는 저장소·앱·채팅에 넣지 않는다.
2. `src/security/release-config.ts`에 HTTPS origin, manifest URL, 게시자 공개키만 설정한 뒤 앱을 빌드한다. 서버 응답으로 공개키를 바꾸지 않는다.
3. 더 높은 버전의 Windows 설치 프로그램을 만들고 필요하면 별도의 Authenticode 서명을 적용한다.
4. 아래 도구로 설치 프로그램의 manifest와 detached signature를 생성한다. 파일은 새로 생성하며 기존 파일을 덮어쓰지 않는다.

```sh
node scripts/sign-update.mjs --artifact path/to/Setup.exe --url https://updates.example.com/Setup.exe --version 0.1.1 --key-file /secure/release-private.pem --output path/to/latest.json
```

5. 사용자가 승인한 배포 절차에서 같은 HTTPS origin의 설치 파일, latest.json, latest.json.sig를 게시한다. 리디렉션 없는 URL이 필요하다. 이 문서 작성으로 게시나 유료 호스팅을 수행하지 않는다.

앱은 서명·버전·만료 검증 후 다운로드하며 크기/해시를 다시 검사한다. 현재 설정은 비어 있으므로 자동 확인도 실행되지 않는다. 설정된 패키지에서는 시작 후 확인하고, 설치는 네이티브 사용자 동의가 필요하다. 운영 중 키 교체/폐기·오류 복구·업데이트 설치 교체는 실제 Windows에서 별도 검증한다.

## Windows 서명과 배포

Ed25519 업데이트 서명과 Windows Authenticode는 별개다. 게시자 코드 서명 인증서/키가 제공되지 않았으므로 서명된 제품으로 표시하지 않는다. 자체서명 인증서나 보안 기능 해제로 OS 경고를 우회하지 않는다.

GitHub Actions는 Windows 회귀와 포터블 패키지 artifact 생성을 포함한다. 워크플로 파일을 추가한 것은 원격 CI가 실행됐다는 뜻이 아니다. 원격 push/릴리스/환경 게시는 이번 작업에서 하지 않았다.

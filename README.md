# 블로그 포스팅 AI (BlogPost AI)

사진을 올리면 Gemini AI가 사진에 맞는 네이버 블로그 포스팅 글(제목/키워드/본문)을 자동으로 작성해주는 개인용 안드로이드 앱입니다.

- 카테고리별 글쓰기: 맛집 / 운동 / 여행 / 기타
- 제목 형식: `[지역/장소 카테고리] 주저리주저리 후기` 스타일로 자동 생성
- 본문에 사진 삽입 위치([사진1], [사진2] ...)를 표시해줘서, 네이버 블로그 에디터에 사진과 글을 순서대로 붙여넣기만 하면 됨
- "전체 글 복사하기" 버튼으로 제목+본문+해시태그를 한 번에 클립보드로 복사

## 1. Gemini API 키 발급받기

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. "Create API key" 클릭해서 키 발급 (무료 티어로 개인 사용에 충분)
3. 발급받은 키를 복사해두기

앱을 처음 실행하면 오른쪽 위 ⚙ 설정 버튼을 눌러 API 키를 입력하고 저장하세요. 키는 휴대폰에만 저장되고 외부 서버로 전송되지 않으며, Gemini API 호출에만 사용됩니다.

## 2. 사용 방법

1. 카테고리 선택 (맛집/운동/여행/기타)
2. 장소/지역명 입력 (예: "구리", "제주도") - 제목에 반영됨
3. 추가로 알리고 싶은 내용 입력 (메뉴명, 가격 등, 선택사항)
4. 사진 업로드 (여러 장 가능)
5. "블로그 글 생성하기" 클릭
6. 결과 화면에서 "전체 글 복사하기"로 글을 복사한 뒤, 네이버 블로그 앱에서 사진을 순서대로 첨부하고 글을 붙여넣기

## 3. APK 빌드 방법 (GitHub Actions)

로컬에 Android Studio나 SDK를 설치하지 않아도, GitHub Actions가 자동으로 APK를 빌드합니다.

빌드를 트리거하려면 태그를 push하세요:

```bash
git tag v1.0.0
git push origin v1.0.0
```

푸시하면 `.github/workflows/build-apk.yml` 워크플로우가 실행되어:
- `app-debug.apk`가 빌드되고
- GitHub Release에 APK가 자동 첨부됩니다

Actions 탭에서 "Run workflow" 버튼으로 수동 실행도 가능합니다 (이 경우 Actions의 Artifacts에서 APK를 받을 수 있습니다).

> 참고: 이 APK는 개인 사이드로드용 debug 서명 APK입니다. Play 스토어 배포용이 아니며, 별도의 keystore/서명 설정이 필요 없습니다.

## 4. 휴대폰에 설치하기

1. 휴대폰 브라우저로 이 GitHub 저장소의 **Releases** 페이지 접속
2. 최신 릴리스에서 `app-debug.apk` 다운로드
3. 다운로드한 APK를 눌러 설치 시도 → "출처를 알 수 없는 앱" 경고가 뜨면 설정에서 허용
   - 안드로이드 8 이상: 설치 시 뜨는 안내를 따라 "이 출처 허용"을 눌러주면 됩니다 (브라우저 또는 파일 관리자 앱 단위로 허용)
4. 설치 후 앱 실행 → 설정에서 Gemini API 키 입력 후 바로 사용

## 개발 환경

- React + TypeScript + Vite
- Capacitor (웹 앱을 안드로이드 앱으로 패키징)
- Gemini API (`generativelanguage.googleapis.com`)를 클라이언트에서 직접 호출 (별도 백엔드 서버 없음)

### 로컬 개발

```bash
npm install
npm run dev
```

### 로컬에서 Android 프로젝트 동기화 (Android Studio가 있는 경우)

```bash
npm run build
npx cap sync android
npx cap open android
```

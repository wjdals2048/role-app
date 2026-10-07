# 역할 정하기 (가칭)

팀 프로젝트 역할을 정할 때, 하고 싶은 역할과 하기 싫은 역할을 다른 팀원에게 비공개로 모아 규칙에 따라 배정하는 웹 서비스.

## 구조
- `index.html`, `src/` : 화면 (Vite, 바닐라 JS)
- `lib/assign.js` : 배정 규칙 (AI 미사용). `lib/roomService.js`, `lib/ai.js` : 결과 조립과 소개 문장
- `api/assign.js` : Vercel 서버 함수. 선호 데이터는 여기서만 읽는다
- `firestore.rules` : 선호는 본인만 읽도록 하는 보안 규칙
- `test/` : `npm test`

## 연습 모드
`src/firebase-config.js`가 비어 있으면 자동으로 연습 모드(브라우저 localStorage)로 동작한다.
주소 끝에 `?demo`를 붙여도 연습 모드다. 탭마다 다른 사람으로 동작한다. 보안은 없다.

## 배포 순서
1. Firebase 콘솔: 프로젝트 만들기 → Firestore Database 만들기 → Authentication > Sign-in method에서 Anonymous 사용 설정
2. Firestore > 규칙 탭에 `firestore.rules` 내용을 붙여넣고 게시
3. 프로젝트 설정 > 내 앱 > 웹 앱 등록 → 설정값을 `src/firebase-config.js`에 붙여넣기
4. 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 → 받은 JSON 파일 내용 전체를 Vercel 환경 변수 `FIREBASE_SERVICE_ACCOUNT`에 넣기 (파일을 저장소에 올리지 말 것)
5. (선택) AI 소개 문장: Vercel 환경 변수 `ANTHROPIC_API_KEY` 추가. 없으면 기본 문장으로 동작한다
6. GitHub에 올리고 Vercel에서 저장소를 Import → Deploy
7. 기기 3대로 방 하나를 만들어 테스트: 다른 사람의 선호가 보이지 않는지, 배정 후 결과가 모두에게 보이는지 확인

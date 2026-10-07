// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값으로 바꿔 주세요.
// 이 값은 공개되어도 되는 식별 정보입니다. 데이터 보호는 firestore.rules가 합니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyDNHHQLJwkx8FmRaaP6LPLuCxMRZfk4kTk',
  authDomain: 'role-app-698c7.firebaseapp.com',
  projectId: 'role-app-698c7',
  storageBucket: 'role-app-698c7.firebasestorage.app',
  messagingSenderId: '170332417541',
  appId: '1:170332417541:web:c79a88e4f18b7152fe366c',
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

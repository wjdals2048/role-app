import { firebaseConfig, isConfigured } from './firebase-config.js';
import { createFirebaseStore } from './store-firebase.js';
import { createMemoryStore } from './store-memory.js';

export function createStore() {
  const q = new URLSearchParams(location.search);
  const forceDemo = q.has('demo') || q.has('solo'); // ?solo: 혼자 체험하기 (연습 모드 + 가상 팀원)
  if (isConfigured && !forceDemo) return createFirebaseStore(firebaseConfig);
  return createMemoryStore();
}

import { firebaseConfig, isConfigured } from './firebase-config.js';
import { createFirebaseStore } from './store-firebase.js';
import { createMemoryStore } from './store-memory.js';

export function createStore() {
  const forceDemo = new URLSearchParams(location.search).has('demo');
  if (isConfigured && !forceDemo) return createFirebaseStore(firebaseConfig);
  return createMemoryStore();
}

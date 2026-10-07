import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let uid = null;

  const watch = (ref, cb, map) =>
    onSnapshot(
      ref,
      (snap) => cb(map(snap)),
      (err) => console.error('snapshot error', err),
    );

  async function call(action, code) {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/assign', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `요청에 실패했어요 (${res.status})`);
    return data;
  }

  return {
    mode: 'firebase',
    async init() {
      const user = await new Promise((resolve, reject) => {
        const off = onAuthStateChanged(auth, async (u) => {
          off();
          if (u) return resolve(u);
          try {
            resolve((await signInAnonymously(auth)).user);
          } catch (e) {
            reject(e);
          }
        });
      });
      uid = user.uid;
      return uid;
    },
    get uid() {
      return uid;
    },
    async createRoom({ roles, nickname }) {
      for (let i = 0; i < 6; i++) {
        const code = makeCode();
        try {
          await setDoc(doc(db, 'rooms', code), { creatorUid: uid, status: 'collecting', roles, createdAt: serverTimestamp() });
          await setDoc(doc(db, 'rooms', code, 'members', uid), { nickname, submitted: false, joinedAt: serverTimestamp() });
          return code;
        } catch (e) {
          if (e.code !== 'permission-denied') throw e; // 이미 있는 코드면 규칙이 거부한다 → 다른 코드로 재시도
        }
      }
      throw new Error('방 코드를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    },
    async getRoom(code) {
      const s = await getDoc(doc(db, 'rooms', code));
      return s.exists() ? s.data() : null;
    },
    subscribeRoom: (code, cb) => watch(doc(db, 'rooms', code), cb, (s) => (s.exists() ? s.data() : null)),
    subscribeMembers: (code, cb) =>
      watch(collection(db, 'rooms', code, 'members'), cb, (s) => s.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    subscribeResult: (code, cb) => watch(doc(db, 'rooms', code, 'results', 'public'), cb, (s) => (s.exists() ? s.data() : null)),
    subscribePrivate: (code, cb) =>
      watch(doc(db, 'rooms', code, 'results_private', uid), cb, (s) => (s.exists() ? s.data() : null)),
    async join(code, nickname) {
      await setDoc(doc(db, 'rooms', code, 'members', uid), { nickname, submitted: false, joinedAt: serverTimestamp() });
    },
    async updateRoles(code, roles) {
      await updateDoc(doc(db, 'rooms', code), { roles });
    },
    async getMyPrefs(code) {
      const s = await getDoc(doc(db, 'rooms', code, 'prefs', uid));
      return s.exists() ? s.data() : null;
    },
    async savePrefs(code, data) {
      await setDoc(doc(db, 'rooms', code, 'prefs', uid), { ...data, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'rooms', code, 'members', uid), { submitted: true });
    },
    assign: (code) => call('assign', code),
    reopen: (code) => call('reopen', code),
  };
}

// 데모(연습) 모드: Firebase 없이 이 브라우저의 localStorage만 쓴다. 탭마다 다른 사람으로 동작한다.
// 보안은 없다 — 화면 흐름과 배정 결과를 연습해 보는 용도다.
import { runAssignment } from '../lib/roomService.js';

const KEY = 'roleapp-demo-v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bus = new EventTarget();
const read = () => JSON.parse(localStorage.getItem(KEY) || '{"rooms":{}}');
const write = (d) => {
  localStorage.setItem(KEY, JSON.stringify(d));
  bus.dispatchEvent(new Event('change'));
};
window.addEventListener('storage', (e) => e.key === KEY && bus.dispatchEvent(new Event('change')));

let uid = sessionStorage.getItem('roleapp-uid');
if (!uid) {
  uid = 'u' + Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem('roleapp-uid', uid);
}

function sub(getter, cb) {
  const h = () => cb(getter(read()));
  bus.addEventListener('change', h);
  setTimeout(h, 0);
  return () => bus.removeEventListener('change', h);
}

export function createMemoryStore() {
  return {
    mode: 'demo',
    async init() {
      return uid;
    },
    get uid() {
      return uid;
    },
    async createRoom({ roles, nickname, name }) {
      const d = read();
      let code;
      do code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
      while (d.rooms[code]);
      d.rooms[code] = {
        room: { creatorUid: uid, status: 'collecting', roles, ...(name ? { name } : {}) },
        members: { [uid]: { nickname, submitted: false } },
        prefs: {},
        result: null,
        privates: {},
      };
      write(d);
      return code;
    },
    async getRoom(code) {
      return read().rooms[code]?.room || null;
    },
    subscribeRoom: (code, cb) => sub((d) => d.rooms[code]?.room || null, cb),
    subscribeMembers: (code, cb) =>
      sub((d) => Object.entries(d.rooms[code]?.members || {}).map(([id, m]) => ({ uid: id, ...m })), cb),
    subscribeResult: (code, cb) => sub((d) => d.rooms[code]?.result || null, cb),
    subscribePrivate: (code, cb) => sub((d) => d.rooms[code]?.privates?.[uid] || null, cb),
    async join(code, nickname) {
      const d = read();
      d.rooms[code].members[uid] = { nickname, submitted: false };
      write(d);
    },
    async updateRoles(code, roles) {
      const d = read();
      d.rooms[code].room.roles = roles;
      write(d);
    },
    async getMyPrefs(code) {
      return read().rooms[code]?.prefs?.[uid] || null;
    },
    async savePrefs(code, data) {
      const d = read();
      d.rooms[code].prefs[uid] = data;
      d.rooms[code].members[uid].submitted = true;
      write(d);
    },
    async assign(code) {
      const d = read();
      const r = d.rooms[code];
      if (r.room.creatorUid !== uid) throw new Error('방장만 할 수 있어요.');
      const members = Object.entries(r.members).map(([id, m]) => ({ uid: id, nickname: m.nickname }));
      const seed = 1 + Math.floor(Math.random() * 2 ** 30);
      const { publicResult, privateByUid } = await runAssignment({ room: r.room, members, prefsByUid: r.prefs, seed });
      const d2 = read();
      const r2 = d2.rooms[code];
      r2.result = { ...publicResult, round: (r2.room.round || 0) + 1 };
      r2.room.round = r2.result.round;
      r2.privates = privateByUid;
      r2.room.status = 'assigned';
      write(d2);
      return { ok: true };
    },
    async reopen(code) {
      const d = read();
      const r = d.rooms[code];
      if (r.room.creatorUid !== uid) throw new Error('방장만 할 수 있어요.');
      r.room.status = 'collecting';
      r.result = null;
      r.privates = {};
      write(d);
    },
  };
}

// 서버(Vercel 함수)와 데모 모드가 함께 쓰는 배정 파이프라인. 저장소(Firestore 등)는 모른다.
import { assignRoles, explainForPerson, publicSummary, PREF } from './assign.js';
import { clean, generateLines } from './ai.js';
import { KIND_IDS, DESC_MAX, STEP_MAX, STEP_COUNT } from './roleGuide.js';

export const LOAD_LABEL = { 1: '가벼움', 2: '보통', 3: '무거움' };

function normalizeSteps(r) {
  const list = (v) => (Array.isArray(v) ? v : []).map((t) => clean(t, STEP_MAX)).filter(Boolean).slice(0, STEP_COUNT);
  const src = r.steps && typeof r.steps === 'object' ? r.steps : {};
  const steps = { start: list(src.start), during: list(src.during), end: list(src.end) };
  if (!steps.start.length && !steps.during.length && !steps.end.length) steps.during = list(r.tasks); // 이전 형식(한 줄 목록)
  return steps;
}

export const ROOM_NAME_MAX = 20;

/** 방 이름(선택). 비어 있으면 빈 문자열. */
export function normalizeRoomName(name) {
  return clean(name, ROOM_NAME_MAX);
}

/** 닉네임 비교용 키: 공백을 모두 없애고 소문자로 맞춘다. ("지 은"과 "지은", "Eun"과 "eun"을 같은 이름으로 본다) */
export function nicknameKey(name) {
  return String(name ?? '').replace(/\s+/g, '').toLowerCase();
}

/** 같은 방에 이미 같은 닉네임이 있는지. 본인(uid)의 기존 닉네임은 제외한다. */
export function isNicknameTaken(members, nickname, uid) {
  const key = nicknameKey(nickname);
  if (!key) return false;
  return (members || []).some((m) => m.uid !== uid && nicknameKey(m.nickname) === key);
}

export const MESSAGE_MAX = 40;

/** 팀원에게 한마디(선택). 비어 있으면 빈 문자열. */
export function normalizeMessage(text) {
  return clean(text, MESSAGE_MAX);
}

export function normalizeRoles(roles) {
  return (roles || [])
    .slice(0, 12)
    .map((r, i) => ({
      id: String(r.id || `r${i + 1}`).slice(0, 12),
      name: clean(r.name, 20),
      need: Math.max(1, Math.min(3, parseInt(r.need, 10) || 1)),
      load: Math.max(1, Math.min(3, parseInt(r.load, 10) || 2)),
      kind: KIND_IDS.includes(r.kind) ? r.kind : '',
      desc: clean(r.desc, DESC_MAX),
      steps: normalizeSteps(r),
    }))
    .filter((r) => r.name);
}

export function normalizePrefs(input, roles) {
  const out = {};
  for (const r of roles) {
    const v = input?.prefs?.[r.id];
    out[r.id] = v === PREF.WANT || v === PREF.AVOID ? v : PREF.OK;
  }
  return {
    prefs: out,
    strength: clean(input?.strength, 40),
    wish: clean(input?.wish, 40),
    share: input?.share === true,
    randomConsent: input?.randomConsent === true,
  };
}

/**
 * room: {roles:[{id,name,need,load}]}
 * members: [{uid, nickname}]
 * prefsByUid: {uid: {prefs, strength, wish, share}}  (제출하지 않은 사람은 없음 = 전부 "상관없다")
 */
export async function runAssignment({ room, members, prefsByUid, seed, apiKey, fetchImpl }) {
  const roles = normalizeRoles(room.roles);
  const people = members.map((m) => m.uid);
  const nick = Object.fromEntries(members.map((m) => [m.uid, clean(m.nickname, 12)]));
  const prefs = {};
  for (const uid of people) prefs[uid] = normalizePrefs(prefsByUid[uid] || {}, roles).prefs;
  const ctx = { people, roles, prefs };
  const result = assignRoles(ctx, { seed });
  const summary = publicSummary(result, ctx);

  const publicRoles = result.roles.map((r) => ({
    id: r.id,
    name: r.name,
    need: r.need,
    load: r.load,
    kind: r.kind || '',
    desc: r.desc || '',
    steps: r.steps || { start: [], during: [], end: [] },
    members: people.filter((p) => result.byPerson[p].includes(r.id)).map((uid) => ({ uid, nickname: nick[uid] })),
  }));

  const privateByUid = {};
  for (const uid of people) {
    privateByUid[uid] = {
      lines: explainForPerson(result, ctx, uid),
      roleIds: result.byPerson[uid],
      hasConflict: result.byPerson[uid].some((rid) => prefs[uid][rid] === PREF.AVOID),
    };
  }

  // 공개 동의한 사람 + 역할이 있고 + 한 줄이라도 쓴 사람만 소개 문장 대상
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const items = [];
  for (const uid of people) {
    const p = prefsByUid[uid];
    if (!p || p.share !== true) continue;
    const strength = clean(p.strength, 40);
    const wish = clean(p.wish, 40);
    if (!strength && !wish) continue;
    if (!result.byPerson[uid].length) continue;
    items.push({
      id: uid,
      nickname: nick[uid],
      role: result.byPerson[uid].map((rid) => roleName.get(rid)).join(', '),
      strength,
      wish,
    });
  }
  const gen = await generateLines(items, { apiKey, fetchImpl });

  return {
    publicResult: {
      seed,
      roles: publicRoles,
      unassigned: summary.unassigned.map((uid) => ({ uid, nickname: nick[uid] })),
      summary: {
        conflictCount: summary.conflictCount,
        randomCount: summary.randomCount,
        notes: summary.notes,
        filled: summary.filled,
        needTotal: summary.needTotal,
      },
      lines: gen.lines,
      aiUsed: gen.aiUsed,
      aiError: gen.error || null,
    },
    privateByUid,
  };
}

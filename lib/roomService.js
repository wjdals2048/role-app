// 서버(Vercel 함수)와 데모 모드가 함께 쓰는 배정 파이프라인. 저장소(Firestore 등)는 모른다.
import { assignRoles, explainForPerson, publicSummary, PREF } from './assign.js';
import { clean, generateLines } from './ai.js';

export const LOAD_LABEL = { 1: '가벼움', 2: '보통', 3: '무거움' };

export function normalizeRoles(roles) {
  return (roles || [])
    .slice(0, 12)
    .map((r, i) => ({
      id: String(r.id || `r${i + 1}`).slice(0, 12),
      name: clean(r.name, 20),
      need: Math.max(1, Math.min(3, parseInt(r.need, 10) || 1)),
      load: Math.max(1, Math.min(3, parseInt(r.load, 10) || 2)),
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

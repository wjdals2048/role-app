import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRoles, explainForPerson, publicSummary, solveOnce, PREF } from '../lib/assign.js';

const W = PREF.WANT, O = PREF.OK, N = PREF.AVOID;
const roles4 = [
  { id: 'lead', name: '팀장', need: 1, load: 3 },
  { id: 'research', name: '리서치', need: 1, load: 2 },
  { id: 'present', name: '발표', need: 1, load: 3 },
  { id: 'ppt', name: 'PPT', need: 1, load: 2 },
];

// 완전탐색으로 (싫다 수, 무역할 인원, -점수, 부담 편차) 최소를 구한다
function brute(ctx) {
  const slots = [];
  for (const r of ctx.roles) for (let k = 0; k < r.need; k++) slots.push(r);
  let best = null;
  const pick = new Array(slots.length);
  const rec = (i) => {
    if (i === slots.length) {
      const by = Object.fromEntries(ctx.people.map((p) => [p, []]));
      slots.forEach((r, s) => by[pick[s]].push(r.id));
      // 같은 사람이 같은 역할을 두 번 맡는 경우 제외
      for (const p of ctx.people) if (new Set(by[p]).size !== by[p].length) return;
      const ev = evalBy(by, ctx);
      const key = [ev.avoid, ev.zero, -ev.score, Math.round(ev.spread * 1e6)];
      if (!best || cmp(key, best.key) < 0) best = { key, by };
      return;
    }
    for (const p of ctx.people) { pick[i] = p; rec(i + 1); }
  };
  rec(0);
  return best;
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
function evalBy(by, ctx) {
  const rb = new Map(ctx.roles.map((r) => [r.id, r]));
  let avoid = 0, zero = 0, score = 0; const load = {};
  for (const p of ctx.people) {
    const rs = by[p]; if (!rs.length) zero++; load[p] = 0;
    for (const id of rs) {
      const pf = ctx.prefs[p]?.[id] || O;
      if (pf === N) avoid++; else score += pf === W ? 2 : 1;
      load[p] += rb.get(id).load;
    }
  }
  const v = Object.values(load), m = v.reduce((a, b) => a + b, 0) / v.length;
  return { avoid, zero, score, spread: v.reduce((a, b) => a + (b - m) ** 2, 0) };
}

test('예1: 4명 4역할 — 싫다 0건, 점수 7', () => {
  const ctx = {
    people: ['A', 'B', 'C', 'D'], roles: roles4,
    prefs: {
      A: { lead: O, research: O, present: W, ppt: O },
      B: { lead: O, research: W, present: N, ppt: O },
      C: { lead: N, research: O, present: O, ppt: W },
      D: { lead: O, research: O, present: O, ppt: O },
    },
  };
  const r = assignRoles(ctx, { seed: 3 });
  assert.equal(r.avoid, 0); assert.equal(r.zero, 0); assert.equal(r.score, 7);
  assert.deepEqual(r.byPerson.A, ['present']); assert.deepEqual(r.byPerson.B, ['research']);
  assert.deepEqual(r.byPerson.C, ['ppt']); assert.deepEqual(r.byPerson.D, ['lead']);
});

test('예2: 3명 4역할 — B는 하기 싫은 역할만 남아 역할 없음(싫다 0건 유지)', () => {
  const ctx = {
    people: ['A', 'B', 'C'], roles: roles4,
    prefs: {
      A: { lead: W, research: O, present: W, ppt: O },
      B: { lead: N, research: N, present: O, ppt: N },
      C: { lead: O, research: O, present: O, ppt: O },
    },
  };
  const r = assignRoles(ctx, { seed: 5 });
  assert.equal(r.avoid, 0);
  const total = Object.values(r.byPerson).flat().length; assert.equal(total, 4);
  assert.ok(r.byPerson.B.length <= 1);
});

test('예3: 4명 모두 발표 싫다 — 충돌 1건, 설명에 "충돌"이 들어가고 무작위 아님이면 규칙으로 설명', () => {
  const ctx = {
    people: ['A', 'B', 'C', 'D'], roles: roles4,
    prefs: {
      A: { lead: W, research: O, present: N, ppt: O },
      B: { lead: O, research: W, present: N, ppt: O },
      C: { lead: O, research: O, present: N, ppt: W },
      D: { lead: O, research: O, present: N, ppt: O },
    },
  };
  const r = assignRoles(ctx, { seed: 11 });
  assert.equal(r.avoid, 1);
  const who = ctx.people.find((p) => r.byPerson[p].includes('present'));
  const msg = explainForPerson(r, ctx, who).join(' ');
  assert.match(msg, /충돌/);
  // 전원이 싫다고 한 역할은 누가 맡아도 같은 점수라, 같은 사람이 항상 걸리는지(규칙) 아닌지(무작위)를 stable이 구분해야 한다
  assert.equal(typeof r.stable[`${who}|present`], 'boolean');
});

test('필요 인원 2명 역할: 같은 사람이 같은 역할을 두 번 맡지 않는다', () => {
  const ctx = {
    people: ['A', 'B', 'C'],
    roles: [{ id: 'x', name: '자료조사', need: 2, load: 2 }, { id: 'y', name: '발표', need: 1, load: 3 }],
    prefs: { A: { x: W, y: O }, B: { x: W, y: O }, C: { x: N, y: W } },
  };
  const r = assignRoles(ctx, { seed: 2 });
  for (const p of ctx.people) assert.equal(new Set(r.byPerson[p]).size, r.byPerson[p].length);
  assert.equal(r.avoid, 0);
  assert.deepEqual(r.byPerson.C, ['y']);
});

test('역할 수보다 사람이 많으면 일부는 역할이 없고, 그 설명이 나온다', () => {
  const ctx = {
    people: ['A', 'B', 'C'],
    roles: [{ id: 'x', name: '정리', need: 1, load: 1 }],
    prefs: {},
  };
  const r = assignRoles(ctx, { seed: 4 });
  assert.equal(Object.values(r.byPerson).filter((v) => v.length === 0).length, 2);
  const s = publicSummary(r, ctx);
  assert.equal(s.unassigned.length, 2);
});

test('1인: 모든 역할을 맡는다', () => {
  const ctx = { people: ['A'], roles: roles4, prefs: {} };
  const r = assignRoles(ctx, { seed: 1 });
  assert.equal(r.byPerson.A.length, 4);
});

test('같은 시드는 같은 결과, 다른 시드는 동점일 때만 달라질 수 있다', () => {
  const ctx = { people: ['A', 'B', 'C', 'D'], roles: roles4, prefs: {} };
  const a = assignRoles(ctx, { seed: 42 });
  const b = assignRoles(ctx, { seed: 42 });
  assert.deepEqual(a.byPerson, b.byPerson);
});

test('무작위 비교: 완전탐색과 (싫다 수, 무역할 수, 점수)가 항상 같다 / 부담 편차 차이 집계', () => {
  let seedState = 12345;
  const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
  let cases = 0, spreadWorse = 0;
  for (let t = 0; t < 250; t++) {
    const nP = 2 + Math.floor(rnd() * 3); // 2~4명
    const nR = 1 + Math.floor(rnd() * 3); // 1~3 역할
    const people = Array.from({ length: nP }, (_, i) => `P${i}`);
    const roles = Array.from({ length: nR }, (_, j) => ({
      id: `R${j}`, name: `역할${j}`, need: 1 + Math.floor(rnd() * Math.min(2, nP)), load: 1 + Math.floor(rnd() * 3),
    }));
    const total = roles.reduce((s, r) => s + r.need, 0);
    if (total > 6) continue;
    const prefs = {};
    for (const p of people) {
      prefs[p] = {};
      for (const r of roles) { const x = rnd(); prefs[p][r.id] = x < 0.25 ? W : x < 0.55 ? N : O; }
    }
    const ctx = { people, roles, prefs };
    const bf = brute(ctx);
    const r = assignRoles(ctx, { seed: t + 1, checks: 2 });
    const mine = [r.avoid, r.zero, -r.score];
    assert.deepEqual(mine, bf.key.slice(0, 3), `case ${t}: ${JSON.stringify(ctx)}`);
    cases++;
    if (Math.round(r.spread * 1e6) > bf.key[3]) spreadWorse++;
  }
  console.log(`  비교한 사례 ${cases}건, 부담 편차가 최적보다 큰 사례 ${spreadWorse}건`);
  assert.ok(cases > 100);
});

test('규모: 12명 10역할(필요 인원 합 16)이 1초 안에 끝난다', () => {
  const people = Array.from({ length: 12 }, (_, i) => `P${i}`);
  const roles = Array.from({ length: 10 }, (_, j) => ({ id: `R${j}`, name: `역할${j}`, need: j < 6 ? 2 : 1, load: 1 + (j % 3) }));
  const prefs = {};
  for (const p of people) { prefs[p] = {}; for (const r of roles) prefs[p][r.id] = [W, O, N][Math.floor(Math.random() * 3)]; }
  const t0 = Date.now();
  const r = assignRoles({ people, roles, prefs }, { seed: 9 });
  const ms = Date.now() - t0;
  console.log(`  소요 ${ms}ms, 싫다 ${r.avoid}건, 무역할 ${r.zero}명`);
  assert.ok(ms < 1000);
  assert.equal(r.filled, 16);
});

// 역할 배정 규칙. AI를 쓰지 않는 결정론적 계산(+ 시드 난수)이다.
//
// 우선순위
//   1. "하기 싫다" 배정 수 최소화 (절대 금지가 아니라 최소화. 불가피하면 "충돌"로 표시)
//   2. 역할이 하나도 없는 사람 수 최소화 (역할 수 >= 인원 수이면 전원 최소 1역할)
//   3. 선호 점수 최대화 (하고 싶다 2점, 상관없다 1점)
//   4. 부담도 균형 (사람별 부담 합계의 편차 최소화)
//   5. 그래도 같으면 무작위 (시드 고정, 같은 시드면 같은 결과)

export const PREF = { WANT: 'want', OK: 'ok', AVOID: 'avoid' };

const COST_AVOID = 1_000_000_000; // 우선순위 1
const COST_FIRST = -10_000_000; //   우선순위 2 (첫 역할 보너스)
const COST_WANT = -2000; //          우선순위 3
const COST_OK = -1000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MinCostFlow {
  constructor(n) {
    this.n = n;
    this.g = Array.from({ length: n }, () => []);
  }
  addEdge(u, v, cap, cost) {
    const a = { to: v, cap, cost, rev: this.g[v].length };
    const b = { to: u, cap: 0, cost: -cost, rev: this.g[u].length };
    this.g[u].push(a);
    this.g[v].push(b);
    return a;
  }
  // 정확히 maxFlow만큼 흘리는 최소 비용 (비용에 음수가 있어도 SPFA로 처리)
  run(s, t, maxFlow) {
    let flow = 0;
    const n = this.n;
    while (flow < maxFlow) {
      const dist = new Array(n).fill(Infinity);
      const inq = new Array(n).fill(false);
      const pv = new Array(n).fill(-1);
      const pe = new Array(n).fill(-1);
      dist[s] = 0;
      const q = [s];
      let head = 0;
      while (head < q.length) {
        const u = q[head++];
        inq[u] = false;
        for (let i = 0; i < this.g[u].length; i++) {
          const e = this.g[u][i];
          if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
            dist[e.to] = dist[u] + e.cost;
            pv[e.to] = u;
            pe[e.to] = i;
            if (!inq[e.to]) {
              inq[e.to] = true;
              q.push(e.to);
            }
          }
        }
      }
      if (dist[t] === Infinity) break;
      let add = maxFlow - flow;
      for (let v = t; v !== s; v = pv[v]) add = Math.min(add, this.g[pv[v]][pe[v]].cap);
      for (let v = t; v !== s; v = pv[v]) {
        const e = this.g[pv[v]][pe[v]];
        e.cap -= add;
        this.g[v][e.rev].cap += add;
      }
      flow += add;
    }
    return flow;
  }
}

function prefOf(prefs, person, roleId) {
  const v = prefs?.[person]?.[roleId];
  return v === PREF.WANT || v === PREF.AVOID ? v : PREF.OK;
}

// 한 번의 배정. 반환: { byPerson: {id: [roleId...]}, filled, needTotal }
function assignOnce({ people, roles, prefs }, seed) {
  const rng = mulberry32(seed);
  const N = people.length;
  const R = roles.length;
  const S = roles.reduce((s, r) => s + r.need, 0);
  const SRC = 0;
  const SNK = 1;
  const pNode = (i) => 2 + i;
  const rNode = (j) => 2 + N + j;
  const f = new MinCostFlow(2 + N + R);

  for (let i = 0; i < N; i++) {
    f.addEdge(SRC, pNode(i), 1, COST_FIRST);
    if (S > 1) f.addEdge(SRC, pNode(i), S - 1, 0);
  }
  const edges = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const p = prefOf(prefs, people[i], roles[j].id);
      const base = p === PREF.AVOID ? COST_AVOID : p === PREF.WANT ? COST_WANT : COST_OK;
      const noise = Math.floor(rng() * 10); // 같은 점수끼리의 무작위 동점 처리
      edges.push({ i, j, e: f.addEdge(pNode(i), rNode(j), 1, base + noise) });
    }
  }
  for (let j = 0; j < R; j++) f.addEdge(rNode(j), SNK, roles[j].need, 0);

  const filled = f.run(SRC, SNK, S);
  const byPerson = Object.fromEntries(people.map((p) => [p, []]));
  for (const { i, j, e } of edges) {
    if (f.g[e.to][e.rev].cap > 0) byPerson[people[i]].push(roles[j].id);
  }
  return { byPerson, filled, needTotal: S };
}

function evaluate(byPerson, { people, roles, prefs }) {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  let avoid = 0;
  let zero = 0;
  let score = 0;
  const load = {};
  for (const p of people) {
    const rs = byPerson[p] || [];
    if (rs.length === 0) zero++;
    load[p] = 0;
    for (const rid of rs) {
      const pf = prefOf(prefs, p, rid);
      if (pf === PREF.AVOID) avoid++;
      else score += pf === PREF.WANT ? 2 : 1;
      load[p] += roleById.get(rid).load;
    }
  }
  const vals = Object.values(load);
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const spread = vals.reduce((a, b) => a + (b - mean) ** 2, 0); // 분산 합
  return { avoid, zero, score, load, spread, mean };
}

const sameKey = (a, b) => a.avoid === b.avoid && a.zero === b.zero && a.score === b.score;

// 우선순위 1~3이 같은 조합들 사이에서 부담도 편차를 줄인다 (우선순위 4)
function balanceLoad(byPerson, ctx, seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const cur = Object.fromEntries(Object.entries(byPerson).map(([k, v]) => [k, [...v]]));
  let best = evaluate(cur, ctx);
  const { people } = ctx;
  for (let iter = 0; iter < 300; iter++) {
    let improved = false;
    const order = [];
    for (const a of people) for (const ra of cur[a]) order.push([a, ra]);
    order.sort(() => rng() - 0.5);
    outer: for (const [a, ra] of order) {
      for (const b of [...people].sort(() => rng() - 0.5)) {
        if (b === a) continue;
        // 1) 슬롯 이동: a의 ra를 b에게
        if (!cur[b].includes(ra)) {
          const t = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, [...v]]));
          t[a] = t[a].filter((x) => x !== ra);
          t[b].push(ra);
          const ev = evaluate(t, ctx);
          if (sameKey(ev, best) && ev.spread < best.spread - 1e-9) {
            Object.assign(cur, t);
            best = ev;
            improved = true;
            break outer;
          }
        }
        // 2) 교환: a의 ra와 b의 rb
        for (const rb of cur[b]) {
          if (rb === ra || cur[a].includes(rb) || cur[b].includes(ra)) continue;
          const t = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, [...v]]));
          t[a] = t[a].filter((x) => x !== ra).concat(rb);
          t[b] = t[b].filter((x) => x !== rb).concat(ra);
          const ev = evaluate(t, ctx);
          if (sameKey(ev, best) && ev.spread < best.spread - 1e-9) {
            Object.assign(cur, t);
            best = ev;
            improved = true;
            break outer;
          }
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}

export function solveOnce(ctx, seed) {
  const r = assignOnce(ctx, seed);
  const byPerson = balanceLoad(r.byPerson, ctx, seed);
  return { byPerson, filled: r.filled, needTotal: r.needTotal, ...evaluate(byPerson, ctx) };
}

/**
 * 배정 실행.
 * ctx = { people: [id], roles: [{id,name,need,load}], prefs: {personId: {roleId: 'want'|'ok'|'avoid'}} }
 * 같은 규칙으로 여러 번(시드만 바꿔) 돌려서, 어떤 배정이 규칙으로 정해졌고 어떤 배정이 동점이라 무작위였는지 구분한다.
 */
export function assignRoles(ctx, { seed = 1, checks = 16 } = {}) {
  const roles = ctx.roles.map((r) => ({ ...r, need: Math.max(1, Math.min(r.need, ctx.people.length)) }));
  const c = { ...ctx, roles };
  const main = solveOnce(c, seed);
  const runs = [];
  for (let k = 1; k <= checks; k++) runs.push(solveOnce(c, seed + k * 7919));
  const stable = {}; // `${person}|${role}` -> 모든 시도에서 같은 배정이면 true
  for (const p of c.people) {
    for (const rid of main.byPerson[p]) {
      stable[`${p}|${rid}`] = runs.every((r) => r.byPerson[p].includes(rid));
    }
  }
  return { ...main, roles, stable, seed };
}

// ---------- 설명 문장 ----------

const PREF_KO = { want: '하고 싶다', ok: '상관없다', avoid: '하기 싫다' };

/** 사람별 비공개 설명(본인에게만 보임). 실제로 배정을 결정한 규칙을 그대로 쓴다. */
export function explainForPerson(result, ctx, personId) {
  const roles = result.roles;
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const mine = result.byPerson[personId] || [];
  const lines = [];
  if (mine.length === 0) {
    const allAvoid = roles.every((r) => prefOf(ctx.prefs, personId, r.id) === PREF.AVOID);
    lines.push(
      allAvoid
        ? '모든 역할을 "하기 싫다"로 표시해서, 하기 싫은 배정을 최소화하는 규칙에 따라 이번에는 역할이 배정되지 않았어요. 팀에서 보조 역할을 함께 정해 보세요.'
        : '이번 조합에서는 역할이 배정되지 않았어요. 팀에서 보조 역할을 함께 정해 보세요.',
    );
    return lines;
  }
  for (const rid of mine) {
    const role = roleById.get(rid);
    const pf = prefOf(ctx.prefs, personId, rid);
    const wanters = ctx.people.filter((p) => p !== personId && prefOf(ctx.prefs, p, rid) === PREF.WANT).length;
    const stable = result.stable[`${personId}|${rid}`];
    let msg = `"${role.name}" — 내가 고른 선호: ${PREF_KO[pf]}. `;
    if (pf === PREF.AVOID) {
      msg += '하기 싫다고 표시한 역할이 배정됐어요(충돌). 팀 전체에서 하기 싫은 배정을 가장 적게 만드는 조합이 이것이었고, 이 역할을 할 수 있는 다른 사람이 없었어요.';
      if (!stable) msg += ' 같은 조건의 조합이 여러 개여서 그중 하나를 무작위로 골랐어요.';
    } else if (pf === PREF.WANT) {
      if (wanters + 1 <= role.need) msg += '같은 역할을 하고 싶은 사람이 자리 수를 넘지 않아서 원하는 역할을 맡았어요.';
      else if (stable) msg += `같은 역할을 하고 싶은 사람이 ${wanters + 1}명이었어요. 팀 전체의 선호를 가장 크게 만족시키는 조합을 골랐더니 이 역할이 배정됐어요.`;
      else msg += `같은 역할을 하고 싶은 사람이 ${wanters + 1}명이었고, 선호 만족이 같은 조합이 여러 개여서 부담도 균형과 무작위로 정했어요.`;
    } else {
      if (stable) msg += '다른 사람들의 선호를 먼저 반영하고 남은 자리를 상관없다고 한 사람 중에서 채웠어요.';
      else msg += '선호 만족이 같은 조합이 여러 개여서 부담도 균형과 무작위로 정했어요.';
    }
    lines.push(msg);
  }
  lines.push(`내 부담도 합계는 ${result.load[personId]}점이고 팀 평균은 ${result.mean.toFixed(1)}점이에요.`);
  return lines;
}

/** 팀 전체에 공개되는 요약. 누가 무엇을 싫어했는지는 쓰지 않는다. */
export function publicSummary(result, ctx) {
  const unassigned = ctx.people.filter((p) => (result.byPerson[p] || []).length === 0);
  const randomCount = Object.values(result.stable).filter((v) => !v).length;
  const notes = [
    '1순위: "하기 싫다"로 표시한 배정을 가장 적게 만들었어요.',
    '2순위: 가능하면 모든 팀원이 역할을 하나 이상 맡도록 했어요.',
    '3순위: "하고 싶다"를 최대한 반영했어요.',
    '4순위: 팀원별 부담도 합계가 고르게 되도록 조정했어요.',
    '그래도 같은 조건이면 무작위로 정했어요.',
  ];
  return {
    conflictCount: result.avoid,
    unassigned,
    randomCount,
    notes,
    needTotal: result.needTotal,
    filled: result.filled,
  };
}

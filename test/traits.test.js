import test from 'node:test';
import assert from 'node:assert/strict';
import { roleKind, suggestPrefs, relevantTraits } from '../lib/traits.js';
import { assignRoles, explainForPerson, PREF } from '../lib/assign.js';

const roles = [
  { id: 'a', name: '팀장' }, { id: 'b', name: '발표' }, { id: 'c', name: '자료 조사' },
  { id: 'd', name: 'PPT·디자인' }, { id: 'e', name: '문서 정리' }, { id: 'f', name: '일정 관리' },
  { id: 'g', name: '간식 담당' },
];

test('역할 이름에서 종류를 알아본다 / 모르면 null', () => {
  const kinds = Object.fromEntries(roles.map((r) => [r.id, roleKind(r.name)]));
  assert.deepEqual(kinds, { a: 'lead', b: 'present', c: 'research', d: 'design', e: 'doc', f: 'schedule', g: null });
});

test('"낯을 가려요" → 발표만 하기 싫다로 제안, 나머지는 건드리지 않는다', () => {
  const { suggestions, conflicts } = suggestPrefs(['shy'], roles);
  assert.deepEqual(Object.keys(suggestions), ['b']);
  assert.equal(suggestions.b.value, 'avoid');
  assert.deepEqual(conflicts, []);
});

test('같은 역할에 서로 다른 제안이 겹치면 제안하지 않고 conflicts로 알린다', () => {
  const { suggestions, conflicts } = suggestPrefs(['shy', 'stage'], roles);
  assert.equal(suggestions.b, undefined);
  assert.deepEqual(conflicts, ['b']);
});

test('같은 방향의 칩 두 개는 합쳐서 한 번만 제안한다', () => {
  const { suggestions } = suggestPrefs(['shy', 'nervous'], roles);
  assert.equal(suggestions.b.value, 'avoid');
  assert.equal(suggestions.b.labels.length, 2);
});

test('아무것도 안 고르면 제안이 없다', () => {
  assert.deepEqual(suggestPrefs([], roles), { suggestions: {}, conflicts: [] });
});

test('설명: 못 맡은 "하고 싶다"는 하기 싫다 최소화 규칙으로 설명된다 (2명 2역할 사례)', () => {
  const ctx = {
    people: ['min', 'jeong'],
    roles: [{ id: 'lead', name: '팀장', need: 1, load: 3 }, { id: 'pres', name: '발표', need: 1, load: 3 }],
    prefs: {
      min: { lead: PREF.OK, pres: PREF.WANT },
      jeong: { lead: PREF.AVOID, pres: PREF.OK },
    },
  };
  const r = assignRoles(ctx, { seed: 1 });
  assert.deepEqual(r.byPerson.min, ['lead']);
  assert.deepEqual(r.byPerson.jeong, ['pres']);
  const msg = explainForPerson(r, ctx, 'min').join('\n');
  assert.match(msg, /"발표" — 하고 싶다고 했지만 이번에는 맡지 못했어요/);
  assert.match(msg, /2순위\("모두 역할 1개 이상"\)/);
  assert.match(msg, /"하기 싫다" 배정 증가/);
  const jeongMsg = explainForPerson(r, ctx, 'jeong').join('\n');
  assert.doesNotMatch(jeongMsg, /다른 사람들의 선호를 먼저 반영/);
  // 설명에 다른 사람의 이름이나 선택을 직접 쓰지 않는다
  assert.doesNotMatch(msg, /jeong|min/);
});

test('설명: 하고 싶은 역할을 맡았으면 못 맡았다는 문장이 나오지 않는다', () => {
  const ctx = {
    people: ['A', 'B'],
    roles: [{ id: 'x', name: '발표', need: 1, load: 3 }, { id: 'y', name: '정리', need: 1, load: 1 }],
    prefs: { A: { x: PREF.WANT, y: PREF.OK }, B: { x: PREF.OK, y: PREF.WANT } },
  };
  const r = assignRoles(ctx, { seed: 2 });
  assert.doesNotMatch(explainForPerson(r, ctx, 'A').join('\n'), /맡지 못했어요/);
});

test('방에 있는 역할과 연결되는 칩만 보여 준다', () => {
  const two = [{ id: 'a', name: '팀장' }, { id: 'b', name: '발표' }];
  const ids = relevantTraits(two).map((t) => t.id);
  assert.deepEqual(ids, ['shy', 'nervous', 'stage', 'lead', 'follow']);
  assert.deepEqual(relevantTraits([{ id: 'g', name: '간식 담당' }]), []);
  assert.equal(relevantTraits(roles).length, 10);
});

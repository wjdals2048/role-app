import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOfRole, kindFromName, templateFor, GUIDE_TEMPLATES, KIND_IDS } from '../lib/roleGuide.js';
import { normalizeRoles, runAssignment } from '../lib/roomService.js';
import { relevantTraits, suggestPrefs } from '../lib/traits.js';

test('방장이 고른 종류가 이름 추정보다 우선한다', () => {
  assert.equal(kindOfRole({ name: '간식 담당', kind: 'present' }), 'present');
  assert.equal(kindOfRole({ name: '발표', kind: 'doc' }), 'doc');
  assert.equal(kindOfRole({ name: '발표' }), 'present');
  assert.equal(kindOfRole({ name: '간식 담당' }), null);
});

test('기타(other)를 고르면 이름에 키워드가 있어도 칩과 연결하지 않는다', () => {
  assert.equal(kindOfRole({ name: '발표 자료 검수', kind: 'other' }), null);
  assert.deepEqual(relevantTraits([{ id: 'a', name: '발표', kind: 'other' }]), []);
});

test('이름을 몰라도 종류를 고르면 성향 칩이 연결된다', () => {
  const roles = [{ id: 'a', name: '무대 맡기', kind: 'present' }];
  assert.ok(relevantTraits(roles).some((t) => t.id === 'shy'));
  const { suggestions } = suggestPrefs(['shy'], roles);
  assert.equal(suggestions.a.value, 'avoid');
});

test('템플릿은 모든 종류에 있고, 내용이 안전한 길이다', () => {
  for (const k of KIND_IDS) assert.ok(GUIDE_TEMPLATES[k], k);
  for (const [k, tp] of Object.entries(GUIDE_TEMPLATES)) {
    assert.ok(tp.desc.length <= 60, k);
    for (const ph of ['start', 'during', 'end']) {
      assert.ok(tp.steps[ph].length <= 3, `${k}.${ph}`);
      for (const x of tp.steps[ph]) assert.ok(x.length <= 30, `${k}: ${x}`);
    }
  }
  assert.deepEqual(templateFor('없는종류'), { desc: '', steps: { start: [], during: [], end: [] } });
  const a = templateFor('lead'); a.steps.start.push('x');
  assert.notEqual(templateFor('lead').steps.start.length, a.steps.start.length); // 복사본
});

test('normalizeRoles: 설명·할 일 길이 제한, 알 수 없는 종류는 비움, 개수 제한', () => {
  const [r] = normalizeRoles([{
    id: 'r1', name: '발표', kind: 'weird', desc: 'ㄱ'.repeat(100),
    steps: { start: ['a'.repeat(50), '', '  ', 't2', 't3', 't4'], during: 'bad', end: ['e'] },
  }]);
  assert.equal(r.kind, '');
  assert.equal(r.desc.length, 60);
  assert.equal(r.steps.start.length, 3);
  assert.equal(r.steps.start[0].length, 30);
  assert.deepEqual(r.steps.during, []);
  assert.deepEqual(r.steps.end, ['e']);
  const [q] = normalizeRoles([{ id: 'r2', name: '정리', kind: 'doc' }]);
  assert.deepEqual(q.steps, { start: [], during: [], end: [] });
  const [z] = normalizeRoles([{ id: 'r3', name: 'x', tasks: ['예전 형식'], transient: 'stepsText' }]);
  assert.deepEqual(z.steps.during, ['예전 형식']); // 이전 형식은 "진행하는 동안"으로
  assert.equal(z.transient, undefined);
});

test('공개 결과의 역할에 설명·할 일이 들어간다', async () => {
  const room = { roles: [{ id: 'r1', name: '발표', need: 1, load: 3, kind: 'present', desc: '앞에서 전달해요', steps: { start: [], during: ['연습하기'], end: [] } }] };
  const out = await runAssignment({ room, members: [{ uid: 'u1', nickname: '가' }], prefsByUid: { u1: { prefs: { r1: 'want' }, randomConsent: true } }, seed: 1 });
  const role = out.publicResult.roles[0];
  assert.equal(role.desc, '앞에서 전달해요');
  assert.deepEqual(role.steps.during, ['연습하기']);
  assert.equal(role.kind, 'present');
});

test('kindFromName은 이전 roleKind와 같은 결과를 낸다', () => {
  assert.equal(kindFromName('PPT·디자인'), 'design');
  assert.equal(kindFromName('문서 정리'), 'doc');
  assert.equal(kindFromName(''), null);
});

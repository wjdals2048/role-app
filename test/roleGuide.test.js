import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOfRole, kindFromName, templateFor, GUIDE_TEMPLATES, KIND_IDS } from '../lib/roleGuide.js';
import { normalizeRoles, runAssignment } from '../lib/roomService.js';
import { relevantTraits, suggestPrefs } from '../lib/traits.js';

test('방장이 고른 종류가 이름 추정보다 우선한다', () => {
  assert.equal(kindOfRole({ name: '간식 담당', kind: 'present' }), 'present');
  assert.equal(kindOfRole({ name: '발표', kind: 'doc' }), 'present'); // 이름이 다른 종류를 가리키면 이름을 따른다(이름만 고친 경우)
  assert.equal(kindOfRole({ name: '무대 맡기', kind: 'present' }), 'present');
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
    assert.ok(tp.tasks.length <= 9, k);
    for (const x of tp.tasks) assert.ok(x.length <= 30, `${k}: ${x}`);
  }
  assert.deepEqual(templateFor('없는종류'), { desc: '', tasks: [] });
  const a = templateFor('lead'); a.tasks.push('x');
  assert.notEqual(templateFor('lead').tasks.length, a.tasks.length); // 복사본
});

test('normalizeRoles: 설명·할 일 길이 제한, 알 수 없는 종류는 비움, 줄 수는 제한 없음', () => {
  const [r] = normalizeRoles([{
    id: 'r1', name: '발표', kind: 'weird', desc: 'ㄱ'.repeat(100),
    tasks: ['a'.repeat(50), '', '  ', 't2', 't3', 't4'],
  }]);
  assert.equal(r.kind, '');
  assert.equal(r.desc.length, 60);
  assert.equal(r.tasks.length, 4); // 줄 수는 제한하지 않는다(안전 한도만)
  assert.equal(r.tasks[0].length, 30);
  const [q] = normalizeRoles([{ id: 'r2', name: '정리', kind: 'doc' }]);
  assert.deepEqual(q.tasks, []);
  const [z] = normalizeRoles([{ id: 'r3', name: 'x', steps: { start: ['a'], during: 'bad', end: ['c'] }, transient: 'tasksText' }]);
  assert.deepEqual(z.tasks, ['a', 'c']); // 이전 형식(시기별)은 순서대로 한 목록으로
  assert.equal(z.transient, undefined);
});

test('공개 결과의 역할에 설명·할 일이 들어간다', async () => {
  const room = { roles: [{ id: 'r1', name: '발표', need: 1, load: 3, kind: 'present', desc: '앞에서 전달해요', tasks: ['연습하기'] }] };
  const out = await runAssignment({ room, members: [{ uid: 'u1', nickname: '가' }], prefsByUid: { u1: { prefs: { r1: 'want' }, randomConsent: true } }, seed: 1 });
  const role = out.publicResult.roles[0];
  assert.equal(role.desc, '앞에서 전달해요');
  assert.deepEqual(role.tasks, ['연습하기']);
  assert.equal(role.kind, 'present');
});

test('kindFromName은 이전 roleKind와 같은 결과를 낸다', () => {
  assert.equal(kindFromName('PPT·디자인'), 'design');
  assert.equal(kindFromName('문서 정리'), 'doc');
  assert.equal(kindFromName(''), null);
});

test('서기: 이름으로 알아보고, 문서 정리와 구분된다', () => {
  assert.equal(kindFromName('서기'), 'scribe');
  assert.equal(kindFromName('회의록 정리'), 'scribe');
  assert.equal(kindFromName('문서 정리'), 'doc');
  assert.ok(KIND_IDS.includes('scribe') && GUIDE_TEMPLATES.scribe.desc);
  const roles = [{ id: 's', name: '서기' }];
  assert.ok(relevantTraits(roles).some((t) => t.id === 'record'));
  assert.equal(suggestPrefs(['missnote'], roles).suggestions.s.value, 'avoid');
});

test('이름만 바뀌고 예전 종류가 남은 역할: 이름의 종류를 따르고, 이름에서 알 수 없으면 남은 종류를 쓴다', () => {
  assert.equal(kindOfRole({ name: '발표자료', kind: 'lead' }), 'present');
  assert.equal(kindOfRole({ name: '서기', kind: 'lead' }), 'scribe');
  assert.equal(kindOfRole({ name: '간식 담당', kind: 'lead' }), 'lead'); // 한계: 이름에 단서가 없으면 구분할 수 없다
});

test('모든 역할 종류(기타 제외)에 설명·할 일·부담/뿌듯·칩·질문이 모두 있다', async () => {
  const { KINDS, GUIDE_TEMPLATES, KIND_FEEL } = await import('../lib/roleGuide.js');
  const { TRAITS } = await import('../lib/traits.js');
  const { QUIZ } = await import('../lib/quiz.js');
  for (const k of KINDS.filter((x) => x.id !== 'other')) {
    assert.ok(GUIDE_TEMPLATES[k.id].desc && GUIDE_TEMPLATES[k.id].tasks.length >= 3, `${k.id} template`);
    assert.ok(KIND_FEEL[k.id]?.hard && KIND_FEEL[k.id]?.good, `${k.id} feel`);
    assert.ok(TRAITS.some((t) => t.effects[k.id] === 'want') && TRAITS.some((t) => t.effects[k.id] === 'avoid'), `${k.id} chips`);
    assert.equal(QUIZ[k.id]?.length, 3, `${k.id} quiz`);
    assert.equal(kindFromName(k.label), k.id, `${k.id} keyword`);
  }
});

test('새 역할 이름에서 종류를 알아본다', () => {
  const cases = { '최종 검토': 'review', '제출·취합': 'submit', '소통 창구': 'contact', '회의 진행': 'facil', '데이터 수집·분석': 'data', 'Q&A 준비': 'qna', '개발': 'dev', 'UI/UX 설계': 'uiux', '영상·사진': 'media', '사진 찍기': 'media', '자료 조사': 'research', '문서 정리': 'doc', '서기': 'scribe', 'PPT·디자인': 'design', '발표': 'present' };
  for (const [n, k] of Object.entries(cases)) assert.equal(kindFromName(n), k, n);
});

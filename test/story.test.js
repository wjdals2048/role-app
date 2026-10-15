import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, KIND_KO, storyFor, storyUsable, askedKinds, newStory, applyChoice, nextStep, pickedKinds, prefFor, summarize } from '../lib/story.js';
import { QUIZ } from '../lib/quiz.js';

test('3컷, 컷마다 선택지 4개, 모든 선택에 반응 문구', () => {
  assert.equal(STORY.length, 3);
  for (const s of STORY) { assert.equal(s.choices.length, 4); for (const c of s.choices) { assert.ok(c.say && ['mata', 'taba'].includes(c.who)); assert.ok(c.tag === null || KIND_KO[c.tag]); } }
});
test('질문이 있는 모든 종류가 최소 한 번은 선택지에 있다', () => {
  const tags = new Set(STORY.flatMap((s) => s.choices.map((c) => c.tag)));
  for (const k of ['lead', 'present', 'research', 'design', 'doc', 'scribe', 'schedule']) assert.ok(tags.has(k), k); // 체험 이야기는 처음 7종류만 다룬다
});
test('게이지는 0~10으로 제한되고 한 컷에 한 번만 고른다', () => {
  const st = newStory(Object.keys(KIND_KO)); applyChoice(st, 0); const g1 = { ...st.g }; applyChoice(st, 1);
  assert.deepEqual(st.g, g1); assert.equal(st.picks.length, 1);
  const x = newStory(Object.keys(KIND_KO)); x.g.pace = 10; applyChoice(x, 0); assert.equal(x.g.pace, 10);
});
test('끝까지 가면 done, 선택 안 하고는 못 넘어간다', () => {
  const st = newStory(Object.keys(KIND_KO)); nextStep(st); assert.equal(st.step, 0);
  for (let i = 0; i < 3; i++) { applyChoice(st, 0); nextStep(st); }
  assert.equal(st.done, true); assert.equal(st.picks.length, 3);
});
test('끌린 종류만 want, 나머지는 ok — avoid는 만들지 않는다', () => {
  const kinds = pickedKinds([0, 0, 0]); assert.deepEqual(kinds, ['lead', 'schedule', 'present']);
  assert.equal(prefFor('lead', kinds), 'want'); assert.equal(prefFor('design', kinds), 'ok'); assert.equal(prefFor(null, kinds), 'ok');
  assert.deepEqual(pickedKinds([0, 1, 3]), ['lead', 'research']);
  for (const a of [0, 1, 2, 3]) for (const b of [0, 1, 2, 3]) for (const c of [0, 1, 2, 3]) for (const k of Object.keys(KIND_KO)) assert.notEqual(prefFor(k, pickedKinds([a, b, c])), 'avoid');
});
test('요약은 점수 없이 한두 문장', () => {
  assert.ok(summarize({ pace: 5, mood: 5, load: 5 }).length === 1);
  assert.ok(summarize({ pace: 9, mood: 9, load: 9 }).length <= 2);
});

test('방에 없는 역할의 선택지는 나오지 않고, 역할이 너무 적으면 쓸 수 없다', () => {
  const eff = storyFor(['lead', 'present']);
  for (const s of eff) for (const c of s.choices) assert.ok(c.tag === null || ['lead', 'present'].includes(c.tag));
  assert.ok(eff.every((s) => s.choices.length >= 2));
  assert.equal(storyUsable(['lead']), false);
  assert.equal(storyUsable([]), false);
  assert.equal(storyUsable(Object.keys(KIND_KO)), true);
  const st = newStory(['lead', 'present']);
  for (let i = 0; i < st.eff.length; i++) { applyChoice(st, 0); nextStep(st); }
  for (const k of pickedKinds(st.picks, st.eff)) assert.ok(['lead', 'present'].includes(k));
});

test('체험에서 선택지가 나온 종류만 asked, 없는 종류는 직접 고르게 한다', () => {
  const eff = storyFor(['lead', 'present', 'research']);
  const a = askedKinds(eff);
  assert.ok(a.has('lead') && a.has('present'));
  assert.ok(!a.has('design') && !a.has('scribe'));
});

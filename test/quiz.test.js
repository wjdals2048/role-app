import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ, quizFor, genericQuiz, suggestFromAnswers as s } from '../lib/quiz.js';
import { KIND_IDS } from '../lib/roleGuide.js';

test('질문은 종류마다 부담·보람·경험 3개', () => {
  for (const k of Object.keys(QUIZ)) {
    assert.ok(KIND_IDS.includes(k));
    assert.deepEqual(QUIZ[k].map((x) => x.t), ['burden', 'reward', 'exp']);
  }
  assert.equal(Object.keys(QUIZ).length, 16);
});
test('답 → 선호 제안 규칙', () => {
  assert.equal(s({}), null);
  assert.equal(s({ burden: 'y', reward: 'n' }).pref, 'avoid');
  assert.equal(s({ burden: 'y', reward: 'n', exp: 'y' }).pref, 'avoid');
  assert.equal(s({ reward: 'y', burden: 'n' }).pref, 'want');
  assert.equal(s({ reward: 'y' }).pref, 'want');
  assert.equal(s({ burden: 'y', reward: 'y', exp: 'y' }).pref, 'want');
  assert.equal(s({ burden: 'y', reward: 'y', exp: 'n' }).pref, 'ok');
  assert.equal(s({ burden: 'n', reward: 'n', exp: 'y' }).pref, 'ok');
  assert.equal(s({ burden: 'n', reward: 'n', exp: 'n' }).pref, 'ok');
  assert.equal(s({ burden: 'm', reward: 'y', exp: 'm' }).pref, 'want');
  assert.equal(s({ burden: 'y', reward: 'm' }).pref, 'avoid');
  assert.equal(s({ burden: 'm', reward: 'm', exp: 'm' }).pref, 'ok');
});

test('문항이 없는 역할도 공통 질문 3개로 맞춤 입력이 된다', () => {
  const g = quizFor({ name: '사진 찍기' }, null);
  assert.equal(g.length, 3); assert.deepEqual(g.map((x) => x.t), ['burden', 'reward', 'exp']);
  assert.ok(g.every((x) => x.q.includes('사진 찍기')));
  assert.equal(quizFor({ name: '발표' }, 'present'), QUIZ.present);
  assert.equal(genericQuiz('')[0].t, 'burden');
});

/** 실험(?fun) "체험으로 정하기": 공통 팀플 상황 3컷. 정답·점수·순위 없음.
 *  게이지(진행도·팀 분위기·내 부담)는 선택의 트레이드오프를 보여 줄 뿐 좋고 나쁨의 기준이 아니다.
 *  결과는 "끌린 쪽" 신호만 쓰므로 하고싶어요/상관없어요 제안만 만들 수 있고(피하고싶어요는 추론하지 않는다), 배정 규칙은 바꾸지 않는다.
 *  선택 → 역할 연결(tag)은 우리가 정한 가정이며 정확도는 검증 전이다. 입력은 저장하지 않는다. */
export const KIND_KO = { lead: '이끌기', present: '발표', research: '자료 조사', design: 'PPT·디자인', doc: '문서 정리', scribe: '서기', schedule: '일정 관리', review: '최종 검토', submit: '제출·취합', contact: '소통 창구', facil: '회의 진행', data: '데이터 수집·분석', qna: 'Q&A 준비', dev: '개발', uiux: 'UI/UX 설계', media: '영상·사진' };
const C = (t, tag, fx, who, say) => ({ t, tag, fx, who, say });
export const STORY = [
  { title: '의견이 갈렸어요', ev: false, text: '팀원 4명 중 2명이 서로 다른 의견을 내고 있어요. 마감은 이틀 남았어요.', choices: [
    C('다수결로 빠르게 정한다', 'lead', { pace: 2, mood: -1, load: 0 }, 'mata', '빠르다! 근데 진 쪽 표정이… 살짝 굳었어.'),
    C('양쪽 의견을 받아 적어 한눈에 보이게 정리한다', 'scribe', { pace: -1, mood: 2, load: 1 }, 'taba', '의견이 눈에 보이니까 다들 차분해졌어. 시간은 조금 쓰였지만!'),
    C('일단 역할부터 나누고 나중에 고친다', 'schedule', { pace: 2, mood: 0, load: 0 }, 'mata', '일단 움직이는 거지! 나중에 고칠 일이 생길 수도 있어.'),
    C('근거 자료를 찾아 비교해 보자고 한다', 'research', { pace: -1, mood: 1, load: 1 }, 'taba', '근거가 있으니 설득이 쉬워졌어. 대신 찾느라 바빠졌네.'),
  ] },
  { title: '마감이 다가와요', ev: false, text: '마감 이틀 전인데 한 팀원의 작업이 아직 시작되지 않았어요.', choices: [
    C('바로 연락해 진행 상황을 확인한다', 'schedule', { pace: 1, mood: 1, load: 0 }, 'taba', '먼저 물어봐 주니까 그 팀원도 마음이 편해졌대!'),
    C('내가 대신 일부를 처리한다', null, { pace: 2, mood: 0, load: 2 }, 'mata', '진행은 확 올랐는데… 네 어깨가 무거워 보여.'),
    C('지금까지 나온 자료를 한 문서로 모아 정리한다', 'doc', { pace: 1, mood: 0, load: 1 }, 'taba', '흩어져 있던 자료가 한곳에 모였어! 이제 뭘 해야 할지 보여.'),
    C('팀원들과 상황을 공유하고 해결책을 정한다', 'lead', { pace: 1, mood: 1, load: 1 }, 'mata', '모두가 알게 되니 같이 움직이기 시작했어!'),
  ] },
  { title: '돌발 상황이에요', ev: true, text: '발표 10분 전, 팀원이 만든 슬라이드 한 장에서 오류를 발견했어요.', choices: [
    C('내가 바로 고치고 발표를 진행한다', 'present', { pace: 2, mood: -1, load: 2 }, 'mata', '시간 안에 해냈다! 심장은 좀 뛰었겠지만.'),
    C('그 슬라이드는 빼고 말로 설명한다', 'present', { pace: 1, mood: 0, load: 1 }, 'taba', '깔끔하게 넘어갔어. 설명하는 힘이 필요했겠다!'),
    C('글자를 줄이고 보기 좋게 다시 다듬는다', 'design', { pace: 0, mood: 1, load: 1 }, 'mata', '슬라이드가 한결 눈에 들어오네. 정성이 느껴져!'),
    C('오류의 근거를 출처에서 다시 확인한다', 'research', { pace: -1, mood: 1, load: 1 }, 'taba', '정확한 내용으로 바로잡았어. 확인하길 잘했다!'),
  ] },
];
export const GAUGES = [['pace', '진행도'], ['mood', '팀 분위기'], ['load', '내 부담']];
/** 이 방의 역할 종류와 연결되는 선택지만 남긴다(연결 없는 선택지 null은 항상 남김). 선택지가 2개 미만인 컷은 뺀다. */
export function storyFor(kinds) {
  const ks = new Set(kinds || []);
  return STORY.map((s) => ({ ...s, choices: s.choices.filter((c) => c.tag === null || ks.has(c.tag)) })).filter((s) => s.choices.length >= 2);
}
/** 체험을 쓸 수 있는 방인가: 남는 컷이 2개 이상이어야 한다(역할이 1~2종류뿐이면 신호가 거의 없다). */
/** 이 체험에서 실제로 선택지가 나온 역할 종류. 여기에 없는 역할은 체험으로는 알 수 없다. */
export const askedKinds = (eff) => new Set(eff.flatMap((s) => s.choices.map((c) => c.tag)).filter(Boolean));
export const storyUsable = (kinds) => storyFor(kinds).length >= 2;
export const newStory = (kinds) => ({ sig: [...(kinds || [])].sort().join(','), eff: storyFor(kinds), step: 0, shown: null, picks: [], g: { pace: 5, mood: 5, load: 5 }, done: false });
const clamp = (n) => Math.max(0, Math.min(10, n));
export function applyChoice(st, ci) {
  const c = st.eff[st.step]?.choices[ci];
  if (!c || st.shown !== null) return st;
  st.shown = ci; st.picks.push(ci);
  for (const k of ['pace', 'mood', 'load']) st.g[k] = clamp(st.g[k] + c.fx[k]);
  return st;
}
export function nextStep(st) {
  if (st.shown === null) return st;
  st.shown = null; st.step++;
  if (st.step >= st.eff.length) st.done = true;
  return st;
}
/** 고른 선택에서 끌린 역할 종류(중복 제거). 어느 역할과도 연결되지 않은 선택은 신호 없음. */
export function pickedKinds(picks, eff = STORY) {
  return [...new Set(picks.map((ci, s) => eff[s]?.choices[ci]?.tag).filter(Boolean))];
}
/** 끌린 종류의 역할 → want, 나머지 → ok (피하고싶어요는 만들지 않는다) */
export function prefFor(kind, kinds) { return kind && kinds.includes(kind) ? 'want' : 'ok'; }
/** 점수 없이 경향만 말한다. 단정하지 않는다. */
export function summarize(g) {
  const out = [];
  if (g.mood >= 7) out.push('팀 분위기를 잘 챙기는 선택이 많았어요.');
  if (g.pace >= 7) out.push('일을 빠르게 밀고 나가는 선택이 많았어요.');
  if (g.load >= 7) out.push('내가 직접 떠안는 선택이 많았어요.');
  if (g.pace <= 4) out.push('속도보다 확인하고 맞추는 쪽을 택했어요.');
  if (!out.length) out.push('분위기와 속도의 균형을 맞추는 선택이 많았어요.');
  return out.slice(0, 2);
}

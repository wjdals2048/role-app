// 성향 칩 → 선호 "제안". 배정에는 직접 쓰지 않는다.
// - 사람이 고른 칩은 화면 안에서만 쓰이고 저장되지 않으며, 다른 팀원이나 AI에게 전달되지 않는다.
// - 제안은 우리가 정한 표(아래 TRAITS)로만 만든다. AI가 성향을 해석하지 않는다.
// - 사용자가 직접 고른 선택은 제안이 덮어쓰지 않는다.

import { kindFromName, kindOfRole } from './roleGuide.js';

export const TRAITS = [
  { id: 'shy', label: '낯을 가려요', effects: { present: 'avoid' } },
  { id: 'nervous', label: '발표할 때 떨려요', effects: { present: 'avoid' } },
  { id: 'stage', label: '사람들 앞에서 말하는 게 편해요', effects: { present: 'want' } },
  { id: 'lead', label: '이끄는 게 편해요', effects: { lead: 'want' } },
  { id: 'follow', label: '이끌기보다 맞춰 가는 게 편해요', effects: { lead: 'avoid' } },
  { id: 'research', label: '자료 찾는 게 재미있어요', effects: { research: 'want' } },
  { id: 'research_hard', label: '자료를 오래 찾는 게 부담돼요', effects: { research: 'avoid' } },
  { id: 'design', label: '꾸미고 디자인하는 게 좋아요', effects: { design: 'want' } },
  { id: 'design_hard', label: '화면을 꾸미고 다듬는 게 부담돼요', effects: { design: 'avoid' } },
  { id: 'write', label: '글로 정리하는 게 편해요', effects: { doc: 'want' } },
  { id: 'write_hard', label: '글로 정리하는 게 부담돼요', effects: { doc: 'avoid' } },
  { id: 'record', label: '받아 적고 기록하는 게 편해요', effects: { scribe: 'want' } },
  { id: 'missnote', label: '회의 내용을 놓칠까 부담돼요', effects: { scribe: 'avoid' } },
  { id: 'plan', label: '일정 챙기는 걸 잘해요', effects: { schedule: 'want' } },
  { id: 'deadline', label: '마감 챙기기가 부담돼요', effects: { schedule: 'avoid' } },
  { id: 'check', label: '꼼꼼히 확인하는 게 편해요', effects: { review: 'want' } },
  { id: 'check_hard', label: '고칠 점을 말하는 게 부담돼요', effects: { review: 'avoid' } },
  { id: 'collect', label: '모으고 챙기는 일이 편해요', effects: { submit: 'want' } },
  { id: 'collect_hard', label: '제출 실수가 날까 부담돼요', effects: { submit: 'avoid' } },
  { id: 'reach', label: '먼저 연락하는 게 편해요', effects: { contact: 'want' } },
  { id: 'reach_hard', label: '먼저 연락하는 게 부담돼요', effects: { contact: 'avoid' } },
  { id: 'host', label: '회의를 이끄는 게 편해요', effects: { facil: 'want' } },
  { id: 'host_hard', label: '회의 분위기를 이끄는 게 부담돼요', effects: { facil: 'avoid' } },
  { id: 'num', label: '숫자와 데이터를 다루는 게 편해요', effects: { data: 'want' } },
  { id: 'num_hard', label: '데이터 분석이 부담돼요', effects: { data: 'avoid' } },
  { id: 'qa', label: '질문에 답을 준비하는 게 편해요', effects: { qna: 'want' } },
  { id: 'qa_hard', label: '즉석 질문에 답하는 게 부담돼요', effects: { qna: 'avoid' } },
  { id: 'code', label: '코드를 만드는 게 편해요', effects: { dev: 'want' } },
  { id: 'code_hard', label: '오류를 찾고 고치는 게 부담돼요', effects: { dev: 'avoid' } },
  { id: 'flow', label: '화면과 흐름을 그리는 게 편해요', effects: { uiux: 'want' } },
  { id: 'flow_hard', label: '화면 설계가 부담돼요', effects: { uiux: 'avoid' } },
  { id: 'media', label: '영상이나 사진 다루는 게 편해요', effects: { media: 'want' } },
  { id: 'media_hard', label: '촬영·편집이 부담돼요', effects: { media: 'avoid' } },
];

/** 이름만으로 종류를 추정한다(예전 호환). 방장이 종류를 고른 역할은 kindOfRole을 쓴다. */
export const roleKind = kindFromName;

/** 이 방의 역할과 연결되는 칩만 돌려준다. 해당하는 역할이 없으면 그 칩은 보여 주지 않는다. */
export function relevantTraits(roles) {
  const kinds = new Set((roles || []).map((r) => kindOfRole(r)).filter(Boolean));
  return TRAITS.filter((t) => Object.keys(t.effects).some((k) => kinds.has(k)));
}

/**
 * selected: 고른 칩 id 배열, roles: [{id, name}]
 * 반환: { suggestions: {roleId: {value, labels: [칩 이름]}}, conflicts: [roleId] }
 * 같은 역할에 서로 다른 제안(하고 싶다 vs 하기 싫다)이 겹치면 제안하지 않고 conflicts에 담는다.
 */
export function suggestPrefs(selected, roles) {
  const traits = TRAITS.filter((t) => (selected || []).includes(t.id));
  const suggestions = {};
  const conflicts = [];
  for (const r of roles || []) {
    const kind = kindOfRole(r);
    if (!kind) continue;
    const hits = traits.filter((t) => t.effects[kind]);
    if (!hits.length) continue;
    const values = new Set(hits.map((t) => t.effects[kind]));
    if (values.size > 1) {
      conflicts.push(r.id);
      continue;
    }
    suggestions[r.id] = { value: [...values][0], labels: hits.map((t) => t.label) };
  }
  return { suggestions, conflicts };
}

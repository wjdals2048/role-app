// 성향 칩 → 선호 "제안". 배정에는 직접 쓰지 않는다.
// - 사람이 고른 칩은 화면 안에서만 쓰이고 저장되지 않으며, 다른 팀원이나 AI에게 전달되지 않는다.
// - 제안은 우리가 정한 표(아래 TRAITS)로만 만든다. AI가 성향을 해석하지 않는다.
// - 사용자가 직접 고른 선택은 제안이 덮어쓰지 않는다.

import { kindFromName, kindOfRole } from './roleGuide.js';

export const TRAITS = [
  { id: 'shy', label: '낯을 가려요', effects: { present: 'avoid' } },
  { id: 'nervous', label: '발표할 때 많이 떨려요', effects: { present: 'avoid' } },
  { id: 'stage', label: '사람들 앞에서 말하는 게 편해요', effects: { present: 'want' } },
  { id: 'lead', label: '이끄는 게 편해요', effects: { lead: 'want' } },
  { id: 'follow', label: '이끌기보다 맞춰 가는 게 편해요', effects: { lead: 'avoid' } },
  { id: 'research', label: '자료 찾는 게 재미있어요', effects: { research: 'want' } },
  { id: 'design', label: '꾸미고 디자인하는 게 좋아요', effects: { design: 'want' } },
  { id: 'write', label: '글로 정리하는 게 편해요', effects: { doc: 'want' } },
  { id: 'plan', label: '일정 챙기는 걸 잘해요', effects: { schedule: 'want' } },
  { id: 'deadline', label: '마감 챙기기가 부담돼요', effects: { schedule: 'avoid' } },
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

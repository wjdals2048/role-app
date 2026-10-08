// 역할 종류와 기본 설명·할 일 목록(체크리스트) 템플릿.
// - AI가 만든 내용이 아니라 우리가 미리 정해 둔 문구다. 방장이 자유롭게 고칠 수 있다.
// - 종류(kind)는 방장이 고르거나, 고르지 않으면 역할 이름의 키워드로 추정한다.

export const KINDS = [
  { id: 'lead', label: '팀장·이끌기' },
  { id: 'present', label: '발표' },
  { id: 'research', label: '자료 조사' },
  { id: 'design', label: 'PPT·디자인' },
  { id: 'doc', label: '문서 정리' },
  { id: 'schedule', label: '일정 관리' },
  { id: 'other', label: '기타(직접 쓰기)' },
];

export const KIND_IDS = KINDS.map((k) => k.id);

export const PHASES = [
  { id: 'start', label: '시작할 때' },
  { id: 'during', label: '진행하는 동안' },
  { id: 'end', label: '마감 직전' },
];

const T = (desc, start, during, end) => ({ desc, steps: { start, during, end } });

export const GUIDE_TEMPLATES = {
  lead: T('팀의 방향을 정하고, 일이 멈추지 않게 챙겨요.',
    ['첫 회의 날짜를 잡고 역할 분담 확정하기', '할 일과 마감일을 한곳에 정리해 두기'],
    ['진행 상황을 묻고 막힌 곳 함께 풀기'],
    ['전체 결과물 한 번 훑어보기']),
  present: T('팀이 만든 결과를 다른 사람 앞에서 전달해요.',
    ['발표 흐름(시작·본론·마무리)을 팀과 정하기', '대본이나 핵심 메모 만들기'],
    ['소리 내어 두 번 이상 연습하기'],
    ['예상 질문 3개를 팀에 물어 두기']),
  research: T('필요한 자료를 찾아 출처와 함께 정리해요.',
    ['무엇을 알아야 하는지 질문 목록 만들기'],
    ['자료를 찾고 출처(링크)를 함께 적기', '핵심만 3~5줄로 요약해 팀에 공유하기'],
    ['믿을 만한 자료인지 한 번 더 확인하기']),
  design: T('결과물이 한눈에 보기 좋게 만들어요.',
    ['색과 글꼴 같은 기본 틀 먼저 정하기', '팀원 내용이 들어올 자리 만들어 두기'],
    ['글자 크기와 정렬 통일하기'],
    ['처음부터 끝까지 넘겨 보며 고치기']),
  doc: T('회의 내용과 결과물을 글로 정리해요.',
    ['기록할 곳(문서 파일)을 정해 팀에 알리기'],
    ['회의에서 정한 내용 바로 기록하기', '정리한 글을 팀에 공유하고 확인받기'],
    ['오탈자 점검하고 최신 버전 확정하기']),
  schedule: T('일정과 마감이 지켜지도록 챙겨요.',
    ['전체 마감일부터 거꾸로 일정 짜기', '회의 시간을 잡고 팀에 알리기'],
    ['진행 상황을 틈틈이 확인하기', '늦어질 것 같은 일은 먼저 팀과 이야기하기'],
    ['빠진 것이 없는지 함께 점검하기']),
  other: T('', [], [], []),
};

const KEYWORDS = [
  ['lead', ['팀장', '리더', '조장']],
  ['present', ['발표']],
  ['research', ['조사', '리서치', '자료']],
  ['design', ['ppt', '피티', '디자인']],
  ['doc', ['문서', '정리', '기록', '서기']],
  ['schedule', ['일정', '마감', '스케줄']],
];

/** 역할 이름에서 종류를 추정한다. 못 알아보면 null. */
export function kindFromName(name) {
  const t = String(name || '').toLowerCase().replace(/\s+/g, '');
  for (const [kind, words] of KEYWORDS) {
    if (words.some((w) => t.includes(w))) return kind;
  }
  return null;
}

/**
 * 역할의 종류. 방장이 고른 값이 있으면 그것을, 없으면 이름으로 추정한다.
 * 'other'는 "연결되는 종류 없음"이라 성향 칩에는 쓰지 않는다(null).
 */
export function kindOfRole(role) {
  if (role && KIND_IDS.includes(role.kind)) return role.kind === 'other' ? null : role.kind;
  return kindFromName(role?.name);
}

/** 템플릿 내용(복사본). 종류가 없거나 other면 빈 내용. */
export function templateFor(kind) {
  const t = GUIDE_TEMPLATES[kind];
  if (!t) return { desc: '', steps: { start: [], during: [], end: [] } };
  return { desc: t.desc, steps: { start: [...t.steps.start], during: [...t.steps.during], end: [...t.steps.end] } };
}

export const DESC_MAX = 60;
export const STEP_MAX = 30; // 한 줄 글자 수
export const STEP_COUNT = 3; // 시기마다 최대 줄 수

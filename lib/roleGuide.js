// 역할 종류와 기본 설명·할 일 목록(체크리스트) 템플릿.
// - AI가 만든 내용이 아니라 우리가 미리 정해 둔 문구다. 방장이 자유롭게 고칠 수 있다.
// - 종류(kind)는 방장이 고르거나, 고르지 않으면 역할 이름의 키워드로 추정한다.

export const KINDS = [
  { id: 'lead', label: '팀장·이끌기' },
  { id: 'present', label: '발표' },
  { id: 'research', label: '자료 조사' },
  { id: 'design', label: 'PPT·디자인' },
  { id: 'doc', label: '문서 정리' },
  { id: 'scribe', label: '서기' },
  { id: 'schedule', label: '일정 관리' },
  { id: 'review', label: '최종 검토' },
  { id: 'submit', label: '제출·취합' },
  { id: 'contact', label: '소통 창구' },
  { id: 'facil', label: '회의 진행' },
  { id: 'data', label: '데이터 수집·분석' },
  { id: 'qna', label: 'Q&A 준비' },
  { id: 'dev', label: '개발' },
  { id: 'uiux', label: 'UI/UX 설계' },
  { id: 'media', label: '영상·사진' },
  { id: 'other', label: '기타(직접 쓰기)' },
];

export const KIND_IDS = KINDS.map((k) => k.id);

/** 재미로 보는 참고용 MBTI. 우리가 임의로 정한 표이며 근거 있는 추천이 아니다. 저장하지 않고 배정에도 쓰지 않는다. */
export const KIND_MBTI = {
  lead: ['ENTJ', 'ESTJ'],
  present: ['ENFP', 'ESFP'],
  research: ['INTP', 'INTJ'],
  design: ['INFP', 'ISFP'],
  doc: ['ISTJ', 'INFJ'],
  scribe: ['ISFJ', 'ESFJ'],
  schedule: ['ESTJ', 'ISFJ'],
};

/** 카드에 보여 주는 "부담될 수 있어요 / 뿌듯할 수 있어요". 우리가 정한 일반적인 예시이며 사람을 평가하지 않는다. 배정에는 쓰지 않는다. */
export const KIND_FEEL = {
  lead: { hard: '의견이 엇갈릴 때 결정을 내려야 해요', good: '팀이 한 방향으로 움직일 때' },
  present: { hard: '사람들 앞에서 말하고 질문에 답해야 해요', good: '팀의 내용을 잘 전달했을 때' },
  research: { hard: '자료를 찾고 출처를 비교하느라 시간이 걸릴 수 있어요', good: '팀이 쓸 수 있는 자료를 찾았을 때' },
  design: { hard: '자료를 줄이고 우선순위를 정해야 하고, 수정 요청이 반복될 수 있어요', good: '자료가 깔끔하게 완성됐을 때' },
  doc: { hard: '여러 사람의 자료를 모아 하나로 맞춰야 해요', good: '흩어진 내용이 한 문서로 정리됐을 때' },
  scribe: { hard: '회의 중 내용을 놓치지 않고 적어야 해요', good: '회의 내용이 한눈에 정리됐을 때' },
  schedule: { hard: '마감과 일정을 계속 챙겨야 해요', good: '팀이 일정에 맞춰 움직일 때' },
  review: { hard: '남이 만든 결과를 꼼꼼히 살피고 고칠 점을 말해야 해요', good: '마감 전에 오류를 잡아냈을 때' },
  submit: { hard: '제출 형식과 마감을 놓치지 않아야 해요', good: '모든 결과물이 빠짐없이 제출됐을 때' },
  contact: { hard: '먼저 연락하고 답을 기다려야 해요', good: '궁금한 점이 풀려 팀이 막힘없이 움직일 때' },
  facil: { hard: '의견이 갈릴 때 이야기를 정리하며 끌고 가야 해요', good: '회의가 정해진 시간 안에 결론으로 끝날 때' },
  data: { hard: '응답을 모으고 숫자를 정확히 다뤄야 해요', good: '모은 데이터에서 팀이 쓸 결과가 나왔을 때' },
  qna: { hard: '질문을 예상하고 답을 미리 준비해야 해요', good: '받은 질문에 팀이 막힘없이 답했을 때' },
  dev: { hard: '오류를 찾고 기능이 동작하게 만드는 데 시간이 걸릴 수 있어요', good: '만든 기능이 실제로 동작할 때' },
  uiux: { hard: '쓰는 사람의 입장에서 흐름을 계속 다듬어야 해요', good: '써 보는 사람이 헤매지 않고 끝까지 갈 때' },
  media: { hard: '촬영과 편집에 시간이 많이 걸릴 수 있어요', good: '만든 영상이나 사진으로 결과물이 돋보일 때' },
};

/** 역할 아이콘(성향·할 일 제안과는 별개로, 보이는 모양만 바꾼다) */
export const ICON_IDS = ['flag', 'monitor', 'search', 'pencil', 'doc', 'calendar', 'camera', 'chat', 'book', 'code', 'megaphone', 'star', 'check', 'send', 'chart', 'help', 'layout'];

export const PHASES = [
  { id: 'start', label: '시작할 때' },
  { id: 'during', label: '진행하는 동안' },
  { id: 'end', label: '마감 직전' },
];

const T = (desc, start, during, end) => ({ desc, tasks: [...start, ...during, ...end] });

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
  doc: T('팀원들의 자료와 결과물을 한 문서로 정리해요.',
    ['기록할 곳(문서 파일)을 정해 팀에 알리기'],
    ['팀원이 낸 자료를 한 문서로 모으기', '정리한 글을 팀에 공유하고 확인받기'],
    ['오탈자 점검하고 최신 버전 확정하기']),
  scribe: T('회의에서 나온 이야기와 결정을 기록해요.',
    ['회의 기록을 남길 곳 정해 팀에 알리기'],
    ['회의에서 정한 일과 담당을 바로 적기', '회의가 끝나면 기록을 팀에 공유하기'],
    ['정한 일이 모두 반영됐는지 확인하기']),
  schedule: T('일정과 마감이 지켜지도록 챙겨요.',
    ['전체 마감일부터 거꾸로 일정 짜기', '회의 시간을 잡고 팀에 알리기'],
    ['진행 상황을 틈틈이 확인하기', '늦어질 것 같은 일은 먼저 팀과 이야기하기'],
    ['빠진 것이 없는지 함께 점검하기']),
  review: T('마감 전에 결과물을 훑어보고 빠진 곳과 오류를 찾아요.',
    ['검토 기준(오탈자·출처·빠진 내용) 팀과 정하기'],
    ['팀원이 낸 결과물을 읽고 고칠 점 적어 전달하기'],
    ['제출 전 마지막으로 전체 한 번 더 확인하기']),
  submit: T('각자의 결과물을 모아 빠짐없이 제출해요.',
    ['제출 방법과 마감 시각 확인하기'],
    ['팀원별 결과물이 모였는지 확인하기'],
    ['제출 후 접수됐는지 확인해 팀에 알리기']),
  contact: T('교수님·멘토 등 외부와 연락하고 소식을 팀에 전해요.',
    ['연락할 대상과 연락 방법 정해 팀에 알리기'],
    ['질문이나 안내를 받으면 팀에 바로 공유하기'],
    ['남은 확인 사항이 없는지 한 번 더 묻기']),
  facil: T('회의 안건과 시간을 정하고 이야기가 이어지게 해요.',
    ['회의 안건과 시간 미리 공유하기'],
    ['안건 순서대로 진행하며 말이 한쪽에 몰리지 않게 살피기'],
    ['정해진 내용을 요약해 마무리하기']),
  data: T('설문·인터뷰 같은 자료를 모으고 숫자와 내용을 정리해요.',
    ['무엇을 알아낼지 질문과 방법 정하기'],
    ['응답을 모으고 숫자와 내용으로 정리하기'],
    ['결과를 팀이 쓸 수 있게 표·그래프로 요약하기']),
  qna: T('발표 뒤 나올 질문을 예상하고 답변을 준비해요.',
    ['발표 내용에서 질문받을 만한 부분 골라 두기'],
    ['예상 질문과 답변을 정리해 팀과 나누기'],
    ['질문을 받는 연습을 팀과 한 번 해 보기']),
  dev: T('서비스나 결과물이 동작하도록 코드를 만들어요.',
    ['만들 기능과 우선순위 팀과 정하기'],
    ['기능을 나눠 만들고 팀에 바로 공유하기'],
    ['동작을 확인하고 남은 오류 고치기']),
  uiux: T('사용하는 사람이 쓰기 쉽게 화면과 흐름을 설계해요.',
    ['쓰는 사람과 해야 할 일 정리하기'],
    ['화면 흐름을 그리고 팀과 확인하기'],
    ['처음 보는 사람이 써 보게 해 보고 고치기']),
  media: T('영상이나 사진 같은 시각 자료를 찍고 다듬어요.',
    ['필요한 영상·사진 목록과 분량 정하기'],
    ['촬영하거나 이미지를 만들어 팀에 공유하기'],
    ['파일 형식과 용량 확인해 최종본 만들기']),
  other: T('', [], [], []),
};

const KEYWORDS = [
  ['lead', ['팀장', '리더', '조장']],
  ['present', ['발표']],
  ['qna', ['q&a', 'qna', '질의', '예상질문']],
  ['uiux', ['ui/ux', 'uiux', 'ux', '유아이', '유엑스']],
  ['dev', ['개발', '코딩', '프로그래밍']],
  ['design', ['ppt', '피티', '디자인']],
  ['media', ['영상', '촬영', '사진', '이미지']],
  ['review', ['검토', '교정', '검수', '리뷰']],
  ['submit', ['제출', '취합', '업로드']],
  ['contact', ['소통', '연락', '창구', '커뮤니케이션']],
  ['facil', ['회의진행', '진행자', '사회자', '퍼실리']],
  ['data', ['데이터', '분석', '설문', '인터뷰']],
  ['research', ['조사', '리서치', '자료']],
  ['scribe', ['서기', '기록', '회의록']],
  ['doc', ['문서', '정리']],
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
  if (role && KIND_IDS.includes(role.kind)) {
    if (role.kind === 'other') return null;
    // 이름을 고친 뒤에도 예전 종류가 남은 경우(팀장 → 발표자료 등): 이름이 다른 종류를 가리키면 이름을 따른다.
    const byName = kindFromName(role.name);
    return byName && byName !== role.kind ? byName : role.kind;
  }
  return kindFromName(role?.name);
}

/** 역할 종류별 한 줄 설명 예시(입력 칸의 예시 문구로만 쓴다. 값으로 채우지 않는다). */
export function exampleDesc(kind) {
  return GUIDE_TEMPLATES[kind]?.desc || '';
}

/** 템플릿 내용(복사본). 종류가 없거나 other면 빈 내용. */
export function templateFor(kind) {
  const t = GUIDE_TEMPLATES[kind];
  if (!t) return { desc: '', tasks: [] };
  return { desc: t.desc, tasks: [...t.tasks] };
}

export const DESC_MAX = 60;
export const STEP_MAX = 30; // 한 줄 글자 수
export const STEP_COUNT = 30; // 최대 줄 수 (화면에는 드러내지 않는 안전 한도)

import './style.css';
import { createStore } from './store.js';
import { normalizePrefs, normalizeRoles, normalizeTasks, normalizeRoomName, isNicknameTaken, normalizeMessage, MESSAGE_MAX, normalizeCapacity, CAPACITY_MIN, CAPACITY_MAX , LOAD_LABEL } from '../lib/roomService.js';
import { AVATAR_IDS, AVATAR_BG, AVATAR_LABEL, validAvatar, defaultAvatar } from '../lib/avatars.js';
import { relevantTraits, suggestPrefs } from '../lib/traits.js';
import { makeLadder, walkLadder } from '../lib/ladder.js';
import { KINDS, KIND_MBTI, ICON_IDS, DESC_MAX, STEP_MAX, STEP_COUNT, kindFromName, kindOfRole, exampleDesc, templateFor } from '../lib/roleGuide.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TEMPLATES = [
  { name: '팀장', load: 3 },
  { name: '발표', load: 3 },
  { name: '자료 조사', load: 2 },
  { name: 'PPT·디자인', load: 2 },
  { name: '문서 정리', load: 2 },
  { name: '일정 관리', load: 1 },
];

let store = null;
let unsubs = [];
let toastTimer = null;
let S = null; // 방 화면 상태
const REDUCED_MOTION = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** 짧은 효과 재생: 클래스를 붙였다가 끝나면 뗀다 (동작 줄이기 설정은 CSS에서 끈다) */
function playAnim(sel, cls, ms = 600) {
  const el = typeof sel === 'string' ? $app.querySelector(sel) : sel;
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
const home = { capacity: null, selected: new Map(TEMPLATES.slice(0, 4).map((t) => [t.name, t.load])), custom: [], roomName: '' };

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}
const savedNick = () => {
  try { return localStorage.getItem('roleapp-nick') || ''; } catch { return ''; }
};
const saveNick = (n) => {
  try { localStorage.setItem('roleapp-nick', n); } catch { /* 저장 못 해도 동작에는 문제 없음 */ }
};
/* 프로필 캐릭터: 방 안에서는 닉네임처럼 공개되는 정보. 이 브라우저에 마지막 선택을 기억해 다음 방에서 먼저 보여 준다. */
const savedAvatar = () => {
  try { const a = localStorage.getItem('roleapp-avatar'); return validAvatar(a) ? a : ''; } catch { return ''; }
};
const saveAvatar = (a) => {
  try { localStorage.setItem('roleapp-avatar', a); } catch { /* 저장 못 해도 동작에는 문제 없음 */ }
};
let draftAv = savedAvatar() || (Math.random() < 0.5 ? 'M_base' : 'T_base');
const avatarOf = (m) => (validAvatar(m?.avatar) ? m.avatar : defaultAvatar(m?.uid || m?.nickname || ''));
const avOfUid = (uid) => avatarOf(S?.members?.find((m) => m.uid === uid) || { uid });
const avatarHtml = (id, cls = '', extra = '') => `<span class="avimg c${id[0].toLowerCase()} ${cls}" style="background:${AVATAR_BG[id[0]] || '#DDE1FF'}"${extra}><img src="/avatars/${id}.png" alt="" draggable="false" /></span>`;
const avatarPickerHtml = (cur, mode) => `<div class="avp" data-avp="${mode}" role="group" aria-label="프로필 캐릭터">${AVATAR_IDS.map((id) => `<button type="button" class="avp-opt${id === cur ? ' on' : ''}" data-av="${id}" aria-pressed="${id === cur}" aria-label="${id[0] === 'M' ? '마타' : '타바'} ${AVATAR_LABEL[id.slice(2)]}">${avatarHtml(id)}</button>`).join('')}</div>`;
/* 최근 들어간 방: 이 브라우저에만 저장한다(계정이 없어서 다른 기기에서는 보이지 않는다) */
const RECENT_KEY = 'roleapp-recent-rooms';
function recentRooms() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.code).slice(0, 5) : [];
  } catch { return []; }
}
function rememberRoom(code, name) {
  try {
    const list = recentRooms().filter((x) => x.code !== code);
    list.unshift({ code, name: String(name || '').slice(0, 20) });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch { /* 저장 못 해도 동작에는 문제 없음 */ }
}
function forgetRoom(code) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentRooms().filter((x) => x.code !== code))); } catch { /* 무시 */ }
}

/* 내 역할 할 일 체크: 나만 보는 값, 이 브라우저에만 저장 */
let memChecks = {};
const checksKey = () => `roleapp-checks-${S?.code || ''}`;
function readChecks() {
  try { return JSON.parse(localStorage.getItem(checksKey()) || '{}'); } catch { return memChecks[checksKey()] || {}; }
}
function isChecked(rid, t) { return (readChecks()[rid] || []).includes(t); }
function toggleCheck(rid, t, on) {
  const c = readChecks();
  const set = new Set(c[rid] || []);
  if (on) set.add(t); else set.delete(t);
  c[rid] = [...set];
  memChecks[checksKey()] = c;
  try { localStorage.setItem(checksKey(), JSON.stringify(c)); } catch { /* 저장 못 하면 이 탭 안에서만 유지 */ }
}

/** 할 일 항목형 입력(역할 편집·카드 수정 공용). 비어 있으면 안내만 보인다. */
function taskEditorHtml(items, kind) {
  return `
    <div class="task-ed">
      ${items.length
        ? `<ul class="task-list">${items.map((t, i) => `<li class="task-row"><span class="task-box" aria-hidden="true"></span><input type="text" class="t-in" data-ti="${i}" maxlength="${STEP_MAX}" value="${esc(t)}" placeholder="할 일을 적어 주세요" aria-label="할 일 ${i + 1}" /><button type="button" class="x t-del" data-ti="${i}" aria-label="할 일 ${i + 1} 삭제">✕</button></li>`).join('')}</ul>`
        : '<p class="muted small task-empty">아직 할 일이 없어요. 아래에서 추가해 보세요.</p>'}
      <button type="button" class="btn line small t-add">+ 할 일 추가</button>
    </div>`;
}
const focusLastTask = (root) => { const ins = root?.querySelectorAll('.t-in'); if (ins?.length) ins[ins.length - 1].focus(); };

const modeBadge = () => (store?.mode === 'demo' ? '<span class="badge demo">연습 모드 · 이 브라우저 안에서만 동작해요</span>' : '');

function cleanup() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
  S = null;
}

/* ---------------- 시작 화면 ---------------- */
function wordmark(id) {
  return `<svg viewBox="25 0 185 100" class="wm-svg" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="235" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A6BE0"/><stop offset=".40" stop-color="#7A6BE0"/><stop offset=".60" stop-color="#F2B134"/><stop offset="1" stop-color="#F2B134"/></linearGradient></defs><text x="117.5" y="82" text-anchor="middle" font-family="Dongle,Jua,sans-serif" font-size="112" letter-spacing="-1" fill="url(#${id})" stroke="url(#${id})" stroke-width="1.8" stroke-linejoin="round">마타바</text></svg>`;
}

function renderStart() {
  cleanup();
  $app.innerHTML = `
    <main class="start">
      ${modeBadge()}
      <div class="start-brand">
        <div class="start-chars" aria-hidden="true">
          <img class="sc-mata" src="/mata.png" alt="" width="420" height="440" />
          <img class="sc-taba" src="/taba.png" alt="" width="380" height="429" />
        </div>
        <h1 class="start-wm"><span class="sr-only">마타바</span>${wordmark('gStart')}</h1>
        <p class="start-topic">팀플 역할 정하기</p>
        <p class="start-slogan">말하기 어려운 선호, 마타바에 살짝 말해요</p>
      </div>
      <div class="start-actions">
        <button type="button" class="start-card" id="go-create"><span class="sc-ic mata"><img src="/mata-s.png" alt="" /></span>방 만들기</button>
        <button type="button" class="start-card" id="go-join"><span class="sc-ic taba"><img src="/taba-s.png" alt="" /></span>방 참여하기</button>
      </div>
      ${recentRooms().length ? `<section class="recent" aria-label="최근 들어간 방"><h2>최근 들어간 방</h2>${recentRooms().slice(0, 3).map((r) => `<div class="recent-row"><button type="button" class="recent-go" data-code="${esc(r.code)}"><b>${esc(r.name || '이름 없는 방')}</b><small>${esc(r.code)}</small></button><button type="button" class="x recent-del" data-code="${esc(r.code)}" aria-label="${esc(r.name || r.code)} 목록에서 지우기">✕</button></div>`).join('')}</section>` : ''}
      <button type="button" class="about-link" id="go-about">마타·타바는 누구예요?</button>
    </main>`;
  $app.querySelectorAll('.recent-go').forEach((b) => b.addEventListener('click', () => (location.hash = `#/room/${b.dataset.code}`)));
  $app.querySelectorAll('.recent-del').forEach((b) => b.addEventListener('click', () => { forgetRoom(b.dataset.code); renderStart(); }));
  $app.querySelector('#go-about').addEventListener('click', () => (location.hash = '#/about'));
  $app.querySelector('#go-create').addEventListener('click', () => (location.hash = '#/create'));
  $app.querySelector('#go-join').addEventListener('click', () => (location.hash = '#/join'));
}


/* ---------------- 캐릭터 소개 ---------------- */
const CHARS = [
  {
    key: 'M', cls: 'mata', name: '마타', en: 'MATA', hero: '/mata.png', color: '라벤더 퍼플', hex: '#8274E8',
    say: '함께라면 더 잘할 수 있어!',
    intro: '차분하고 꼼꼼해요. 다른 사람의 마음을 잘 헤아리고, 팀원들이 편하게 의견을 말할 수 있도록 도와줘요.',
    like: '팀원들의 다양한 의견, 조용한 카페, 계획 세우기',
    dislike: '어색한 분위기, 무리한 결정, 혼자만의 부담',
  },
  {
    key: 'T', cls: 'taba', name: '타바', en: 'TABA', hero: '/taba.png', color: '버터 옐로우', hex: '#FFD166',
    say: '언제든 말해줘!',
    intro: '밝고 활발하며, 어색한 순간을 가볍게 풀어주는 분위기 메이커예요.',
    like: '새로운 경험, 칭찬하기, 친구들과 수다 떨기',
    dislike: '지루한 분위기, 복잡한 규칙, 혼자만의 부담',
  },
];
const POSES = [['base', '기본'], ['wink', '윙크'], ['happy', '신남'], ['think', '고민'], ['wow', '놀람'], ['sleep', '숙면']];

function renderAbout(sel = 'M') {
  cleanup();
  const c = CHARS.find((x) => x.key === sel);
  $app.innerHTML = `
    <main class="about">
      <div class="back-row"><button type="button" class="link back-chev" id="back" aria-label="뒤로 가기">‹</button></div>
      <h1 class="about-title">마타·타바 소개</h1>
      <p class="muted">친구를 눌러 보세요</p>
      <div class="ab-tabs" role="tablist">
        ${CHARS.map((x) => `<button type="button" role="tab" aria-selected="${x.key === sel}" class="ab-tab ${x.cls}${x.key === sel ? ' on' : ''}" data-k="${x.key}"><img src="${x.hero}" alt="" /><span>${x.name}${x.key === sel ? ' ▾' : ''}</span></button>`).join('')}
      </div>
      <section class="ch ${c.cls}" role="tabpanel">
        <p class="ch-say">“${c.say}”</p>
        <p class="ch-intro">${c.intro}</p>
        <dl class="ch-dl"><dt>좋아하는 것</dt><dd>${c.like}</dd><dt>싫어하는 것</dt><dd>${c.dislike}</dd></dl>
        <div class="ch-poses">${POSES.map(([k, l]) => `<figure><img src="/chars/${c.key}_${k}.png" alt="${c.name} ${l}" /><figcaption>${l}</figcaption></figure>`).join('')}</div>
      </section>
      <p class="about-slogan">너의 선택이, 좋은 팀을 만든다.</p>
      <button type="button" class="btn big" id="to-start">돌아가기</button>
    </main>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
  $app.querySelector('#to-start').addEventListener('click', () => (location.hash = '#/'));
  $app.querySelectorAll('.ab-tab').forEach((b) => b.addEventListener('click', () => renderAbout(b.dataset.k)));
}

/* ---------------- 방 코드로 들어가기 ---------------- */
function renderJoinCode() {
  cleanup();
  $app.innerHTML = `
    <div class="back-row"><button type="button" class="link back-chev" id="back" aria-label="뒤로 가기">‹</button>${modeBadge()}</div>
    <section class="card stack" aria-labelledby="h-join">
      <div><h1 id="h-join" class="page-title">방 코드로 들어가기</h1><p class="muted" style="margin-top:6px">방장에게 받은 6자리 코드를 넣어 주세요. 닉네임은 다음 화면에서 정해요.</p></div>
      <input id="join-code" class="code-input" type="text" maxlength="6" placeholder="ABC123" aria-label="방 코드" autocomplete="off" autocapitalize="characters" />
      <button type="button" class="btn big" id="join">들어가기</button>
    </section>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
  const input = $app.querySelector('#join-code');
  let checking = false;
  const go = async () => {
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return toast('방 코드는 영문 대문자와 숫자 6자리예요.');
    if (checking) return;
    checking = true;
    const btn = $app.querySelector('#join');
    if (btn) btn.disabled = true;
    let room = true;
    try { room = store?.getRoom ? await store.getRoom(code) : true; } catch { room = true; } // 확인이 안 되면 기존처럼 다음 화면에서 안내
    checking = false;
    if (btn) btn.disabled = false;
    if (!room) { toast('이 코드의 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.'); input.focus(); input.select(); return; }
    location.hash = `#/room/${code}`;
  };
  $app.querySelector('#join').addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  input.focus();
}

/* ---------------- 방 만들기 ---------------- */
function renderCreate() {
  cleanup();
  if (!home.capacity) home.capacity = store?.mode === 'demo' ? 1 : 4; // 체험은 혼자 해 볼 수 있게 1명부터
  const customList = home.custom.filter((n) => !TEMPLATES.some((t) => t.name === n));
  const chipIcon = (n) => { const k = kindFromName(n); return k ? roleIcon({ kind: k }, 15) : ''; };
  $app.innerHTML = `
    <div class="back-row"><button type="button" class="link back-chev" id="back" aria-label="뒤로 가기">‹</button>${modeBadge()}</div>
    <section class="create stack" aria-labelledby="h-create">
      <div class="create-head"><h1 id="h-create" class="page-title">방 만들기</h1><img class="create-mata" src="/mata.png" alt="" width="78" height="82" /></div>
      <div>
        <label for="room-name">방 이름 <span class="tag req">필수</span><span class="cnt" id="cnt-name"></span></label>
        <input id="room-name" type="text" maxlength="20" placeholder="예: PM캠프 3조 최종 프로젝트" value="${esc(home.roomName || '')}" autocomplete="off" />
        <p class="err" id="err-name" hidden>방 이름을 입력해 주세요</p>
      </div>
      <div>
        <label for="nick">내 닉네임 <span class="tag req">필수</span><span class="cnt" id="cnt-nick"></span></label>
        <div class="nick-row"><button type="button" class="av-btn" data-av-toggle="draft" aria-label="프로필 캐릭터 고르기">${avatarHtml(draftAv)}<i class="av-edit" aria-hidden="true">✎</i></button><input id="nick" type="text" maxlength="12" placeholder="예: 정민" value="${esc(savedNick())}" autocomplete="off" /></div>
        <div class="avp-wrap" id="avp-draft" hidden>${avatarPickerHtml(draftAv, 'draft')}</div>
        <p class="err" id="err-nick" hidden>닉네임을 입력해 주세요</p>
      </div>
      <div>
        <label for="cap">팀원 수 <span class="tag req">나 포함</span></label>
        <div class="cap-row"><select id="cap" class="cap-select" aria-label="팀원 수">${Array.from({ length: CAPACITY_MAX - CAPACITY_MIN + 1 }, (_, i) => CAPACITY_MIN + i).map((n) => `<option value="${n}" ${home.capacity === n ? 'selected' : ''}>${n}명</option>`).join('')}</select><span class="muted small">이 인원이 차면 더는 입장할 수 없어요</span></div>
      </div>
      <div>
        <label>필요한 역할 <span class="tag req">1개 이상</span></label>
        <div class="chips" id="role-chips">
          ${TEMPLATES.map((t) => `<button type="button" class="chip" data-role="${esc(t.name)}" aria-pressed="${home.selected.has(t.name)}">${chipIcon(t.name)}${esc(t.name)}</button>`).join('')}
          ${customList.map((n) => `<button type="button" class="chip" data-role="${esc(n)}" aria-pressed="${home.selected.has(n)}">${chipIcon(n)}${esc(n)}</button>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <div class="grow"><input id="custom-role" class="dashed" type="text" maxlength="20" placeholder="+ 직접 추가: 예) 발표 자료 검수" aria-label="직접 추가할 역할 이름" /></div>
          <button type="button" class="btn ghost" id="add-custom">추가</button>
        </div>
        <p class="err" id="err-roles" hidden>역할을 1개 이상 골라 주세요</p>
        <p class="notice cap-hint" id="cap-hint" hidden></p>
      </div>
      <button type="button" class="btn big" id="create">방 만들기</button>
      <p class="muted small center" id="create-note"></p>
    </section>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
  const $name = $app.querySelector('#room-name');
  $name.addEventListener('input', () => (home.roomName = $name.value));

  const $nick = $app.querySelector('#nick');
  const seen = { name: !!home.roomName, nick: false, roles: false };
  const refresh = () => {
    const nameOk = !!normalizeRoomName($name.value);
    const nickOk = !!$nick.value.replace(/\s+/g, ' ').trim();
    const rolesOk = home.selected.size > 0;
    const set = (id, show) => { const e = $app.querySelector(id); if (e) e.hidden = !show; };
    const capHint = $app.querySelector('#cap-hint');
    const nr = home.selected.size;
    const capMsg = nr && nr > home.capacity ? `역할 ${nr}개, 팀원 ${home.capacity}명이에요. 한 사람이 역할을 여러 개 맡을 수 있어요.` : nr && nr < home.capacity ? `역할 ${nr}개, 팀원 ${home.capacity}명이에요. 역할 없이 남는 팀원이 생길 수 있어요.` : '';
    capHint.textContent = capMsg; capHint.hidden = !capMsg;
    $app.querySelector('#cnt-name').textContent = `${$name.value.length}/20`;
    $app.querySelector('#cnt-nick').textContent = `${$nick.value.length}/12`;
    set('#err-name', seen.name && !nameOk); set('#err-nick', seen.nick && !nickOk); set('#err-roles', seen.roles && !rolesOk);
    $name.classList.toggle('bad', seen.name && !nameOk); $nick.classList.toggle('bad', seen.nick && !nickOk);
    const missing = [!nameOk && '방 이름', !nickOk && '닉네임', !rolesOk && '역할'].filter(Boolean);
    const btn = $app.querySelector('#create');
    btn.classList.toggle('off', missing.length > 0);
    btn.setAttribute('aria-disabled', String(missing.length > 0));
    $app.querySelector('#create-note').textContent = missing.length ? `${missing.join(', ')}을 채우면 만들 수 있어요` : '';
  };
  $name.addEventListener('blur', () => { seen.name = true; refresh(); });
  $nick.addEventListener('blur', () => { seen.nick = true; refresh(); });
  $nick.addEventListener('input', refresh);
  $name.addEventListener('input', refresh);
  $app.querySelector('#cap').addEventListener('change', (e) => { home.capacity = normalizeCapacity(e.target.value) || 1; refresh(); });
  $app.querySelector('#role-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const name = b.dataset.role;
    if (home.selected.has(name)) home.selected.delete(name);
    else home.selected.set(name, TEMPLATES.find((t) => t.name === name)?.load ?? 2);
    b.setAttribute('aria-pressed', home.selected.has(name));
    seen.roles = true;
    refresh();
  });
  const addCustom = () => {
    const input = $app.querySelector('#custom-role');
    const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) return;
    if (!TEMPLATES.some((t) => t.name === name) && !home.custom.includes(name)) home.custom.push(name);
    home.selected.set(name, home.selected.get(name) ?? 2);
    input.value = '';
    const keep = $nick.value;
    renderCreate();
    $app.querySelector('#nick').value = keep;
    $app.querySelector('#nick').dispatchEvent(new Event('input'));
  };
  $app.querySelector('#add-custom').addEventListener('click', addCustom);
  $app.querySelector('#custom-role').addEventListener('keydown', (e) => e.key === 'Enter' && addCustom());
  $app.querySelector('#create').addEventListener('click', async (e) => {
    const nickname = $nick.value.replace(/\s+/g, ' ').trim().slice(0, 12);
    const roomName = normalizeRoomName(home.roomName);
    if (!roomName || !nickname || !home.selected.size) { seen.name = seen.nick = seen.roles = true; refresh(); return; }
    const roles = normalizeRoles(
      [...home.selected].map(([name, load], i) => {
        const kind = kindFromName(name) || ''; // 설명·할 일은 비워 둔다(방장이 직접 적는다). 종류는 성향 제안에만 쓴다.
        return { id: `r${i + 1}`, name, need: 1, load, kind, desc: '', tasks: [] };
      }),
    );
    if (!roles.length) { seen.roles = true; refresh(); return; }
    e.target.disabled = true;
    try {
      saveNick(nickname);
      const name = normalizeRoomName(home.roomName);
      saveAvatar(draftAv);
      const code = await store.createRoom({ roles, nickname, name, avatar: draftAv, capacity: normalizeCapacity(home.capacity) });
      home.roomName = '';
      location.hash = `#/room/${code}`;
    } catch (err) {
      console.error(err);
      toast(`방을 만들지 못했어요: ${err.message}`);
      e.target.disabled = false;
    }
  });
  refresh();
}

/* ---------------- 방 ---------------- */
function roomShell(code) {
  $app.innerHTML = `
    <div class="back-row"><button type="button" class="link back-chev" id="back" aria-label="뒤로 가기">‹</button>${modeBadge()}</div>
    <section class="card room-top" id="room-card" aria-label="방 정보">
      <img class="rt-mata" src="/mata-s.png" alt="" width="64" height="64" />
      <div id="room-title" class="room-title"></div>
      <div class="rt-meta" id="s-status"></div>
      <div class="code-box"><span class="code" id="code-text">${esc(code)}</span>
        <span class="rt-btns"><button type="button" class="txt-link" id="copy-code">코드 복사</button><button type="button" class="txt-link" id="copy-link">링크 복사</button></span>
      </div>
    </section>
    <div id="s-join"></div>
    <div id="s-hub"></div>
    <div id="s-roles"></div>
    <div id="s-prefs"></div>
    <div id="s-members"></div>
    <div id="s-mine"></div>
    <div id="s-result"></div>
    <div id="s-duties"></div>`;
  $app.querySelector('#back').addEventListener('click', () => {
    const inStep = S && me() && (((S.view === 'card' || S.view === 'team') && assigned()) || ((S.view === 'roles' || S.view === 'prefs') && !assigned()));
    location.hash = S && S.view === 'card' && S.cardFrom === 'team' && me() && assigned() ? `#/room/${code}/team` : inStep ? `#/room/${code}` : '#/';
  });
  const link = `${location.origin}${location.pathname}#/room/${code}`;
  const copy = async (text, ok) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(ok);
    } catch {
      toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.');
    }
  };
  $app.querySelector('#copy-code').addEventListener('click', () => copy(code, '방 코드를 복사했어요.'));
  $app.querySelector('#copy-link').addEventListener('click', () => copy(link, '초대 링크를 복사했어요.'));
}

const me = () => S.members.find((m) => m.uid === store.uid);
const isCreator = () => S.room && S.room.creatorUid === store.uid;
/** 역할 카드(설명·할 일)는 그 역할을 맡은 사람만 고칠 수 있다 */
const canEditGuide = (roleId) => !!me() && (S.priv?.roleIds || []).includes(roleId);
const assigned = () => S.room?.status === 'assigned';

async function openRoom(code, view = 'hub') {
  cleanup();
  S = { code, view, room: null, members: [], result: null, priv: null, rolesDraft: null, rolesOpen: new Set(), rolesSig: '', prefsSig: '', form: null, cardRole: null, editGuide: false, confirmReopen: false, pIdx: null, editOne: false, sheet: false, traits: new Set(), touched: new Set(), prefsLoaded: false, busy: false, confirmAssign: false, confirmSlots: false, capEdit: false, draw: null, drawn: loadDrawn(), loaded: false };
  roomShell(code);
  const status = $app.querySelector('#s-status');
  status.innerHTML = '<span class="muted"><span class="spinner"></span>방을 불러오는 중…</span>';
  let room = null;
  try {
    room = await store.getRoom(code);
  } catch (e) {
    console.error(e);
  }
  if (!S || S.code !== code) return;
  if (!room) {
    status.innerHTML = '';
    $app.querySelector('#s-join').innerHTML = `<section class="card"><h2>방을 찾을 수 없어요</h2><p class="muted" style="margin-top:6px">코드를 다시 확인해 주세요. 연습 모드에서는 같은 브라우저에서 만든 방만 보여요.</p><button type="button" class="btn" style="margin-top:12px" id="to-home">처음으로</button></section>`;
    $app.querySelector('#to-home').addEventListener('click', () => (location.hash = '#/'));
    return;
  }
  S.room = room;
  S.loaded = true;
  showRoomName();
  unsubs.push(store.subscribeRoom(code, (r) => { if (!S) return; S.room = r || S.room; showRoomName(); renderAll(); }));
  unsubs.push(store.subscribeMembers(code, (m) => { if (!S) return; S.members = m; S.membersLoaded = true; renderAll(); }));
  unsubs.push(store.subscribeResult(code, (r) => { if (!S) return; S.result = r; renderAll(); }));
  unsubs.push(store.subscribePrivate(code, (p) => { if (!S) return; S.priv = p; renderAll(); }));
  attachDelegates();
  renderAll();
}

function showRoomName() {
  const el = $app.querySelector('#room-title');
  if (!el) return;
  const n = S?.room?.name;
  el.textContent = n || '';
  el.hidden = !n;
}

function renderAll() {
  if (!S || !S.loaded) return;
  if (!S.remembered && me()) { S.remembered = true; rememberRoom(S.code, S.room?.name); }
  renderStatus();
  renderJoin();
  renderHub();
  renderRoles();
  renderPrefs();
  renderMembers();
  renderMine();
  renderResult();
  renderDuties();
  applyView();
}

/** 지금 보는 단계에 맞는 구역만 보여 준다. (허브 · 역할 · 선호 · 결과) */
function applyView() {
  if (!S) return;
  const show = (id, on) => { const el = $app.querySelector(id); if (el) el.hidden = !on; };
  const joined = !!me();
  const done = assigned();
  const step = joined && !done && (S.view === 'roles' || S.view === 'prefs') ? S.view : null;
  const gated = joined && done && !!S.result && !!pendingDraw(S.result, myDuties(S.result)); // 내 결과를 열기 전에는 팀 결과를 가린다
  const onCard = joined && done && !gated && S.view === 'card';
  const onTeam = done && !gated && (!joined || S.view === 'team'); // 방에 아직 안 들어온 사람도 결과는 팀 화면으로 본다
  const onMine = joined && done && !onCard && !onTeam;
  show('#room-card', joined && !done && !step);
  show('#s-join', !joined);
  show('#s-hub', joined && !done && !step);
  show('#s-members', joined && !done && !step);
  show('#s-roles', step === 'roles');
  show('#s-prefs', step === 'prefs');
  show('#s-mine', onMine);
  show('#s-result', onTeam);
  show('#s-duties', onCard);
  const back = $app.querySelector('#back');
  if (back) back.classList.toggle('labeled', onCard || (onTeam && joined));
  if (back) back.textContent = onCard && S.cardFrom === 'team' ? '‹ 팀 결과로' : onCard || (onTeam && joined) ? '‹ 내 결과로' : '‹';
}

/** 역할 자리 수(필요 인원 합계)와 참여 인원을 비교한다. */
function slotInfo(roles, planned) {
  const people = planned && S.room?.capacity ? S.room.capacity : S.members.length;
  const slots = roles.reduce((s, r) => s + Math.min(r.need || 1, Math.max(people, 1)), 0);
  return { people, slots };
}

/** 안 맞을 때의 안내 문구. 맞으면 null */
function slotMsg(roles, planned) {
  const { people, slots } = slotInfo(roles, planned);
  if (!people || !slots || slots === people) return null;
  if (slots > people) return { title: `역할 자리가 팀원보다 ${slots - people}개 많아요`, body: '한 사람이 역할을 2개 이상 맡을 수 있어요. 비슷한 역할을 합치거나 필요 인원을 줄이면 한 명이 하나씩 맡아요.' };
  return { title: `팀원이 역할 자리보다 ${people - slots}명 많아요`, body: `${people - slots}명은 역할 없이 남을 수 있어요. 필요 인원을 늘리거나 역할을 추가하면 모두가 맡아요.` };
}

/** 방장에게만: 역할 자리 수와 참여 인원을 비교해 안내한다. */
function slotGuide(roles) {
  if (!isCreator()) return '';
  const { people, slots } = slotInfo(roles, true);
  const m = slotMsg(roles, true);
  if (!m) return '';
  return `<div class="slot-box"><div class="row between"><b>${m.title}</b><span class="tg">방장에게만</span></div><div class="slot-chips"><span>역할 자리 ${esc(slots)}</span><span>팀원 ${esc(people)}</span></div></div>`;
}

/** 허브: 내가 지금 할 일을 단계별로 보여 준다. */
function renderHub() {
  const el = $app.querySelector('#s-hub');
  if (!me() || assigned()) { el.innerHTML = ''; return; }
  const roles = S.room.roles || [];
  const submitted = !!me().submitted;
  el.innerHTML = `
    <h2 class="sec-h">내가 할 일</h2>
    <button type="button" class="task hub-task" data-go="roles">
      <span class="tile" style="background:#FFD3CB">${roleIcon({ kind: 'lead' }, 28)}</span>
      <span class="task-body"><b>이번에 정할 역할</b><span class="muted small">${esc(roles.map((r) => r.name).join(' · '))}</span></span>
      <span class="tg">${isCreator() ? '설정' : '확인'}</span>
    </button>
    <button type="button" class="task hub-task ${submitted ? 'done' : ''}" data-go="prefs">
      <span class="tile" style="background:#fff"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#4452C8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.600-7 10-7 10z"/></svg></span>
      <span class="task-body"><b>내 선호 입력</b><span class="muted small">${submitted ? '저장했어요' : '하고 싶은 역할과 피하고 싶은 역할을 골라요'}</span></span>
      <span class="tg ${submitted ? 'ok' : ''}">${submitted ? '완료 ✓' : '입력'}</span>
    </button>
    ${slotGuide(roles)}`;
}

function renderStatus() {
  const el = $app.querySelector('#s-status');
  const done = assigned();
  const n = S.members.length; const sub = S.members.filter((m) => m.submitted).length;
  const cap = S.room?.capacity;
  const joinedTxt = cap && !done ? `${n}/${cap}명 입장` : `${n}명 참여`;
  el.textContent = done ? `${n}명 참여 · 배정 완료` : `${joinedTxt} · 선호 ${sub}/${n}`;
}

function renderJoin() {
  const el = $app.querySelector('#s-join');
  if (!S.membersLoaded) return;
  if (me()) {
    if (el.innerHTML) el.innerHTML = '';
    return;
  }
  const cap = S.room?.capacity;
  if (cap && S.members.length >= cap && !assigned()) {
    el.innerHTML = `
    <div class="jn-room"><span>${esc(S.room?.name || '')}</span><b>${esc(S.code)}</b></div>
    <div class="jn-head"><div><h1 class="jn-title">정원이<br>다 찼어요</h1><p class="muted">이 방은 ${esc(cap)}명이 모두 들어왔어요.<br>팀원 수가 바뀌었다면 방장에게 수정을 부탁해 주세요.</p></div><img class="jn-taba" src="/taba.png" alt="" width="110" height="110" /></div>
    <button type="button" class="btn big line" id="join-home">처음으로</button>`;
    return;
  }
  if (el.querySelector('#join-nick')) return; // 입력 중이면 다시 그리지 않음
  const jroles = S.room?.roles || [];
  el.innerHTML = `
    <div class="jn-room"><span>${esc(S.room?.name || '')}</span><b>${esc(S.code)}</b></div>
    <div class="jn-head"><div><h1 class="jn-title">닉네임을<br>정해요</h1><p class="muted">선호는 팀원에게 공개되지 않아요</p></div><img class="jn-taba" src="/taba.png" alt="" width="110" height="110" /></div>
    <div class="nick-row"><button type="button" class="av-btn" data-av-toggle="draft" aria-label="프로필 캐릭터 고르기">${avatarHtml(draftAv)}<i class="av-edit" aria-hidden="true">✎</i></button><input id="join-nick" type="text" maxlength="12" placeholder="예: 지은" value="${esc(savedNick())}" aria-label="닉네임" autocomplete="off" /></div>
    <div class="avp-wrap" id="avp-draft" hidden>${avatarPickerHtml(draftAv, 'draft')}</div>
    ${assigned() ? '<p class="notice">이미 배정이 끝난 방이에요. 지금 들어가도 이번 배정에는 포함되지 않아요.</p>' : ''}
    <button type="button" class="btn big" id="do-join">들어가기</button>
    <div class="jn-roles"><p class="muted">이번에 정할 역할</p><div class="chips">${jroles.map((r) => `<span class="chip">${roleIcon(r, 15)}${esc(r.name)} ${esc(r.need)}명 · 일의 양 ${esc(LOAD_LABEL[r.load] || '중')}</span>`).join('')}</div></div>`;
}

function renderRoles() {
  const el = $app.querySelector('#s-roles');
  const roles = S.room.roles || [];
  const editable = isCreator() && !assigned();
  const sig = JSON.stringify([roles, editable]);
  if (sig === S.rolesSig) return;
  S.rolesSig = sig;
  if (editable) {
    S.rolesDraft = roles.map((r) => ({ ...r }));
    drawRolesEditor(el);
  } else {
    el.innerHTML = `
      <section class="card">
        <h2>이번에 정할 역할</h2>
        <div class="stack" style="margin-top:10px">
          ${roles.map((r) => `<div><b>${esc(r.name)}</b> <span class="tag">${esc(r.need)}명</span><span class="tag">일의 양 ${esc(LOAD_LABEL[r.load] || '중')}</span>${r.desc ? `<p class="role-desc">${esc(r.desc)}</p>` : ''}</div>`).join('')}
        </div>
        ${isCreator() ? '' : '<p class="muted small" style="margin-top:10px">역할은 방장이 정해요.</p>'}
      </section>`;
  }
}

function drawRolesEditor(el) {
  const d = S.rolesDraft;
  el.innerHTML = `
    <div class="page-head"><h1 class="page-title">이번에 정할 역할</h1><img class="ph-mata" src="/mata.png" alt="" width="78" height="82" /></div>
    <section class="card stack roles-card">
      ${d
        .map(
          (r, i) => `
        <div class="role-block" data-i="${i}">
          <div class="role-edit">
            <button type="button" class="tile r-icon" data-open="1" aria-label="아이콘 바꾸기" style="background:${tileBgOf(r)}">${roleIcon(r, 28)}</button>
            <input type="text" class="r-name" maxlength="20" value="${esc(r.name)}" aria-label="역할 이름" />
            <select class="r-need" aria-label="필요 인원">${[1, 2, 3].map((n) => `<option value="${n}" ${r.need === n ? 'selected' : ''}>${n}명</option>`).join('')}</select>
            <button type="button" class="x r-del" aria-label="${esc(r.name || '이 역할')} 삭제">✕</button>
          </div>
          <div class="role-load"><label>일의 양 <span class="muted small">(대략적인 무게)</span></label><select class="r-load" aria-label="일의 양">${[1, 2, 3].map((n) => `<option value="${n}" ${(r.load || 2) === n ? 'selected' : ''}>${LOAD_LABEL[n]}</option>`).join('')}</select></div>
          <details class="role-more" data-rid="${esc(r.id)}" ${S.rolesOpen.has(r.id) ? 'open' : ''}>
            <summary>더보기 (설명 · 할 일) ${moreBadge(r)}</summary>
            <div class="stack role-more-body">
              <div>
                <label>아이콘 바꾸기</label>
                <div class="kind-panel"><div class="kind-grid" role="radiogroup" aria-label="역할 아이콘">${ICON_IDS.map((id, ki) => { const cur = r.icon || KIND_TO_ICON[r.kind || kindFromName(r.name) || 'other']; return `<button type="button" class="kind-opt ${cur === id ? 'on' : ''}" role="radio" aria-checked="${cur === id}" aria-label="아이콘 ${ki + 1}" data-k="${id}" style="background:${TILE_BG[ki % 4]}">${roleIcon({ icon: id }, 24)}</button>`; }).join('')}</div></div>
              </div>
              <div><label>한 줄 설명 <span class="tag opt">선택</span></label><input type="text" class="r-desc" maxlength="${DESC_MAX}" value="${esc(r.desc || '')}" placeholder="${esc(exampleDesc(r.kind || kindFromName(r.name) || '') ? `예: ${exampleDesc(r.kind || kindFromName(r.name) || '')}` : '한 줄로 이 역할을 설명해 주세요')}" /></div>
              <div><label>해야 할 일 <span class="tag opt">선택</span></label>
                ${taskEditorHtml(taskItemsOf(r), r.kind || kindFromName(r.name) || '')}
              </div>
            </div>
          </details>
        </div>`,
        )
        .join('')}
      <button type="button" class="btn big line" id="r-add" ${d.length >= 12 ? 'disabled' : ''}>+ 역할 추가</button>
    </section>
    <button type="button" class="btn big" id="r-save" style="margin-top:16px">역할 저장</button>
    <p class="muted small center save-note"><span>저장하면 팀원 화면에도 바로 반영돼요.</span><span>이미 선호를 낸 팀원은 새 역할을 "상관없어요"로 처리해요.</span></p>`;
}

/** 편집 칸에 보일 글: 직접 쓰고 있던 글이 있으면 그대로, 없으면 저장된 값 */
function roleFilled(r) {
  return !!((r.desc || '').trim() || taskItemsOf(r).some((t) => t.trim()));
}
function moreBadge(r) {
  return roleFilled(r) ? '<span class="tag ok">작성됨</span>' : '<span class="tag">비어 있음</span>';
}
function syncMoreBadge(blk, r) {
  const sm = blk.querySelector('.role-more > summary');
  const old = sm?.querySelector('.tag');
  if (old) old.outerHTML = moreBadge(r);
}
function taskItemsOf(r) {
  return r.taskItems ?? normalizeTasks(r);
}
/** 편집 중인 초안을 저장 가능한 역할 목록으로 바꾼다. */
function draftToRoles(draft) {
  return normalizeRoles(draft.map((r) => ({ ...r, tasks: taskItemsOf(r).map((t) => t.trim()).filter(Boolean) })));
}

function blankForm() {
  const prefs = {};
  for (const r of S.room.roles) prefs[r.id] = 'ok';
  return { prefs, strength: '', wish: '', share: false, randomConsent: false };
}

const PREF_LABEL = { want: '하고 싶어요', ok: '상관없어요', avoid: '피하고 싶어요' };

function traitHint(rid, sug) {
  const t = S.touched.has(rid);
  const s = sug.suggestions[rid];
  if (s && t && S.form?.prefs?.[rid] !== s.value) return '';
  if (t && !s) return '';
  if (s) return `성향 기준 제안: ${PREF_LABEL[s.value]}`;
  if (sug.conflicts.includes(rid)) return '성향이 엇갈려 제안 없음';
  return '';
}

/** 고른 성향 칩에 맞춰, 본인이 직접 건드리지 않은 역할만 제안 값으로 바꾼다. 입력 중인 글은 건드리지 않는다. */
function applyTraits() {
  if (!S.form) return;
  const sug = suggestPrefs([...S.traits], S.room.roles);
  for (const r of S.room.roles) {
    if (!S.touched.has(r.id)) S.form.prefs[r.id] = sug.suggestions[r.id]?.value || 'ok';
  }
  renderPrefs();
}

async function renderPrefs() {
  const el = $app.querySelector('#s-prefs');
  if (!me()) { el.innerHTML = ''; S.prefsSig = ''; return; }
  if (assigned()) {
    el.innerHTML = `<section class="card"><h2>내 선호</h2><p class="muted" style="margin-top:6px">배정이 끝나서 더 이상 바꿀 수 없어요.${isCreator() ? ' 방장이 "선호 수정하기"를 누르면 다시 열려요.' : ''}</p></section>`;
    S.prefsSig = 'assigned';
    return;
  }
  if (!S.prefsLoaded) {
    S.prefsLoaded = true;
    try {
      const saved = await store.getMyPrefs(S.code);
      S.form = blankForm();
      if (saved) {
        S.form.prefs = { ...S.form.prefs, ...saved.prefs };
        S.form.randomConsent = saved.randomConsent === true;
        S.form.saved = true;
        S.touched = new Set(Object.keys(saved.prefs || {})); // 저장된 선택은 본인이 확정한 것
      }
    } catch (e) {
      console.error(e);
      S.form = blankForm();
    }
    if (!S) return;
  }
  if (!S.form) return;
  const roles = S.room.roles;
  for (const r of roles) if (!(r.id in S.form.prefs)) S.form.prefs[r.id] = 'ok';
  const sig = JSON.stringify([roles, S.form.saved === true, S.pIdx, S.editOne, S.sheet, [...S.traits], S.form.prefs, S.form.randomConsent]);
  if (sig === S.prefsSig) return;
  S.prefsSig = sig;
  S.traits = new Set([...S.traits].filter((id) => relevantTraits(roles).some((t) => t.id === id))); // 없어진 역할의 칩은 해제
  if (S.pIdx == null) S.pIdx = S.form.saved ? roles.length : 0;
  S.pIdx = Math.min(Math.max(S.pIdx, 0), roles.length);
  el.innerHTML = S.pIdx >= roles.length ? prefsSummaryHtml(roles) : prefsCardHtml(roles);
}

const PREF_OPT = [
  ['want', '하고 싶어요', '♥', 'want'],
  ['ok', '상관없어요', '–', 'ok'],
  ['avoid', '피하고 싶어요', '✕', 'avoid'],
];
const TILE_BG = ['#DDE1FF', '#D6F5EA', '#FFEBB0', '#FFD3CB'];
const KIND_ICON = {
  lead: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M12 16v4M8 20h8M7 11l3-3 3 2 3-3"/>',
  research: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  design: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  schedule: '<rect x="4" y="5" width="16" height="15" rx="2.500"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  other: '<path d="M12 4l2.400 5 5.400.7-4 3.800 1 5.400L12 16.300 7.200 19l1-5.400-4-3.800 5.400-.7z"/>',
};
const ICON_PATH = {
  flag: KIND_ICON.lead, monitor: KIND_ICON.present, search: KIND_ICON.research, pencil: KIND_ICON.design, doc: KIND_ICON.doc, calendar: KIND_ICON.schedule, star: KIND_ICON.other,
  camera: '<path d="M4 8h3l1.500-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.500"/>',
  chat: '<path d="M5 5h14v10h-8l-4 4v-4H5z"/><path d="M9 9h6M9 12h4"/>',
  book: '<path d="M6 4h12v16H8a2 2 0 01-2-2z"/><path d="M6 17h12"/>',
  code: '<path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/>',
  megaphone: '<path d="M4 10v4h3l7 4V6l-7 4z"/><path d="M17 9a4 4 0 010 6"/>',
};
const KIND_TO_ICON = { lead: 'flag', present: 'monitor', research: 'search', design: 'pencil', doc: 'doc', schedule: 'calendar', other: 'star' };
const roleIcon = (r, size, color = '#4452C8') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATH[r.icon] || KIND_ICON[kindOfRole(r)] || KIND_ICON.other}</svg>`;
/** 역할 아이콘 칸 색: 아이콘마다 정해진 색을 쓴다 (고르는 칸의 색과 같게) */
const tileBgOf = (r) => {
  const id = r?.icon && ICON_PATH[r.icon] ? r.icon : KIND_TO_ICON[kindOfRole(r || {})] || 'star';
  const k = ICON_IDS.indexOf(id);
  return TILE_BG[(k >= 0 ? k : 0) % 4];
};
const PHASE_BG = ['#E4E8FF', '#DDF5EC', '#FFF1C9'];

function prefsCardHtml(roles) {
  const i = S.pIdx;
  const r = roles[i];
  const f = S.form;
  const total = roles.length + 1;
  const sug = suggestPrefs([...S.traits], roles);
  const kind = kindOfRole(r);
  // 성향 칩은 역할마다 최대 2개: 하고 싶은 쪽 1개 + 부담되는 쪽 1개
  const all = relevantTraits([r]).filter((t) => kind && t.effects[kind]);
  const wantChip = all.find((t) => t.effects[kind] === 'want');
  const avoidChip = all.find((t) => t.id === 'nervous') || all.find((t) => t.effects[kind] === 'avoid');
  const chips = [wantChip, avoidChip].filter(Boolean);
  const hint = traitHint(r.id, sug);
  const last = i === roles.length - 1;
  return `
    <section class="pf">
      <div class="pf-head"><span>${i + 1}/${total}</span></div>
      <div class="pf-stack">
        <div class="pf-back b2"></div><div class="pf-back b1"></div>
        <img class="pf-taba" src="/taba-s.png" alt="" width="80" height="80" /><div class="pf-card">
          <div class="tile l" style="background:${tileBgOf(r)}">${roleIcon(r, 46)}</div>
          <h2 class="pf-name">${esc(r.name)}</h2>
          ${r.desc ? `<p class="pf-desc">${esc(r.desc)}</p>` : ''}
          <p class="pf-load">일의 양 <b>${esc(LOAD_LABEL[r.load] || '중')}</b></p>
          <button type="button" class="pf-duty" data-act="sheet">▸ 할 일 보기</button>
          ${chips.length ? `<div class="chips pf-chips">${chips.map((t) => `<button type="button" class="chip trait" data-trait="${esc(t.id)}" aria-pressed="${S.traits.has(t.id)}">${esc(t.label)}</button>`).join('')}</div>` : ''}
          ${hint ? `<p class="pf-hint">${esc(hint)}</p>` : !chips.length ? '<p class="pf-hint plain">제안이 없어요. 직접 골라 주세요</p>' : ''}
          ${KIND_MBTI[kind] ? `<div class="pf-mbti"><span class="pm-label">어울리는 MBTI</span><div class="pm-row">${KIND_MBTI[kind].map((m) => `<b>${m}</b>`).join('')}</div><small>내 선택이 우선이에요, 참고만 해요</small></div>` : ''}
        </div>
      </div>
      <div class="pf-opts" role="radiogroup" aria-label="${esc(r.name)} 선호">
        ${PREF_OPT.map(([v, label, ic, cls]) => `<button type="button" role="radio" aria-checked="${f.prefs[r.id] === v}" class="pf-opt ${cls}${f.prefs[r.id] === v ? ' on' : ''}" data-pref="${v}" data-rid="${esc(r.id)}"><span class="ic">${ic}</span>${label}</button>`).join('')}
      </div>
      <ul class="pf-notes">
        <li><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4452C8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.500 10.900c.7.600 1 1.300 1 2.100h5c0-.8.3-1.500 1-2.100A6 6 0 0012 3z"/></svg>위 문구는 제안일 뿐, 직접 고르면 바뀌어요</li>
        <li><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4452C8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>내 선택은 팀원에게 보이지 않아요</li>
        <li><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#4452C8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>넘어가면 “상관없어요”로 처리돼요</li>
      </ul>
      ${S.editOne
        ? '<div class="pf-nav"><button type="button" class="btn big" data-act="sum">수정 완료</button></div>'
        : `${f.saved ? '<button type="button" class="pf-skip" data-act="sum">한눈에 보기로 돌아가기</button>' : ''}
      <div class="pf-nav">
        ${i > 0 ? '<button type="button" class="btn big line" data-act="prev">◂ 이전</button>' : ''}
        <button type="button" class="btn big" data-act="next" style="flex:2">${last ? '선택 확인하기 ▸' : '다음 역할 ▸'}</button>
      </div>`}
    </section>
    ${S.sheet ? dutySheetHtml(r, i) : ''}`;
}

function dutySheetHtml(r, i) {
  const tasks = normalizeTasks(r);
  return `
    <div class="sheet-bg" data-act="close"></div>
    <div class="sheet" role="dialog" aria-label="${esc(r.name)} 할 일">
      <div class="grab"></div>
      <div class="sheet-head"><div class="tile" style="background:${tileBgOf(r)};width:40px;height:40px;border-radius:14px">${roleIcon(r, 24)}</div><h2>할 일</h2><button type="button" class="sheet-x" data-act="close" aria-label="닫기">✕</button></div>
      <p class="muted">팀에서 적어 둔 내용이에요</p>
      ${tasks.length ? `<div class="sheet-ph" style="background:${PHASE_BG[0]}">${tasks.map((t) => `<div class="li"><span>•</span><span>${esc(t)}</span></div>`).join('')}</div>` : '<div class="sheet-ph" style="background:#E4E8FF">아직 적지 않았어요</div>'}
      <button type="button" class="btn big" data-act="close">확인했어요</button>
    </div>`;
}

function prefsSummaryHtml(roles) {
  const f = S.form;
  const total = roles.length + 1;
  return `
    <section class="pf">
      <div class="pf-head"><span>${total}/${total}</span></div>
      <div class="pf-sum-head"><h2 class="pf-sum-title">내 선택을<br>확인해요</h2><img class="pf-sum-taba" src="/taba.png" alt="" width="96" height="96" /></div>
      <div class="pf-rows">
        ${roles
          .map((r, i) => {
            const v = f.prefs[r.id] || 'ok';
            const o = PREF_OPT.find((x) => x[0] === v);
            return `<button type="button" class="pf-row" data-act="edit" data-i="${i}"><span class="tile" style="background:${tileBgOf(r)};width:40px;height:40px;border-radius:14px">${roleIcon(r, 24)}</span><span class="nm">${esc(r.name)}</span><span class="pill ${o[3]}">${o[1]}</span><span class="ed">수정 ▸</span></button>`;
          })
          .join('')}
      </div>
      <div class="check">
        <input type="checkbox" id="random" ${f.randomConsent ? 'checked' : ''} />
        <label for="random">(필수) 피하고 싶은 역할을 피할 수 없거나 조건이 같을 때, 무작위로 정해지는 것에 동의해요.</label>
      </div>
      <button type="button" class="btn big" id="save-prefs">${f.saved ? '선호 다시 저장하기' : '선호 저장하기'}</button>
      <p class="muted small" id="save-note">${f.saved ? '저장되어 있어요. 배정 전까지 언제든 바꿀 수 있어요.' : ''}</p>
    </section>`;
}

function renderMembers() {
  const el = $app.querySelector('#s-members');
  const prevDone = S.seenDone;
  S.seenDone = new Set(S.members.filter((m) => m.submitted).map((m) => m.uid));
  const total = S.members.length;
  const submitted = S.members.filter((m) => m.submitted).length;
  const missing = total - submitted;
  const cap = S.room?.capacity || 0;
  const waiting = cap ? Math.max(0, cap - total) : 0; // 아직 들어오지 않은 팀원
  const creator = isCreator();
  let action = '';
  const sm = creator ? slotMsg(S.room?.roles || []) : null;
  if (creator && !assigned()) {
    if (S.confirmSlots && sm && !S.busy) {
      action = `<div class="stack">
          <p class="notice">${sm.body}</p>
          <button type="button" class="btn big" id="slot-go">그대로 배정하기</button>
          <button type="button" class="btn big line" id="slot-edit">역할 수정하기</button>
        </div>`;
    } else if (S.busy) {
      action = '<button type="button" class="btn big" id="do-assign" disabled><span class="spinner"></span>배정하는 중…</button>';
    } else if (missing === 0 && waiting === 0) {
      action = '<button type="button" class="btn big" id="do-assign" ' + (submitted === 0 ? 'disabled' : '') + '>배정하기</button>';
    } else if (S.confirmAssign) {
      const notes = [
        waiting > 0 ? `아직 ${esc(waiting)}명이 들어오지 않았어요. 지금 들어온 ${esc(total)}명으로 배정하면, 나중에 들어오는 사람은 이번 배정에 포함되지 않아요.` : '',
        missing > 0 ? `미제출 ${esc(missing)}명은 선호가 없는 상태로 처리돼요(모든 역할을 "상관없어요"로 봐요). 그 팀원이 원하지 않는 역할에 배정될 수 있어요.` : '',
      ].filter(Boolean).join(' ');
      action = `<div class="stack">
          <p class="notice">${notes}</p>
          <button type="button" class="btn" id="do-assign">${waiting > 0 ? `지금 ${esc(total)}명으로 배정하기` : `미제출 ${esc(missing)}명 포함해서 배정하기`}</button>
          <button type="button" class="btn line" id="cancel-assign">${waiting > 0 ? '팀원을 기다리기' : '선호 제출을 기다리기'}</button>
        </div>`;
    } else {
      action = `<div class="stack">
          <button type="button" class="btn big" id="do-assign" disabled>${waiting > 0 ? `팀원이 다 들어오면 배정할 수 있어요 (${esc(total)}/${esc(cap)}명)` : `모두 입력하면 배정할 수 있어요 (${esc(submitted)}/${esc(total)})`}</button>
          ${submitted > 0 ? '<button type="button" class="link" id="force-assign" style="align-self:center">그래도 배정하기</button>' : '<p class="muted small center">한 명 이상 선호를 저장하면 배정할 수 있어요.</p>'}
        </div>`;
    }
  }
  const capRow = creator && !assigned()
    ? S.capEdit
      ? `<div class="cap-edit"><select id="cap-sel" class="cap-select" aria-label="팀원 수">${Array.from({ length: CAPACITY_MAX - Math.max(total, CAPACITY_MIN) + 1 }, (_, i) => Math.max(total, CAPACITY_MIN) + i).map((n) => `<option value="${n}" ${n === (cap || total) ? 'selected' : ''}>${n}명</option>`).join('')}</select><button type="button" class="btn" id="cap-save">저장</button><button type="button" class="txt-link sm" id="cap-cancel">취소</button></div><p class="muted small center">이미 들어온 ${esc(total)}명보다 적게는 줄일 수 없어요.</p>`
      : `<div class="txt-row"><button type="button" class="txt-link sm" id="cap-edit">${cap ? `팀원 수 ${esc(cap)}명 · 수정` : '팀원 수 정하기'}</button></div>`
    : '';
  el.innerHTML = `
    <div class="members-sec">
      <div class="row between"><h2 class="sec-h">참여 현황</h2><span class="tg">${esc(submitted)}/${esc(cap || total)}명 입력 완료</span></div>
      <div class="avs">
        ${S.members.map((m) => { const mine = m.uid === store.uid; const ck = m.submitted ? `<i class="av-ok${prevDone && !prevDone.has(m.uid) ? ' pop-in' : ''}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#1F6B49" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></i>` : ''; return `<span class="av-item ${m.submitted ? 'done' : ''}">${mine ? `<button type="button" class="av-c av-me" data-av-toggle="me" aria-label="내 캐릭터 바꾸기">${avatarHtml(avatarOf(m))}<i class="av-edit" aria-hidden="true">✎</i>${ck}</button>` : `<span class="av-c">${avatarHtml(avatarOf(m))}${ck}</span>`}<small>${esc(m.nickname)}${mine ? ' (나)' : ''}</small></span>`; }).join('')}${Array.from({ length: waiting }, () => '<span class="av-item wait"><span class="av-c" aria-hidden="true"></span><small>대기</small></span>').join('')}
      </div>
      ${capRow}
      ${S.avOpen ? `<div class="avp-wrap">${avatarPickerHtml(avatarOf(me()), 'me')}<p class="muted small">언제든 바꿀 수 있어요. 팀원에게 보이는 프로필이에요.</p></div>` : ''}
      ${action}
      ${!creator && !assigned() ? '<p class="muted small center">방장이 배정 버튼을 누르면 결과가 나와요.</p>' : ''}
    </div>`;
}

/** 내가 맡은 역할의 설명·할 일. 예전 결과에 내용이 없으면 방의 역할 정보로 채운다. */
/** 역할의 설명·할 일: 방장이 배정 뒤에 고친 값(guides) > 배정 때 값 > 방의 기본값 */
function guideOf(role) {
  const base = (S.room?.roles || []).find((x) => x.id === role.id) || {};
  const g = S.room?.guides?.[role.id];
  return {
    desc: g ? g.desc ?? '' : role.desc ?? base.desc ?? '',
    tasks: normalizeTasks(g || (role.tasks || role.steps ? role : base)),
  };
}

function myDuties(r) {
  const mine = new Set(S.priv?.roleIds || []);
  return (r.roles || [])
    .filter((role) => mine.has(role.id))
    .map((role) => ({ id: role.id, name: role.name, ...guideOf(role) }));
}

/** 같은 역할을 여러 명이 맡을 때: 할 일마다 담당 태그(누구/같이/비움). 방 문서의 owners[역할] = [{t: 할 일, u: uid|'all'}] */
const OWN_COLORS = ['#BFE6F5', '#DCEFA9', '#FFC9DE', '#E2CCF7', '#FFE08A', '#FFD3CB'];
/** 할 일 하나의 담당: 맡은 사람 중 고른 사람들(uid 배열). 비어 있으면 담당 없음, 모두 고르면 "같이". 예전 값 'all'은 모두로 본다 */
const ownersOfTask = (role, t) => {
  const o = (S.room?.owners?.[role.id] || []).find((x) => x.t === t);
  const ids = (role.members || []).map((m) => m.uid);
  if (!o) return [];
  if (o.u === 'all') return ids;
  return ids.filter((id) => (Array.isArray(o.u) ? o.u : [o.u]).includes(id)); // 재배정으로 빠진 사람은 뺀다
};
const colorOfMember = (role, uid) => OWN_COLORS[Math.max(0, (role.members || []).findIndex((m) => m.uid === uid)) % OWN_COLORS.length];
const mineTask = (role, t) => { const o = ownersOfTask(role, t); return !o.length || o.includes(store.uid); };
const ownerLabel = (role, t) => {
  const o = ownersOfTask(role, t);
  if (!o.length) return '';
  if (o.length === (role.members || []).length) return '같이';
  return o.map((u) => (role.members || []).find((m) => m.uid === u)?.nickname || '').join('·');
};

function dutyBodyHtml(role) {
  const d = guideOf(role);
  const isMine = (S.priv?.roleIds || []).includes(role.id);
  const multi = (role.members || []).length >= 2;
  const canTag = multi && !!me();
  const filter = multi && isMine && S.shareFilter === 'mine' ? 'mine' : 'all';
  const tagHtml = (t, i) => {
    const o = ownersOfTask(role, t);
    const label = ownerLabel(role, t);
    const cls = !o.length ? 'none' : o.length === (role.members || []).length ? 'all' : 'who';
    const style = cls === 'who' && o.length === 1 ? ` style="background:${colorOfMember(role, o[0])}"` : '';
    const text = label ? esc(label) : '+ 담당';
    return canTag
      ? `<button type="button" class="own-tag ${cls}"${style} data-rid="${esc(role.id)}" data-ti="${i}" aria-label="담당 정하기: ${esc(t)}">${text}</button>`
      : `<span class="own-tag ${cls}"${style}>${text}</span>`;
  };
  const pickerHtml = (t, i) => {
    if (S.tagOpen !== `${role.id}|${i}`) return '';
    const cur = ownersOfTask(role, t);
    return `<div class="own-picker">${(role.members || []).map((m) => `<button type="button" class="own-opt${cur.includes(m.uid) ? ' on' : ''}" data-rid="${esc(role.id)}" data-ti="${i}" data-u="${esc(m.uid)}" aria-pressed="${cur.includes(m.uid)}" style="background:${colorOfMember(role, m.uid)}">${cur.includes(m.uid) ? '✓ ' : ''}${esc(m.nickname)}</button>`).join('')}<p class="muted small own-hint">여러 명을 고르면 같이 하는 일이에요. 모두 풀면 담당이 없어져요.</p></div>`;
  };
  const rows = d.tasks.map((t, i) => ({ t, i })).filter(({ t }) => filter === 'all' || mineTask(role, t));
  const shown = (isMine
    ? `<ul class="plain chk-list">${rows.map(({ t, i }) => `<li class="${isChecked(role.id, t) ? 'done' : ''}"><div class="chk-row"><label class="chk"><input type="checkbox" data-rid="${esc(role.id)}" data-t="${esc(t)}" ${isChecked(role.id, t) ? 'checked' : ''} /><span>${esc(t)}</span></label>${multi ? tagHtml(t, i) : ''}</div>${multi ? pickerHtml(t, i) : ''}</li>`).join('')}</ul>`
    : `<ul class="plain">${rows.map(({ t, i }) => `<li><div class="chk-row"><span class="chk-plain">${esc(t)}</span>${multi ? tagHtml(t, i) : ''}</div>${multi ? pickerHtml(t, i) : ''}</li>`).join('')}</ul>`);
  const countTasks = multi && isMine ? d.tasks.filter((t) => mineTask(role, t)) : d.tasks;
  const doneN = countTasks.filter((t) => isChecked(role.id, t)).length;
  const progLabel = multi && isMine ? `내 몫 ${countTasks.length}개 중 ${doneN}개 완료` : `${doneN}/${countTasks.length} 완료`;
  return `
    <article class="duty" style="--rc:${tileBgOf(role)}">
      <header class="duty-head">
        <span class="tile l" style="background:${tileBgOf(role)}">${roleIcon(role, 48)}</span>
        <h3>${esc(role.name)}</h3>
        ${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
      </header>
      ${
        d.tasks.length
          ? `<div class="phase"><div class="row between"><h4>할 일</h4>${isMine ? `<span class="muted small" id="chk-prog">${progLabel}</span>` : ''}</div>
            ${multi && isMine ? `<div class="own-seg" role="tablist"><button type="button" role="tab" class="${filter === 'all' ? 'on' : ''}" data-f="all">전체</button><button type="button" role="tab" class="${filter === 'mine' ? 'on' : ''}" data-f="mine">내 몫</button></div>` : ''}
            ${shown}
            ${multi ? `<p class="muted small">${canTag ? '태그를 누르면 담당을 정할 수 있어요. ' : ''}담당은 같은 역할의 팀원 모두에게 보여요.</p>` : ''}
            ${isMine ? '<p class="muted small">체크는 이 브라우저에만 저장돼요. 다른 팀원에게는 보이지 않아요.</p>' : ''}</div>`
          : '<p class="duty-empty">아직 이 역할의 할 일을 적지 않았어요.' + (canEditGuide(d.id) ? ' 아래 "수정하기"로 적어 주세요.' : ' 이 역할을 맡은 팀원이 적으면 여기에 보여요.') + '</p>'
      }
    </article>`;
}

function guideFormHtml(role) {
  const d = guideOf(role);
  return `
    <section class="card stack gd-form">
      <h2>${esc(role.name)} 수정하기</h2>
      <p class="muted small">고치면 모든 팀원의 역할 카드에 바로 바뀌어 보여요. 배정 결과는 바뀌지 않아요.</p>
      <div><label for="gd-desc">한 줄 설명</label><input id="gd-desc" type="text" maxlength="${DESC_MAX}" value="${esc(S.guideDesc ?? d.desc)}" placeholder="${esc(exampleDesc(kindOfRole(role) || '') ? `예: ${exampleDesc(kindOfRole(role) || '')}` : '한 줄로 이 역할을 설명해 주세요')}" /></div>
      <div><label>할 일</label>${taskEditorHtml(S.guideItems ?? d.tasks, kindOfRole(role) || '')}</div>
      <div class="row"><button type="button" class="btn" id="gd-save">저장하기</button><button type="button" class="btn line" id="gd-cancel">취소</button></div>
    </section>`;
}

/** 지금 카드 화면에서 선택된 역할 */
function currentCardRole() {
  const roles = S.result?.roles || [];
  const mine = new Set(S.priv?.roleIds || []);
  return roles.find((r) => r.id === S.cardRole) || roles.find((r) => mine.has(r.id)) || roles[0];
}

/** 내 역할 카드 화면: 다른 역할 카드도 위쪽 칩으로 볼 수 있다 */
function renderDuties() {
  const el = $app.querySelector('#s-duties');
  if (!assigned() || !S.result || S.view !== 'card') { el.innerHTML = ''; return; }
  if (S.editGuide && el.querySelector('#gd-desc') && !S.forceDuties) return; // 입력 중인 글이 지워지지 않게
  S.forceDuties = false;
  const roles = S.result.roles || [];
  const mine = new Set(S.priv?.roleIds || []);
  const sel = roles.find((r) => r.id === S.cardRole) || roles.find((r) => mine.has(r.id)) || roles[0];
  if (!sel) { el.innerHTML = '<section class="card"><p class="muted">역할이 없어요.</p></section>'; return; }
  const names = (sel.members || []).map((m) => esc(m.nickname)).join(', ');
  el.innerHTML = `
    <section class="duties">
      <h2 id="h-duties">${mine.has(sel.id) ? '내 역할 카드' : '역할 카드'}</h2>
      <div class="rc-chips" role="tablist">${roles.map((r) => `<button type="button" role="tab" aria-selected="${r.id === sel.id}" class="rc-chip${r.id === sel.id ? ' on' : ''}" data-role="${esc(r.id)}">${esc(r.name)}${mine.has(r.id) ? ' <small>내 역할</small>' : ''}</button>`).join('')}</div>
      <p class="muted small rc-who">맡은 사람: ${names || '아직 없어요'}</p>
      ${S.editGuide && canEditGuide(sel.id) ? guideFormHtml(sel) : dutyBodyHtml(sel)}
      ${canEditGuide(sel.id) && !S.editGuide ? '<button type="button" class="btn big line" id="gd-edit" style="margin-top:12px">이 역할 설명·할 일 수정하기</button>' : ''}
      ${S.editGuide && canEditGuide(sel.id) ? '' : '<div class="txt-row"><button type="button" class="txt-link" id="gd-copy">이 역할 카드 복사하기</button></div>'}
    </section>
    <button type="button" class="btn big" id="back-card" style="margin-top:16px">돌아가기</button>`;
}

const msgOf = (uid) => normalizeMessage(S.members.find((m) => m.uid === uid)?.message);

/** 내 결과 화면: 내 역할 · 배정 이유 · 한마디 */
/** 배정 이유: 한 줄 요약 + "자세히 보기"(요약과 겹치지 않는 근거만) */
function whyInfo(pf, body) {
  const n = (body.match(/하고 싶은 사람이 (\d+)명/) || [])[1];
  if (body.startsWith('이번에는 맡지 못했어요')) {
    const rest = body.replace(/^이번에는 맡지 못했어요\.\s*/, '');
    return { short: rest.includes('무작위') ? '동점이어서 랜덤으로 정해졌어요' : '이번에는 맡지 못했어요', detail: rest };
  }
  if (pf === 'avoid') {
    const rnd = body.includes('무작위');
    return {
      short: rnd ? '"피하고 싶어요"가 가장 적은 조합 중 랜덤으로 지정됐어요' : '팀 전체에서 "피하고 싶어요"가 가장 적은 조합이에요',
      detail: '모두의 선호를 비교해서 피하고 싶은 배정이 가장 적은 조합을 골랐어요. 이 역할은 그 조합에서 다른 팀원이 맡을 수 없었어요.' + (rnd ? ' 같은 조건의 조합이 여러 개여서 그중 하나를 무작위로 골랐어요.' : ''),
    };
  }
  if (body.includes('원하는 대로')) return { short: '원하는 대로 배정됐어요', detail: '하고 싶은 사람이 자리 수를 넘지 않았어요.' };
  if (body.includes('무작위')) return { short: '랜덤으로 지정됐어요', detail: `${n ? `하고 싶은 사람이 ${n}명이었고, ` : ''}선호 만족이 같은 조합이 여러 개여서 일의 양 균형과 무작위로 정했어요.` };
  if (body.includes('가장 크게 만족')) return { short: '하고 싶은 사람이 여럿이었지만 배정됐어요', detail: `하고 싶은 사람이 ${n || '여러'}명이어서, 팀 전체의 선호를 가장 크게 만족시키는 조합을 골랐어요.` };
  if (body.includes('같은 규칙을 적용')) return { short: '팀 전체 규칙에 따라 배정됐어요', detail: '모두에게 같은 순서로 규칙을 적용했어요. 피하고 싶은 배정 최소화 → 모두 역할 1개 이상 → 하고 싶은 배정 최대화.' };
  return null;
}
/** 일의 양: 숫자 대신 막대. 가운데(50)가 팀 평균, 오른쪽이면 평균보다 많아요 */
function loadBarHtml(mine, avg) {
  const ratio = avg > 0 ? mine / avg : 1;
  const pos = Math.max(4, Math.min(100, ratio * 50));
  const word = ratio >= 1.25 ? '팀 평균보다 많은 편이에요' : ratio <= 0.75 ? '팀 평균보다 적은 편이에요' : '팀 평균과 비슷해요';
  return `<div class="lbar" role="img" aria-label="${esc(word)}"><div class="lbar-track"><i style="width:${pos}%"></i><b class="lbar-mid"></b></div><div class="lbar-ticks"><span>0</span><span>50<em>팀 평균</em></span><span>100</span></div></div><p class="why-one">${esc(word)}</p>`;
}
function whyItemsHtml(lines) {
  const out = [];
  const groups = new Map();
  for (const l of lines) {
    const m = String(l).match(/^(.+?) · (.+?) — (.*)$/s);
    if (!m) { out.push(`<li><p>${esc(l)}</p></li>`); continue; }
    if (m[1] === '일의 양') {
      const mine = m[2].match(/([\d.]+)점/);
      const avg = m[3].match(/([\d.]+)점/);
      if (mine && avg) out.push(`<li class="why-load"><div class="why-h"><b>일의 양</b></div>${loadBarHtml(+mine[1], +avg[1])}<details class="why-more"><summary>평균이 뭐예요?</summary><p>팀원 1명이 맡은 일의 양 합계를 평균낸 값이에요. 가운데 선이 그 평균이에요.</p></details></li>`);
      continue;
    }
    const pc = m[2].includes('피하고') ? 'avoid' : m[2].includes('하고 싶') ? 'want' : 'ok';
    const info = whyInfo(pc, m[3]);
    if (!info) { out.push(`<li><div class="why-h"><b>${esc(m[1])}</b><span class="tg pf-${pc}">${esc(m[2])}</span></div><p>${esc(m[3])}</p></li>`); continue; }
    const key = `${pc}|${info.short}|${info.detail}`;
    if (!groups.has(key)) { const g = { names: [], pc, label: m[2], info }; groups.set(key, g); out.push(g); }
    groups.get(key).names.push(m[1]);
  }
  const rows = out.map((o) => (typeof o === 'string' ? o : `<li><div class="why-h"><b>${esc(o.names.join(' · '))}</b><span class="tg pf-${o.pc}">${esc(o.label)}</span></div><p class="why-one">${esc(o.info.short)}</p><details class="why-more"><summary>자세히 보기</summary><p>${esc(o.info.detail)}</p></details></li>`));
  const load = rows.filter((r) => r.includes('why-load'));
  return rows.filter((r) => !r.includes('why-load')).concat(load).join('');
}

/* ---------------- 동점(무작위)일 때 결과 확인 연출: 제비뽑기 · 사다리타기 ---------------- */
// 결과는 서버가 이미 정해 두었다. 여기서는 그 결과를 열어 보는 방식만 고른다.
// 역할을 여러 개 맡은 사람은 맡은 개수만큼 뽑는다.
function loadDrawn() {
  try { return new Set(JSON.parse(sessionStorage.getItem('roleapp-drawn') || '[]')); } catch { return new Set(); }
}
function saveDrawn() {
  try { sessionStorage.setItem('roleapp-drawn', JSON.stringify([...S.drawn])); } catch { /* 저장이 막혀 있어도 동작에는 문제없다 */ }
}
/** 카드·세로줄 개수: 맡은 역할 수보다 하나 이상 많게 */
const drawCount = (k = 1) => Math.min(8, Math.max(3, (S.room?.roles || []).length, k + 1));

/** 동점(무작위)으로 정해진 내 역할이 있고 아직 확인 전이면 { duties(내 역할 전부), names(무작위로 정해진 역할), key }. 아니면 null.
 *  무작위로 정해진 사람만 뽑기를 한다. 나머지는 바로 팀 결과를 본다. 방 전체가 같은 한 가지 방식(DRAW_GAME)을 쓴다. */
function pendingDraw(r, duties) {
  if (!S.priv || !duties.length || duties.length >= 7) return null;
  const key = `${S.code}:${r.round || 1}:${store.uid}`;
  if (S.drawn.has(key)) return null;
  const rnd = new Set();
  for (const l of S.priv.lines || []) {
    const m = String(l).match(/^(.+?) · (.+?) — (.*)$/s);
    if (m && m[3].includes('무작위')) rnd.add(m[1]);
  }
  const names = duties.filter((x) => rnd.has(x.name)).map((x) => x.name);
  return names.length ? { duties, names, key } : null;
}
/** 모두에게 같은 방식으로 보여 주기 위해 하나만 쓴다. 'card'(제비뽑기) 또는 'ladder'(사다리타기) */
const DRAW_GAME = 'card';
const initDraw = (k) => (DRAW_GAME === 'ladder' ? { step: 'start', method: 'ladder', ladder: makeLadder(drawCount(k), 9), starts: [] } : { step: 'card', method: 'card', picks: [] });

const dutyChip = (d) => `<span class="dr-chip"><span class="tile" style="background:${tileBgOf(d)};width:40px;height:40px;border-radius:14px">${roleIcon(d, 22)}</span><b>${esc(d.name)}</b></span>`;
const drawResultHtml = (duties) => `<div class="draw-result"><p class="muted small">이번에 맡은 역할</p><div class="dr-chips">${duties.map(dutyChip).join('')}</div></div>`;

function ladderSvg(L, starts, step) {
  const xs = (i) => 30 + i * (240 / (L.n - 1));
  const top = 56, bot = 250, ys = (k) => top + (k + 1) * ((bot - top) / (L.rows + 1));
  const lines = Array.from({ length: L.n }, (_, i) => `<line x1="${xs(i)}" y1="${top}" x2="${xs(i)}" y2="${bot}" class="ld-line"/>`).join('');
  const rungs = L.rungs.map((row, k) => row.map((c) => `<line x1="${xs(c)}" y1="${ys(k)}" x2="${xs(c + 1)}" y2="${ys(k)}" class="ld-line"/>`).join('')).join('');
  const canPick = step === 'start';
  const tokens = Array.from({ length: L.n }, (_, i) => `<g class="ld-token${starts.includes(i) ? ' on' : ''}" ${canPick && !starts.includes(i) ? `data-start="${i}" role="button" tabindex="0" aria-label="${i + 1}번 출발"` : ''}><circle cx="${xs(i)}" cy="26" r="18"/><text x="${xs(i)}" y="32" text-anchor="middle">${i + 1}</text></g>`).join('');
  const reached = new Set();
  const paths = starts.map((st, idx) => {
    const w = walkLadder(L, st);
    const running = step === 'run' && idx === starts.length - 1;
    if (!running) reached.add(w.end);
    const pts = w.points.map(([c, k]) => `${xs(c)},${k < 0 ? top : k >= L.rows ? bot : ys(k)}`).join(' ');
    return `<polyline class="ld-path${running ? ' run' : ''}" pathLength="1" points="${pts}"/>`;
  }).join('');
  const ends = Array.from({ length: L.n }, (_, i) => `<g class="ld-end${reached.has(i) ? ' hit' : ''}"><circle cx="${xs(i)}" cy="276" r="15"/><text x="${xs(i)}" y="282" text-anchor="middle">${reached.has(i) ? '✓' : '?'}</text></g>`).join('');
  return `<svg class="ladder" viewBox="0 0 300 300" role="img" aria-label="사다리타기">${lines}${rungs}${paths}${tokens}${ends}</svg>`;
}

function drawHtml(pd, r) {
  const ds = pd.duties;
  const k = ds.length;
  const st = S.draw;
  const n = drawCount(k);
  const prog = (c) => (k > 1 ? ` (${c}/${k})` : '');
  const nm = pd.names.map((x) => `‘${esc(x)}’`).join(', ');
  const reasonHtml = `<p class="muted draw-why">${nm} 역할은 선호가 같은 사람이 여러 명이라, 마지막 규칙(무작위)으로 정했어요.<br>결과는 이미 정해져 있고, ${DRAW_GAME === 'ladder' ? '사다리를 타며' : '카드를 뒤집어'} 확인해요.${k > 1 ? `<br>맡은 역할이 ${k}개라서 ${k}번 해요.` : ''}</p>`;
  let title = '같은 조건이라 무작위로 정해졌어요';
  let body = '';
  if (st.step === 'pick') {
    body = '';
  } else if (st.method === 'card') {
    const done = st.picks.length >= k;
    title = done ? '모두 뽑았어요!' : `카드를 ${k > 1 ? '하나씩 ' : ''}골라 뒤집어 보세요${prog(st.picks.length)}`;
    body = `${reasonHtml}<div class="draw-cards n${n}">${Array.from({ length: n }, (_, i) => {
      const at = st.picks.indexOf(i);
      const cls = at >= 0 ? ' flip' : done ? ' dim' : '';
      const face = at >= 0 ? dutyChip(ds[at]).replace('class="dr-chip"', 'class="dr-chip col"') : '';
      return `<div class="draw-card${cls}" data-card="${i}" role="button" tabindex="${at >= 0 || done ? -1 : 0}" aria-label="${i + 1}번 카드"><span class="face back">?</span><span class="face front">${face}</span></div>`;
    }).join('')}</div>
      <div id="draw-after" ${done ? '' : 'hidden'}>${drawResultHtml(ds)}<button type="button" class="btn big" id="draw-done">내 결과 보기</button></div>
      ${done ? '' : '<button type="button" class="txt-link sm" data-draw="skip">바로 결과 보기</button>'}`;
  } else {
    const done = st.step === 'done';
    title = done ? '모두 도착했어요!' : st.step === 'run' ? '내려가는 중…' : `출발점을 ${k > 1 ? '하나씩 ' : ''}골라 보세요${prog(st.starts.length)}`;
    body = `${reasonHtml}${ladderSvg(st.ladder, st.starts, st.step)}
      ${done ? `<div id="draw-after">${drawResultHtml(ds)}<button type="button" class="btn big" id="draw-done">내 결과 보기</button></div>` : st.step === 'run' ? '' : '<button type="button" class="txt-link sm" data-draw="skip">바로 결과 보기</button>'}`;
  }
  return `<section class="draw"><span class="badge">${esc(r.round || 1)}차 배정</span><h2 class="draw-title">${title}</h2>${body}</section>`;
}

function drawAction(kind) {
  if (kind === 'skip') return finishDraw();
  const pd = S.result ? pendingDraw(S.result, myDuties(S.result)) : null;
  const k = pd ? pd.duties.length : 1;
  if (kind === 'card') S.draw = { step: 'card', method: 'card', picks: [] };
  if (kind === 'ladder') S.draw = { step: 'start', method: 'ladder', ladder: makeLadder(drawCount(k), 9), starts: [] };
  renderMine();
}
function pickCard(btn) {
  const st = S.draw;
  const pd = S.result ? pendingDraw(S.result, myDuties(S.result)) : null;
  if (!st || st.method !== 'card' || !pd) return;
  const k = pd.duties.length;
  const i = +btn.dataset.card;
  if (st.picks.length >= k || st.picks.includes(i)) return;
  st.picks.push(i);
  btn.tabIndex = -1;
  btn.querySelector('.front').innerHTML = dutyChip(pd.duties[st.picks.length - 1]).replace('class="dr-chip"', 'class="dr-chip col"');
  btn.classList.add('flip');
  const t = $app.querySelector('.draw-title');
  if (st.picks.length >= k) {
    $app.querySelectorAll('.draw-card').forEach((c) => { c.tabIndex = -1; if (!c.classList.contains('flip')) c.classList.add('dim'); });
    $app.querySelector('[data-draw=skip]')?.remove();
    const after = $app.querySelector('#draw-after');
    if (after) { after.hidden = false; if (!REDUCED_MOTION()) setTimeout(() => playAnim(after, 'rise', 700), 350); }
    if (t) t.textContent = '모두 뽑았어요!';
  } else if (t) t.textContent = `카드를 하나씩 골라 뒤집어 보세요 (${st.picks.length}/${k})`;
}
function pickStart(i) {
  const st = S.draw;
  const pd = S.result ? pendingDraw(S.result, myDuties(S.result)) : null;
  if (!st || st.method !== 'ladder' || st.step !== 'start' || !pd || st.starts.includes(i)) return;
  const k = pd.duties.length;
  st.starts.push(i);
  const settle = () => { if (S.draw === st) { st.step = st.starts.length >= k ? 'done' : 'start'; renderMine(); } };
  if (REDUCED_MOTION()) { st.step = st.starts.length >= k ? 'done' : 'start'; renderMine(); return; }
  st.step = 'run';
  renderMine();
  setTimeout(settle, 2500);
}
function finishDraw() {
  const duties = S.result ? myDuties(S.result) : [];
  const pd = S.result ? pendingDraw(S.result, duties) : null;
  if (pd) { S.drawn.add(pd.key); saveDrawn(); }
  S.draw = null;
  S.mineSig = '';
  renderMine();
  applyView();
}

function renderMine() {
  const el = $app.querySelector('#s-mine');
  const r = S.result;
  if (!me() || !assigned() || !r) { el.innerHTML = ''; S.mineSig = ''; return; }
  const duties = myDuties(r);
  const pd = pendingDraw(r, duties);
  if (pd && !S.draw) S.draw = initDraw(pd.duties.length);
  const sig = JSON.stringify([r.round, duties.map((d) => d.name), S.priv?.lines || [], msgOf(store.uid), pd ? [S.draw?.step, S.draw?.method, S.draw?.picks?.length ?? 0, S.draw?.starts?.length ?? 0] : 0]);
  if (sig === S.mineSig) return; // 입력 중인 글이 지워지지 않게, 바뀐 게 없으면 다시 그리지 않는다
  const firstMine = !S.mineSig;
  S.mineSig = sig;
  if (pd) { el.innerHTML = drawHtml(pd, r); return; }
  el.innerHTML = `
    <section class="mine-top">
      <span class="badge">${esc(r.round || 1)}차 배정</span>
      ${
        !S.priv
          ? '<p class="muted"><span class="spinner"></span>내 결과를 불러오는 중…</p>'
          : duties.length
          ? duties.length === 1
            ? `<div class="my-roles">${duties.map((d) => `<div class="my-hero"><div class="tile l" style="width:96px;height:96px;border-radius:33px;background:#fff">${roleIcon(d, 52)}</div><p class="muted small" style="margin-top:14px">이번에 내가 맡은 역할</p><p class="my-role-name">${esc(d.name)}</p>${d.desc ? `<p class="muted">${esc(d.desc)}</p>` : ''}</div>`).join('')}</div>`
            : `<p class="muted small center" style="margin-top:6px">이번에 내가 맡은 역할 ${duties.length}개</p><div class="my-grid">${duties.map((d, di) => `<div class="my-cell"><span class="tile" style="background:${tileBgOf(d)};width:56px;height:56px;border-radius:20px">${roleIcon(d, 30)}</span><b>${esc(d.name)}</b></div>`).join('')}</div>`
          : '<p class="notice">이번에는 배정된 역할이 없어요. 팀에서 보조 역할을 함께 정해 보세요.</p>'
      }
    </section>
    ${
      S.priv
        ? `<section class="card why"><h2>나의 배정 이유 <span class="badge">나에게만 보여요</span></h2><ul class="why-list">${whyItemsHtml(S.priv.lines || [])}</ul></section>`
        : ''
    }
    ${duties.length ? `<button type="button" class="btn big" id="go-card">내 역할 카드 보기</button>` : ''}
    <section class="card stack">
      <div><h2>팀원들에게 한마디 <span class="tag opt">선택</span></h2><p class="muted small">팀 전체 결과에서 내 이름 아래에 말풍선으로 보여요.</p></div>
      <input id="msg" type="text" maxlength="${MESSAGE_MAX}" placeholder="예: 부족한 점이 많지만 최선을 다하겠습니다" value="${esc(msgOf(store.uid))}" />
      <button type="button" class="btn off" id="save-msg" aria-live="polite">한마디 남기기</button>
      <p class="muted small" id="msg-hint" hidden>버튼을 눌러야 남겨져요</p>
    </section>
    <button type="button" class="btn big" id="go-team">팀 전체 결과 보기</button>`;
  syncMsg();
  if (firstMine) playAnim(el, 'reveal', 1600);
}

/** 한마디 버튼: 글이 바뀌어 아직 안 남겼을 때만 진하게(누를 수 있게), 아니면 흐리게 */
function syncMsg() {
  const inp = $app.querySelector('#msg');
  const btn = $app.querySelector('#save-msg');
  if (!inp || !btn) return;
  const saved = msgOf(store.uid);
  const v = normalizeMessage(inp.value);
  const dirty = v !== saved;
  btn.classList.toggle('off', !dirty);
  btn.classList.toggle('line', false);
  btn.setAttribute('aria-disabled', dirty ? 'false' : 'true');
  btn.textContent = dirty ? (v ? '한마디 남기기' : '한마디 지우기') : saved ? '남겼어요 ✓' : '한마디 남기기';
  const hint = $app.querySelector('#msg-hint');
  if (hint) hint.hidden = !dirty;
}

function resultCopyText() {
  const r = S.result;
  const lines = [`📌 ${S.room?.name || '팀 역할'}${r.round > 1 ? ` (${r.round}차 배정)` : ''}`];
  for (const role of r.roles) lines.push(`${role.name} — ${role.members.length ? role.members.map((m) => m.nickname).join(', ') : '(미배정)'}`);
  if (r.unassigned?.length) lines.push(`역할 없음 — ${r.unassigned.map((u) => u.nickname).join(', ')}`);
  return lines.join('\n');
}

/** 팀 전체 결과 화면 */
function renderResult() {
  const el = $app.querySelector('#s-result');
  const r = S.result;
  if (!assigned() || !r) { el.innerHTML = ''; return; }
  const myId = store.uid;
  const s = r.summary || {};
  const person = (m) => {
    const msg = msgOf(m.uid);
    const ci = Math.max(0, S.members.findIndex((x) => x.uid === m.uid));
    return `<span class="person"><span class="member ${m.uid === myId ? 'me' : ''}">${avatarHtml(avOfUid(m.uid), 'av')}${esc(m.nickname)}${m.uid === myId ? ' <span class="me-tag">나</span>' : ''}</span>${msg ? `<small class="msg"><span>${esc(msg)}</span></small>` : ''}</span>`;
  };
  el.innerHTML = `
    <section class="res-flat stack">
      <div class="page-head tm"><div><h1 class="page-title">역할이<br>정해졌어요</h1><p class="muted">${esc(S.room?.name || '')} · ${esc(r.round || 1)}차 배정</p></div><span class="tm-chars"><img src="/mata-s.png" alt="" width="70" height="70" /><img src="/taba-s.png" alt="" width="64" height="64" /></span></div>
      <div>
        ${r.roles
          .map(
            (role, ri) => `
          <div class="role-card rc-col">
            <div class="role-head"><span class="rc-name"><span class="tile" style="background:${tileBgOf(role)};width:40px;height:40px;border-radius:14px">${roleIcon(role, 24)}</span><b>${esc(role.name)}</b> <span class="tag">${esc(role.need)}명</span><span class="tag">일의 양 ${esc(LOAD_LABEL[role.load] || '중')}</span></span>${me() ? `<button type="button" class="role-link" data-role-card="${esc(role.id)}">역할 카드 ▸</button>` : ''}</div>
            <div class="names">${role.members.length ? role.members.map(person).join('') : '<span class="muted small">배정된 사람이 없어요</span>'}</div>
          </div>`,
          )
          .join('')}
      </div>
      ${r.unassigned?.length ? `<div class="notice">이번에 역할이 배정되지 않은 팀원: <div class="names" style="margin-top:6px">${r.unassigned.map(person).join('')}</div><p class="small" style="margin-top:6px">팀에서 보조 역할을 함께 정해 보세요.</p></div>` : ''}
      <div class="txt-row"><button type="button" class="txt-link" id="copy-result">결과 복사하기</button></div>
    </section>

    <section class="rules-sec">
      <details class="rules"><summary>이 배정은 이런 규칙으로 정해졌어요</summary>
        <p class="muted small rules-lead">위에 있는 규칙일수록 먼저 지켜요.</p>
        <ol class="rules-list">${(s.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
        ${s.randomCount > 0 ? `<p class="muted small rules-foot">이번에는 선호가 같은 조합이 여러 개여서, 마지막 규칙(무작위)으로 정해진 배정이 ${esc(s.randomCount)}건 있어요.</p>` : ''}
        <p class="muted small rules-foot">같은 선호를 입력하면 같은 결과가 나와요.</p>
      </details>
    </section>
    <section class="finish"><button type="button" class="btn big" id="go-start">처음으로</button><p class="muted small">나중에 시작 화면의 "최근 들어간 방"에서 다시 열 수 있어요.</p></section>
    ${isCreator() ? (S.confirmReopen ? '<section class="card stack"><p>선호를 수정하고 다시 배정하면 이전 결과는 새 결과로 바뀌어요. 계속할까요?</p><div class="row"><button type="button" class="btn" id="do-reopen-yes">다시 열기</button><button type="button" class="btn line" id="do-reopen-no">취소</button></div></section>' : '<div class="txt-row"><button type="button" class="txt-link sm" id="do-reopen">선호 수정하고 다시 배정하기 (방장만)</button></div>') : ''}`;
}

/* 프로필 캐릭터 고르기 클릭(방 만들기·입장·참여 현황 공통). 앱 시작 때 한 번만 붙인다. */
function bindAvatarClicks() {
  // 한마디 말풍선: 길면 한 줄로 줄여 보이고, 누르면 펼친다
  $app.addEventListener('click', (e) => { const m = e.target.closest('.rc-col .msg'); if (m) m.classList.toggle('open'); });
  // 프로필 캐릭터 고르기 (방 만들기·입장: 임시 선택 / 참여 현황: 내 캐릭터 바로 저장)
  $app.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-av-toggle]');
    if (tg) {
      if (tg.dataset.avToggle === 'me') { S.avOpen = !S.avOpen; renderMembers(); return; }
      const w = $app.querySelector('#avp-draft');
      if (w) w.hidden = !w.hidden;
      return;
    }
    const opt = e.target.closest('.avp-opt');
    if (!opt) return;
    const id = opt.dataset.av;
    const mode = opt.closest('[data-avp]')?.dataset.avp;
    if (mode === 'draft') {
      draftAv = id;
      $app.querySelectorAll('.avp-opt').forEach((b) => { const on = b.dataset.av === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const img = $app.querySelector('.av-btn .avimg');
      if (img) { img.style.background = AVATAR_BG[id[0]]; img.querySelector('img').src = `/avatars/${id}.png`; img.classList.remove('cm', 'ct'); img.classList.add(`c${id[0].toLowerCase()}`); }
      $app.querySelector('#avp-draft').hidden = true;
    } else if (mode === 'me') {
      S.avOpen = false;
      saveAvatar(id);
      try { await store.setAvatar(S.code, id); } catch (err) { console.error(err); toast('캐릭터를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
      renderMembers();
    }
  });
}

/* ---------------- 이벤트 위임 ---------------- */
function attachDelegates() {
  const q = (id) => $app.querySelector(id);
  // 참여
  q('#s-join').addEventListener('click', async (e) => {
    if (e.target.closest('#join-home')) { location.hash = '#/'; return; }
    if (!e.target.closest('#do-join')) return;
    const nickname = q('#join-nick').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) return toast('닉네임을 입력해 주세요.');
    if (isNicknameTaken(S.members, nickname, store.uid)) return toast('이미 쓰고 있는 닉네임이에요. 다른 이름을 입력해 주세요.');
    e.target.closest('button').disabled = true;
    try {
      saveNick(nickname);
      saveAvatar(draftAv);
      await store.join(S.code, nickname, draftAv);
      location.hash = `#/room/${S.code}/prefs`; // 들어오면 바로 선호 입력으로
    } catch (err) {
      console.error(err);
      toast(`들어가지 못했어요: ${err.message}`);
      e.target.closest('button').disabled = false;
    }
  });
  // 역할 편집
  const rolesEl = q('#s-roles');
  rolesEl.addEventListener('input', (e) => {
    const blk = e.target.closest('.role-block');
    if (!blk) return;
    const r = S.rolesDraft[+blk.dataset.i];
    if (e.target.classList.contains('r-name')) r.name = e.target.value;
    if (e.target.classList.contains('r-desc')) r.desc = e.target.value;
    if (e.target.classList.contains('t-in')) { r.taskItems = [...taskItemsOf(r)]; r.taskItems[+e.target.dataset.ti] = e.target.value; }
    syncMoreBadge(blk, r);
  });
  rolesEl.addEventListener('toggle', (e) => {
    const det = e.target.closest?.('.role-more');
    if (!det) return;
    if (det.open) S.rolesOpen.add(det.dataset.rid);
    else S.rolesOpen.delete(det.dataset.rid);
  }, true);
  rolesEl.addEventListener('click', (e) => {
    const ko = e.target.closest('.kind-opt');
    const ic = e.target.closest('.r-icon');
    if (ko || ic) {
      const blk = (ko || ic).closest('.role-block');
      const r = S.rolesDraft[+blk.dataset.i];
      if (ko) r.icon = ko.dataset.k;
      S.rolesOpen.add(r.id);
      drawRolesEditor(rolesEl);
      return;
    }
  });
  rolesEl.addEventListener('change', (e) => {
    const blk = e.target.closest('.role-block');
    if (!blk) return;
    const r = S.rolesDraft[+blk.dataset.i];
    if (e.target.classList.contains('r-need')) r.need = +e.target.value;
    if (e.target.classList.contains('r-load')) r.load = +e.target.value;
    if (e.target.classList.contains('r-kind')) {
      r.kind = e.target.value;
      S.rolesOpen.add(r.id);
      drawRolesEditor(rolesEl);
    }
  });
  const taskAct = (e) => {
    const blk = e.target.closest('.role-block');
    if (!blk) return false;
    const r = S.rolesDraft[+blk.dataset.i];
    const items = [...taskItemsOf(r)];
    const add = e.target.closest('.t-add');
    const del = e.target.closest('.t-del');
    const chip = e.target.closest('.t-chip');
    if (!add && !del && !chip) return false;
    if (add) items.push('');
    if (del) items.splice(+del.dataset.ti, 1);
    if (chip) items.push(chip.dataset.t);
    r.taskItems = items;
    S.rolesOpen.add(r.id);
    drawRolesEditor(rolesEl);
    if (add) focusLastTask(rolesEl.querySelector(`.role-block[data-i="${blk.dataset.i}"]`));
    return true;
  };
  rolesEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('t-in')) return;
    e.preventDefault();
    const blk = e.target.closest('.role-block');
    const r = S.rolesDraft[+blk.dataset.i];
    if (!e.target.value.trim()) return;
    r.taskItems = [...taskItemsOf(r), ''];
    drawRolesEditor(rolesEl);
    focusLastTask(rolesEl.querySelector(`.role-block[data-i="${blk.dataset.i}"]`));
  });
  rolesEl.addEventListener('click', async (e) => {
    if (taskAct(e)) return;
    const del = e.target.closest('.r-del');
    if (del) {
      S.rolesDraft.splice(+del.closest('.role-block').dataset.i, 1);
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-add')) {
      const used = new Set(S.rolesDraft.map((r) => r.id));
      let n = 1;
      while (used.has(`r${n}`)) n++;
      S.rolesDraft.push({ id: `r${n}`, name: '', need: 1, load: 2, kind: '', desc: '', tasks: [] });
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-save')) {
      const clean = draftToRoles(S.rolesDraft);
      if (!clean.length) return toast('역할을 하나 이상 남겨 주세요.');
      const sig = (list) => JSON.stringify((list || []).map((r) => [r.id, r.name, r.need, r.load]));
      if (S.members.some((m) => m.submitted) && sig(clean) !== sig(S.room.roles)) {
        if (!window.confirm('이미 선호를 제출한 팀원이 있어요. 새로 추가한 역할은 그 팀원에게 "상관없어요"로 처리돼요. 저장할까요?')) return;
      }
      e.target.closest('button').disabled = true;
      try {
        await store.updateRoles(S.code, clean);
        toast('역할을 저장했어요.');
        location.hash = `#/room/${S.code}`;
      } catch (err) {
        console.error(err);
        toast(`저장하지 못했어요: ${err.message}`);
      }
      const b = rolesEl.querySelector('#r-save');
      if (b) b.disabled = false;
    }
  });
  // 선호 입력
  const prefsEl = q('#s-prefs');
  prefsEl.addEventListener('change', (e) => {
    if (S.form && e.target.id === 'random') { S.form.randomConsent = e.target.checked; }
  });
  prefsEl.addEventListener('click', async (e) => {
    const pref = e.target.closest('[data-pref]');
    if (pref && S.form) {
      S.form.prefs[pref.dataset.rid] = pref.dataset.pref;
      S.touched.add(pref.dataset.rid); // 직접 고른 선택은 성향 제안이 덮어쓰지 않는다
      renderPrefs();
      playAnim('.pf-opt.on', 'pop', 450);
      return;
    }
    const chip = e.target.closest('.trait');
    if (chip) {
      const id = chip.dataset.trait;
      if (S.traits.has(id)) S.traits.delete(id);
      else S.traits.add(id);
      applyTraits();
      playAnim(`.chip.trait[data-trait="${id}"][aria-pressed="true"]`, 'pop', 450);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && S.form) {
      const n = S.room.roles.length;
      const a = act.dataset.act;
      const apply = () => {
        if (a === 'next') S.pIdx = Math.min(S.pIdx + 1, n);
        else if (a === 'prev') S.pIdx = Math.max(S.pIdx - 1, 0);
        else if (a === 'sum') { S.pIdx = n; S.editOne = false; }
        else if (a === 'edit') { S.pIdx = Number(act.dataset.i); S.editOne = true; }
        else if (a === 'sheet') S.sheet = true;
        else if (a === 'close') S.sheet = false;
        renderPrefs();
        if (a === 'next' || a === 'prev' || a === 'edit' || a === 'sum') {
          window.scrollTo(0, 0);
          if ($app.querySelector('.pf-stack') && (a === 'next' || a === 'prev')) playAnim('.pf-stack', 'deal', 500);
          else playAnim('#s-prefs', 'fade-up', 400);
        }
      };
      // 카드가 날아가고, 뒤에 쌓여 있던 다음 카드가 올라온다
      const stack = $app.querySelector('.pf-stack');
      if ((a === 'next' || a === 'prev') && stack && !REDUCED_MOTION()) {
        if (S.navBusy) return;
        S.navBusy = true;
        stack.classList.add(a === 'next' ? 'leave-l' : 'leave-r');
        setTimeout(() => { S.navBusy = false; apply(); }, 230);
        return;
      }
      apply();
      return;
    }
    if (!e.target.closest('#save-prefs')) return;
    const f = S.form;
    if (!f.randomConsent) return toast('무작위 배정 동의(필수)에 체크해 주세요.');
    const data = { ...normalizePrefs(f, S.room.roles), strength: '', wish: '', share: false }; // 소개 두 줄은 더 이상 받지 않는다 (규칙상 필드는 유지)
    e.target.closest('button').disabled = true;
    try {
      await store.savePrefs(S.code, data);
      f.saved = true;
      S.touched = new Set(S.room.roles.map((r) => r.id)); // 저장한 선택은 확정. 성향 칩은 저장하지 않으므로 닫는다.
      S.traits = new Set();
      S.pIdx = null;
      S.editOne = false;
      S.prefsSig = '';
      renderPrefs();
      toast('선호를 저장했어요.');
      S.justSaved = true;
      location.hash = `#/room/${S.code}`;
    } catch (err) {
      console.error(err);
      toast(`저장하지 못했어요: ${err.message}`);
      const b = prefsEl.querySelector('#save-prefs');
      if (b) b.disabled = false;
    }
  });
  // 배정 / 다시 열기
  q('#s-hub').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) location.hash = `#/room/${S.code}/${b.dataset.go}`;
  });
  q('#s-members').addEventListener('click', async (e) => {
    if (e.target.closest('#force-assign')) { S.confirmAssign = true; renderMembers(); return; }
    if (e.target.closest('#cancel-assign')) { S.confirmAssign = false; renderMembers(); return; }
    if (e.target.closest('#cap-edit')) { S.capEdit = true; renderMembers(); return; }
    if (e.target.closest('#cap-cancel')) { S.capEdit = false; renderMembers(); return; }
    if (e.target.closest('#cap-save')) {
      const n = normalizeCapacity(q('#cap-sel').value);
      if (!n || n < S.members.length) return toast(`이미 ${S.members.length}명이 들어와서 그보다 적게는 줄일 수 없어요.`);
      try {
        await store.updateCapacity(S.code, n);
        S.capEdit = false;
        toast(`팀원 수를 ${n}명으로 바꿨어요.`);
        renderAll();
      } catch (err) {
        console.error(err);
        toast(`바꾸지 못했어요: ${err.message}`);
      }
      return;
    }
    if (e.target.closest('#slot-edit')) { S.confirmSlots = false; location.hash = `#/room/${S.code}/roles`; return; }
    const go = e.target.closest('#slot-go');
    if (!go && !e.target.closest('#do-assign')) return;
    if (S.busy) return;
    const missing = S.members.filter((m) => !m.submitted).length;
    const waiting = S.room?.capacity ? Math.max(0, S.room.capacity - S.members.length) : 0;
    if ((missing > 0 || waiting > 0) && !S.confirmAssign) return; // 미제출자·미입장자가 있으면 "그래도 배정하기"를 거쳐야 한다
    // 역할 자리와 인원이 안 맞으면 한 번 확인한다
    if (!go && slotMsg(S.room?.roles || [])) { S.confirmSlots = true; renderMembers(); return; }
    S.confirmSlots = false;
    S.busy = true;
    renderMembers();
    try {
      await store.assign(S.code);
    } catch (err) {
      console.error(err);
      toast(`배정하지 못했어요: ${err.message}`);
    }
    S.busy = false;
    S.confirmAssign = false;
    renderAll();
  });
  q('#s-duties').addEventListener('input', (e) => {
    if (e.target.id === 'gd-desc') S.guideDesc = e.target.value;
    if (e.target.classList.contains('t-in') && S.guideItems) S.guideItems[+e.target.dataset.ti] = e.target.value;
  });
  q('#s-duties').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('t-in') || !S.guideItems) return;
    e.preventDefault();
    if (!e.target.value.trim()) return;
    S.guideItems = [...S.guideItems, '']; S.forceDuties = true; renderDuties(); focusLastTask(q('#s-duties'));
  });
  q('#s-duties').addEventListener('change', (e) => {
    const box = e.target.closest('.chk input');
    if (!box) return;
    toggleCheck(box.dataset.rid, box.dataset.t, box.checked);
    S.forceDuties = true; renderDuties();
  });
  q('#s-duties').addEventListener('click', async (e) => {
    const chip = e.target.closest('.rc-chip');
    if (chip) { S.cardRole = chip.dataset.role; S.editGuide = false; S.guideItems = null; S.guideDesc = null; renderDuties(); return; }
    if (e.target.closest('#gd-edit')) {
      const sel = currentCardRole();
      if (!sel || !canEditGuide(sel.id)) return toast('이 역할을 맡은 팀원만 고칠 수 있어요.');
      const g = sel ? guideOf(sel) : { tasks: [], desc: '' };
      S.guideItems = [...g.tasks]; S.guideDesc = g.desc; S.editGuide = true; renderDuties(); return;
    }
    const seg = e.target.closest('.own-seg button');
    if (seg) { S.shareFilter = seg.dataset.f; S.forceDuties = true; renderDuties(); return; }
    const tg = e.target.closest('button.own-tag');
    if (tg) { const key = `${tg.dataset.rid}|${tg.dataset.ti}`; S.tagOpen = S.tagOpen === key ? null : key; S.forceDuties = true; renderDuties(); return; }
    const op = e.target.closest('.own-opt');
    if (op) {
      const role = (S.result?.roles || []).find((r) => r.id === op.dataset.rid);
      const t = role ? guideOf(role).tasks[+op.dataset.ti] : null;
      if (!role || t == null) return;
      const cur = new Set(ownersOfTask(role, t));
      if (cur.has(op.dataset.u)) cur.delete(op.dataset.u); else cur.add(op.dataset.u);
      const list = (S.room?.owners?.[role.id] || []).filter((x) => x.t !== t);
      if (cur.size) list.push({ t, u: [...cur] });
      S.room = { ...S.room, owners: { ...(S.room?.owners || {}), [role.id]: list } };
      S.forceDuties = true; renderDuties();
      try { await store.updateOwners(S.code, role.id, list); }
      catch { toast('담당을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); }
      return;
    }
    if (e.target.closest('#gd-copy')) {
      const sel = currentCardRole();
      if (!sel) return;
      const g = guideOf(sel);
      const text = [`[${sel.name}]`, g.desc, ...(g.tasks.length ? ['할 일', ...g.tasks.map((t) => { const who = ownerLabel(sel, t).replaceAll('·', ', '); return `${(S.priv?.roleIds || []).includes(sel.id) && isChecked(sel.id, t) ? '☑' : '☐'} ${t}${who ? ` (${who})` : ''}`; })] : [])].filter(Boolean).join('\n');
      try { await navigator.clipboard.writeText(text); toast('역할 카드를 복사했어요.'); }
      catch { toast('복사하지 못했어요. 화면을 캡처해 공유해 주세요.'); }
      return;
    }
    if (e.target.closest('#gd-cancel')) { S.editGuide = false; S.guideItems = null; S.guideDesc = null; renderDuties(); return; }
    if (S.editGuide && (e.target.closest('.t-add') || e.target.closest('.t-del') || e.target.closest('.t-chip'))) {
      const items = [...(S.guideItems || [])];
      const add = e.target.closest('.t-add'); const del = e.target.closest('.t-del'); const chip2 = e.target.closest('.t-chip');
      if (add) items.push('');
      if (del) items.splice(+del.dataset.ti, 1);
      if (chip2) items.push(chip2.dataset.t);
      S.guideItems = items; S.forceDuties = true; renderDuties();
      if (add) focusLastTask(q('#s-duties'));
      return;
    }
    if (e.target.closest('#gd-save')) {
      const rid = S.cardRole || (S.result.roles.find((r) => (S.priv?.roleIds || []).includes(r.id)) || S.result.roles[0]).id;
      const root = q('#s-duties');
      const clip = (t, n) => String(t || '').trim().slice(0, n);
      const tasks = (S.guideItems || []).map((x) => clip(x, STEP_MAX)).filter(Boolean).slice(0, STEP_COUNT);
      const btn = e.target.closest('button');
      btn.disabled = true;
      try {
        await store.updateGuide(S.code, rid, { desc: clip(root.querySelector('#gd-desc').value, DESC_MAX), tasks });
        S.editGuide = false; S.guideItems = null; S.guideDesc = null;
        toast('역할 카드를 고쳤어요.');
      } catch (err) {
        console.error(err);
        toast(`저장하지 못했어요: ${err.message}`);
        btn.disabled = false;
        return;
      }
      renderDuties();
      return;
    }
    if (e.target.closest('#back-card')) location.hash = S.cardFrom === 'team' ? `#/room/${S.code}/team` : `#/room/${S.code}`;
  });
  q('#s-mine').addEventListener('input', (e) => { if (e.target.id === 'msg') syncMsg(); });
  q('#s-mine').addEventListener('keydown', (e) => { if (e.target.id === 'msg' && e.key === 'Enter') q('#save-msg').click(); });
  q('#s-mine').addEventListener('click', async (e) => {
    const dr = e.target.closest('[data-draw]');
    if (dr) { drawAction(dr.dataset.draw); return; }
    const cd = e.target.closest('[data-card]');
    if (cd) { pickCard(cd); return; }
    const ds = e.target.closest('[data-start]');
    if (ds) { pickStart(+ds.dataset.start); return; }
    if (e.target.closest('#draw-done')) { finishDraw(); return; }
    if (e.target.closest('#go-card')) { S.cardRole = (S.priv?.roleIds || [])[0] || null; S.editGuide = false; S.cardFrom = 'mine'; location.hash = `#/room/${S.code}/card`; return; }
    if (e.target.closest('#go-team')) { location.hash = `#/room/${S.code}/team`; return; }
    if (e.target.closest('#save-msg')) {
      if (e.target.closest('#save-msg').classList.contains('off')) return;
      const v = normalizeMessage(q('#msg').value);
      const b = e.target.closest('button');
      b.disabled = true;
      try {
        await store.setMessage(S.code, v);
        syncMsg();
        toast(v ? '한마디를 남겼어요.' : '한마디를 지웠어요.');
      } catch (err) {
        console.error(err);
        toast(`저장하지 못했어요: ${err.message}`);
      }
      b.disabled = false;
    }
  });
  q('#s-result').addEventListener('click', async (e) => {
    if (e.target.closest('#go-start')) { location.hash = '#/'; return; }
    if (e.target.closest('#go-card-team')) { S.cardRole = (S.priv?.roleIds || [])[0] || null; S.cardFrom = 'team'; S.editGuide = false; location.hash = `#/room/${S.code}/card`; return; }
    if (e.target.closest('#copy-result')) {
      const text = resultCopyText();
      try { await navigator.clipboard.writeText(text); toast('결과를 복사했어요.'); }
      catch { toast('복사하지 못했어요. 화면을 캡처해 공유해 주세요.'); }
      return;
    }
    const rc = e.target.closest('[data-role-card]');
    if (rc) { S.cardRole = rc.dataset.roleCard; S.cardFrom = 'team'; S.editGuide = false; location.hash = `#/room/${S.code}/card`; return; }
    if (e.target.closest('#do-reopen')) { S.confirmReopen = true; renderResult(); return; }
    if (e.target.closest('#do-reopen-no')) { S.confirmReopen = false; renderResult(); return; }
    if (!e.target.closest('#do-reopen-yes')) return;
    S.confirmReopen = false;
    e.target.closest('button').disabled = true;
    try {
      await store.reopen(S.code);
      S.prefsLoaded = false;
      S.prefsSig = '';
      S.rolesSig = '';
      toast('선호를 다시 받을 수 있어요.');
    } catch (err) {
      console.error(err);
      toast(`다시 열지 못했어요: ${err.message}`);
    }
    renderAll();
  });
}

/* ---------------- 라우터 ---------------- */
async function route() {
  // 시작 화면에서는 큰 로고를 쓰므로 위쪽 작은 로고를 숨긴다
  document.body.classList.toggle('is-start', !/^#\/(room\/|create$|join$|about$)/.test(location.hash));
  const m = location.hash.match(/^#\/room\/([A-Za-z0-9]{6})(?:\/(roles|prefs|card|team))?$/);
  if (m) {
    const code = m[1].toUpperCase();
    const view = m[2] || 'hub';
    if (S && S.code === code && S.loaded) {
      S.view = view; // 같은 방 안에서의 이동: 다시 불러오지 않는다
      renderAll();
      window.scrollTo(0, 0);
    } else await openRoom(code, view);
    if (view === 'team') playAnim('.res-flat', 'reveal', 1500);
    if (view === 'hub' && S?.justSaved) { S.justSaved = false; setTimeout(() => playAnim('.av-me .av-ok', 'pop-in', 700), 120); }
  }
  else if (location.hash === '#/create') renderCreate();
  else if (location.hash === '#/join') renderJoinCode();
  else if (location.hash === '#/about') renderAbout();
  else renderStart();
  playAnim($app, 'page-in', 500);
}

async function boot() {
  $app.innerHTML = '<p class="muted" style="padding:40px 0;text-align:center"><span class="spinner"></span>불러오는 중…</p>';
  try {
    store = createStore();
    await store.init();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<section class="card"><h2>시작하지 못했어요</h2><p class="muted" style="margin-top:6px">${esc(e.message || e)}</p><p class="muted small" style="margin-top:8px">Firebase 설정(익명 로그인 사용 설정, 설정값)을 확인해 주세요. 주소 끝에 <code>?demo</code>를 붙이면 연습 모드로 열려요.</p></section>`;
    return;
  }
  bindAvatarClicks();
  window.addEventListener('hashchange', route);
  route();
}
boot();

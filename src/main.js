import './style.css';
import { createStore } from './store.js';
import { normalizePrefs, normalizeRoles, normalizeTasks, normalizeRoomName, isNicknameTaken, normalizeMessage, MESSAGE_MAX, LOAD_LABEL } from '../lib/roomService.js';
import { relevantTraits, suggestPrefs } from '../lib/traits.js';
import { KINDS, DESC_MAX, STEP_MAX, STEP_COUNT, kindFromName, kindOfRole, exampleDesc, templateFor } from '../lib/roleGuide.js';

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
const home = { selected: new Map(TEMPLATES.slice(0, 4).map((t) => [t.name, t.load])), custom: [], roomName: '' };

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
        <p>눈치 말고, 마타바에게 말해요</p>
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
    like: '팀원들의 다양한 의견, 맛있는 간식, 조용한 카페, 계획 세우기',
    dislike: '어색한 분위기, 무리한 결정, 혼자만의 부담',
  },
  {
    key: 'T', cls: 'taba', name: '타바', en: 'TABA', hero: '/taba.png', color: '버터 옐로우', hex: '#FFD166',
    say: '언제든 말해줘!',
    intro: '밝고 활발하며, 어색한 순간을 가볍게 풀어주는 분위기 메이커예요.',
    like: '새로운 경험, 맛있는 간식, 칭찬하기, 친구들과 수다 떨기',
    dislike: '지루한 분위기, 복잡한 규칙, 혼자만의 부담',
  },
];
const POSES = [['base', '기본'], ['wink', '윙크'], ['happy', '신남'], ['think', '고민'], ['wow', '놀람'], ['sleep', '숙면']];

function renderAbout(sel = 'M') {
  cleanup();
  const c = CHARS.find((x) => x.key === sel);
  $app.innerHTML = `
    <main class="about">
      <button type="button" class="link" id="back">← 처음으로</button>
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
    <div class="row between" style="margin-top:4px">
      <button type="button" class="link" id="back">← 처음으로</button>
      ${modeBadge()}
    </div>
    <section class="card stack" aria-labelledby="h-join">
      <div><h1 id="h-join" class="page-title">방 코드로 들어가기</h1><p class="muted" style="margin-top:6px">방장에게 받은 6자리 코드를 넣어 주세요. 닉네임은 다음 화면에서 정해요.</p></div>
      <input id="join-code" class="code-input" type="text" maxlength="6" placeholder="ABC123" aria-label="방 코드" autocomplete="off" autocapitalize="characters" />
      <button type="button" class="btn big" id="join">들어가기</button>
    </section>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
  const input = $app.querySelector('#join-code');
  const go = () => {
    const code = input.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return toast('방 코드는 영문 대문자와 숫자 6자리예요.');
    location.hash = `#/room/${code}`;
  };
  $app.querySelector('#join').addEventListener('click', go);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  input.focus();
}

/* ---------------- 방 만들기 ---------------- */
function renderCreate() {
  cleanup();
  const customList = home.custom.filter((n) => !TEMPLATES.some((t) => t.name === n));
  const chipIcon = (n) => { const k = kindFromName(n); return k ? roleIcon({ kind: k }, 15) : ''; };
  $app.innerHTML = `
    <div class="row between" style="margin-top:4px">
      <button type="button" class="link" id="back">← 처음으로</button>
      ${modeBadge()}
    </div>
    <section class="create stack" aria-labelledby="h-create">
      <div class="create-head"><h1 id="h-create" class="page-title">방 만들기</h1><img class="create-mata" src="/mata.png" alt="" width="78" height="82" /></div>
      <div>
        <label for="room-name">방 이름 <span class="tag req">필수</span><span class="cnt" id="cnt-name"></span></label>
        <input id="room-name" type="text" maxlength="20" placeholder="예: PM캠프 3조 최종 프로젝트" value="${esc(home.roomName || '')}" autocomplete="off" />
        <p class="err" id="err-name" hidden>방 이름을 입력해 주세요</p>
      </div>
      <div>
        <label for="nick">내 닉네임 <span class="tag req">필수</span><span class="cnt" id="cnt-nick"></span></label>
        <input id="nick" type="text" maxlength="12" placeholder="예: 정민" value="${esc(savedNick())}" autocomplete="off" />
        <p class="err" id="err-nick" hidden>닉네임을 입력해 주세요</p>
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
      const code = await store.createRoom({ roles, nickname, name });
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
    <div class="row between" style="margin-top:4px">
      <button type="button" class="link" id="back">← 처음으로</button>
      ${modeBadge()}
    </div>
    <section class="card" id="room-card" aria-label="방 정보">
      <div id="room-title" class="room-title"></div>
      <div class="muted small">방 코드</div>
      <div class="code-box"><span class="code" id="code-text">${esc(code)}</span>
        <button type="button" class="btn ghost small" id="copy-code">코드 복사</button>
        <button type="button" class="btn ghost small" id="copy-link">링크 복사</button>
      </div>
      <div id="s-status" style="margin-top:8px"></div>
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
/** 역할 카드(설명·할 일)는 방에 들어온 팀원이면 누구나 고칠 수 있다 */
const canEditGuide = () => isCreator() || !!me();
const assigned = () => S.room?.status === 'assigned';

async function openRoom(code, view = 'hub') {
  cleanup();
  S = { code, view, room: null, members: [], result: null, priv: null, rolesDraft: null, rolesOpen: new Set(), rolesSig: '', prefsSig: '', form: null, cardRole: null, editGuide: false, confirmReopen: false, pIdx: null, sheet: false, traits: new Set(), touched: new Set(), prefsLoaded: false, busy: false, confirmAssign: false, loaded: false };
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
  const onCard = joined && done && S.view === 'card';
  const onTeam = done && (!joined || S.view === 'team'); // 방에 아직 안 들어온 사람도 결과는 팀 화면으로 본다
  const onMine = joined && done && !onCard && !onTeam;
  show('#room-card', !step && !onCard && !onMine);
  show('#s-join', !joined);
  show('#s-hub', joined && !done && !step);
  show('#s-members', joined && !done && !step);
  show('#s-roles', !joined || step === 'roles');
  show('#s-prefs', step === 'prefs');
  show('#s-mine', onMine);
  show('#s-result', onTeam);
  show('#s-duties', onCard);
  const back = $app.querySelector('#back');
  if (back) back.textContent = onCard && S.cardFrom === 'team' ? '‹ 팀 결과로' : onCard || (onTeam && joined) ? '‹ 내 결과로' : step ? '← 방으로' : '← 처음으로';
}

/** 방장에게만: 역할 자리 수와 참여 인원을 비교해 안내한다. */
function slotGuide(roles) {
  if (!isCreator()) return '';
  const people = S.members.length;
  const slots = roles.reduce((s, r) => s + Math.min(r.need || 1, Math.max(people, 1)), 0);
  if (!people || !slots) return '';
  if (slots > people) return `<p class="muted small">역할 자리는 ${esc(slots)}개, 참여는 ${esc(people)}명이에요. 일부 팀원이 역할을 2개 이상 맡을 수 있어요.</p>`;
  if (slots < people) return `<p class="muted small">역할 자리(${esc(slots)}개)보다 참여 인원(${esc(people)}명)이 많아서, 역할을 못 받는 팀원이 생길 수 있어요.</p>`;
  return '';
}

/** 허브: 내가 지금 할 일을 단계별로 보여 준다. */
function renderHub() {
  const el = $app.querySelector('#s-hub');
  if (!me() || assigned()) { el.innerHTML = ''; return; }
  const roles = S.room.roles || [];
  const submitted = !!me().submitted;
  el.innerHTML = `
    <section class="card stack">
      <h2>내가 할 일</h2>
      <button type="button" class="task" data-go="roles">
        <span class="task-body"><b>1. 이번에 정할 역할</b><span class="muted small">${esc(roles.map((r) => r.name).join(' · '))}</span></span>
        <span class="tag">${isCreator() ? '설정하기' : '확인하기'}</span>
      </button>
      <button type="button" class="task ${submitted ? 'done' : ''}" data-go="prefs">
        <span class="task-body"><b>2. 내 선호 입력</b><span class="muted small">${submitted ? '저장했어요. 배정 전까지 바꿀 수 있어요.' : '하고 싶은 역할과 피하고 싶은 역할을 골라요. 다른 팀원에게는 보이지 않아요.'}</span></span>
        <span class="tag ${submitted ? 'ok' : ''}">${submitted ? '완료 ✓' : '입력하기'}</span>
      </button>
      ${slotGuide(roles)}
    </section>`;
}

function renderStatus() {
  const el = $app.querySelector('#s-status');
  const done = assigned();
  el.innerHTML = `<span class="badge ${done ? 'done' : ''}">${done ? '배정 완료' : '선호를 모으는 중'}</span>
    <span class="muted small" style="margin-left:6px">${esc(S.members.length)}명 참여</span>`;
}

function renderJoin() {
  const el = $app.querySelector('#s-join');
  if (!S.membersLoaded) return;
  if (me()) {
    if (el.innerHTML) el.innerHTML = '';
    return;
  }
  if (el.querySelector('#join-nick')) return; // 입력 중이면 다시 그리지 않음
  el.innerHTML = `
    <section class="card stack">
      <div><h2>닉네임을 정하고 들어가요</h2><p class="muted">다른 팀원에게는 이 이름으로 보여요. 이름·이메일은 받지 않아요.</p><p class="muted small" style="margin-top:6px">🔒 내가 고른 선호는 다른 팀원에게 공개되지 않아요.</p></div>
      <input id="join-nick" type="text" maxlength="12" placeholder="예: 지은" value="${esc(savedNick())}" aria-label="닉네임" autocomplete="off" />
      ${assigned() ? '<p class="notice">이미 배정이 끝난 방이에요. 지금 들어가도 이번 배정에는 포함되지 않아요.</p>' : ''}
      <button type="button" class="btn" id="do-join">들어가기</button>
    </section>`;
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
          ${roles.map((r) => `<div><b>${esc(r.name)}</b> <span class="tag">${esc(r.need)}명</span>${r.desc ? `<p class="role-desc">${esc(r.desc)}</p>` : ''}</div>`).join('')}
        </div>
        ${isCreator() ? '' : '<p class="muted small" style="margin-top:10px">역할은 방장이 정해요.</p>'}
      </section>`;
  }
}

function drawRolesEditor(el) {
  const d = S.rolesDraft;
  el.innerHTML = `
    <section class="card stack">
      <div><h2>역할 설정 <span class="badge">방장만</span></h2><p class="muted">필요 인원과 예상 일의 양을 정해 주세요. 해 보기 전엔 알기 어려우니 대략만 골라도 돼요. 중요도와는 관계없고, 한 사람에게 일이 몰리지 않게 나눌 때만 쓰여요. 역할마다 <b>설명과 할 일</b>을 적어 두면, 팀원이 선택할 때 참고하고 배정 뒤에는 "내 역할 카드"로 받아요.</p></div>
      <div class="role-head"><span>역할 이름</span><span>필요 인원</span><span>예상 일의 양</span><span></span></div>
      ${d
        .map(
          (r, i) => `
        <div class="role-block" data-i="${i}">
          <div class="role-edit">
            <input type="text" class="r-name" maxlength="20" value="${esc(r.name)}" aria-label="역할 이름" />
            <select class="r-need" aria-label="필요 인원">${[1, 2, 3].map((n) => `<option value="${n}" ${r.need === n ? 'selected' : ''}>${n}명</option>`).join('')}</select>
            <select class="r-load" aria-label="예상 일의 양">${[1, 2, 3].map((n) => `<option value="${n}" ${r.load === n ? 'selected' : ''}>${LOAD_LABEL[n]}</option>`).join('')}</select>
            <button type="button" class="x r-del" aria-label="${esc(r.name || '이 역할')} 삭제">✕</button>
          </div>
          <details class="role-more" data-rid="${esc(r.id)}" ${S.rolesOpen.has(r.id) ? 'open' : ''}>
            <summary>설명·할 일 ${r.desc || taskItemsOf(r).some((t) => t.trim()) ? '<span class="tag ok">작성됨</span>' : '<span class="tag">비어 있음</span>'}</summary>
            <div class="stack role-more-body">
              <div>
                <label>역할 종류 <span class="muted small">(성향 제안과 연결돼요)</span></label>
                <select class="r-kind" aria-label="역할 종류">
                  <option value="" ${!r.kind ? 'selected' : ''}>이름으로 자동 추정${!r.kind && kindFromName(r.name) ? ` (${esc(KINDS.find((k) => k.id === kindFromName(r.name)).label)})` : ''}</option>
                  ${KINDS.map((k) => `<option value="${k.id}" ${r.kind === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
                </select>
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
      <div class="row">
        <button type="button" class="btn line small" id="r-add" ${d.length >= 12 ? 'disabled' : ''}>+ 역할 추가</button>
        <button type="button" class="btn small" id="r-save">역할 저장</button>
      </div>
      <p class="muted small">저장하면 팀원 화면에도 바로 반영돼요. 이미 선호를 낸 팀원은 새로 생긴 역할을 "상관없어요"로 처리해요.</p>
    </section>`;
}

/** 편집 칸에 보일 글: 직접 쓰고 있던 글이 있으면 그대로, 없으면 저장된 값 */
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
  if (S.touched.has(rid)) return '';
  const s = sug.suggestions[rid];
  if (s) return `"${s.labels.join('", "')}" 때문에 "${PREF_LABEL[s.value]}"로 제안했어요. 아니면 바꿔 주세요.`;
  if (sug.conflicts.includes(rid)) return '고른 성향이 서로 달라서 제안하지 않았어요.';
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
  const sig = JSON.stringify([roles, S.form.saved === true, S.pIdx, S.sheet, [...S.traits], S.form.prefs, S.form.randomConsent]);
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
  design: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 003-3A9 9 0 0012 3z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.500" r="1"/><circle cx="16" cy="11" r="1"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  schedule: '<rect x="4" y="5" width="16" height="15" rx="2.500"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  other: '<path d="M12 4v16M4 12h16"/>',
};
const roleIcon = (r, size, color = '#4452C8') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KIND_ICON[kindOfRole(r)] || KIND_ICON.other}</svg>`;
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
        <div class="pf-card">
          <div class="tile l" style="background:${TILE_BG[i % 4]}">${roleIcon(r, 46)}</div>
          <h2 class="pf-name">${esc(r.name)}</h2>
          ${r.desc ? `<p class="pf-desc">${esc(r.desc)}</p>` : ''}
          <button type="button" class="pf-duty" data-act="sheet">▸ 할 일 보기</button>
          ${chips.length ? `<div class="chips pf-chips">${chips.map((t) => `<button type="button" class="chip trait" data-trait="${esc(t.id)}" aria-pressed="${S.traits.has(t.id)}">${esc(t.label)}</button>`).join('')}</div>` : ''}
          ${hint ? `<p class="pf-hint">${esc(hint)}</p>` : !chips.length ? '<p class="pf-hint plain">제안이 없어요. 직접 골라 주세요</p>' : ''}
        </div>
      </div>
      <div class="pf-opts" role="radiogroup" aria-label="${esc(r.name)} 선호">
        ${PREF_OPT.map(([v, label, ic, cls]) => `<button type="button" role="radio" aria-checked="${f.prefs[r.id] === v}" class="pf-opt ${cls}${f.prefs[r.id] === v ? ' on' : ''}" data-pref="${v}" data-rid="${esc(r.id)}"><span class="ic">${ic}</span>${label}</button>`).join('')}
      </div>
      <ul class="pf-notes">
        <li>내 선택은 팀원에게 보이지 않아요</li>
        <li>넘어가면 “상관없어요”로 처리돼요</li>
        <li>고른 성향은 저장되지 않아요</li>
      </ul>
      ${f.saved ? '<button type="button" class="pf-skip" data-act="sum">한눈에 보기로 돌아가기 <span>(수정하러 온 경우만)</span></button>' : ''}
      <div class="pf-nav">
        ${i > 0 ? '<button type="button" class="btn big line" data-act="prev">◂ 이전</button>' : ''}
        <button type="button" class="btn big" data-act="next" style="flex:2">${last ? '선택 확인하기 ▸' : '다음 역할 ▸'}</button>
      </div>
    </section>
    ${S.sheet ? dutySheetHtml(r, i) : ''}`;
}

function dutySheetHtml(r, i) {
  const tasks = normalizeTasks(r);
  return `
    <div class="sheet-bg" data-act="close"></div>
    <div class="sheet" role="dialog" aria-label="${esc(r.name)} 할 일">
      <div class="grab"></div>
      <div class="sheet-head"><div class="tile" style="background:${TILE_BG[i % 4]};width:40px;height:40px;border-radius:14px">${roleIcon(r, 24)}</div><h2>할 일</h2><button type="button" class="sheet-x" data-act="close" aria-label="닫기">✕</button></div>
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
      <h2 class="pf-sum-title">내 선택을 확인해요</h2>
      <div class="pf-rows">
        ${roles
          .map((r, i) => {
            const v = f.prefs[r.id] || 'ok';
            const o = PREF_OPT.find((x) => x[0] === v);
            return `<button type="button" class="pf-row" data-act="edit" data-i="${i}"><span class="tile" style="background:${TILE_BG[i % 4]};width:40px;height:40px;border-radius:14px">${roleIcon(r, 24)}</span><span class="nm">${esc(r.name)}</span><span class="pill ${o[3]}">${o[1]}</span><span class="ed">수정 ▸</span></button>`;
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
  const total = S.members.length;
  const submitted = S.members.filter((m) => m.submitted).length;
  const missing = total - submitted;
  const creator = isCreator();
  let action = '';
  if (creator && !assigned()) {
    if (S.busy) {
      action = '<button type="button" class="btn" id="do-assign" disabled><span class="spinner"></span>배정하는 중…</button>';
    } else if (missing === 0) {
      action = '<button type="button" class="btn" id="do-assign" ' + (submitted === 0 ? 'disabled' : '') + '>배정하기</button>';
    } else if (S.confirmAssign) {
      action = `<div class="stack">
          <p class="notice">미제출 ${esc(missing)}명은 선호가 없는 상태로 처리돼요(모든 역할을 "상관없어요"로 봐요). 그 팀원이 원하지 않는 역할에 배정될 수 있어요.</p>
          <button type="button" class="btn" id="do-assign">미제출 ${esc(missing)}명 포함해서 배정하기</button>
          <button type="button" class="btn line" id="cancel-assign">선호 제출을 기다리기</button>
        </div>`;
    } else {
      action = `<div class="stack">
          <p class="notice">아직 선호를 제출하지 않은 팀원이 ${esc(missing)}명 있어요. 모든 팀원이 제출하면 배정할 수 있어요.</p>
          <button type="button" class="btn" id="do-assign" disabled>모두 제출하면 배정할 수 있어요 (${esc(submitted)}/${esc(total)})</button>
          ${submitted > 0 ? '<button type="button" class="link" id="force-assign" style="align-self:center">그래도 배정하기</button>' : '<p class="muted small">한 명 이상 선호를 저장하면 배정할 수 있어요.</p>'}
        </div>`;
    }
  }
  el.innerHTML = `
    <section class="card stack">
      <div>
        <div class="row between"><h2>참여 현황</h2><span class="muted small">${esc(submitted)}/${esc(total)}명 제출</span></div>
        <p class="muted">선호를 낸 사람은 초록색이에요. (무엇을 골랐는지는 보이지 않아요.)</p>
      </div>
      <div class="members">
        ${S.members
          .map((m) => `<span class="member ${m.submitted ? 'done' : ''} ${m.uid === store.uid ? 'me' : ''}">${esc(m.nickname)}${m.uid === store.uid ? ' (나)' : ''}${m.submitted ? ' ✓' : ''}</span>`)
          .join('')}
      </div>
      ${action}
      ${!creator && !assigned() ? '<p class="muted small">방장이 배정 버튼을 누르면 결과가 나와요.</p>' : ''}
    </section>`;
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
    <article class="duty">
      <header class="duty-head">
        <span class="tile l" style="background:#fff">${roleIcon(role, 48)}</span>
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
          : '<p class="duty-empty">아직 이 역할의 할 일을 적지 않았어요.' + (canEditGuide() ? ' 아래 "수정하기"로 적어 주세요.' : ' 팀원이 적으면 여기에 보여요.') + '</p>'
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
      ${S.editGuide && canEditGuide() ? guideFormHtml(sel) : dutyBodyHtml(sel)}
      ${S.editGuide && canEditGuide() ? '' : '<button type="button" class="btn big line" id="gd-copy" style="margin-top:12px">이 역할 카드 복사하기</button>'}
      ${canEditGuide() && !S.editGuide ? '<button type="button" class="btn big line" id="gd-edit" style="margin-top:12px">이 역할 설명·할 일 수정하기</button>' : ''}
    </section>
    <button type="button" class="btn big" id="back-card" style="margin-top:16px">돌아가기</button>`;
}

const msgOf = (uid) => normalizeMessage(S.members.find((m) => m.uid === uid)?.message);

/** 내 결과 화면: 내 역할 · 배정 이유 · 한마디 */
function renderMine() {
  const el = $app.querySelector('#s-mine');
  const r = S.result;
  if (!me() || !assigned() || !r) { el.innerHTML = ''; S.mineSig = ''; return; }
  const duties = myDuties(r);
  const sig = JSON.stringify([r.round, duties.map((d) => d.name), S.priv?.lines || [], msgOf(store.uid)]);
  if (sig === S.mineSig) return; // 입력 중인 글이 지워지지 않게, 바뀐 게 없으면 다시 그리지 않는다
  S.mineSig = sig;
  el.innerHTML = `
    <section class="mine-top">
      <span class="badge">${esc(r.round || 1)}차 배정</span>
      ${
        !S.priv
          ? '<p class="muted"><span class="spinner"></span>내 결과를 불러오는 중…</p>'
          : duties.length
          ? duties.map((d) => `<div class="my-hero"><div class="tile l" style="width:96px;height:96px;border-radius:33px;background:#fff">${roleIcon(d, 52)}</div><p class="muted small" style="margin-top:14px">이번에 내가 맡은 역할</p><p class="my-role-name">${esc(d.name)}</p>${d.desc ? `<p class="muted">${esc(d.desc)}</p>` : ''}</div>`).join('')
          : '<p class="notice">이번에는 배정된 역할이 없어요. 팀에서 보조 역할을 함께 정해 보세요.</p>'
      }
    </section>
    ${
      S.priv
        ? `<section class="card"><h2>나의 배정 이유 <span class="badge">나에게만 보여요</span></h2><ul class="lines">${(S.priv.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`
        : ''
    }
    ${duties.length ? `<button type="button" class="btn big" id="go-card">내 역할 카드 보기 (${esc(duties.map((d) => d.name).join(', '))})</button>` : ''}
    <section class="card stack">
      <div><h2>팀원들에게 한마디 <span class="tag opt">선택</span></h2><p class="muted small">남기면 팀 전체 결과에서 내 이름 아래에 작게 보여요. 배정 전까지의 선호와는 관계없어요.</p></div>
      <input id="msg" type="text" maxlength="${MESSAGE_MAX}" placeholder="예: 부족한 점이 많지만 최선을 다하겠습니다" value="${esc(msgOf(store.uid))}" />
      <button type="button" class="btn off" id="save-msg" aria-live="polite">한마디 남기기</button>
      <p class="muted small" id="msg-hint" hidden>버튼을 눌러야 남겨져요</p>
    </section>
    <button type="button" class="btn big" id="go-team">팀 전체 결과 보기</button>`;
  syncMsg();
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
    return `<span class="person"><span class="member ${m.uid === myId ? 'me' : ''}"><span class="av" style="background:${OWN_COLORS[ci % OWN_COLORS.length]}">${esc([...m.nickname][0] || '')}</span>${esc(m.nickname)}${m.uid === myId ? ' <span class="me-tag">나</span>' : ''}</span>${msg ? `<small class="msg">${esc(msg)}</small>` : ''}</span>`;
  };
  el.innerHTML = `
    <section class="card stack">
      <div class="row between"><h2>팀 전체 결과</h2><span class="badge done">${esc(r.round || 1)}차 배정</span></div>
      <div>
        ${r.roles
          .map(
            (role, ri) => `
          <div class="role-card rc-col" style="background:${TILE_BG[ri % 4]}">
            <div class="role-head"><span class="rc-name"><span class="tile" style="background:#fff;width:40px;height:40px;border-radius:14px">${roleIcon(role, 24)}</span><b>${esc(role.name)}</b> <span class="tag">${esc(role.need)}명</span></span>${me() ? `<button type="button" class="role-link" data-role-card="${esc(role.id)}">역할 카드 ▸</button>` : ''}</div>
            <div class="names">${role.members.length ? role.members.map(person).join('') : '<span class="muted small">배정된 사람이 없어요</span>'}</div>
          </div>`,
          )
          .join('')}
      </div>
      ${r.unassigned?.length ? `<div class="notice">이번에 역할이 배정되지 않은 팀원: <div class="names" style="margin-top:6px">${r.unassigned.map(person).join('')}</div><p class="small" style="margin-top:6px">팀에서 보조 역할을 함께 정해 보세요.</p></div>` : ''}
      <button type="button" class="btn big line" id="copy-result">결과 복사하기</button>
      <p class="muted small">복사에는 역할과 이름만 담겨요. 배정 이유와 선호는 포함되지 않아요.</p>
    </section>

    <section class="card">
      <details><summary style="cursor:pointer;font-weight:700">이 배정은 이런 규칙으로 정해졌어요</summary>
        <ol class="lines" style="padding-left:20px">${(s.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
        <p class="muted small">번호가 앞설수록 먼저 지켜요</p>
        ${s.randomCount > 0 ? `<p class="muted small" style="margin-top:8px">이번 결과에서는 선호와 일의 양 균형이 같은 조합이 여러 개여서, 마지막 단계(무작위)로 정해진 배정이 ${esc(s.randomCount)}건 있어요.</p>` : ''}
        <p class="muted small" style="margin-top:8px">배정 계산에는 AI를 쓰지 않아요. 같은 입력이면 같은 규칙이 적용돼요.</p>
      </details>
    </section>
    ${isCreator() ? (S.confirmReopen ? '<section class="card stack"><p>선호를 수정하고 다시 배정하면 이전 결과는 새 결과로 바뀌어요. 계속할까요?</p><div class="row"><button type="button" class="btn" id="do-reopen-yes">다시 열기</button><button type="button" class="btn line" id="do-reopen-no">취소</button></div></section>' : '<div class="footer"><button type="button" class="btn line" id="do-reopen">선호 수정하고 다시 배정하기</button></div>') : ''}
    <section class="finish"><p>역할이 정해졌어요. 이제 같이 시작해요!</p><button type="button" class="btn big" id="go-start">처음으로</button><p class="muted small">나중에 시작 화면의 "최근 들어간 방"에서 다시 열 수 있어요.</p></section>`;
}

/* ---------------- 이벤트 위임 ---------------- */
function attachDelegates() {
  const q = (id) => $app.querySelector(id);
  // 참여
  q('#s-join').addEventListener('click', async (e) => {
    if (!e.target.closest('#do-join')) return;
    const nickname = q('#join-nick').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) return toast('닉네임을 입력해 주세요.');
    if (isNicknameTaken(S.members, nickname, store.uid)) return toast('이미 쓰고 있는 닉네임이에요. 다른 이름을 입력해 주세요.');
    e.target.closest('button').disabled = true;
    try {
      saveNick(nickname);
      await store.join(S.code, nickname);
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
  });
  rolesEl.addEventListener('toggle', (e) => {
    const det = e.target.closest?.('.role-more');
    if (!det) return;
    if (det.open) S.rolesOpen.add(det.dataset.rid);
    else S.rolesOpen.delete(det.dataset.rid);
  }, true);
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
      return;
    }
    const chip = e.target.closest('.trait');
    if (chip) {
      const id = chip.dataset.trait;
      if (S.traits.has(id)) S.traits.delete(id);
      else S.traits.add(id);
      applyTraits();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && S.form) {
      const n = S.room.roles.length;
      const a = act.dataset.act;
      if (a === 'next') S.pIdx = Math.min(S.pIdx + 1, n);
      else if (a === 'prev') S.pIdx = Math.max(S.pIdx - 1, 0);
      else if (a === 'sum') S.pIdx = n;
      else if (a === 'edit') S.pIdx = Number(act.dataset.i);
      else if (a === 'sheet') S.sheet = true;
      else if (a === 'close') S.sheet = false;
      renderPrefs();
      if (a === 'next' || a === 'prev' || a === 'edit' || a === 'sum') window.scrollTo(0, 0);
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
      S.prefsSig = '';
      renderPrefs();
      toast('선호를 저장했어요.');
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
    if (!e.target.closest('#do-assign') || S.busy) return;
    const missing = S.members.filter((m) => !m.submitted).length;
    if (missing > 0 && !S.confirmAssign) return; // 미제출자가 있으면 "그래도 배정하기"를 거쳐야 한다
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
        toast(v ? '한마디를 남겼어요. 팀 전체 결과에서 내 이름 아래에 보여요.' : '한마디를 지웠어요.');
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
  }
  else if (location.hash === '#/create') renderCreate();
  else if (location.hash === '#/join') renderJoinCode();
  else if (location.hash === '#/about') renderAbout();
  else renderStart();
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
  window.addEventListener('hashchange', route);
  route();
}
boot();

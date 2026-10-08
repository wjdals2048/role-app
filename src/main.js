import './style.css';
import { createStore } from './store.js';
import { normalizePrefs, normalizeRoles, normalizeRoomName, LOAD_LABEL } from '../lib/roomService.js';
import { relevantTraits, suggestPrefs } from '../lib/traits.js';
import { KINDS, PHASES, DESC_MAX, STEP_COUNT, kindFromName, templateFor } from '../lib/roleGuide.js';

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
const modeBadge = () => (store?.mode === 'demo' ? '<span class="badge demo">연습 모드 · 이 브라우저 안에서만 동작해요</span>' : '');

function cleanup() {
  unsubs.forEach((u) => u && u());
  unsubs = [];
  S = null;
}

/* ---------------- 시작 화면 ---------------- */
function renderStart() {
  cleanup();
  $app.innerHTML = `
    <main class="start">
      ${modeBadge()}
      <div class="start-brand">
        <div class="start-logo" aria-hidden="true"></div>
        <h1>탓낫핏</h1>
        <p>팀플 역할, 눈치 없이 정해요</p>
      </div>
      <div class="start-actions">
        <button type="button" class="btn big" id="go-create">방 만들기</button>
        <button type="button" class="btn big line" id="go-join">방 코드로 들어가기</button>
      </div>
    </main>`;
  $app.querySelector('#go-create').addEventListener('click', () => (location.hash = '#/create'));
  $app.querySelector('#go-join').addEventListener('click', () => (location.hash = '#/join'));
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
  $app.innerHTML = `
    <div class="row between" style="margin-top:4px">
      <button type="button" class="link" id="back">← 처음으로</button>
      ${modeBadge()}
    </div>
    <section class="card stack" aria-labelledby="h-create">
      <h1 id="h-create" class="page-title">방 만들기</h1>
      <div>
        <label for="room-name">방 이름 <span class="tag">선택</span></label>
        <input id="room-name" type="text" maxlength="20" placeholder="예: PM캠프 3조 최종 프로젝트" value="${esc(home.roomName || '')}" autocomplete="off" />
        <p class="muted small" style="margin-top:6px">팀원이 코드를 넣고 들어왔을 때 맞는 방인지 확인할 수 있어요.</p>
      </div>
      <div>
        <label for="nick">내 닉네임 <span class="tag">필수</span></label>
        <input id="nick" type="text" maxlength="12" placeholder="예: 정민" value="${esc(savedNick())}" autocomplete="off" />
        <p class="muted small" style="margin-top:6px">실명이 아니어도 괜찮아요. 방장도 팀원 중 한 명으로 참여해요.</p>
      </div>
      <div>
        <label>필요한 역할 <span class="tag">1개 이상</span></label>
        <div class="chips" id="role-chips">
          ${TEMPLATES.map((t) => `<button type="button" class="chip" data-role="${esc(t.name)}" aria-pressed="${home.selected.has(t.name)}">${esc(t.name)}</button>`).join('')}
          ${customList.map((n) => `<button type="button" class="chip" data-role="${esc(n)}" aria-pressed="${home.selected.has(n)}">${esc(n)}</button>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <div class="grow"><input id="custom-role" type="text" maxlength="20" placeholder="직접 추가: 예) 발표 자료 검수" aria-label="직접 추가할 역할 이름" /></div>
          <button type="button" class="btn ghost" id="add-custom">추가</button>
        </div>
        <p class="muted small" style="margin-top:6px">인원, 부담도, 설명은 방을 만든 뒤 바꿀 수 있어요.</p>
      </div>
      <button type="button" class="btn big" id="create">방 만들기</button>
    </section>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
  const $name = $app.querySelector('#room-name');
  $name.addEventListener('input', () => (home.roomName = $name.value));

  const $nick = $app.querySelector('#nick');
  $app.querySelector('#role-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const name = b.dataset.role;
    if (home.selected.has(name)) home.selected.delete(name);
    else home.selected.set(name, TEMPLATES.find((t) => t.name === name)?.load ?? 2);
    b.setAttribute('aria-pressed', home.selected.has(name));
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
  };
  $app.querySelector('#add-custom').addEventListener('click', addCustom);
  $app.querySelector('#custom-role').addEventListener('keydown', (e) => e.key === 'Enter' && addCustom());
  $app.querySelector('#create').addEventListener('click', async (e) => {
    const nickname = $nick.value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) return toast('닉네임을 입력해 주세요.');
    const roles = normalizeRoles(
      [...home.selected].map(([name, load], i) => {
        const kind = kindFromName(name) || ''; // 이름을 알아보면 기본 설명·할 일을 미리 채운다. 방에서 고칠 수 있다.
        return { id: `r${i + 1}`, name, need: 1, load, kind, ...templateFor(kind) };
      }),
    );
    if (!roles.length) return toast('역할을 하나 이상 골라 주세요.');
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
    <div id="s-result"></div>
    <div id="s-duties"></div>`;
  $app.querySelector('#back').addEventListener('click', () => {
    const inStep = S && me() && ((S.view === 'card' && assigned()) || ((S.view === 'roles' || S.view === 'prefs') && !assigned()));
    location.hash = inStep ? `#/room/${code}` : '#/';
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
const assigned = () => S.room?.status === 'assigned';

async function openRoom(code, view = 'hub') {
  cleanup();
  S = { code, view, room: null, members: [], result: null, priv: null, rolesDraft: null, rolesOpen: new Set(), rolesSig: '', prefsSig: '', form: null, traits: new Set(), touched: new Set(), prefsLoaded: false, busy: false, confirmAssign: false, loaded: false };
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
  renderStatus();
  renderJoin();
  renderHub();
  renderRoles();
  renderPrefs();
  renderMembers();
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
  show('#room-card', !step && !onCard);
  show('#s-join', !joined);
  show('#s-hub', joined && !done && !step);
  show('#s-members', joined && !done && !step);
  show('#s-roles', !joined || step === 'roles');
  show('#s-prefs', step === 'prefs');
  show('#s-result', done && !onCard);
  show('#s-duties', onCard);
  const back = $app.querySelector('#back');
  if (back) back.textContent = onCard ? '← 결과로' : step ? '← 방으로' : '← 처음으로';
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
        <span class="task-body"><b>2. 내 선호 입력</b><span class="muted small">${submitted ? '저장했어요. 배정 전까지 바꿀 수 있어요.' : '하고 싶은 역할과 하기 싫은 역할을 골라요. 다른 팀원에게는 보이지 않아요.'}</span></span>
        <span class="tag ${submitted ? 'ok' : ''}">${submitted ? '완료 ✓' : '입력하기'}</span>
      </button>
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
      <div><h2>닉네임을 정하고 들어가요</h2><p class="muted">다른 팀원에게는 이 이름으로 보여요. 이름·이메일은 받지 않아요.</p></div>
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
          ${roles.map((r) => `<div><b>${esc(r.name)}</b> <span class="tag">${esc(r.need)}명</span><span class="tag">부담 ${esc(LOAD_LABEL[r.load] || '보통')}</span>${r.desc ? `<p class="role-desc">${esc(r.desc)}</p>` : ''}</div>`).join('')}
        </div>
        ${isCreator() ? '' : '<p class="muted small" style="margin-top:10px">역할은 방장이 정해요.</p>'}
      </section>`;
  }
}

function drawRolesEditor(el) {
  const d = S.rolesDraft;
  el.innerHTML = `
    <section class="card stack">
      <div><h2>역할 설정 <span class="badge">방장만</span></h2><p class="muted">필요 인원과 부담도를 정해 주세요. 부담도는 팀원끼리 고르게 나누는 데 쓰여요. 역할마다 <b>설명과 할 일</b>을 적어 두면, 팀원이 선택할 때 참고하고 배정 뒤에는 "내 역할 카드"로 받아요.</p></div>
      <div class="role-head"><span>역할 이름</span><span>필요 인원</span><span>부담도</span><span></span></div>
      ${d
        .map(
          (r, i) => `
        <div class="role-block" data-i="${i}">
          <div class="role-edit">
            <input type="text" class="r-name" maxlength="20" value="${esc(r.name)}" aria-label="역할 이름" />
            <select class="r-need" aria-label="필요 인원">${[1, 2, 3].map((n) => `<option value="${n}" ${r.need === n ? 'selected' : ''}>${n}명</option>`).join('')}</select>
            <select class="r-load" aria-label="부담도">${[1, 2, 3].map((n) => `<option value="${n}" ${r.load === n ? 'selected' : ''}>${LOAD_LABEL[n]}</option>`).join('')}</select>
            <button type="button" class="x r-del" aria-label="${esc(r.name || '이 역할')} 삭제">✕</button>
          </div>
          <details class="role-more" data-rid="${esc(r.id)}" ${S.rolesOpen.has(r.id) ? 'open' : ''}>
            <summary>설명·할 일 ${r.desc || PHASES.some((ph) => (r.steps?.[ph.id] || []).length) ? '<span class="tag ok">작성됨</span>' : '<span class="tag">비어 있음</span>'}</summary>
            <div class="stack role-more-body">
              <div>
                <label>역할 종류 <span class="muted small">(고르면 기본 내용을 채우고, 성향 제안과도 연결돼요)</span></label>
                <select class="r-kind" aria-label="역할 종류">
                  <option value="" ${!r.kind ? 'selected' : ''}>이름으로 자동 추정${!r.kind && kindFromName(r.name) ? ` (${esc(KINDS.find((k) => k.id === kindFromName(r.name)).label)})` : ''}</option>
                  ${KINDS.map((k) => `<option value="${k.id}" ${r.kind === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}
                </select>
              </div>
              <div><label>한 줄 설명</label><input type="text" class="r-desc" maxlength="${DESC_MAX}" value="${esc(r.desc || '')}" placeholder="예: 팀이 만든 결과를 다른 사람 앞에서 전달해요" /></div>
              <div><label>해야 할 일 <span class="muted small">(시기마다 한 줄에 하나, 최대 ${STEP_COUNT}개)</span></label>
                ${PHASES.map((ph) => `<div class="step-edit"><span class="step-label">${ph.label}</span><textarea class="r-step" data-phase="${ph.id}" rows="2" aria-label="${ph.label} 할 일">${esc(stepsText(r)[ph.id])}</textarea></div>`).join('')}
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
      <p class="muted small">저장하면 팀원 화면에도 바로 반영돼요. 이미 선호를 낸 팀원은 새로 생긴 역할을 "상관없다"로 처리해요.</p>
    </section>`;
}

const splitLines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
/** 편집 칸에 보일 글: 직접 쓰고 있던 글이 있으면 그대로, 없으면 저장된 값 */
function stepsText(r) {
  const out = {};
  for (const ph of PHASES) out[ph.id] = r.stepsText?.[ph.id] ?? (r.steps?.[ph.id] || []).join('\n');
  return out;
}
/** 편집 중인 값에서 시기별 할 일 목록을 뽑는다. */
function currentSteps(r) {
  const t = stepsText(r);
  return { start: splitLines(t.start), during: splitLines(t.during), end: splitLines(t.end) };
}
/** 편집 중인 초안을 저장 가능한 역할 목록으로 바꾼다. */
function draftToRoles(draft) {
  return normalizeRoles(draft.map((r) => ({ ...r, steps: currentSteps(r) })));
}

function blankForm() {
  const prefs = {};
  for (const r of S.room.roles) prefs[r.id] = 'ok';
  return { prefs, strength: '', wish: '', share: false, randomConsent: false };
}

const PREF_LABEL = { want: '하고 싶다', ok: '상관없다', avoid: '하기 싫다' };

function traitHint(rid, sug) {
  if (S.touched.has(rid)) return '';
  const s = sug.suggestions[rid];
  if (s) return `"${s.labels.join('", "')}" 때문에 "${PREF_LABEL[s.value]}"로 제안했어요. 아니면 바꿔 주세요.`;
  if (sug.conflicts.includes(rid)) return '고른 성향이 서로 달라서 제안하지 않았어요.';
  return '';
}

/** 고른 성향 칩에 맞춰, 본인이 직접 건드리지 않은 역할만 제안 값으로 바꾼다. 입력 중인 글은 건드리지 않는다. */
function applyTraits() {
  const el = $app.querySelector('#s-prefs');
  if (!el || !S.form) return;
  const sug = suggestPrefs([...S.traits], S.room.roles);
  let n = 0;
  for (const r of S.room.roles) {
    if (!S.touched.has(r.id)) {
      const v = sug.suggestions[r.id]?.value || 'ok';
      S.form.prefs[r.id] = v;
      el.querySelectorAll('input[type=radio][data-rid]').forEach((inp) => {
        if (inp.dataset.rid === r.id) inp.checked = inp.value === v;
      });
      if (sug.suggestions[r.id]) n++;
    }
    el.querySelectorAll('.pref-hint').forEach((h) => {
      if (h.dataset.rid === r.id) h.textContent = traitHint(r.id, sug);
    });
  }
  el.querySelectorAll('.trait').forEach((b) => b.setAttribute('aria-pressed', String(S.traits.has(b.dataset.trait))));
  const note = el.querySelector('#trait-note');
  if (note) note.textContent = S.traits.size ? (n ? `제안된 선택 ${n}개가 아래에 표시됐어요. 확인하고 고쳐 주세요.` : '이 방의 역할과 맞는 제안이 없었어요.') : '';
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
        S.form.strength = saved.strength || '';
        S.form.wish = saved.wish || '';
        S.form.share = saved.share === true;
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
  const sig = JSON.stringify([roles, S.form.saved === true]);
  if (sig === S.prefsSig) return;
  S.prefsSig = sig;
  const f = S.form;
  const traitList = relevantTraits(roles);
  S.traits = new Set([...S.traits].filter((id) => traitList.some((t) => t.id === id))); // 없어진 역할의 칩은 해제
  el.innerHTML = `
    <section class="card stack">
      <div><h2>내 선호 고르기</h2><p class="muted">다른 팀원에게는 보이지 않아요. 솔직하게 골라 주세요. 아무것도 고르지 않으면 "상관없다"로 처리해요.</p></div>
      ${
        traitList.length
          ? `<div class="stack trait-box">
        <div><h3>나는 이런 편이에요 <span class="tag">선택</span></h3><p class="muted small">이 방의 역할에 맞는 항목만 보여요. 해당하는 걸 누르면 아래 선택을 <b>제안</b>해 드려요. 제안은 언제든 바꿀 수 있어요. 고른 성향은 저장되지 않고, 팀원이나 AI에게도 전달되지 않아요.</p></div>
        <div class="chips">${traitList.map((t) => `<button type="button" class="chip trait" data-trait="${esc(t.id)}" aria-pressed="${S.traits.has(t.id)}">${esc(t.label)}</button>`).join('')}</div>
        <p class="muted small" id="trait-note" aria-live="polite"></p>
      </div>`
          : ''
      }
      <div>
        ${roles
          .map(
            (r) => `
          <div class="pref-item" role="group" aria-labelledby="pl-${esc(r.id)}">
            <div class="pref-title" id="pl-${esc(r.id)}">${esc(r.name)} <span class="tag">${esc(r.need)}명</span><span class="tag">부담 ${esc(LOAD_LABEL[r.load])}</span></div>
            ${r.desc ? `<p class="role-desc">${esc(r.desc)}</p>` : ''}
            <div class="seg">
              ${[['want', '하고 싶다'], ['ok', '상관없다'], ['avoid', '하기 싫다']]
                .map(([v, label]) => `<label><input type="radio" name="pref-${esc(r.id)}" value="${v}" data-rid="${esc(r.id)}" ${f.prefs[r.id] === v ? 'checked' : ''} /><span>${label}</span></label>`)
                .join('')}
            </div>
            <p class="pref-hint small" data-rid="${esc(r.id)}" aria-live="polite"></p>
          </div>`,
          )
          .join('')}
      </div>

      <div class="stack">
        <div><h3>나를 소개하는 두 줄 <span class="tag">선택</span></h3><p class="muted small">공개에 동의하면 배정 결과에서 팀원에게 소개 문장으로 보여요.</p></div>
        <div><label for="strength">잘하는 것 한 줄</label><input id="strength" type="text" maxlength="40" placeholder="예: 자료를 깔끔하게 정리해요" value="${esc(f.strength)}" /></div>
        <div><label for="wish">이번에 해 보고 싶은 것 한 줄</label><input id="wish" type="text" maxlength="40" placeholder="예: 발표를 처음 해 보고 싶어요" value="${esc(f.wish)}" /></div>
        <div class="check warn">
          <input type="checkbox" id="share" ${f.share ? 'checked' : ''} />
          <label for="share">위 두 줄을 <b>팀원에게 공개</b>하고, 소개 문장을 만드는 데 <b>AI(외부 서비스)</b>가 쓰이는 것에 동의해요. 체크하지 않으면 입력해도 팀원에게 보이지 않고 AI에도 전달되지 않아요. (하고 싶다/하기 싫다 선택은 어느 경우에도 AI에 전달되지 않아요.)</label>
        </div>
      </div>

      <div class="check">
        <input type="checkbox" id="random" ${f.randomConsent ? 'checked' : ''} />
        <label for="random"><b>(필수)</b> 하기 싫은 배정을 피할 수 없거나 조건이 같을 때, 무작위로 정해지는 것에 동의해요.</label>
      </div>
      <button type="button" class="btn" id="save-prefs">${f.saved ? '선호 다시 저장하기' : '선호 저장하기'}</button>
      <p class="muted small" id="save-note">${f.saved ? '저장되어 있어요. 배정 전까지 언제든 바꿀 수 있어요.' : ''}</p>
    </section>`;
  applyTraits();
}

function renderMembers() {
  const el = $app.querySelector('#s-members');
  const submitted = S.members.filter((m) => m.submitted).length;
  const missing = S.members.length - submitted;
  const creator = isCreator();
  el.innerHTML = `
    <section class="card stack">
      <div><h2>참여 현황</h2><p class="muted">선호를 낸 사람은 초록색이에요. (무엇을 골랐는지는 보이지 않아요.)</p></div>
      <div class="members">
        ${S.members
          .map((m) => `<span class="member ${m.submitted ? 'done' : ''} ${m.uid === store.uid ? 'me' : ''}">${esc(m.nickname)}${m.uid === store.uid ? ' (나)' : ''}${m.submitted ? ' ✓' : ''}</span>`)
          .join('')}
      </div>
      ${
        creator && !assigned()
          ? `<div class="stack">
              ${missing > 0 && submitted > 0 ? `<p class="notice">아직 선호를 내지 않은 팀원이 ${missing}명 있어요. 그대로 배정하면 그 팀원은 모든 역할을 "상관없다"로 처리해요.</p>` : ''}
              ${submitted === 0 ? '<p class="muted small">한 명 이상 선호를 저장하면 배정할 수 있어요.</p>' : ''}
              <button type="button" class="btn" id="do-assign" ${S.busy || submitted === 0 ? 'disabled' : ''}>${
                S.busy ? '<span class="spinner"></span>배정하는 중…' : missing > 0 && S.confirmAssign ? `미제출 ${missing}명 포함해서 배정하기` : '배정하기'
              }</button>
            </div>`
          : ''
      }
      ${!creator && !assigned() ? '<p class="muted small">방장이 배정 버튼을 누르면 결과가 나와요.</p>' : ''}
    </section>`;
}

/** 내가 맡은 역할의 설명·할 일. 예전 결과에 내용이 없으면 방의 역할 정보로 채운다. */
function myDuties(r) {
  const mine = new Set(S.priv?.roleIds || []);
  return (r.roles || [])
    .filter((role) => mine.has(role.id))
    .map((role) => {
      const base = (S.room?.roles || []).find((x) => x.id === role.id) || {};
      return { id: role.id, name: role.name, desc: role.desc ?? base.desc ?? '', steps: role.steps ?? base.steps ?? {} };
    });
}

function dutyCardsHtml(r) {
  const duties = myDuties(r);
  if (!duties.length) return '';
  return `
    <section class="duties" aria-labelledby="h-duties">
      <h2 id="h-duties">내 역할 카드</h2>
      ${duties
        .map((d) => {
          const phases = PHASES.filter((ph) => (d.steps[ph.id] || []).length);
          return `
        <article class="duty">
          <header class="duty-head">
            <h3>${esc(d.name)}</h3>
            ${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
          </header>
          ${
            phases.length
              ? phases.map((ph) => `<div class="phase"><h4>${ph.label}</h4><ul class="plain">${d.steps[ph.id].map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')
              : '<p class="duty-empty">방장이 아직 이 역할의 할 일을 적지 않았어요. 팀에서 어떤 일을 하는 역할인지 먼저 이야기해 보세요.</p>'
          }
        </article>`;
        })
        .join('')}
    </section>`;
}

/** 결과 화면의 "내 역할 카드 보기" 버튼. 맡은 역할이 없으면 안내만. */
function cardButtonHtml(r) {
  const duties = myDuties(r);
  if (!duties.length) {
    return me() && S.priv ? '<p class="notice">이번에는 배정된 역할이 없어요. 팀에서 보조 역할을 함께 정해 보세요.</p>' : '';
  }
  return `<button type="button" class="btn big" id="go-card">내 역할 카드 보기 (${esc(duties.map((d) => d.name).join(', '))})</button>`;
}

/** 내 역할 카드 화면 */
function renderDuties() {
  const el = $app.querySelector('#s-duties');
  if (!assigned() || !S.result || S.view !== 'card') { el.innerHTML = ''; return; }
  const html = dutyCardsHtml(S.result);
  el.innerHTML = html || '<section class="card"><h2>내 역할 카드</h2><p class="muted" style="margin-top:6px">이번에는 배정된 역할이 없어요.</p></section>';
}

function renderResult() {
  const el = $app.querySelector('#s-result');
  const r = S.result;
  if (!assigned() || !r) { el.innerHTML = ''; return; }
  const myId = store.uid;
  const s = r.summary || {};
  const introEntries = Object.entries(r.lines || {});
  const aiNote = r.aiUsed
    ? '<p class="muted small" style="margin-top:8px">AI가 쓴 문장에는 표시가 붙어 있어요. 팀원이 직접 쓴 두 줄만 재료로 썼어요.</p>'
    : r.aiError && r.aiError !== 'no_key'
      ? '<p class="muted small" style="margin-top:8px">AI 문장을 만들지 못해 기본 문장으로 보여드려요.</p>'
      : '';
  el.innerHTML = `
    <section class="card stack">
      <div class="row between"><h2>배정 결과</h2><span class="badge done">${esc(r.round || 1)}차 배정</span></div>
      ${s.conflictCount > 0 ? `<p class="notice bad">"하기 싫다"로 표시한 배정이 ${esc(s.conflictCount)}건 남았어요. 가장 적게 만든 조합인데도 불가피했어요. 누구인지는 공개하지 않으니, 팀에서 역할을 한 번 같이 이야기해 보세요.</p>` : '<p class="notice info">"하기 싫다"로 표시한 배정은 없어요.</p>'}
      ${s.randomCount > 0 ? `<p class="notice">조건이 같은 조합이 여러 개여서 무작위로 정해진 배정이 ${esc(s.randomCount)}건 있어요.</p>` : ''}
      <div>
        ${r.roles
          .map(
            (role) => `
          <div class="role-card">
            <div><b>${esc(role.name)}</b> <span class="tag">${esc(role.need)}명</span><span class="tag">부담 ${esc(LOAD_LABEL[role.load])}</span></div>
            <div class="names">${role.members.length ? role.members.map((m) => `<span class="member ${m.uid === myId ? 'me' : ''}">${esc(m.nickname)}${m.uid === myId ? ' (나)' : ''}</span>`).join('') : '<span class="muted small">배정된 사람이 없어요</span>'}</div>
          </div>`,
          )
          .join('')}
      </div>
      ${r.unassigned?.length ? `<p class="notice">이번에 역할이 배정되지 않은 팀원: <b>${r.unassigned.map((u) => esc(u.nickname)).join(', ')}</b>. 팀에서 보조 역할을 함께 정해 보세요.</p>` : ''}
    </section>

    ${
      S.priv
        ? `<section class="card"><h2>나의 배정 이유 <span class="badge">나에게만 보여요</span></h2><ul class="lines">${(S.priv.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`
        : ''
    }

    ${cardButtonHtml(r)}

    ${
      introEntries.length
        ? `<section class="card"><h2>팀원 소개</h2><p class="muted small" style="margin-top:4px">공개에 동의한 팀원만 나와요.</p><div style="margin-top:10px">${introEntries
            .map(([, l]) => `<div class="intro">${l.ai ? '<span class="ai-tag">AI</span>' : ''}${esc(l.text)}</div>`)
            .join('')}</div>${aiNote}</section>`
        : ''
    }

    <section class="card">
      <details><summary style="cursor:pointer;font-weight:700">이 배정은 이런 규칙으로 정해졌어요</summary>
        <ol class="lines" style="padding-left:20px">${(s.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ol>
        <p class="muted small" style="margin-top:8px">배정 계산에는 AI를 쓰지 않아요. 같은 입력이면 같은 규칙이 적용돼요.</p>
      </details>
    </section>
    ${isCreator() ? '<div class="footer"><button type="button" class="btn line" id="do-reopen">선호 수정하고 다시 배정하기</button></div>' : ''}`;
}

/* ---------------- 이벤트 위임 ---------------- */
function attachDelegates() {
  const q = (id) => $app.querySelector(id);
  // 참여
  q('#s-join').addEventListener('click', async (e) => {
    if (!e.target.closest('#do-join')) return;
    const nickname = q('#join-nick').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) return toast('닉네임을 입력해 주세요.');
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
    if (e.target.classList.contains('r-step')) {
      r.stepsText = { ...stepsText(r), [e.target.dataset.phase]: e.target.value };
    }
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
      // 종류를 바꾸면, 비어 있거나 이전 기본 내용 그대로인 칸만 새 기본 내용으로 바꾼다. 직접 쓴 내용은 지우지 않는다.
      const oldT = templateFor(r.kind || kindFromName(r.name) || 'other');
      const cur = currentSteps(r);
      const isEmpty = !cur.start.length && !cur.during.length && !cur.end.length;
      const descPlain = !r.desc || r.desc === oldT.desc;
      const tasksPlain = isEmpty || JSON.stringify(cur) === JSON.stringify(oldT.steps);
      r.kind = e.target.value;
      const nt = templateFor(r.kind || kindFromName(r.name) || 'other');
      if (descPlain) r.desc = nt.desc;
      if (tasksPlain) { r.steps = nt.steps; r.stepsText = undefined; }
      S.rolesOpen.add(r.id);
      drawRolesEditor(rolesEl);
    }
  });
  rolesEl.addEventListener('click', async (e) => {
    const del = e.target.closest('.r-del');
    if (del) {
      S.rolesDraft.splice(+del.closest('.role-block').dataset.i, 1);
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-add')) {
      const used = new Set(S.rolesDraft.map((r) => r.id));
      let n = 1;
      while (used.has(`r${n}`)) n++;
      S.rolesDraft.push({ id: `r${n}`, name: '', need: 1, load: 2, kind: '', desc: '', steps: { start: [], during: [], end: [] } });
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-save')) {
      const clean = draftToRoles(S.rolesDraft);
      if (!clean.length) return toast('역할을 하나 이상 남겨 주세요.');
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
    if (!S.form) return;
    if (e.target.matches('input[type=radio][data-rid]')) {
      S.form.prefs[e.target.dataset.rid] = e.target.value;
      S.touched.add(e.target.dataset.rid); // 직접 고른 선택은 성향 제안이 덮어쓰지 않는다
      applyTraits();
    }
    if (e.target.id === 'share') S.form.share = e.target.checked;
    if (e.target.id === 'random') S.form.randomConsent = e.target.checked;
  });
  prefsEl.addEventListener('input', (e) => {
    if (!S.form) return;
    if (e.target.id === 'strength') S.form.strength = e.target.value;
    if (e.target.id === 'wish') S.form.wish = e.target.value;
  });
  prefsEl.addEventListener('click', async (e) => {
    const chip = e.target.closest('.trait');
    if (chip) {
      const id = chip.dataset.trait;
      if (S.traits.has(id)) S.traits.delete(id);
      else S.traits.add(id);
      applyTraits();
      return;
    }
    if (!e.target.closest('#save-prefs')) return;
    const f = S.form;
    if (!f.randomConsent) return toast('무작위 배정 동의(필수)에 체크해 주세요.');
    if (!f.share && (f.strength.trim() || f.wish.trim())) {
      toast('두 줄은 "공개 동의"를 체크해야 팀원에게 보여요. 지금은 저장만 되고 공개되지 않아요.');
    }
    const data = normalizePrefs(f, S.room.roles);
    e.target.closest('button').disabled = true;
    try {
      await store.savePrefs(S.code, data);
      f.saved = true;
      S.touched = new Set(S.room.roles.map((r) => r.id)); // 저장한 선택은 확정. 성향 칩은 저장하지 않으므로 닫는다.
      S.traits = new Set();
      S.prefsSig = '';
      renderPrefs();
      if (f.share || !(f.strength.trim() || f.wish.trim())) toast('선호를 저장했어요.');
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
    if (!e.target.closest('#do-assign') || S.busy) return;
    const missing = S.members.filter((m) => !m.submitted).length;
    if (missing > 0 && !S.confirmAssign) {
      S.confirmAssign = true;
      return renderMembers();
    }
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
  q('#s-result').addEventListener('click', async (e) => {
    if (e.target.closest('#go-card')) { location.hash = `#/room/${S.code}/card`; return; }
    if (!e.target.closest('#do-reopen')) return;
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
  const m = location.hash.match(/^#\/room\/([A-Za-z0-9]{6})(?:\/(roles|prefs|card))?$/);
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

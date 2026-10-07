import './style.css';
import { createStore } from './store.js';
import { normalizePrefs, normalizeRoles, LOAD_LABEL } from '../lib/roomService.js';

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
const home = { selected: new Map(TEMPLATES.slice(0, 4).map((t) => [t.name, t.load])), custom: [] };

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

/* ---------------- 홈 ---------------- */
function renderHome() {
  cleanup();
  const customList = home.custom.filter((n) => !TEMPLATES.some((t) => t.name === n));
  $app.innerHTML = `
    <div class="hero">
      ${modeBadge()}
      <h1 style="margin-top:8px">역할 정하기,<br /><b>눈치 보지 말고</b> 말해요</h1>
      <p>하고 싶은 역할과 부담스러운 역할을 다른 팀원에게는 보이지 않게 모으고, 정해진 규칙으로 배정해 드려요.</p>
    </div>

    <section class="card stack" aria-labelledby="h-create">
      <div><h2 id="h-create">방 만들기</h2><p class="muted">방을 만든 사람이 역할을 정하고, 팀원은 방 코드로 들어와요.</p></div>
      <div><label for="nick">내 닉네임</label><input id="nick" type="text" maxlength="12" placeholder="예: 정민" value="${esc(savedNick())}" autocomplete="off" /></div>
      <div>
        <label>필요한 역할 (나중에 고칠 수 있어요)</label>
        <div class="chips" id="role-chips">
          ${TEMPLATES.map((t) => `<button type="button" class="chip" data-role="${esc(t.name)}" aria-pressed="${home.selected.has(t.name)}">${esc(t.name)}</button>`).join('')}
          ${customList.map((n) => `<button type="button" class="chip" data-role="${esc(n)}" aria-pressed="${home.selected.has(n)}">${esc(n)}</button>`).join('')}
        </div>
      </div>
      <div class="row">
        <div class="grow"><input id="custom-role" type="text" maxlength="20" placeholder="직접 추가: 예) 발표 자료 검수" aria-label="직접 추가할 역할 이름" /></div>
        <button type="button" class="btn ghost" id="add-custom">추가</button>
      </div>
      <button type="button" class="btn" id="create" style="width:100%">방 만들기</button>
    </section>

    <section class="card stack" aria-labelledby="h-join">
      <div><h2 id="h-join">방 코드로 들어가기</h2><p class="muted">팀장에게 받은 6자리 코드를 넣어 주세요.</p></div>
      <div class="row">
        <div class="grow"><input id="join-code" class="code-input" type="text" maxlength="6" placeholder="ABC123" aria-label="방 코드" autocomplete="off" /></div>
        <button type="button" class="btn" id="join">들어가기</button>
      </div>
    </section>

    <section class="card">
      <h2>이렇게 정해져요</h2>
      <ol class="lines" style="padding-left:20px">
        <li>팀원이 각자 역할마다 <b>하고 싶다 / 상관없다 / 하기 싫다</b>를 골라요. 다른 팀원에게는 보이지 않아요.</li>
        <li>방장이 배정 버튼을 누르면 규칙에 따라 계산해요: 하기 싫은 배정 최소화 → 모두 역할 하나 이상 → 하고 싶다 최대화 → 부담도 균형 → 그래도 같으면 무작위.</li>
        <li>결과와 함께 <b>나에게만 보이는 배정 이유</b>가 나와요.</li>
      </ol>
    </section>`;

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
    renderHome();
    $app.querySelector('#nick').value = keep;
  };
  $app.querySelector('#add-custom').addEventListener('click', addCustom);
  $app.querySelector('#custom-role').addEventListener('keydown', (e) => e.key === 'Enter' && addCustom());
  $app.querySelector('#create').addEventListener('click', async (e) => {
    const nickname = $nick.value.replace(/\s+/g, ' ').trim().slice(0, 12);
    if (!nickname) return toast('닉네임을 입력해 주세요.');
    const roles = normalizeRoles([...home.selected].map(([name, load], i) => ({ id: `r${i + 1}`, name, need: 1, load })));
    if (!roles.length) return toast('역할을 하나 이상 골라 주세요.');
    e.target.disabled = true;
    try {
      saveNick(nickname);
      const code = await store.createRoom({ roles, nickname });
      location.hash = `#/room/${code}`;
    } catch (err) {
      console.error(err);
      toast(`방을 만들지 못했어요: ${err.message}`);
      e.target.disabled = false;
    }
  });
  const go = () => {
    const code = $app.querySelector('#join-code').value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return toast('방 코드는 영문 대문자와 숫자 6자리예요.');
    location.hash = `#/room/${code}`;
  };
  $app.querySelector('#join').addEventListener('click', go);
  $app.querySelector('#join-code').addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

/* ---------------- 방 ---------------- */
function roomShell(code) {
  $app.innerHTML = `
    <div class="row between" style="margin-top:4px">
      <button type="button" class="link" id="back">← 처음으로</button>
      ${modeBadge()}
    </div>
    <section class="card" aria-label="방 정보">
      <div class="muted small">방 코드</div>
      <div class="code-box"><span class="code" id="code-text">${esc(code)}</span>
        <button type="button" class="btn ghost small" id="copy-code">코드 복사</button>
        <button type="button" class="btn ghost small" id="copy-link">링크 복사</button>
      </div>
      <div id="s-status" style="margin-top:8px"></div>
    </section>
    <div id="s-join"></div>
    <div id="s-roles"></div>
    <div id="s-prefs"></div>
    <div id="s-members"></div>
    <div id="s-result"></div>`;
  $app.querySelector('#back').addEventListener('click', () => (location.hash = '#/'));
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

async function openRoom(code) {
  cleanup();
  S = { code, room: null, members: [], result: null, priv: null, rolesDraft: null, rolesSig: '', prefsSig: '', form: null, prefsLoaded: false, busy: false, confirmAssign: false, loaded: false };
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
  unsubs.push(store.subscribeRoom(code, (r) => { if (!S) return; S.room = r || S.room; renderAll(); }));
  unsubs.push(store.subscribeMembers(code, (m) => { if (!S) return; S.members = m; S.membersLoaded = true; renderAll(); }));
  unsubs.push(store.subscribeResult(code, (r) => { if (!S) return; S.result = r; renderAll(); }));
  unsubs.push(store.subscribePrivate(code, (p) => { if (!S) return; S.priv = p; renderAll(); }));
  attachDelegates();
  renderAll();
}

function renderAll() {
  if (!S || !S.loaded) return;
  // 배정이 끝나면 결과를 맨 위(방 정보 바로 아래)로 올린다
  const res = $app.querySelector('#s-result');
  const join = $app.querySelector('#s-join');
  if (assigned() && res && join && res.previousElementSibling !== join) join.after(res);
  if (!assigned() && res && res !== $app.lastElementChild) $app.appendChild(res);
  renderStatus();
  renderJoin();
  renderRoles();
  renderPrefs();
  renderMembers();
  renderResult();
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
          ${roles.map((r) => `<div><b>${esc(r.name)}</b> <span class="tag">${esc(r.need)}명</span><span class="tag">부담 ${esc(LOAD_LABEL[r.load] || '보통')}</span></div>`).join('')}
        </div>
        ${isCreator() ? '' : '<p class="muted small" style="margin-top:10px">역할은 방장이 정해요.</p>'}
      </section>`;
  }
}

function drawRolesEditor(el) {
  const d = S.rolesDraft;
  el.innerHTML = `
    <section class="card stack">
      <div><h2>역할 설정 <span class="badge">방장만</span></h2><p class="muted">필요 인원과 부담도를 정해 주세요. 부담도는 팀원끼리 고르게 나누는 데 쓰여요.</p></div>
      <div class="role-head"><span>역할 이름</span><span>필요 인원</span><span>부담도</span><span></span></div>
      ${d
        .map(
          (r, i) => `
        <div class="role-edit" data-i="${i}">
          <input type="text" class="r-name" maxlength="20" value="${esc(r.name)}" aria-label="역할 이름" />
          <select class="r-need" aria-label="필요 인원">${[1, 2, 3].map((n) => `<option value="${n}" ${r.need === n ? 'selected' : ''}>${n}명</option>`).join('')}</select>
          <select class="r-load" aria-label="부담도">${[1, 2, 3].map((n) => `<option value="${n}" ${r.load === n ? 'selected' : ''}>${LOAD_LABEL[n]}</option>`).join('')}</select>
          <button type="button" class="x r-del" aria-label="${esc(r.name)} 삭제">✕</button>
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

function blankForm() {
  const prefs = {};
  for (const r of S.room.roles) prefs[r.id] = 'ok';
  return { prefs, strength: '', wish: '', share: false, randomConsent: false };
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
  el.innerHTML = `
    <section class="card stack">
      <div><h2>내 선호 고르기</h2><p class="muted">다른 팀원에게는 보이지 않아요. 솔직하게 골라 주세요. 아무것도 고르지 않으면 "상관없다"로 처리해요.</p></div>
      <div>
        ${roles
          .map(
            (r) => `
          <div class="pref-item" role="group" aria-labelledby="pl-${esc(r.id)}">
            <div class="pref-title" id="pl-${esc(r.id)}">${esc(r.name)} <span class="tag">${esc(r.need)}명</span><span class="tag">부담 ${esc(LOAD_LABEL[r.load])}</span></div>
            <div class="seg">
              ${[['want', '하고 싶다'], ['ok', '상관없다'], ['avoid', '하기 싫다']]
                .map(([v, label]) => `<label><input type="radio" name="pref-${esc(r.id)}" value="${v}" data-rid="${esc(r.id)}" ${f.prefs[r.id] === v ? 'checked' : ''} /><span>${label}</span></label>`)
                .join('')}
            </div>
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
    } catch (err) {
      console.error(err);
      toast(`들어가지 못했어요: ${err.message}`);
      e.target.closest('button').disabled = false;
    }
  });
  // 역할 편집
  const rolesEl = q('#s-roles');
  rolesEl.addEventListener('input', (e) => {
    const row = e.target.closest('.role-edit');
    if (row && e.target.classList.contains('r-name')) S.rolesDraft[+row.dataset.i].name = e.target.value;
  });
  rolesEl.addEventListener('change', (e) => {
    const row = e.target.closest('.role-edit');
    if (!row) return;
    const r = S.rolesDraft[+row.dataset.i];
    if (e.target.classList.contains('r-need')) r.need = +e.target.value;
    if (e.target.classList.contains('r-load')) r.load = +e.target.value;
  });
  rolesEl.addEventListener('click', async (e) => {
    const del = e.target.closest('.r-del');
    if (del) {
      S.rolesDraft.splice(+del.closest('.role-edit').dataset.i, 1);
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-add')) {
      const used = new Set(S.rolesDraft.map((r) => r.id));
      let n = 1;
      while (used.has(`r${n}`)) n++;
      S.rolesDraft.push({ id: `r${n}`, name: '', need: 1, load: 2 });
      return drawRolesEditor(rolesEl);
    }
    if (e.target.closest('#r-save')) {
      const clean = normalizeRoles(S.rolesDraft);
      if (!clean.length) return toast('역할을 하나 이상 남겨 주세요.');
      e.target.closest('button').disabled = true;
      try {
        await store.updateRoles(S.code, clean);
        toast('역할을 저장했어요.');
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
    if (e.target.matches('input[type=radio][data-rid]')) S.form.prefs[e.target.dataset.rid] = e.target.value;
    if (e.target.id === 'share') S.form.share = e.target.checked;
    if (e.target.id === 'random') S.form.randomConsent = e.target.checked;
  });
  prefsEl.addEventListener('input', (e) => {
    if (!S.form) return;
    if (e.target.id === 'strength') S.form.strength = e.target.value;
    if (e.target.id === 'wish') S.form.wish = e.target.value;
  });
  prefsEl.addEventListener('click', async (e) => {
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
      S.prefsSig = '';
      renderPrefs();
      if (f.share || !(f.strength.trim() || f.wish.trim())) toast('선호를 저장했어요.');
    } catch (err) {
      console.error(err);
      toast(`저장하지 못했어요: ${err.message}`);
      const b = prefsEl.querySelector('#save-prefs');
      if (b) b.disabled = false;
    }
  });
  // 배정 / 다시 열기
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
  const m = location.hash.match(/^#\/room\/([A-Za-z0-9]{6})$/);
  if (m) await openRoom(m[1].toUpperCase());
  else renderHome();
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

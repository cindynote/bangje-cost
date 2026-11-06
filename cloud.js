/* 방제 원가계산기 · 현장 저장 (Supabase)
   SB_URL, SB_KEY는 Supabase 대시보드 → Project Settings → API 의
   Project URL 과 anon public key 입니다. anon key는 공개돼도 되는 키이고,
   자료 보호는 supabase/schema.sql 의 RLS 규칙이 맡습니다. */
const SB_URL = "https://fbenribwvmkzsxdutbcf.supabase.co";
const SB_KEY = "sb_publishable_YVIQp_bn9DehRBCPlBmApA_uF7ch-AI";

const CUR_KEY = "bangje-calc-cur";
const cloud = { sb: null, user: null, admin: false, sites: [], years: [], cur: null, status: "", msg: "", busy: false, confirmDel: null, ready: false };

function curGet() { try { return JSON.parse(localStorage.getItem(CUR_KEY) || "null"); } catch (e) { return null; } }
function curSet(v) { cloud.cur = v; try { v ? localStorage.setItem(CUR_KEY, JSON.stringify(v)) : localStorage.removeItem(CUR_KEY); } catch (e) {} }
function mergeState(o) {
  const d = defaults(); o = o || {};
  return Object.assign(d, o, { base: Object.assign(d.base, o.base || {}), diag: Object.assign(d.diag, o.diag || {}), info: Object.assign(d.info, o.info || {}) });
}
const clone = o => JSON.parse(JSON.stringify(o));
const fmtDate = s => { try { return new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
const yearData = y => { const r = cloud.years.find(x => x.year === Number(y)); return r ? r.data : null; };
const latestYear = () => cloud.years.length ? cloud.years[0].year : null;

function siteLine() {
  const el = document.getElementById("siteLine"); if (!el) return;
  if (cloud.cur) el.textContent = "현장: " + cloud.cur.name + (cloud.cur.base_year ? " · " + cloud.cur.base_year + "년 기준" : "") + " · " + (cloud.status || "저장됨");
  else if (cloud.user) el.textContent = "저장 안 된 작업이에요. 현장 탭에서 저장하세요.";
  else el.textContent = "로그인하지 않으면 이 브라우저에만 저장돼요.";
}
function rr() { render(); siteLine(); }

/* ----- 자동 저장 ----- */
let cloudT;
window.cloudSave = function () {
  if (!cloud.sb || !cloud.user || !cloud.cur) return;
  cloud.status = "저장 중…"; siteLine();
  clearTimeout(cloudT);
  cloudT = setTimeout(async () => {
    const name = String(S.info.name || "새 현장").slice(0, 100);
    const { error } = await cloud.sb.from("sites").update({ name, total: calc(S).c.grand, data: S }).eq("id", cloud.cur.id);
    if (error) cloud.status = "저장하지 못했어요. 인터넷 연결을 확인하세요.";
    else { cloud.cur.name = name; curSet(cloud.cur); cloud.status = "저장됨 " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); }
    siteLine();
  }, 1200);
};

/* ----- 불러오기 ----- */
async function loadYears() {
  const { data } = await cloud.sb.from("base_years").select("year,data,note,updated_at").order("year", { ascending: false });
  cloud.years = data || [];
}
async function loadSites() {
  const { data, error } = await cloud.sb.from("sites").select("id,name,base_year,total,updated_at").order("updated_at", { ascending: false });
  if (!error) cloud.sites = data || [];
}
async function afterLogin() {
  const { data } = await cloud.sb.rpc("is_admin");
  cloud.admin = data === true;
  await loadSites();
  if (cloud.cur && !cloud.sites.some(s => s.id === cloud.cur.id)) curSet(null);
}

/* ----- 화면: 현장 탭 ----- */
function vSites() {
  if (!cloud.ready) return `<section class="panel"><div class="card"><strong>현장 저장</strong><p class="note">${SB_URL ? "저장 기능을 불러오는 중이에요." : "현장 저장 기능은 준비 중이에요. 지금은 입력값이 이 브라우저에만 저장돼요."}</p></div></section>`;
  if (!cloud.user) return `<section class="panel">
    <div class="card"><strong>로그인하고 현장별로 저장하기</strong>
      <p class="note">로그인하면 현장마다 원가계산서를 저장하고, 휴대폰과 PC에서 이어서 작업할 수 있어요. 로그인하지 않아도 계산과 엑셀 내보내기는 그대로 쓸 수 있어요.</p>
      <form id="authForm" class="grid" autocomplete="on">
        <label class="f" for="lgEmail">이메일<input id="lgEmail" type="email" autocomplete="email" required></label>
        <label class="f" for="lgPw">비밀번호 (6자 이상)<input id="lgPw" type="password" autocomplete="current-password" minlength="6" required></label>
      </form>
      <div class="actions"><button class="btn primary" data-act="login" ${cloud.busy ? "disabled" : ""}>로그인</button><button class="btn" data-act="signup" ${cloud.busy ? "disabled" : ""}>회원가입</button></div>
      <p class="msg" id="authMsg">${esc(cloud.msg)}</p>
    </div>
    <div class="card"><strong>저장되는 정보</strong>
      <p class="note">가입할 때 이메일 주소만 받아요. 현장 자료는 본인 계정에서만 보이고 다른 사용자는 볼 수 없어요. 서비스 운영자는 데이터베이스 관리 화면에서 자료에 접근할 수 있으니, 개인 연락처 같은 민감한 정보는 넣지 마세요.</p></div>
  </section>`;
  const yOpts = cloud.years.map(y => `<option value="${y.year}">${y.year}년 기준</option>`).join("") || `<option value="">기본값</option>`;
  return `<section class="panel">
    <div class="card"><div class="card-h"><span class="note">${esc(cloud.user.email || "")}${cloud.admin ? ' <span class="pill ok">운영자</span>' : ""}</span><button class="btn" data-act="logout">로그아웃</button></div></div>
    <div class="card"><strong>새 현장</strong>
      <div class="grid"><label class="f" for="newYear">기준연도<select id="newYear">${yOpts}</select></label></div>
      <div class="actions"><button class="btn primary" data-act="new" ${cloud.busy ? "disabled" : ""}>빈 현장 만들기</button><button class="btn" data-act="saveas" ${cloud.busy ? "disabled" : ""}>지금 화면 내용을 새 현장으로 저장</button></div>
      <p class="msg">${esc(cloud.msg)}</p></div>
    <h2>내 현장 ${cloud.sites.length ? `<span class="note">${cloud.sites.length}곳</span>` : ""}</h2>
    ${cloud.sites.length ? cloud.sites.map(s => {
      const isCur = cloud.cur && cloud.cur.id === s.id;
      const del = cloud.confirmDel === s.id
        ? `<span class="note">삭제할까요?</span><button class="btn primary" data-act="delyes" data-id="${s.id}">삭제</button><button class="btn" data-act="delno">취소</button>`
        : `<button class="btn" data-act="del" data-id="${s.id}">삭제</button>`;
      return `<div class="card site${isCur ? " cur" : ""}">
        <div><strong>${esc(s.name)}</strong> ${isCur ? '<span class="pill ok">작업 중</span>' : ""}<div class="meta">${s.base_year ? s.base_year + "년 기준 · " : ""}${fmtDate(s.updated_at)} 수정</div></div>
        <div class="amt">${won(s.total)}원</div>
        <div class="acts">${isCur ? "" : `<button class="btn primary" data-act="open" data-id="${s.id}">열기</button>`}<button class="btn" data-act="dup" data-id="${s.id}">복제</button>${del}</div>
      </div>`;
    }).join("") : `<div class="card"><p class="note">아직 저장한 현장이 없어요. 위에서 빈 현장을 만들거나, 지금 입력한 내용을 새 현장으로 저장하세요.</p></div>`}
  </section>`;
}

/* ----- 화면: 기준 탭에 붙는 연도별 기준 ----- */
function vYears() {
  if (!cloud.ready || !cloud.years.length) return "";
  const cy = cloud.cur && cloud.cur.base_year;
  const newer = cy && latestYear() > cy;
  return `<div class="card"><strong>연도별 기준</strong>
    <p class="note">${cloud.cur ? `이 현장은 <b>${cy ? cy + "년" : "지정 안 된"}</b> 기준값을 쓰고 있어요.` : "기준연도를 고르면 노임·품·요율이 그해 값으로 바뀌어요."}${newer ? ` ${latestYear()}년 기준이 새로 나와 있어요.` : ""}</p>
    <div class="actions"><select id="applyYear" style="width:auto">${cloud.years.map(y => `<option value="${y.year}">${y.year}년 기준</option>`).join("")}</select><button class="btn" data-act="applyyear">이 연도 기준값 불러오기</button></div>
    ${cloud.admin ? `<details><summary>운영자: 지금 기준값을 연도 기준으로 게시</summary>
      <div class="grid"><label class="f" for="pubYear">연도<input id="pubYear" type="number" inputmode="numeric" value="${latestYear() || new Date().getFullYear()}"></label><label class="f" for="pubNote">출처 메모<input id="pubNote" type="text" value=""></label></div>
      <div class="actions"><button class="btn primary" data-act="publish">게시하기</button></div>
      <p class="note">같은 연도가 이미 있으면 덮어써요. 이미 저장된 현장의 값은 바뀌지 않아요.</p></details>` : ""}
    <p class="msg">${esc(cloud.msg)}</p></div>`;
}
VIEWS.sites = vSites;
const _vBase = VIEWS.base;
VIEWS.base = () => _vBase().replace('<section class="panel">', '<section class="panel">' + vYears());

/* ----- 동작 ----- */
const authErr = m => /Invalid login/i.test(m) ? "이메일 또는 비밀번호가 맞지 않아요."
  : /already registered|already exists/i.test(m) ? "이미 가입한 이메일이에요. 로그인하세요."
  : /Password should be/i.test(m) ? "비밀번호는 6자 이상으로 정해 주세요."
  : /Email not confirmed/i.test(m) ? "가입 확인 메일의 링크를 먼저 눌러 주세요."
  : /valid email|invalid format/i.test(m) ? "이메일 주소를 확인해 주세요."
  : "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

function freshState(year) {
  const d = defaults();
  d.info.name = "새 현장";
  d.trees = [{ loc: "", sp: "", type: "단목", n: "", s: [["", ""], ["", ""], ["", ""]] }];
  d.shrubs = [];
  d.chems = [{ name: "", kind: "", dil: "", size: "", price: "" }];
  const yd = yearData(year); if (yd) d.base = Object.assign(d.base, clone(yd), { scrap: 0 });
  return d;
}
async function insertSite(state, year) {
  const name = String(state.info.name || "새 현장").slice(0, 100);
  const { data, error } = await cloud.sb.from("sites").insert({ name, base_year: year || null, total: calc(state).c.grand, data: state }).select("id,name,base_year").single();
  if (error) throw error;
  return data;
}
async function act(a, id) {
  const sb = cloud.sb; cloud.msg = "";
  try {
    if (a === "login" || a === "signup") {
      const email = document.getElementById("lgEmail").value.trim(), password = document.getElementById("lgPw").value;
      if (!email || password.length < 6) { cloud.msg = "이메일과 6자 이상 비밀번호를 넣어 주세요."; return rr(); }
      cloud.busy = true; rr();
      const res = a === "login" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
      cloud.busy = false;
      if (res.error) { cloud.msg = authErr(res.error.message); return rr(); }
      if (a === "signup" && !res.data.session) { cloud.msg = "가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하세요."; return rr(); }
      return; // onAuthStateChange 가 화면을 갱신
    }
    if (a === "logout") { await sb.auth.signOut(); return; }
    if (a === "new" || a === "saveas") {
      const yearSel = document.getElementById("newYear"); const year = yearSel && yearSel.value ? Number(yearSel.value) : latestYear();
      cloud.busy = true; rr();
      const state = a === "new" ? freshState(year) : clone(S);
      const row = await insertSite(state, a === "new" ? year : ((cloud.cur && cloud.cur.base_year) || year));
      S = state; curSet(row); cloud.status = "저장됨"; save(); await loadSites();
      cloud.busy = false; tab = "trees"; try { localStorage.setItem(TABKEY, tab); } catch (e) {}
      return rr();
    }
    if (a === "open") {
      const { data, error } = await sb.from("sites").select("id,name,base_year,data").eq("id", id).single();
      if (error) throw error;
      S = mergeState(data.data); curSet({ id: data.id, name: data.name, base_year: data.base_year }); cloud.status = "저장됨";
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      tab = "trees"; try { localStorage.setItem(TABKEY, tab); } catch (e) {}
      return rr();
    }
    if (a === "dup") {
      const { data, error } = await sb.from("sites").select("name,base_year,data").eq("id", id).single();
      if (error) throw error;
      const st = mergeState(data.data); st.info.name = (data.name + " (복사)").slice(0, 100);
      await insertSite(st, data.base_year); await loadSites(); return rr();
    }
    if (a === "del") { cloud.confirmDel = id; return rr(); }
    if (a === "delno") { cloud.confirmDel = null; return rr(); }
    if (a === "delyes") {
      const { error } = await sb.from("sites").delete().eq("id", id);
      if (error) throw error;
      if (cloud.cur && cloud.cur.id === id) curSet(null);
      cloud.confirmDel = null; await loadSites(); return rr();
    }
    if (a === "applyyear") {
      const y = Number(document.getElementById("applyYear").value), yd = yearData(y);
      if (!yd) return;
      S.base = Object.assign(defaults().base, clone(yd), { scrap: S.base.scrap || 0 });
      if (cloud.cur && cloud.user) { cloud.cur.base_year = y; curSet(cloud.cur); await sb.from("sites").update({ base_year: y }).eq("id", cloud.cur.id); }
      cloud.msg = y + "년 기준값을 불러왔어요."; save(); return rr();
    }
    if (a === "publish") {
      const y = Number(document.getElementById("pubYear").value), note = document.getElementById("pubNote").value.trim();
      if (!(y >= 2020 && y <= 2100)) { cloud.msg = "연도를 확인해 주세요."; return rr(); }
      const data = clone(S.base); delete data.scrap;
      const { error } = await sb.from("base_years").upsert({ year: y, data, note: note || null });
      if (error) throw error;
      await loadYears(); cloud.msg = y + "년 기준을 게시했어요."; return rr();
    }
  } catch (e) {
    cloud.busy = false; cloud.msg = "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."; rr();
  }
}
app.addEventListener("click", e => { const t = e.target.closest("button[data-act]"); if (t) { e.preventDefault(); act(t.dataset.act, t.dataset.id); } });
app.addEventListener("submit", e => { e.preventDefault(); act("login"); });

/* ----- 시작 ----- */
(async () => {
  rr();
  if (!SB_URL || !SB_KEY || !window.supabase) return;
  try {
    cloud.sb = window.supabase.createClient(SB_URL, SB_KEY);
    const { data: { session } } = await cloud.sb.auth.getSession();
    cloud.user = session ? session.user : null;
    cloud.cur = curGet();
    await loadYears();
    if (cloud.user) await afterLogin(); else curSet(null);
    cloud.ready = true; rr();
    cloud.sb.auth.onAuthStateChange((ev, ses) => {
      const u = ses ? ses.user : null;
      if ((u && u.id) === (cloud.user && cloud.user.id)) return;
      cloud.user = u; cloud.msg = "";
      setTimeout(async () => {
        if (u) await afterLogin(); else { cloud.sites = []; cloud.admin = false; curSet(null); }
        rr();
      }, 0);
    });
  } catch (e) { cloud.ready = false; rr(); }
})();

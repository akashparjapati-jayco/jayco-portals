const firebaseConfig = {
  apiKey: "AIzaSyCV_iL9c59t4f70ZCF-moqPbGzUH6Yv-iA", authDomain: "jayco-po-management.firebaseapp.com",
  projectId: "jayco-po-management", storageBucket: "jayco-po-management.firebasestorage.app",
  messagingSenderId: "116018254897", appId: "1:116018254897:web:63b37aed6fa5ccef8b7110"
};
const STAFF_EMAIL = "staff@jayco-po-management.local";

/* ---------- Plummer-block routing: the stages every item passes through ---------- */
const STAGES = [
  {k:'pattern',  n:'Pattern / Drawing',      c:'#7c5cff'},
  {k:'casting',  n:'Casting',                c:'#c27803'},
  {k:'fettling', n:'Fettling & Shot-blast',  c:'#d9622b'},
  {k:'machining',n:'Machining',              c:'#2F6FED'},
  {k:'inspection',n:'Inspection (QC)',       c:'#0e9aa7'},
  {k:'painting', n:'Painting',               c:'#c0201c'},
  {k:'packing',  n:'Assembly & Packing',     c:'#6b7a1f'},
  {k:'ready',    n:'Ready to Dispatch',      c:'#1a8f4c'}
];
const DEFAULT_OPS = ['Base — face & bottom milling','Cap — face milling','Bore boring','Seal groove / recess','Drilling & tapping','Assembly & trial'];
const DEFAULT_MATS = [{n:'Cast Iron', rate:75}, {n:'FG 260', rate:85}, {n:'Cast Steel', rate:125}, {n:'SG Iron', rate:100}];
const DEFAULT_SET = {admins: [], mats: DEFAULT_MATS, rejPct:5, ovhPct:10, marginPct:15, machLossPct:8, boughtMarginPct:15, freightPct:2, ops: DEFAULT_OPS};
const matList = () => (SET.mats && SET.mats.length ? SET.mats : DEFAULT_MATS);
const matRate = n => { const m = matList().find(x => x.n === n); return m ? num(m.rate) : 0; };
// price-list / PO material text → one of our three casting materials
function normMat(t){ t = String(t || '').toLowerCase(); if(/fg\s?260/.test(t)) return 'FG 260'; if(/s\.?\s?g|ductile|spheroidal/.test(t)) return 'SG Iron'; if(/steel/.test(t)) return 'Cast Steel'; return 'Cast Iron'; }
const materialOf = code => { const r = RATES.find(x => String(x.itemCode).toLowerCase() === String(code).toLowerCase()), i = ITEMS_PO.find(x => String(x.itemCode).toLowerCase() === String(code).toLowerCase()); return normMat((r && r.material) || (i && i.material)); };

let started = false, PARTS = {}, CUSTS = [], DOCS = [], SET_READY = false;
const ERP_MODE = window.ERP_MODE || 'admin';   // 'admin' = full ERP (admins only) · 'entry' = Entry Desk page for staff
const setN = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
let db, USER=null, PO=[], ITEMS_PO=[], STG={}, DESP=[], RATES=[], LEADS=[], QUOTES=[], COST={}, SET={...DEFAULT_SET}, ROUTE='dashboard';
const $ = (s, r=document) => r.querySelector(s), $$ = (s, r=document) => [...r.querySelectorAll(s)];
const jsq = v => JSON.stringify(String(v)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '\\u003c');   // safe inside onclick="…"
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const inr = v => '₹' + num(v).toLocaleString('en-IN', {maximumFractionDigits:2});
const toDate = t => !t ? null : t.toDate ? t.toDate() : new Date(t);
const fmtD = t => { const d = toDate(t); return d && !isNaN(d) ? d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'; };
const landed = p => num(p.price) * (1 + (num(SET.boughtMarginPct) + num(SET.freightPct)) / 100);
const costKey = c => String(c || '').trim().replace(/[\/\s]+/g, '_');
const me = () => (USER && USER.email) || 'staff';
function toast(m){ const t=$('#toast'); t.textContent=m; t.style.display='block'; clearTimeout(toast.t); toast.t=setTimeout(()=>t.style.display='none',2800); }

/* ---------- login ---------- */
$('#lgEmail').value = localStorage.getItem('crm_email') || STAFF_EMAIL;
firebase.initializeApp(firebaseConfig); db = firebase.firestore();
$('#lgBtn').onclick = () => {
  $('#lgErr').textContent = '';
  firebase.auth().signInWithEmailAndPassword($('#lgEmail').value.trim(), $('#lgPwd').value)
    .then(() => { localStorage.setItem('crm_email', $('#lgEmail').value.trim()); prodSignIn($('#lgPwd').value).catch(() => {}); })
    .catch(e => $('#lgErr').textContent = /password|credential|user-not-found/.test(e.code || '') ? 'Incorrect email or password.' : e.message);
};
$('#lgPwd').addEventListener('keydown', e => { if(e.key === 'Enter') $('#lgBtn').click(); });
$('#lgOut').onclick = () => firebase.auth().signOut();
firebase.auth().onAuthStateChanged(u => {
  USER = u; $('#login').style.display = u ? 'none' : 'flex'; $('#app').style.display = u ? (ERP_MODE !== 'admin' ? 'block' : 'grid') : 'none';
  if(u && $('#eUser')) $('#eUser').textContent = u.email;
  if(u) start();
});

async function start(){
  if(started) return; started = true;
  if(ERP_MODE !== 'entry') setTimeout(() => { autoSync(); setInterval(autoSync, 5 * 60000); }, 4000);
  const snap = (col, fn, order) => (order ? db.collection(col).orderBy(order, 'desc') : db.collection(col)).onSnapshot(s => { fn(s.docs.map(d => ({id:d.id, ...d.data()}))); bump(); render(); }, e => console.warn(col, e.message));
  snap('purchaseOrders', r => PO = r);
  snap('poItems', r => ITEMS_PO = r);
  snap('despatches', r => DESP = r);
  snap('erp_itemStages', r => { STG = {}; r.forEach(x => STG[x.id] = x); });
  snap('erp_costing', r => { COST = {}; r.forEach(x => COST[x.id] = x); });
  snap('customers', r => CUSTS = r);
  snap('erp_documents', r => DOCS = r);
  snap('erp_parts', r => { PARTS = {}; r.forEach(x => PARTS[x.id] = x); });
  snap('crm_rates', r => RATES = r);
  snap('crm_leads', r => LEADS = r);
  snap('crm_quotes', r => QUOTES = r);
  db.collection('erp_settings').doc('main').onSnapshot(d => { SET = {...DEFAULT_SET, ...(d.exists ? d.data() : {})}; SET_READY = true; bump(); render(); }, e => { SET_READY = true; render(); });
}

/* ---------- derived data ---------- */
// Pieces of one PO line in each stage. Dispatched comes from PO Management's dispatch entry (single source of truth).
function itemState(it){
  ensureIdx(); if(_memo[it.id]) return _memo[it.id];
  const st = (STG[it.id] && STG[it.id].stageQty) || {};
  const ordered = num(it.orderedQty), desp = num(it.despatchedQty), open = Math.max(0, ordered - desp);
  const q = {}; STAGES.forEach(s => q[s.k] = Math.max(0, num(st[s.k])));
  // if PO Management dispatched pieces that were still sitting in a stage, trim from the most advanced stage backwards
  let excess = STAGES.reduce((a, s) => a + q[s.k], 0) - open;
  for(let i = STAGES.length - 1; i >= 0 && excess > 0; i--){ const t = Math.min(q[STAGES[i].k], excess); q[STAGES[i].k] -= t; excess -= t; }
  const inProc = STAGES.reduce((a, s) => a + q[s.k], 0);
  return (_memo[it.id] = {q, ordered, desp, open, inProc, notStarted: Math.max(0, open - inProc), scrap: num(STG[it.id] && STG[it.id].scrapQty)});
}
function furthest(it){ const s = itemState(it); for(let i = STAGES.length - 1; i >= 0; i--) if(s.q[STAGES[i].k] > 0) return STAGES[i]; return null; }
function poStatus(items){
  const sts = items.map(itemState), ord = sts.reduce((a, s) => a + s.ordered, 0), desp = sts.reduce((a, s) => a + s.desp, 0);
  const inProc = sts.reduce((a, s) => a + s.inProc, 0), ready = sts.reduce((a, s) => a + s.q.ready, 0);
  let label = 'Not started', cls = '';
  if(ord > 0 && desp >= ord) { label = 'Dispatched'; cls = 'ok'; }
  else if(desp > 0) { label = 'Part dispatched'; cls = 'blue'; }
  else if(ready > 0 && ready >= ord) { label = 'Ready'; cls = 'ok'; }
  else if(inProc > 0) { label = 'In production'; cls = 'warn'; }
  return {label, cls, ord, desp, inProc, ready, open: ord - desp};
}
// data is indexed once per change instead of scanned for every row (was O(orders × lines) on every render)
let DV = 0, _idxV = -1, _byPo = {}, _memo = {};
const bump = () => { DV++; };
function ensureIdx(){ if(_idxV === DV) return; _idxV = DV; _byPo = {}; _memo = {}; ITEMS_PO.forEach(i => (_byPo[i.poId] = _byPo[i.poId] || []).push(i)); }
const itemsOfPo = po => { ensureIdx(); return _byPo[po.id] || []; };
const rateOf = code => { const r = RATES.find(x => String(x.itemCode).toLowerCase() === String(code).toLowerCase()); return r ? num(r.rate) : 0; };
function costOf(code){
  const c = COST[costKey(code)]; if(!c) return null;
  const casting = num(c.castWt) * num(c.castRate) * (1 + num(c.rejPct) / 100);
  const mach = (c.ops || []).reduce((a, o) => a + num(o.cost), 0);
  const bought = (c.bought || []).reduce((a, b) => a + num(b.qty) * num(b.rate), 0);
  const sub = casting + mach + bought + num(c.paint) + num(c.packing) + num(c.freight);
  const ovh = sub * num(c.ovhPct) / 100;
  const total = sub + ovh, mp = c.marginPct === '' || c.marginPct == null ? num(SET.marginPct) : num(c.marginPct);
  return {casting, mach, bought, paint: num(c.paint), packing: num(c.packing), freight: num(c.freight), sub, ovh, total, marginPct: mp, suggested: total * (1 + mp / 100), finishedWt: num(c.castWt) * (1 - num(SET.machLossPct) / 100)};
}
const lateDays = po => { const d = toDate(po.deliveryDate); if(!d) return 0; return Math.floor((new Date().setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 864e5); };

/* ---------- routing ---------- */

function go(h){ location.hash = h; }
window.addEventListener('hashchange', () => doRender());
let _rt = null;
function render(){ clearTimeout(_rt); _rt = setTimeout(doRender, 60); }   // many snapshots arrive at once on load — draw once
function doRender(){
  if(!USER) return;
  const a = document.activeElement, keep = a && a.id && $('#view') && $('#view').contains(a) && a.tagName === 'INPUT' ? {id: a.id, s: a.selectionStart, e: a.selectionEnd} : null;
  renderNow();
  if(keep){ const n = document.getElementById(keep.id); if(n){ n.focus(); try{ n.setSelectionRange(keep.s, keep.e); }catch(e){} } }
}
/* ERP-only lock: the full ERP asks for its own password once per browser session, on top of the shared staff sign-in.
   Only a SHA-256 fingerprint is kept here; the Entry Desk and Shop-Floor Board pages are not affected. */
const ERP_LOCK_HASH = '949670fb2aa263e16adcd2fa77c558faa64fad0d8ee12997c3ddeeb454f67d65';
const erpUnlocked = () => { try{ return sessionStorage.getItem('erp_unlocked') === ERP_LOCK_HASH; }catch(e){ return false; } };
async function sha256hex(t){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function showErpLock(){
  if(document.getElementById('erpLock')) return;
  const d = document.createElement('div'); d.id = 'erpLock';
  d.innerHTML = `<div class="box"><div class="lk">🔒</div><h2>Jayco ERP</h2><div class="hint" style="margin-bottom:16px">Admin area — enter the ERP password</div>
    <input id="erpPwd" type="password" autocomplete="off" placeholder="ERP password"><div id="erpErr" style="color:var(--crit);font-size:12.5px;min-height:18px;margin-top:8px"></div>
    <button class="btn pri" id="erpGo" style="width:100%;margin-top:6px">Unlock ERP</button>
    <div style="display:flex;justify-content:space-between;margin-top:14px"><a class="hint" href="index.html">← All portals</a><a class="hint" href="#" onclick="firebase.auth().signOut();return false">Sign out</a></div></div>`;
  document.body.appendChild(d);
  const go = async () => { const ok = (await sha256hex('jayco-erp|' + $('#erpPwd').value)) === ERP_LOCK_HASH;
    if(ok){ try{ sessionStorage.setItem('erp_unlocked', ERP_LOCK_HASH); }catch(e){} d.remove(); doRender(); } else { $('#erpErr').textContent = 'Incorrect ERP password.'; $('#erpPwd').value = ''; $('#erpPwd').focus(); } };
  $('#erpGo').onclick = go; $('#erpPwd').addEventListener('keydown', e => { if(e.key === 'Enter') go(); }); setTimeout(() => $('#erpPwd').focus(), 50);
}
function renderNow(){
  if(!USER) return;
  if(ERP_MODE === 'admin' && !erpUnlocked()){ showErpLock(); return; }
  const h = (location.hash || '#dashboard').slice(1); let [r, arg] = h.split('/');
  if(ERP_MODE === 'entry') r = 'entry';
  else if(ERP_MODE === 'board') r = r === 'order' ? 'order' : 'wip';   // Shop-floor Board page (also shown inside PO Management)
  else {   // the full ERP is for admins only; everyone else is sent to the Entry Desk
    if(!SET_READY){ $('#ttl').textContent = ''; $('#view').innerHTML = '<div class="empty">Loading…</div>'; return; }
    const adm = (SET.admins || []).map(x => String(x).toLowerCase());
    if(adm.length && !adm.includes(String(me()).toLowerCase())){
      $('#ttl').textContent = 'Admins only'; $('#topr').innerHTML = ''; $('aside').style.visibility = 'hidden';
      $('#view').innerHTML = `<div class="card"><div class="card-b"><h3 style="margin-bottom:8px">This ERP is for admins</h3><p>You are signed in as <b>${esc(me())}</b>, which is not on the ERP admin list.</p>
        <p>To enter invoices, bills and casting challans, use the <b>Entry Desk</b>.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn pri" href="entry-desk.html" style="text-decoration:none">Open Entry Desk →</a><button class="btn" onclick="firebase.auth().signOut()">Sign in as admin</button><a class="btn" href="index.html" style="text-decoration:none">All portals</a></div></div></div>`;
      return;
    }
    $('aside').style.visibility = '';
  }
  ROUTE = r;
  $$('aside a[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === r || (r === 'order' && a.dataset.nav === 'orders')));
  setN('nOrders', PO.filter(p => poStatus(itemsOfPo(p)).open > 0).length);
  setN('nWip', ITEMS_PO.reduce((a, i) => a + itemState(i).inProc, 0));
  $('#topr').innerHTML = '';
  if($('#sub2')) $('#sub2').textContent = new Date().toLocaleDateString('en-IN', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  setN('nOut', OUT.state === 'ok' ? (OUT.list.filter(x => overdueOf(x) > 0.5).length || '') : '');
  setN('nPay', VEN.state === 'ok' ? (venRows().filter(r => r.overdue > 0.5).length || '') : '');
  setN('nParts', Object.keys(PARTS).length || '');
  ({dashboard:vDash, orders:vOrders, order:vOrder, wip:vWip, moves:vMoves, entry:vEntry, outstanding:vOutstanding, payables:vPayables, customers:vCustomers, costing:vCosting, parts:vParts, settings:vSettings}[r] || vDash)(decodeURIComponent(arg || ''));
}
$$('aside a[data-nav]').forEach(a => a.onclick = () => go(a.dataset.nav));

/* ---------- outstanding payments (receivables, read from the Customer Portal) ---------- */
let OUT = {state: '', list: [], at: 0}, OUT_BY_CUST = {}, OUT_BY_KEY = {};
const inrC = v => { v = num(v); const sg = v < 0 ? '−' : '', a = Math.abs(v); return sg + (a >= 1e7 ? '₹' + (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (a / 1e5).toFixed(2) + ' L' : '₹' + Math.round(a).toLocaleString('en-IN')); };
const inr0 = v => '₹' + Math.round(num(v)).toLocaleString('en-IN');
const overdueOf = r => num(r.b0_30) + num(r.b31_60) + num(r.b61_90) + num(r.b90plus);
const over60 = r => num(r.b61_90) + num(r.b90plus);
async function cmsConfig(){
  if(CMS.cfg) return CMS.cfg;
  const d = await db.collection('crm_settings').doc('main').get(), m = d.exists ? d.data() : {};
  if(m.cmsUrl && m.cmsToken) CMS.cfg = {url: m.cmsUrl, token: m.cmsToken}; return CMS.cfg || null;
}
async function loadOut(force){
  if(OUT.state === 'loading') return; if(!force && OUT.state === 'ok' && Date.now() - OUT.at < 300000) return;
  OUT.state = 'loading'; render();
  try{
    if(force) CMS.cfg = null;   // re-read the saved Customer Portal address/token
    if(!(await cmsConfig())){ OUT.state = 'noconfig'; render(); return; }
    OUT.list = (await cmsApi('getOutstanding')) || []; OUT.at = Date.now(); OUT.state = 'ok';
    OUT_BY_CUST = {}; OUT_BY_KEY = {}; OUT.list.forEach(r => { OUT_BY_CUST[String(r.custId)] = r; const k = nameKey(r.name); if(k && !OUT_BY_KEY[k]) OUT_BY_KEY[k] = r; });
  }catch(e){ OUT.state = 'error:' + e.message + (CMS.cfg ? ' — the ERP used the token saved in Sales settings (' + String(CMS.cfg.token).length + ' characters)' + (/unauthor/i.test(e.message) ? '. It must be the same ' + 'as the AUTH_TOKEN script property: save the new token in Sales → Settings & Setup, then press Try again.' : '') : ''); }
  render();
}
const ensureOut = () => { if(OUT.state === '' || (OUT.state === 'ok' && Date.now() - OUT.at > 300000)) loadOut(); };
function dueFor(custId, name){   // outstanding row for an ERP customer: by Customer Portal link first, then by normalised name
  if(OUT.state !== 'ok') return null;
  const c = CUSTS.find(x => x.id === custId); if(c && c.cmsId && OUT_BY_CUST[String(c.cmsId)]) return OUT_BY_CUST[String(c.cmsId)];
  return OUT_BY_KEY[nameKey(name)] || null;
}
function outTotals(){
  const L = OUT.list, sum = f => L.reduce((a, r) => a + num(f(r)), 0);
  return {net: sum(r => r.total), overdue: sum(overdueOf), advance: sum(r => r.advance), d90: sum(r => r.b90plus), n: L.filter(r => num(r.total) > 0.5).length, nOver: L.filter(r => overdueOf(r) > 0.5).length,
    b: {up: sum(r => r.upcoming), b0: sum(r => r.b0_30), b31: sum(r => r.b31_60), b61: sum(r => r.b61_90), b90: sum(r => r.b90plus)}};
}
const AGE = [['Not yet due', '#60A5FA'], ['0–30 days', '#FBBF24'], ['31–60 days', '#F97316'], ['61–90 days', '#EF4444'], ['90+ days', '#7F1D1D']];
function ageBar(b){
  const v = [b.up, b.b0, b.b31, b.b61, b.b90], t = v.reduce((a, x) => a + num(x), 0) || 1;
  return `<div class="seg">${v.map((x, i) => `<i title="${AGE[i][0]}: ${inr0(x)}" style="width:${num(x) / t * 100}%;background:${AGE[i][1]}"></i>`).join('')}</div>
  <div class="legend">${v.map((x, i) => `<span><em style="background:${AGE[i][1]}"></em>${AGE[i][0]} <b>${inrC(x)}</b></span>`).join('')}</div>`;
}
function outMessage(){
  if(OUT.state === '' || OUT.state === 'loading') return '<div class="empty">Loading outstanding payments from the Customer Portal…</div>';
  if(OUT.state === 'noconfig') return `<div class="card-b"><b>The Customer Portal is not connected.</b><p class="hint">Open <a href="sales-crm.html#settings">Sales → Settings &amp; Setup</a> and fill in <i>Customer Portal link</i> (Apps Script URL and token).</p></div>`;
  if(OUT.state.startsWith('error:')) return `<div class="card-b" style="color:var(--crit)"><b>Could not read outstanding payments.</b><p>${esc(OUT.state.slice(6))}</p><button class="btn sm" onclick="loadOut(true)">Try again</button></div>`;
  return '';
}
function moneyCard(){
  ensureOut();
  const head = `<div class="card-h"><h3>Money To Collect</h3><span class="hint">from the Customer Portal${OUT.state === 'ok' ? ' · updated ' + new Date(OUT.at).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) : ''}</span><a class="btn sm" href="#outstanding" style="margin-left:auto;text-decoration:none">All outstanding →</a></div>`;
  if(OUT.state !== 'ok') return `<div class="card">${head}${outMessage()}</div>`;
  const T = outTotals(), top = OUT.list.slice().sort((a, b) => num(b.total) - num(a.total)).slice(0, 5);
  return `<div class="card">${head}<div class="card-b"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:28px">
    <div><div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:16px">
      <div><div class="hint">Outstanding</div><div style="font-size:30px;font-weight:700;font-family:var(--font)">${inrC(T.net)}</div><div class="hint">${T.n} customers</div></div>
      <div><div class="hint">Overdue</div><div style="font-size:30px;font-weight:700;font-family:var(--font);color:var(--crit)">${inrC(T.overdue)}</div><div class="hint">${T.nOver} customers</div></div>
      <div><div class="hint">Over 90 days</div><div style="font-size:30px;font-weight:700;font-family:var(--font);color:#7F1D1D">${inrC(T.d90)}</div></div></div>
      ${ageBar(T.b)}</div>
    <div><div class="hint" style="margin-bottom:4px">Top 5 customers by outstanding</div>${top.map(r => `<div class="debt" onclick="custDue(${jsq(r.custId)})"><span class="nm">${esc(r.name)}</span><span class="amt">${inrC(r.total)}</span><span class="hint">${overdueOf(r) > 0 ? '<b style="color:var(--crit)">' + inrC(overdueOf(r)) + ' overdue</b>' : 'not yet due'}</span><span class="hint" style="text-align:right">${num(r.b90plus) > 0 ? inrC(r.b90plus) + ' over 90 d' : ''}</span></div>`).join('')}</div>
  </div></div></div>`;
}
let OQ2 = '', OFLT = 'all', OSORT = 'total';
function vOutstanding(){
  $('#ttl').textContent = 'Outstanding Payments';
  $('#topr').innerHTML = `<button class="btn" onclick="loadOut(true)">↻ Refresh</button> <a class="btn" href="customer-portal.html" style="text-decoration:none">Customer Portal →</a>`;
  ensureOut();
  if(OUT.state !== 'ok'){ $('#view').innerHTML = `<div class="card">${outMessage()}</div>`; return; }
  const T = outTotals();
  $('#view').innerHTML = `
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat" style="--c:#2563EB"><div class="k">Total outstanding</div><div class="v">${inrC(T.net)}</div><div class="n">${T.n} customers owe money (after advances)</div></div>
    <div class="stat" style="--c:#B91C1C"><div class="k">Overdue</div><div class="v" style="color:var(--crit)">${inrC(T.overdue)}</div><div class="n">${T.nOver} customers past due date</div></div>
    <div class="stat" style="--c:#7F1D1D"><div class="k">Over 90 days</div><div class="v">${inrC(T.d90)}</div><div class="n">needs follow-up now</div></div>
    <div class="stat" style="--c:#15803D"><div class="k">Advances received</div><div class="v">${inrC(T.advance)}</div><div class="n">payments not yet matched to bills</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Ageing of what is owed</h3></div><div class="card-b">${ageBar(T.b)}</div></div>
  <div class="card"><div class="card-h"><input id="oq2" placeholder="Search customer…" value="${esc(OQ2)}" style="max-width:260px">
    <select id="oflt" style="max-width:190px">${[['all', 'All customers'], ['overdue', 'Overdue only'], ['d60', 'Over 60 days'], ['limit', 'Over credit limit']].map(o => `<option value="${o[0]}" ${OFLT === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    <select id="osort" style="max-width:190px">${[['total', 'Largest outstanding'], ['overdue', 'Largest overdue'], ['b90plus', 'Oldest (90+ days)'], ['name', 'Name A–Z']].map(o => `<option value="${o[0]}" ${OSORT === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><div class="tw" id="obody2"></div></div>`;
  $('#oq2').oninput = e => { OQ2 = e.target.value; drawOut(); }; $('#oflt').onchange = e => { OFLT = e.target.value; drawOut(); }; $('#osort').onchange = e => { OSORT = e.target.value; drawOut(); };
  drawOut();
}
function openOrdersFor(r){
  const ids = new Set(CUSTS.filter(c => String(c.cmsId) === String(r.custId) || nameKey(c.name) === nameKey(r.name)).map(c => c.id));
  return PO.filter(p => ids.has(p.customerId) && poStatus(itemsOfPo(p)).open > 0);
}
function drawOut(){
  const q = OQ2.toLowerCase();
  let L = OUT.list.filter(r => (!q || (r.name + ' ' + (r.gstin || '')).toLowerCase().includes(q)) &&
    (OFLT === 'all' || (OFLT === 'overdue' && overdueOf(r) > 0.5) || (OFLT === 'd60' && over60(r) > 0.5) || (OFLT === 'limit' && num(r.creditLimit) > 0 && num(r.total) > num(r.creditLimit))));
  const key = {total: r => -num(r.total), overdue: r => -overdueOf(r), b90plus: r => -num(r.b90plus)}[OSORT];
  L = key ? L.sort((a, b) => key(a) - key(b)) : L.sort((a, b) => String(a.name).localeCompare(b.name));
  const cell = v => num(v) > 0.5 ? inr0(v) : '<span class="hint">·</span>';
  $('#obody2').innerHTML = L.length ? `<table><thead><tr><th>Customer</th><th class="num">Not due</th><th class="num">0–30 d</th><th class="num">31–60 d</th><th class="num">61–90 d</th><th class="num">90+ d</th><th class="num">Total</th><th>Credit</th><th>Open orders</th></tr></thead><tbody>
  ${L.map(r => { const lim = num(r.creditLimit), over = lim > 0 && num(r.total) > lim, ords = openOrdersFor(r).length;
    return `<tr class="click" onclick="custDue(${jsq(r.custId)})"><td><b>${esc(r.name)}</b><div class="hint">${[r.gstin, num(r.advance) > 0.5 ? 'advance ' + inr0(r.advance) : ''].filter(Boolean).map(esc).join(' · ')}</div></td>
    <td class="num">${cell(r.upcoming)}</td><td class="num">${cell(r.b0_30)}</td><td class="num">${cell(r.b31_60)}</td><td class="num" style="color:#c2410c">${cell(r.b61_90)}</td><td class="num" style="color:#7F1D1D;font-weight:600">${cell(r.b90plus)}</td>
    <td class="num"><b>${inr0(r.total)}</b></td><td>${over ? `<span class="pill crit">over limit</span>` : lim > 0 ? `<span class="hint">limit ${inrC(lim)}</span>` : '<span class="hint">—</span>'}<div class="hint">${num(r.creditDays) || 0} d</div></td><td>${ords ? `<span class="pill blue">${ords} open</span>` : '<span class="hint">—</span>'}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No customers match.</div>';
}
function custDue(custId){
  const r = OUT_BY_CUST[String(custId)]; if(!r) return;
  const bills = (r.bills || []).slice().sort((a, b) => num(b.daysPastDue) - num(a.daysPastDue)), orders = openOrdersFor(r);
  const b = {up: r.upcoming, b0: r.b0_30, b31: r.b31_60, b61: r.b61_90, b90: r.b90plus};
  const when = x => { const d = num(x.daysPastDue); return d > 0 ? `<span class="pill ${d > 60 ? 'crit' : 'warn'}">${d} d overdue</span>` : `<span class="pill blue">due in ${-d} d</span>`; };
  modal(`<div class="modal-h"><h3>${esc(r.name)}</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b">
    <div class="grid g4" style="margin-bottom:14px"><div class="stat" style="--c:#2563EB"><div class="k">Outstanding</div><div class="v" style="font-size:22px">${inr0(r.total)}</div></div>
      <div class="stat" style="--c:#B91C1C"><div class="k">Overdue</div><div class="v" style="font-size:22px;color:var(--crit)">${inr0(overdueOf(r))}</div></div>
      <div class="stat" style="--c:#15803D"><div class="k">Advance</div><div class="v" style="font-size:22px">${inr0(r.advance)}</div></div>
      <div class="stat" style="--c:#7c5cff"><div class="k">Credit</div><div class="v" style="font-size:22px">${num(r.creditLimit) > 0 ? inrC(r.creditLimit) : 'No limit'}</div><div class="n">${num(r.creditDays) || 0} days</div></div></div>
    ${ageBar(b)}
    <div class="tw" style="margin-top:14px;max-height:300px"><table><thead><tr><th>Bill</th><th>Bill date</th><th>Due</th><th class="num">Amount</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
    ${bills.length ? bills.map(x => `<tr><td class="mono"><b>${esc(x.billNo || x.billId || '')}</b></td><td>${esc(String(x.billDate || '').slice(0, 10))}</td><td>${esc(String(x.dueDate || '').slice(0, 10))}</td><td class="num">${inr0(x.totalAmount)}</td><td class="num"><b>${inr0(x.balance)}</b></td><td>${when(x)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No open bills.</td></tr>'}</tbody></table></div>
    ${orders.length ? `<div style="margin-top:14px"><div class="hint" style="margin-bottom:6px">Open orders in production for this customer</div><div class="chips">${orders.map(p => `<a class="chip" style="text-decoration:none" href="#order/${p.id}" onclick="closeModal()"><b>${esc(p.poNo)}</b> · ${poStatus(itemsOfPo(p)).label}</a>`).join('')}</div></div>` : ''}
  </div><div class="modal-f"><button class="btn" onclick="copyReminder(${jsq(custId)})">Copy payment reminder</button><a class="btn pri" href="customer-portal.html" style="text-decoration:none">Open in Customer Portal</a></div>`);
}
async function copyReminder(custId){
  const r = OUT_BY_CUST[String(custId)]; if(!r) return;
  const od = (r.bills || []).filter(x => num(x.daysPastDue) > 0).sort((a, b) => num(b.daysPastDue) - num(a.daysPastDue));
  const txt = `Dear ${r.name},\n\nAs per our records, an amount of ${inr0(r.total)} is outstanding against your account with JAYCO Engineering India.` +
    (od.length ? `\n\nOverdue bills:\n${od.map(x => `• ${x.billNo || ''} (due ${String(x.dueDate || '').slice(0, 10)}) — ${inr0(x.balance)}`).join('\n')}` : '') +
    `\n\nKindly arrange the payment at the earliest and share the UTR / reference. Please ignore this message if already paid.\n\nRegards,\nAccounts — JAYCO Engineering India`;
  try{ await navigator.clipboard.writeText(txt); toast('Reminder copied — paste it in WhatsApp or email'); }catch(e){ toast('Could not copy: ' + e.message); }
}
function dueCell(p){
  const r = dueFor(p.customerId, p.customerName); if(!r) return '<span class="hint">—</span>';
  const od = overdueOf(r);
  return od > 0.5 ? `<span class="pill ${over60(r) > 0.5 ? 'crit' : 'warn'}" title="Total outstanding ${inr0(r.total)}">${inrC(od)} overdue</span>` : num(r.total) > 0.5 ? `<span class="pill">${inrC(r.total)} due</span>` : '<span class="pill ok">Clear</span>';
}

/* ---------- Entry Desk: type a document once, it is posted to every portal that needs it ----------
   Sales invoice  → PO Management dispatch (pending qty), Customer Portal bill (receivable), Dispatch Board slip + stock
   Purchase bill  → Vendor Payments bill (payable)
   Casting challan/invoice → ERP stage "Casting" for open orders (earliest due first), Vendor Payments bill for the foundry
   Every document is also kept in erp_documents with the result of each posting, so nothing is entered twice. */
const DISPATCH_FB = {apiKey: "AIzaSyAs7J_8awM76M6H6-4fuwYJ9BrpwS5iYPU", authDomain: "jayco-dispatch-board.firebaseapp.com", projectId: "jayco-dispatch-board",
  storageBucket: "jayco-dispatch-board.firebasestorage.app", messagingSenderId: "3086329458", appId: "1:3086329458:web:7862b6eab33fccae9844eb"};
let _ddb = null;
function ddb(){ if(!_ddb){ const app = firebase.apps.find(a => a.name === 'dispatch') || firebase.initializeApp(DISPATCH_FB, 'dispatch'); _ddb = app.firestore(); } return _ddb; }
let ED_TAB = 'sales', ED_RES = null, ED_CAST = [];
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addDaysISO = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + num(n)); return d.toISOString().slice(0, 10); };
const r2 = v => Math.round(num(v) * 100) / 100;
const sameNo = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const DOC_TYPES = {sales: 'Sales invoice', purchase: 'Purchase bill', casting: 'Casting challan / invoice'};

function vEntry(){
  $('#ttl').textContent = 'Entry Desk';
  ensureVen();
  const tab = (k, n, d) => `<button class="wtab ${ED_TAB === k ? 'on' : ''}" style="--c:${k === 'sales' ? '#2563EB' : k === 'purchase' ? '#B45309' : '#7c5cff'}" onclick="edTab('${k}')"><span class="wn">${n}</span><span class="wl" style="white-space:normal">${d}</span></button>`;
  $('#view').innerHTML = `
  <div class="card"><div class="card-b"><div class="wtabs" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
    ${tab('sales', 'Sales invoice', 'PO dispatch · Customer Portal bill · Dispatch Board')}
    ${tab('purchase', 'Purchase bill', 'Vendor Payments')}
    ${tab('casting', 'Casting challan / invoice', 'Casting stage · Vendor Payments')}
  </div></div></div>
  <div class="card"><div class="card-h"><h3>${DOC_TYPES[ED_TAB]}</h3></div><div class="card-b" id="edForm"></div></div>
  <div id="edRes">${ED_RES || ''}</div>
  <div class="card"><div class="card-h"><h3>Documents entered</h3><span class="hint">latest first</span></div><div class="tw" id="edReg"></div></div>`;
  ({sales: edSales, purchase: edPurchase, casting: edCasting})[ED_TAB]();
  drawRegister();
}
function edTab(k){ ED_TAB = k; ED_RES = null; vEntry(); }
const tgt = (id, label, on = true, note = '') => `<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="width:auto"> ${label}${note ? ` <span class="hint">${note}</span>` : ''}</label>`;
const vendorOptions = () => VEN.state === 'ok' ? VEN.vendors.slice().sort((a, b) => String(a.name).localeCompare(b.name)).map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('') : '';

/* ----- scan copies: chosen files are uploaded to Google Drive through the Customer Portal script ----- */
const ED_FILES = {};
function attBlock(p){
  ED_FILES[p] = ED_FILES[p] || [];
  return `<div class="sec" style="margin-top:18px">Scan copy / attachments</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <label class="btn" style="cursor:pointer">📎 Choose files (PDF / photo)<input type="file" id="${p}_files" multiple accept="application/pdf,image/*" style="display:none"></label>
    <label class="btn" style="cursor:pointer">📷 Take photo<input type="file" id="${p}_cam" accept="image/*" capture="environment" style="display:none"></label>
    <input id="${p}_link" placeholder="…or paste a Drive / OneDrive link" style="flex:1;min-width:240px">
  </div><div id="${p}_flist" class="chips" style="margin-top:8px"></div>
  <div class="hint" style="margin-top:4px">Files are saved in your Google Drive (folder "Jayco Entry Desk Scans") and linked to every portal this document is posted to. Photos are reduced in size automatically.</div>`;
}
function attWire(p){
  const add = e => { [...e.target.files].forEach(f => { if(f.size > 15 * 1024 * 1024) toast(f.name + ' is larger than 15 MB'); else ED_FILES[p].push(f); }); e.target.value = ''; attList(p); };
  $('#' + p + '_files').onchange = add; $('#' + p + '_cam').onchange = add; attList(p);
}
function attList(p){ $('#' + p + '_flist').innerHTML = ED_FILES[p].map((f, i) => `<span class="chip">📄 ${esc(f.name)} · ${Math.max(1, Math.round(f.size / 1024))} KB <a href="#" onclick="ED_FILES['${p}'].splice(${i},1);attList('${p}');return false" style="margin-left:4px;color:var(--crit)">✕</a></span>`).join(''); }
function fileToB64(file){
  return new Promise((ok, bad) => {
    const rd = new FileReader();
    if(/^image\//.test(file.type) && !/gif|svg/.test(file.type)){
      rd.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok({b64: c.toDataURL('image/jpeg', 0.82).split(',')[1], mime: 'image/jpeg', ext: 'jpg'}); }; img.onerror = () => bad(new Error('cannot read image ' + file.name)); img.src = rd.result; };
    } else rd.onload = () => ok({b64: String(rd.result).split(',')[1], mime: file.type || 'application/pdf', ext: (file.name.split('.').pop() || 'pdf').toLowerCase()});
    rd.onerror = () => bad(new Error('cannot read ' + file.name)); rd.readAsDataURL(file);
  });
}
// upload the chosen files; returns {att:[{name,url}], err} — on failure the user decides whether to post without the scan
async function attUpload(p, folder, label){
  const att = [], link = ($('#' + p + '_link').value || '').trim();
  try{
    if(ED_FILES[p].length){
      if(!(await cmsConfig())) throw new Error('Customer Portal not connected (Sales → Settings & Setup)');
      for(let i = 0; i < ED_FILES[p].length; i++){
        const f = ED_FILES[p][i], d = await fileToB64(f), name = `${label}${ED_FILES[p].length > 1 ? ' - ' + (i + 1) : ''}.${d.ext}`.replace(/[\\/]/g, '-');
        const r = await cmsApi('uploadFile', {name, mimeType: d.mime, base64: d.b64, folder});
        att.push({name, url: r.url});
      }
    }
  }catch(e){
    const msg = /unknown action/i.test(e.message) ? 'the Customer Portal script needs the latest code for uploads (see setup note)' : e.message;
    if(!confirm('Scan upload failed: ' + msg + '\n\nPost the document without the scan copy?')) return null;
    if(link) att.push({name: label + ' (link)', url: link});
    return {att, err: msg};
  }
  if(link) att.push({name: label + ' (link)', url: link});
  return {att, err: ''};
}
const attRes = a => a.err ? 'err:' + a.err : a.att.length ? 'ok:' + a.att.length + ' file(s) saved — ' + a.att.map(x => x.name).join(', ') : null;

/* ----- sales invoice ----- */
function edSales(){
  const names = [...new Set([...CUSTS.map(c => c.name), ...ITEMS_PO.map(i => i.customerName)].filter(Boolean))].sort();
  $('#edForm').innerHTML = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <div class="fld" style="grid-column:span 2"><label>Customer *</label><input id="es_cust" list="dlEsCust" autocomplete="off" placeholder="start typing…"><datalist id="dlEsCust">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
    <div class="fld"><label>Invoice no. *</label><input id="es_no"></div>
    <div class="fld"><label>Invoice date *</label><input id="es_date" type="date" value="${todayISO()}"></div>
    <div class="fld"><label>Invoice total ₹ (incl. GST) *</label><input id="es_amt" type="number" step="0.01"></div>
    <div class="fld"><label>Credit days</label><input id="es_cd" type="number" value="45"></div>
    <div class="fld"><label>E-way bill no.</label><input id="es_eway" placeholder="12 digits"></div>
    <div class="fld"><label>E-way bill date</label><input id="es_ewd" type="date" value="${todayISO()}"></div>
    <div class="fld"><label>Vehicle no.</label><input id="es_veh"></div>
    <div class="fld"><label>Transporter</label><input id="es_tr"></div>
    <div class="fld"><label>LR no.</label><input id="es_lr"></div>
    <div class="fld"><label>Destination</label><input id="es_dest"></div>
  </div>
  <div class="sec" style="margin-top:18px">Items dispatched — from this customer's open POs</div><div id="es_lines" class="hint">Choose the customer to see their open PO lines.</div>
  ${attBlock('es')}
  <div class="sec" style="margin-top:18px">Post to</div>
  ${tgt('es_t_po', '<b>PO Management</b> — dispatch entry (pending qty goes down; ERP order shows Dispatched)')}
  ${tgt('es_t_cms', '<b>Customer Portal</b> — bill for the receivable (e-way no. in the narration)')}
  ${tgt('es_t_db', '<b>Dispatch Board</b> — dispatch slip and finished-stock deduction')}
  <div style="margin-top:14px"><button class="btn pri" id="es_go" onclick="postSales()">Post sales invoice</button></div>`;
  $('#es_cust').onchange = $('#es_cust').oninput = drawSalesLines; attWire('es');
}
function salesOpenLines(name){
  const k = nameKey(name), c = CUSTS.find(x => nameKey(x.name) === k);
  return ITEMS_PO.filter(i => (c && i.customerId === c.id) || nameKey(i.customerName) === k).map(i => ({i, pend: num(i.orderedQty) - num(i.despatchedQty)})).filter(x => x.pend > 0)
    .sort((a, b) => (toDate(a.i.poDate) || 0) - (toDate(b.i.poDate) || 0));
}
function drawSalesLines(){
  const name = $('#es_cust').value.trim(), L = name ? salesOpenLines(name) : [];
  const c = CUSTS.find(x => nameKey(x.name) === nameKey(name)), due = c ? dueFor(c.id, c.name) : null;
  if(due && num(due.creditDays)) $('#es_cd').value = num(due.creditDays);
  if(due && $('#es_dest') && !$('#es_dest').value) $('#es_dest').value = '';
  $('#es_lines').innerHTML = !name ? 'Choose the customer to see their open PO lines.' : L.length ? `<div class="tw"><table><thead><tr><th style="width:34px"></th><th>PO</th><th>Item</th><th class="num">Pending</th><th class="num" style="width:110px">Dispatch qty</th></tr></thead><tbody>
    ${L.map(x => `<tr><td><input type="checkbox" class="es_ck" data-id="${esc(x.i.id)}" style="width:auto"></td><td><b>${esc(x.i.poNo)}</b><div class="hint">${fmtD(x.i.poDate)}</div></td><td class="mono"><b>${esc(x.i.itemCode)}</b><div class="hint">${esc(x.i.itemDescription || '')}</div></td><td class="num">${x.pend}</td><td><input type="number" min="0" class="es_q" data-id="${esc(x.i.id)}" value="${x.pend}" style="text-align:right"></td></tr>`).join('')}</tbody></table></div><div class="hint" style="margin-top:6px">Tick the lines on this invoice and correct the quantity if it is a part dispatch.</div>`
    : '<span style="color:var(--warn)">No open PO lines for this customer. The invoice can still be posted to the Customer Portal; untick PO Management and Dispatch Board.</span>';
}
async function cmsCustId(name){   // the Customer Portal id for a customer: linked id first, else by normalised name
  const c = CUSTS.find(x => nameKey(x.name) === nameKey(name));
  if(c && c.cmsId) return {id: String(c.cmsId)};
  if(!(await cmsConfig())) throw new Error('Customer Portal not connected (Sales → Settings & Setup)');
  const list = await cmsApi('getCustomers'), m = (list || []).filter(x => nameKey(x.name) === nameKey(name));
  if(m.length === 1) return {id: String(m[0].custId), creditDays: m[0].creditDays};
  throw new Error(m.length ? 'two Customer Portal customers share this name — link it in ERP → Customer Master' : 'customer not found in the Customer Portal — add or link it in ERP → Customer Master');
}
async function postSales(){
  const g = id => ($('#' + id).value || '').trim();
  const cust = g('es_cust'), no = g('es_no'), date = g('es_date'), amt = r2(g('es_amt')), eway = g('es_eway');
  if(!cust || !no || !date){ toast('Customer, invoice no. and date are required'); return; }
  if(DOCS.some(d => d.type === 'sales' && sameNo(d.no, no))){ toast('Invoice ' + no + ' is already entered — see Documents entered below'); return; }
  const lines = $$('.es_ck').filter(c => c.checked).map(c => { const i = ITEMS_PO.find(x => x.id === c.dataset.id); return {i, qty: num($$('.es_q').find(q => q.dataset.id === c.dataset.id).value)}; }).filter(l => l.i && l.qty > 0);
  const tPO = $('#es_t_po').checked, tCMS = $('#es_t_cms').checked, tDB = $('#es_t_db').checked;
  if((tPO || tDB) && !lines.length){ toast('Tick the PO lines on this invoice, or untick PO Management and Dispatch Board'); return; }
  if(tCMS && !(amt > 0)){ toast('Enter the invoice total for the Customer Portal bill'); return; }
  if(!confirm(`Post invoice ${no} for ${cust}${lines.length ? ' (' + lines.reduce((a, l) => a + l.qty, 0) + ' pcs)' : ''}?`)) return;
  $('#es_go').disabled = true; $('#es_go').textContent = 'Uploading scan…';
  const up = await attUpload('es', 'Sales invoices ' + date.slice(0, 7), 'Invoice ' + no + ' - ' + cust);
  if(!up){ $('#es_go').disabled = false; $('#es_go').textContent = 'Post sales invoice'; return; }
  $('#es_go').textContent = 'Posting…';
  const att = up.att, res = {}, extra = {ewayNo: eway, ewayDate: g('es_ewd'), vehicleNo: g('es_veh'), transporter: g('es_tr'), lrNo: g('es_lr'), dest: g('es_dest')};
  if(tPO){ try{
      const TS = firebase.firestore.Timestamp, dDate = TS.fromDate(new Date(date));
      for(const l of lines){
        await db.runTransaction(async tx => {
          const ref = db.collection('poItems').doc(l.i.id), snap = await tx.get(ref); if(!snap.exists) throw new Error('PO line ' + l.i.itemCode + ' not found');
          const d = snap.data(), desp = num(d.despatchedQty) + l.qty, pend = num(d.orderedQty) - desp;
          tx.set(db.collection('despatches').doc(), {poItemId: l.i.id, poId: d.poId, poNo: d.poNo, customerId: d.customerId, customerName: d.customerName, isExclusive: !!d.isExclusive,
            itemCode: d.itemCode, qtyDespatched: l.qty, despatchDate: dDate, invoiceNumber: no, attachments: att.map(a => ({description: a.name, url: a.url})), ...extra, source: 'ERP Entry Desk', createdAt: firebase.firestore.FieldValue.serverTimestamp()});
          tx.update(ref, {despatchedQty: desp, pendingQty: pend, status: pend <= 0 ? 'Completed' : 'Partial'});
        });
      }
      res.po = 'ok:' + lines.length + ' line(s) dispatched';
    }catch(e){ res.po = 'err:' + e.message; } }
  if(tCMS){ try{
      const cid = await cmsCustId(cust), existing = await cmsApi('getBills', {custId: cid.id});
      if((existing || []).some(b => sameNo(b.billNo, no))) res.cms = 'ok:bill already in the Customer Portal (not added twice)';
      else {
        const cd = num(g('es_cd')) || num(cid.creditDays) || 45;
        const narr = [eway ? 'E-way ' + eway : '', lines.length ? 'PO ' + [...new Set(lines.map(l => l.i.poNo))].join(', ') : '', extra.vehicleNo ? 'Vehicle ' + extra.vehicleNo : '', extra.lrNo ? 'LR ' + extra.lrNo : ''].filter(Boolean).join(' · ');
        const r = await cmsApi('saveBill', {custId: cid.id, billNo: no, billDate: date, dueDate: addDaysISO(date, cd), totalAmount: amt, narration: narr, attachments: JSON.stringify(att)});
        res.cms = 'ok:bill ' + (r && r.billId ? 'saved' : 'sent') + ', due ' + addDaysISO(date, cd);
      }
    }catch(e){ res.cms = 'err:' + e.message; } }
  if(tDB){ try{
      const ref = ddb().collection('dispatch').doc('board');
      await ddb().runTransaction(async tx => {
        const snap = await tx.get(ref); if(!snap.exists) throw new Error('Dispatch Board has no data yet — open it once first');
        const cur = snap.data(), slips = cur.dispatchSlips || cur.tickets || [];
        if(slips.some(sl => sameNo(sl.invoiceNo, no))) throw new Error('a slip for invoice ' + no + ' already exists on the Dispatch Board');
        const items = lines.map(l => ({id: Math.random().toString(36).slice(2, 10), item: l.i.itemCode, qty: l.qty, packingStyle: '', boxSize: '', boxQty: ''}));
        let stock = (cur.stock || []).slice(); const k = x => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
        items.forEach(r => { const ix = stock.findIndex(st => k(st.item) === k(r.item)); if(ix >= 0) stock[ix] = {...stock[ix], qty: num(stock[ix].qty) - r.qty}; });
        const slip = {id: Math.random().toString(36).slice(2, 10), date, invoiceNo: no, transportName: extra.transporter, lrNo: extra.lrNo, driverName: '', vehicleNo: extra.vehicleNo, dest: extra.dest || cust, ewayNo: eway, items,
          totalQty: items.reduce((a, r) => a + r.qty, 0), totalBoxes: 0, totalGunny: 0, attachments: att, createdBy: 'ERP Entry Desk'};
        tx.set(ref, {...cur, dispatchSlips: [slip, ...slips], stock});
      });
      res.db = 'ok:dispatch slip added, stock reduced';
    }catch(e){ res.db = 'err:' + e.message; } }
  if(attRes(up)) res.att = attRes(up);
  ED_FILES.es = [];
  await saveDoc({type: 'sales', no, date, party: cust, amount: amt, ...extra, attachments: att, lines: lines.map(l => ({poNo: l.i.poNo, itemCode: l.i.itemCode, qty: l.qty})), results: res});
  showResults(`Sales invoice ${no}`, res, {att: 'Scan copy (Google Drive)', po: 'PO Management', cms: 'Customer Portal', db: 'Dispatch Board'});
}

/* ----- purchase bill ----- */
function edPurchase(){
  if(VEN.state !== 'ok'){ $('#edForm').innerHTML = venMessage() || '<div class="empty">Loading vendors…</div>'; return; }
  $('#edForm').innerHTML = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <div class="fld" style="grid-column:span 2"><label>Vendor *</label><select id="ep_v"><option value="">Select vendor…</option>${vendorOptions()}</select></div>
    <div class="fld"><label>Bill no. *</label><input id="ep_no"></div>
    <div class="fld"><label>Bill date *</label><input id="ep_date" type="date" value="${todayISO()}"></div>
    <div class="fld"><label>Bill total ₹ (incl. GST) *</label><input id="ep_amt" type="number" step="0.01"></div>
    <div class="fld"><label>Due date</label><input id="ep_due" type="date"></div>
    <div class="fld"><label>E-way bill no.</label><input id="ep_eway"></div>
    <div class="fld"><label>Vehicle no.</label><input id="ep_veh"></div>
    <div class="fld" style="grid-column:1/-1"><label>What was bought / notes</label><input id="ep_notes" placeholder="e.g. 200 nos taconite seals, 50 kg paint"></div>
  </div>
  ${attBlock('ep')}
  <div class="sec" style="margin-top:18px">Post to</div>
  ${tgt('ep_t_v', '<b>Vendor Payments</b> — bill for the payable (any advance paid to the vendor is adjusted automatically)')}
  <div class="hint">Store Control stock receipt (GRN) is not posted yet — Store Control still keeps its data on one computer.</div>
  <div style="margin-top:14px"><button class="btn pri" id="ep_go" onclick="postPurchase()">Post purchase bill</button></div>`;
  const setDue = () => { const v = VEN.vendors.find(x => x.id === $('#ep_v').value); if(v && $('#ep_date').value) $('#ep_due').value = addDaysISO($('#ep_date').value, num(v.creditDays) || 0); };
  $('#ep_v').onchange = setDue; $('#ep_date').onchange = setDue; attWire('ep');
}
async function vendorBill(vendorId, no, date, due, amount, notes, link){   // same steps as Vendor Payments' own "new invoice"
  if(VEN.invoices.some(i => i.vendorId === vendorId && sameNo(i.invoiceNo, no))) return 'ok:bill already in Vendor Payments (not added twice)';
  const vdbx = vdb(), FV = firebase.firestore.FieldValue;
  await vdbx.runTransaction(async tx => {
    const vref = vdbx.collection('vendors').doc(vendorId), vs = await tx.get(vref); if(!vs.exists) throw new Error('vendor not found');
    const adv = r2(vs.data().advanceBalance || 0), applied = r2(Math.min(adv, amount)), iref = vdbx.collection('invoices').doc();
    tx.set(iref, {vendorId, invoiceNo: no, invoiceDate: date, dueDate: due || date, amount: r2(amount), amountPaid: applied, status: applied >= amount ? 'paid' : applied > 0 ? 'partial' : 'open', attachmentLink: link || '', notes: notes || '', createdAt: FV.serverTimestamp()});
    if(applied > 0){
      tx.update(vref, {advanceBalance: r2(adv - applied)});
      tx.set(vdbx.collection('payments').doc(), {vendorId, paymentDate: date, amount: applied, mode: 'advance_adjustment', reference: `Auto-applied from advance to ${no}`, isAdvance: false,
        allocations: [{invoiceId: iref.id, invoiceNo: no, amountApplied: applied}], unallocatedAmount: 0, createdAt: FV.serverTimestamp()});
    }
  });
  loadVen(true);
  return 'ok:bill saved' + (amount ? ' for ' + inr0(amount) : '');
}
async function postPurchase(){
  const g = id => ($('#' + id).value || '').trim(), vid = g('ep_v'), no = g('ep_no'), date = g('ep_date'), amt = r2(g('ep_amt'));
  if(!vid || !no || !date || !(amt > 0)){ toast('Vendor, bill no., date and total are required'); return; }
  const vname = (VEN.vendors.find(v => v.id === vid) || {}).name || '';
  if(DOCS.some(d => d.type === 'purchase' && d.vendorId === vid && sameNo(d.no, no))){ toast('Bill ' + no + ' from ' + vname + ' is already entered'); return; }
  $('#ep_go').disabled = true; $('#ep_go').textContent = 'Uploading scan…';
  const up = await attUpload('ep', 'Purchase bills ' + date.slice(0, 7), 'Bill ' + no + ' - ' + vname);
  if(!up){ $('#ep_go').disabled = false; $('#ep_go').textContent = 'Post purchase bill'; return; }
  $('#ep_go').textContent = 'Posting…';
  const att = up.att, res = {}, notes = [g('ep_notes'), g('ep_eway') ? 'E-way ' + g('ep_eway') : '', g('ep_veh') ? 'Vehicle ' + g('ep_veh') : ''].filter(Boolean).join(' · ');
  if($('#ep_t_v').checked){ try{ res.ven = await vendorBill(vid, no, date, g('ep_due'), amt, notes + (att.length > 1 ? ' · Scans: ' + att.slice(1).map(a => a.url).join(' ') : ''), att[0] ? att[0].url : ''); }catch(e){ res.ven = 'err:' + e.message; } }
  if(attRes(up)) res.att = attRes(up);
  ED_FILES.ep = [];
  await saveDoc({type: 'purchase', no, date, party: vname, vendorId: vid, amount: amt, attachments: att, ewayNo: g('ep_eway'), vehicleNo: g('ep_veh'), notes: g('ep_notes'), results: res});
  showResults(`Purchase bill ${no}`, res, {att: 'Scan copy (Google Drive)', ven: 'Vendor Payments'});
}

/* ----- casting challan / invoice ----- */
function edCasting(){
  if(VEN.state !== 'ok'){ $('#edForm').innerHTML = venMessage() || '<div class="empty">Loading vendors…</div>'; return; }
  if(!ED_CAST.length) ED_CAST = [{code: '', pcs: '', kg: '', rate: ''}];
  const codes = [...new Set([...ITEMS_PO.map(i => i.itemCode), ...Object.values(COST).map(c => c.itemCode)].filter(Boolean))].sort();
  $('#edForm').innerHTML = `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <div class="fld" style="grid-column:span 2"><label>Foundry (vendor) *</label><select id="ec_v"><option value="">Select foundry…</option>${vendorOptions()}</select></div>
    <div class="fld"><label>Challan no. *</label><input id="ec_no"></div>
    <div class="fld"><label>Challan date *</label><input id="ec_date" type="date" value="${todayISO()}"></div>
    <div class="fld"><label>Foundry invoice no.</label><input id="ec_inv" placeholder="if the bill came with it"></div>
    <div class="fld"><label>GST %</label><input id="ec_gst" type="number" value="18"></div>
    <div class="fld"><label>E-way bill no.</label><input id="ec_eway"></div>
    <div class="fld"><label>Vehicle no.</label><input id="ec_veh"></div>
  </div>
  <div class="sec" style="margin-top:18px">Castings received</div>
  <datalist id="dlEcCodes">${codes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="tw"><table><thead><tr><th>Item</th><th class="num" style="width:100px">Pieces</th><th class="num" style="width:110px">Weight (kg)</th><th class="num" style="width:110px">Rate ₹/kg</th><th class="num" style="width:120px">Amount</th><th style="width:40px"></th></tr></thead><tbody id="ec_rows"></tbody></table></div>
  <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn sm" type="button" onclick="ecAdd()">＋ Add item</button><div id="ec_tot" style="margin-left:auto;font-weight:700"></div></div>
  ${attBlock('ec')}
  <div class="sec" style="margin-top:18px">Post to</div>
  ${tgt('ec_t_stage', '<b>ERP stages</b> — move these pieces into <i>Casting</i> on open orders of the same item (earliest due first)')}
  ${tgt('ec_t_v', '<b>Vendor Payments</b> — foundry bill for the amount above', true, '(needs the foundry invoice no.)')}
  <div class="hint">Casting Control (challan & weight register) is not posted yet — it still keeps its data on one computer.</div>
  <div style="margin-top:14px"><button class="btn pri" id="ec_go" onclick="postCasting()">Post casting challan</button></div>`;
  drawCastRows();
  $('#ec_gst').oninput = castTotals; attWire('ec');
}
function drawCastRows(){
  $('#ec_rows').innerHTML = ED_CAST.map((r, i) => `<tr><td><input list="dlEcCodes" data-i="${i}" data-f="code" value="${esc(r.code)}" placeholder="item code"></td>
    <td><input type="number" data-i="${i}" data-f="pcs" value="${esc(r.pcs)}" style="text-align:right"></td><td><input type="number" step="0.01" data-i="${i}" data-f="kg" value="${esc(r.kg)}" style="text-align:right"></td>
    <td><input type="number" step="0.01" data-i="${i}" data-f="rate" value="${esc(r.rate)}" style="text-align:right"></td><td class="num" id="ec_amt${i}"></td><td><button class="btn sm" type="button" onclick="ecDel(${i})">✕</button></td></tr>`).join('');
  $$('#ec_rows input').forEach(e => e.oninput = () => { const r = ED_CAST[+e.dataset.i]; r[e.dataset.f] = e.value;
    if(e.dataset.f === 'code' && !r.rate){ const c = COST[costKey(e.value)], m = c ? c.material : materialOf(e.value); r.rate = (c && num(c.castRate)) || matRate(m) || ''; const ri = $(`#ec_rows input[data-i="${e.dataset.i}"][data-f="rate"]`); if(ri) ri.value = r.rate; }
    castTotals(); });
  castTotals();
}
function ecAdd(){ ED_CAST.push({code: '', pcs: '', kg: '', rate: ''}); drawCastRows(); }
function ecDel(i){ ED_CAST.splice(i, 1); if(!ED_CAST.length) ED_CAST.push({code: '', pcs: '', kg: '', rate: ''}); drawCastRows(); }
function castTotals(){
  let base = 0, kg = 0, pcs = 0; ED_CAST.forEach((r, i) => { const a = num(r.kg) * num(r.rate); base += a; kg += num(r.kg); pcs += num(r.pcs); const c = $('#ec_amt' + i); if(c) c.textContent = a ? inr0(a) : ''; });
  const gst = base * num($('#ec_gst') && $('#ec_gst').value) / 100;
  $('#ec_tot').textContent = `${pcs} pcs · ${r2(kg)} kg · ${inr0(base)} + GST ${inr0(gst)} = ${inr0(base + gst)}`;
  return {base: r2(base), gst: r2(gst), total: r2(base + gst), kg: r2(kg), pcs};
}
async function castIntoStage(code, pcs, note){   // FIFO over open order lines of this item, earliest due first
  const k = String(code).trim().toLowerCase();
  const cands = ITEMS_PO.filter(i => String(i.itemCode).trim().toLowerCase() === k).map(i => ({i, s: itemState(i)})).filter(x => x.s.notStarted > 0)
    .sort((a, b) => (toDate(a.i.deliveryDate) || new Date(8.64e15)) - (toDate(b.i.deliveryDate) || new Date(8.64e15)));
  let left = pcs, used = [];
  for(const x of cands){
    if(left <= 0) break;
    const n = Math.min(left, x.s.notStarted), ref = db.collection('erp_itemStages').doc(x.i.id);
    await db.runTransaction(async tx => {
      const cur = await tx.get(ref), d = cur.exists ? cur.data() : {stageQty: {}, history: []}, sq = {...(d.stageQty || {})}, now = new Date().toISOString();
      sq.casting = num(sq.casting) + n;
      tx.set(ref, {poItemId: x.i.id, poNo: x.i.poNo, itemCode: x.i.itemCode, stageQty: sq, history: [...(d.history || []), {at: now, by: me(), from: 'Not started', to: 'Casting', qty: n, note}].slice(-200), updatedAt: now}, {merge: true});
    });
    left -= n; used.push(n + ' on ' + x.i.poNo);
  }
  return {used, left};
}
async function postCasting(){
  const g = id => ($('#' + id).value || '').trim(), vid = g('ec_v'), no = g('ec_no'), date = g('ec_date'), inv = g('ec_inv');
  const rows = ED_CAST.filter(r => String(r.code).trim() && num(r.pcs) > 0), T = castTotals();
  if(!vid || !no || !date){ toast('Foundry, challan no. and date are required'); return; }
  if(!rows.length){ toast('Add at least one item with pieces'); return; }
  const vname = (VEN.vendors.find(v => v.id === vid) || {}).name || '';
  if(DOCS.some(d => d.type === 'casting' && d.vendorId === vid && sameNo(d.no, no))){ toast('Challan ' + no + ' from ' + vname + ' is already entered'); return; }
  if($('#ec_t_v').checked && !inv){ toast('Enter the foundry invoice no., or untick Vendor Payments'); return; }
  $('#ec_go').disabled = true; $('#ec_go').textContent = 'Uploading scan…';
  const up = await attUpload('ec', 'Casting challans ' + date.slice(0, 7), 'Challan ' + no + ' - ' + vname);
  if(!up){ $('#ec_go').disabled = false; $('#ec_go').textContent = 'Post casting challan'; return; }
  $('#ec_go').textContent = 'Posting…';
  const att = up.att, res = {}, note = 'Casting challan ' + no + (vname ? ' · ' + vname : '');
  if($('#ec_t_stage').checked){ try{
      const msgs = [];
      for(const r of rows){ const o = await castIntoStage(r.code, Math.floor(num(r.pcs)), note); msgs.push(`${r.code}: ${o.used.length ? o.used.join(', ') : 'no open order'}${o.left > 0 ? ` (${o.left} pcs extra — not on any open order)` : ''}`); }
      res.stage = 'ok:' + msgs.join(' | ');
    }catch(e){ res.stage = 'err:' + e.message; } }
  if($('#ec_t_v').checked){ try{
      const v = VEN.vendors.find(x => x.id === vid) || {};
      res.ven = await vendorBill(vid, inv, date, addDaysISO(date, num(v.creditDays) || 0), T.total, `Castings — challan ${no}: ${rows.map(r => `${r.code} ${r.pcs} pcs / ${r.kg || 0} kg @ ₹${r.rate}`).join('; ')}${g('ec_eway') ? ' · E-way ' + g('ec_eway') : ''}${att.length > 1 ? ' · Scans: ' + att.slice(1).map(a => a.url).join(' ') : ''}`, att[0] ? att[0].url : '');
    }catch(e){ res.ven = 'err:' + e.message; } }
  if(attRes(up)) res.att = attRes(up);
  ED_FILES.ec = [];
  await saveDoc({type: 'casting', no, date, party: vname, vendorId: vid, invoiceNo: inv, amount: T.total, attachments: att, ewayNo: g('ec_eway'), vehicleNo: g('ec_veh'), kg: T.kg, lines: rows.map(r => ({itemCode: r.code, pcs: num(r.pcs), kg: num(r.kg), rate: num(r.rate)})), results: res});
  ED_CAST = [];
  showResults(`Casting challan ${no}`, res, {att: 'Scan copy (Google Drive)', stage: 'ERP stages', ven: 'Vendor Payments'});
}

/* ----- shared: register + results ----- */
async function saveDoc(d){
  try{ await db.collection('erp_documents').add({...d, createdAt: new Date().toISOString(), by: me()}); }
  catch(e){ toast('Posted, but the document register could not be saved: ' + e.message); }
}
function resChip(v){ const ok = String(v).startsWith('ok:'); return `<span class="pill ${ok ? 'ok' : 'crit'}" title="${esc(String(v).slice(3))}">${ok ? '✓' : '✗'}</span>`; }
function showResults(title, res, names){
  const anyErr = Object.values(res).some(v => String(v).startsWith('err:'));
  ED_RES = `<div class="card" style="border-color:${anyErr ? '#F6C4C2' : '#BBE5C8'}"><div class="card-h"><h3>${anyErr ? '⚠' : '✓'} ${esc(title)} posted</h3><button class="btn sm" style="margin-left:auto" onclick="ED_RES=null;vEntry()">Close</button></div><div class="card-b">
    ${Object.keys(names).filter(k => res[k]).map(k => `<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0">${resChip(res[k])}<div><b>${names[k]}</b><div class="${String(res[k]).startsWith('ok:') ? 'hint' : ''}" style="${String(res[k]).startsWith('err:') ? 'color:var(--crit)' : ''}">${esc(String(res[k]).slice(String(res[k]).indexOf(':') + 1))}</div></div></div>`).join('') || '<div class="hint">Nothing was selected to post.</div>'}
    ${anyErr ? '<div class="hint" style="margin-top:8px">Fix the problem shown, then make that one entry directly in its portal — the parts marked ✓ are already saved.</div>' : ''}</div></div>`;
  vEntry(); window.scrollTo({top: 0, behavior: 'smooth'});
}
function drawRegister(){
  const L = DOCS.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 60);
  setN('nDocs', '');
  $('#edReg').innerHTML = L.length ? `<table><thead><tr><th>Type</th><th>No.</th><th>Date</th><th>Party</th><th class="num">Amount</th><th>E-way</th><th>Scan</th><th>Posted to</th><th>By</th></tr></thead><tbody>
  ${L.map(d => `<tr><td><span class="pill ${d.type === 'sales' ? 'blue' : d.type === 'purchase' ? 'warn' : ''}">${esc(DOC_TYPES[d.type] || d.type)}</span></td><td class="mono"><b>${esc(d.no)}</b>${d.invoiceNo ? `<div class="hint">inv ${esc(d.invoiceNo)}</div>` : ''}</td><td>${esc(d.date)}</td><td>${esc(d.party)}</td>
    <td class="num">${num(d.amount) ? inr0(d.amount) : '—'}</td><td class="mono">${esc(d.ewayNo || '—')}</td>
    <td>${(d.attachments || []).map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(a.name)}" style="text-decoration:none">📎</a>`).join(' ') || '<span class="hint">—</span>'}</td>
    <td>${Object.entries(d.results || {}).filter(([k]) => k !== 'att').map(([k, v]) => `<span style="white-space:nowrap;margin-right:6px">${resChip(v)} <span class="hint">${{po: 'PO', cms: 'Cust. Portal', db: 'Dispatch', ven: 'Vendor', stage: 'Stages'}[k] || k}</span></span>`).join('')}</td><td class="hint">${esc(String(d.by || '').split('@')[0])}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No documents entered yet.</div>';
}

/* ---------- vendor payables (read from the Vendor Payments portal's own Firebase project) ---------- */
const VENDOR_FB = {apiKey: "AIzaSyBtKqp1SAPmYwgP6TVigauIdgrwsyQE1Vw", authDomain: "jayco-vendor-payments.firebaseapp.com", projectId: "jayco-vendor-payments",
  storageBucket: "jayco-vendor-payments.firebasestorage.app", messagingSenderId: "759807683867", appId: "1:759807683867:web:e41463756cff4de593b7be"};
let VEN = {state: '', vendors: [], invoices: [], payments: [], at: 0}, _vdb = null;
function vdb(){ if(!_vdb){ const app = firebase.apps.find(a => a.name === 'vendor') || firebase.initializeApp(VENDOR_FB, 'vendor'); _vdb = app.firestore(); } return _vdb; }
async function loadVen(force){
  if(VEN.state === 'loading') return; if(!force && VEN.state === 'ok' && Date.now() - VEN.at < 300000) return;
  VEN.state = 'loading'; render();
  try{
    const all = async c => (await vdb().collection(c).get()).docs.map(d => ({id: d.id, ...d.data()}));
    const [v, i, p] = await Promise.all([all('vendors'), all('invoices'), all('payments')]);
    VEN = {state: 'ok', vendors: v, invoices: i, payments: p, at: Date.now()};
  }catch(e){ VEN.state = 'error:' + e.message; }
  render();
}
const ensureVen = () => { if(VEN.state === '' || (VEN.state === 'ok' && Date.now() - VEN.at > 300000)) loadVen(); };
const dayDiff = d => { const x = new Date(d); return isNaN(x) ? null : Math.floor((new Date().setHours(0, 0, 0, 0) - x.setHours(0, 0, 0, 0)) / 864e5); };
// one row per vendor with open bills: ageing by due date, plus the MSME 45-day rule (Income-tax Sec 43B(h): micro & small suppliers)
function venRows(){
  const vm = {}; VEN.vendors.forEach(v => vm[v.id] = v);
  const rows = {};
  VEN.invoices.forEach(i => {
    if(i.status === 'paid') return;
    const bal = num(i.amount) - num(i.amountPaid); if(bal < 0.5) return;
    const v = vm[i.vendorId] || {name: 'Unknown vendor'}, r = rows[i.vendorId] || (rows[i.vendorId] = {id: i.vendorId, name: v.name, gstin: v.gstin || '', msme: v.msme || '', creditDays: v.creditDays, advance: num(v.advanceBalance), up: 0, b0: 0, b31: 0, b61: 0, b90: 0, total: 0, overdue: 0, msme45: 0, bills: []});
    const dpd = dayDiff(i.dueDate || i.invoiceDate), age = dayDiff(i.invoiceDate);
    r.total += bal; r.bills.push({...i, balance: bal, dpd, age});
    if(dpd == null || dpd <= 0) r.up += bal; else { r.overdue += bal; if(dpd <= 30) r.b0 += bal; else if(dpd <= 60) r.b31 += bal; else if(dpd <= 90) r.b61 += bal; else r.b90 += bal; }
    if(['micro', 'small'].includes(r.msme) && age != null && age > 45) r.msme45 += bal;
  });
  return Object.values(rows);
}
function venTotals(){
  const R = venRows(), sum = f => R.reduce((a, r) => a + f(r), 0), month = new Date().toISOString().slice(0, 7);
  return {R, total: sum(r => r.total), overdue: sum(r => r.overdue), msme45: sum(r => r.msme45), nMsme: R.filter(r => r.msme45 > 0.5).length, n: R.length, nOver: R.filter(r => r.overdue > 0.5).length,
    paidMonth: VEN.payments.filter(p => String(p.paymentDate || '').slice(0, 7) === month).reduce((a, p) => a + num(p.amount), 0),
    b: {up: sum(r => r.up), b0: sum(r => r.b0), b31: sum(r => r.b31), b61: sum(r => r.b61), b90: sum(r => r.b90)}};
}
function venMessage(){
  if(VEN.state === '' || VEN.state === 'loading') return '<div class="empty">Loading vendor bills from the Vendor Payments portal…</div>';
  if(VEN.state.startsWith('error:')) return `<div class="card-b" style="color:var(--crit)"><b>Could not read vendor payments.</b><p>${esc(VEN.state.slice(6))}</p><button class="btn sm" onclick="loadVen(true)">Try again</button></div>`;
  return '';
}
function payCard(){
  ensureVen();
  const head = `<div class="card-h"><h3>Money To Pay</h3><span class="hint">from Vendor Payments${VEN.state === 'ok' ? ' · updated ' + new Date(VEN.at).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) : ''}</span><a class="btn sm" href="#payables" style="margin-left:auto;text-decoration:none">All payables →</a></div>`;
  if(VEN.state !== 'ok') return `<div class="card">${head}${venMessage()}</div>`;
  const T = venTotals(), top = T.R.slice().sort((a, b) => b.total - a.total).slice(0, 5), net = OUT.state === 'ok' ? outTotals().net - T.total : null;
  const big = (label, v, color, note) => `<div><div class="hint">${label}</div><div style="font-size:30px;font-weight:700;font-family:var(--font)${color ? ';color:' + color : ''}">${v}</div><div class="hint">${note || ''}</div></div>`;
  return `<div class="card">${head}<div class="card-b">
    ${T.msme45 > 0.5 ? `<div class="banner crit" style="margin-bottom:16px"><span style="font-size:18px">⚠</span><div style="flex:1"><b>${inr0(T.msme45)}</b> owed to <b>${T.nMsme}</b> MSME (micro/small) supplier${T.nMsme > 1 ? 's' : ''} for more than 45 days — under Sec 43B(h) this expense is disallowed until paid.</div><a class="btn sm" href="#payables" style="text-decoration:none">View</a></div>` : ''}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:28px">
    <div><div style="display:flex;gap:28px;flex-wrap:wrap;margin-bottom:16px">
      ${big('To pay', inrC(T.total), '', T.n + ' vendors')}${big('Overdue', inrC(T.overdue), 'var(--crit)', T.nOver + ' vendors')}${big('Paid this month', inrC(T.paidMonth), 'var(--ok)', '')}
      ${net != null ? big('Net (collect − pay)', inrC(net), net < 0 ? 'var(--crit)' : 'var(--ok)', 'receivables minus payables') : ''}</div>
      ${ageBar(T.b)}</div>
    <div><div class="hint" style="margin-bottom:4px">Top 5 vendors by amount due</div>${top.map(r => `<div class="debt" onclick="venDue(${jsq(r.id)})"><span class="nm">${esc(r.name)}${['micro', 'small'].includes(r.msme) ? ' <span class="pill warn">MSME</span>' : ''}</span><span class="amt">${inrC(r.total)}</span><span class="hint">${r.overdue > 0.5 ? '<b style="color:var(--crit)">' + inrC(r.overdue) + ' overdue</b>' : 'not yet due'}</span><span class="hint" style="text-align:right">${r.msme45 > 0.5 ? '<b style="color:var(--crit)">' + inrC(r.msme45) + ' past 45 d</b>' : ''}</span></div>`).join('') || '<div class="empty">Nothing to pay 🎉</div>'}</div>
  </div></div></div>`;
}
let VQ = '', VFLT = 'all', VSORT = 'total';
function vPayables(){
  $('#ttl').textContent = 'Vendor Payables';
  $('#topr').innerHTML = `<button class="btn" onclick="loadVen(true)">↻ Refresh</button> <a class="btn" href="vendor-payments.html" style="text-decoration:none">Vendor Payments →</a>`;
  ensureVen();
  if(VEN.state !== 'ok'){ $('#view').innerHTML = `<div class="card">${venMessage()}</div>`; return; }
  const T = venTotals();
  $('#view').innerHTML = `
  <div class="grid g4" style="margin-bottom:18px">
    <div class="stat" style="--c:#2563EB"><div class="k">Total to pay</div><div class="v">${inrC(T.total)}</div><div class="n">${T.n} vendors with open bills</div></div>
    <div class="stat" style="--c:#B91C1C"><div class="k">Overdue</div><div class="v" style="color:var(--crit)">${inrC(T.overdue)}</div><div class="n">${T.nOver} vendors past due date</div></div>
    <div class="stat" style="--c:#7F1D1D"><div class="k">MSME over 45 days</div><div class="v">${inrC(T.msme45)}</div><div class="n">Sec 43B(h) — pay to keep the expense allowable</div></div>
    <div class="stat" style="--c:#15803D"><div class="k">Paid this month</div><div class="v">${inrC(T.paidMonth)}</div><div class="n">payments recorded this month</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Ageing of what we owe</h3></div><div class="card-b">${ageBar(T.b)}</div></div>
  <div class="card"><div class="card-h"><input id="vq" placeholder="Search vendor…" value="${esc(VQ)}" style="max-width:260px">
    <select id="vflt" style="max-width:200px">${[['all', 'All vendors'], ['overdue', 'Overdue only'], ['msme', 'MSME over 45 days'], ['d60', 'Over 60 days']].map(o => `<option value="${o[0]}" ${VFLT === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
    <select id="vsort" style="max-width:190px">${[['total', 'Largest amount'], ['overdue', 'Largest overdue'], ['msme45', 'MSME risk first'], ['name', 'Name A–Z']].map(o => `<option value="${o[0]}" ${VSORT === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div><div class="tw" id="vbody"></div></div>`;
  $('#vq').oninput = e => { VQ = e.target.value; drawPay(); }; $('#vflt').onchange = e => { VFLT = e.target.value; drawPay(); }; $('#vsort').onchange = e => { VSORT = e.target.value; drawPay(); };
  drawPay();
}
function drawPay(){
  const q = VQ.toLowerCase();
  let L = venRows().filter(r => (!q || (r.name + ' ' + r.gstin).toLowerCase().includes(q)) &&
    (VFLT === 'all' || (VFLT === 'overdue' && r.overdue > 0.5) || (VFLT === 'msme' && r.msme45 > 0.5) || (VFLT === 'd60' && r.b61 + r.b90 > 0.5)));
  const key = {total: r => -r.total, overdue: r => -r.overdue, msme45: r => -r.msme45}[VSORT];
  L = key ? L.sort((a, b) => key(a) - key(b)) : L.sort((a, b) => String(a.name).localeCompare(b.name));
  const cell = v => v > 0.5 ? inr0(v) : '<span class="hint">·</span>';
  $('#vbody').innerHTML = L.length ? `<table><thead><tr><th>Vendor</th><th class="num">Not due</th><th class="num">0–30 d</th><th class="num">31–60 d</th><th class="num">61–90 d</th><th class="num">90+ d</th><th class="num">Total</th><th>MSME</th></tr></thead><tbody>
  ${L.map(r => `<tr class="click" onclick="venDue(${jsq(r.id)})"><td><b>${esc(r.name)}</b><div class="hint">${[r.gstin, r.advance > 0.5 ? 'advance ' + inr0(r.advance) : ''].filter(Boolean).map(esc).join(' · ')}</div></td>
    <td class="num">${cell(r.up)}</td><td class="num">${cell(r.b0)}</td><td class="num">${cell(r.b31)}</td><td class="num" style="color:#c2410c">${cell(r.b61)}</td><td class="num" style="color:#7F1D1D;font-weight:600">${cell(r.b90)}</td>
    <td class="num"><b>${inr0(r.total)}</b></td><td>${['micro', 'small'].includes(r.msme) ? (r.msme45 > 0.5 ? `<span class="pill crit">${inrC(r.msme45)} &gt; 45 d</span>` : '<span class="pill warn">' + esc(r.msme) + '</span>') : r.msme === 'medium' ? '<span class="pill">medium</span>' : '<span class="hint">—</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No vendors match.</div>';
}
function venDue(id){
  const r = venRows().find(x => x.id === id); if(!r) return;
  const bills = r.bills.slice().sort((a, b) => (b.dpd || 0) - (a.dpd || 0));
  const pays = VEN.payments.filter(p => p.vendorId === id).sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate))).slice(0, 5);
  const when = x => x.dpd > 0 ? `<span class="pill ${x.dpd > 60 ? 'crit' : 'warn'}">${x.dpd} d overdue</span>` : `<span class="pill blue">due in ${-(x.dpd || 0)} d</span>`;
  modal(`<div class="modal-h"><h3>${esc(r.name)}</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b">
    <div class="grid g4" style="margin-bottom:14px"><div class="stat" style="--c:#2563EB"><div class="k">To pay</div><div class="v" style="font-size:22px">${inr0(r.total)}</div></div>
      <div class="stat" style="--c:#B91C1C"><div class="k">Overdue</div><div class="v" style="font-size:22px;color:var(--crit)">${inr0(r.overdue)}</div></div>
      <div class="stat" style="--c:#15803D"><div class="k">Advance paid</div><div class="v" style="font-size:22px">${inr0(r.advance)}</div></div>
      <div class="stat" style="--c:#7c5cff"><div class="k">MSME</div><div class="v" style="font-size:22px">${esc(r.msme || '—')}</div><div class="n">${num(r.creditDays) || 0} days credit</div></div></div>
    ${r.msme45 > 0.5 ? `<div class="banner crit"><span>⚠</span><div><b>${inr0(r.msme45)}</b> unpaid for more than 45 days to an MSME supplier — Sec 43B(h).</div></div>` : ''}
    ${ageBar({up: r.up, b0: r.b0, b31: r.b31, b61: r.b61, b90: r.b90})}
    <div class="tw" style="margin-top:14px;max-height:300px"><table><thead><tr><th>Bill</th><th>Bill date</th><th>Due</th><th class="num">Amount</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
    ${bills.map(x => `<tr><td class="mono"><b>${esc(x.invoiceNo || '')}</b></td><td>${esc(String(x.invoiceDate || '').slice(0, 10))}</td><td>${esc(String(x.dueDate || '').slice(0, 10))}</td><td class="num">${inr0(x.amount)}</td><td class="num"><b>${inr0(x.balance)}</b></td><td>${when(x)}</td></tr>`).join('')}</tbody></table></div>
    ${pays.length ? `<div class="hint" style="margin:14px 0 6px">Last payments</div><div class="chips">${pays.map(p => `<span class="chip"><b>${inr0(p.amount)}</b> · ${esc(String(p.paymentDate || '').slice(0, 10))}${p.mode ? ' · ' + esc(p.mode) : ''}</span>`).join('')}</div>` : ''}
  </div><div class="modal-f"><a class="btn pri" href="vendor-payments.html" style="text-decoration:none">Open in Vendor Payments</a></div>`);
}

/* ---------- dashboard ---------- */
function vDash(){
  $('#ttl').textContent = 'Dashboard';
  const open = PO.map(p => ({p, s: poStatus(itemsOfPo(p))})).filter(x => x.s.open > 0);
  const overdue = open.filter(x => lateDays(x.p) > 0);
  const month = new Date().toISOString().slice(0, 7);
  const dispM = DESP.filter(d => (toDate(d.despatchDate) || toDate(d.createdAt) || new Date(0)).toISOString().slice(0, 7) === month).reduce((a, d) => a + num(d.qtyDespatched), 0);
  const wipBy = STAGES.map(s => ({...s, cnt: ITEMS_PO.reduce((a, i) => a + itemState(i).q[s.k], 0)}));
  const notStarted = ITEMS_PO.reduce((a, i) => a + itemState(i).notStarted, 0);
  const openLeads = LEADS.filter(l => !['Won','Lost'].includes(l.stage)).length;
  const quotesOut = QUOTES.filter(q => q.status === 'Sent').length, quotesWait = QUOTES.filter(q => q.status === 'Pending approval').length;
  const mx = Math.max(1, notStarted, ...wipBy.map(w => w.cnt));
  $('#view').innerHTML = `
  <div class="card"><div class="card-h"><h3>Order-To-Dispatch Pipeline</h3><span class="hint">live from Sales, PO Management and this tracker</span></div><div class="card-b">
    <div class="flow">
      <div class="st"><div class="k">Open inquiries</div><div class="v">${openLeads}</div><a href="sales-crm.html#leads">Sales →</a></div>
      <div class="st"><div class="k">Quotes out</div><div class="v">${quotesOut}</div><div class="hint">${quotesWait} awaiting approval</div></div>
      <div class="st"><div class="k">Open orders</div><div class="v">${open.length}</div><a href="#orders">Tracker →</a></div>
      <div class="st"><div class="k">Not started (pcs)</div><div class="v">${notStarted}</div><div class="hint">no stage yet</div></div>
      <div class="st"><div class="k">In production (pcs)</div><div class="v">${wipBy.reduce((a,w)=>a+(w.k==='ready'?0:w.cnt),0)}</div><a href="#wip">Board →</a></div>
      <div class="st"><div class="k">Ready (pcs)</div><div class="v">${wipBy.find(w=>w.k==='ready').cnt}</div><a href="dispatch-board.html">Dispatch →</a></div>
      <div class="st"><div class="k">Dispatched this month</div><div class="v">${dispM}</div><div class="hint">pcs</div></div>
    </div></div></div>
  ${moneyCard()}
  ${payCard()}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="stat" style="--c:#2F6FED"><div class="k">Open orders</div><div class="v">${open.length}</div><div class="n">${open.reduce((a,x)=>a+x.s.open,0)} pcs pending</div></div>
    <div class="stat" style="--c:#c0201c"><div class="k">Overdue orders</div><div class="v">${overdue.length}</div><div class="n">past delivery date</div></div>
    <div class="stat" style="--c:#c27803"><div class="k">Costing sheets</div><div class="v">${Object.keys(COST).length}</div><div class="n">of ${new Set([...RATES.map(r=>r.itemCode),...ITEMS_PO.map(i=>i.itemCode)]).size} items</div></div>
    <div class="stat" style="--c:#1a8f4c"><div class="k">Scrapped pieces</div><div class="v">${Object.values(STG).reduce((a,s)=>a+num(s.scrapQty),0)}</div><div class="n">logged in tracker</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Work In Process By Stage</h3></div><div class="card-b">
    ${[{n:'Not started',c:'#bfc3cc',v:notStarted}, ...wipBy.map(w => ({n:w.n, c:w.c, v:w.cnt}))].map(w => `
      <div style="display:grid;grid-template-columns:170px 1fr 60px;gap:10px;align-items:center;margin-bottom:8px"><span>${w.n}</span>
      <div class="bar" style="height:14px"><i style="width:${w.v/mx*100}%;background:${w.c}"></i></div><b class="num">${w.v}</b></div>`).join('')}
  </div></div>
  <div class="card"><div class="card-h"><h3>Overdue Orders</h3></div>${overdue.length ? `<div class="tw"><table><thead><tr><th>PO</th><th>Customer</th><th>Due</th><th class="num">Late</th><th class="num">Pending pcs</th><th>Status</th></tr></thead><tbody>
    ${overdue.sort((a,b)=>lateDays(b.p)-lateDays(a.p)).slice(0,12).map(x => `<tr class="click" onclick="go('order/${x.p.id}')"><td class="mono"><b>${esc(x.p.poNo)}</b></td><td>${esc(x.p.customerName)}</td><td>${fmtD(x.p.deliveryDate)}</td><td class="num"><span class="pill crit">${lateDays(x.p)} d</span></td><td class="num">${x.s.open}</td><td><span class="pill ${x.s.cls}">${x.s.label}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No overdue orders 🎉</div>'}</div>`;
}

/* ---------- orders ---------- */
let OQ = '', OF = 'open';
function vOrders(){
  ensureOut();
  $('#ttl').textContent = 'Order Tracker';
  $('#topr').innerHTML = `<a class="btn pri" href="po-management.html" style="text-decoration:none">＋ New PO (PO Management)</a>`;
  $('#view').innerHTML = `<div class="card"><div class="card-h"><input id="oq" placeholder="Search PO, customer, item…" value="${esc(OQ)}" style="max-width:300px">
    <select id="of" style="max-width:180px">${[['open','Open orders'],['all','All orders'],['late','Overdue'],['done','Completed']].map(o => `<option value="${o[0]}" ${OF===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div><div class="tw" id="obody"></div></div>`;
  $('#oq').oninput = e => { OQ = e.target.value; drawOrders(); }; $('#of').onchange = e => { OF = e.target.value; drawOrders(); };
  drawOrders();
}
function drawOrders(){
  const q = OQ.toLowerCase();
  const rows = PO.map(p => ({p, items: itemsOfPo(p)})).map(x => ({...x, s: poStatus(x.items)})).filter(x =>
    (OF === 'all' || (OF === 'open' && x.s.open > 0) || (OF === 'late' && x.s.open > 0 && lateDays(x.p) > 0) || (OF === 'done' && x.s.open <= 0 && x.s.ord > 0)) &&
    (!q || [x.p.poNo, x.p.customerName, ...x.items.map(i => i.itemCode)].join(' ').toLowerCase().includes(q)));
  rows.sort((a, b) => (toDate(a.p.deliveryDate) || 0) - (toDate(b.p.deliveryDate) || 0));
  $('#obody').innerHTML = rows.length ? `<table><thead><tr><th>PO</th><th>Customer</th><th>Items</th><th>Delivery</th><th style="min-width:200px">Progress</th><th>Status</th><th>Customer dues</th></tr></thead><tbody>
  ${rows.map(x => { const late = lateDays(x.p); const sts = x.items.map(itemState); const nsT = sts.reduce((a,s)=>a+s.notStarted,0), ipT = sts.reduce((a,s)=>a+s.inProc-s.q.ready,0), rdT = sts.reduce((a,s)=>a+s.q.ready,0), dpT = x.s.desp, tot = Math.max(1, x.s.ord);
    return `<tr class="click" onclick="go('order/${x.p.id}')"><td class="mono"><b>${esc(x.p.poNo)}</b><div class="hint">${fmtD(x.p.poDate)}</div></td><td>${esc(x.p.customerName)}</td><td>${x.items.length} <span class="hint">· ${x.s.ord} pcs</span></td>
    <td>${fmtD(x.p.deliveryDate)}${x.s.open > 0 && late > 0 ? ` <span class="pill crit">${late} d late</span>` : ''}</td>
    <td><div class="bar" title="not started ${nsT} · in process ${ipT} · ready ${rdT} · dispatched ${dpT}"><i style="width:${dpT/tot*100}%;background:#1a8f4c"></i><i style="width:${rdT/tot*100}%;background:#7fd4a1"></i><i style="width:${ipT/tot*100}%;background:#e8a317"></i></div><div class="hint">${x.s.desp}/${x.s.ord} dispatched</div></td>
    <td><span class="pill ${x.s.cls}">${x.s.label}</span></td><td>${dueCell(x.p)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">No orders match.</div>';
}

/* ---------- single order ---------- */
function vOrder(id){
  const p = PO.find(x => x.id === id); if(!p){ $('#ttl').textContent = 'Order'; $('#view').innerHTML = '<div class="empty">Loading… or order not found. <a href="#orders">Back</a></div>'; return; }
  const items = itemsOfPo(p), s = poStatus(items);
  $('#ttl').textContent = 'PO ' + p.poNo;
  $('#topr').innerHTML = ERP_MODE === 'board' ? `<a class="btn" href="#wip" style="text-decoration:none">← Shop-floor Board</a>` : `<a class="btn" href="#orders" style="text-decoration:none">← Orders</a>`;
  const quote = QUOTES.find(q => q.poNo && String(q.poNo).trim().toLowerCase() === String(p.poNo).trim().toLowerCase() && String(q.customerName).toLowerCase() === String(p.customerName).toLowerCase());
  const lead = quote && LEADS.find(l => l.id === quote.leadId);
  const first = ts => ts ? fmtD(ts) : '—';
  const value = items.reduce((a, i) => a + rateOf(i.itemCode) * num(i.orderedQty), 0);
  const cost = items.reduce((a, i) => { const c = costOf(i.itemCode); return a + (c ? c.total * num(i.orderedQty) : 0); }, 0);
  const allCosted = items.length && items.every(i => costOf(i.itemCode));
  const dispatches = DESP.filter(d => d.poId === p.id).sort((a, b) => (toDate(a.despatchDate) || 0) - (toDate(b.despatchDate) || 0));
  ensureOut(); const dueR = dueFor(p.customerId, p.customerName), dueOD = dueR ? overdueOf(dueR) : 0;
  $('#view').innerHTML = `
  ${dueR && dueOD > 0.5 ? `<div class="banner ${over60(dueR) > 0.5 ? 'crit' : 'warn'}"><span style="font-size:18px">⚠</span><div style="flex:1"><b>${esc(p.customerName)}</b> has <b>${inr0(dueOD)}</b> overdue${over60(dueR) > 0.5 ? ` (<b>${inr0(over60(dueR))}</b> older than 60 days)` : ''} — total outstanding ${inr0(dueR.total)}. Check before dispatching.</div><button class="btn sm" onclick="custDue(${jsq(dueR.custId)})">View bills</button></div>` : ''}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="stat" style="--c:#2F6FED"><div class="k">Customer</div><div class="v" style="font-size:16px">${esc(p.customerName)}</div><div class="n">PO date ${fmtD(p.poDate)}</div></div>
    <div class="stat" style="--c:#c27803"><div class="k">Delivery</div><div class="v" style="font-size:20px">${fmtD(p.deliveryDate)}</div><div class="n">${s.open > 0 && lateDays(p) > 0 ? `<span class="pill crit">${lateDays(p)} d late</span>` : esc(p.deliveryRemark || '')}</div></div>
    <div class="stat" style="--c:#1a8f4c"><div class="k">Status</div><div class="v" style="font-size:20px">${s.label}</div><div class="n">${s.desp}/${s.ord} pcs dispatched</div></div>
    <div class="stat" style="--c:#7c5cff"><div class="k">Est. value / cost</div><div class="v" style="font-size:18px">${value ? inr(value) : '—'}</div><div class="n">${allCosted ? `cost ${inr(cost)} · margin ${value ? ((value - cost) / value * 100).toFixed(1) + '%' : '—'}` : 'costing sheet missing for some items'}</div></div>
  </div>
  <div class="card"><div class="card-h"><h3>Order journey</h3></div><div class="card-b"><div class="tl">
    <div class="it ${lead ? 'done' : ''}"><b>Inquiry</b> ${lead ? `${esc(lead.leadNo)} · ${esc(lead.source || '')} · ${first(lead.createdAt)}` : '<span class="hint">no linked inquiry (PO entered directly)</span>'}</div>
    <div class="it ${quote ? 'done' : ''}"><b>Quotation</b> ${quote ? `${esc(quote.quoteNo)} · ${esc(quote.status)} · ${inr(quote.total)}` : '<span class="hint">no linked quotation</span>'}</div>
    <div class="it done"><b>Customer PO received</b> ${esc(p.poNo)} · ${fmtD(p.poDate)}</div>
    <div class="it ${s.inProc || s.desp ? 'done' : ''}"><b>Production</b> ${s.inProc} pcs in process · ${s.ready} ready</div>
    <div class="it ${s.desp ? 'done' : ''}"><b>Dispatch</b> ${dispatches.length ? dispatches.map(d => `${fmtD(d.despatchDate)}: ${d.qtyDespatched} × ${esc(d.itemCode)} (inv ${esc(d.invoiceNumber || '—')})`).join('<br>') : '<span class="hint">nothing dispatched yet — enter in PO Management</span>'}</div>
  </div></div></div>
  <div class="card"><div class="card-h"><h3>Items &amp; working stage</h3><span class="hint">Move pieces forward as they finish each stage</span></div><div class="tw"><table>
    <thead><tr><th>Item</th><th class="num">Ordered</th><th>Where the pieces are</th><th class="num">Dispatched</th><th></th></tr></thead><tbody>
    ${items.map(i => { const st = itemState(i), c = costOf(i.itemCode); return `<tr><td><b class="mono">${esc(i.itemCode)}</b><div class="hint">${esc(i.itemDescription || '')}</div>${c ? `<div class="hint">cost ${inr(c.total)}/pc</div>` : `<div class="hint" style="color:var(--warn)">no costing sheet</div>`}</td>
      <td class="num">${st.ordered}</td>
      <td><div class="chips">${st.notStarted ? `<span class="chip"><b>${st.notStarted}</b> not started</span>` : ''}${STAGES.filter(s => st.q[s.k] > 0).map(s => `<span class="chip ${s.k === 'ready' ? 'done' : 'on'}"><b>${st.q[s.k]}</b> ${esc(s.n)}</span>`).join('')}${st.scrap ? `<span class="chip" style="background:#fde4e3"><b>${st.scrap}</b> scrapped</span>` : ''}</div></td>
      <td class="num">${st.desp}</td>
      <td><button class="btn sm pri" onclick="openMove('${i.id}')" ${st.open <= 0 ? 'disabled' : ''}>Move</button> <button class="btn sm" onclick="openHistory('${i.id}')">History</button></td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}

/* ---------- move pieces between stages ---------- */
/* Move pieces: tick every stage the pieces have just finished (several at once is fine).
   The pieces end up in the last ticked stage; history records each ticked stage as its own step. */
function openMove(itemId){
  const it = ITEMS_PO.find(i => i.id === itemId), st = itemState(it);
  const froms = [...(st.notStarted ? [{k:'__ns', n:'Not started', q:st.notStarted}] : []), ...STAGES.filter(s => st.q[s.k] > 0).map(s => ({k:s.k, n:s.n, q:st.q[s.k]}))];
  if(!froms.length){ toast('Nothing left to move for this item'); return; }
  modal(`<div class="modal-h"><h3>Move pieces — ${esc(it.itemCode)}</h3><button class="btn sm" onclick="closeModal()">✕</button></div>
  <div class="modal-b"><div class="form">
    <div class="fld"><label>From</label><select id="mvFrom">${froms.map(f => `<option value="${f.k}" data-q="${f.q}">${esc(f.n)} (${f.q} pcs)</option>`).join('')}</select></div>
    <div class="fld"><label>Pieces</label><input id="mvQty" type="number" min="1" value="${froms[0].q}"></div>
    <div class="fld full"><label>Stages done now — tick one or more</label><div id="mvStages" class="stk"></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" type="button" onclick="mvTick('next')">Next stage only</button><button class="btn sm" type="button" onclick="mvTick('all')">All up to Ready</button><button class="btn sm" type="button" onclick="mvTick('none')">Clear</button></div></div>
    <label class="fld full" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="mvScrap" style="width:auto"> <span>✖ These pieces were <b>rejected / scrapped</b> instead</span></label>
    <div class="fld full"><label>Done by / note</label><input id="mvNote" placeholder="operator, challan no, reason for rejection…"></div>
    <div class="full sumbox" id="mvSum" style="font-weight:600"></div>
  </div></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" id="mvSave" onclick="saveMove('${itemId}')">Save move</button></div>`);
  const drawStages = () => {
    const fi = STAGES.findIndex(s => s.k === $('#mvFrom').value);   // -1 for "not started"
    $('#mvStages').innerHTML = STAGES.map((s, i) => i <= fi ? '' : `<label class="stb" style="--c:${s.c}"><input type="checkbox" value="${s.k}" ${i === fi + 1 ? 'checked' : ''}><span>${esc(s.n)}</span></label>`).join('') || '<span class="hint">Already in the last stage — use Rejected, or dispatch it in PO Management.</span>';
    $$('#mvStages input').forEach(c => c.onchange = mvSummary);
    const o = $('#mvFrom').selectedOptions[0]; $('#mvQty').max = o.dataset.q; $('#mvQty').value = o.dataset.q; mvSummary();
  };
  $('#mvFrom').onchange = drawStages; $('#mvQty').oninput = mvSummary; $('#mvScrap').onchange = mvSummary; drawStages();
}
function mvTick(mode){ const cs = $$('#mvStages input'); cs.forEach((c, i) => c.checked = mode === 'all' ? true : mode === 'next' ? i === 0 : false); mvSummary(); }
function mvPicked(){ return $$('#mvStages input').filter(c => c.checked).map(c => c.value); }
function mvSummary(){
  const q = Math.floor(num($('#mvQty').value)), scrap = $('#mvScrap').checked, picked = mvPicked();
  $$('#mvStages .stb').forEach(l => l.classList.toggle('dim', scrap));
  $('#mvSum').textContent = scrap ? `${q} pcs will be marked rejected / scrapped.` : picked.length ? `${q} pcs → ${picked.map(k => STAGES.find(s => s.k === k).n).join(' → ')}. They will now be in “${STAGES.find(s => s.k === picked[picked.length - 1]).n}”.` : 'Tick at least one stage.';
}
async function saveMove(itemId){
  const it = ITEMS_PO.find(i => i.id === itemId), from = $('#mvFrom').value, qty = Math.floor(num($('#mvQty').value)), note = $('#mvNote').value.trim();
  const scrap = $('#mvScrap').checked, picked = mvPicked(), avail = num($('#mvFrom').selectedOptions[0].dataset.q);
  if(qty < 1 || qty > avail){ toast('Pieces must be between 1 and ' + avail); return; }
  if(!scrap && !picked.length){ toast('Tick at least one stage'); return; }
  $('#mvSave').disabled = true;
  const ref = db.collection('erp_itemStages').doc(itemId), name = k => k === '__ns' ? 'Not started' : k === '__scrap' ? 'Scrapped' : STAGES.find(s => s.k === k).n;
  const steps = scrap ? ['__scrap'] : picked, to = steps[steps.length - 1];
  try{
    await db.runTransaction(async tx => {
      const cur = await tx.get(ref), d = cur.exists ? cur.data() : {stageQty:{}, history:[], scrapQty:0};
      const sq = {...(d.stageQty || {})}, now = new Date().toISOString();
      if(from !== '__ns') sq[from] = Math.max(0, num(sq[from]) - qty);
      let scrapQ = num(d.scrapQty);
      if(to === '__scrap') scrapQ += qty; else sq[to] = num(sq[to]) + qty;
      const add = []; let prev = from; steps.forEach(k => { add.push({at: now, by: me(), from: name(prev), to: name(k), qty, note}); prev = k; });
      const hist = [...(d.history || []), ...add].slice(-200);
      tx.set(ref, {poItemId: itemId, poNo: it.poNo, itemCode: it.itemCode, stageQty: sq, scrapQty: scrapQ, history: hist, updatedAt: now}, {merge: true});
    });
    closeModal(); toast(`${qty} pcs → ${name(to)}${steps.length > 1 ? ' (' + steps.length + ' stages)' : ''}`);
  }catch(e){ toast('Could not save: ' + e.message); $('#mvSave').disabled = false; }
}
function openHistory(itemId){
  const it = ITEMS_PO.find(i => i.id === itemId), h = ((STG[itemId] || {}).history || []).slice().reverse();
  modal(`<div class="modal-h"><h3>Stage history — ${esc(it.itemCode)}</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b">
  ${h.length ? `<table><thead><tr><th>When</th><th>Move</th><th class="num">Pcs</th><th>By</th><th>Note</th></tr></thead><tbody>${h.map(x => `<tr><td>${new Date(x.at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td>${esc(x.from)} → <b>${esc(x.to)}</b></td><td class="num">${x.qty}</td><td>${esc((x.by||'').split('@')[0])}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No stage moves recorded yet.</div>'}</div>`);
}

/* ---------- shop-floor board: every open item × every stage ---------- */
let WQ = '', WST = '';
/* Shop-floor board: stage tabs with piece counts, then one compact card per open order line.
   Only the stages that actually hold pieces are shown, so nothing runs off the right of the screen. */
function vWip(){
  $('#ttl').textContent = 'Shop-Floor Board';
  $('#view').innerHTML = `<div class="card"><div class="card-b" style="padding-bottom:10px"><div id="wtabs" class="wtabs"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><input id="wq" placeholder="Search item, PO, customer…" value="${esc(WQ)}" style="max-width:320px">
    <span class="hint">Tap a stage to see only the lines with pieces there. Tap a line to open its order.</span></div>
    <div id="syncBar" class="syncbar"></div></div><div id="wbody"></div></div>`;
  drawSyncBar();
  $('#wq').oninput = e => { WQ = e.target.value; drawWip(); }; drawWip();
}
function wipSetStage(k){ WST = WST === k ? '' : k; drawWip(); }
function drawWip(){
  const q = WQ.toLowerCase();
  const base = ITEMS_PO.map(i => ({i, s: itemState(i)})).filter(x => x.s.open > 0 && (!q || [x.i.itemCode, x.i.itemDescription, x.i.poNo, x.i.customerName].join(' ').toLowerCase().includes(q)));
  const inStage = (x, k) => k === '__ns' ? x.s.notStarted > 0 : x.s.q[k] > 0;
  const tabs = [{k: '', n: 'All lines', c: '#0F1115', pcs: base.reduce((a, x) => a + x.s.open, 0), lines: base.length},
    {k: '__ns', n: 'Not started', c: '#9CA3AF', pcs: base.reduce((a, x) => a + x.s.notStarted, 0), lines: base.filter(x => inStage(x, '__ns')).length},
    ...STAGES.map(st => ({k: st.k, n: st.n, c: st.c, pcs: base.reduce((a, x) => a + x.s.q[st.k], 0), lines: base.filter(x => inStage(x, st.k)).length}))];
  $('#wtabs').innerHTML = tabs.map(t => `<button class="wtab ${WST === t.k ? 'on' : ''}" style="--c:${t.c}" onclick="wipSetStage(${jsq(t.k)})"><span class="wn">${esc(t.n)}</span><b>${t.pcs.toLocaleString('en-IN')}</b><span class="wl">${t.lines} line${t.lines === 1 ? '' : 's'}</span></button>`).join('');
  const rows = base.filter(x => !WST || inStage(x, WST)).sort((a, b) => (toDate(a.i.deliveryDate) || new Date(8.64e15)) - (toDate(b.i.deliveryDate) || new Date(8.64e15)));
  const shown = rows.slice(0, 300);
  $('#wbody').innerHTML = rows.length ? shown.map(x => {
    const late = x.i.deliveryDate ? lateDays({deliveryDate: x.i.deliveryDate}) : 0, tot = Math.max(1, x.s.ordered);
    const segs = [['#9CA3AF', x.s.notStarted], ...STAGES.map(st => [st.c, x.s.q[st.k]]), ['#15803D', x.s.desp]].filter(p => p[1] > 0);
    const where = [x.s.notStarted ? `<span class="chip"><b>${x.s.notStarted}</b> not started</span>` : '', ...STAGES.filter(st => x.s.q[st.k] > 0).map(st => `<span class="chip" style="background:color-mix(in srgb, ${st.c} 14%, white);color:${st.c}"><b>${x.s.q[st.k]}</b> ${esc(st.n)}</span>`), x.s.desp ? `<span class="chip done"><b>${x.s.desp}</b> dispatched</span>` : ''].join('');
    return `<div class="wrow" onclick="go('order/${x.i.poId}')">
      <div class="wi"><b class="mono">${esc(x.i.itemCode)}</b>${x.i.itemDescription && x.i.itemDescription !== x.i.itemCode ? `<div class="hint wd">${esc(x.i.itemDescription)}</div>` : ''}</div>
      <div class="wp"><b>${esc(x.i.poNo)}</b><div class="hint">${esc(x.i.customerName)}</div></div>
      <div class="wdue">${x.i.deliveryDate ? fmtD(x.i.deliveryDate) : '<span class="hint">no date</span>'}${late > 0 ? `<div><span class="pill crit">${late} d late</span></div>` : ''}</div>
      <div class="wq"><div class="hint">open</div><b>${x.s.open}</b><span class="hint"> / ${x.s.ordered}</span></div>
      <div class="wst"><div class="bar" style="height:10px;margin-bottom:6px">${segs.map(p => `<i style="width:${p[1] / tot * 100}%;background:${p[0]}"></i>`).join('')}</div><div class="chips">${where}</div></div>
      <div class="wa"><button class="btn sm pri" onclick="event.stopPropagation();openMove('${x.i.id}')">Move</button></div></div>`; }).join('') +
    (rows.length > 300 ? `<div class="hint" style="padding:12px 18px">Showing the 300 earliest-due of ${rows.length} lines — search or pick a stage to narrow.</div>` : '')
    : `<div class="empty">${WST ? 'No pieces in this stage right now.' : 'No open order lines.'}</div>`;
}

/* ---------- AUTO-SYNC: entries made in other portals move pieces on the Shop-floor Board ----------
   Casting Control challan line  → Casting           (every line's quantity, as pieces)
   Production "1 (Bottom)"       → Machining         (first machining operation; later operations stay inside Machining)
   Production "5 (Inspection)"   → Inspection
   Production "6 (Paint)"        → Painting
   Dispatch Board paint challan  → Ready to Dispatch (painted stock-in; "Repaint" lines are rework and are skipped)
   PO Management dispatch        → Dispatched        (already counted directly)
   Pieces go to open PO lines of the same item, earliest delivery date first. Each source entry is applied exactly once
   (a marker document in erp_sync is written in the same transaction), so several open screens never double-count.
   Only entries dated on/after the "auto-sync from" date are used, so old history is not replayed. */
const PROD_FB = {apiKey: "AIzaSyA-g_9GoUg3W1dfxjxFsvH-w130S6y_eAU", authDomain: "jayco-production.firebaseapp.com", databaseURL: "https://jayco-production-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jayco-production", storageBucket: "jayco-production.firebasestorage.app", messagingSenderId: "1064982683384", appId: "1:1064982683384:web:00786a7d04ac6f6728650d"};
const PROD_EMAIL = 'staff@jayco-production.local';
const PROD_STAGE_MAP = {'1 (bottom)': 'machining', '5 (inspection)': 'inspection', '6 (paint)': 'painting'};
let SYNC = {state: '', at: 0, applied: 0, unmatched: [], prod: '', cast: '', paint: '', running: false};
function prodApp(){ return firebase.apps.find(a => a.name === 'production') || firebase.initializeApp(PROD_FB, 'production'); }
async function prodSignIn(pwd){ const a = firebase.auth(prodApp()); if(a.currentUser) return; await a.signInWithEmailAndPassword(PROD_EMAIL, pwd); }
function prodReady(){ return new Promise(res => { const a = firebase.auth(prodApp()); if(a.currentUser) return res(true); let off = null; off = a.onAuthStateChanged(u => { if(typeof off === 'function') off(); res(!!u); }); setTimeout(() => res(!!a.currentUser), 4000); }); }
async function castReady(){ const app = firebase.apps.find(a => a.name === 'dispatch') || (ddb(), firebase.apps.find(a => a.name === 'dispatch')); const a = firebase.auth(app); if(!a.currentUser) await a.signInAnonymously(); return true; }
const normCode = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
function matchItemCode(text){   // the PO item code an entry refers to: exact, else the longest code it starts with ("SN 507 CAP" → "SN 507")
  const t = normCode(text); if(!t) return null;
  let best = null;
  new Set(ITEMS_PO.map(i => i.itemCode)).forEach(c => { const n = normCode(c); if(n && (t === n || t.startsWith(n + ' ')) && (!best || n.length > normCode(best).length)) best = c; });
  return best;
}
const isoDay = v => { const d = v && v.toDate ? v.toDate() : v instanceof Date ? v : null; if(d) return d.toISOString().slice(0, 10); return toIso ? toIso(v) : String(v || '').slice(0, 10); };
const syncKey = k => String(k).replace(/[\/.#$\[\]]/g, '_').slice(0, 400);

async function collectEvents(from){
  const ev = [];
  // Casting Control (jayco-dispatch-board · casting_challans)
  try{
    await castReady();
    const snap = await ddb().collection('casting_challans').get();
    snap.docs.forEach(d => { const c = d.data(), day = isoDay(c.challanDate); if(!day || day < from) return;
      (c.items || []).forEach((l, i) => { const q = Math.floor(num(l.quantity)); if(q > 0) ev.push({key: 'cc_' + d.id + '_' + i, text: l.itemName || l.masterCode, stage: 'casting', qty: q, day,
        note: `Auto · Casting challan ${c.challanNumber || ''}${c.foundryName ? ' · ' + c.foundryName : ''}${l.itemType ? ' · ' + l.itemType : ''}`}); }); });
    SYNC.cast = 'ok';
  }catch(e){ SYNC.cast = e.message; }
  // Production (jayco-production · Realtime DB records)
  try{
    if(!(await prodReady())) throw new Error('not signed in to Production');
    const snap = await prodApp().database().ref('records').orderByChild('date').startAt(from).once('value');
    snap.forEach(ch => { const r = ch.val() || {}, st = PROD_STAGE_MAP[String(r.stage || '').trim().toLowerCase()], q = Math.floor(num(r.quantity));
      if(!st || q <= 0 || /^REJ-/i.test(String(r.item || '')) || String(r.date || '') < from) return;
      ev.push({key: 'pr_' + ch.key, text: r.item, stage: st, qty: q, day: r.date, note: `Auto · Production ${r.stage}${r.person ? ' · ' + r.person : ''}`}); });
    SYNC.prod = 'ok';
  }catch(e){ SYNC.prod = e.message; }
  // Dispatch Board paint challans → finished stock (jayco-dispatch-board · dispatch/board.paintLog)
  try{
    const b = await ddb().collection('dispatch').doc('board').get(), log = (b.exists && b.data().paintLog) || [];
    log.forEach(p => { if(!p.date || p.date < from) return; (p.items || []).forEach((l, i) => { const q = Math.floor(num(l.qty));
      if(q > 0 && !/repaint/i.test(l.paintType || '')) ev.push({key: 'pt_' + (p.id || p.slipNo) + '_' + (l.id || i), text: l.item, stage: 'ready', qty: q, day: p.date,
        note: `Auto · Paint challan ${p.slipNo || ''}${p.painterName ? ' · ' + p.painterName : ''}`}); }); });
    SYNC.paint = 'ok';
  }catch(e){ SYNC.paint = e.message; }
  return ev.sort((a, b) => String(a.day).localeCompare(String(b.day)));
}
async function applyEvent(e){
  const code = matchItemCode(e.text), ti = STAGES.findIndex(s => s.k === e.stage);
  const lines = code ? ITEMS_PO.filter(i => i.itemCode === code && num(i.orderedQty) - num(i.despatchedQty) > 0)
    .sort((a, b) => (toDate(a.deliveryDate) || new Date(8.64e15)) - (toDate(b.deliveryDate) || new Date(8.64e15))).slice(0, 15) : [];
  const mark = db.collection('erp_sync').doc(syncKey(e.key));
  return db.runTransaction(async tx => {
    if((await tx.get(mark)).exists) return {skip: true};
    const refs = lines.map(i => db.collection('erp_itemStages').doc(i.id)), snaps = [];
    for(const r of refs) snaps.push(await tx.get(r));
    let left = e.qty; const now = new Date().toISOString(), used = [];
    lines.forEach((it, n) => {
      if(left <= 0) return;
      const d = snaps[n].exists ? snaps[n].data() : {stageQty: {}, history: []}, sq = {...(d.stageQty || {})};
      const open = num(it.orderedQty) - num(it.despatchedQty), inSt = STAGES.reduce((a, s) => a + Math.max(0, num(sq[s.k])), 0);
      let ns = Math.max(0, open - inSt), take = 0; const hist = [];
      for(let k = ti - 1; k >= -1 && left > 0; k--){          // nearest earlier stage first, then "not started"
        const have = k >= 0 ? Math.max(0, num(sq[STAGES[k].k])) : ns, m = Math.min(have, left); if(m <= 0) continue;
        if(k >= 0) sq[STAGES[k].k] = have - m; else ns -= m;
        sq[e.stage] = num(sq[e.stage]) + m; left -= m; take += m;
        hist.push({at: now, by: 'auto-sync', from: k >= 0 ? STAGES[k].n : 'Not started', to: STAGES[ti].n, qty: m, note: e.note + ' · ' + e.day});
      }
      if(take > 0){ used.push(take + ' on ' + it.poNo); tx.set(refs[n], {poItemId: it.id, poNo: it.poNo, itemCode: it.itemCode, stageQty: sq, history: [...(d.history || []), ...hist].slice(-200), updatedAt: now}, {merge: true}); }
    });
    tx.set(mark, {key: e.key, item: e.text, code: code || '', stage: e.stage, qty: e.qty, applied: e.qty - left, left, used, day: e.day, at: now});
    return {applied: e.qty - left, left, code};
  });
}
async function autoSync(force){
  if(SYNC.running || !USER || (!force && Date.now() - SYNC.at < 60000)) return;
  SYNC.running = true; SYNC.state = 'running'; drawSyncBar();
  try{
    let from = SET.autoSyncFrom;
    if(!from){ from = todayISO(); await db.collection('erp_settings').doc('main').set({autoSyncFrom: from}, {merge: true}); SET.autoSyncFrom = from; }
    const ev = await collectEvents(from), done = new Set((await db.collection('erp_sync').where('day', '>=', from).get()).docs.map(d => d.id));
    let applied = 0; const unmatched = [];
    for(const e of ev){
      if(done.has(syncKey(e.key))) continue;
      const r = await applyEvent(e); if(r.skip) continue;
      applied += r.applied; if(r.left > 0) unmatched.push(`${e.text}: ${r.left} pcs ${STAGES.find(s => s.k === e.stage).n}${r.code ? ' (no open order left)' : ' (item not on any PO)'}`);
    }
    SYNC = {...SYNC, state: 'ok', at: Date.now(), applied: SYNC.applied + applied, unmatched: [...unmatched, ...SYNC.unmatched].slice(0, 20), from};
  }catch(e){ SYNC.state = 'error: ' + e.message; SYNC.at = Date.now(); }
  SYNC.running = false; drawSyncBar();
}
function drawSyncBar(){
  const el = document.getElementById('syncBar'); if(!el) return;
  const src = (n, v) => `<span class="pill ${v === 'ok' ? 'ok' : v ? 'crit' : ''}" title="${esc(v || 'not checked yet')}">${v === 'ok' ? '✓' : v ? '✗' : '…'} ${n}</span>`;
  el.innerHTML = `<b>Auto-update</b> ${src('Casting Control', SYNC.cast)} ${src('Production', SYNC.prod)} ${src('Paint → Ready', SYNC.paint)}
    <span class="hint">${SYNC.state === 'running' ? 'checking…' : SYNC.at ? 'last check ' + new Date(SYNC.at).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'}) + (SYNC.applied ? ' · ' + SYNC.applied + ' pcs moved' : '') : ''}${SYNC.from ? ' · entries from ' + esc(SYNC.from) : ''}</span>
    <button class="btn sm" onclick="autoSync(true)" style="margin-left:auto">↻ Check now</button>
    ${SYNC.prod && SYNC.prod !== 'ok' ? `<div class="full" style="width:100%;margin-top:8px">Production not linked on this device: <input id="prodPwd" type="password" placeholder="staff password" style="max-width:200px;display:inline-block"> <button class="btn sm pri" onclick="linkProd()">Link Production</button></div>` : ''}
    ${String(SYNC.state).startsWith('error') ? `<div style="width:100%;color:var(--crit);margin-top:6px">${esc(SYNC.state)}</div>` : ''}
    ${SYNC.unmatched.length ? `<details style="width:100%;margin-top:6px"><summary class="hint">${SYNC.unmatched.length} entr${SYNC.unmatched.length > 1 ? 'ies' : 'y'} could not be placed</summary><div class="hint">${SYNC.unmatched.map(esc).join('<br>')}</div></details>` : ''}`;
}
async function linkProd(){ try{ await prodSignIn($('#prodPwd').value); toast('Production linked on this device'); autoSync(true); }catch(e){ toast('Production sign-in failed: ' + e.message); } }

/* ---------- moves log: everything staff moved on a day ---------- */
let MD = '', MF = '';
const dayKey = iso => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function vMoves(){
  $('#ttl').textContent = 'Moves Log';
  if(!MD) MD = dayKey(new Date().toISOString());
  $('#view').innerHTML = `<div class="card"><div class="card-h"><input id="mdate" type="date" value="${MD}" style="max-width:170px"><input id="mf" placeholder="Filter item, PO, person…" value="${esc(MF)}" style="max-width:240px"><span class="hint">Every stage move entered by staff on the chosen day.</span></div><div id="mbody"></div></div>`;
  $('#mdate').onchange = e => { MD = e.target.value; drawMoves(); }; $('#mf').oninput = e => { MF = e.target.value; drawMoves(); }; drawMoves();
}
function drawMoves(){
  const f = MF.toLowerCase(), list = [];
  Object.values(STG).forEach(d => (d.history || []).forEach(h => { if(dayKey(h.at) !== MD) return;
    const it = ITEMS_PO.find(i => i.id === d.id) || {}; const row = {...h, itemCode: d.itemCode || it.itemCode || '', poNo: d.poNo || it.poNo || '', customer: it.customerName || '', poId: it.poId, itemId: d.id};
    if(!f || [row.itemCode, row.poNo, row.customer, row.by, row.note, row.to, row.from].join(' ').toLowerCase().includes(f)) list.push(row); }));
  list.sort((a, b) => b.at.localeCompare(a.at));
  const into = {}, by = {}; list.forEach(h => { into[h.to] = (into[h.to] || 0) + h.qty; const p = (h.by || '').split('@')[0]; by[p] = (by[p] || 0) + h.qty; });
  const sum = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip"><b>${v}</b> ${esc(k)}</span>`).join('');
  $('#mbody').innerHTML = list.length ? `<div class="card-b" style="border-bottom:1px solid var(--line)"><div class="hint" style="margin-bottom:6px">Pieces moved into each stage</div><div class="chips">${sum(into)}</div><div class="hint" style="margin:10px 0 6px">By person</div><div class="chips">${sum(by)}</div></div>
    <div class="tw"><table><thead><tr><th>Time</th><th>Item</th><th>PO / customer</th><th>Move</th><th class="num">Pcs</th><th>By</th><th>Note</th></tr></thead><tbody>
    ${list.map(h => `<tr class="${h.poId ? 'click' : ''}" ${h.poId ? `onclick="go('order/${h.poId}')"` : ''}><td>${new Date(h.at).toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'})}</td><td class="mono"><b>${esc(h.itemCode)}</b></td><td>${esc(h.poNo)}<div class="hint">${esc(h.customer)}</div></td><td>${esc(h.from)} → <b>${esc(h.to)}</b></td><td class="num">${h.qty}</td><td>${esc((h.by || '').split('@')[0])}</td><td>${esc(h.note || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No stage moves on this day.</div>';
}

/* ---------- product costing ---------- */
let CQ = '';
function vCosting(){
  $('#ttl').textContent = 'Product Costing';
  $('#view').innerHTML = `<div class="card"><div class="card-h"><input id="cq" placeholder="Search item code…" value="${esc(CQ)}" style="max-width:260px"><span class="hint">Cost = casting (weight × rate/kg + rejection) + machining + bought-outs + paint + packing + freight + overhead. Selling rate comes from the Sales price list.</span></div><div class="tw" id="cbody"></div></div>`;
  $('#cq').oninput = e => { CQ = e.target.value; drawCosting(); }; drawCosting();
  $('#topr').innerHTML = `<label class="btn pri" style="cursor:pointer">⬆ Import costing workbook (.xlsx)<input type="file" accept=".xlsx,.xls" id="wbFile" style="display:none"></label>`;
  $('#wbFile').onchange = e => { const f = e.target.files[0]; if(f) importWorkbookFile(f); e.target.value = ''; };
}

/* ---------- import the company's production-costing workbook ----------
   Reads every casting-series sheet (S, SN, SNA, SNH, SNL, SAF, SD, JEG, SDGS, SBD…): rough weight, material cost,
   labour, production cost, margin and final rate per size, and turns each into a costing sheet. */
const SKIP_SHEETS = /^(assumptions|purchase log|uc pillow|stc offer|sleeve|rubber|accessories|locating|casting part|packing|sleeve & nut)/i;
const H = {
  weight: /^(total( rough wt| weight)?|t\.?\s?weight)$/i, mcost: /^(m\.?\s?c(ost)?\.?|material cost)$/i, labour: /^(total )?labour$/i,
  cost: /^(total cost|production cost|p\.?\s?cost|total)$/i, final: /^(final rate|net price)$/i, finwt: /^(f\.?\s?weight|finish(ed)? (w(ei)?ght|wt)|finish weight)$/i
};
// the rate the workbook actually costed with is the most reliable sign of the material (115 = cast steel, 95 = SG, 85 = FG 260)
function matByRate(rate, code){ const r = Math.round(rate); if(r >= 110 && r <= 130) return 'Cast Steel'; if(r >= 92 && r <= 105) return 'SG Iron'; if(r >= 83 && r <= 88) return 'FG 260'; if(r >= 60 && r <= 80) return 'Cast Iron'; return normMat(code); }
function parseCostingWorkbook(sheets){
  const out = [], skipped = [], n = v => { const x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : 0; };
  Object.keys(sheets).forEach(sn => {
    if(SKIP_SHEETS.test(sn.trim())) return;
    const rows = sheets[sn];
    let hr = -1;
    for(let r = 0; r < Math.min(rows.length, 16); r++){ const hs = (rows[r] || []).map(c => String(c == null ? '' : c).trim());
      if(hs.some(h => H.weight.test(h)) && hs.some(h => H.mcost.test(h))){ hr = r; break; } }
    if(hr < 0){ skipped.push(sn); return; }
    const head = (rows[hr] || []).map(c => String(c == null ? '' : c).trim());
    // blocks = runs of non-empty header cells; a blank header cell separates side-by-side tables
    const blocks = []; let st = -1;
    head.forEach((h, i) => { if(h && st < 0) st = i; if(!h && st >= 0){ blocks.push([st, i - 1]); st = -1; } }); if(st >= 0) blocks.push([st, head.length - 1]);
    blocks.forEach(([a, b]) => {
      const find = (re, from = a, to = b) => { for(let i = from; i <= to; i++) if(re.test(head[i])) return i; return -1; };
      const mi = find(H.mcost); if(mi < 0) return;
      let wi = -1; for(let i = mi - 1; i >= a; i--) if(H.weight.test(head[i])){ wi = i; break; }
      if(wi < 0) return;
      const li = find(/^total labour$/i, mi + 1) >= 0 ? find(/^total labour$/i, mi + 1) : find(H.labour, mi + 1);
      const ci = find(H.cost, Math.max(mi, li) + 1), fi = find(H.final, mi + 1), wf = find(H.finwt, mi + 1);
      const detail = li > mi + 1 && /^total labour$/i.test(head[li]) ? Array.from({length: li - mi - 1}, (_, k) => mi + 1 + k) : [];
      for(let r = hr + 1; r < rows.length; r++){
        const row = rows[r] || []; let code = row[a];
        if(typeof code === 'number'){ code = /sdgs/i.test(sn) ? 'SDGS ' + code : ''; }
        code = String(code == null ? '' : code).trim();
        if(!code || /series|·/i.test(code)) continue;
        const w = n(row[wi]), mc = n(row[mi]);
        if(!(w > 0 && mc > 0)) continue;
        let labour = li >= 0 ? n(row[li]) : 0; let cost = ci >= 0 && n(row[ci]) > 0 ? n(row[ci]) : mc + labour;
        // some sheets (SNA) have a 'Total' that is labour + parts only, i.e. it leaves out material cost — add it back
        if(cost < mc * 0.999){ cost = mc + cost; labour = cost - mc; }
        if(li < 0) labour = Math.max(0, cost - mc);
        const final = fi >= 0 ? n(row[fi]) : 0;
        const ops = [], doc = {paint: 0, packing: 0};
        detail.forEach(i => { const v = n(row[i]), h = head[i]; if(v <= 0) return; if(/^paint/i.test(h)) doc.paint = v; else if(/^box|pack/i.test(h)) doc.packing = v; else ops.push({n: h + (/^(cap|bottom)$/i.test(h) ? ' machining' : ''), cost: Math.round(v * 100) / 100}); });
        if(!detail.length && labour > 0) ops.push({n: 'Labour (per costing workbook)', cost: Math.round(labour * 100) / 100});
        out.push({itemCode: code, material: matByRate(mc / w, code), castWt: Math.round(w * 1000) / 1000, castRate: Math.round(mc / w * 100) / 100, rejPct: 0,
          ops, bought: [], paint: doc.paint, packing: doc.packing, freight: 0, ovhPct: 0,
          marginPct: final > cost ? Math.round((final - cost) / cost * 1000) / 10 : 15, wbFinalRate: final || null,
          series: sn.trim(), source: 'costing workbook', notes: ''});
      }
    });
  });
  return {items: out, skipped};
}
let IMPORT_ITEMS = [], IMPORT_PARTS = [];
async function importWorkbookFile(file){
  if(typeof XLSX === 'undefined'){ toast('Excel reader could not load — check your internet connection'); return; }
  try{
    const wb = XLSX.read(await file.arrayBuffer(), {type: 'array', cellDates: true}), sheets = {};
    wb.SheetNames.forEach(n => sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1, raw: true, defval: null}));
    const res = parseCostingWorkbook(sheets); res.parts = parseParts(sheets); previewImport(res);
  }catch(e){ toast('Could not read the file: ' + e.message); }
}
function previewImport(res){
  IMPORT_ITEMS = res.items; IMPORT_PARTS = res.parts || [];
  const by = {}; res.items.forEach(i => { (by[i.series] = by[i.series] || {n: 0, ex: 0}).n++; if(COST[costKey(i.itemCode)]) by[i.series].ex++; });
  const exist = res.items.filter(i => COST[costKey(i.itemCode)]).length;
  modal(`<div class="modal-h"><h3>Import costing workbook</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b">
    ${IMPORT_PARTS.length ? `<p>🔩 <b>${IMPORT_PARTS.length}</b> bought-out parts found in the Purchase Log (latest price per size).</p>` : ''}
    ${res.items.length ? `<p><b>${res.items.length}</b> costed sizes found in <b>${Object.keys(by).length}</b> series. ${exist} already have a costing sheet.</p>
    <div class="tw" style="max-height:260px"><table><thead><tr><th>Series</th><th class="num">Sizes</th><th class="num">Already costed</th></tr></thead><tbody>${Object.entries(by).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${v.ex || '—'}</td></tr>`).join('')}</tbody></table></div>
    <label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="impOver" style="width:auto"> Overwrite the ${exist} existing sheets (otherwise they are kept)</label>
    <div class="hint" style="margin-top:8px">Each size becomes a costing sheet: rough weight × material rate, labour/machining, margin. Sizes with no weight or no material cost in the workbook are skipped.</div>`
    : (IMPORT_PARTS.length ? '' : '<div class="empty">Nothing found. Is this the production-costing workbook?</div>')}
    ${res.skipped.length ? `<div class="hint">Sheets without a costing table (skipped): ${esc(res.skipped.join(', '))}</div>` : ''}</div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancel</button>${res.items.length || IMPORT_PARTS.length ? '<button class="btn pri" id="impGo" onclick="runImport()">Import</button>' : ''}</div>`);
}
async function runImport(){
  const over = $('#impOver').checked, list = IMPORT_ITEMS.filter(i => over || !COST[costKey(i.itemCode)]), now = new Date().toISOString();
  $('#impGo').disabled = true; $('#impGo').textContent = 'Importing…';
  try{
    for(let k = 0; k < list.length; k += 400){
      const b = db.batch(); list.slice(k, k + 400).forEach(i => b.set(db.collection('erp_costing').doc(costKey(i.itemCode)), {...i, updatedAt: now, updatedBy: me()}));
      await b.commit();
    }
    const parts = IMPORT_PARTS.filter(p => over || !PARTS[costKey(p.name)]);
    for(let k = 0; k < parts.length; k += 400){
      const b = db.batch(); parts.slice(k, k + 400).forEach(p => b.set(db.collection('erp_parts').doc(costKey(p.name)), {...p, updatedAt: now}));
      await b.commit();
    }
    closeModal(); toast(`Imported ${list.length} costing sheets and ${parts.length} parts`);
  }catch(e){ toast('Import failed: ' + e.message); $('#impGo').disabled = false; $('#impGo').textContent = 'Import'; }
}
function allCodes(){ return [...new Set([...RATES.map(r => String(r.itemCode || '').trim()), ...ITEMS_PO.map(i => String(i.itemCode || '').trim()), ...Object.values(COST).map(c => c.itemCode)])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, {numeric: true})); }
function drawCosting(){
  const q = CQ.toLowerCase(), codes = allCodes().filter(c => !q || c.toLowerCase().includes(q));
  $('#cbody').innerHTML = `<table><thead><tr><th>Item</th><th>Material</th><th class="num">Casting wt (kg)</th><th class="num">Cost / pc</th><th class="num">Suggested price</th><th class="num">Price-list rate</th><th class="num">Margin on price list</th><th></th></tr></thead><tbody>
  ${codes.slice(0, 400).map(code => { const c = costOf(code), rate = rateOf(code), sheet = COST[costKey(code)], m = c && rate ? (rate - c.total) / rate * 100 : null;
    return `<tr class="click" onclick="openCost(${jsq(code)})"><td class="mono"><b>${esc(code)}</b></td><td>${esc(sheet && sheet.material || materialOf(code))}</td><td class="num">${sheet ? num(sheet.castWt) || '—' : '—'}</td><td class="num">${c ? inr(c.total) : '<span class="pill warn">not costed</span>'}</td><td class="num">${c ? inr(c.suggested) : '—'}</td><td class="num">${rate ? inr(rate) : '—'}</td>
    <td class="num">${m == null ? '—' : `<span class="pill ${m < 10 ? 'crit' : m < 20 ? 'warn' : 'ok'}">${m.toFixed(1)}%</span>`}</td><td><button class="btn sm">${sheet ? 'Edit' : 'Add'}</button></td></tr>`; }).join('')}</tbody></table>${codes.length > 400 ? '<div class="hint" style="padding:10px">Showing first 400 — search to narrow.</div>' : ''}`;
}
let CD = null;
function openCost(code){
  const ex = COST[costKey(code)];
  const mat0 = materialOf(code);
  CD = ex ? JSON.parse(JSON.stringify(ex)) : {itemCode: code, material: mat0, castWt: '', castRate: matRate(mat0) || '', rejPct: SET.rejPct, ops: (SET.ops || DEFAULT_OPS).map(n => ({n, cost: ''})), bought: [{n:'Seal / felt ring', qty: 2, rate: ''}, {n:'Grease nipple', qty: 1, rate: ''}], paint: '', packing: '', freight: '', ovhPct: SET.ovhPct, marginPct: SET.marginPct, notes: ''};
  modal(`<div class="modal-h"><h3>Costing — <span class="mono">${esc(code)}</span></h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b" id="cdBody"></div>
  <div class="modal-f"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="saveCost()">Save costing</button></div>`);
  drawCostForm();
}
function drawCostForm(){
  const row = (arr, k, i, cols) => `<div class="cost-row"><input data-l="${arr}" data-i="${i}" data-f="n" ${arr === 'bought' ? 'list="dlParts"' : ''} value="${esc(CD[arr][i].n)}" placeholder="Name">${cols}<button class="btn sm" onclick="rmRow('${arr}',${i})">✕</button></div>`;
  $('#cdBody').innerHTML = `<div class="form">
    <div class="sec">1 · Casting</div>
    <div class="fld"><label>Material</label><select id="cdMat">${matList().map(m => `<option value="${esc(m.n)}" ${CD.material === m.n ? 'selected' : ''}>${esc(m.n)} — ₹${num(m.rate)}/kg</option>`).join('')}</select></div>
    <div class="fld"><label>Casting weight (kg)</label><input data-h="castWt" type="number" step="0.01" value="${esc(CD.castWt)}"></div>
    <div class="fld"><label>Casting rate (₹/kg) <span class="hint">auto from material, editable</span></label><input data-h="castRate" type="number" step="0.01" value="${esc(CD.castRate)}"></div>
    <div class="fld"><label>Rejection allowance %</label><input data-h="rejPct" type="number" step="0.1" value="${esc(CD.rejPct)}"></div>
    <div class="sec">2 · Machining &amp; operations (₹ per piece)</div>
    <div class="full" style="grid-column:1/-1">${CD.ops.map((o, i) => row('ops', 'n', i, `<span></span><input data-l="ops" data-i="${i}" data-f="cost" type="number" step="0.01" value="${esc(o.cost)}" placeholder="₹">`)).join('')}<button class="btn sm" onclick="addRow('ops')">＋ Operation</button></div>
    <div class="sec">3 · Bought-out parts <span class="hint" style="text-transform:none;letter-spacing:0">pick a part from the register and its landed rate (price + ${num(SET.boughtMarginPct)}% margin + ${num(SET.freightPct)}% freight) fills in</span></div>
    <datalist id="dlParts">${Object.values(PARTS).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
    <div class="full" style="grid-column:1/-1">${CD.bought.map((b, i) => row('bought', 'n', i, `<input data-l="bought" data-i="${i}" data-f="qty" type="number" step="0.01" value="${esc(b.qty)}" placeholder="Qty"><input data-l="bought" data-i="${i}" data-f="rate" type="number" step="0.01" value="${esc(b.rate)}" placeholder="Rate ₹">`)).join('')}<button class="btn sm" onclick="addRow('bought')">＋ Part</button></div>
    <div class="sec">4 · Finishing, packing &amp; overhead</div>
    <div class="fld"><label>Paint (₹/pc)</label><input data-h="paint" type="number" step="0.01" value="${esc(CD.paint)}"></div>
    <div class="fld"><label>Packing (₹/pc)</label><input data-h="packing" type="number" step="0.01" value="${esc(CD.packing)}"></div>
    <div class="fld"><label>Freight (₹/pc)</label><input data-h="freight" type="number" step="0.01" value="${esc(CD.freight)}"></div>
    <div class="fld"><label>Overhead %</label><input data-h="ovhPct" type="number" step="0.1" value="${esc(CD.ovhPct)}"></div>
    <div class="fld"><label>Margin % on cost <span class="hint">for suggested price</span></label><input data-h="marginPct" type="number" step="0.1" value="${esc(CD.marginPct == null ? SET.marginPct : CD.marginPct)}"></div>
    <div class="fld full"><label>Notes</label><input data-h="notes" value="${esc(CD.notes || '')}"></div>
  </div><div class="sumbox" id="cdSum" style="margin-top:14px"></div>`;
  $('#cdMat').onchange = e => { CD.material = e.target.value; CD.castRate = matRate(CD.material) || CD.castRate; const r = $('#cdBody [data-h=castRate]'); r.value = CD.castRate; sumCost(); };
  $$('#cdBody [data-h]').forEach(e => e.oninput = () => { CD[e.dataset.h] = e.value; sumCost(); });
  $$('#cdBody [data-l]').forEach(e => e.oninput = () => { CD[e.dataset.l][+e.dataset.i][e.dataset.f] = e.value; sumCost(); });
  $$('#cdBody [data-l=bought][data-f=n]').forEach(e => e.onchange = () => { const p = PARTS[costKey(e.value)]; if(!p) return; const row = CD.bought[+e.dataset.i]; row.rate = Math.round(landed(p) * 100) / 100; if(!num(row.qty)) row.qty = 1; drawCostForm(); toast(`${p.name}: ₹${num(p.price)} + margin & freight = ₹${row.rate}`); });
  sumCost();
}
function addRow(l){ CD[l].push(l === 'ops' ? {n:'', cost:''} : {n:'', qty:1, rate:''}); drawCostForm(); }
function rmRow(l, i){ CD[l].splice(i, 1); drawCostForm(); }
function sumCost(){
  const saved = COST[costKey(CD.itemCode)]; COST[costKey(CD.itemCode)] = CD; const c = costOf(CD.itemCode); if(saved) COST[costKey(CD.itemCode)] = saved; else delete COST[costKey(CD.itemCode)];
  const rate = rateOf(CD.itemCode), m = rate ? (rate - c.total) / rate * 100 : null;
  $('#cdSum').innerHTML = [['Casting (incl. rejection)', c.casting], ['Machining', c.mach], ['Bought-out', c.bought], ['Paint', c.paint], ['Packing', c.packing], ['Freight', c.freight], [`Overhead ${num(CD.ovhPct)}%`, c.ovh]].map(r => `<div class="r"><span>${r[0]}</span><span>${inr(r[1])}</span></div>`).join('') +
    `<div class="r t"><span>Total cost per piece</span><span>${inr(c.total)}</span></div><div class="r"><span>Suggested price (cost + ${c.marginPct}% margin)</span><span><b>${inr(c.suggested)}</b></span></div>${CD.wbFinalRate ? `<div class="r"><span>Rate in costing workbook</span><span>${inr(CD.wbFinalRate)}</span></div>` : ''}<div class="r"><span>Selling rate (price list)</span><span>${rate ? inr(rate) : '—'}</span></div><div class="r"><span>Margin</span><span><b>${m == null ? '—' : inr(rate - c.total) + ' · ' + m.toFixed(1) + '%'}</b></span></div>`;
}
async function saveCost(){
  const d = {...CD, itemCode: CD.itemCode, updatedAt: new Date().toISOString(), updatedBy: me()};
  try{ await db.collection('erp_costing').doc(costKey(d.itemCode)).set(d); closeModal(); toast('Costing saved'); }catch(e){ toast('Could not save: ' + e.message); }
}


/* ---------- single customer master ----------
   PO Management / Sales / this ERP keep customers in Firestore ("customers"). The Customer Portal keeps them in a Google Sheet.
   The Customer Portal is the master for tax & contact details; every Firestore customer carries its sheet id in `cmsId`.
   This page finds the matches, links them, fills blanks and creates whatever is missing on either side. Names are never changed. */
let CMS = {list: [], state: '', cfg: null}, CM_SKIP = new Set(), CM_MSG = '';
const NAME_STOP = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'co', 'company', 'corp', 'corporation', 'the', 'and', 'of']);
function nameTokens(n){
  const t = String(n || '').toLowerCase().replace(/^\s*(m\/s\.?|messrs\.?|ms\.?)\s+/, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(x => x && !NAME_STOP.has(x)).map(x => x.length > 4 && x.endsWith('s') ? x.slice(0, -1) : x);
  // initials written apart ("G P", "G.P.") become one word, so they match "GP"
  const out = []; let run = false;
  t.forEach(x => { if(x.length === 1){ if(run) out[out.length - 1] += x; else { out.push(x); run = true; } } else { out.push(x); run = false; } });
  return out;
}
const nameKey = n => nameTokens(n).slice().sort().join(' ');
function nameScore(a, b){ const A = new Set(nameTokens(a)), B = new Set(nameTokens(b)); if(!A.size || !B.size) return 0; let i = 0; A.forEach(x => { if(B.has(x)) i++; });
  const j = i / (A.size + B.size - i), contain = i === Math.min(A.size, B.size) && Math.min(A.size, B.size) >= 2 ? 0.75 : 0; return Math.max(j, contain); }
async function cmsApi(action, data){
  const r = await fetch(CMS.cfg.url, {method: 'POST', body: JSON.stringify({token: CMS.cfg.token, action, data: data || {}})}), j = await r.json();
  if(!j.ok) throw new Error(j.error || 'Customer Portal error'); return j.data;
}
async function loadCms(force){
  if(CMS.state === 'loading' || (CMS.state === 'ok' && !force)) return;
  CMS.state = 'loading'; render();
  try{
    const d = await db.collection('crm_settings').doc('main').get(), m = d.exists ? d.data() : {};
    if(!m.cmsUrl || !m.cmsToken){ CMS.state = 'noconfig'; render(); return; }
    CMS.cfg = {url: m.cmsUrl, token: m.cmsToken};
    CMS.list = (await cmsApi('getCustomers')) || []; CMS.list = CMS.list.filter(c => c.name && String(c.active).toLowerCase() !== 'false');
    CMS.state = 'ok';
  }catch(e){ CMS.state = 'error:' + e.message; }
  render();
}
function custMatches(){
  const cmsById = {}; CMS.list.forEach(c => cmsById[String(c.custId)] = c);
  const linked = [], rest = [];
  CUSTS.forEach(f => (f.cmsId && cmsById[String(f.cmsId)] ? linked : rest).push(f));
  const usedC = new Set(linked.map(f => String(f.cmsId))), freeC = CMS.list.filter(c => !usedC.has(String(c.custId)));
  const byKey = {}; freeC.forEach(c => (byKey[nameKey(c.name)] = byKey[nameKey(c.name)] || []).push(c));
  const confident = [], possible = [], fsOnly = [], dupOf = [], takenC = new Set();
  rest.sort((a, b) => a.name.localeCompare(b.name)).forEach(f => {
    const k = nameKey(f.name), cand = (byKey[k] || []).filter(c => !takenC.has(String(c.custId)));
    if(cand.length === 1 && k){ confident.push({f, c: cand[0]}); takenC.add(String(cand[0].custId)); }
    else if(cand.length > 1) possible.push({f, c: cand[0], score: 1, note: cand.length + ' sheet customers share this name'});
    else if(k && (confident.some(p => nameKey(p.f.name) === k) || linked.some(l => nameKey(l.name) === k))) dupOf.push(f);   // same company entered twice in PO/Sales
    else fsOnly.push(f);
  });
  // second chance for leftovers: similar (not identical) names
  const stillF = [], pool = freeC.filter(c => !takenC.has(String(c.custId)));
  fsOnly.forEach(f => { let best = null, bs = 0; pool.forEach(c => { if(takenC.has(String(c.custId))) return; const sc = nameScore(f.name, c.name); if(sc > bs){ bs = sc; best = c; } });
    if(best && bs >= 0.6 && !CM_SKIP.has(f.id + '|' + best.custId)){ possible.push({f, c: best, score: bs}); takenC.add(String(best.custId)); } else stillF.push(f); });
  const cmsOnly = freeC.filter(c => !takenC.has(String(c.custId)));
  const dup = {}; CUSTS.forEach(f => { const k = nameKey(f.name); if(k) (dup[k] = dup[k] || []).push(f); });
  return {linked, confident, possible, fsOnly: stillF, cmsOnly, dups: Object.values(dup).filter(a => a.length > 1)};
}
// blank-filling maps (never overwrite a value that is already there)
const FS_FROM_CMS = c => ({contact: c.contactPerson, phone: c.phone || c.mobile, email: c.email, gstin: c.gstin, pan: c.pan, state: c.state, address: [c.address, c.city, c.pincode].filter(Boolean).join(', '), cmsCreditDays: c.creditDays});
const CMS_FROM_FS = f => ({contactPerson: f.contact, phone: f.phone, email: f.email, gstin: f.gstin, state: f.state, address: f.address});
const blanksOnly = (target, src) => { const o = {}; Object.keys(src).forEach(k => { const v = src[k]; if(v !== undefined && v !== null && String(v).trim() !== '' && String(target[k] == null ? '' : target[k]).trim() === '') o[k] = v; }); return o; };
async function linkPair(fid, cid, alsoSheet){
  const f = CUSTS.find(x => x.id === fid), c = CMS.list.find(x => String(x.custId) === String(cid)); if(!f || !c) return;
  const patch = {cmsId: String(c.custId), ...blanksOnly(f, FS_FROM_CMS(c))}; delete patch.cmsCreditDays;
  await db.collection('customers').doc(fid).update(patch); Object.assign(f, patch);
  if(alsoSheet){ const sp = blanksOnly(c, CMS_FROM_FS(f)); if(Object.keys(sp).length) await cmsApi('saveCustomer', {custId: c.custId, ...sp}); }
}
async function linkAll(kind){
  const m = custMatches(), list = kind === 'confident' ? m.confident : m.possible, also = $('#cmAlso') && $('#cmAlso').checked;
  if(!list.length) return; if(!confirm(`Link ${list.length} customer pair${list.length > 1 ? 's' : ''}?${also ? '\n\nBlank details in the Customer Portal sheet will also be filled (this can take a few minutes).' : ''}`)) return;
  try{ let n = 0; for(const p of list){ CM_MSG = `Linking ${++n} of ${list.length}…`; $('#cmMsg') && ($('#cmMsg').textContent = CM_MSG); await linkPair(p.f.id, p.c.custId, also); }
    CM_MSG = ''; toast(`Linked ${list.length} customers`); }catch(e){ CM_MSG = ''; toast('Stopped: ' + e.message); } render();
}
async function linkOne(fid, cid){ try{ await linkPair(fid, cid, $('#cmAlso') && $('#cmAlso').checked); toast('Linked'); }catch(e){ toast(e.message); } render(); }
// manual link for names that differ too much to match by themselves ("Shiva" / "Shiv")
let PICK = '';
function pickLink(fid){
  const f = CUSTS.find(x => x.id === fid); if(!f) return; PICK = fid;
  modal(`<div class="modal-h"><h3>Link “${esc(f.name)}” to a Customer Portal customer</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b"><input id="pkq" placeholder="Search Customer Portal customers…" autofocus><div id="pkl" style="max-height:340px;overflow:auto;margin-top:10px"></div></div>`);
  const draw = () => { const q = $('#pkq').value.toLowerCase(), used = new Set(CUSTS.filter(x => x.cmsId).map(x => String(x.cmsId)));
    const list = CMS.list.filter(c => !used.has(String(c.custId)) && (!q || String(c.name).toLowerCase().includes(q))).map(c => ({c, sc: nameScore(f.name, c.name)})).sort((a, b) => b.sc - a.sc).slice(0, 40);
    $('#pkl').innerHTML = list.length ? list.map(x => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1"><b>${esc(x.c.name)}</b><div class="hint">${esc(x.c.gstin || '')}</div></div><button class="btn sm pri" onclick="doPick(${jsq(x.c.custId)})">Link</button></div>`).join('') : '<div class="empty">No unlinked customers match.</div>'; };
  $('#pkq').oninput = draw; draw();
}
async function doPick(cid){ closeModal(); await linkOne(PICK, cid); }
function skipOne(fid, cid){ CM_SKIP.add(fid + '|' + cid); render(); }
async function createInCms(fid){
  const f = CUSTS.find(x => x.id === fid); if(!f) return;
  try{ const r = await cmsApi('saveCustomer', {name: f.name, gstType: f.gstin ? 'registered' : 'unregistered', gstin: f.gstin || '', pan: f.pan || '', state: f.state || '', address: f.address || '', contactPerson: f.contact || '', phone: f.phone || '', email: f.email || '', creditDays: 45, creditLimit: 0});
    await db.collection('customers').doc(fid).update({cmsId: String(r.custId)}); f.cmsId = String(r.custId); CMS.list.push({custId: r.custId, name: f.name, ...CMS_FROM_FS(f)}); toast('Created in Customer Portal'); }catch(e){ toast(e.message); }
  render();
}
async function createInFs(cid){
  const c = CMS.list.find(x => String(x.custId) === String(cid)); if(!c) return;
  try{ const doc = {name: String(c.name).trim(), isExclusive: false, ...Object.fromEntries(Object.entries(FS_FROM_CMS(c)).filter(([k, v]) => k !== 'cmsCreditDays' && v)), cmsId: String(c.custId), createdAt: new Date().toISOString()};
    const ref = await db.collection('customers').add(doc); CUSTS.push({id: ref.id, ...doc}); toast('Created in PO / Sales'); }catch(e){ toast(e.message); }
  render();
}
async function bulkCreate(kind){
  const m = custMatches(), list = kind === 'cms' ? m.fsOnly : m.cmsOnly; if(!list.length) return;
  if(!confirm(`Create ${list.length} customer${list.length > 1 ? 's' : ''} in ${kind === 'cms' ? 'the Customer Portal' : 'PO Management / Sales'}?`)) return;
  let n = 0; for(const x of list){ $('#cmMsg') && ($('#cmMsg').textContent = `Creating ${++n} of ${list.length}…`); if(kind === 'cms') await createInCms(x.id); else await createInFs(x.custId); }
  $('#cmMsg') && ($('#cmMsg').textContent = '');
}
function vCustomers(){
  $('#ttl').textContent = 'Customer Master';
  $('#topr').innerHTML = `<button class="btn" onclick="loadCms(true)">↻ Reload Customer Portal</button>`;
  if(CMS.state === '') { loadCms(); }
  if(CMS.state === '' || CMS.state === 'loading'){ $('#view').innerHTML = '<div class="empty">Loading the Customer Portal list…</div>'; return; }
  if(CMS.state === 'noconfig'){ $('#view').innerHTML = `<div class="card"><div class="card-b"><b>The Customer Portal is not connected yet.</b><p>Open <a href="sales-crm.html#settings">Sales → Settings &amp; Setup</a>, fill in <i>Customer Portal link</i> (Apps Script URL and token) and save. Then come back here.</p></div></div>`; return; }
  if(CMS.state.startsWith('error:')){ $('#view').innerHTML = `<div class="card"><div class="card-b" style="color:var(--crit)"><b>Could not read the Customer Portal.</b><p>${esc(CMS.state.slice(6))}</p><p class="hint">Check that the Apps Script web app is deployed with the latest code, the URL/token in Sales settings are current, and the token matches the AUTH_TOKEN script property.</p></div></div>`; return; }
  const m = custMatches(), row = (a, b, extra) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td>${extra}</tr>`;
  setN('nCust', (m.confident.length + m.possible.length + m.fsOnly.length + m.cmsOnly.length) || '');
  $('#view').innerHTML = `
  <div class="grid g4" style="margin-bottom:16px">
    <div class="stat" style="--c:#1a8f4c"><div class="k">Linked</div><div class="v">${m.linked.length}</div><div class="n">in both systems</div></div>
    <div class="stat" style="--c:#2F6FED"><div class="k">Same name — ready to link</div><div class="v">${m.confident.length}</div><div class="n">${m.possible.length} similar names to review</div></div>
    <div class="stat" style="--c:#c27803"><div class="k">Only in PO / Sales</div><div class="v">${m.fsOnly.length}</div><div class="n">${CUSTS.length} total there</div></div>
    <div class="stat" style="--c:#c0201c"><div class="k">Only in Customer Portal</div><div class="v">${m.cmsOnly.length}</div><div class="n">${CMS.list.length} total there</div></div>
  </div>
  <div class="card"><div class="card-b" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" id="cmAlso" style="width:auto"> Also fill blank details in the Customer Portal sheet (slower)</label><span class="hint">Linking never changes a name and never overwrites a value — it only fills blanks. <span id="cmMsg" style="color:var(--brand);font-weight:600">${esc(CM_MSG)}</span></span></div></div>
  ${m.confident.length ? `<div class="card"><div class="card-h"><h3>Same customer, same name (${m.confident.length})</h3><button class="btn pri sm" style="margin-left:auto" onclick="linkAll('confident')">Link all ${m.confident.length}</button></div><div class="tw" style="max-height:340px"><table><thead><tr><th>PO / Sales</th><th>Customer Portal</th><th></th></tr></thead><tbody>${m.confident.map(p => row(p.f.name, p.c.name, `<td><button class="btn sm" onclick="linkOne(${jsq(p.f.id)},${jsq(p.c.custId)})">Link</button></td>`)).join('')}</tbody></table></div></div>` : ''}
  ${m.possible.length ? `<div class="card"><div class="card-h"><h3>Similar names — please check (${m.possible.length})</h3><span class="hint">Only link if it is really the same company.</span></div><div class="tw" style="max-height:340px"><table><thead><tr><th>PO / Sales</th><th>Customer Portal</th><th>Match</th><th></th></tr></thead><tbody>${m.possible.map(p => `<tr><td><b>${esc(p.f.name)}</b><div class="hint">${esc(p.f.gstin || '')}</div></td><td>${esc(p.c.name)}<div class="hint">${esc(p.c.gstin || '')}</div></td><td><span class="pill ${p.score >= .8 ? 'warn' : ''}">${Math.round(p.score * 100)}%</span>${p.note ? `<div class="hint">${esc(p.note)}</div>` : ''}</td><td><button class="btn sm pri" onclick="linkOne(${jsq(p.f.id)},${jsq(p.c.custId)})">Same — link</button> <button class="btn sm" onclick="skipOne(${jsq(p.f.id)},${jsq(p.c.custId)})">Different</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${m.fsOnly.length ? `<div class="card"><div class="card-h"><h3>Only in PO / Sales (${m.fsOnly.length})</h3><button class="btn sm" style="margin-left:auto" onclick="bulkCreate('cms')">Create all in Customer Portal</button></div><div class="tw" style="max-height:300px"><table><tbody>${m.fsOnly.map(f => `<tr><td><b>${esc(f.name)}</b></td><td class="hint">${esc(f.gstin || '')}</td><td><button class="btn sm" onclick="pickLink(${jsq(f.id)})">Link to…</button> <button class="btn sm" onclick="pickLink(${jsq(f.id)})">Link to…</button> <button class="btn sm" onclick="createInCms(${jsq(f.id)})">Create in Customer Portal</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${m.cmsOnly.length ? `<div class="card"><div class="card-h"><h3>Only in Customer Portal (${m.cmsOnly.length})</h3><button class="btn sm" style="margin-left:auto" onclick="bulkCreate('fs')">Create all in PO / Sales</button><span class="hint">so they appear in PO entry and quotation lists</span></div><div class="tw" style="max-height:300px"><table><tbody>${m.cmsOnly.map(c => `<tr><td><b>${esc(c.name)}</b></td><td class="hint">${esc(c.gstin || '')}</td><td><button class="btn sm" onclick="createInFs(${jsq(c.custId)})">Create in PO / Sales</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
  ${m.dups.length ? `<div class="card"><div class="card-h"><h3>Possible duplicates inside PO / Sales (${m.dups.length})</h3><span class="hint">Same company entered twice. Not merged automatically because existing POs point to each record.</span></div><div class="card-b">${m.dups.map(g => `<div style="margin-bottom:6px">${g.map(f => `<span class="chip"><b>${esc(f.name)}</b>${f.cmsId ? ' ✓' : ''}</span>`).join(' ')}</div>`).join('')}</div></div>` : ''}
  ${!m.confident.length && !m.possible.length && !m.fsOnly.length && !m.cmsOnly.length ? '<div class="card"><div class="empty">✓ Every customer is linked. One master.</div></div>' : ''}`;
}

/* ---------- bought-out parts register ---------- */
let PQ = '';
function vParts(){
  $('#ttl').textContent = 'Bought-out Parts';
  $('#topr').innerHTML = `<button class="btn" onclick="editPart('')">＋ Add part</button> <label class="btn pri" style="cursor:pointer">⬆ Import costing workbook<input type="file" accept=".xlsx,.xls" id="wbFile2" style="display:none"></label>`;
  $('#wbFile2').onchange = e => { const f = e.target.files[0]; if(f) importWorkbookFile(f); e.target.value = ''; };
  $('#view').innerHTML = `<div class="card"><div class="card-h"><input id="pq" placeholder="Search part…" value="${esc(PQ)}" style="max-width:260px"><span class="hint">Purchase prices of sleeves, rings, seals, bolts… The landed rate adds ${num(SET.boughtMarginPct)}% margin and ${num(SET.freightPct)}% freight (change on Costing Defaults).</span></div><div class="tw" id="pbody"></div></div>`;
  $('#pq').oninput = e => { PQ = e.target.value; drawParts(); }; drawParts();
}
function drawParts(){
  const q = PQ.toLowerCase(), list = Object.values(PARTS).filter(p => !q || (p.name + ' ' + (p.party || '')).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
  $('#pbody').innerHTML = list.length ? `<table><thead><tr><th>Part / size</th><th>Supplier</th><th>Last purchase</th><th class="num">Purchase price</th><th class="num">Landed rate</th><th></th></tr></thead><tbody>
  ${list.map(p => `<tr class="click" onclick="editPart(${jsq(p.id)})"><td><b class="mono">${esc(p.name)}</b></td><td>${esc(p.party || '—')}</td><td>${esc(p.date || '—')}</td><td class="num">${inr(p.price)}</td><td class="num"><b>${inr(landed(p))}</b></td><td><button class="btn sm">Edit</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No parts yet. Add one, or import the costing workbook (its Purchase Log sheet loads here).</div>';
}
function editPart(id){
  const p = PARTS[id] || {name: '', price: '', party: '', date: ''};
  modal(`<div class="modal-h"><h3>${id ? 'Edit part' : 'Add part'}</h3><button class="btn sm" onclick="closeModal()">✕</button></div><div class="modal-b"><div class="form">
    <div class="fld full"><label>Part name / size</label><input id="ptName" value="${esc(p.name)}" ${id ? 'readonly' : ''} placeholder="e.g. H 211 sleeve, TG 508 ring"></div>
    <div class="fld"><label>Purchase price (₹)</label><input id="ptPrice" type="number" step="0.01" value="${esc(p.price)}"></div>
    <div class="fld"><label>Supplier</label><input id="ptParty" value="${esc(p.party || '')}"></div>
    <div class="fld"><label>Purchase date</label><input id="ptDate" type="date" value="${esc(p.date || '')}"></div></div></div>
  <div class="modal-f">${id ? `<button class="btn" style="color:var(--crit)" onclick="delPart(${jsq(id)})">Delete</button>` : ''}<button class="btn" onclick="closeModal()">Cancel</button><button class="btn pri" onclick="savePart()">Save</button></div>`);
}
async function savePart(){
  const name = $('#ptName').value.trim(); if(!name){ toast('Enter a part name'); return; }
  try{ await db.collection('erp_parts').doc(costKey(name)).set({name, price: num($('#ptPrice').value), party: $('#ptParty').value.trim(), date: $('#ptDate').value, source: 'manual', updatedAt: new Date().toISOString()}, {merge: true}); closeModal(); toast('Part saved'); }catch(e){ toast('Could not save: ' + e.message); }
}
async function delPart(id){ if(!confirm('Delete this part?')) return; try{ await db.collection('erp_parts').doc(id).delete(); closeModal(); toast('Part deleted'); }catch(e){ toast(e.message); } }
// 'Purchase Log' sheet: Size | Party | Date | Price | Remarks — keep the most recent purchase of each size
function toIso(v){
  if(v == null || v === '') return '';
  if(v instanceof Date) return isNaN(v) ? '' : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if(typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);   // Excel serial date
  const m = String(v).trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/); if(m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return String(v).slice(0, 10);
}
function parseParts(sheets){
  const key = Object.keys(sheets).find(k => /purchase log/i.test(k)); if(!key) return [];
  const rows = sheets[key], hr = rows.findIndex(r => (r || []).some(c => /^size$/i.test(String(c || '').trim()))); if(hr < 0) return [];
  const h = rows[hr].map(c => String(c || '').trim().toLowerCase()), ix = re => h.findIndex(x => re.test(x));
  const a = ix(/^size$/), b = ix(/party/), d = ix(/date/), p = ix(/price/), best = {};
  rows.slice(hr + 1).forEach(r => { const name = String(r[a] == null ? '' : r[a]).trim(), price = parseFloat(r[p]); if(!name || !(price > 0)) return;
    const date = toIso(r[d]); if(!best[name] || date >= best[name].date) best[name] = {name, price, party: r[b] ? String(r[b]).trim() : '', date, source: 'costing workbook (Purchase Log)'}; });
  return Object.values(best);
}

/* ---------- costing defaults ---------- */
function vSettings(){
  $('#ttl').textContent = 'Settings & Defaults';
  $('#view').innerHTML = `<div class="card"><div class="card-h"><h3>Defaults for new costing sheets</h3></div><div class="card-b"><div class="form" style="max-width:640px">
    <div class="sec">Casting rate by material (₹ per kg)</div>
    ${matList().map((m, i) => `<div class="fld"><label>${esc(m.n)}</label><input class="sMat" data-n="${esc(m.n)}" type="number" step="0.01" value="${num(m.rate)}"></div>`).join('')}
    <div class="sec">Other defaults</div>
    <div class="fld"><label>Rejection allowance %</label><input id="sRej" type="number" step="0.1" value="${esc(SET.rejPct)}"></div>
    <div class="fld"><label>Overhead %</label><input id="sOvh" type="number" step="0.1" value="${esc(SET.ovhPct)}"></div>
    <div class="fld"><label>Margin % on cost</label><input id="sMar" type="number" step="0.1" value="${esc(SET.marginPct)}"></div>
    <div class="fld"><label>Machining loss % (finished weight)</label><input id="sLoss" type="number" step="0.1" value="${esc(SET.machLossPct)}"></div>
    <div class="fld"><label>Bought-out margin % on purchase price</label><input id="sBm" type="number" step="0.1" value="${esc(SET.boughtMarginPct)}"></div>
    <div class="fld"><label>Freight &amp; handling % on purchase price</label><input id="sFr" type="number" step="0.1" value="${esc(SET.freightPct)}"></div>
    <div class="sec">ERP access</div>
    <div class="fld full"><label>ERP admins — emails allowed to open this full ERP (one per line). Everyone else is sent to the Entry Desk. Leave empty to allow all.</label><textarea id="sAdm" rows="3" placeholder="akashparjapati@gmail.com">${esc((SET.admins || []).join('\n'))}</textarea></div>
    <div class="sec">Costing</div>
    <div class="fld full"><label>Standard machining operations (one per line)</label><textarea id="sOps" rows="7">${esc((SET.ops || DEFAULT_OPS).join('\n'))}</textarea></div>
    <div class="full"><button class="btn pri" onclick="saveSettings()">Save defaults</button></div></div>
    <div class="hint" style="margin-top:12px">Material rates pre-fill <i>new</i> costing sheets (and update when you change the material on a sheet). Existing sheets keep the rate they were saved with.</div></div></div>`;
}
async function saveSettings(){
  const d = {mats: $$('.sMat').map(e => ({n: e.dataset.n, rate: num(e.value)})), rejPct: num($('#sRej').value), ovhPct: num($('#sOvh').value), marginPct: num($('#sMar').value), machLossPct: num($('#sLoss').value), boughtMarginPct: num($('#sBm').value), freightPct: num($('#sFr').value), ops: $('#sOps').value.split('\n').map(x => x.trim()).filter(Boolean)};
  d.admins = $('#sAdm').value.split(/[\n,]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  if(d.admins.length && !d.admins.includes(String(me()).toLowerCase()) && !confirm('You (' + me() + ') are not in the ERP admin list — you will be sent to the Entry Desk after saving. Continue?')) return;
  try{ await db.collection('erp_settings').doc('main').set(d, {merge: true}); toast('Saved'); }catch(e){ toast('Could not save: ' + e.message); }
}

/* ---------- modal ---------- */
function modal(html){ closeModal(); const o = document.createElement('div'); o.className = 'ovl'; o.id = 'ovl'; o.innerHTML = `<div class="modal">${html}</div>`; o.addEventListener('mousedown', e => { if(e.target === o) closeModal(); }); document.body.appendChild(o); }
function closeModal(){ const o = $('#ovl'); if(o) o.remove(); }

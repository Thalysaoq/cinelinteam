// =====================================================================
//  Cinelin Team — lógica do draft
//  Configurações ficam em config.js · dados dos times em data.js
// =====================================================================
(() => {
"use strict";

const C = window.CONFIG;
const CDN = "https://kingsleague-cdn.kama.football/account/production/player/";
const STORE = "cinelin-team-v2";
const ROLES = ["goalkeeper", "defender", "midfielder", "forward"];
const POS = { goalkeeper: "GOL", defender: "DEF", midfielder: "MEI", forward: "ATA" };
const POS_FULL = { goalkeeper: "Goleiro", defender: "Defensor", midfielder: "Meia", forward: "Atacante" };
const MODES = { cobrinha: "Cobrinha (1-2-2-1)", alternado: "Alternado (1-2-1-2)", livre: "Livre (sem turno)" };

// ---------------------------------------------------------------- dados
const ROLE_PT = { goleiro: "goalkeeper", defensor: "defender", meia: "midfielder", atacante: "forward" };
const TEAMS = window.TIMES.slice();
// time da CineLin TV (config.js) — ids negativos para não bater com os outros jogadores
if (C.timeCineLin) {
  const tc = C.timeCineLin;
  TEAMS.unshift({ id: -1, name: tc.nome, short: tc.sigla, c1: tc.c1, c2: tc.c2, logo: tc.logo,
    players: tc.jogadores.map((j, i) => [-(i + 1), j.nome, ROLE_PT[j.posicao] || "forward", j.numero || "", j.foto || "", j.estrela ? "estrela" : null, j.ovr]) });
}
const TEAM = Object.fromEntries(TEAMS.map(t => [t.id, t]));
const PLAYERS = [];
TEAMS.forEach(t => t.players.forEach(([id, n, r, j, img, cat, ovr]) => {
  const raw = (window.STATS || {})[id] || [];
  const [pg = 0, min = 0, gol = 0, ass = 0, mvp = 0, am = 0, vm = 0, gs = 0, def = 0, fin = 0, alt = 0] = raw;
  const p = { id, n, r, j, cat, team: t.id, img: !img ? "" : /^(https?:|data:|img\/)/.test(img) ? img : CDN + img,
    s: { pg, min, gol, ass, mvp, am, vm, gs, def, fin, alt } };
  p.ovr = ovr || calcOvr(p);
  PLAYERS.push(p);
}));
const P = Object.fromEntries(PLAYERS.map(p => [p.id, p]));
// presidentes = personagens da CineLin TV (config.js)
const PRES = (C.presidentes || []).map((x, i) => ({ id: i + 1, n: x.nome, img: x.foto || "", c1: x.c1 || "#f5c518", c2: x.c2 || "#000" }));
const PR = Object.fromEntries(PRES.map(x => [x.id, x]));

// "OVR" calculado a partir das estatísticas da temporada (não é nota oficial)
function calcOvr(p) {
  const s = p.s;
  if (!s.pg) return 60;
  let v = p.r === "goalkeeper"
    ? 64 + s.def * 0.7 + s.mvp * 5 + s.pg * 1.5 - (s.gs / s.pg) * 1.5 + s.gol * 2
    : 62 + s.gol * 4 + s.ass * 3 + s.mvp * 5 + Math.min(s.fin, 16) * 0.5 + s.pg * 1.5 - s.am - s.vm * 3;
  return Math.max(50, Math.min(97, Math.round(v)));
}

// ---------------------------------------------------------------- estado
function buildSlots(formation, old = []) {
  const [d, m, a] = C.formacoes[formation];
  const roles = ["goalkeeper", ...Array(d).fill("defender"), ...Array(m).fill("midfielder"), ...Array(a).fill("forward")];
  const left = old.filter(s => s.pid).map(s => s.pid);
  const slots = roles.map(role => {
    const i = left.findIndex(pid => P[pid].r === role);
    return { role, pid: i >= 0 ? left.splice(i, 1)[0] : null };
  });
  if (!C.respeitarPosicao || (S && !S.strict)) {
    slots.forEach(s => {
      if (s.pid) return;
      const i = left.length ? 0 : -1;
      if (i >= 0) s.pid = left.splice(i, 1)[0];
    });
  }
  return { slots, left };
}

function newManager(j) {
  return { name: j.nome, team: j.time, color: j.cor, formation: C.formacaoPadrao,
    slots: buildSlots(C.formacaoPadrao).slots, bench: Array(C.reservas).fill(null), president: null };
}
function newState() {
  return { phase: "setup", mode: C.modoPadrao, modeV: 3, timer: C.tempoPorEscolha, strict: C.respeitarPosicao, first: 0,
    managers: C.jogadores.slice(0, 2).map(newManager), history: [] };
}

let S = null;
try { S = JSON.parse(localStorage.getItem(STORE)); } catch {}
if (!S || !Array.isArray(S.managers) || S.managers.length !== 2) S = newState();
if (!S.modeV || S.modeV < 2) S.mode = C.modoPadrao; // padrão passou a ser modo livre
if (!S.modeV || S.modeV < 3) S.strict = C.respeitarPosicao; // padrão passou a ser qualquer posição
S.modeV = 3;
S.history = (S.history || []).filter(h => !h.pres || PR[h.pres]); // presidentes antigos (de times) não existem mais
S.managers.forEach(mg => { // ajusta caso config.js tenha mudado
  if (!C.formacoes[mg.formation]) mg.formation = C.formacaoPadrao;
  mg.slots = (mg.slots || []).filter(s => s && P[s.pid] || s && !s.pid);
  if (mg.slots.length !== 1 + C.formacoes[mg.formation].reduce((a, b) => a + b, 0)) mg.slots = buildSlots(mg.formation, mg.slots).slots;
  mg.bench = mg.bench || [];
  while (mg.bench.length < C.reservas) mg.bench.push(null);
  mg.bench.length = C.reservas;
  mg.slots.forEach(s => { if (s.pid && !P[s.pid]) s.pid = null; });
  mg.bench = mg.bench.map(pid => (pid && P[pid] ? pid : null));
  if (mg.president && !PR[mg.president]) mg.president = null;
});

const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} };

const ui = { sel: null, focus: 0, tab: "pool", pos: "", team: "", q: "", cat: "", sort: "ovr", hideTaken: true,
  timeLeft: 0, lastPlaced: null, built: false };

// ---------------------------------------------------------------- helpers
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ini = n => n.replace(/'/g, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const $ = id => document.getElementById(id);
const photo = (p, cls = "") => p.img
  ? `<img class="${cls}" src="${p.img}" alt="" loading="lazy" data-ini="${ini(p.n)}">`
  : `<div class="ini ${cls}">${ini(p.n)}</div>`;

const totalPicks = mg => mg.slots.length + C.reservas + (C.escolherPresidente ? 1 : 0);
const count = mg => mg.slots.filter(s => s.pid).length + mg.bench.filter(Boolean).length + (mg.president ? 1 : 0);
const isFull = mi => count(S.managers[mi]) >= totalPicks(S.managers[mi]);
const draftDone = () => isFull(0) && isFull(1);

function owners() {
  const o = {};
  S.managers.forEach((mg, i) => { mg.slots.forEach(s => s.pid && (o[s.pid] = i)); mg.bench.forEach(pid => pid && (o[pid] = i)); });
  return o;
}
const presOwner = id => S.managers.findIndex(m => m.president === id);
const presPic = (x, cls = "") => x.img
  ? `<img class="${cls}" src="${esc(x.img)}" alt="" data-ini="${ini(x.n)}">`
  : `<div class="ini ${cls}">${ini(x.n)}</div>`;

// De quem é a vez (null = modo livre ou draft completo)
function currentTurn() {
  if (S.mode === "livre" || draftDone()) return null;
  const n = S.history.length;
  const t = S.mode === "alternado" ? n % 2 : Math.floor((n + 1) / 2) % 2;
  const mi = t === 0 ? S.first : 1 - S.first;
  return isFull(mi) ? 1 - mi : mi;
}
const activeMi = () => currentTurn() ?? (ui.sel ? ui.sel.mi : ui.focus);

function canPlace(p, role) {
  if (!role || !S.strict) return true; // banco aceita qualquer um; sem "respeitar posição" vale tudo
  return p.r === role;
}
function findTarget(mi, p) {
  const mg = S.managers[mi];
  let i = mg.slots.findIndex(s => !s.pid && s.role === p.r);
  if (i < 0) i = mg.slots.findIndex(s => !s.pid && canPlace(p, s.role));
  if (i >= 0) return { mi, kind: "slot", idx: i };
  i = mg.bench.findIndex(b => !b);
  return i >= 0 ? { mi, kind: "bench", idx: i } : null;
}

function teamStats(mg) {
  const starters = mg.slots.filter(s => s.pid).map(s => P[s.pid]);
  const all = [...starters, ...mg.bench.filter(Boolean).map(id => P[id])];
  const sum = k => all.reduce((a, p) => a + p.s[k], 0);
  const avg = (arr, f) => arr.length ? Math.round(arr.reduce((a, p) => a + f(p), 0) / arr.length) : 0;
  const gk = mg.slots[0].pid && P[mg.slots[0].pid];
  return {
    ovr: avg(starters, p => p.ovr), ovrAll: avg(all, p => p.ovr),
    gol: sum("gol"), ass: sum("ass"), mvp: sum("mvp"), fin: sum("fin"),
    alt: avg(all.filter(p => p.s.alt), p => p.s.alt), def: gk ? gk.s.def : 0,
    clubs: new Set(all.map(p => p.team)).size,
  };
}

// ---------------------------------------------------------------- feedback
function toast(msg, color, err) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (err ? " err" : "");
  t.style.setProperty("--tcol", err ? "" : color || "var(--gold)");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.className = "toast"), 2000);
}
const fail = msg => toast(msg, null, true);

function checkTurn(mi) {
  if (S.phase !== "draft") return false;
  const t = currentTurn();
  if (S.mode !== "livre" && t === null) { fail("O draft já terminou!"); return false; }
  if (t !== null && t !== mi) { fail(`Calma! Agora é a vez de ${S.managers[t].name}`); return false; }
  if (isFull(mi)) { fail(`${S.managers[mi].team} já está completo`); return false; }
  return true;
}

// ---------------------------------------------------------------- ações do draft
// target: {mi, kind, idx} = vaga exata · {mi} = primeira vaga livre desse time · vazio = time ativo
function pick(pid, target) {
  const p = P[pid];
  if (owners()[pid] !== undefined) return fail("Esse jogador já tem dono");
  const mi = target ? target.mi : activeMi();
  const mg = S.managers[mi];
  const exact = target && target.kind ? target : null;
  // no modo livre, soltar em cima de alguém troca: o antigo volta pro mercado
  const replaced = exact && (exact.kind === "slot" ? mg.slots[exact.idx].pid : mg.bench[exact.idx]);
  if (replaced && S.mode !== "livre") return fail("Essa vaga já está ocupada");
  if (replaced ? S.phase !== "draft" : !checkTurn(mi)) return;
  const t = exact || findTarget(mi, p);
  if (!t) return fail(`${mg.team} não tem vaga livre para ${POS_FULL[p.r]}`);
  if (t.kind === "slot") {
    const slot = mg.slots[t.idx];
    if (!canPlace(p, slot.role)) return fail(`Essa vaga é de ${POS_FULL[slot.role]} — ${p.n} é ${POS_FULL[p.r]}`);
    slot.pid = pid;
  } else mg.bench[t.idx] = pid;
  if (replaced) S.history = S.history.filter(h => h.pid !== replaced);
  S.history.push({ mi, pid });
  ui.sel = null;
  ui.lastPlaced = pid;
  if (ui.autoPos) { ui.pos = ""; ui.autoPos = false; } // filtro de posição posto pela vaga volta a "Todos"
  committed(replaced ? `${p.n} entrou no lugar de ${P[replaced].n}` : `${p.n} → ${mg.team}`, mg.color);
}

// lixeira / botão ✕ — no modo com vez, só dá para jogar fora a última escolha
function trash(mi, pid) {
  if (S.phase !== "draft") return;
  if (S.mode === "livre") return removeFree(mi, pid);
  const last = S.history[S.history.length - 1];
  if (last && last.pid === pid) return undo();
  fail("No draft com vez, só dá para tirar a última escolha");
}
function trashPres(mi) {
  const mg = S.managers[mi];
  if (S.phase !== "draft" || !mg.president) return;
  const last = S.history[S.history.length - 1];
  if (S.mode !== "livre") return last && last.pres && last.mi === mi ? undo() : fail("No draft com vez, só dá para tirar a última escolha");
  const name = PR[mg.president].n;
  mg.president = null;
  S.history = S.history.filter(h => !(h.pres && h.mi === mi));
  committed(`${name} saiu da presidência`, "#fff");
}

function pickPres(mi, presId) {
  const mg = S.managers[mi];
  if (S.mode === "livre" && mg.president) { // troca livre
    if (presOwner(presId) >= 0 && presOwner(presId) !== mi) return fail("Esse presidente já foi escolhido");
    mg.president = presId;
    S.history.forEach(h => { if (h.mi === mi && h.pres) h.pres = presId; });
    closeModal();
    return committed(`Presidente: ${PR[presId].n}`, mg.color);
  }
  if (!checkTurn(mi)) return;
  if (presOwner(presId) >= 0) return fail("Esse presidente já foi escolhido");
  mg.president = presId;
  S.history.push({ mi, pres: presId });
  closeModal();
  committed(`${PR[presId].n} preside o ${mg.team}`, mg.color);
}

function removeFromTeam(mi, pid) {
  const mg = S.managers[mi];
  mg.slots.forEach(s => { if (s.pid === pid) s.pid = null; });
  mg.bench = mg.bench.map(b => (b === pid ? null : b));
}

function undo() {
  if (S.phase !== "draft") return;
  const h = S.history.pop();
  if (!h) return fail("Nada para desfazer");
  if (h.pres) S.managers[h.mi].president = null;
  else removeFromTeam(h.mi, h.pid);
  closeModal();
  committed("Última escolha desfeita", "#fff");
}

function removeFree(mi, pid) {
  removeFromTeam(mi, pid);
  S.history = S.history.filter(h => h.pid !== pid);
  closeModal();
  committed(`${P[pid].n} voltou para o mercado`, "#fff");
}

// arrastar uma vaga para outra: move ou troca os dois de lugar — não gasta escolha
// (entre times diferentes só no modo livre)
function swap(a, b) {
  if (a.mi === b.mi && a.kind === b.kind && a.idx === b.idx) return;
  if (a.mi !== b.mi && S.mode !== "livre") return fail("Passar jogador de um time pro outro só no modo livre");
  const mg = x => S.managers[x.mi];
  const get = x => (x.kind === "slot" ? mg(x).slots[x.idx].pid : mg(x).bench[x.idx]);
  const set = (x, v) => (x.kind === "slot" ? (mg(x).slots[x.idx].pid = v) : (mg(x).bench[x.idx] = v));
  const role = x => (x.kind === "slot" ? mg(x).slots[x.idx].role : null);
  const pa = get(a), pb = get(b);
  if (pa && !canPlace(P[pa], role(b))) return fail(`${P[pa].n} não pode jogar de ${POS_FULL[role(b)]}`);
  if (pb && !canPlace(P[pb], role(a))) return fail(`${P[pb].n} não pode jogar de ${POS_FULL[role(a)]}`);
  set(a, pb); set(b, pa);
  if (a.mi !== b.mi) S.history.forEach(h => { if (h.pid === pa) h.mi = b.mi; else if (h.pid && h.pid === pb) h.mi = a.mi; });
  ui.lastPlaced = pa;
  save(); render();
  if (a.mi !== b.mi) toast(`${P[pa].n} → ${mg(b).team}`, mg(b).color);
}

function setFormation(mi, f) {
  const mg = S.managers[mi];
  const { slots, left } = buildSlots(f, mg.slots);
  const free = mg.bench.filter(b => !b).length;
  if (left.length > free) { fail(`Libere ${left.length - free} vaga(s) no banco antes de mudar para ${f}`); return render(); }
  mg.formation = f; mg.slots = slots;
  left.forEach(pid => (mg.bench[mg.bench.indexOf(null)] = pid));
  if (left.length) toast(`${left.length} jogador(es) foram para o banco`, mg.color);
  ui.sel = null;
  save(); render();
}

// escolhe sozinho o melhor disponível (botão "Auto" ou cronômetro zerado)
function autoPick() {
  const mi = activeMi();
  if (!checkTurn(mi)) return;
  const mg = S.managers[mi];
  const own = owners();
  const avail = PLAYERS.filter(p => own[p.id] === undefined).sort((a, b) => b.ovr - a.ovr);
  const idx = mg.slots.findIndex(s => !s.pid);
  if (idx >= 0) {
    const role = mg.slots[idx].role;
    const p = avail.find(p => p.r === role) || avail.find(p => canPlace(p, role));
    if (p) return pick(p.id, { mi, kind: "slot", idx });
  }
  if (C.escolherPresidente && !mg.president) {
    const free = PRES.filter(x => presOwner(x.id) < 0);
    if (free.length) return pickPres(mi, free[Math.floor(Math.random() * free.length)].id);
  }
  const b = mg.bench.findIndex(x => !x);
  if (b >= 0 && avail.length) return pick(avail[0].id, { mi, kind: "bench", idx: b });
}

function committed(msg, color) {
  save();
  ui.timeLeft = S.timer;
  render();
  if (msg) toast(msg, color);
  if (S.phase === "draft" && draftDone()) {
    setTimeout(() => { toast("Draft completo! 🏆"); S.phase = "final"; save(); render(); window.scrollTo(0, 0); }, 900);
  }
}

// ---------------------------------------------------------------- telas
function render() {
  ["setup", "draft", "final"].forEach(id => $(id).classList.toggle("hidden", S.phase !== id));
  if (S.phase === "setup") renderSetup();
  if (S.phase === "draft") renderDraft();
  if (S.phase === "final") renderFinal();
}

// ============ SETUP ============
function renderSetup() {
  const resumable = S.history.length > 0;
  const miniPitch = (f) => `<div class="mini-pitch">${[...C.formacoes[f]].reverse().map(n => `<div>${"<i></i>".repeat(n)}</div>`).join("")}<div><i></i></div></div>`;
  $("setup").innerHTML = `
    <div class="hero">
      <img src="${esc(C.logo)}" alt="CineLin TV">
      <h1 class="display">${esc(C.titulo)}</h1>
      <p>${esc(C.subtitulo)}</p>
    </div>
    <div class="setup-grid">
      ${S.managers.map((mg, mi) => `
        <div class="pcard" style="--mc:${mg.color}">
          <h2 class="display">Jogador ${mi + 1}</h2>
          <div class="field"><label>Seu nome</label><input data-set="name" data-mi="${mi}" value="${esc(mg.name)}" maxlength="24"></div>
          <div class="field"><label>Nome do time</label><input data-set="team" data-mi="${mi}" value="${esc(mg.team)}" maxlength="28"></div>
          <div class="field"><label>Cor</label><div class="swatches">
            ${C.paletaCores.map(c => `<button class="swatch ${c === mg.color ? "on" : ""}" style="background:${c}" data-color="${c}" data-mi="${mi}" title="${c}"></button>`).join("")}
          </div></div>
          <div class="field"><label>Formação (1 goleiro + 6 na linha)</label><div class="forms">
            ${Object.keys(C.formacoes).map(f => `<button class="form-opt ${f === mg.formation ? "on" : ""}" data-form="${f}" data-mi="${mi}">${miniPitch(f)}${f}</button>`).join("")}
          </div></div>
        </div>`).join("")}
    </div>
    <div class="rules">
      <div class="field"><label>Tipo de montagem</label>
        <div class="seg">${["livre", "cobrinha", "alternado"].map(k => `<button class="${S.mode === k ? "on" : ""}" data-mode="${k}">${MODES[k].split(" ")[0]}</button>`).join("")}</div>
        <div class="small-note">${S.mode === "livre" ? "Cada um monta seu time quando quiser, sem esperar a vez." : MODES[S.mode]}</div>
      </div>
      ${S.mode === "livre" ? "" : `
      <div class="field"><label>Tempo por escolha</label>
        <div class="seg">${[0, 30, 60, 90].map(s => `<button class="${S.timer === s ? "on" : ""}" data-timer="${s}">${s ? s + "s" : "Sem"}</button>`).join("")}</div>
        <div class="small-note">${S.timer ? "Se o tempo acabar, escolhe o melhor disponível sozinho." : "Sem cronômetro."}</div>
      </div>
      <div class="field"><label>Quem começa</label>
        <div class="seg">${S.managers.map((m, i) => `<button class="${S.first === i ? "on" : ""}" data-first="${i}">${esc(m.name)}</button>`).join("")}<button data-first="coin">🪙 Sortear</button></div>
      </div>`}
      <div class="field"><label>Posições</label>
        <label class="check"><input type="checkbox" id="strict" ${S.strict ? "checked" : ""}> Respeitar posição de cada vaga</label>
      </div>
    </div>
    <div class="start-row">
      ${resumable ? `<button class="btn big gold" data-act="start">▶ Continuar draft (${S.history.length} escolhas)</button><button class="btn big danger" data-act="reset">Recomeçar do zero</button>`
                  : `<button class="btn big gold" data-act="start">⚽ Começar draft</button>`}
    </div>
    <footer>${PLAYERS.length} jogadores · ${TEAMS.length} times · presidentes: ${PRES.map(x => esc(x.n)).join(", ")} · OVR calculado pelas estatísticas da temporada</footer>`;
}

function coinFlip() {
  const names = S.managers.map(m => m.name);
  $("modal").innerHTML = `<div class="coin-wrap"><div class="coin-box"><div class="coin" id="coin">?</div><h3 class="display" id="coinTxt">Sorteando...</h3></div></div>`;
  let i = 0;
  const iv = setInterval(() => { $("coin").textContent = names[i++ % 2]; }, 110);
  setTimeout(() => {
    clearInterval(iv);
    S.first = Math.random() < 0.5 ? 0 : 1;
    const c = $("coin");
    c.textContent = names[S.first];
    c.classList.add("stop");
    c.style.background = S.managers[S.first].color;
    $("coinTxt").textContent = `${names[S.first]} começa!`;
    save();
    setTimeout(() => { closeModal(); renderSetup(); }, 1400);
  }, 1700);
}

function startDraft() {
  S.phase = "draft";
  ui.timeLeft = S.timer;
  ui.tab = "pool";
  save(); render(); window.scrollTo(0, 0);
}

// ============ DRAFT ============
function buildDraftSkeleton() {
  $("draft").innerHTML = `
    <div class="topbar" id="topbar"></div>
    <div class="progress"><i id="prog"></i></div>
    <div class="tabs" id="tabs"></div>
    <div class="board" id="board">
      <section class="team" id="team0"></section>
      <aside class="pool" id="pool">
        <div class="pool-head"><h3 class="display">Mercado</h3><span id="poolCount"></span></div>
        <div class="hint" id="hint"></div>
        <div class="chips" id="chips"></div>
        <div class="teamf" id="teamf"></div>
        <div class="frow">
          <input id="q" placeholder="🔎 Buscar jogador ou time..." autocomplete="off">
          <select id="sort" title="Ordenar">
            <option value="ovr">Melhores</option><option value="gol">Gols</option><option value="ass">Assist.</option>
            <option value="pos">Posição</option><option value="alt">Altura</option><option value="nome">Nome</option>
          </select>
          <select id="cat" title="Categoria"><option value="">Todos</option><option value="draft">Draft</option><option value="wildcard">Wildcard</option><option value="estrela">⭐ Estrelas</option></select>
        </div>
        <label class="check" style="font-size:12px;margin:-4px 0 8px"><input type="checkbox" id="hideTaken" checked> Esconder quem já foi escolhido</label>
        <div class="list" id="list"></div>
        <div class="history" id="hist"></div>
      </aside>
      <section class="team" id="team1"></section>
    </div>
    <div id="trash" class="trash"><span>🗑️</span> Solte aqui para tirar do time</div>
    <footer>Arraste o card até a vaga (no celular: segure e arraste) · arraste jogadores entre vagas para trocar · arraste para a 🗑️ para tirar · clique para ver os dados · Ctrl+Z desfaz</footer>`;
  $("q").oninput = e => { ui.q = e.target.value; renderPoolList(); };
  $("sort").onchange = e => { ui.sort = e.target.value; renderPoolList(); };
  $("cat").onchange = e => { ui.cat = e.target.value; renderPoolList(); };
  $("hideTaken").onchange = e => { ui.hideTaken = e.target.checked; renderPoolList(); };
  ui.built = true;
}

function renderDraft() {
  if (!ui.built) buildDraftSkeleton();
  const turn = currentTurn();
  const totalAll = totalPicks(S.managers[0]) + totalPicks(S.managers[1]);
  const done = count(S.managers[0]) + count(S.managers[1]);
  const tm = turn !== null ? S.managers[turn] : null;

  $("topbar").innerHTML = `
    <div class="brand"><img src="${esc(C.logo)}" alt="CineLin TV"><b class="display">${esc(C.titulo)}</b></div>
    ${tm ? `<div class="turn-pill" style="--tc:${tm.color}"><span class="dot">P${turn + 1}</span><div>Vez de ${esc(tm.name)}<small>${esc(tm.team)} · escolha ${done + 1} de ${totalAll}</small></div></div>`
         : draftDone() ? `<div class="turn-pill"><span class="dot" style="background:var(--gold)">🏆</span><div>Times completos!<small>${done} de ${totalAll} escolhas</small></div></div>`
         : `<div class="focus-pick"><small>Montando:</small>${S.managers.map((m, i) => `<button class="${ui.focus === i ? "on" : ""}" data-focus="${i}" style="--tc:${m.color}">${esc(m.team)} <span>${count(m)}/${totalPicks(m)}</span></button>`).join("")}</div>`}
    ${S.timer && tm ? `<div class="timer" id="timer">${ui.timeLeft}s</div>` : ""}
    <div class="spacer"></div>
    <div class="tools">
      <button class="btn" data-act="undo" ${S.history.length ? "" : "disabled"} title="Ctrl+Z">↶ Desfazer</button>
      <button class="btn" data-act="auto" ${draftDone() ? "disabled" : ""} title="Escolhe o melhor disponível">⚡ Auto</button>
      <button class="btn gold" data-act="final">🏆 Resultado</button>
      <button class="btn ghost" data-act="setup" title="Voltar à tela inicial">⚙</button>
    </div>`;
  $("prog").style.width = (done / totalAll) * 100 + "%";

  $("tabs").innerHTML = [0, "pool", 1].map(k => {
    const on = String(ui.tab) === String(k);
    if (k === "pool") return `<button class="${on ? "on" : ""}" data-tab="pool">Mercado</button>`;
    const m = S.managers[k];
    return `<button class="${on ? "on" : ""}" data-tab="${k}" style="--tc:${m.color}">${esc(m.team)} ${count(m)}/${totalPicks(m)}${turn === k ? " •" : ""}</button>`;
  }).join("");
  $("board").dataset.view = ui.tab; // só controla qual painel aparece no celular

  [0, 1].forEach(mi => {
    const el = $("team" + mi);
    const mg = S.managers[mi];
    el.style.setProperty("--mc", mg.color);
    el.classList.toggle("active", turn === mi || (S.mode === "livre" && ui.focus === mi));
    el.innerHTML = teamHTML(mi, false);
  });
  ui.lastPlaced = null;
  renderPoolFilters();
  renderPoolList();
  renderHistory();
}

function teamHTML(mi, ro) {
  const mg = S.managers[mi];
  let k = 1;
  const rows = C.formacoes[mg.formation].map(n => Array.from({ length: n }, () => k++)).reverse();
  const st = teamStats(mg);
  return `
    <div class="team-head" ${ro ? "" : `data-focus="${mi}"`}>
      <div class="badge-p">P${mi + 1}</div>
      <div class="names"><b>${esc(mg.team)}</b><small>${esc(mg.name)}</small></div>
      ${ro ? `<b class="display" style="font-size:20px">${mg.formation}</b>`
           : `<select data-formation="${mi}" title="Formação">${Object.keys(C.formacoes).map(f => `<option ${f === mg.formation ? "selected" : ""}>${f}</option>`).join("")}</select>`}
    </div>
    <div class="team-stats">
      <div><b>${st.ovr || "–"}</b><small>OVR titular</small></div>
      <div><b>${st.gol}</b><small>Gols</small></div>
      <div><b>${st.ass}</b><small>Assist.</small></div>
      <div><b>${count(mg)}/${totalPicks(mg)}</b><small>Escolhas</small></div>
    </div>
    <div class="pitch">
      <i class="ln mid"></i><i class="ln circ"></i><i class="ln area-t"></i><i class="ln area-b"></i>
      ${rows.map(r => `<div class="prow">${r.map(i => slotHTML(mi, "slot", i, ro)).join("")}</div>`).join("")}
      <div class="prow">${slotHTML(mi, "slot", 0, ro)}</div>
    </div>
    <div class="bench"><p class="sec-title">Banco de reservas</p>
      <div class="prow">${mg.bench.map((_, i) => slotHTML(mi, "bench", i, ro)).join("")}</div>
    </div>
    ${C.escolherPresidente ? staffHTML(mi, ro) : ""}`;
}

function slotHTML(mi, kind, idx, ro) {
  const mg = S.managers[mi];
  const pid = kind === "slot" ? mg.slots[idx].pid : mg.bench[idx];
  const role = kind === "slot" ? mg.slots[idx].role : null;
  const sel = !ro && ui.sel && ui.sel.mi === mi && ui.sel.kind === kind && ui.sel.idx === idx ? " sel" : "";
  const attrs = ro ? "" : `data-slot="${mi}:${kind}:${idx}"`;
  if (!pid) {
    return `<div class="slot${sel}" ${attrs}><div class="face">+ ${role ? POS[role] : "RES"}</div><div class="ps">${role ? POS_FULL[role] : "Reserva"}</div></div>`;
  }
  const p = P[pid], t = TEAM[p.team];
  const improv = role && role !== p.r ? " (improv.)" : "";
  return `<div class="slot filled${sel}${ui.lastPlaced === pid ? " new" : ""}" ${attrs} style="--tc1:${t.c1};--tc2:${t.c2}" title="${esc(p.n)} — ${esc(t.name)} · arraste para mover ou para a lixeira">
      ${ro ? "" : `<button class="rm" data-rm="${mi}:${pid}" title="Tirar do time">✕</button>`}
      <div class="face"><div class="ph">${photo(p)}</div><span class="ov">${p.ovr}</span><img class="tl" src="${t.logo}" alt=""></div>
      <div class="nm">${esc(p.n)}</div><div class="ps">${POS[p.r]}${improv} · ${t.short}</div>
    </div>`;
}

function staffHTML(mi, ro) {
  const mg = S.managers[mi];
  const t = mg.president && PR[mg.president];
  return `<div class="staff${t ? " filled" : ""}" ${ro ? "" : `data-staff="${mi}"`}>
      <div class="pic" ${t ? `style="background:linear-gradient(165deg,${t.c1},${t.c2})"` : ""}>${t ? presPic(t) : "👔"}</div>
      <div><p class="sec-title" style="margin:0 0 2px">Comissão · Presidente</p>
        ${t ? `<b>${esc(t.n)}</b><small>Presidente · CineLin TV</small>` : `<b>Escolher presidente</b><small>Clique para ver os ${PRES.length} presidentes</small>`}
      </div>
    </div>`;
}

function renderPoolFilters() {
  const own = owners();
  const free = PLAYERS.filter(p => own[p.id] === undefined);
  $("poolCount").textContent = `${free.length} disponíveis`;
  $("chips").innerHTML = [["", "Todos"], ...ROLES.map(r => [r, POS_FULL[r]])].map(([k, v]) =>
    `<button class="chip ${ui.pos === k ? "on" : ""}" data-pos="${k}">${v}<span class="n">${free.filter(p => !k || p.r === k).length}</span></button>`).join("");
  $("teamf").innerHTML = `<button class="${!ui.team ? "on" : ""}" data-team="">TODOS</button>` +
    TEAMS.map(t => `<button class="${ui.team === t.id ? "on" : ""}" data-team="${t.id}" title="${esc(t.name)}"><img src="${t.logo}" alt=""></button>`).join("");

  const h = $("hint");
  const turn = currentTurn();
  h.className = "hint";
  h.style.removeProperty("--mc");
  if (ui.sel) {
    const mg = S.managers[ui.sel.mi];
    const what = ui.sel.kind === "bench" ? "um reserva" : POS_FULL[mg.slots[ui.sel.idx].role];
    h.className = "hint sel";
    h.style.setProperty("--mc", mg.color);
    h.innerHTML = `Escolhendo <b>${what}</b> para <b>${esc(mg.team)}</b> — clique num jogador · <a href="#" data-act="unsel" style="color:inherit">cancelar</a>`;
  } else if (draftDone()) {
    h.innerHTML = `<b>Times completos!</b> Clique em 🏆 Resultado para ver o confronto.`;
  } else if (turn !== null) {
    h.innerHTML = `<b style="color:${S.managers[turn].color}">${esc(S.managers[turn].name)}</b>, clique numa vaga do seu campo ou direto num jogador.`;
  } else {
    const fm = S.managers[ui.focus];
    h.innerHTML = `Clicando num jogador ele vai para <b style="color:${fm.color}">${esc(fm.team)}</b>. Para o outro time, troque em "Montando" ou clique numa vaga dele.`;
  }
}

function renderPoolList() {
  const own = owners();
  const q = norm(ui.q.trim());
  const selRole = ui.sel && ui.sel.kind === "slot" ? S.managers[ui.sel.mi].slots[ui.sel.idx].role : null;
  const sorters = {
    ovr: (a, b) => b.ovr - a.ovr,
    gol: (a, b) => b.s.gol - a.s.gol || b.ovr - a.ovr,
    ass: (a, b) => b.s.ass - a.s.ass || b.ovr - a.ovr,
    alt: (a, b) => b.s.alt - a.s.alt,
    nome: (a, b) => a.n.localeCompare(b.n),
    pos: (a, b) => ROLES.indexOf(a.r) - ROLES.indexOf(b.r) || b.ovr - a.ovr,
  };
  const list = PLAYERS.filter(p =>
    (!ui.pos || p.r === ui.pos) && (!ui.team || p.team === ui.team) && (!ui.cat || p.cat === ui.cat) &&
    (!q || norm(p.n).includes(q) || norm(TEAM[p.team].name).includes(q)) &&
    !(ui.hideTaken && own[p.id] !== undefined)
  ).sort(sorters[ui.sort]);

  $("list").innerHTML = list.map(p => {
    const t = TEAM[p.team], s = p.s, o = own[p.id];
    const taken = o !== undefined;
    const fits = !taken && selRole && canPlace(p, selRole);
    return `<div class="card${taken ? " taken" : ""}${fits ? " fits" : ""}" data-pid="${p.id}" style="--tc1:${t.c1};--tc2:${t.c2}" title="${esc(p.n)} — ${esc(t.name)}">
        <div class="top">${photo(p, "ph")}
          <div class="ovr"><b>${p.ovr}</b><small>${POS[p.r]}</small></div>
          <img class="tlogo" src="${t.logo}" alt="">
          <span class="num">${p.j ? "#" + p.j : ""}</span>
          <button class="info" data-info="${p.id}" title="Ver detalhes">i</button>
        </div>
        <div class="body"><b>${esc(p.n)}${p.cat ? `<span class="cat ${p.cat}">${p.cat === "wildcard" ? "WC" : p.cat === "estrela" ? "⭐" : "DRAFT"}</span>` : ""}</b>
          <div class="st">${p.r === "goalkeeper"
            ? `<span>DEF <i>${s.def}</i></span><span>GS <i>${s.gs}</i></span>`
            : `<span>G <i>${s.gol}</i></span><span>A <i>${s.ass}</i></span>`}<span>J <i>${s.pg}</i></span></div>
        </div>
        ${taken ? `<div class="owner" style="--oc:${S.managers[o].color}">${esc(S.managers[o].team)}</div>` : ""}
      </div>`;
  }).join("") || `<div class="empty">Nenhum jogador com esses filtros.</div>`;
}

function renderHistory() {
  $("hist").innerHTML = S.history.length
    ? `<p class="sec-title">Histórico</p>` + S.history.map((h, i) => {
        const m = S.managers[h.mi];
        const what = h.pres ? `👔 ${esc(PR[h.pres].n)}` : `${esc(P[h.pid].n)} <span style="opacity:.6">(${POS[P[h.pid].r]})</span>`;
        return `<div style="--hc:${m.color}"><span class="n">${i + 1}</span><span><b>${esc(m.team)}</b> pegou ${what}</span></div>`;
      }).reverse().join("")
    : "";
}

// ============ RESULTADO ============
function renderFinal() {
  const st = S.managers.map(teamStats);
  const rows = [
    ["OVR titulares", "ovr"], ["OVR elenco", "ovrAll"], ["Gols na temporada", "gol"], ["Assistências", "ass"],
    ["MVPs", "mvp"], ["Finalizações", "fin"], ["Defesas do goleiro", "def"], ["Altura média (cm)", "alt"], ["Clubes diferentes", "clubs"],
  ];
  const c0 = S.managers[0].color, c1 = S.managers[1].color;
  const score = i => st[i].ovr * 2 + st[i].ovrAll + (S.managers[i].president ? 1 : 0);
  const diff = score(0) - score(1);
  const win = diff === 0 ? null : diff > 0 ? 0 : 1;
  $("final").innerHTML = `
    <div class="final-title"><h1 class="display">${esc(C.titulo)}</h1><p>${esc(S.managers[0].team)} × ${esc(S.managers[1].team)}</p></div>
    <div class="versus">
      <section class="team" style="--mc:${c0}">${teamHTML(0, true)}</section>
      <div class="cmp">
        <h3 class="display">Comparativo</h3>
        ${rows.map(([lab, k]) => {
          const a = st[0][k], b = st[1][k], tot = a + b || 1;
          return `<div class="cmp-row"><div class="vals"><span style="color:${c0}">${a}</span><span style="color:${c1}">${b}</span></div>
            <div class="bar"><i style="width:${(a / tot) * 100}%;background:${c0}"></i><i style="width:${(b / tot) * 100}%;background:${c1}"></i></div>
            <div class="lab">${lab}</div></div>`;
        }).join("")}
        <div class="winner" style="--wc:${win === null ? "var(--gold)" : S.managers[win].color}">
          <small>Favorito no papel</small><b>${win === null ? "Empate técnico" : esc(S.managers[win].team)}</b>
        </div>
      </div>
      <section class="team" style="--mc:${c1}">${teamHTML(1, true)}</section>
    </div>
    <div class="final-actions">
      <button class="btn big gold" data-act="copy">📋 Copiar escalações</button>
      <button class="btn big" data-act="print">🖨 Imprimir</button>
      <button class="btn big" data-act="back">↩ Voltar ao draft</button>
      <button class="btn big danger" data-act="reset">Novo draft</button>
    </div>
    <footer>OVR e favorito calculados pelas estatísticas da temporada atual — é só para a resenha 😄</footer>`;
}

// ---------------------------------------------------------------- modais
function closeModal() { $("modal").innerHTML = ""; }

function openPlayer(pid, ctx) {
  const p = P[pid], t = TEAM[p.team], s = p.s;
  const o = owners()[pid];
  const turn = currentTurn();
  const mi = ctx ? ctx.mi : activeMi();
  const actions = [];
  if (o === undefined && S.phase === "draft" && !draftDone()) {
    const who = S.managers[turn ?? mi];
    actions.push(`<button class="btn big gold" data-act="pickModal" data-pid="${pid}">Escolher para ${esc(who.team)}</button>`);
  }
  if (o !== undefined && S.phase === "draft") {
    const last = S.history[S.history.length - 1];
    if (last && last.pid === pid) actions.push(`<button class="btn big" data-act="undo">↶ Desfazer essa escolha</button>`);
    if (S.mode === "livre") actions.push(`<button class="btn big danger" data-act="remove" data-pid="${pid}" data-mi="${o}">Tirar do time</button>`);
  }
  const box = (v, l) => `<div><b>${v}</b><small>${l}</small></div>`;
  const statBoxes = p.r === "goalkeeper"
    ? [box(s.pg, "Jogos"), box(s.min + "'", "Minutos"), box(s.def, "Defesas"), box(s.gs, "Gols sofridos"), box(s.mvp, "MVP"), box(s.gol, "Gols"), box(s.ass, "Assist."), box(s.alt ? s.alt + "cm" : "–", "Altura")]
    : [box(s.pg, "Jogos"), box(s.min + "'", "Minutos"), box(s.gol, "Gols"), box(s.ass, "Assist."), box(s.mvp, "MVP"), box(s.fin, "Finaliz."), box(`${s.am}/${s.vm}`, "Amar./Verm."), box(s.alt ? s.alt + "cm" : "–", "Altura")];
  $("modal").innerHTML = `
    <div class="modal-bg" data-close>
      <div class="modal">
        <button class="x" data-close>✕</button>
        <div class="pm-top" style="--tc1:${t.c1};--tc2:${t.c2}">
          ${photo(p, "ph")}
          <div class="txt">
            <div class="ov">${p.ovr}</div>
            <h3>${esc(p.n)}</h3>
            <div class="tm"><img src="${t.logo}" alt="">${esc(t.name)} · ${POS_FULL[p.r]}${p.j ? " · #" + p.j : ""}</div>
            ${p.cat ? `<span class="cat ${p.cat}" style="display:inline-block;margin-top:6px">${p.cat === "estrela" ? "⭐ ESTRELA" : p.cat.toUpperCase()}</span>` : ""}
            ${o !== undefined ? `<div style="margin-top:6px;font-weight:800;color:${S.managers[o].color}">✔ No ${esc(S.managers[o].team)}</div>` : ""}
          </div>
        </div>
        <div class="pm-stats">${statBoxes.join("")}</div>
        <div class="pm-note">Estatísticas da temporada · OVR calculado a partir delas</div>
        ${actions.length ? `<div class="pm-actions">${actions.join("")}</div>` : ""}
      </div>
    </div>`;
}

function openPres(mi) {
  const mg = S.managers[mi];
  if (S.mode !== "livre") {
    if (mg.president) return fail("Presidente já escolhido (use Desfazer se quiser trocar)");
    if (!checkTurn(mi)) return;
  }
  $("modal").innerHTML = `
    <div class="modal-bg" data-close>
      <div class="modal" style="width:min(820px,100%)">
        <button class="x" data-close>✕</button>
        <h2 class="display" style="color:${mg.color}">Presidente do ${esc(mg.team)}</h2>
        <div class="pres-grid">
          ${PRES.map(t => {
            const o = presOwner(t.id);
            const dis = o >= 0 && o !== mi;
            return `<button class="pres" data-pres="${t.id}" data-mi="${mi}" ${dis ? "disabled" : ""} style="--tc1:${t.c1};--tc2:${t.c2}">
                <div class="img">${presPic(t, "p")}<img class="l" src="${esc(C.logo)}" alt=""></div>
                <b>${esc(t.n)}</b><small>${dis ? "Já é do " + esc(S.managers[o].team) : "CineLin TV"}</small>
              </button>`;
          }).join("")}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- copiar
function copyLineups() {
  const txt = `🏆 ${C.titulo.toUpperCase()} — Draft CineLin TV\n\n` + S.managers.map(m => {
    const st = teamStats(m);
    const nm = pid => pid ? `${P[pid].n} (${TEAM[P[pid].team].short})` : "—";
    const pres = m.president ? PR[m.president].n : "—";
    return `⚽ ${m.team} — ${m.name} · ${m.formation} · OVR ${st.ovr}\n👔 Presidente: ${pres}\n` +
      m.slots.map(s => `${POS[s.role]}: ${nm(s.pid)}`).join("\n") +
      `\n🪑 Reservas: ${m.bench.filter(Boolean).map(pid => P[pid].n).join(", ") || "—"}`;
  }).join("\n\n");
  navigator.clipboard.writeText(txt).then(() => toast("Escalações copiadas! Cola no WhatsApp 😉"), () => prompt("Copie o texto:", txt));
}

// ---------------------------------------------------------------- eventos
const parseSlot = el => { const [mi, kind, idx] = el.dataset.slot.split(":"); return { mi: +mi, kind, idx: +idx }; };

document.addEventListener("click", e => {
  const el = e.target;
  if (el.matches("[data-close]")) return closeModal();
  if (el.closest("select, input, textarea")) return; // campos de formulário têm handlers próprios (change/input)
  if (ui.noClick) return; // acabou de soltar um arraste

  const rm = el.closest("[data-rm]");
  if (rm) { const [mi, pid] = rm.dataset.rm.split(":"); return trash(+mi, +pid); }

  const info = el.closest("[data-info]");
  if (info) return openPlayer(+info.dataset.info);

  const act = el.closest("[data-act]");
  if (act) {
    e.preventDefault();
    switch (act.dataset.act) {
      case "start": return startDraft();
      case "undo": return undo();
      case "auto": return autoPick();
      case "final": S.phase = "final"; save(); render(); return window.scrollTo(0, 0);
      case "back": S.phase = "draft"; ui.built = false; save(); return render();
      case "setup": S.phase = "setup"; ui.built = false; ui.sel = null; save(); return render();
      case "copy": return copyLineups();
      case "print": return window.print();
      case "unsel": ui.sel = null; if (ui.autoPos) { ui.pos = ""; ui.autoPos = false; } return render();
      case "pickModal": closeModal(); return pick(+act.dataset.pid, ui.sel);
      case "remove": return removeFree(+act.dataset.mi, +act.dataset.pid);
      case "reset":
        if (!confirm("Apagar os times e começar um novo draft? (nomes e cores ficam)")) return;
        S.history = [];
        S.managers.forEach(m => { m.slots = buildSlots(m.formation).slots; m.bench = Array(C.reservas).fill(null); m.president = null; });
        S.phase = "setup"; ui.built = false; ui.sel = null;
        save(); return render();
    }
    return;
  }

  const pres = el.closest("[data-pres]");
  if (pres) return pickPres(+pres.dataset.mi, +pres.dataset.pres);

  const slot = el.closest("[data-slot]");
  if (slot) {
    const t = parseSlot(slot);
    const mg = S.managers[t.mi];
    const pid = t.kind === "slot" ? mg.slots[t.idx].pid : mg.bench[t.idx];
    ui.focus = t.mi;
    if (pid) return openPlayer(pid, t);
    const same = ui.sel && ui.sel.mi === t.mi && ui.sel.kind === t.kind && ui.sel.idx === t.idx;
    ui.sel = same ? null : t;
    if (ui.sel && t.kind === "slot" && S.strict) { ui.pos = mg.slots[t.idx].role; ui.autoPos = true; }
    if (ui.sel && t.kind === "bench") ui.pos = "";
    if (ui.sel && window.innerWidth <= 1000) ui.tab = "pool";
    return render();
  }

  const staff = el.closest("[data-staff]");
  if (staff) return openPres(+staff.dataset.staff);

  const card = el.closest(".card[data-pid]");
  if (card && !card.classList.contains("taken")) return pick(+card.dataset.pid, ui.sel);

  const pos = el.closest("[data-pos]");
  if (pos) { ui.pos = pos.dataset.pos; renderPoolFilters(); return renderPoolList(); }
  const tf = el.closest("[data-team]");
  if (tf) { ui.team = tf.dataset.team ? +tf.dataset.team : ""; renderPoolFilters(); return renderPoolList(); }
  const tab = el.closest(".tabs [data-tab]");
  if (tab) { ui.tab = tab.dataset.tab === "pool" ? "pool" : +tab.dataset.tab; window.scrollTo(0, 0); return render(); }
  const foc = el.closest("[data-focus]");
  if (foc && S.mode === "livre") { ui.focus = +foc.dataset.focus; return render(); }

  // --- setup ---
  const color = el.closest("[data-color]");
  if (color) { S.managers[+color.dataset.mi].color = color.dataset.color; save(); return renderSetup(); }
  const form = el.closest("[data-form]");
  if (form) { const mg = S.managers[+form.dataset.mi]; mg.formation = form.dataset.form; mg.slots = buildSlots(mg.formation, mg.slots).slots; save(); return renderSetup(); }
  const mode = el.closest("[data-mode]");
  if (mode) { S.mode = mode.dataset.mode; save(); return renderSetup(); }
  const timer = el.closest("[data-timer]");
  if (timer) { S.timer = +timer.dataset.timer; save(); return renderSetup(); }
  const first = el.closest("[data-first]");
  if (first) { if (first.dataset.first === "coin") return coinFlip(); S.first = +first.dataset.first; save(); return renderSetup(); }
});

document.addEventListener("input", e => {
  const set = e.target.dataset.set;
  if (!set) return;
  S.managers[+e.target.dataset.mi][set] = e.target.value;
  save();
});
document.addEventListener("change", e => {
  if (e.target.dataset.set) return renderSetup();
  if (e.target.id === "strict") { S.strict = e.target.checked; save(); return; }
  if (e.target.dataset.formation !== undefined) setFormation(+e.target.dataset.formation, e.target.value);
});

// ---------------------------------------------------------------- arrastar e soltar
// Funciona com mouse e com o dedo (no celular: segure o card um instante e arraste).
// Card do mercado → vaga / time        Jogador do campo → outra vaga, outro time, lixeira ou de volta ao mercado
// Presidente → lixeira
const drag = { src: null, active: false, x0: 0, y0: 0, x: 0, y: 0, touch: false, timer: null, ghost: null, over: null, scroll: null };

function dragSource(target) {
  if (S.phase !== "draft" || target.closest(".info, .rm, select, input")) return null;
  const card = target.closest(".card[data-pid]:not(.taken)");
  if (card) return { type: "card", pid: +card.dataset.pid, el: card };
  const slot = target.closest("[data-slot].filled");
  if (slot) { const t = parseSlot(slot); return { type: "slot", ...t, pid: slotPid(t), el: slot }; }
  const staff = target.closest("[data-staff]");
  if (staff && S.managers[+staff.dataset.staff].president) return { type: "staff", mi: +staff.dataset.staff, el: staff };
  return null;
}
const slotPid = t => (t.kind === "slot" ? S.managers[t.mi].slots[t.idx].pid : S.managers[t.mi].bench[t.idx]);

function startDrag() {
  const src = drag.src;
  drag.active = true;
  clearTimeout(drag.timer);
  const g = document.createElement("div");
  g.className = "drag-ghost";
  if (src.type === "staff") {
    const t = PR[S.managers[src.mi].president];
    g.innerHTML = `<div class="gface" style="--tc1:${t.c1};--tc2:${t.c2}">${presPic(t)}</div><b>${esc(t.n)}</b>`;
  } else {
    const p = P[src.pid], t = TEAM[p.team];
    g.innerHTML = `<div class="gface" style="--tc1:${t.c1};--tc2:${t.c2}">${photo(p)}</div><b>${esc(p.n)}</b>`;
  }
  document.body.appendChild(g);
  drag.ghost = g;
  src.el.classList.add("drag-src");
  document.body.classList.add("dragging", src.type === "card" ? "drag-card" : "drag-out");
  moveDrag();
  drag.scroll = setInterval(() => { // rola a página quando chega perto da borda
    if (drag.y < 70) scrollBy(0, -14);
    else if (drag.y > innerHeight - 70) scrollBy(0, 14);
  }, 16);
  if (drag.touch && navigator.vibrate) navigator.vibrate(15);
}

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const type = drag.src.type;
  const trash = el.closest("#trash");
  if (trash) return type === "card" ? null : { kind: "trash", el: trash };
  if (type === "staff") return null;
  const slot = el.closest("#board [data-slot]");
  if (slot) return { kind: "slot", t: parseSlot(slot), el: slot };
  const team = el.closest(".focus-pick [data-focus], .tabs [data-tab]:not([data-tab=pool]), #board > .team");
  if (team) {
    const mi = team.dataset.focus ?? team.dataset.tab ?? team.id.slice(4);
    return { kind: "team", mi: +mi, el: team };
  }
  if (type === "slot" && el.closest("#pool, .tabs [data-tab=pool]")) return { kind: "trash", el: el.closest("#pool, .tabs [data-tab=pool]") };
  return null;
}

function moveDrag() {
  drag.ghost.style.transform = `translate(${drag.x - 40}px, ${drag.y - 40}px)`;
  const tgt = dropTarget(drag.x, drag.y);
  if (drag.over && drag.over.el !== tgt?.el) drag.over.el.classList.remove("drop-over");
  if (tgt) tgt.el.classList.add("drop-over");
  drag.over = tgt;
}

function endDrag(drop) {
  clearTimeout(drag.timer);
  if (drag.active) {
    clearInterval(drag.scroll);
    drag.ghost.remove();
    drag.src.el.classList.remove("drag-src");
    if (drag.over) drag.over.el.classList.remove("drop-over");
    document.body.classList.remove("dragging", "drag-card", "drag-out");
    ui.noClick = true; // o "click" que vem depois de soltar não deve abrir nada
    setTimeout(() => (ui.noClick = false), 50);
    if (drop) doDrop(drag.src, drag.over);
  }
  Object.assign(drag, { src: null, active: false, over: null, ghost: null });
}

function doDrop(src, tgt) {
  if (!tgt) return;
  if (tgt.kind === "trash") return src.type === "staff" ? trashPres(src.mi) : trash(src.mi, src.pid);
  if (src.type === "card") {
    if (tgt.kind === "slot") return pick(src.pid, tgt.t);
    ui.focus = tgt.mi;
    return pick(src.pid, { mi: tgt.mi });
  }
  if (src.type === "slot") {
    if (tgt.kind === "slot") return swap(src, tgt.t);
    if (tgt.mi === src.mi) return;
    const dest = findTarget(tgt.mi, P[src.pid]);
    if (!dest) return fail(`${S.managers[tgt.mi].team} não tem vaga para ${P[src.pid].n}`);
    return swap(src, dest);
  }
}

document.addEventListener("pointerdown", e => {
  if (e.button !== 0 || drag.src) return;
  const src = dragSource(e.target);
  if (!src) return;
  Object.assign(drag, { src, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" });
  if (drag.touch) drag.timer = setTimeout(startDrag, 260); // segurar para arrastar (assim ainda dá para rolar a lista)
});
document.addEventListener("pointermove", e => {
  if (!drag.src) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.active) {
    if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 7) return;
    if (drag.touch) return endDrag(false); // mexeu o dedo antes de segurar = está rolando a página
    startDrag();
  }
  e.preventDefault();
  moveDrag();
});
document.addEventListener("pointerup", () => drag.src && endDrag(true));
document.addEventListener("pointercancel", () => drag.src && endDrag(false));
// No celular o navegador às vezes não manda pointermove/pointercancel quando começa a rolar,
// então os eventos de toque também decidem: mexeu antes de segurar = rolagem, não arraste.
document.addEventListener("touchmove", e => {
  if (drag.active) { e.preventDefault(); return; }
  if (!drag.src) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - drag.x0, t.clientY - drag.y0) > 7) endDrag(false);
}, { passive: false });
document.addEventListener("touchend", e => {
  if (!drag.src) return;
  const t = e.changedTouches[0];
  if (t) { drag.x = t.clientX; drag.y = t.clientY; }
  if (drag.active) moveDrag();
  endDrag(drag.active);
});
document.addEventListener("touchcancel", () => drag.src && endDrag(false));
document.addEventListener("scroll", () => { if (drag.src && !drag.active) endDrag(false); }, true);
document.addEventListener("contextmenu", e => { if (drag.src) e.preventDefault(); });
document.addEventListener("dragstart", e => e.preventDefault()); // sem o arrastar nativo do navegador

// foto que não carrega vira iniciais
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.dataset.ini) return;
  const d = document.createElement("div");
  d.className = "ini " + img.className;
  d.textContent = img.dataset.ini;
  img.replaceWith(d);
}, true);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModal(); if (ui.sel) { ui.sel = null; render(); } }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
});

// cronômetro
setInterval(() => {
  if (S.phase !== "draft" || !S.timer || currentTurn() === null || $("modal").innerHTML) return;
  ui.timeLeft--;
  const el = $("timer");
  if (el) { el.textContent = Math.max(0, ui.timeLeft) + "s"; el.classList.toggle("low", ui.timeLeft <= 10); }
  if (ui.timeLeft <= 0) { ui.timeLeft = S.timer; toast("Tempo esgotado! Escolha automática ⚡", "var(--red)"); autoPick(); }
}, 1000);

const icon = document.querySelector("link[rel=icon]");
if (icon && window.IMG) icon.href = IMG.logoPreto;
ui.timeLeft = S.timer;
render();
})();

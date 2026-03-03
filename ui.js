// ─── ui.js ──────────────────────────────────────────────
import { state, activePlayer, opponentPlayer, allWorkers } from "./state.js";

// ═══════════════════════════════════════════════════
//  UPDATE
// ═══════════════════════════════════════════════════

export function updateUI() {
  const player = activePlayer();
  const opponent = opponentPlayer();

  // Determina chi è il giocatore umano e chi la CPU
  const human = state.players[0];
  const cpu = state.players[1];

  setText("turn", state.turn);
  setText("phase", state.phases[state.phaseIndex]);
  setText("currentPlayerName", player.name);
  setText("pr", human.PR);
  setText("pe-count", countTotalPE(human));
  setText("deckCount", state.deck.length);

  setText("opp-pr", cpu.PR);
  setText("opp-name", cpu.name);
  setText("opp-hand-count", cpu.hand.length);

  renderCEO("player-ceo", human.ceo, false);
  renderCEO("opp-ceo", cpu.ceo, true);

  // Campo CPU (sempre in alto)
  renderField("enemy-field", cpu, true);
  // Campo umano (sempre in basso)
  renderField("field", human, false);
  // Mano umana
  renderHand("hand", human);
  renderLog("log");

  const isHumanTurn = !activePlayer().isCPU;
  const isGiocata = state.phases[state.phaseIndex] === "Giocata";
  const isPlaying = state.gamePhase === "playing";
  setEnabled("btnNextPhase", isPlaying && isHumanTurn && isGiocata);
  setEnabled("btnDraw", false);

  updatePendingIndicator();

  if (state.gamePhase === "ended") showGameOver();
}

function updatePendingIndicator() {
  const eventArea = document.getElementById("event-area");
  if (!eventArea) return;
  eventArea.innerHTML = "";

  if (state.pendingDiscard && state.pendingDiscard.playerIndex === 0) {
    const div = document.createElement("div");
    div.className = "pending-indicator";
    div.innerHTML = `<span class="pending-text">📋 Scarta ${state.pendingDiscard.count} carta/e (clicca su una carta in mano)</span>`;
    eventArea.appendChild(div);
  }

  if (state.pendingJobOffer && state.pendingJobOffer.playerIndex === 0) {
    const div = document.createElement("div");
    div.className = "pending-indicator";
    div.innerHTML = `<span class="pending-text">🎯 Offerta di Lavoro — clicca "Offerta" su un dipendente CPU</span>`;
    eventArea.appendChild(div);
  }

  // Mostra turno CPU
  if (activePlayer().isCPU && state.gamePhase === "playing") {
    const div = document.createElement("div");
    div.className = "pending-indicator";
    div.innerHTML = `<span class="pending-text">🤖 Turno della CPU...</span>`;
    eventArea.appendChild(div);
  }
}

// ═══════════════════════════════════════════════════
//  CEO
// ═══════════════════════════════════════════════════

function renderCEO(containerId, ceo, isOpponent) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!ceo) { el.textContent = "—"; return; }

  const isHumanTurn = !activePlayer().isCPU;
  const isGiocata = state.phases[state.phaseIndex] === "Giocata";
  const isPlaying = state.gamePhase === "playing";
  const human = state.players[0];
  const showAbility = !isOpponent && isGiocata && isPlaying && isHumanTurn && !human.ceoAbilityUsedThisTurn;
  const hasAbility = ceo.nome.includes("Rik Omnia") || ceo.nome.includes("Lyssandra");

  let html = `<span style="font-size:0.5rem;color:#d4a843;font-weight:600;">${ceo.nome.replace("CEO – ", "")}</span>`;
  if (showAbility && hasAbility) {
    html += `<button class="btn-ceo-ability" onclick="useCEOAbilityUI()" style="font-size:0.4rem;margin-top:2px;padding:2px 4px;background:#9b59b6;color:#fff;border:none;border-radius:3px;cursor:pointer;">⚡ Abilità</button>`;
  }
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════
//  CAMPO
// ═══════════════════════════════════════════════════

function renderField(containerId, player, isOpponent) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";

  const isHumanTurn = !activePlayer().isCPU;
  const isGiocata = state.phases[state.phaseIndex] === "Giocata" && isHumanTurn;
  const isPlaying = state.gamePhase === "playing";
  const isMyField = !isOpponent;
  const hasJobOffer = state.pendingJobOffer && state.pendingJobOffer.playerIndex === 0;

  for (const asset of player.field.assets) {
    const workerNames = (asset.assignedWorkers || []).map(uid => {
      const w = findWorkerByUID(player, uid);
      return w ? w.nome.split(" ")[0] : "?";
    });
    const ceoTag = asset.ceoActivated ? " ⭐CEO" : "";
    el.appendChild(makeCard(asset, {
      label: "ASSET",
      extra: (workerNames.length > 0 ? `👷 ${workerNames.join(", ")}` : "") + ceoTag,
      showSell: isMyField && isGiocata && isPlaying,
      onSell: () => window.sellAsset(asset.uid),
      showAssignCEO: isMyField && isGiocata && isPlaying && player.ceoAssignedAsAsset && !asset.ceoActivated,
      onAssignCEO: () => window.assignCEOToAssetUI(asset.uid),
    }));
  }

  for (const dip of player.field.dipendenti) {
    const th = dip.soglia_engagement || 0;
    const pe = dip.currentPE || 0;
    const maint = dip.currentMaintenance || dip.costo_mantenimento_PR || 0;
    const formTag = dip.equippedFormation ? ` 📚${dip.equippedFormation.nome}` : "";
    const canOffer = hasJobOffer && isOpponent && pe < th;

    el.appendChild(makeCard(dip, {
      label: "DIP",
      extra: `PE ${pe}/${th} · M ${maint}${formTag}`,
      peBar: { current: pe, max: th },
      showFire: isMyField && isGiocata && isPlaying,
      onFire: () => window.fireWorkerUI(dip.uid),
      showJobOffer: canOffer,
      onJobOffer: () => window.jobOfferUI(dip.uid),
      showAbility: isMyField && isGiocata && isPlaying && hasActivatableAbility(dip),
      onAbility: () => window.useWorkerAbilityUI(dip.uid),
    }));
  }

  for (const col of player.field.collaboratori) {
    const th = col.soglia_engagement || 0;
    const pe = col.currentPE || 0;
    const canOffer = hasJobOffer && isOpponent && pe < th;
    el.appendChild(makeCard(col, {
      label: "COLL",
      extra: `PE ${pe}/${th}`,
      showJobOffer: canOffer,
      onJobOffer: () => window.jobOfferUI(col.uid),
    }));
  }

  for (const form of player.field.formazione) {
    if (form.equippedTo) continue;
    el.appendChild(makeCard(form, {
      label: "FORM",
      extra: "Non equipaggiata",
      showEquip: isMyField && isGiocata && isPlaying,
      onEquip: () => {
        const workers = [...player.field.dipendenti, ...player.field.collaboratori].filter(w => !w.equippedFormation);
        if (workers.length === 0) { alert("Nessun dipendente disponibile"); return; }
        const names = workers.map((w, i) => `${i}: ${w.nome}`).join("\n");
        const choice = prompt(`Equipaggia ${form.nome} a:\n${names}\n\nScegli numero:`);
        if (choice !== null) { const idx = parseInt(choice); if (!isNaN(idx) && workers[idx]) window.equipFormationUI(form.uid, workers[idx].uid); }
      },
    }));
  }

  if (player.field.geopolitica) {
    el.appendChild(makeCard(player.field.geopolitica, { label: "GEO" }));
  }

  if (el.children.length === 0) {
    el.innerHTML = '<div class="empty-slot">Nessuna carta</div>';
  }
}

function hasActivatableAbility(worker) {
  if (worker.nome === "Thyraen Tradegale" && (worker.currentPE || 0) >= 3 && !worker.usedAbilityThisTurn) return true;
  return false;
}

// ═══════════════════════════════════════════════════
//  MANO (solo umana)
// ═══════════════════════════════════════════════════

function renderHand(containerId, player) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";

  const isHumanTurn = !activePlayer().isCPU;
  const isGiocata = state.phases[state.phaseIndex] === "Giocata";
  const isPlaying = state.gamePhase === "playing";
  const isPendingDiscard = state.pendingDiscard && state.pendingDiscard.playerIndex === 0;

  if (player.hand.length === 0) {
    el.innerHTML = '<div class="empty-slot">La mano è vuota</div>';
    return;
  }

  player.hand.forEach((card, i) => {
    el.appendChild(makeCard(card, {
      showPlay: isGiocata && isPlaying && isHumanTurn,
      playLabel: isPendingDiscard ? "Scarta" : "Gioca",
      onPlay: () => window.playCardUI(i),
    }));
  });
}

// ═══════════════════════════════════════════════════
//  CARD BUILDER
// ═══════════════════════════════════════════════════

const TYPE_COLORS = {
  CEO: "#d4a843", Asset: "#4a9e6e", Dipendente: "#4a7ec9",
  Collaboratore: "#9b59b6", Formazione: "#c98a4a",
  Geopolitica: "#e84393", Evento: "#e04040",
};

function makeCard(card, opts = {}) {
  const el = document.createElement("div");
  el.className = "card";
  el.setAttribute("data-type", card.tipo || "");
  const color = TYPE_COLORS[card.tipo] || "#555";
  let h = "";

  if (card.img) {
    h += `<div class="card-thumb" data-action="preview"><img src="${card.img}" alt="${card.nome || ''}" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>`;
  }
  if (opts.label) h += `<span class="card-type-badge" style="background:${color}">${opts.label}</span>`;
  h += `<span class="card-name">${card.nome || "?"}</span>`;
  if (card.sottotipo) h += `<span class="card-subtype">${card.sottotipo}</span>`;
  h += `<div class="card-stats">`;
  if (card.costo_gioco_PR > 0) h += `<span class="stat">💰${card.costo_gioco_PR}</span>`;
  if (card.produzione_PR > 0) h += `<span class="stat">+${card.produzione_PR}</span>`;
  if (card.produzione_PE > 0) h += `<span class="stat">⭐+${card.produzione_PE}</span>`;
  if ((card.costo_mantenimento_PR || 0) > 0) h += `<span class="stat cost">🔧${card.costo_mantenimento_PR}</span>`;
  h += `</div>`;

  if (opts.peBar) {
    const pct = Math.min(100, (opts.peBar.current / Math.max(1, opts.peBar.max)) * 100);
    const barCol = pct >= 100 ? "#4a9e6e" : pct >= 50 ? "#d4a843" : "#e04040";
    h += `<div class="pe-bar"><div class="pe-fill" style="width:${pct}%;background:${barCol}"></div></div>`;
  }
  if (opts.extra) h += `<div class="card-extra">${opts.extra}</div>`;
  if (card.effetto) {
    const short = card.effetto.length > 60 ? card.effetto.substring(0, 60) + "…" : card.effetto;
    h += `<div class="card-effect">${short}</div>`;
  }

  h += `<div class="card-actions">`;
  if (opts.showPlay) h += `<button class="btn-play" data-action="play">${opts.playLabel || "Gioca"}</button>`;
  if (opts.showSell) h += `<button class="btn-sell" data-action="sell">Vendi</button>`;
  if (opts.showFire) h += `<button class="btn-fire" data-action="fire">Licenzia</button>`;
  if (opts.showJobOffer) h += `<button class="btn-offer" data-action="offer">Offerta</button>`;
  if (opts.showAbility) h += `<button class="btn-ability" data-action="ability" style="background:#47d4c0;color:#000;">⚡</button>`;
  if (opts.showEquip) h += `<button class="btn-equip" data-action="equip" style="background:#c98a4a;color:#fff;">Equip</button>`;
  if (opts.showAssignCEO) h += `<button class="btn-assign-ceo" data-action="assignCEO" style="background:#d4a843;color:#000;">CEO→</button>`;
  h += `</div>`;

  el.innerHTML = h;

  if (opts.onPlay) el.querySelector('[data-action="play"]')?.addEventListener("click", opts.onPlay);
  if (opts.onSell) el.querySelector('[data-action="sell"]')?.addEventListener("click", opts.onSell);
  if (opts.onFire) el.querySelector('[data-action="fire"]')?.addEventListener("click", opts.onFire);
  if (opts.onJobOffer) el.querySelector('[data-action="offer"]')?.addEventListener("click", opts.onJobOffer);
  if (opts.onAbility) el.querySelector('[data-action="ability"]')?.addEventListener("click", opts.onAbility);
  if (opts.onEquip) el.querySelector('[data-action="equip"]')?.addEventListener("click", opts.onEquip);
  if (opts.onAssignCEO) el.querySelector('[data-action="assignCEO"]')?.addEventListener("click", opts.onAssignCEO);

  const thumb = el.querySelector('[data-action="preview"]');
  if (thumb && card.img) {
    thumb.addEventListener("click", (e) => { e.stopPropagation(); showCardPreview(card.img, card.nome); });
  }

  return el;
}

// ═══════════════════════════════════════════════════
//  LOG
// ═══════════════════════════════════════════════════

function renderLog(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const recent = state.log.slice(-30);
  el.innerHTML = recent.map(l => `<div class="log-entry">${l.msg}</div>`).join("");
  el.scrollTop = el.scrollHeight;
}

// ═══════════════════════════════════════════════════
//  SETUP UI
// ═══════════════════════════════════════════════════

export function showCEOSelection(ceos, playerIndex, onSelect) {
  const container = document.getElementById("setup-area");
  if (!container) return;
  container.style.display = "flex";
  container.innerHTML = `<div class="overlay-box" style="max-width:600px;">
    <h2>${state.players[playerIndex].name}: scegli il tuo CEO</h2>
    <div class="ceo-grid"></div>
  </div>`;
  const grid = container.querySelector(".ceo-grid");
  ceos.forEach((ceo) => {
    const btn = document.createElement("div");
    btn.className = "ceo-option";
    btn.innerHTML = `<strong>${ceo.nome}</strong><p class="card-effect">${ceo.effetto}</p>`;
    btn.addEventListener("click", () => onSelect(ceo));
    grid.appendChild(btn);
  });
}

export function showMulligan(player, onConfirm) {
  const container = document.getElementById("setup-area");
  if (!container) return;
  container.style.display = "flex";
  const selected = new Set();

  function render() {
    container.innerHTML = `<div class="overlay-box" style="max-width:600px;">
      <h2>${player.name}: Mulligan</h2>
      <p>Clicca sulle carte da scartare e ripescare, poi conferma.</p>
      <div class="mulligan-grid"></div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <button id="confirmMulligan" class="btn gold">Conferma (scarta ${selected.size})</button>
        <button id="keepAll" class="btn secondary">Tieni tutte</button>
      </div>
    </div>`;
    const grid = container.querySelector(".mulligan-grid");
    player.hand.forEach((card, i) => {
      const el = document.createElement("div");
      el.className = `card mulligan-card ${selected.has(i) ? "selected" : ""}`;
      el.setAttribute("data-type", card.tipo || "");
      el.innerHTML = `<span class="card-name">${card.nome}</span><span class="card-subtype">${card.tipo}${card.sottotipo ? " / " + card.sottotipo : ""}</span><div class="card-stats">${card.costo_gioco_PR > 0 ? `<span class="stat">💰${card.costo_gioco_PR}</span>` : ""}</div>`;
      el.addEventListener("click", () => { if (selected.has(i)) selected.delete(i); else selected.add(i); render(); });
      grid.appendChild(el);
    });
    container.querySelector("#confirmMulligan").addEventListener("click", () => onConfirm([...selected]));
    container.querySelector("#keepAll").addEventListener("click", () => onConfirm([]));
  }
  render();
}

export function hideSetup() {
  const el = document.getElementById("setup-area");
  if (el) el.style.display = "none";
}

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════

function showCardPreview(imgSrc, cardName) {
  const existing = document.getElementById("card-preview-overlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id = "card-preview-overlay";
  overlay.className = "card-preview-overlay";
  overlay.innerHTML = `<div class="card-preview-content"><img src="${imgSrc}" alt="${cardName || ''}" /><button class="card-preview-close">✕</button></div>`;
  overlay.addEventListener("click", () => overlay.remove());
  overlay.querySelector(".card-preview-close").addEventListener("click", (e) => { e.stopPropagation(); overlay.remove(); });
  document.body.appendChild(overlay);
}

function showGameOver() {
  const overlay = document.getElementById("game-over");
  if (overlay) { overlay.style.display = "flex"; setText("winner-name", state.winner); }
}

function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function setEnabled(id, enabled) { const el = document.getElementById(id); if (el) el.disabled = !enabled; }
function countTotalPE(player) { return allWorkers(player).reduce((sum, w) => sum + (w.currentPE || 0), 0); }
function findWorkerByUID(player, uid) {
  return player.field.dipendenti.find(d => d.uid === uid) || player.field.collaboratori.find(c => c.uid === uid);
}

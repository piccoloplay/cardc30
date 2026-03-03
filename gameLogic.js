// ─── gameLogic.js ───────────────────────────────────────
import {
  state, activePlayer, opponentPlayer,
  allWorkers, getUID
} from "./state.js";
import { drawCards, shuffle, rollDie } from "./deck.js";

const WIN_PR = 40;
const LOSE_PR = 0;

// ═══════════════════════════════════════════════════
//  GESTIONE TURNO
// ═══════════════════════════════════════════════════

export function startGame(firstPlayerIndex) {
  state.firstPlayer = firstPlayerIndex;
  state.currentPlayer = firstPlayerIndex;
  state.turn = 1;
  state.gamePhase = "playing";
  addLog(`Inizia ${activePlayer().name}. Turno 1.`);
  executeProduction();
  state.phaseIndex = 1;
}

export function nextPhase() {
  if (state.gamePhase !== "playing") return;
  if (state.phases[state.phaseIndex] === "Giocata") {
    executeEndPhase();
    endTurn();
    checkWinLose();
  }
}

export function getCurrentPhase() {
  return state.phases[state.phaseIndex];
}

// ═══════════════════════════════════════════════════
//  PRODUZIONE
// ═══════════════════════════════════════════════════

function executeProduction() {
  const player = activePlayer();
  player.ceoAbilityUsedThisTurn = false;

  if (player.ceo) {
    player.PR += 1;
    addLog(`${player.name}: CEO produce 1 PR`);
  }

  for (const asset of player.field.assets) {
    const pr = calculateAssetProduction(player, asset);
    const pe = asset.produzione_PE || 0;
    if (pr > 0) { player.PR += pr; addLog(`${player.name}: ${asset.nome} produce ${pr} PR`); }
    if (pe > 0) { distributePE(player, pe, asset.nome); }
  }

  for (const worker of allWorkers(player)) {
    const pr = calculateWorkerProduction(player, worker);
    const pe = worker.produzione_PE || 0;
    if (pr > 0) { player.PR += pr; addLog(`${player.name}: ${worker.nome} produce ${pr} PR`); }
    if (pe > 0) {
      worker.currentPE = (worker.currentPE || 0) + pe;
      addLog(`${player.name}: ${worker.nome} produce ${pe} PE (totale: ${worker.currentPE})`);
    }
  }

  for (const dip of player.field.dipendenti) {
    if (dip.nome === "Tony Kwan" && (dip.currentPE || 0) >= 2) {
      const opp = opponentPlayer();
      if (opp.PR > 0) { opp.PR -= 1; addLog(`${player.name}: Tony Kwan rimuove 1 PR a ${opp.name}`); }
    }
  }

  payMaintenance(player);
}

function payMaintenance(player) {
  for (const dip of [...player.field.dipendenti]) {
    const cost = dip.currentMaintenance || dip.costo_mantenimento_PR || 0;
    if (cost <= 0) continue;
    if (player.PR - cost <= LOSE_PR) {
      fireWorker(player, dip, true);
      addLog(`${player.name}: ${dip.nome} licenziato (mantenimento insostenibile)`);
    } else {
      player.PR -= cost;
      addLog(`${player.name}: paga ${cost} PR mantenimento per ${dip.nome}`);
    }
  }
  for (const asset of [...player.field.assets]) {
    const cost = asset.costo_mantenimento_PR || 0;
    if (cost <= 0) continue;
    if (player.PR - cost <= LOSE_PR) {
      addLog(`${player.name}: non può pagare ${asset.nome} — rimosso`);
      removeAssetFromField(player, asset);
    } else {
      player.PR -= cost;
      addLog(`${player.name}: paga ${cost} PR mantenimento per ${asset.nome}`);
    }
  }
}

// ═══════════════════════════════════════════════════
//  GIOCA CARTA
// ═══════════════════════════════════════════════════

export function playCard(player, handIndex) {
  if (state.gamePhase !== "playing") return { ok: false, msg: "Partita non in corso" };
  if (getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non sei nella fase Giocata" };

  const card = player.hand[handIndex];
  if (!card) return { ok: false, msg: "Carta non trovata" };

  const costModifier = getPlayCostModifier(player);
  let effectiveCost = Math.max(0, card.costo_gioco_PR + costModifier);

  if (card.nome === "Ricorso") {
    const hasLegale = [...player.field.dipendenti, ...player.field.collaboratori]
      .some(w => (w.sottotipo || "").toLowerCase().includes("legale"));
    if (hasLegale) effectiveCost = Math.max(0, effectiveCost - 2);
  }

  if (player.PR < effectiveCost) {
    return { ok: false, msg: `PR insufficienti (costo: ${effectiveCost}, hai: ${player.PR})` };
  }

  player.PR -= effectiveCost;
  player.hand.splice(handIndex, 1);

  const uid = getUID();
  card.uid = uid;
  card.currentPE = 0;
  card.currentMaintenance = card.costo_mantenimento_PR || 0;
  card.assignedTo = null;
  card.assignedWorkers = [];
  card.equippedFormation = null;
  card.usedAbilityThisTurn = false;

  switch (card.tipo) {
    case "Dipendente":
      player.field.dipendenti.push(card);
      addLog(`${player.name}: gioca ${card.nome} (${card.sottotipo}) — ${effectiveCost} PR`);
      break;
    case "Collaboratore":
      player.field.collaboratori.push(card);
      addLog(`${player.name}: gioca ${card.nome} — ${effectiveCost} PR`);
      break;
    case "Asset":
      player.field.assets.push(card);
      addLog(`${player.name}: gioca ${card.nome} — ${effectiveCost} PR`);
      break;
    case "Geopolitica":
      if (player.field.geopolitica) {
        state.removedCards.push(player.field.geopolitica);
        addLog(`${player.name}: rimuove ${player.field.geopolitica.nome}`);
      }
      player.field.geopolitica = card;
      addLog(`${player.name}: gioca ${card.nome} (Geopolitica)`);
      break;
    case "Formazione":
      player.field.formazione.push(card);
      addLog(`${player.name}: gioca ${card.nome} (Formazione)`);
      break;
    case "Evento":
      addLog(`${player.name}: gioca evento ${card.nome} — ${effectiveCost} PR`);
      resolveEvent(player, card);
      state.removedCards.push(card);
      break;
    default:
      addLog(`${player.name}: gioca ${card.nome}`);
      break;
  }

  checkWinLose();
  return { ok: true };
}

// ═══════════════════════════════════════════════════
//  EVENTI
// ═══════════════════════════════════════════════════

function resolveEvent(player, card) {
  const opp = opponentPlayer();
  const nome = card.nome || "";

  if (nome === "Ricorso") {
    if (state.pendingEvent) {
      addLog(`${player.name}: Ricorso annulla "${state.pendingEvent.nome}"!`);
      state.pendingEvent = null;
    } else { addLog(`${player.name}: Ricorso — nessun evento da annullare.`); }
    return;
  }

  if (nome === "Networking") {
    const drawn = drawCards(player, 2);
    addLog(`${player.name}: Networking — pesca 2 carte`);
    state.pendingDiscard = { playerIndex: state.currentPlayer, count: 1 };
    return;
  }

  if (nome === "Offerta di Lavoro") {
    state.pendingJobOffer = { playerIndex: state.currentPlayer };
    addLog(`${player.name}: Offerta di Lavoro — scegli un dipendente avversario.`);
    return;
  }

  if (nome === "Influenza Politica") {
    if (opp.field.geopolitica) {
      addLog(`${player.name}: Influenza Politica rimuove ${opp.field.geopolitica.nome}`);
      state.removedCards.push(opp.field.geopolitica);
      opp.field.geopolitica = null;
    } else { addLog(`${player.name}: Influenza Politica — nessuna Geopolitica.`); }
    return;
  }

  if (nome === "Elezioni") {
    if (opp.field.geopolitica) {
      state.removedCards.push(opp.field.geopolitica); opp.field.geopolitica = null;
    } else if (player.field.geopolitica) {
      state.removedCards.push(player.field.geopolitica); player.field.geopolitica = null;
    }
    const roll = rollDie();
    if (roll % 2 === 0) {
      if (opp.field.dipendenti.length > 0) { const t = opp.field.dipendenti[0]; fireWorker(opp, t, true); addLog(`🎲 Elezioni: ${roll} (pari) — rimuove ${t.nome}`); }
    } else {
      const n = countControlledCards(opp); const loss = Math.min(opp.PR, n); opp.PR -= loss;
      addLog(`🎲 Elezioni: ${roll} (dispari) — ${opp.name} paga ${loss} PR`);
    }
    return;
  }

  if (nome === "Disastro Naturale") {
    const roll = rollDie();
    if (roll % 2 === 0) {
      if (opp.field.assets.length > 0) { const t = opp.field.assets[0]; removeAssetFromField(opp, t); addLog(`🎲 Disastro: ${roll} (pari) — rimuove ${t.nome}`); }
    } else {
      if (opp.field.dipendenti.length > 0) { const t = opp.field.dipendenti[0]; fireWorker(opp, t, true); addLog(`🎲 Disastro: ${roll} (dispari) — rimuove ${t.nome}`); }
    }
    return;
  }
}

// ═══════════════════════════════════════════════════
//  AZIONI
// ═══════════════════════════════════════════════════

export function equipFormation(player, formationUID, workerUID) {
  if (getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non in fase Giocata" };
  const formation = player.field.formazione.find(f => f.uid === formationUID);
  const worker = findCardByUID(player, workerUID);
  if (!formation || !worker) return { ok: false, msg: "Carta non trovata" };
  if (worker.equippedFormation) return { ok: false, msg: "Già equipaggiato" };
  worker.equippedFormation = formation;
  formation.equippedTo = worker.uid;
  addLog(`${player.name}: equipaggia ${formation.nome} a ${worker.nome}`);
  return { ok: true };
}

export function discardCard(player, handIndex) {
  if (!state.pendingDiscard || state.pendingDiscard.playerIndex !== state.currentPlayer) return { ok: false, msg: "Nessun scarto pendente" };
  const card = player.hand[handIndex];
  if (!card) return { ok: false, msg: "Carta non trovata" };
  player.hand.splice(handIndex, 1);
  state.removedCards.push(card);
  state.pendingDiscard.count--;
  addLog(`${player.name}: scarta ${card.nome}`);
  if (state.pendingDiscard.count <= 0) state.pendingDiscard = null;
  return { ok: true };
}

export function useCEOAbility(player) {
  if (state.gamePhase !== "playing" || getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non disponibile" };
  if (!player.ceo || player.ceoAbilityUsedThisTurn) return { ok: false, msg: "Non disponibile" };
  const ceoName = player.ceo.nome || "";

  if (ceoName.includes("Rik Omnia")) {
    if (player.PR < 4) return { ok: false, msg: "Servono 4 PR" };
    player.PR -= 4; player.ceoAbilityUsedThisTurn = true;
    state.pendingJobOffer = { playerIndex: state.currentPlayer, fromCEO: true };
    addLog(`${player.name}: Rik Omnia — Offerta di Lavoro attivata!`);
    return { ok: true, needsTarget: true, type: "jobOffer" };
  }
  if (ceoName.includes("Lyssandra")) {
    if (player.PR < 2) return { ok: false, msg: "Servono 2 PR" };
    player.PR -= 2; player.ceoAbilityUsedThisTurn = true;
    player.ceoAssignedAsAsset = true;
    addLog(`${player.name}: Lyssandra — CEO attivatore di asset`);
    return { ok: true, needsTarget: true, type: "assignCEOToAsset" };
  }
  return { ok: false, msg: "Nessuna abilità" };
}

export function assignCEOToAsset(player, assetUID) {
  const asset = player.field.assets.find(a => a.uid === assetUID);
  if (!asset) return { ok: false, msg: "Asset non trovato" };
  asset.ceoActivated = true;
  addLog(`${player.name}: Lyssandra attiva ${asset.nome}`);
  return { ok: true };
}

export function useWorkerAbility(player, workerUID) {
  if (state.gamePhase !== "playing" || getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non disponibile" };
  const worker = findCardByUID(player, workerUID);
  if (!worker || worker.usedAbilityThisTurn) return { ok: false, msg: "Non disponibile" };
  if (worker.nome === "Thyraen Tradegale" && (worker.currentPE || 0) >= 3) {
    if (player.PR < 4) return { ok: false, msg: "Servono 4 PR" };
    player.PR -= 4; worker.usedAbilityThisTurn = true;
    const opp = opponentPlayer();
    state.pendingRevealHand = { playerIndex: state.currentPlayer, targetPlayerIndex: 1 - state.currentPlayer };
    addLog(`${player.name}: Thyraen guarda la mano di ${opp.name}!`);
    return { ok: true, needsTarget: true, type: "revealHand", hand: opp.hand };
  }
  return { ok: false, msg: "Nessuna abilità attivabile" };
}

export function putCardOnBottom(targetPlayerIndex, handIndex) {
  const target = state.players[targetPlayerIndex];
  const card = target.hand[handIndex];
  if (!card) return { ok: false, msg: "Carta non trovata" };
  target.hand.splice(handIndex, 1);
  state.deck.push(card);
  state.pendingRevealHand = null;
  addLog(`${activePlayer().name}: mette ${card.nome} in fondo al mazzo`);
  return { ok: true };
}

export function assignWorkerToAsset(player, workerUID, assetUID) {
  if (getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non in fase Giocata" };
  const worker = findCardByUID(player, workerUID);
  const asset = player.field.assets.find(a => a.uid === assetUID);
  if (!worker || !asset) return { ok: false, msg: "Carta non trovata" };
  if (worker.assignedTo) {
    const old = player.field.assets.find(a => a.uid === worker.assignedTo);
    if (old) old.assignedWorkers = old.assignedWorkers.filter(uid => uid !== workerUID);
  }
  worker.assignedTo = assetUID;
  if (!asset.assignedWorkers.includes(workerUID)) asset.assignedWorkers.push(workerUID);
  addLog(`${player.name}: assegna ${worker.nome} a ${asset.nome}`);
  return { ok: true };
}

export function fireWorker(player, worker, forced = false) {
  player.field.dipendenti = player.field.dipendenti.filter(d => d.uid !== worker.uid);
  player.field.collaboratori = player.field.collaboratori.filter(c => c.uid !== worker.uid);
  if (worker.assignedTo) {
    const asset = player.field.assets.find(a => a.uid === worker.assignedTo);
    if (asset) asset.assignedWorkers = asset.assignedWorkers.filter(uid => uid !== worker.uid);
  }
  if (worker.equippedFormation) {
    player.field.formazione = player.field.formazione.filter(f => f.uid !== worker.equippedFormation.uid);
    state.removedCards.push(worker.equippedFormation);
  }
  state.removedCards.push(worker);
  if (!forced) addLog(`${player.name}: licenzia ${worker.nome}`);
}

function removeAssetFromField(player, asset) {
  for (const wUID of (asset.assignedWorkers || [])) {
    const w = findCardByUID(player, wUID); if (w) w.assignedTo = null;
  }
  player.field.assets = player.field.assets.filter(a => a.uid !== asset.uid);
  state.removedCards.push(asset);
}

export function sellAsset(player, assetUID) {
  if (getCurrentPhase() !== "Giocata") return { ok: false, msg: "Non in fase Giocata" };
  const asset = player.field.assets.find(a => a.uid === assetUID);
  if (!asset) return { ok: false, msg: "Asset non trovato" };
  const refund = Math.ceil(asset.costo_gioco_PR / 2);
  player.PR += refund;
  for (const wUID of (asset.assignedWorkers || [])) { const w = findCardByUID(player, wUID); if (w) w.assignedTo = null; }
  player.field.assets = player.field.assets.filter(a => a.uid !== assetUID);
  state.removedCards.push(asset);
  addLog(`${player.name}: vende ${asset.nome} per ${refund} PR`);
  checkWinLose();
  return { ok: true };
}

export function jobOffer(attackerPlayer, targetWorkerUID) {
  const defender = opponentPlayer();
  const worker = findCardByUID(defender, targetWorkerUID);
  if (!worker) return { ok: false, msg: "Non trovato" };
  if (!state.pendingJobOffer || state.pendingJobOffer.playerIndex !== state.currentPlayer) {
    return { ok: false, msg: "Serve carta Offerta di Lavoro o abilità CEO" };
  }
  const threshold = getEffectiveEngagementThreshold(defender, worker);
  if ((worker.currentPE || 0) >= threshold) {
    return { ok: false, msg: `${worker.nome} ha raggiunto la soglia` };
  }
  state.pendingJobOffer = null;
  worker.currentMaintenance = (worker.currentMaintenance || worker.costo_mantenimento_PR || 0) + 1;
  addLog(`Offerta a ${worker.nome}: mantenimento → ${worker.currentMaintenance} PR`);
  const roll = rollDie();
  const success = roll % 2 === 0;
  if (success) {
    addLog(`🎲 ${roll} (pari) — ${worker.nome} passa a ${attackerPlayer.name}!`);
    defender.field.dipendenti = defender.field.dipendenti.filter(d => d.uid !== worker.uid);
    defender.field.collaboratori = defender.field.collaboratori.filter(c => c.uid !== worker.uid);
    if (worker.assignedTo) {
      const old = defender.field.assets.find(a => a.uid === worker.assignedTo);
      if (old) old.assignedWorkers = old.assignedWorkers.filter(uid => uid !== worker.uid);
      worker.assignedTo = null;
    }
    if (worker.tipo === "Collaboratore") attackerPlayer.field.collaboratori.push(worker);
    else attackerPlayer.field.dipendenti.push(worker);
    if (worker.equippedFormation) {
      defender.field.formazione = defender.field.formazione.filter(f => f.uid !== worker.equippedFormation.uid);
      attackerPlayer.field.formazione.push(worker.equippedFormation);
    }
  } else {
    addLog(`🎲 ${roll} (dispari) — ${worker.nome} rimane a ${defender.name}`);
  }
  checkWinLose();
  return { ok: true, roll, success };
}

// ═══════════════════════════════════════════════════
//  FINE TURNO
// ═══════════════════════════════════════════════════

function executeEndPhase() {
  const player = activePlayer();
  for (const w of allWorkers(player)) w.usedAbilityThisTurn = false;
  for (const asset of player.field.assets) asset.ceoActivated = false;
  player.ceoAssignedAsAsset = false;
  state.pendingJobOffer = null;
  state.pendingDiscard = null;
  state.pendingRevealHand = null;
  addLog(`Fine turno di ${player.name}`);
}

function endTurn() {
  state.phaseIndex = 0;
  state.currentPlayer = 1 - state.currentPlayer;
  if (state.currentPlayer === state.firstPlayer) state.turn++;
  const player = activePlayer();
  const isFirst = (state.turn === 1 && state.currentPlayer === state.firstPlayer);
  if (!isFirst) {
    // CPU: pesca dalla lista truccata se disponibile
    if (player.isCPU && state.cpuRiggedDraws && state.cpuRiggedDraws.length > 0) {
      const riggedCard = state.cpuRiggedDraws.shift();
      player.hand.push(riggedCard);
      addLog(`${player.name}: pesca 1 carta`);
    } else if (state.deck.length > 0) {
      drawCards(player, 1);
      addLog(`${player.name}: pesca 1 carta`);
    }
  }
  addLog(`── Turno ${state.turn}: ${player.name} ──`);
  executeProduction();
  state.phaseIndex = 1;
  checkWinLose();
}

// ═══════════════════════════════════════════════════
//  CALCOLI PRODUZIONE
// ═══════════════════════════════════════════════════

function calculateAssetProduction(player, asset) {
  const nome = asset.nome || "";
  const workers = (asset.assignedWorkers || []).map(uid => findCardByUID(player, uid)).filter(Boolean);
  const ceoAct = asset.ceoActivated || false;

  if (nome === "Sede") {
    let pr = 1;
    if (workers.some(w => (w.sottotipo || "").toLowerCase().includes("manager"))) pr += 1;
    return pr;
  }
  if (nome === "Negozio Retail") {
    const q = workers.filter(w => { const s = (w.sottotipo || "").toLowerCase(); return s.includes("sales") || s.includes("commesso"); });
    const c = q.length + (ceoAct ? 1 : 0);
    if (c >= 2) return 2; if (c >= 1) return 1; return 0;
  }
  if (nome === "Mensa") return 0;
  if (nome === "Sede Commerciale") {
    if (workers.some(w => (w.sottotipo || "").toLowerCase().includes("sales")) || ceoAct) return 2;
    return 0;
  }
  if (nome === "Magazzino") return 1;
  return asset.produzione_PR || 0;
}

function calculateWorkerProduction(player, worker) {
  const nome = worker.nome || "";
  const pe = worker.currentPE || 0;
  let pr = 0;

  if (nome === "Tony Kwan") { pr = 2; }
  else if (nome === "Clerin Modula") {
    pr = 2;
    const th = getEffectiveEngagementThreshold(player, worker);
    if (pe >= th && th > 0) pr += 1;
  }
  else if (nome === "Thyraen Tradegale") { pr = 2; }
  else if (nome === "Odri Profitara") {
    const a = worker.assignedTo ? player.field.assets.find(x => x.uid === worker.assignedTo) : null;
    if (a && a.nome === "Negozio Retail") { pr = pe >= 2 ? 3 : 2; }
    else { pr = worker.produzione_PR || 0; }
  }
  else if (nome === "Septim Allocaster") { pr = pe >= 3 ? 1 : 0; }
  else { pr = worker.produzione_PR || 0; }

  // SoP's bonus
  if (worker.equippedFormation && worker.equippedFormation.nome === "SoP's") pr += 1;
  // Septim aura
  pr += getSeptimBonus(player, worker);
  return pr;
}

function getSeptimBonus(player, worker) {
  const sub = (worker.sottotipo || "").toLowerCase();
  if (!sub.includes("sales") && !sub.includes("commesso")) return 0;
  if (worker.nome === "Septim Allocaster") return 0;
  for (const d of player.field.dipendenti) { if (d.nome === "Septim Allocaster") return 1; }
  return 0;
}

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════

function getEffectiveEngagementThreshold(player, worker) {
  let th = worker.soglia_engagement || 0;
  if (worker.nome === "Clerin Modula") {
    const a = worker.assignedTo ? player.field.assets.find(x => x.uid === worker.assignedTo) : null;
    if (a && a.nome === "Sede") th = Math.max(0, th - 1);
  }
  return th;
}

function getPlayCostModifier(player) {
  const opp = opponentPlayer();
  if (opp.field.geopolitica && opp.field.geopolitica.nome.toLowerCase().includes("inflazione")) return 1;
  return 0;
}

function distributePE(player, amount, sourceName) {
  const ws = allWorkers(player).filter(w => (w.currentPE || 0) < (w.soglia_engagement || 0));
  if (ws.length > 0) {
    ws[0].currentPE = (ws[0].currentPE || 0) + amount;
    addLog(`${player.name}: ${sourceName} → ${amount} PE a ${ws[0].nome} (${ws[0].currentPE})`);
  }
}

export function findCardByUID(player, uid) {
  return player.field.dipendenti.find(d => d.uid === uid) || player.field.collaboratori.find(c => c.uid === uid) || null;
}

function countControlledCards(player) {
  let c = player.field.assets.length + player.field.dipendenti.length + player.field.collaboratori.length + player.field.formazione.length;
  if (player.field.geopolitica) c++;
  return c;
}

function checkWinLose() {
  for (const p of state.players) {
    if (p.PR >= WIN_PR) { state.gamePhase = "ended"; state.winner = p.name; addLog(`🏆 ${p.name} VINCE con ${p.PR} PR!`); return; }
    if (p.PR <= LOSE_PR) { state.gamePhase = "ended"; const w = state.players.find(pl => pl !== p); state.winner = w.name; addLog(`💀 ${p.name} a 0 PR — ${w.name} VINCE!`); return; }
  }
}

export function addLog(msg) {
  state.log.push({ turn: state.turn, msg });
  console.log(`[T${state.turn}] ${msg}`);
}
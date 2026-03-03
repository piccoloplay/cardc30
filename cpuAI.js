// ─── cpuAI.js ───────────────────────────────────────────
// IA della CPU: sequenza strategica per i primi turni,
// poi mosse casuali lecite.
// ─────────────────────────────────────────────────────────

import { state, activePlayer, opponentPlayer, allWorkers } from "./state.js";
import {
  playCard, assignWorkerToAsset, fireWorker, sellAsset,
  jobOffer, equipFormation, useCEOAbility, nextPhase,
  getCurrentPhase, addLog, findCardByUID, discardCard
} from "./gameLogic.js";

// ═══════════════════════════════════════════════════
//  ENTRY POINT: chiamato quando è il turno della CPU
// ═══════════════════════════════════════════════════

export function executeCPUTurn(updateUI) {
  const cpu = activePlayer();
  if (!cpu.isCPU || state.gamePhase !== "playing") return;

  state.cpuTurnNumber++;
  const turnNum = state.cpuTurnNumber;

  addLog(`🤖 CPU — Turno strategico #${turnNum}`);

  // Azioni difensive prioritarie (qualsiasi turno)
  if (tryDefensiveActions(cpu)) {
    // Se ha fatto azioni difensive, continua comunque con la strategia
  }

  // Sequenza strategica
  let acted = false;
  switch (turnNum) {
    case 1: acted = cpuPhase1(cpu); break;
    case 2: acted = cpuPhase2(cpu); break;
    case 3: acted = cpuPhase3(cpu); break;
    case 4: acted = cpuPhase4(cpu); break;
    case 5: acted = cpuPhase5(cpu); break;
    case 6: acted = cpuPhase6(cpu); break;
    case 7: acted = cpuPhase7(cpu); break;
    case 8: acted = cpuPhase8(cpu); break;
    case 9: acted = cpuPhase9(cpu); break;
    default: acted = cpuRandomTurn(cpu); break;
  }

  // Se pendingDiscard (Networking), scarta la carta meno costosa
  if (state.pendingDiscard && state.pendingDiscard.playerIndex === state.currentPlayer) {
    cpuHandleDiscard(cpu);
  }

  // Se pendingJobOffer, scegli un target
  if (state.pendingJobOffer && state.pendingJobOffer.playerIndex === state.currentPlayer) {
    cpuHandleJobOffer(cpu);
  }

  // Termina turno CPU
  nextPhase();
  if (updateUI) updateUI();
}

// ═══════════════════════════════════════════════════
//  FASI STRATEGICHE
// ═══════════════════════════════════════════════════

// Fase 1: Gioca Magazzino
function cpuPhase1(cpu) {
  return cpuPlayCardByName(cpu, "Magazzino");
}

// Fase 2: Gioca Thyraen Tradegale
function cpuPhase2(cpu) {
  return cpuPlayCardByName(cpu, "Thyraen Tradegale");
}

// Fase 3: Gioca Negozio Retail. Assegna Thyraen al Negozio.
function cpuPhase3(cpu) {
  cpuPlayCardByName(cpu, "Negozio Retail");
  // Assegna Thyraen al Negozio Retail
  const thyraen = cpu.field.dipendenti.find(d => d.nome === "Thyraen Tradegale");
  const retail = cpu.field.assets.find(a => a.nome === "Negozio Retail");
  if (thyraen && retail) {
    assignWorkerToAsset(cpu, thyraen.uid, retail.uid);
  }
  return true;
}

// Fase 4: Gioca Mensa
function cpuPhase4(cpu) {
  return cpuPlayCardByName(cpu, "Mensa");
}

// Fase 5: Gioca Offerta di Lavoro su dipendente avversario
function cpuPhase5(cpu) {
  const played = cpuPlayCardByName(cpu, "Offerta di Lavoro");
  // Il jobOffer pendente verrà gestito dopo nel flusso
  return played;
}

// Fase 6: Se avversario ha Inflazione, gioca Influenza Politica
function cpuPhase6(cpu) {
  const opp = opponentPlayer();
  if (opp.field.geopolitica && opp.field.geopolitica.nome.toLowerCase().includes("inflazione")) {
    return cpuPlayCardByName(cpu, "Influenza Politica");
  }
  // Se non c'è Inflazione, gioca qualcosa di utile
  return cpuRandomTurn(cpu);
}

// Fase 7: Attiva abilità Thyraen se possibile
function cpuPhase7(cpu) {
  const thyraen = cpu.field.dipendenti.find(d => d.nome === "Thyraen Tradegale" && (d.currentPE || 0) >= 3);
  if (thyraen && cpu.PR >= 4) {
    const result = import("./gameLogic.js").then(mod => mod.useWorkerAbility(cpu, thyraen.uid));
    // Semplificazione sincrona: usiamo direttamente
    thyraen.usedAbilityThisTurn = true;
    cpu.PR -= 4;
    const opp = opponentPlayer();
    if (opp.hand.length > 0) {
      // Metti in fondo al mazzo la carta più costosa dell'avversario
      let maxIdx = 0;
      for (let i = 1; i < opp.hand.length; i++) {
        if ((opp.hand[i].costo_gioco_PR || 0) > (opp.hand[maxIdx].costo_gioco_PR || 0)) maxIdx = i;
      }
      const card = opp.hand.splice(maxIdx, 1)[0];
      state.deck.push(card);
      addLog(`🤖 CPU: Thyraen mette ${card.nome} in fondo al mazzo di ${opp.name}`);
    }
  }
  // Gioca anche qualcosa se possibile
  return cpuRandomTurn(cpu);
}

// Fase 8: Gioca Tony Kwan, assegnalo al Negozio Retail
function cpuPhase8(cpu) {
  cpuPlayCardByName(cpu, "Tony Kwan");
  const tony = cpu.field.dipendenti.find(d => d.nome === "Tony Kwan");
  const retail = cpu.field.assets.find(a => a.nome === "Negozio Retail");
  if (tony && retail) {
    assignWorkerToAsset(cpu, tony.uid, retail.uid);
  }
  return true;
}

// Fase 9: Licenzia Thyraen se mantenimento troppo alto
function cpuPhase9(cpu) {
  const thyraen = cpu.field.dipendenti.find(d => d.nome === "Thyraen Tradegale");
  if (thyraen) {
    const maint = thyraen.currentMaintenance || thyraen.costo_mantenimento_PR || 0;
    if (maint >= 4) {
      fireWorker(cpu, thyraen);
      addLog(`🤖 CPU: licenzia Thyraen (mantenimento ${maint} PR troppo alto)`);
    }
  }
  return cpuRandomTurn(cpu);
}

// ═══════════════════════════════════════════════════
//  AZIONI DIFENSIVE (priorità assoluta, ogni turno)
// ═══════════════════════════════════════════════════

function tryDefensiveActions(cpu) {
  let acted = false;

  // Se avversario ha Inflazione e ho Influenza Politica, giocala
  const opp = opponentPlayer();
  if (opp.field.geopolitica && opp.field.geopolitica.nome.toLowerCase().includes("inflazione")) {
    if (cpuPlayCardByName(cpu, "Influenza Politica")) acted = true;
  }

  // Se c'è un evento pendente e ho Ricorso, annullalo
  if (state.pendingEvent) {
    if (cpuPlayCardByName(cpu, "Ricorso")) acted = true;
  }

  return acted;
}

// ═══════════════════════════════════════════════════
//  TURNO CASUALE (dopo la sequenza strategica)
// ═══════════════════════════════════════════════════

function cpuRandomTurn(cpu) {
  let acted = false;

  // Prova a giocare carte dalla mano che possiamo permetterci
  // Priorità: Asset > Dipendenti > Formazione > Eventi > Geopolitica
  const priorities = ["Asset", "Dipendente", "Formazione", "Evento", "Geopolitica"];

  for (const tipo of priorities) {
    const idx = cpu.hand.findIndex(c => c.tipo === tipo && cpu.PR >= c.costo_gioco_PR);
    if (idx !== -1) {
      const result = playCard(cpu, idx);
      if (result.ok) { acted = true; break; }
    }
  }

  // Prova ad assegnare worker non assegnati ad asset
  cpuAutoAssignWorkers(cpu);

  // Prova a equipaggiare formazione non equipaggiata
  cpuAutoEquipFormation(cpu);

  return acted;
}

// ═══════════════════════════════════════════════════
//  HELPER CPU
// ═══════════════════════════════════════════════════

function cpuPlayCardByName(cpu, cardName) {
  const idx = cpu.hand.findIndex(c => c.nome === cardName);
  if (idx === -1) {
    addLog(`🤖 CPU: ${cardName} non in mano — skip`);
    return false;
  }
  if (cpu.PR < cpu.hand[idx].costo_gioco_PR) {
    addLog(`🤖 CPU: PR insufficienti per ${cardName}`);
    return false;
  }
  const result = playCard(cpu, idx);
  return result.ok;
}

function cpuHandleDiscard(cpu) {
  if (cpu.hand.length === 0) { state.pendingDiscard = null; return; }
  // Scarta la carta meno costosa
  let minIdx = 0;
  for (let i = 1; i < cpu.hand.length; i++) {
    if ((cpu.hand[i].costo_gioco_PR || 0) < (cpu.hand[minIdx].costo_gioco_PR || 0)) minIdx = i;
  }
  discardCard(cpu, minIdx);
}

function cpuHandleJobOffer(cpu) {
  const opp = opponentPlayer();
  // Cerca un dipendente avversario sotto soglia
  const targets = opp.field.dipendenti.filter(d => {
    const th = d.soglia_engagement || 0;
    return (d.currentPE || 0) < th;
  });
  if (targets.length > 0) {
    // Scegli quello con la produzione più alta
    targets.sort((a, b) => (b.produzione_PR || 0) - (a.produzione_PR || 0));
    jobOffer(cpu, targets[0].uid);
  } else {
    // Nessun target valido, l'offerta va sprecata
    state.pendingJobOffer = null;
    addLog(`🤖 CPU: nessun dipendente avversario sotto soglia per Offerta di Lavoro`);
  }
}

function cpuAutoAssignWorkers(cpu) {
  const unassigned = allWorkers(cpu).filter(w => !w.assignedTo);
  for (const worker of unassigned) {
    const sub = (worker.sottotipo || "").toLowerCase();
    // Prova a trovare un asset che beneficia di questo worker
    for (const asset of cpu.field.assets) {
      const nome = asset.nome;
      if (nome === "Negozio Retail" && (sub.includes("sales") || sub.includes("commesso"))) {
        assignWorkerToAsset(cpu, worker.uid, asset.uid); break;
      }
      if (nome === "Sede Commerciale" && sub.includes("sales")) {
        assignWorkerToAsset(cpu, worker.uid, asset.uid); break;
      }
      if (nome === "Sede" && sub.includes("manager")) {
        assignWorkerToAsset(cpu, worker.uid, asset.uid); break;
      }
    }
  }
}

function cpuAutoEquipFormation(cpu) {
  for (const form of cpu.field.formazione) {
    if (form.equippedTo) continue;
    // Equipaggia al primo dipendente senza formazione
    const worker = allWorkers(cpu).find(w => !w.equippedFormation);
    if (worker) {
      equipFormation(cpu, form.uid, worker.uid);
    }
  }
}

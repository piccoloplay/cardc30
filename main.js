// ─── main.js ────────────────────────────────────────────
// Player 1 (umano) vs CPU
// ─────────────────────────────────────────────────────────

import { parseCSV } from "./csvParser.js";
import { state } from "./state.js";
import { shuffle, drawCards, mulligan, rollDie } from "./deck.js";
import {
  startGame, nextPhase, playCard, sellAsset,
  fireWorker, jobOffer, getCurrentPhase, addLog,
  assignWorkerToAsset, equipFormation, discardCard,
  useCEOAbility, assignCEOToAsset,
  useWorkerAbility, putCardOnBottom
} from "./gameLogic.js";
import {
  updateUI, showCEOSelection, showMulligan, hideSetup
} from "./ui.js";
import { activePlayer, opponentPlayer } from "./state.js";
import { executeCPUTurn } from "./cpuAI.js";

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════

async function init() {
  const res = await fetch("cards.csv");
  const text = await res.text();
  state.allCards = parseCSV(text);

  state.availableCEOs = state.allCards.filter(c => c.tipo === "CEO");
  const nonCEOCards = state.allCards.filter(c => c.tipo !== "CEO");

  state.deck = [...nonCEOCards];
  shuffle(state.deck);

  addLog("Carte caricate: " + state.allCards.length + " totali, " + state.availableCEOs.length + " CEO");
  setupFlow();
}

// ═══════════════════════════════════════════════════
//  SETUP: Player sceglie CEO, CPU sceglie automaticamente
// ═══════════════════════════════════════════════════

async function setupFlow() {
  state.gamePhase = "ceoSelection";

  // Player 1 sceglie CEO
  await selectCEO(0);

  // CPU sceglie il CEO rimanente automaticamente
  const cpuCeo = state.availableCEOs[0];
  if (cpuCeo) {
    state.players[1].ceo = { ...cpuCeo };
    state.availableCEOs = [];
    addLog(`CPU sceglie ${cpuCeo.nome}`);
  }

  // ── MAZZO TRUCCATO CPU ──
  // La CPU ha bisogno di queste carte in quest'ordine:
  // Mano iniziale (5): Magazzino, Thyraen Tradegale, Negozio Retail, Mensa, Offerta di Lavoro
  // Pesca turno 2+:    Influenza Politica, Ricorso, Tony Kwan, poi random
  const cpuNeededHand = [
    "Magazzino",
    "Thyraen Tradegale",
    "Negozio Retail",
    "Mensa",
    "Offerta di Lavoro",
  ];
  const cpuNeededDrawOrder = [
    "Influenza Politica",
    "Ricorso",
    "Tony Kwan",
  ];

  // Estrai le carte CPU dal mazzo
  const cpuHand = [];
  for (const name of cpuNeededHand) {
    const idx = state.deck.findIndex(c => c.nome === name);
    if (idx !== -1) {
      cpuHand.push(state.deck.splice(idx, 1)[0]);
    }
  }

  // Estrai le carte che la CPU pescherà nei turni successivi
  const cpuRiggedDraws = [];
  for (const name of cpuNeededDrawOrder) {
    const idx = state.deck.findIndex(c => c.nome === name);
    if (idx !== -1) {
      cpuRiggedDraws.push(state.deck.splice(idx, 1)[0]);
    }
  }

  // Dai alla CPU la mano truccata
  state.players[1].hand = cpuHand;

  // Salva le carte truccate per le pescate future della CPU
  state.cpuRiggedDraws = cpuRiggedDraws;

  // Pesca 5 carte per Player 1 (dal mazzo rimanente, onesto)
  drawCards(state.players[0], 5);
  addLog("Carte distribuite.");

  // Mulligan solo per Player 1
  state.gamePhase = "mulligan";
  await doMulligan(0);

  // CPU tiene tutto
  state.players[1].mulliganUsed = true;
  addLog("CPU: mano preparata.");

  hideSetup();

  // Lancio dadi
  const roll1 = rollDie();
  const roll2 = rollDie();
  addLog(`${state.players[0].name} tira: ${roll1}`);
  addLog(`CPU tira: ${roll2}`);

  let firstPlayer;
  if (roll1 >= roll2) {
    firstPlayer = 0;
    addLog(`${state.players[0].name} inizia.`);
  } else {
    firstPlayer = 1;
    addLog(`CPU inizia.`);
  }

  startGame(firstPlayer);
  updateUI();

  // Se la CPU inizia per prima, esegui il suo turno
  if (activePlayer().isCPU) {
    setTimeout(() => {
      executeCPUTurn(updateUI);
    }, 800);
  }
}

function selectCEO(playerIndex) {
  return new Promise((resolve) => {
    showCEOSelection(state.availableCEOs, playerIndex, (ceo) => {
      state.players[playerIndex].ceo = { ...ceo };
      state.availableCEOs = state.availableCEOs.filter(c => c.nome !== ceo.nome);
      addLog(`${state.players[playerIndex].name} sceglie ${ceo.nome}`);
      resolve();
    });
  });
}

function doMulligan(playerIndex) {
  return new Promise((resolve) => {
    const player = state.players[playerIndex];
    showMulligan(player, (indicesToDiscard) => {
      if (indicesToDiscard.length > 0) {
        mulligan(player, indicesToDiscard);
        addLog(`${player.name}: mulligan — scambia ${indicesToDiscard.length} carte`);
      } else {
        player.mulliganUsed = true;
        addLog(`${player.name}: tiene tutte le carte`);
      }
      resolve();
    });
  });
}

// ═══════════════════════════════════════════════════
//  FUNZIONE PER PASSARE IL TURNO ALLA CPU
// ═══════════════════════════════════════════════════

function endHumanTurnAndRunCPU() {
  nextPhase(); // Fine turno umano → passa alla CPU
  updateUI();

  // Se ora tocca alla CPU, eseguila dopo un breve delay
  if (state.gamePhase === "playing" && activePlayer().isCPU) {
    setTimeout(() => {
      executeCPUTurn(updateUI);

      // Se dopo il turno CPU tocca di nuovo all'umano, updateUI
      // Se è game over, updateUI lo mostra
      updateUI();
    }, 1000);
  }
}

// ═══════════════════════════════════════════════════
//  BOTTONI E AZIONI
// ═══════════════════════════════════════════════════

// Avanza fase (= termina turno umano)
document.getElementById("btnNextPhase").addEventListener("click", () => {
  if (activePlayer().isCPU) return; // Non permettere al giocatore di controllare la CPU
  endHumanTurnAndRunCPU();
});

// Pesca disabilitata (non prevista dal regolamento)
document.getElementById("btnDraw").addEventListener("click", () => {});

// Gioca carta dalla mano
window.playCardUI = (handIndex) => {
  if (activePlayer().isCPU) return;
  const player = activePlayer();

  if (state.pendingDiscard && state.pendingDiscard.playerIndex === state.currentPlayer) {
    const result = discardCard(player, handIndex);
    if (!result.ok) alert(result.msg);
    updateUI();
    return;
  }

  const result = playCard(player, handIndex);
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.sellAsset = (assetUID) => {
  if (activePlayer().isCPU) return;
  const result = sellAsset(activePlayer(), assetUID);
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.fireWorkerUI = (workerUID) => {
  if (activePlayer().isCPU) return;
  const player = activePlayer();
  const worker =
    player.field.dipendenti.find(d => d.uid === workerUID) ||
    player.field.collaboratori.find(c => c.uid === workerUID);
  if (worker && confirm(`Licenziare ${worker.nome}?`)) {
    fireWorker(player, worker);
    updateUI();
  }
};

window.jobOfferUI = (targetWorkerUID) => {
  if (activePlayer().isCPU) return;
  const result = jobOffer(activePlayer(), targetWorkerUID);
  if (!result.ok) {
    alert(result.msg);
  } else {
    alert(result.success
      ? `🎲 Dado: ${result.roll} (pari) — Furto riuscito!`
      : `🎲 Dado: ${result.roll} (dispari) — Rimane, mantenimento aumentato.`
    );
  }
  updateUI();
};

window.assignWorker = (workerUID, assetUID) => {
  if (activePlayer().isCPU) return;
  const result = assignWorkerToAsset(activePlayer(), workerUID, assetUID);
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.equipFormationUI = (formationUID, workerUID) => {
  if (activePlayer().isCPU) return;
  const result = equipFormation(activePlayer(), formationUID, workerUID);
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.useCEOAbilityUI = () => {
  if (activePlayer().isCPU) return;
  const result = useCEOAbility(activePlayer());
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.assignCEOToAssetUI = (assetUID) => {
  if (activePlayer().isCPU) return;
  const result = assignCEOToAsset(activePlayer(), assetUID);
  if (!result.ok) alert(result.msg);
  updateUI();
};

window.useWorkerAbilityUI = (workerUID) => {
  if (activePlayer().isCPU) return;
  const player = activePlayer();
  const result = useWorkerAbility(player, workerUID);
  if (!result.ok) {
    alert(result.msg);
  } else if (result.type === "revealHand") {
    const hand = result.hand;
    const names = hand.map((c, i) => `${i}: ${c.nome}`).join("\n");
    const choice = prompt(`Mano avversaria:\n${names}\n\nScegli indice da mettere in fondo al mazzo:`);
    if (choice !== null) {
      const idx = parseInt(choice);
      if (!isNaN(idx)) putCardOnBottom(1 - state.currentPlayer, idx);
    }
    state.pendingRevealHand = null;
  }
  updateUI();
};

// ═══════════════════════════════════════════════════
init();
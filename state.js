// ─── state.js ───────────────────────────────────────────
export function createPlayer(name, isCPU = false) {
  return {
    name,
    isCPU,
    PR: 5,
    ceo: null,
    hand: [],
    field: {
      assets: [],
      dipendenti: [],
      collaboratori: [],
      formazione: [],
      geopolitica: null,
    },
    mulliganUsed: false,
    ceoAbilityUsedThisTurn: false,
    ceoAssignedAsAsset: false,
  };
}

export const state = {
  turn: 0,
  phaseIndex: 0,
  phases: ["Produzione", "Giocata", "Fine"],
  currentPlayer: 0,

  players: [
    createPlayer("Giocatore 1"),
    createPlayer("CPU", true),
  ],

  allCards: [],
  availableCEOs: [],
  deck: [],
  removedCards: [],

  gamePhase: "setup",
  winner: null,
  firstPlayer: null,

  pendingEvent: null,
  pendingDiscard: null,
  pendingJobOffer: null,
  pendingRevealHand: null,

  // CPU state
  cpuTurnNumber: 0,
  cpuRiggedDraws: [], // Carte truccate che la CPU pescherà in ordine

  log: [],
  nextUID: 1,
};

export function getUID() { return state.nextUID++; }
export function activePlayer() { return state.players[state.currentPlayer]; }
export function opponentPlayer() { return state.players[1 - state.currentPlayer]; }

export function allFieldCards(player) {
  const f = player.field;
  const cards = [...f.assets, ...f.dipendenti, ...f.collaboratori, ...f.formazione];
  if (f.geopolitica) cards.push(f.geopolitica);
  return cards;
}

export function allWorkers(player) {
  return [...player.field.dipendenti, ...player.field.collaboratori];
}
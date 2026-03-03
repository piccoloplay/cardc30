// ─── deck.js ────────────────────────────────────────────
import { state } from "./state.js";

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function drawCards(player, count = 1) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) break;
    const card = state.deck.shift();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

export function mulligan(player, indicesToDiscard) {
  if (player.mulliganUsed) return false;
  player.mulliganUsed = true;
  if (indicesToDiscard.length === 0) return true;
  const sorted = [...indicesToDiscard].sort((a, b) => b - a);
  const discarded = [];
  for (const idx of sorted) {
    if (idx >= 0 && idx < player.hand.length) {
      discarded.push(...player.hand.splice(idx, 1));
    }
  }
  state.deck.push(...discarded);
  shuffle(state.deck);
  drawCards(player, discarded.length);
  return true;
}

export function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

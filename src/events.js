// ============================================================
//  EVENTS — Structured event emission for analytics & future UI
//
//  Two export functions:
//    emit(event)       → pushes to currentTurnEvents AND gameEvents
//    emitGlobal(event) → pushes to gameEvents ONLY
//
//  Use emit() for the active player's perspective.
//  Use emitGlobal() for non-active-player perspectives (e.g. rent_received
//  by the landlord — that event should appear in the game log but not in
//  the current player's turn summary).
// ============================================================

import { state } from './state.js';

function buildEvent(event) {
  return {
    ...event,
    turn:     state.players.length * (state.round - 1) + state.current,
    round:    state.round,
    playerId: event.playerId ?? state.current,
    timestamp: Date.now(),
  };
}

/** Emit to currentTurnEvents (active player) AND gameEvents. */
export function emit(event) {
  const e = buildEvent(event);
  state.currentTurnEvents.push(e);
  state.gameEvents.push(e);
}

/** Emit to gameEvents only — not to currentTurnEvents. */
export function emitGlobal(event) {
  const e = buildEvent(event);
  state.gameEvents.push(e);
}

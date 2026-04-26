// ============================================================
//  STATE — Core game state object and pure utility helpers
// ============================================================

import { COMMANDERS } from './commanders.js';

export const PLAYER_COLORS = [
  { name: 'Imperial Eagle', hex: '#1e3a5f' },
  { name: 'Crimson Hussar', hex: '#8b1d1d' },
  { name: 'Cossack Green', hex: '#2d4a2b' },
  { name: 'Bourbon Gold',   hex: '#b8902e' },
  { name: 'Prussian Slate', hex: '#3a3a4a' },
];

export const state = {
  phase: 'setup', // setup | playing | gameOver
  players: [],
  current: 0,
  round: 1,
  maxRounds: 20,
  ownership: {},   // spaceIndex -> playerId
  buildings: {},   // spaceIndex -> 0..5
  ordersDeck: [],
  diplomacyDeck: [],
  log: [],
  lastRoll: [0, 0],
  rolledThisTurn: false,
  doubleCount: 0,
  pendingAction: null,
  selectedSpace: null,
  expandedPlayer: null,    // player id whose bio card is expanded in the sidebar
  holdingsExpanded: {},    // playerId -> boolean (true = open); defaults open
  winner: null,
  winReason: '',
  currentTurnEvents: [], // cleared at the start of each new turn
  gameEvents: [],        // accumulates for entire game, never cleared
  diceRolling: false,    // true while tumble animation plays; disables Roll button
  lastDiceRolled: [0, 0], // tracks last d1/d2 for anti-repeat bias in rollDie
  pendingTurnSummary: null, // set by endTurn(); cleared when Continue is clicked
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function log(msg, type = '') {
  state.log.unshift({ msg, type, round: state.round });
  if (state.log.length > 100) state.log.pop();
}

export function currentPlayer() {
  return state.players[state.current];
}

// ---------------------------------------------------------------------------
// Persistence — save/load to localStorage
// ---------------------------------------------------------------------------

const SAVE_KEY = 'empire_save';

export function saveGame() {
  if (state.phase !== 'playing') return;
  try {
    const snapshot = {
      ...state,
      players: state.players.map(p => ({
        ...p,
        commander: p.commander?.id ?? null,
      })),
      // pendingAction may contain live player object references — omit to avoid stale refs
      pendingAction: null,
      pendingTurnSummary: null,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  } catch (_) {}
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || saved.phase !== 'playing') return false;
    saved.players = saved.players.map(p => ({
      ...p,
      commander: COMMANDERS.find(c => c.id === p.commander) ?? null,
    }));
    // Reset transient UI state
    saved.diceRolling = false;
    saved.currentTurnEvents = saved.currentTurnEvents ?? [];
    saved.gameEvents = saved.gameEvents ?? [];
    Object.assign(state, saved);
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

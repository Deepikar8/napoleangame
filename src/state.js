// ============================================================
//  STATE — Core game state object and pure utility helpers
// ============================================================

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

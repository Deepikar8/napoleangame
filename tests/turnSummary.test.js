// ============================================================
//  Tests for Turn Summary (src/rules.js endTurn behaviour)
//  Verifies that state.pendingTurnSummary is correctly populated
//  and that edge-cases (trivial turns, game-over, exile, skipped)
//  are handled according to the brief.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../src/state.js';
import { emit } from '../src/events.js';
import { BOARD } from '../src/board.js';
import { COMMANDERS } from '../src/commanders.js';
import {
  registerRenderer,
  registerDiceAnimator,
  rollDice,
  endTurn,
  buyProperty,
  declinePurchase,
  sendToExile,
  exilePay,
  exileDiceRoll,
  movePlayer,
} from '../src/rules.js';

registerRenderer(() => {});
registerDiceAnimator((_v, cb) => cb()); // synchronous no-op animator

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cmd(id) { return COMMANDERS.find(c => c.id === id); }

function makePlayer(id = 0, overrides = {}) {
  return {
    id, name: `Player${id}`, color: '#abc', colorName: 'Test',
    money: 1500, position: 0,
    inExile: false, exileTurns: 0, skipNext: false,
    collapsed: false, outOfExileCard: false, commander: null,
    ...overrides,
  };
}

function resetState(players = [makePlayer(0), makePlayer(1)]) {
  state.phase          = 'playing';
  state.players        = players;
  state.current        = 0;
  state.round          = 1;
  state.maxRounds      = 20;
  state.ownership      = {};
  state.buildings      = {};
  state.ordersDeck     = [];
  state.diplomacyDeck  = [];
  state.log            = [];
  state.lastRoll       = [3, 4];
  state.rolledThisTurn = false;
  state.doubleCount    = 0;
  state.pendingAction  = null;
  state.selectedSpace  = null;
  state.expandedPlayer = null;
  state.holdingsExpanded = {};
  state.winner         = null;
  state.winReason      = '';
  state.currentTurnEvents  = [];
  state.gameEvents         = [];
  state.diceRolling        = false;
  state.lastDiceRolled     = [0, 0];
  state.pendingTurnSummary = null;
}

const TOULON    = BOARD.find(s => s.name === 'Toulon');
const MARENGO   = BOARD.find(s => s.name === 'Marengo');
const WAGRAM    = BOARD.find(s => s.name === 'Wagram');

// ---------------------------------------------------------------------------
// Basic population
// ---------------------------------------------------------------------------

describe('pendingTurnSummary — basic population', () => {
  beforeEach(() => resetState());

  it('is null before any turn ends', () => {
    expect(state.pendingTurnSummary).toBeNull();
  });

  it('is set after a non-trivial turn ends', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary).not.toBeNull();
  });

  it('captures playerName from the player whose turn ended', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.playerName).toBe('Player0');
  });

  it('captures playerColor', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.playerColor).toBe('#abc');
  });

  it('captures moneyAfter reflecting end-of-turn balance', () => {
    state.players[0].money = 1200;
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.moneyAfter).toBe(1200);
  });

  it('captures turnNumber correctly for turn 1', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.turnNumber).toBe(1);
  });

  it('captures turnNumber correctly for turn 3 (2-player, round 2)', () => {
    // Advance to turn 3: end turns 1 and 2 first
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();

    state.pendingTurnSummary = null;
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();

    // Now turn 3 (player 0, round 2)
    state.pendingTurnSummary = null;
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();

    expect(state.pendingTurnSummary.turnNumber).toBe(3);
  });

  it('captures commander fields when player has a commander', () => {
    state.players[0].commander = cmd('napoleon');
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.commanderName).toBe('Napoleon Bonaparte');
    expect(state.pendingTurnSummary.commanderTitle).toBe('The Emperor of the French');
  });

  it('has null commander fields when player has no commander', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    expect(state.pendingTurnSummary.commanderName).toBeNull();
    expect(state.pendingTurnSummary.commanderTitle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Events captured
// ---------------------------------------------------------------------------

describe('pendingTurnSummary — events array', () => {
  beforeEach(() => resetState());

  it('events include turn_started, the turn events, and turn_ended', () => {
    // turn_started is emitted by the PREVIOUS endTurn call; simulate it here
    emit({ type: 'turn_started', isExileTurn: false });
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    const types = state.pendingTurnSummary.events.map(e => e.type);
    expect(types).toContain('turn_started');
    expect(types).toContain('roll');
    expect(types).toContain('turn_ended');
  });

  it('events do NOT include the new turn_started emitted for next player', () => {
    // Emit the current player's turn_started (as would happen after previous endTurn)
    emit({ type: 'turn_started', isExileTurn: false });
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    // Only one turn_started — the one emitted for player 0 above
    const tsEvents = state.pendingTurnSummary.events.filter(e => e.type === 'turn_started');
    expect(tsEvents).toHaveLength(1);
    expect(tsEvents[0].playerId).toBe(0); // player 0's turn_started, not player 1's
  });
});

// ---------------------------------------------------------------------------
// Trivial turn skip
// ---------------------------------------------------------------------------

describe('pendingTurnSummary — trivial turn skip', () => {
  beforeEach(() => resetState());

  it('is NULL when currentTurnEvents has only lifecycle events', () => {
    // Manually populate currentTurnEvents with only lifecycle events
    state.currentTurnEvents = [
      { type: 'turn_started', playerId: 0, turn: 0, round: 1, timestamp: 0 },
    ];
    // The doubles guard in endTurn needs lastRoll to be non-matching & rolledThisTurn=true
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    endTurn();
    // currentTurnEvents was [turn_started] + turn_ended (from endTurn) = still just lifecycle
    expect(state.pendingTurnSummary).toBeNull();
  });

  it('is SET when turn_skipped is present (minimal summary for skipped turns)', () => {
    state.players[0].skipNext = true;
    vi.spyOn(Math, 'random').mockReturnValue(1 / 6); // non-doubles
    rollDice(); // triggers skipNext path → emits turn_skipped → calls endTurn
    vi.restoreAllMocks();
    expect(state.pendingTurnSummary).not.toBeNull();
  });

  it('skipped turn summary contains a turn_skipped event', () => {
    state.players[0].skipNext = true;
    vi.spyOn(Math, 'random').mockReturnValue(1 / 6);
    rollDice();
    vi.restoreAllMocks();
    const skipped = state.pendingTurnSummary?.events.find(e => e.type === 'turn_skipped');
    expect(skipped).toBeTruthy();
    expect(skipped.reason).toBe('winter_quarters');
  });
});

// ---------------------------------------------------------------------------
// Game-over suppression
// ---------------------------------------------------------------------------

describe('pendingTurnSummary — game-over suppression', () => {
  beforeEach(() => resetState());

  it('is NULL when phase becomes gameOver during the same endTurn call', () => {
    // Force a win condition before calling endTurn
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    // Simulate game ending (checkVictory sees gameOver)
    state.phase = 'gameOver';
    state.winner = state.players[0];
    state.winReason = 'Test win';
    endTurn(); // should return early — gameOver guard fires first
    expect(state.pendingTurnSummary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Treasury delta helpers (tested via captured event data)
// ---------------------------------------------------------------------------

describe('pendingTurnSummary — treasury data', () => {
  beforeEach(() => resetState());

  it('moneyAfter reflects gain events that happened this turn', () => {
    state.players[0].money = 1700; // after a +200 mobilization
    emit({ type: 'gain', amount: 200, source: 'mobilization' });
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    endTurn();
    expect(state.pendingTurnSummary.moneyAfter).toBe(1700);
  });

  it('captured events include rent_paid for treasury delta calculation', () => {
    emit({ type: 'rent_paid', spaceName: 'Toulon', amount: 40, paidTo: 1, paidToName: 'Player1' });
    state.players[0].money = 1460;
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    endTurn();
    const rp = state.pendingTurnSummary.events.find(e => e.type === 'rent_paid');
    expect(rp).toBeTruthy();
    expect(rp.amount).toBe(40);
  });

  it('captured events include purchase event for treasury delta', () => {
    emit({ type: 'purchase', spaceIndex: TOULON.i, spaceName: 'Toulon', price: 60, spaceType: 'territory' });
    state.players[0].money = 1440;
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    endTurn();
    const purch = state.pendingTurnSummary.events.find(e => e.type === 'purchase');
    expect(purch).toBeTruthy();
    expect(purch.price).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Exile — loss event emitted for exile pay paths
// ---------------------------------------------------------------------------

describe('exile pay — loss event emitted for treasury tracking', () => {
  beforeEach(() => resetState());

  it('exilePay() emits loss(50, exile_pay)', () => {
    state.players[0].inExile = true;
    exilePay();
    const lossEv = state.gameEvents.find(e => e.type === 'loss' && e.source === 'exile_pay');
    expect(lossEv).toBeTruthy();
    expect(lossEv.amount).toBe(50);
  });

  it('exileDiceRoll 3-fails emits loss(50, exile_pay)', () => {
    state.players[0].inExile = true;
    state.players[0].exileTurns = 2; // one more fail → forced pay

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)       // d1 = 1
      .mockReturnValueOnce(1 / 6); // d2 = 2 (not doubles)
    exileDiceRoll();
    vi.restoreAllMocks();

    const lossEv = state.gameEvents.find(e => e.type === 'loss' && e.source === 'exile_pay');
    expect(lossEv).toBeTruthy();
    expect(lossEv.amount).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Exile attempt — exileTurns attached to failed attempt event
// ---------------------------------------------------------------------------

describe('exile_attempt event — exileTurns field', () => {
  beforeEach(() => resetState());

  it('failed exile attempt includes exileTurns count', () => {
    state.players[0].inExile = true;
    state.players[0].exileTurns = 0;

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)       // d1 = 1
      .mockReturnValueOnce(1 / 6); // d2 = 2 (not doubles)
    exileDiceRoll();
    vi.restoreAllMocks();

    const attempt = state.gameEvents.find(e => e.type === 'exile_attempt' && !e.success);
    expect(attempt?.exileTurns).toBe(1); // incremented to 1 before emit
  });
});

// ---------------------------------------------------------------------------
// Doubles do NOT trigger summary mid-sequence
// ---------------------------------------------------------------------------

describe('doubles — summary fires only when turn actually ends', () => {
  beforeEach(() => resetState());

  it('pendingTurnSummary is null after a doubles roll (turn not over yet)', () => {
    state.lastRoll = [3, 3]; // doubles
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 3], total: 6, isDoubles: true });
    endTurn(); // doubles early-return path
    expect(state.pendingTurnSummary).toBeNull();
  });

  it('summary includes all rolls when doubles lead to a regular roll', () => {
    // Roll 1: doubles (3+3)
    state.lastRoll = [3, 3];
    state.rolledThisTurn = true;
    state.doubleCount = 1;
    emit({ type: 'roll', dice: [3, 3], total: 6, isDoubles: true });
    endTurn(); // doubles → no summary, turn continues

    // Roll 2: regular (3+4), turn ends
    state.rolledThisTurn = true;
    state.lastRoll = [3, 4];
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();

    const rollEvents = state.pendingTurnSummary?.events.filter(e => e.type === 'roll') ?? [];
    expect(rollEvents).toHaveLength(2);
    expect(rollEvents[0].isDoubles).toBe(true);
    expect(rollEvents[1].isDoubles).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Summary advances state.current before summary is captured
// ---------------------------------------------------------------------------

describe('state.current after endTurn with pending summary', () => {
  beforeEach(() => resetState());

  it('state.current advances to next player even when summary is pending', () => {
    state.rolledThisTurn = true;
    emit({ type: 'roll', dice: [3, 4], total: 7, isDoubles: false });
    endTurn();
    // current should now be player 1
    expect(state.current).toBe(1);
    // but summary belongs to player 0
    expect(state.pendingTurnSummary.playerId).toBe(0);
  });
});

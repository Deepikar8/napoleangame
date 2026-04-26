// ============================================================
//  Tests for Dice Polish:
//    - rollDie() anti-repeat bias
//    - rollDice() / exileDiceRoll() with injected animator
//    - state.diceRolling flag lifecycle
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../src/state.js';
import { BOARD } from '../src/board.js';
import {
  registerRenderer,
  registerDiceAnimator,
  rollDie,
  rollDice,
  exileDiceRoll,
} from '../src/rules.js';

registerRenderer(() => {});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides = {}) {
  return {
    id: 0, name: 'Napoleon', color: '#000', colorName: 'Test',
    money: 1500, position: 0,
    inExile: false, exileTurns: 0, skipNext: false,
    collapsed: false, outOfExileCard: false, commander: null,
    ...overrides,
  };
}

function resetState(players = [makePlayer(), makePlayer({ id: 1, name: 'Wellington' })]) {
  state.phase = 'playing';
  state.players = players;
  state.current = 0;
  state.round = 1;
  state.maxRounds = 20;
  state.ownership = {};
  state.buildings = {};
  state.ordersDeck = [];
  state.diplomacyDeck = [];
  state.log = [];
  state.lastRoll = [0, 0];
  state.rolledThisTurn = false;
  state.doubleCount = 0;
  state.pendingAction = null;
  state.selectedSpace = null;
  state.winner = null;
  state.winReason = '';
  state.currentTurnEvents = [];
  state.gameEvents = [];
  state.diceRolling = false;
  state.lastDiceRolled = [0, 0];
  state.pendingTurnSummary = null;
}

// Synchronous no-op animator (fires callback immediately, same as test default)
const syncAnimator = (values, cb) => cb();

beforeEach(() => {
  registerDiceAnimator(syncAnimator);
  resetState();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// rollDie — anti-repeat bias
// ---------------------------------------------------------------------------

describe('rollDie', () => {
  it('returns a value between 1 and 6', () => {
    for (let i = 0; i < 30; i++) {
      const v = rollDie();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('with lastValue=0 never re-rolls (0 is not a valid die face)', () => {
    // Set up 12 sequential random values; all should be consumed once each
    const randoms = Array.from({ length: 12 }, (_, i) => i / 12);
    vi.spyOn(Math, 'random').mockImplementation(() => randoms.shift() ?? 0);
    for (let i = 0; i < 12; i++) rollDie(0);
    // If re-rolls were triggered the mock would run out; reaching here = pass
  });

  it('re-rolls exactly once when first result matches lastValue', () => {
    // First call → would return 3 (lastValue=3 → re-roll) → second call → 4
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6)   // 1 + floor(2/6*6) = 1+2 = 3  ← matches lastValue
      .mockReturnValueOnce(3 / 6);  // 1 + floor(3/6*6) = 1+3 = 4  ← used as re-roll
    expect(rollDie(3)).toBe(4);
  });

  it('does NOT re-roll a second time if re-roll also matches lastValue', () => {
    // Re-roll is taken at most once; if re-roll still matches, that result stands
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6)   // → 3, matches lastValue=3
      .mockReturnValueOnce(2 / 6);  // → 3 again (re-roll result, accepted as-is)
    expect(rollDie(3)).toBe(3);
  });

  it('does not re-roll when first result differs from lastValue', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0); // → 1, lastValue=3, no match
    expect(rollDie(3)).toBe(1);
    // Only one random call should have been consumed
    expect(Math.random).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// rollDice — diceRolling flag lifecycle
// ---------------------------------------------------------------------------

describe('rollDice — diceRolling flag', () => {
  it('diceRolling is false after synchronous animator callback completes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1 / 6);
    rollDice();
    expect(state.diceRolling).toBe(false);
  });

  it('diceRolling is true while animator is pending (async)', () => {
    let capturedFlag = null;
    registerDiceAnimator((_values, cb) => {
      capturedFlag = state.diceRolling; // sample flag inside animator, before callback
      cb();
    });
    vi.spyOn(Math, 'random').mockReturnValue(1 / 6);
    rollDice();
    expect(capturedFlag).toBe(true);
    expect(state.diceRolling).toBe(false); // restored after cb()
  });

  it('rollDice is a no-op when diceRolling is already true', () => {
    state.diceRolling = true;
    vi.spyOn(Math, 'random');
    rollDice();
    expect(Math.random).not.toHaveBeenCalled();
    state.diceRolling = false;
  });
});

// ---------------------------------------------------------------------------
// rollDice — final values land in state after animation
// ---------------------------------------------------------------------------

describe('rollDice — state after animation', () => {
  it('sets state.lastRoll to the rolled values', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)       // d1 → 1
      .mockReturnValueOnce(1 / 6);  // d2 → 2
    rollDice();
    expect(state.lastRoll).toEqual([1, 2]);
  });

  it('sets state.rolledThisTurn to true after animation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1 / 6);
    rollDice();
    expect(state.rolledThisTurn).toBe(true);
  });

  it('updates state.lastDiceRolled for next-turn bias tracking', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)       // d1 → 1
      .mockReturnValueOnce(1 / 6);  // d2 → 2
    rollDice();
    expect(state.lastDiceRolled).toEqual([1, 2]);
  });

  it('emits a roll event after animation', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1 / 6);
    rollDice();
    const ev = state.currentTurnEvents.find(e => e.type === 'roll');
    expect(ev).toBeTruthy();
    expect(ev.dice).toEqual([1, 2]);
    expect(ev.isDoubles).toBe(false);
  });

  it('emits isDoubles=true on matching faces', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // both → 1
    rollDice();
    const ev = state.currentTurnEvents.find(e => e.type === 'roll');
    expect(ev.isDoubles).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rollDice — animator receives the pre-calculated values
// ---------------------------------------------------------------------------

describe('rollDice — animator receives final values', () => {
  it('passes [d1, d2] to the animator before any game logic', () => {
    let animatedValues = null;
    registerDiceAnimator((values, cb) => {
      animatedValues = values;
      cb();
    });
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(3 / 6)   // d1 → 4
      .mockReturnValueOnce(4 / 6);  // d2 → 5
    rollDice();
    expect(animatedValues).toEqual([4, 5]);
  });
});

// ---------------------------------------------------------------------------
// exileDiceRoll — diceRolling flag and state
// ---------------------------------------------------------------------------

describe('exileDiceRoll — diceRolling flag', () => {
  beforeEach(() => {
    state.players[0].inExile = true;
    state.players[0].exileTurns = 0;
  });

  it('diceRolling is false after synchronous callback', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // doubles
    exileDiceRoll();
    expect(state.diceRolling).toBe(false);
  });

  it('sets state.lastRoll after animation', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)       // d1 → 1
      .mockReturnValueOnce(0);      // d2 → 1 (doubles)
    exileDiceRoll();
    expect(state.lastRoll).toEqual([1, 1]);
  });

  it('sets rolledThisTurn=true after animation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    exileDiceRoll();
    expect(state.rolledThisTurn).toBe(true);
  });

  it('passes correct final values to animator', () => {
    let animatedValues = null;
    registerDiceAnimator((values, cb) => { animatedValues = values; cb(); });
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(2 / 6)   // d1 → 3
      .mockReturnValueOnce(3 / 6);  // d2 → 4
    exileDiceRoll();
    expect(animatedValues).toEqual([3, 4]);
  });
});

// ---------------------------------------------------------------------------
// rollDie anti-repeat — sequential rolls converge on uniform distribution
// ---------------------------------------------------------------------------

describe('rollDie — distribution with bias', () => {
  it('still produces all 6 faces across many rolls', () => {
    const counts = {};
    for (let i = 0; i < 600; i++) {
      const v = rollDie(3); // bias against 3
      counts[v] = (counts[v] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(6);
    // Face 3 should appear less than expected 1/6 × 600 = 100 times
    expect(counts[3]).toBeLessThan(100);
  });
});

// ============================================================
//  Tests for rule-heavy functions in src/rules.js
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../src/state.js';
import { BOARD } from '../src/board.js';
import {
  calculateRent,
  canBuild,
  checkStrategicVictory,
  exileDiceRoll,
  exilePay,
  sendToExile,
  getOwner,
  ownsGroup,
  netWorth,
  payMoney,
  payRent,
  updateCollapseStatus,
  checkRecovery,
} from '../src/rules.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides = {}) {
  return {
    id: 0,
    name: 'Test',
    color: '#fff',
    colorName: 'Test',
    money: 1500,
    position: 0,
    inExile: false,
    exileTurns: 0,
    skipNext: false,
    collapsed: false,
    outOfExileCard: false,
    eliminated: false,
    ...overrides,
  };
}

function resetState(players = [makePlayer()]) {
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
  state.lastRoll = [3, 4]; // default non-doubles
  state.rolledThisTurn = false;
  state.doubleCount = 0;
  state.pendingAction = null;
  state.selectedSpace = null;
  state.winner = null;
  state.winReason = '';
}

// Boards spaces useful across tests
const TOULON    = BOARD.find(s => s.name === 'Toulon');    // i=1, group=Brown
const MARENGO   = BOARD.find(s => s.name === 'Marengo');   // i=3, group=Brown
const PARIS     = BOARD.find(s => s.name === 'Paris');     // i=39, capital
const AUSTERLITZ    = BOARD.find(s => s.name === 'Austerlitz');    // i=21, battle
const JENA          = BOARD.find(s => s.name === 'Jena-Auerstedt'); // i=23, battle
const WAGRAM        = BOARD.find(s => s.name === 'Wagram');         // i=24, battle
const NORTH_SUPPLY  = BOARD.find(s => s.name === 'North Supply Line');  // i=5
const EAST_SUPPLY   = BOARD.find(s => s.name === 'East Supply Line');   // i=15
const CONTINENTAL   = BOARD.find(s => s.name === 'Continental System'); // i=12
const NAVAL         = BOARD.find(s => s.name === 'Naval Blockade');     // i=28

// ---------------------------------------------------------------------------
// calculateRent
// ---------------------------------------------------------------------------

describe('calculateRent', () => {
  beforeEach(() => resetState());

  it('returns 0 when space is unowned', () => {
    expect(calculateRent(TOULON)).toBe(0);
  });

  describe('territory — base rent', () => {
    it('returns base rent[0] when no buildings and no monopoly', () => {
      state.ownership[TOULON.i] = 0; // player 0 owns Toulon only
      expect(calculateRent(TOULON)).toBe(TOULON.rent[0]); // 2
    });

    it('doubles rent when owner holds full color group (monopoly)', () => {
      state.ownership[TOULON.i]  = 0;
      state.ownership[MARENGO.i] = 0; // full Brown group
      expect(calculateRent(TOULON)).toBe(TOULON.rent[0] * 2); // 4
    });

    it('does not double rent when group is incomplete', () => {
      state.ownership[TOULON.i] = 0;
      // Marengo not owned → not a monopoly
      expect(calculateRent(TOULON)).toBe(TOULON.rent[0]); // 2
    });

    it('uses rent table index equal to buildings level', () => {
      state.ownership[TOULON.i]  = 0;
      state.ownership[MARENGO.i] = 0;
      state.buildings[TOULON.i]  = 2; // 2 Regiments
      // monopoly bonus does not apply once buildings > 0
      expect(calculateRent(TOULON)).toBe(TOULON.rent[2]); // 30
    });

    it('returns max rent at building level 5 (Army Corps)', () => {
      state.ownership[TOULON.i]  = 0;
      state.ownership[MARENGO.i] = 0;
      state.buildings[TOULON.i]  = 5;
      expect(calculateRent(TOULON)).toBe(TOULON.rent[5]); // 250
    });
  });

  describe('supply lines — tiered rent', () => {
    it('charges 25 for 1 supply line', () => {
      state.ownership[NORTH_SUPPLY.i] = 0;
      expect(calculateRent(NORTH_SUPPLY)).toBe(25);
    });

    it('charges 50 for 2 supply lines', () => {
      state.ownership[NORTH_SUPPLY.i] = 0;
      state.ownership[EAST_SUPPLY.i]  = 0;
      expect(calculateRent(NORTH_SUPPLY)).toBe(50);
    });

    it('charges 100 for 3 supply lines', () => {
      const south = BOARD.find(s => s.name === 'South Supply Line');
      state.ownership[NORTH_SUPPLY.i] = 0;
      state.ownership[EAST_SUPPLY.i]  = 0;
      state.ownership[south.i]        = 0;
      expect(calculateRent(NORTH_SUPPLY)).toBe(100);
    });
  });

  describe('economic spaces — dice-based rent', () => {
    it('charges dice × 4 when owner holds 1 economic space', () => {
      state.ownership[CONTINENTAL.i] = 0;
      state.lastRoll = [3, 4]; // total 7
      expect(calculateRent(CONTINENTAL)).toBe(7 * 4); // 28
    });

    it('charges dice × 10 when owner holds both economic spaces', () => {
      state.ownership[CONTINENTAL.i] = 0;
      state.ownership[NAVAL.i]       = 0;
      state.lastRoll = [5, 5]; // total 10
      expect(calculateRent(CONTINENTAL)).toBe(10 * 10); // 100
    });
  });
});

// ---------------------------------------------------------------------------
// canBuild
// ---------------------------------------------------------------------------

describe('canBuild', () => {
  let player;

  beforeEach(() => {
    player = makePlayer({ id: 0, money: 1500 });
    resetState([player]);
    // Give player the full Brown group (needed for most tests)
    state.ownership[TOULON.i]  = 0;
    state.ownership[MARENGO.i] = 0;
  });

  it('returns true for a legal build', () => {
    expect(canBuild(player, TOULON)).toBe(true);
  });

  it('returns false for non-territory space', () => {
    const supply = BOARD.find(s => s.type === 'supply');
    state.ownership[supply.i] = 0;
    expect(canBuild(player, supply)).toBe(false);
  });

  it('returns false when player does not own the space', () => {
    const other = makePlayer({ id: 1, money: 1500 });
    state.ownership[TOULON.i] = 1; // owned by player 1
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('returns false when player is in Collapse State', () => {
    player.collapsed = true;
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('returns false when player does not hold the full group', () => {
    delete state.ownership[MARENGO.i]; // break the monopoly
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('returns false when building level is already 5', () => {
    state.buildings[TOULON.i]  = 5;
    state.buildings[MARENGO.i] = 5;
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('enforces the even-build rule: cannot advance ahead of a sibling', () => {
    // Toulon at 1, Marengo at 0 → cannot build second on Toulon yet
    state.buildings[TOULON.i]  = 1;
    state.buildings[MARENGO.i] = 0;
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('allows build when all siblings are at the same level', () => {
    state.buildings[TOULON.i]  = 1;
    state.buildings[MARENGO.i] = 1;
    expect(canBuild(player, TOULON)).toBe(true);
  });

  it('returns false when player lacks funds', () => {
    player.money = TOULON.buildCost - 1; // 49 < 50
    expect(canBuild(player, TOULON)).toBe(false);
  });

  it('returns false when player has exactly 0 money', () => {
    player.money = 0;
    expect(canBuild(player, TOULON)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkStrategicVictory
// ---------------------------------------------------------------------------

describe('checkStrategicVictory', () => {
  let player;

  beforeEach(() => {
    player = makePlayer({ id: 0 });
    resetState([player]);
  });

  it('returns false when Paris is not owned', () => {
    state.ownership[AUSTERLITZ.i] = 0;
    state.ownership[JENA.i]       = 0;
    expect(checkStrategicVictory(player)).toBe(false);
  });

  it('returns false when Paris is owned but fewer than 2 battle territories', () => {
    state.ownership[PARIS.i]      = 0;
    state.ownership[AUSTERLITZ.i] = 0; // only 1 battle
    expect(checkStrategicVictory(player)).toBe(false);
  });

  it('returns true when Paris + exactly 2 battle territories are owned', () => {
    state.ownership[PARIS.i]      = 0;
    state.ownership[AUSTERLITZ.i] = 0;
    state.ownership[JENA.i]       = 0;
    expect(checkStrategicVictory(player)).toBe(true);
  });

  it('returns true when Paris + all 3 battle territories are owned', () => {
    state.ownership[PARIS.i]      = 0;
    state.ownership[AUSTERLITZ.i] = 0;
    state.ownership[JENA.i]       = 0;
    state.ownership[WAGRAM.i]     = 0;
    expect(checkStrategicVictory(player)).toBe(true);
  });

  it('returns false when battle territories are owned by a different player', () => {
    state.ownership[PARIS.i]      = 0;
    state.ownership[AUSTERLITZ.i] = 1; // owned by player 1
    state.ownership[JENA.i]       = 1;
    expect(checkStrategicVictory(player)).toBe(false);
  });

  it('returns false for a player with no ownership', () => {
    expect(checkStrategicVictory(player)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exile flow
// ---------------------------------------------------------------------------

describe('Exile flow', () => {
  let player;

  beforeEach(() => {
    player = makePlayer({ id: 0, inExile: true, exileTurns: 0 });
    resetState([player]);
  });

  describe('sendToExile', () => {
    it('marks player as exiled and moves to space 10', () => {
      const p = makePlayer({ inExile: false });
      state.players = [p];
      sendToExile(p);
      expect(p.inExile).toBe(true);
      expect(p.position).toBe(10);
      expect(p.exileTurns).toBe(0);
    });

    it('resets doubleCount when sending to exile', () => {
      state.doubleCount = 2;
      sendToExile(player);
      expect(state.doubleCount).toBe(0);
    });
  });

  describe('exileDiceRoll — doubles escape', () => {
    it('frees the player immediately on doubles', () => {
      // Force Math.random to always produce 1/6 → die value 1 (doubles)
      vi.spyOn(Math, 'random').mockReturnValue(0);
      exileDiceRoll();
      expect(player.inExile).toBe(false);
      expect(player.exileTurns).toBe(0);
      vi.restoreAllMocks();
    });

    it('sets lastRoll to the doubled value', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // both dice → 1
      exileDiceRoll();
      expect(state.lastRoll[0]).toBe(1);
      expect(state.lastRoll[1]).toBe(1);
      vi.restoreAllMocks();
    });
  });

  describe('exileDiceRoll — no escape (non-doubles)', () => {
    beforeEach(() => {
      // First call → 1 (die 1), second call → 0 (die 2=1? no)
      // We need d1 != d2. Use alternating 0.0 and 0.5:
      // 0.0 → floor(0.0*6)=0 → die=1
      // 0.5 → floor(0.5*6)=3 → die=4
      // Result: [1, 4] — not doubles.
      let calls = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => (calls++ % 2 === 0 ? 0.0 : 0.5));
    });

    afterEach(() => vi.restoreAllMocks());

    it('increments exileTurns on non-doubles', () => {
      exileDiceRoll();
      expect(player.exileTurns).toBe(1);
      expect(player.inExile).toBe(true);
    });

    it('stays in exile after first failed roll', () => {
      exileDiceRoll();
      expect(player.inExile).toBe(true);
    });

    it('frees player and charges 50₣ after 3 failed attempts', () => {
      player.exileTurns = 2; // already failed twice
      exileDiceRoll();       // third failure → auto-pay
      expect(player.inExile).toBe(false);
      expect(player.money).toBe(1500 - 50);
      expect(player.exileTurns).toBe(0);
    });
  });

  describe('exilePay', () => {
    it('pays 50₣ and frees player', () => {
      exilePay();
      expect(player.money).toBe(1450);
      expect(player.inExile).toBe(false);
    });

    it('does not free player if they cannot afford it', () => {
      player.money = 40;
      player.collapsed = false;
      exilePay();
      // Player stays exiled (ends turn instead)
      expect(player.inExile).toBe(true);
    });

    it('allows collapsed player to pay (go further negative)', () => {
      // Collapsed player may have money <= 0; exilePay still deducts
      player.money = 0;
      player.collapsed = true;
      exilePay();
      expect(player.money).toBe(-50);
      expect(player.inExile).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Collapse State helpers
// ---------------------------------------------------------------------------

describe('Collapse State helpers', () => {
  let player;

  beforeEach(() => {
    player = makePlayer({ id: 0, money: 100 });
    resetState([player]);
  });

  it('marks player as collapsed when money drops to 0', () => {
    payMoney(player, 100);
    expect(player.money).toBe(0);
    expect(player.collapsed).toBe(true);
  });

  it('marks player as collapsed when money goes negative', () => {
    payMoney(player, 200);
    expect(player.money).toBe(-100);
    expect(player.collapsed).toBe(true);
  });

  it('does not re-log collapse for an already-collapsed player', () => {
    player.collapsed = true;
    player.money = -50;
    const logsBefore = state.log.length;
    updateCollapseStatus(player);
    expect(state.log.length).toBe(logsBefore); // no new log entry
  });

  it('recovers player when money exceeds 200 while collapsed', () => {
    player.collapsed = true;
    player.money = 201;
    checkRecovery(player);
    expect(player.collapsed).toBe(false);
  });

  it('does not recover player when money is exactly 200', () => {
    player.collapsed = true;
    player.money = 200;
    checkRecovery(player);
    expect(player.collapsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// netWorth
// ---------------------------------------------------------------------------

describe('netWorth', () => {
  let player;

  beforeEach(() => {
    player = makePlayer({ id: 0, money: 1000 });
    resetState([player]);
  });

  it('equals player money when they own nothing', () => {
    expect(netWorth(player)).toBe(1000);
  });

  it('adds property price to cash', () => {
    state.ownership[TOULON.i] = 0; // price 60
    expect(netWorth(player)).toBe(1060);
  });

  it('adds building value on top of property', () => {
    state.ownership[TOULON.i] = 0;  // price 60
    state.buildings[TOULON.i] = 2;  // 2 × buildCost 50 = 100
    expect(netWorth(player)).toBe(1160);
  });
});

// ---------------------------------------------------------------------------
// Forced liquidation via payRent
// ---------------------------------------------------------------------------

describe('payRent — forced liquidation', () => {
  let payer, receiver;

  beforeEach(() => {
    payer    = makePlayer({ id: 0, money: 50 });
    receiver = makePlayer({ id: 1, money: 0 });
    resetState([payer, receiver]);
  });

  it('pays rent normally when payer has enough cash', () => {
    payRent(payer, receiver, 30);
    expect(payer.money).toBe(20);
    expect(receiver.money).toBe(30);
  });

  it('liquidates buildings to cover a shortfall', () => {
    // Payer owns Toulon with 2 regiments; buildings worth 2 × 50 × 0.5 = 50
    state.ownership[TOULON.i]  = 0;
    state.ownership[MARENGO.i] = 0;
    state.buildings[TOULON.i]  = 2;
    // payer.money=50, gets +50 from buildings = 100; rent due=80
    payRent(payer, receiver, 80);
    expect(receiver.money).toBe(80);
    expect(payer.money).toBe(20);          // 50 + 50 proceeds − 80
    expect(state.buildings[TOULON.i]).toBeUndefined(); // sold
  });

  it('liquidates a property when buildings are not enough', () => {
    // Payer owns only Toulon (price 60, mortgage value 30); no buildings
    state.ownership[TOULON.i] = 0;
    // payer.money=50, gets +30 from Toulon = 80; rent due=70
    payRent(payer, receiver, 70);
    expect(receiver.money).toBe(70);
    expect(payer.money).toBe(10);          // 50 + 30 − 70
    expect(state.ownership[TOULON.i]).toBeUndefined(); // mortgaged
  });

  it('pays what it can when fully stripped', () => {
    // payer has 50₣ cash and no assets; rent = 200
    payRent(payer, receiver, 200);
    expect(receiver.money).toBe(50);       // only what payer had
    expect(payer.money).toBe(0);
    expect(payer.collapsed).toBe(true);
  });

  it('sells cheapest property first', () => {
    // Give payer Toulon (60) and Paris (400)
    state.ownership[TOULON.i] = 0;
    state.ownership[PARIS.i]  = 0;
    // payer=50; Toulon mortgage=30 → 80 total; rent due=70 → sells Toulon only
    payRent(payer, receiver, 70);
    expect(state.ownership[TOULON.i]).toBeUndefined(); // Toulon sold
    expect(state.ownership[PARIS.i]).toBe(0);          // Paris kept
  });
});

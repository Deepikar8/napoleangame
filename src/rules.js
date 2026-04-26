// ============================================================
//  RULES — All game logic and turn actions
// ============================================================

import { state, PLAYER_COLORS, shuffle, log, currentPlayer } from './state.js';
import { BOARD, spaceAt, playerAt } from './board.js';
import { ORDERS_CARDS, DIPLOMACY_CARDS } from './cards.js';

// ---------------------------------------------------------------------------
// Renderer injection
// render.js calls registerRenderer(render) once at boot so that rule
// functions can trigger UI updates without importing render.js (which would
// create a circular ESM dependency and break Node.js test imports).
// ---------------------------------------------------------------------------
let _render = () => {};
export function registerRenderer(fn) { _render = fn; }

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getOwner(spaceIndex) {
  const id = state.ownership[spaceIndex];
  if (id === undefined) return null;
  return state.players.find(p => p.id === id) ?? null;
}

export function ownsGroup(player, group) {
  return BOARD
    .filter(s => s.type === 'territory' && s.group === group)
    .every(s => state.ownership[s.i] === player.id);
}

export function countSupplyLines(player) {
  return BOARD.filter(s => s.type === 'supply' && state.ownership[s.i] === player.id).length;
}

export function countEconomic(player) {
  return BOARD.filter(s => s.type === 'economic' && state.ownership[s.i] === player.id).length;
}

export function countBuildings(player) {
  let regiments = 0;
  let armyCorps = 0;
  for (const idx in state.buildings) {
    if (state.ownership[idx] === player.id) {
      const lvl = state.buildings[idx];
      if (lvl === 5) armyCorps++;
      else regiments += lvl;
    }
  }
  return { regiments, armyCorps };
}

export function netWorth(player) {
  let worth = player.money;
  for (const idx in state.ownership) {
    if (state.ownership[idx] === player.id) {
      worth += BOARD[+idx].price ?? 0;
      const buildings = state.buildings[idx] ?? 0;
      const buildCost = BOARD[+idx].buildCost ?? 0;
      worth += buildings * buildCost;
    }
  }
  return worth;
}

// ---------------------------------------------------------------------------
// Collapse State helpers
// ---------------------------------------------------------------------------

export function isCollapsed(player) {
  return player.money <= 0;
}

export function updateCollapseStatus(player) {
  if (player.money <= 0 && !player.collapsed) {
    player.collapsed = true;
    log(`${player.name} enters Collapse State.`, 'loss');
  }
}

export function checkRecovery(player) {
  if (player.collapsed && player.money > 200) {
    player.collapsed = false;
    log(`${player.name} recovers from Collapse State.`, 'major');
  }
}

// ---------------------------------------------------------------------------
// Rent calculation
// ---------------------------------------------------------------------------

/**
 * Calculate rent owed when landing on sp.
 *
 * - Supply lines: tiered by how many the owner holds (max 4).
 * - Economic spaces: dice total × multiplier (1 owned → ×4, 2 → ×10).
 * - Territories: rent table indexed by building level; double base rent
 *   when owner holds the full color group (monopoly bonus).
 */
export function calculateRent(sp) {
  const owner = getOwner(sp.i);
  if (!owner) return 0;

  if (sp.type === 'supply') {
    const count = countSupplyLines(owner);
    return [0, 25, 50, 100, 200][count] ?? 0;
  }

  if (sp.type === 'economic') {
    const count = countEconomic(owner);
    const diceTotal = state.lastRoll[0] + state.lastRoll[1];
    return diceTotal * (count === 1 ? 4 : 10);
  }

  // territory
  const buildings = state.buildings[sp.i] ?? 0;
  let rent = sp.rent[buildings];
  if (buildings === 0 && ownsGroup(owner, sp.group)) rent *= 2;
  return rent;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/**
 * Return true when player is allowed to build on sp.
 *
 * Requirements:
 *   • sp is a territory owned by player
 *   • player is not in Collapse State
 *   • player holds the full color group (monopoly)
 *   • current building level < 5 (max = Army Corps)
 *   • even-build rule: no other group territory may be at a lower level
 *   • player has enough money
 */
export function canBuild(player, sp) {
  if (sp.type !== 'territory') return false;
  if (state.ownership[sp.i] !== player.id) return false;
  if (player.collapsed) return false;
  if (!ownsGroup(player, sp.group)) return false;

  const current = state.buildings[sp.i] ?? 0;
  if (current >= 5) return false;

  // even-build rule: all siblings must be at least this level before we can build here
  const siblings = BOARD.filter(s => s.type === 'territory' && s.group === sp.group);
  for (const sib of siblings) {
    if ((state.buildings[sib.i] ?? 0) < current) return false;
  }

  if (player.money < sp.buildCost) return false;
  return true;
}

export function build(spaceIndex) {
  const p = currentPlayer();
  const sp = BOARD[spaceIndex];
  if (!canBuild(p, sp)) return;
  payMoney(p, sp.buildCost);
  state.buildings[spaceIndex] = (state.buildings[spaceIndex] ?? 0) + 1;
  const lvl = state.buildings[spaceIndex];
  const label = lvl === 5 ? 'Army Corps' : `${lvl} Regiment${lvl > 1 ? 's' : ''}`;
  log(`${p.name} builds ${label} in ${sp.name}.`, 'major');
  _render();
}

// ---------------------------------------------------------------------------
// Victory
// ---------------------------------------------------------------------------

/**
 * Strategic Victory: player owns Paris AND at least 2 battle territories.
 */
export function checkStrategicVictory(player) {
  if (state.ownership[39] !== player.id) return false;
  const battleCount = BOARD
    .filter(s => s.battle)
    .filter(s => state.ownership[s.i] === player.id)
    .length;
  return battleCount >= 2;
}

export function checkVictory() {
  for (const p of state.players) {
    if (checkStrategicVictory(p)) {
      state.winner = p;
      state.winReason = 'Strategic Victory — Paris and 2+ Battle Territories';
      state.phase = 'gameOver';
      return true;
    }
  }
  if (state.round > state.maxRounds) {
    const sorted = [...state.players].sort((a, b) => netWorth(b) - netWorth(a));
    state.winner = sorted[0];
    state.winReason = 'Greatest Net Worth at game end';
    state.phase = 'gameOver';
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function startGame(playerNames) {
  state.players = playerNames.map((name, i) => ({
    id: i,
    name,
    color: PLAYER_COLORS[i].hex,
    colorName: PLAYER_COLORS[i].name,
    money: 1500,
    position: 0,
    inExile: false,
    exileTurns: 0,
    skipNext: false,
    collapsed: false,
    outOfExileCard: false,
  }));
  state.ownership = {};
  state.buildings = {};
  state.ordersDeck = shuffle([...ORDERS_CARDS]);
  state.diplomacyDeck = shuffle([...DIPLOMACY_CARDS]);
  state.phase = 'playing';
  state.current = 0;
  state.round = 1;
  state.log = [];
  state.lastRoll = [0, 0];
  state.rolledThisTurn = false;
  state.doubleCount = 0;
  state.pendingAction = null;
  state.selectedSpace = null;
  state.winner = null;
  state.winReason = '';
  log(`Campaign begins. ${state.players.length} commanders march to glory.`, 'major');
  _render();
}

// ---------------------------------------------------------------------------
// Money transfers
// ---------------------------------------------------------------------------

export function payMoney(p, amount) {
  p.money -= amount;
  updateCollapseStatus(p);
}

export function payRent(payer, receiver, amount) {
  payer.money -= amount;
  receiver.money += amount;
  updateCollapseStatus(payer);
  checkRecovery(receiver);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export function movePlayer(p, steps) {
  const oldPos = p.position;
  let newPos = (oldPos + steps) % 40;
  if (newPos < 0) newPos += 40;
  if (steps > 0 && oldPos + steps >= 40) {
    p.money += 200;
    log(`${p.name} passes Mobilization → +200₣.`, 'gain');
  }
  p.position = newPos;
  _render();
  setTimeout(() => resolveSpace(), 600);
}

export function resolveSpace() {
  const p = currentPlayer();
  const sp = spaceAt(p.position);

  switch (sp.type) {
    case 'corner':
      if (p.position === 30) {
        log(`${p.name} is exiled to Elba!`, 'loss');
        sendToExile(p);
        setTimeout(() => endTurn(), 1200);
      } else {
        log(`${p.name} arrives at ${sp.name}.`);
        setTimeout(() => endTurn(), 800);
      }
      break;

    case 'tax':
      log(`${p.name} pays ${sp.amount}₣ in ${sp.name}.`, 'loss');
      payMoney(p, sp.amount);
      setTimeout(() => endTurn(), 1000);
      break;

    case 'card':
      drawCard(sp.subtype);
      break;

    case 'territory':
    case 'supply':
    case 'economic':
      handlePropertySpace(sp);
      break;
  }
}

// ---------------------------------------------------------------------------
// Property landing
// ---------------------------------------------------------------------------

export function getFlavor(sp) {
  const flavors = {
    territory: 'A territory worth contesting.',
    supply:    'A vital line of supply.',
    economic:  'An instrument of economic war.',
  };
  return flavors[sp.type] ?? '';
}

export function handlePropertySpace(sp) {
  const p = currentPlayer();
  const owner = getOwner(sp.i);

  if (!owner) {
    if (p.collapsed) {
      log(`${p.name} cannot purchase — Collapse State.`);
      setTimeout(() => endTurn(), 1000);
      return;
    }
    state.pendingAction = { type: 'purchase', space: sp, title: sp.name, flavor: getFlavor(sp) };
    _render();
    return;
  }

  if (owner.id !== p.id) {
    const rent = calculateRent(sp);
    const finalRent = p.collapsed ? Math.floor(rent * 0.5) : rent;
    log(`${p.name} pays ${finalRent}₣ rent to ${owner.name} for ${sp.name}.`, 'loss');
    payRent(p, owner, finalRent);
    setTimeout(() => endTurn(), 1200);
    return;
  }

  log(`${p.name} rests at their own ${sp.name}.`);
  setTimeout(() => endTurn(), 800);
}

export function buyProperty(sp) {
  const p = currentPlayer();
  if (p.money < sp.price) {
    log(`${p.name} cannot afford ${sp.name}.`);
    return;
  }
  payMoney(p, sp.price);
  state.ownership[sp.i] = p.id;
  log(`${p.name} acquires ${sp.name} for ${sp.price}₣.`, 'major');
  state.pendingAction = null;
  if (checkVictory()) { _render(); return; }
  _render();
  setTimeout(() => endTurn(), 800);
}

export function declinePurchase() {
  state.pendingAction = null;
  _render();
  setTimeout(() => endTurn(), 400);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function drawCard(subtype) {
  const p = currentPlayer();
  let deck = subtype === 'orders' ? state.ordersDeck : state.diplomacyDeck;
  if (deck.length === 0) {
    const source = subtype === 'orders' ? ORDERS_CARDS : DIPLOMACY_CARDS;
    deck.push(...shuffle([...source]));
  }
  const card = deck.shift();
  if (card.action !== 'outOfExile') deck.push(card);

  state.pendingAction = {
    type: 'card',
    subtype,
    card,
    title:  subtype === 'orders' ? 'Imperial Orders' : 'Diplomatic Dispatch',
    flavor: subtype === 'orders' ? 'Sealed orders from the Emperor.' : 'A missive from the chancery.',
  };
  _render();
}

export function applyCard(card) {
  const p = currentPlayer();
  state.pendingAction = null;
  log(`${p.name}: ${card.text}`);

  switch (card.action) {
    case 'gain':
      p.money += card.amount;
      checkRecovery(p);
      log(`${p.name} gains ${card.amount}₣.`, 'gain');
      setTimeout(() => endTurn(), 800);
      break;

    case 'pay':
      payMoney(p, card.amount);
      log(`${p.name} pays ${card.amount}₣.`, 'loss');
      setTimeout(() => endTurn(), 800);
      break;

    case 'moveTo': {
      const target = card.target;
      if (card.collect && target < p.position) {
        p.money += 200;
        log(`${p.name} passes Mobilization → +200₣.`, 'gain');
      }
      p.position = target;
      _render();
      setTimeout(() => resolveSpace(), 700);
      break;
    }

    case 'moveBy':
      movePlayer(p, card.amount);
      break;

    case 'skip':
      p.skipNext = true;
      log(`${p.name} will skip next turn.`);
      setTimeout(() => endTurn(), 800);
      break;

    case 'payPerBuilding': {
      const { regiments, armyCorps } = countBuildings(p);
      const total = (regiments + armyCorps) * card.amount;
      payMoney(p, total);
      log(`${p.name} pays ${total}₣ for ${regiments + armyCorps} units.`, 'loss');
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'collectFromAll': {
      let total = 0;
      for (const other of state.players) {
        if (other.id !== p.id && !other.eliminated) {
          payMoney(other, card.amount);
          total += card.amount;
        }
      }
      p.money += total;
      checkRecovery(p);
      log(`${p.name} collects ${total}₣ in tribute.`, 'gain');
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'payAll': {
      let total = 0;
      for (const other of state.players) {
        if (other.id !== p.id && !other.eliminated) {
          other.money += card.amount;
          total += card.amount;
        }
      }
      payMoney(p, total);
      log(`${p.name} pays ${total}₣ to rivals.`, 'loss');
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'gainPerSupply': {
      const supplies = countSupplyLines(p);
      const total = supplies * card.amount;
      p.money += total;
      checkRecovery(p);
      log(`${p.name} gains ${total}₣ from ${supplies} supply lines.`, 'gain');
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'outOfExile':
      p.outOfExileCard = true;
      log(`${p.name} keeps the "Get out of Exile" card.`, 'major');
      setTimeout(() => endTurn(), 800);
      break;

    case 'goToExile':
      sendToExile(p);
      setTimeout(() => endTurn(), 1000);
      break;
  }
}

// ---------------------------------------------------------------------------
// Exile
// ---------------------------------------------------------------------------

export function sendToExile(p) {
  p.inExile = true;
  p.exileTurns = 0;
  p.position = 10;
  log(`${p.name} is sent to Elba.`, 'loss');
  state.doubleCount = 0;
}

export function handleExileTurn() {
  const p = currentPlayer();
  const baseOptions = [
    { label: 'Roll for Doubles', action: () => exileDiceRoll() },
    { label: 'Pay 50₣',          action: () => exilePay() },
  ];

  if (p.outOfExileCard) {
    state.pendingAction = {
      type: 'exileChoice',
      title: 'Exile on Elba',
      message: `${p.name} languishes on Elba. Use your "Get Out of Exile" card?`,
      options: [
        {
          label: 'Use Card (Free)',
          action: () => {
            p.inExile = false;
            p.exileTurns = 0;
            p.outOfExileCard = false;
            log(`${p.name} uses card to escape Exile.`, 'major');
            state.pendingAction = null;
            rollDice();
          },
        },
        ...baseOptions,
      ],
    };
  } else {
    state.pendingAction = {
      type: 'exileChoice',
      title: 'Exile on Elba',
      message: `${p.name} is exiled. Choose your escape (Turn ${p.exileTurns + 1}/3):`,
      options: baseOptions,
    };
  }
  _render();
}

export function exileDiceRoll() {
  const p = currentPlayer();
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.lastRoll = [d1, d2];
  state.rolledThisTurn = true;
  state.pendingAction = null;

  if (d1 === d2) {
    p.inExile = false;
    p.exileTurns = 0;
    log(`${p.name} rolls doubles (${d1}+${d2}) and escapes Exile!`, 'major');
    movePlayer(p, d1 + d2);
  } else {
    p.exileTurns++;
    log(`${p.name} rolls ${d1}+${d2}, no escape.`);
    if (p.exileTurns >= 3) {
      log(`${p.name} must pay 50₣ after 3 failed attempts.`, 'loss');
      payMoney(p, 50);
      p.inExile = false;
      p.exileTurns = 0;
      movePlayer(p, d1 + d2);
    } else {
      _render();
      setTimeout(() => endTurn(), 1200);
    }
  }
}

export function exilePay() {
  const p = currentPlayer();
  if (p.money < 50 && !p.collapsed) {
    log(`${p.name} cannot afford to pay for release.`, 'loss');
    state.pendingAction = null;
    _render();
    setTimeout(() => endTurn(), 1000);
    return;
  }
  payMoney(p, 50);
  p.inExile = false;
  p.exileTurns = 0;
  log(`${p.name} pays 50₣ for release from Exile.`);
  state.pendingAction = null;
  rollDice();
}

// ---------------------------------------------------------------------------
// Main turn
// ---------------------------------------------------------------------------

export function rollDice() {
  if (state.rolledThisTurn && state.lastRoll[0] !== state.lastRoll[1]) return;
  const p = currentPlayer();

  if (p.skipNext) {
    p.skipNext = false;
    log(`${p.name} skips their turn (winter quarters).`);
    state.pendingAction = null;
    endTurn();
    return;
  }

  if (p.inExile) {
    handleExileTurn();
    return;
  }

  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.lastRoll = [d1, d2];
  state.rolledThisTurn = true;

  if (d1 === d2) {
    state.doubleCount++;
    if (state.doubleCount >= 3) {
      log(`${p.name} rolled three doubles — straight to Exile!`, 'loss');
      sendToExile(p);
      state.doubleCount = 0;
      _render();
      setTimeout(() => endTurn(), 1500);
      return;
    }
    log(`${p.name} rolls ${d1}+${d2} (doubles!) → moves ${d1 + d2}.`);
  } else {
    state.doubleCount = 0;
    log(`${p.name} rolls ${d1}+${d2} → moves ${d1 + d2}.`);
  }

  movePlayer(p, d1 + d2);
}

export function endTurn() {
  if (state.phase === 'gameOver') return;
  const p = currentPlayer();

  // doubles: same player rolls again (unless just sent to exile)
  if (state.lastRoll[0] === state.lastRoll[1] && !p.inExile && state.rolledThisTurn && !p.skipNext) {
    state.rolledThisTurn = false;
    log(`${p.name} rolled doubles — another turn!`);
    _render();
    return;
  }

  state.rolledThisTurn = false;
  state.lastRoll = [0, 0];
  state.doubleCount = 0;
  state.current = (state.current + 1) % state.players.length;

  if (state.current === 0) {
    state.round++;
    log(`──── Round ${state.round} ────`, 'major');
  }

  if (checkVictory()) { _render(); return; }
  _render();
}

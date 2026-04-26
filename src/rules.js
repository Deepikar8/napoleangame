// ============================================================
//  RULES — All game logic and turn actions
// ============================================================

import { state, PLAYER_COLORS, shuffle, log, currentPlayer, saveGame, clearSave } from './state.js';
import { BOARD, spaceAt, playerAt } from './board.js';
import { ORDERS_CARDS, DIPLOMACY_CARDS } from './cards.js';
import { emit, emitGlobal } from './events.js';

// ---------------------------------------------------------------------------
// Renderer injection
// render.js calls registerRenderer(render) once at boot so that rule
// functions can trigger UI updates without importing render.js (which would
// create a circular ESM dependency and break Node.js test imports).
// ---------------------------------------------------------------------------
let _render = () => {};
export function registerRenderer(fn) { _render = fn; }

// ---------------------------------------------------------------------------
// Dice animator injection
// render.js calls registerDiceAnimator(animateDiceRoll) once at boot.
// The no-op default fires callback() synchronously so tests work without DOM.
// ---------------------------------------------------------------------------
let _animateDice = (values, cb) => cb();
export function registerDiceAnimator(fn) { _animateDice = fn; }

// ---------------------------------------------------------------------------
// Move animator injection
// render.js calls registerMoveAnimator(animateMove) once at boot.
// Default: synchronous teleport — sets position and calls onSettled() immediately
// so tests work without DOM or timers.
// Signature: fn(player, fromPos, steps, onSettled)
// The animator is responsible for updating player.position before calling onSettled.
// ---------------------------------------------------------------------------
let _animateMove = (p, from, steps, onSettled) => {
  let pos = (from + steps) % 40;
  if (pos < 0) pos += 40;
  p.position = pos;
  onSettled();
};
export function registerMoveAnimator(fn) { _animateMove = fn; }

// ---------------------------------------------------------------------------
// Anti-repeat die roll
// Re-rolls once if the same face appears as lastValue, reducing the probability
// of an identical back-to-back result from 1/6 to ~1/36.
// Pass lastValue=0 (or omit) to disable bias (0 can never be a valid result).
// ---------------------------------------------------------------------------
export function rollDie(lastValue = 0) {
  let val = 1 + Math.floor(Math.random() * 6);
  if (val === lastValue) val = 1 + Math.floor(Math.random() * 6);
  return val;
}

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
    emit({ type: 'collapse_entered', playerId: player.id });
  }
}

export function checkRecovery(player) {
  if (player.collapsed && player.money > 200) {
    player.collapsed = false;
    log(`${player.name} recovers from Collapse State.`, 'major');
    emit({ type: 'collapse_recovered', playerId: player.id });
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
 *
 * Commander modifier stacking order for territory rent:
 *   1. base rent from table
 *   2. monopoly bonus (×2 when buildings=0 and full group)
 *   3. Davout — Iron Discipline: owner applies ×1.25
 *   4. Wellington — Defensive Genius: payer applies ×0.75
 *
 * @param {object} sp      - board space
 * @param {object|null} payer - the player paying rent (null = skip Wellington check)
 */
export function calculateRent(sp, payer = null) {
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

  // Davout: Iron Discipline — territory rent raised 25% for all rivals
  if (owner.commander?.ability === 'ironDiscipline') {
    rent = Math.ceil(rent * 1.25);
  }
  // Wellington: Defensive Genius — payer saves 25% on territory rent (applied after Davout)
  if (payer && payer.id !== owner.id && payer.commander?.ability === 'defensiveGenius') {
    rent = Math.floor(rent * 0.75);
  }

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
  const levelName = lvl === 5 ? 'Army Corps' : `Regiment ${lvl}`;
  const label     = lvl === 5 ? 'Army Corps' : `${lvl} Regiment${lvl > 1 ? 's' : ''}`;
  log(`${p.name} builds ${label} in ${sp.name}.`, 'major');
  emit({ type: 'building_built', spaceIndex, spaceName: sp.name, level: lvl, levelName, cost: sp.buildCost, isArmyCorps: lvl === 5 });
  emit({ type: 'loss', amount: sp.buildCost, source: 'building' });
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
      emit({ type: 'game_won', winnerId: p.id, winnerName: p.name, winType: 'strategic', round: state.round, playerId: p.id });
      state.winner = p;
      state.winReason = 'Strategic Victory — Paris and 2+ Battle Territories';
      state.phase = 'gameOver';
      return true;
    }
  }
  if (state.round > state.maxRounds) {
    const sorted = [...state.players].sort((a, b) => netWorth(b) - netWorth(a));
    const winner = sorted[0];
    emit({ type: 'game_won', winnerId: winner.id, winnerName: winner.name, winType: 'highest_net_worth', round: state.round, playerId: winner.id });
    state.winner = winner;
    state.winReason = 'Greatest Net Worth at game end';
    state.phase = 'gameOver';
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * @param {Array<{name: string, commander: object}>} playerSetups
 */
export function startGame(playerSetups) {
  clearSave(); // new campaign always wipes any existing save
  state.players = playerSetups.map(({ name, commander }, i) => ({
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
    eliminated: false,
    outOfExileCard: false,
    commander,   // full commander object — keeps lookups simple
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
  state.expandedPlayer = null;
  state.holdingsExpanded = {};
  state.winner = null;
  state.winReason = '';
  state.currentTurnEvents = [];
  state.gameEvents = [];
  state.diceRolling = false;
  state.lastDiceRolled = [0, 0];
  state.pendingTurnSummary = null;
  log(`Campaign begins. ${state.players.length} commanders march to glory.`, 'major');
  emit({ type: 'turn_started', playerId: state.players[0].id, playerName: state.players[0].name, isExileTurn: false });
  _render();
}

// ---------------------------------------------------------------------------
// Money transfers
// ---------------------------------------------------------------------------

export function payMoney(p, amount) {
  // Try to raise funds via liquidation before the debit
  if (p.money < amount) forcedLiquidate(p, amount);
  p.money -= amount; // may still go negative if liquidation didn't fully cover
  updateCollapseStatus(p);
  // Elimination only triggered by payRent (can't-pay-opponent scenario)
}

/**
 * Eliminate a player: mark them out, return all their property to the bank.
 */
export function eliminatePlayer(p) {
  p.eliminated = true;
  for (const idx of Object.keys(state.ownership)) {
    if (state.ownership[idx] === p.id) {
      delete state.ownership[idx];
      delete state.buildings[idx];
    }
  }
  emit({ type: 'player_eliminated', playerId: p.id, playerName: p.name });
  log(`${p.name} is eliminated from the campaign.`, 'loss');
}

/**
 * Sell buildings first (all levels at once per property, 50% of buildCost × level),
 * then sell cheapest properties first (50% of price), until the player can cover
 * `targetAmount` or runs out of assets entirely.
 */
export function forcedLiquidate(player, targetAmount) {
  // 1. Sell all buildings on owned properties
  for (const idx of Object.keys(state.buildings)) {
    if (state.ownership[idx] !== player.id) continue;
    const sp = BOARD[+idx];
    const lvl = state.buildings[idx];
    const proceeds = Math.floor(sp.buildCost * lvl * 0.5);
    player.money += proceeds;
    delete state.buildings[idx];
    log(`${player.name} liquidates buildings at ${sp.name} for ${proceeds}₣.`, 'loss');
    if (player.money >= targetAmount) return;
  }

  // 2. Sell properties cheapest-first
  const owned = Object.keys(state.ownership)
    .filter(idx => state.ownership[idx] === player.id)
    .map(idx => ({ idx, sp: BOARD[+idx] }))
    .sort((a, b) => (a.sp.price ?? 0) - (b.sp.price ?? 0));

  for (const { idx, sp } of owned) {
    const proceeds = Math.floor((sp.price ?? 0) * 0.5);
    player.money += proceeds;
    delete state.ownership[idx];
    log(`${player.name} mortgages ${sp.name} for ${proceeds}₣.`, 'loss');
    if (player.money >= targetAmount) return;
  }
}

export function payRent(payer, receiver, amount) {
  if (payer.money < amount) {
    log(`${payer.name} cannot cover ${amount}₣ rent — forced liquidation!`, 'loss');
    forcedLiquidate(payer, amount);
  }
  const actualPay = Math.max(0, Math.min(payer.money, amount));
  payer.money -= actualPay;
  receiver.money += actualPay;
  if (actualPay < amount) {
    log(`${payer.name} paid only ${actualPay}₣ of ${amount}₣ — stripped bare.`, 'loss');
  }
  updateCollapseStatus(payer);
  checkRecovery(receiver);
  // Eliminate if bankrupt with no assets remaining
  const hasAssets = Object.values(state.ownership).some(id => id === payer.id);
  if (payer.money <= 0 && !hasAssets && !payer.eliminated) eliminatePlayer(payer);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

export function movePlayer(p, steps) {
  const oldPos = p.position;
  _animateMove(p, oldPos, steps, () => {
    const dest = spaceAt(p.position);
    emit({ type: 'move', from: oldPos, to: p.position, spaceName: dest.name, spaceType: dest.type });
    if (steps > 0 && oldPos + steps >= 40) {
      p.money += 200;
      log(`${p.name} passes Mobilization → +200₣.`, 'gain');
      emit({ type: 'pass_mobilization', amount: 200 });
      emit({ type: 'gain', amount: 200, source: 'mobilization' });
    }
    _render();
    setTimeout(() => resolveSpace(), 500);
  });
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
      emit({ type: 'tax_paid', spaceName: sp.name, amount: sp.amount });
      emit({ type: 'loss', amount: sp.amount, source: 'tax' });
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
  if (sp.flavor) return sp.flavor;
  const fallbacks = {
    territory: 'A territory worth contesting.',
    supply:    'A vital line of supply.',
    economic:  'An instrument of economic war.',
  };
  return fallbacks[sp.type] ?? '';
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
    // calculateRent handles Davout (+25%) and Wellington (−25%) internally
    const rent = calculateRent(sp, p);

    // Emit commander ability events BEFORE the rent transaction
    if (sp.type === 'territory') {
      if (owner.commander?.ability === 'ironDiscipline') {
        log(`${owner.name}'s Iron Discipline — rent elevated by 25%.`, 'major');
        emit({ type: 'commander_ability', commanderId: 'davout', abilityName: 'Iron Discipline', amount: null, target: 'rent_increase', context: { spaceName: sp.name, adjustedRent: rent } });
      }
      if (p.commander?.ability === 'defensiveGenius') {
        log(`${p.name}'s Defensive Genius — rent reduced by 25%.`, 'major');
        emit({ type: 'commander_ability', commanderId: 'wellington', abilityName: 'Defensive Genius', amount: null, target: 'rent_reduction', context: { spaceName: sp.name, adjustedRent: rent } });
      }
    }

    const finalRent = p.collapsed ? Math.floor(rent * 0.5) : rent;
    log(`${p.name} pays ${finalRent}₣ rent to ${owner.name} for ${sp.name}.`, 'loss');

    // Emit rent events before money moves
    emit({ type: 'rent_paid', spaceIndex: sp.i, spaceName: sp.name, amount: finalRent, paidTo: owner.id, paidToName: owner.name });
    emitGlobal({ type: 'rent_received', spaceIndex: sp.i, spaceName: sp.name, amount: finalRent, paidBy: p.id, paidByName: p.name, playerId: owner.id });

    payRent(p, owner, finalRent);

    // Alexander: Scorched Earth — additional 100₣ from the bank when a rival
    // lands on any Green (Russian) territory the Tsar owns.
    if (sp.type === 'territory' && sp.group === 'Green' &&
        owner.commander?.ability === 'scorchedEarth') {
      emit({ type: 'commander_ability', commanderId: 'alexander', abilityName: 'Scorched Earth', amount: 100, target: 'bank_bonus', context: { spaceName: sp.name }, playerId: owner.id });
      owner.money += 100;
      checkRecovery(owner);
      log(`${owner.name}'s Scorched Earth! Mother Russia claims her toll — +100₣ from the bank.`, 'gain');
      emitGlobal({ type: 'gain', amount: 100, source: 'commander_ability', playerId: owner.id });
    }

    setTimeout(() => endTurn(), 1200);
    return;
  }

  log(`${p.name} rests at their own ${sp.name}.`);
  setTimeout(() => endTurn(), 800);
}

export function buyProperty(sp, price = null, buyer = null) {
  const p = buyer ?? currentPlayer();
  const actualPrice = price ?? sp.price;
  if (p.money < actualPrice) {
    log(`${p.name} cannot afford ${sp.name}.`);
    return;
  }
  payMoney(p, actualPrice);
  state.ownership[sp.i] = p.id;
  log(`${p.name} acquires ${sp.name} for ${actualPrice}₣.`, 'major');
  emit({ type: 'purchase', spaceIndex: sp.i, spaceName: sp.name, spaceType: sp.type, price: actualPrice, ...(sp.group ? { group: sp.group } : {}) });

  // Napoleon: Eagle of Victory — +50₣ when capturing a Battle Territory
  if (sp.battle && p.commander?.ability === 'eagleOfVictory') {
    emit({ type: 'commander_ability', commanderId: 'napoleon', abilityName: 'Eagle of Victory', amount: 50, target: 'battle_bonus', context: { spaceName: sp.name } });
    p.money += 50;
    log(`${p.name}'s Eagle of Victory! The sun of Austerlitz shines — +50₣.`, 'gain');
    emit({ type: 'gain', amount: 50, source: 'commander_ability' });
  }

  state.pendingAction = null;
  if (checkVictory()) { _render(); return; }
  saveGame();
  _render();
  setTimeout(() => endTurn(), 800);
}

export function declinePurchase() {
  const sp = state.pendingAction?.space;
  if (!sp) { state.pendingAction = null; _render(); return; }
  emit({ type: 'purchase_declined', spaceIndex: sp.i, spaceName: sp.name, price: sp.price });
  state.pendingAction = null;

  // Build the bidder queue: all non-eliminated, non-declining players in turn order
  // starting from the player after the decliner
  const decliningId = currentPlayer().id;
  const nPlayers = state.players.length;
  const declinerIdx = state.current;
  const queue = [];
  for (let offset = 1; offset < nPlayers; offset++) {
    const candidate = state.players[(declinerIdx + offset) % nPlayers];
    if (!candidate.eliminated) queue.push(candidate);
  }

  if (queue.length === 0) {
    // No other players — property stays unowned
    _render();
    setTimeout(() => endTurn(), 400);
    return;
  }

  const minBid = Math.floor(sp.price / 2);
  state.pendingAction = {
    type: 'auction',
    title: 'Open Auction',
    flavor: 'Going once… going twice…',
    space: sp,
    decliningPlayerId: decliningId,
    bids: {},
    passedPlayers: [],
    bidderQueue: queue.slice(),   // remaining bidders
    minBid,
    currentHighest: 0,
    highestBidderId: null,
  };
  log(`Auction opened for ${sp.name} — minimum bid ₣${minBid}.`);
  emit({ type: 'auction_started', spaceIndex: sp.i, spaceName: sp.name, minBid });
  _render();
}

// Advance auction to the next bidder; resolve if queue is exhausted.
function _advanceAuction() {
  const a = state.pendingAction;
  if (!a || a.type !== 'auction') return;

  a.bidderQueue.shift(); // remove the player who just acted

  // Skip eliminated players who may have joined the queue while auction was open
  while (a.bidderQueue.length > 0 && a.bidderQueue[0].eliminated) {
    a.bidderQueue.shift();
  }

  if (a.bidderQueue.length === 0) {
    // Auction over
    if (a.highestBidderId !== null) {
      const winner = state.players.find(pl => pl.id === a.highestBidderId);
      const sp = a.space;
      const bid = a.bids[a.highestBidderId];
      emit({ type: 'auction_won', spaceIndex: sp.i, spaceName: sp.name, winnerId: winner.id, winnerName: winner.name, price: bid });
      log(`${winner.name} wins the auction for ${sp.name} at ₣${bid}!`, 'major');
      state.pendingAction = null;
      buyProperty(sp, bid, winner);
      // buyProperty calls endTurn internally — state.current (the decliner) will advance normally
    } else {
      // All passed — property stays unowned
      emit({ type: 'auction_ended', result: 'no_bids' });
      log(`No bids — ${a.space.name} remains uncontested.`);
      state.pendingAction = null;
      _render();
      setTimeout(() => endTurn(), 400);
    }
    return;
  }

  _render();
}

export function placeBid(amount) {
  const a = state.pendingAction;
  if (!a || a.type !== 'auction') return;
  const bidder = a.bidderQueue[0];
  if (!bidder) return;

  const clampedAmount = Math.max(amount, a.minBid);
  if (bidder.money < clampedAmount) {
    log(`${bidder.name} cannot afford to bid ₣${clampedAmount}.`);
    return;
  }

  a.bids[bidder.id] = clampedAmount;
  a.currentHighest = clampedAmount;
  a.highestBidderId = bidder.id;
  log(`${bidder.name} bids ₣${clampedAmount} for ${a.space.name}.`);
  emit({ type: 'auction_bid', spaceIndex: a.space.i, spaceName: a.space.name, bidderId: bidder.id, bidderName: bidder.name, amount: clampedAmount });
  _advanceAuction();
}

export function passAuction() {
  const a = state.pendingAction;
  if (!a || a.type !== 'auction') return;
  const bidder = a.bidderQueue[0];
  if (!bidder) return;

  a.passedPlayers.push(bidder.id);
  log(`${bidder.name} passes on ${a.space.name}.`);
  emit({ type: 'auction_pass', spaceIndex: a.space.i, spaceName: a.space.name, bidderId: bidder.id, bidderName: bidder.name });
  _advanceAuction();
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

  emit({ type: 'card_drawn', subtype, cardText: card.text, cardAction: card.action });

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
  emit({ type: 'card_effect', description: card.text, amount: card.amount ?? null, action: card.action });

  switch (card.action) {
    case 'gain':
      p.money += card.amount;
      checkRecovery(p);
      log(`${p.name} gains ${card.amount}₣.`, 'gain');
      emit({ type: 'gain', amount: card.amount, source: 'card' });
      setTimeout(() => endTurn(), 800);
      break;

    case 'pay':
      payMoney(p, card.amount);
      log(`${p.name} pays ${card.amount}₣.`, 'loss');
      emit({ type: 'loss', amount: card.amount, source: 'card' });
      setTimeout(() => endTurn(), 800);
      break;

    case 'moveTo': {
      const target = card.target;
      const from   = p.position;
      // Always move forward; wrapping naturally triggers mobilization in movePlayer
      const steps  = target >= from ? target - from : (40 - from) + target;
      movePlayer(p, steps);
      break;
    }

    case 'moveBy':
      // movePlayer emits 'move' (and possibly 'pass_mobilization') internally
      movePlayer(p, card.amount);
      break;

    case 'skip':
      p.skipNext = true;
      log(`${p.name} will skip next turn.`);
      emit({ type: 'turn_skipped', reason: 'card' });
      setTimeout(() => endTurn(), 800);
      break;

    case 'payPerBuilding': {
      const { regiments, armyCorps } = countBuildings(p);
      const total = (regiments + armyCorps) * card.amount;
      payMoney(p, total);
      log(`${p.name} pays ${total}₣ for ${regiments + armyCorps} units.`, 'loss');
      emit({ type: 'loss', amount: total, source: 'card' });
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
      emit({ type: 'gain', amount: total, source: 'card_collect_all' });
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'payAll': {
      let total = 0;
      for (const other of state.players) {
        if (other.id !== p.id && !other.eliminated) {
          other.money += card.amount;
          checkRecovery(other);
          total += card.amount;
        }
      }
      payMoney(p, total);
      log(`${p.name} pays ${total}₣ to rivals.`, 'loss');
      emit({ type: 'loss', amount: total, source: 'card_pay_all' });
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'gainPerSupply': {
      const supplies = countSupplyLines(p);
      const total = supplies * card.amount;
      p.money += total;
      checkRecovery(p);
      log(`${p.name} gains ${total}₣ from ${supplies} supply lines.`, 'gain');
      emit({ type: 'gain', amount: total, source: 'card' });
      setTimeout(() => endTurn(), 800);
      break;
    }

    case 'outOfExile':
      p.outOfExileCard = true;
      log(`${p.name} keeps the "Get out of Exile" card.`, 'major');
      setTimeout(() => endTurn(), 800);
      break;

    case 'goToExile':
      sendToExile(p, 'card', card.text);
      setTimeout(() => endTurn(), 1000);
      break;
  }
}

// ---------------------------------------------------------------------------
// Exile
// ---------------------------------------------------------------------------

export function sendToExile(p, reason = 'corner_landing', cardText = null) {
  // Ney: Rearguard Action — roll 1d6 before exile; on 5 or 6 hold the line
  if (p.commander?.ability === 'rearguardAction') {
    const roll = 1 + Math.floor(Math.random() * 6);
    emit({ type: 'commander_ability', commanderId: 'ney', abilityName: 'Rearguard Action', amount: null, target: 'exile_prevention', context: { roll, success: roll >= 5 } });
    if (roll >= 5) {
      log(`${p.name}'s Rearguard Action! Rolls ${roll} — holds the line, exile averted!`, 'major');
      state.doubleCount = 0; // consume the exile trigger
      return; // do NOT exile
    }
    log(`${p.name}'s Rearguard Action! Rolls ${roll} — the rearguard is overrun.`, 'loss');
  }

  emit({ type: 'sent_to_exile', reason, cardText });
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
            emit({ type: 'exile_attempt', method: 'card', success: true, dice: null });
            emit({ type: 'escaped_exile', method: 'card' });
            state.pendingAction = null;
            // Blücher: Vorwärts! — march immediately on escape
            if (p.commander?.ability === 'vorwarts') {
              emit({ type: 'commander_ability', commanderId: 'blucher', abilityName: 'Vorwärts!', amount: null, target: 'immediate_move', context: { method: 'card' } });
              log(`${p.name}'s Vorwärts! — Blücher marches at once!`, 'major');
              rollDice();
            } else {
              endTurn();
            }
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
  state.pendingAction = null;
  state.diceRolling = true;
  _render(); // disable Roll button immediately

  _animateDice([d1, d2], () => {
    state.diceRolling = false;
    state.lastRoll = [d1, d2];
    state.rolledThisTurn = true;

    if (d1 === d2) {
      p.inExile = false;
      p.exileTurns = 0;
      log(`${p.name} rolls doubles (${d1}+${d2}) and escapes Exile!`, 'major');
      emit({ type: 'exile_attempt', method: 'doubles', success: true, dice: [d1, d2] });
      emit({ type: 'escaped_exile', method: 'doubles' });
      movePlayer(p, d1 + d2);
    } else {
      p.exileTurns++;
      log(`${p.name} rolls ${d1}+${d2}, no escape.`);
      emit({ type: 'exile_attempt', method: 'doubles', success: false, dice: [d1, d2], exileTurns: p.exileTurns });
      if (p.exileTurns >= 3) {
        log(`${p.name} must pay 50₣ after 3 failed attempts.`, 'loss');
        payMoney(p, 50);
        emit({ type: 'loss', amount: 50, source: 'exile_pay' });
        p.inExile = false;
        p.exileTurns = 0;
        emit({ type: 'escaped_exile', method: 'pay' });
        movePlayer(p, d1 + d2);
      } else {
        _render();
        setTimeout(() => endTurn(), 1200);
      }
    }
  });
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
  emit({ type: 'loss', amount: 50, source: 'exile_pay' });
  p.inExile = false;
  p.exileTurns = 0;
  log(`${p.name} pays 50₣ for release from Exile.`);
  emit({ type: 'exile_attempt', method: 'pay', success: true, dice: null });
  emit({ type: 'escaped_exile', method: 'pay' });
  state.pendingAction = null;
  // Blücher: Vorwärts! — march immediately; all others wait for their next turn
  if (p.commander?.ability === 'vorwarts') {
    emit({ type: 'commander_ability', commanderId: 'blucher', abilityName: 'Vorwärts!', amount: null, target: 'immediate_move', context: { method: 'pay' } });
    log(`${p.name}'s Vorwärts! — Blücher marches at once!`, 'major');
    rollDice();
  } else {
    endTurn();
  }
}

// ---------------------------------------------------------------------------
// Main turn
// ---------------------------------------------------------------------------

export function rollDice() {
  if (state.rolledThisTurn && state.lastRoll[0] !== state.lastRoll[1]) return;
  if (state.diceRolling) return;
  const p = currentPlayer();

  if (p.skipNext) {
    p.skipNext = false;
    log(`${p.name} skips their turn (winter quarters).`);
    emit({ type: 'turn_skipped', reason: 'winter_quarters' });
    state.pendingAction = null;
    endTurn();
    return;
  }

  if (p.inExile) {
    handleExileTurn();
    return;
  }

  // Pre-calculate final values; anti-repeat bias uses last rolled dice (not lastRoll,
  // which is reset to [0,0] on endTurn and used for the doubles check there).
  const d1 = rollDie(state.lastDiceRolled[0]);
  const d2 = rollDie(state.lastDiceRolled[1]);

  state.diceRolling = true;
  _render(); // disable Roll button immediately

  _animateDice([d1, d2], () => {
    state.diceRolling = false;
    state.lastDiceRolled = [d1, d2];
    state.lastRoll = [d1, d2];
    state.rolledThisTurn = true;

    emit({ type: 'roll', dice: [d1, d2], total: d1 + d2, isDoubles: d1 === d2 });

    if (d1 === d2) {
      state.doubleCount++;
      if (state.doubleCount >= 3) {
        // Third consecutive double → exile. Murat does NOT collect on this roll.
        log(`${p.name} rolled three doubles — straight to Exile!`, 'loss');
        sendToExile(p, 'three_doubles');
        state.doubleCount = 0;
        _render();
        setTimeout(() => endTurn(), 1500);
        return;
      }
      // Murat: Cavalry Charge — +75₣ on doubles 1 and 2
      if (p.commander?.ability === 'cavalryCharge') {
        emit({ type: 'commander_ability', commanderId: 'murat', abilityName: 'Cavalry Charge', amount: 75, target: 'doubles_bonus', context: { doubleCount: state.doubleCount, dice: [d1, d2] } });
        p.money += 75;
        checkRecovery(p);
        log(`${p.name}'s Cavalry Charge! Murat leads from the front — +75₣.`, 'gain');
        emit({ type: 'gain', amount: 75, source: 'commander_ability' });
      }
      log(`${p.name} rolls ${d1}+${d2} (doubles!) → moves ${d1 + d2}.`);
    } else {
      state.doubleCount = 0;
      log(`${p.name} rolls ${d1}+${d2} → moves ${d1 + d2}.`);
    }

    movePlayer(p, d1 + d2);
  });
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

  emit({ type: 'turn_ended' });

  // Capture turn summary BEFORE clearing currentTurnEvents.
  // Trivial turns (only lifecycle bookkeeping) are skipped; all others queue a summary.
  const LIFECYCLE = new Set(['turn_started', 'turn_ended', 'round_started']);
  const summaryEvents = [...state.currentTurnEvents];
  const hasConsequential = summaryEvents.some(e => !LIFECYCLE.has(e.type));
  const turnNumber = (state.round - 1) * state.players.length + state.current + 1;

  state.rolledThisTurn = false;
  state.lastRoll = [0, 0];
  state.doubleCount = 0;
  state.currentTurnEvents = [];            // clear AFTER turn_ended, BEFORE advancing
  state.current = (state.current + 1) % state.players.length;
  state.holdingsExpanded = {};

  // Skip eliminated players
  let skipGuard = 0;
  while (state.players[state.current]?.eliminated && skipGuard++ < state.players.length) {
    state.current = (state.current + 1) % state.players.length;
  }

  // Last commander standing
  const activePlayers = state.players.filter(pl => !pl.eliminated);
  if (activePlayers.length === 1) {
    state.winner    = activePlayers[0];
    state.winReason = 'Last Commander Standing';
    state.phase     = 'gameOver';
    emit({ type: 'game_won', winnerId: state.winner.id, winnerName: state.winner.name, winType: 'last_standing', round: state.round, playerId: state.winner.id });
    _render();
    return;
  }

  if (state.current === 0) {
    state.round++;
    log(`──── Round ${state.round} ────`, 'major');
    emit({ type: 'round_started', round: state.round });
  }

  const next = state.players[state.current];
  emit({ type: 'turn_started', playerId: next.id, playerName: next.name, isExileTurn: next.inExile ?? false });

  if (checkVictory()) { _render(); return; } // game over — skip summary

  // Queue summary for render() to display (or auto-clear if settings off)
  if (hasConsequential) {
    state.pendingTurnSummary = {
      events: summaryEvents,
      playerId: p.id,
      playerName: p.name,
      playerColor: p.color,
      commanderName: p.commander?.name ?? null,
      commanderTitle: p.commander?.title ?? null,
      moneyAfter: p.money,
      turnNumber,
    };
  }

  saveGame();
  _render();
}

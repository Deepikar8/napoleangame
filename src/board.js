// ============================================================
//  BOARD — Board definition and spatial query helpers
// ============================================================

import { state } from './state.js';

// Position 0 = Mobilization (start, bottom-right corner).
// Spaces proceed counter-clockwise: bottom row → left column →
// top row → right column, matching the classic Monopoly layout.
export const BOARD = [
  { i:  0, type: 'corner',    name: 'Mobilization',           icon: '⚜',  label: 'Mobilization' },
  { i:  1, type: 'territory', name: 'Toulon',      group: 'Brown',     price:  60, rent: [2,  10,  30,  90,  160,  250], buildCost:  50 },
  { i:  2, type: 'card',      subtype: 'orders',   name: 'Orders' },
  { i:  3, type: 'territory', name: 'Marengo',     group: 'Brown',     price:  60, rent: [4,  20,  60, 180,  320,  450], buildCost:  50 },
  { i:  4, type: 'tax',       name: 'War Contributions',       amount: 200 },
  { i:  5, type: 'supply',    name: 'North Supply Line',       price: 200 },
  { i:  6, type: 'territory', name: 'Milan',       group: 'LightBlue', price: 100, rent: [6,  30,  90, 270,  400,  550], buildCost:  50 },
  { i:  7, type: 'card',      subtype: 'diplomacy',name: 'Diplomacy' },
  { i:  8, type: 'territory', name: 'Venice',      group: 'LightBlue', price: 100, rent: [6,  30,  90, 270,  400,  550], buildCost:  50 },
  { i:  9, type: 'territory', name: 'Rome',        group: 'LightBlue', price: 120, rent: [8,  40, 100, 300,  450,  600], buildCost:  50 },
  { i: 10, type: 'corner',    name: 'Exile to Elba (Visiting)',icon: '⚓', label: 'Exile' },
  { i: 11, type: 'territory', name: 'Berlin',      group: 'Pink',      price: 140, rent: [10, 50, 150, 450,  625,  750], buildCost: 100 },
  { i: 12, type: 'economic',  name: 'Continental System',      price: 150 },
  { i: 13, type: 'territory', name: 'Hamburg',     group: 'Pink',      price: 140, rent: [10, 50, 150, 450,  625,  750], buildCost: 100 },
  { i: 14, type: 'territory', name: 'Frankfurt',   group: 'Pink',      price: 160, rent: [12, 60, 180, 500,  700,  900], buildCost: 100 },
  { i: 15, type: 'supply',    name: 'East Supply Line',        price: 200 },
  { i: 16, type: 'territory', name: 'Vienna',      group: 'Orange',    price: 180, rent: [14, 70, 200, 550,  750,  950], buildCost: 100 },
  { i: 17, type: 'card',      subtype: 'orders',   name: 'Orders' },
  { i: 18, type: 'territory', name: 'Prague',      group: 'Orange',    price: 180, rent: [14, 70, 200, 550,  750,  950], buildCost: 100 },
  { i: 19, type: 'territory', name: 'Munich',      group: 'Orange',    price: 200, rent: [16, 80, 220, 600,  800, 1000], buildCost: 100 },
  { i: 20, type: 'corner',    name: 'Congress of Vienna',      icon: '🏛', label: 'Free Parley' },
  { i: 21, type: 'territory', name: 'Austerlitz',  group: 'Red',       price: 220, rent: [18, 90, 250, 700,  875, 1050], buildCost: 150, battle: true },
  { i: 22, type: 'card',      subtype: 'diplomacy',name: 'Diplomacy' },
  { i: 23, type: 'territory', name: 'Jena-Auerstedt', group: 'Red',    price: 220, rent: [18, 90, 250, 700,  875, 1050], buildCost: 150, battle: true },
  { i: 24, type: 'territory', name: 'Wagram',      group: 'Red',       price: 240, rent: [20,100, 300, 750,  925, 1100], buildCost: 150, battle: true },
  { i: 25, type: 'supply',    name: 'South Supply Line',       price: 200 },
  { i: 26, type: 'territory', name: 'Madrid',      group: 'Yellow',    price: 260, rent: [22,110, 330, 800,  975, 1150], buildCost: 150 },
  { i: 27, type: 'territory', name: 'Saragossa',   group: 'Yellow',    price: 260, rent: [22,110, 330, 800,  975, 1150], buildCost: 150 },
  { i: 28, type: 'economic',  name: 'Naval Blockade',          price: 150 },
  { i: 29, type: 'territory', name: 'Cadiz',       group: 'Yellow',    price: 280, rent: [24,120, 360, 850, 1025, 1200], buildCost: 150 },
  { i: 30, type: 'corner',    name: 'Exiled to Elba!',         icon: '⛓', label: 'Go to Exile' },
  { i: 31, type: 'territory', name: 'Smolensk',    group: 'Green',     price: 300, rent: [26,130, 390, 900, 1100, 1275], buildCost: 200 },
  { i: 32, type: 'territory', name: 'Borodino',    group: 'Green',     price: 300, rent: [26,130, 390, 900, 1100, 1275], buildCost: 200 },
  { i: 33, type: 'card',      subtype: 'orders',   name: 'Orders' },
  { i: 34, type: 'territory', name: 'Moscow',      group: 'Green',     price: 320, rent: [28,150, 450,1000, 1200, 1400], buildCost: 200 },
  { i: 35, type: 'supply',    name: 'West Supply Line',        price: 200 },
  { i: 36, type: 'card',      subtype: 'diplomacy',name: 'Diplomacy' },
  { i: 37, type: 'territory', name: 'London',      group: 'Blue',      price: 350, rent: [35,175, 500,1100, 1300, 1500], buildCost: 200 },
  { i: 38, type: 'tax',       name: 'Imperial Tax',            amount: 100 },
  { i: 39, type: 'territory', name: 'Paris',       group: 'Blue',      price: 400, rent: [50,200, 600,1400, 1700, 2000], buildCost: 200, capital: true },
];

export const BATTLE_TERRITORIES = BOARD.filter(s => s.battle).map(s => s.name);

/** Return the board space at position i. */
export function spaceAt(i) {
  return BOARD[i];
}

/** Return all non-eliminated players currently standing on spaceIndex. */
export function playerAt(spaceIndex) {
  return state.players.filter(p => p.position === spaceIndex && !p.eliminated);
}

/**
 * Map board position 0-39 to {col, row} in an 11×11 CSS grid.
 *
 *  0           = bottom-right corner  (col 11, row 11)
 *  1–9         = bottom row right→left (cols 10→2, row 11)
 *  10          = bottom-left corner   (col  1, row 11)
 *  11–19       = left column up       (col  1, rows 10→2)
 *  20          = top-left corner      (col  1, row  1)
 *  21–29       = top row left→right   (cols 2→10, row  1)
 *  30          = top-right corner     (col 11, row  1)
 *  31–39       = right column down    (col 11, rows 2→10)
 */
export function spaceGridPos(i) {
  if (i === 0)                return { col: 11, row: 11 };
  if (i >= 1  && i <= 9)  return { col: 11 - i,      row: 11 };
  if (i === 10)               return { col:  1, row: 11 };
  if (i >= 11 && i <= 19) return { col:  1,           row: 11 - (i - 10) };
  if (i === 20)               return { col:  1, row:  1 };
  if (i >= 21 && i <= 29) return { col:  1 + (i - 20), row:  1 };
  if (i === 30)               return { col: 11, row:  1 };
  if (i >= 31 && i <= 39) return { col: 11,           row:  1 + (i - 30) };
}

# Empire & Coalition

A Napoleonic Monopoly-style browser board game for 2–5 players.

[![Deploy to GitHub Pages](https://github.com/Deepikar8/napoleangame/actions/workflows/deploy.yml/badge.svg)](https://github.com/Deepikar8/napoleangame/actions/workflows/deploy.yml)

## 🎮 Play Now

| | |
|---|---|
| **Game** | https://deepikar8.github.io/napoleangame/ |
| **Rules** | https://deepikar8.github.io/napoleangame/rules.html |

---

## Local Development

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

GitHub Pages auto-publishes from `main` on every push — no build step required.

---

## Project layout

```
index.html            # Shell + all CSS; loads src/render.js as an ES module
src/
  state.js            # Game-state object, PLAYER_COLORS, shuffle, log, currentPlayer
  board.js            # BOARD array, BATTLE_TERRITORIES, spaceAt, playerAt, spaceGridPos
  cards.js            # ORDERS_CARDS and DIPLOMACY_CARDS decks (Age of Napoleon flavor)
  commanders.js       # COMMANDERS array (7 historical figures) + getCommanderById
  rules.js            # All game logic: rent, building, victory, exile, turns
  render.js           # DOM rendering, event handlers, boot entry-point
  audio.js            # Web Audio API sounds + Web Speech API narration (no external files)
tests/
  rules.test.js       # Vitest tests for calculateRent, canBuild,
                      #   checkStrategicVictory, and the exile flow
  commanders.test.js  # Tests for all 7 commander passive abilities
  dice.test.js        # Tests for rollDie anti-repeat, diceRolling flag, animator injection
  turnSummary.test.js # Tests for pendingTurnSummary population, trivial-turn skip, game-over
  events.test.js      # Tests for the structured event system
.github/
  workflows/
    deploy.yml        # CI: run tests → deploy to GitHub Pages on push to main
```

---

## Development

```bash
npm install          # install Vitest
npm test             # run tests in watch mode
npm run test:run     # single run (used by CI)
```

No bundler is needed.  The game uses native ES modules (`type="module"`), which
every evergreen browser supports.

---

## Features

### Board & Visuals
- **Napoleonic parchment theme** — aged paper background, ink typography, gold accents throughout
- **SVG paper grain** — `feTurbulence` filter applied to the board for a subtle aged-parchment texture
- **Per-territory flavor text** — all 22 territories have historical flavor lines shown in purchase and auction modals
- **Special space highlights** — battle territories (gold border + ★ watermark), Paris capital (blue border + ♛), Mobilization corner (gold glow), Go-to-Exile corner (dark crimson)
- **Owner tinting** — each claimed space washes with its owner's color at low opacity, readable at a glance
- **Triangle ownership flag** — clipped corner triangle shows owner color on each property
- **Medallion tokens** — 14 px gold-bordered coins with commander monogram engraved; the active player's token pulses
- **Animated center eagle** — the ⚜ breathes with a slow gold glow

### Dice
- **Tumble animation** — ~10 random face changes over 700 ms before settling with a bounce
- **Staggered settle** — the two dice land 100 ms apart so they don't snap simultaneously
- **Anti-repeat bias** — `rollDie(lastValue)` re-rolls once if the same face would repeat back-to-back, reducing identical repeats from 1/6 to ~1/36

### Token movement
- Tokens live in a **CSS overlay layer** and move via `left`/`top` transitions — no board DOM rebuild on each step
- Tokens hop **one space at a time** at 160 ms intervals with a 140 ms CSS ease-out transition
- Passing Mobilization mid-move triggers the collect-200 bonus at the correct step
- Multiple players sharing a space are fanned horizontally with a 7 px offset

### Sound Effects (Web Audio API — no files)
| Event | Sound |
|-------|-------|
| Roll button | Rattling noise burst |
| Each die face tick | Soft high click |
| Die settles | Sharp click + bounce |
| Token step | Wooden tap |
| Token lands | Heavy thud |
| Pass Mobilization | Upward 4-note arpeggio |
| Purchase / auction win | Descending coin cascade |
| Pay rent | Outgoing coins |
| Draw card | Paper whoosh |
| Exiled to Elba | Descending sawtooth drone |
| Victory | Ascending fanfare + chord |

### Narration (Web Speech API — no files)
The game announces key events aloud in a low, authoritative voice:
- "[Player]'s turn."
- Dice total — "Seven." or "Doubles! Three and three."
- Space name on landing
- "Mobilization! Collect two hundred."
- Rent, tax, purchase, exile, escape, skip, and victory lines
- Auction events — opening bid, winner, and no-bids result

### Auction
When a player declines to purchase a property, an **open auction** is held
for all other active players in turn order:
- Bid presets: ½ price, ¾ price, full price, current high +10₣
- All-pass → property stays unowned
- Winner acquires at their bid; `moveTo` cards still advance turn correctly

### Elimination
When a player cannot cover a debt and has no assets left to liquidate they are
**eliminated** from the campaign:
- Buildings sold first, then cheapest properties, to cover the debt
- Eliminated players are skipped in turn rotation
- If only one commander remains, they win immediately

### Auto-Save / Resume
The game silently saves to `localStorage` after every turn and property purchase.
On the setup screen a **Resume Campaign** button appears if a save exists, showing
the current round and active player count. Starting a new campaign clears the save.

### Turn Summary
After every non-trivial turn a modal lists all turn events with treasury delta.
Commander ability callouts are highlighted separately.

### Settings
Three toggles in the sidebar (all persist across page refreshes):
- **Turn Summary** — show/hide the post-turn modal
- **Sound Effects** — enable/disable all audio
- **Narration** — enable/disable speech; clicking Continue also cancels queued speech

---

## Game Specification

### Overview

Empire & Coalition is a Monopoly-inspired board game set in the Napoleonic era.
2–5 players ("Commanders") race around a 40-space board buying territories,
supply lines, and economic instruments.  The game ends either by **Strategic
Victory** or at the end of round 20 (**Net-Worth Victory**).

---

### The Board — 40 spaces

| Range | Spaces |
|-------|--------|
| 0 | **Mobilization** — start corner; passing collects 200₣ |
| 1–9 | Bottom row (Brown + LightBlue territories, Orders card, War Contributions tax, North Supply Line) |
| 10 | **Exile to Elba (Visiting)** — just visiting |
| 11–19 | Left column (Pink + Orange territories, Continental System economic, Orders card, East Supply Line) |
| 20 | **Congress of Vienna** — free parking |
| 21–29 | Top row (Red battle territories × 3, Diplomacy card, Yellow territories, South Supply Line, Naval Blockade) |
| 30 | **Exiled to Elba!** — go to exile |
| 31–39 | Right column (Green territories, Orders card, West Supply Line, Diplomacy card, Blue territories inc. London + Paris, Imperial Tax) |

**Color groups and sizes:**

| Group | Territories | Build cost |
|-------|-------------|------------|
| Brown | 2 | 50₣ |
| LightBlue | 3 | 50₣ |
| Pink | 3 | 100₣ |
| Orange | 3 | 100₣ |
| Red | 3 | 150₣ |
| Yellow | 3 | 150₣ |
| Green | 3 | 200₣ |
| Blue | 2 (London + Paris) | 200₣ |

**Special spaces:**

| Space | Effect |
|-------|--------|
| Orders (×3) | Draw an Orders card |
| Diplomacy (×3) | Draw a Diplomacy card |
| War Contributions | Pay 200₣ |
| Imperial Tax | Pay 100₣ |
| Supply Lines (×4) | Buyable; rent scales with owner's total supply count |
| Continental System / Naval Blockade | Buyable; rent = dice total × 4 (1 owned) or × 10 (both owned) |
| Mobilization | Collect 200₣ when passing |
| Congress of Vienna | Free — no penalty |
| Exile to Elba (space 10) | Visiting only — no penalty |
| Exiled to Elba! (space 30) | Player is exiled |

---

### Starting resources

Every Commander begins with **1 500₣** at Mobilization (space 0).

---

### Turn structure

1. **Roll the dice** (2d6) — dice tumble for ~700 ms, each face cycling randomly before settling with a bounce.
2. Move the token — hops space-by-space across the board (~160 ms per step) like a physical piece.
3. Resolve the landed space:
   - **Unowned property/supply/economic** → offered for purchase (or skip if in Collapse State).
   - **Opponent's property** → pay rent.
   - **Own property** → no action.
   - **Tax space** → pay stated amount.
   - **Card space** → draw and apply a card.
   - **Corner** → follow corner rules.
4. **Build** — after resolving the space (not exclusive to the move turn), spend money to place Regiments or upgrade to an Army Corps on any territory you own outright (full color group required).
5. **End Turn** — pass to the next Commander.

**Doubles:** rolling doubles grants an extra roll.  Three consecutive doubles sends the player straight to Exile.

---

### Rent

**Territories:**

```
rent[buildings]   buildings ∈ {0, 1, 2, 3, 4, 5}
                  5 = Army Corps (max)
```

When a player owns all territories in a color group with **0 buildings**,
rent is doubled (monopoly bonus).

**Supply lines:**

| Lines owned | Rent |
|-------------|------|
| 1 | 25₣ |
| 2 | 50₣ |
| 3 | 100₣ |
| 4 | 200₣ |

**Economic spaces:**

| Economic spaces owned | Rent |
|-----------------------|------|
| 1 | Dice total × 4 |
| 2 | Dice total × 10 |

**Collapse State:** players with ≤ 0₣ enter Collapse State and pay only
50% of rent owed.  They cannot purchase.  Recovery happens automatically
when their money exceeds 200₣.

---

### Building

- Requires owning the **full color group**.
- Costs `buildCost` per level (50–200₣ depending on group).
- **Even-build rule:** no territory in a group may have more buildings than
  any other territory in the group (must build evenly).
- Maximum 5 levels: levels 1–4 are Regiments, level 5 is an Army Corps (★).

---

### Exile

When a player is exiled (sent to space 10):

Each exile turn they choose:
1. **Roll for doubles** — if successful, escape and move that many spaces; otherwise `exileTurns++`.  After 3 failed attempts the player automatically pays 50₣ and is released.
2. **Pay 50₣** — immediate release; then roll normally.
3. **Use "Get Out of Exile" card** (if held) — free escape; then roll normally.

---

### Cards

**Orders deck (12 cards):**

| Card | Effect |
|------|--------|
| Advance to Paris | Move to space 39; collect 200₣ if passing Mobilization |
| Advance to Austerlitz | Move to space 21; collect 200₣ if passing Mobilization |
| Forced march | Advance 3 spaces |
| Plunder stores | Gain 150₣ |
| Pay marshals | Pay 100₣ |
| Winter quarters | Skip next turn |
| Brilliant maneuver | Gain 200₣ |
| Retreat | Move back 3 spaces |
| Promoted to Marshal | Gain 100₣ |
| Logistics failure | Pay 50₣ per Regiment/Army Corps owned |
| Field hospital | Pay 75₣ |
| Captured artillery | Gain 120₣ |

**Diplomacy deck (12 cards):**

| Card | Effect |
|------|--------|
| Treaty of Tilsit | Gain 200₣ |
| War reparations | Pay 100₣ |
| Get out of Exile free | Keep; use to escape Exile |
| Collect tribute | Each rival pays you 50₣ |
| Diplomatic gala | Pay each rival 50₣ |
| Bank dividend | Gain 150₣ |
| Inheritance | Gain 100₣ |
| Supply insurance | Gain 50₣ per supply line owned |
| Coronation expenses | Pay 150₣ |
| Exile | Go directly to Exile |
| Council seat | Gain 100₣ |
| Espionage | Pay 75₣ |

---

### Victory conditions

**Strategic Victory (immediate):**
- Own **Paris** (space 39), AND
- Own at least **2 of the 3 Battle Territories** (Austerlitz, Jena-Auerstedt, Wagram).

**Net-Worth Victory (round 20):**
- If no Strategic Victory has occurred by the end of round 20, the player
  with the highest **net worth** (cash + property prices + building costs)
  wins.

---

### Commanders

Each player selects a unique historical commander during setup.  Commanders have
**passive abilities** that fire automatically — no player action required.

| Commander | Faction | Ability | Effect |
|-----------|---------|---------|--------|
| Napoleon Bonaparte | French | Eagle of Victory | +50₣ whenever you acquire Austerlitz, Jena-Auerstedt, or Wagram |
| Marshal Davout | French | Iron Discipline | Rivals pay +25% rent on all territories you own |
| Marshal Murat | French | Cavalry Charge | +75₣ each time you roll doubles (1st and 2nd only — not the exile-triggering 3rd) |
| Marshal Ney | French | Rearguard Action | When sent to Exile, roll 1d6 first; on 5–6 hold the line and stay |
| Duke of Wellington | Coalition | Defensive Genius | You pay −25% rent on all territories you do not own |
| Tsar Alexander I | Coalition | Scorched Earth | When any rival lands on a Green territory you own, collect +100₣ from the bank |
| Marshal Blücher | Coalition | Vorwärts! | When leaving Exile by any means, immediately roll and move on the same turn |

**Ability stacking** — Davout (+25%) and Wellington (−25%) both apply when
Wellington lands on a Davout-owned territory: base × 1.25 × 0.75.

---

### Testing

176 tests across 5 suites. Run with:

```bash
npm run test:run
```

| Suite | What is tested |
|-------|----------------|
| **rules.test.js** | `calculateRent` (all tiers), `canBuild` (all guards), `checkStrategicVictory`, exile flow (`exileDiceRoll`, `exilePay`, `sendToExile`), collapse helpers, `netWorth` |
| **commanders.test.js** | All 7 commander passive abilities; Davout + Wellington stacking; COMMANDERS data integrity |
| **dice.test.js** | `rollDie` anti-repeat bias and distribution; `diceRolling` flag lifecycle; animator injection; `state.lastRoll` / `lastDiceRolled` after animation |
| **turnSummary.test.js** | `pendingTurnSummary` population (playerName, color, money, turnNumber, commander fields); trivial-turn skip; game-over suppression; treasury event capture; exile loss events; doubles sequence; state.current advancement |
| **events.test.js** | Structured event system — `emit`, `currentTurnEvents`, `gameEvents` accumulation |

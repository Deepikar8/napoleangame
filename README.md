# Empire & Coalition

A Napoleonic Monopoly-style browser board game for 2–5 players.

[![Deploy to GitHub Pages](https://github.com/YOUR_USER/napoleangame/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USER/napoleangame/actions/workflows/deploy.yml)

> Replace `YOUR_USER` with your GitHub username after pushing.

---

## Play

Open `index.html` in any modern browser — no build step required.  
GitHub Pages auto-publishes from `main` on every push.

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
tests/
  rules.test.js       # Vitest tests for calculateRent, canBuild,
                      #   checkStrategicVictory, and the exile flow
  commanders.test.js  # Tests for all 7 commander passive abilities
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

1. **Roll the dice** (2d6).
2. Move the token.
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

The Vitest suite covers:

| Function | What is tested |
|----------|----------------|
| `calculateRent` | Zero rent when unowned; base rent; monopoly doubling; rent table by building level; supply-line tiers; economic dice multipliers |
| `canBuild` | All guard conditions (non-territory, not owner, collapsed, no monopoly, max level, even-build, insufficient funds) |
| `checkStrategicVictory` | Missing Paris; Paris + 1 battle; Paris + 2 battles; Paris + 3 battles; battles owned by a rival |
| `exileDiceRoll` | Doubles → escape + position; non-doubles → exileTurns++; 3rd failure → auto-pay + escape |
| `exilePay` | Normal payment; can't afford; collapsed player |
| `sendToExile` | Flags, position, doubleCount |
| Collapse helpers | `payMoney`, `updateCollapseStatus`, `checkRecovery` |
| `netWorth` | Cash only; cash + property; cash + property + buildings |
| Napoleon ability | +50₣ on Battle Territory purchase; no bonus on ordinary territory |
| Davout ability | Rent ×1.25 for rivals; applies at building levels; stacks with Wellington |
| Wellington ability | Rent ×0.75 when paying rivals; no discount when paying own property |
| Davout + Wellington | Applies ×1.25 then ×0.75; correct stacking order |
| Murat ability | +75₣ on doubles 1 & 2; no bonus on 3rd (exile) doubles; no bonus on non-doubles |
| Ney ability | Roll ≥ 5 averts exile; roll ≤ 4 proceeds; doubleCount reset in both outcomes |
| Alexander ability | Scorched Earth +100₣ is a bank bonus, not included in `calculateRent` |
| Blücher ability | `rollDice()` called immediately after `exilePay`; works for card escape too |
| COMMANDERS data | 7 entries, 4 French + 3 Coalition, all required fields, unique ids |

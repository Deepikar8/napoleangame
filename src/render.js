// ============================================================
//  RENDER — All DOM rendering and event-handler wiring
// ============================================================

import { state, PLAYER_COLORS, currentPlayer, hasSave, loadGame } from './state.js';
import { BOARD, spaceAt, playerAt, spaceGridPos } from './board.js';
import { COMMANDERS } from './commanders.js';
import {
  registerRenderer,
  registerDiceAnimator,
  registerMoveAnimator,
  getOwner,
  ownsGroup,
  netWorth,
  countBuildings,
  canBuild,
  checkStrategicVictory,
  startGame,
  rollDice,
  endTurn,
  buyProperty,
  declinePurchase,
  applyCard,
  build,
  placeBid,
  passAuction,
} from './rules.js';

import {
  getAudioEnabled, setAudioEnabled,
  getSpeechEnabled, setSpeechEnabled,
  playDiceRoll, playDiceTick, playDiceSettle,
  playTokenStep, playTokenLand,
  playPassMobilization,
  playPurchase, playRentPaid, playCardDraw,
  playExile, playVictory, playTurnEnd,
  speak, cancelSpeech,
} from './audio.js';

// ---------------------------------------------------------------------------
// Sound / effect hooks — wired to audio.js at boot
// ---------------------------------------------------------------------------
const HOOKS = {
  onRollStart:    () => { playDiceRoll(); },
  onTick:         () => { playDiceTick(); },
  onSettle:       (dieIdx) => { playDiceSettle(dieIdx); },
  onSummaryShown: () => {},
};
export function setDiceHooks(h) { Object.assign(HOOKS, h); }

// ---------------------------------------------------------------------------
// Turn Summary settings — persisted in localStorage
// ---------------------------------------------------------------------------
function getTurnSummaryEnabled() {
  try { return localStorage.getItem('turnSummaryEnabled') !== 'false'; }
  catch { return true; }
}
function setTurnSummaryEnabled(val) {
  try { localStorage.setItem('turnSummaryEnabled', val ? 'true' : 'false'); }
  catch { /* no-op in environments without localStorage */ }
}

// ---------------------------------------------------------------------------
// Speech narration — scan new currentTurnEvents each render and speak them
// Uses WeakSet so references are cleaned up when events array is replaced.
// ---------------------------------------------------------------------------
const _spokenEvents = new WeakSet();

// Number words for dice totals — spoken narration sounds better than digits
const DICE_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six',
                    'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function speakEvent(e) {
  switch (e.type) {
    case 'turn_started':
      cancelSpeech();
      speak(`The campaign awaits, ${e.playerName}.`, { interrupt: true });
      break;
    case 'player_eliminated':
      speak(`${e.playerName}'s armies are broken. They are driven from the field.`, { pitch: 0.75, rate: 0.78 });
      break;
    case 'roll':
      if (e.isDoubles) {
        speak(`Doubles! ${DICE_WORDS[e.dice[0]]} and ${DICE_WORDS[e.dice[1]]}. March again, Commander.`);
      } else {
        const total = e.dice[0] + e.dice[1];
        speak(`The dice fall... ${DICE_WORDS[total] ?? total}.`);
      }
      break;
    case 'move':
      speak(e.spaceName ?? '');
      break;
    case 'pass_mobilization':
      speak('The troops are mobilized. Two hundred francs flow into the treasury.');
      playPassMobilization();
      break;
    case 'rent_paid':
      speak(`Tribute paid. ${e.amount} francs rendered to the occupying power.`);
      playRentPaid();
      break;
    case 'tax_paid':
      speak(`The crown demands its toll. ${e.amount} francs seized.`);
      break;
    case 'purchase':
      speak(`${e.spaceName} falls under your banner. The conquest is complete.`);
      playPurchase();
      break;
    case 'card_drawn':
      speak(e.cardText ?? 'New orders arrive from the Emperor.');
      playCardDraw();
      break;
    case 'sent_to_exile':
      speak(`The empire crumbles. ${currentPlayer().name}... is exiled to Elba.`, { pitch: 0.72, rate: 0.76 });
      playExile();
      break;
    case 'escaped_exile':
      speak('The eagle has escaped! The hundred days begin.');
      break;
    case 'turn_skipped':
      speak(`${currentPlayer().name} retreats to winter quarters. The campaign pauses.`);
      break;
    case 'auction_started':
      speak(`${e.spaceName} goes to open auction. The minimum bid stands at ${e.minBid} francs.`);
      break;
    case 'auction_won':
      speak(`${e.winnerName} secures ${e.spaceName} for ${e.price} francs. A bold investment.`);
      playPurchase();
      break;
    case 'auction_ended':
      speak(`No commander dares bid. ${e.spaceName ?? 'The territory'} remains unclaimed.`);
      break;
  }
}

function speakNewEvents() {
  for (const e of state.currentTurnEvents) {
    if (_spokenEvents.has(e)) continue;
    // Hold the turn announcement until the summary modal is dismissed
    if (e.type === 'turn_started' && state.pendingTurnSummary) continue;
    _spokenEvents.add(e);
    speakEvent(e);
  }
}

// ---------------------------------------------------------------------------
// Treasury delta — net money change for the completed turn
// Uses gain/loss events plus rent_paid and purchase (which don't emit loss).
// ---------------------------------------------------------------------------
export function calcTreasuryDelta(events) {
  let net = 0;
  for (const e of events) {
    if (e.type === 'gain')      net += e.amount  || 0;
    if (e.type === 'loss')      net -= e.amount  || 0;
    if (e.type === 'rent_paid') net -= e.amount  || 0;
    if (e.type === 'purchase')  net -= e.price   || 0;
  }
  return net;
}

// ---------------------------------------------------------------------------
// Top-level render
// ---------------------------------------------------------------------------

export function render() {
  const app = document.getElementById('app');
  if (state.phase === 'setup') {
    app.innerHTML = renderSetup();
    attachSetupHandlers();
    return;
  }

  app.innerHTML = `
    <div class="header">
      <div class="title">Empire &amp; Coalition</div>
      <div class="subtitle">— A Campaign of Crowns and Coin —</div>
    </div>
    ${renderDebugPanel()}
    <div class="game-area">
      <div class="board-container">
        ${renderBoard()}
      </div>
      <div class="sidebar">
        ${renderPlayers()}
        ${renderHoldings()}
        ${renderActions()}
        ${renderSettings()}
        ${renderSelectedSpace()}
        ${renderLog()}
      </div>
    </div>
  `;
  attachGameHandlers();
  renderTokenLayer(); // place token overlay after board is in DOM

  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

  if (state.pendingAction) {
    document.body.insertAdjacentHTML('beforeend', renderModal());
    attachModalHandlers();
  }
  if (state.phase === 'gameOver') {
    document.body.insertAdjacentHTML('beforeend', renderVictory());
    attachVictoryHandlers();
    playVictory();
    if (state.winner) speak(`Europe bows. ${state.winner.name} stands alone, the master of nations. The campaign is won.`, { rate: 0.76, pitch: 0.85 });
  }
  if (state.pendingTurnSummary) {
    if (getTurnSummaryEnabled()) {
      document.body.insertAdjacentHTML('beforeend', renderTurnSummary());
      attachTurnSummaryHandlers();
      HOOKS.onSummaryShown();
    } else {
      // Settings off — clear immediately so the next player can act
      state.pendingTurnSummary = null;
    }
  }

  speakNewEvents();
}

// ---------------------------------------------------------------------------
// Setup screen — two-step flow
//   Step 'count'  → choose player count + names
//   Step 'pick'   → each player selects a unique historical commander
// ---------------------------------------------------------------------------

const DEFAULT_NAMES = ['Napoleon', 'Wellington', 'Alexander I', 'Blücher', 'Metternich'];

function getSetup() {
  if (!window._setup) {
    window._setup = {
      step: 'count',
      count: 2,
      names: [...DEFAULT_NAMES],
      commanders: [],     // commander ids indexed by player
      currentPicker: 0,
    };
  }
  return window._setup;
}

function renderSetup() {
  const s = getSetup();
  if (s.step === 'count') return renderCountStep(s);
  if (s.commanders.length < s.count) return renderPickStep(s);
  return renderReadyStep(s);
}

function renderCountStep(s) {
  return `
    <div class="setup">
      <div class="setup-title">Empire &amp; Coalition</div>
      <div class="setup-flavor">Europe lies before you. How many shall contest it?</div>
      <div style="text-align:center;margin-bottom:8px">
        <a href="rules.html" target="_blank"
           style="font-family:'IM Fell English SC',serif;font-size:13px;color:var(--gold);text-decoration:none;letter-spacing:0.06em;opacity:0.85">
          📜 Read the Rules of Engagement
        </a>
      </div>

      <div class="setup-section">
        <div class="setup-label">Number of Commanders</div>
        <div class="player-count-buttons">
          ${[2, 3, 4, 5].map(n =>
            `<button class="count-btn ${s.count === n ? 'selected' : ''}" data-count="${n}">${n}</button>`
          ).join('')}
        </div>
      </div>

      <div class="setup-section">
        <div class="setup-label">Commander Names</div>
        <div class="name-inputs">
          ${Array.from({ length: s.count }, (_, i) => `
            <div class="name-input-row">
              <div class="player-color" style="background:${PLAYER_COLORS[i].hex}"></div>
              <input type="text" data-idx="${i}" value="${s.names[i] || ''}" placeholder="Commander ${i + 1}">
            </div>
          `).join('')}
        </div>
      </div>

      <button class="btn gold" id="choose-commanders-btn" style="margin-top:24px">
        Choose Commanders →
      </button>
      ${hasSave() ? `
      <button class="btn ghost" id="resume-btn" style="margin-top:8px">
        Resume Campaign — Round ${(() => { try { const d = JSON.parse(localStorage.getItem('empire_save')); return d?.round ?? '?'; } catch { return '?'; } })()}, ${(() => { try { const d = JSON.parse(localStorage.getItem('empire_save')); return (d?.players?.filter(p => !p.eliminated).length ?? '?') + ' commanders'; } catch { return '?'; } })()}
      </button>
      ` : ''}
    </div>
  `;
}

function renderPickStep(s) {
  const pickerIdx = s.commanders.length;
  const pickerColor = PLAYER_COLORS[pickerIdx].hex;
  const pickerName  = s.names[pickerIdx] || `Commander ${pickerIdx + 1}`;

  return `
    <div class="setup" style="max-width:680px">
      <div class="setup-title">Choose Your Commander</div>

      <div class="setup-picker-prompt">
        <div class="player-color" style="background:${pickerColor};width:20px;height:20px;border-radius:50%;border:2px solid var(--ink);flex-shrink:0"></div>
        <span><strong>${pickerName}</strong>, choose your commander</span>
        <span class="setup-picker-idx">(${pickerIdx + 1} of ${s.count})</span>
      </div>

      <div class="cmd-grid">
        ${COMMANDERS.map(cmd => {
          const taken = s.commanders.includes(cmd.id);
          return `
            <div class="cmd-card ${taken ? 'taken' : ''}" data-cmd="${cmd.id}">
              <div class="cmd-header">
                <div class="cmd-monogram ${cmd.faction}">${cmd.monogram}</div>
                <div>
                  <div class="cmd-name">${cmd.name}</div>
                  <div class="cmd-title">${cmd.title}</div>
                </div>
              </div>
              <div class="cmd-ability-name">${cmd.abilityName}</div>
              <div class="cmd-ability-text">${cmd.abilityText}</div>
              ${taken ? '<div class="cmd-taken-label">Selected</div>' : ''}
            </div>
          `;
        }).join('')}
      </div>

      <button class="btn ghost" id="back-to-count-btn" style="margin-top:12px;width:auto;padding:8px 20px">
        ← Back
      </button>
    </div>
  `;
}

function renderReadyStep(s) {
  return `
    <div class="setup">
      <div class="setup-title">The Campaign Awaits</div>
      <div class="setup-flavor">The commanders are chosen. History hangs in the balance.</div>

      <div class="setup-section">
        ${Array.from({ length: s.count }, (_, i) => {
          const cmd = COMMANDERS.find(c => c.id === s.commanders[i]);
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px dotted var(--ink-faded)">
              <div class="player-color" style="background:${PLAYER_COLORS[i].hex};width:18px;height:18px;border-radius:50%;border:2px solid var(--ink);flex-shrink:0"></div>
              <div style="flex:1">
                <span style="font-family:'IM Fell English SC',serif">${s.names[i] || `Commander ${i + 1}`}</span>
              </div>
              <div class="cmd-monogram ${cmd.faction}" style="width:28px;height:28px;font-size:13px">${cmd.monogram}</div>
              <div style="flex:2;font-size:12px">
                <div style="color:var(--ink)">${cmd.name}</div>
                <div style="color:var(--crimson-dark);font-family:'JetBrains Mono',monospace;font-size:10px">${cmd.abilityName}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button class="btn gold" id="start-btn" style="margin-top:24px">Begin Campaign</button>
      <button class="btn ghost" id="back-to-count-btn" style="margin-top:8px;width:auto;padding:8px 20px">
        ← Change Commanders
      </button>
    </div>
  `;
}

function attachSetupHandlers() {
  const s = getSetup();

  // ── Count step ──────────────────────────────────────────
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.name-input-row input').forEach(inp => {
        s.names[+inp.dataset.idx] = inp.value;
      });
      s.count = +btn.dataset.count;
      s.commanders = [];
      s.currentPicker = 0;
      render();
    });
  });

  document.querySelectorAll('.name-input-row input').forEach(inp => {
    inp.addEventListener('input', e => {
      s.names[+inp.dataset.idx] = e.target.value;
    });
  });

  document.getElementById('choose-commanders-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.name-input-row input').forEach(inp => {
      s.names[+inp.dataset.idx] = inp.value;
    });
    s.step = 'pick';
    s.commanders = [];
    render();
  });

  document.getElementById('resume-btn')?.addEventListener('click', () => {
    if (loadGame()) {
      render();
    }
  });

  // ── Pick step ───────────────────────────────────────────
  document.querySelectorAll('.cmd-card:not(.taken)').forEach(card => {
    card.addEventListener('click', () => {
      s.commanders.push(card.dataset.cmd);
      render();
    });
  });

  // ── Back button (pick and ready steps) ──────────────────
  document.getElementById('back-to-count-btn')?.addEventListener('click', () => {
    s.step = 'count';
    s.commanders = [];
    render();
  });

  // ── Ready step ──────────────────────────────────────────
  document.getElementById('start-btn')?.addEventListener('click', () => {
    const playerSetups = Array.from({ length: s.count }, (_, i) => ({
      name: s.names[i] || `Commander ${i + 1}`,
      commander: COMMANDERS.find(c => c.id === s.commanders[i]),
    }));
    window._setup = null; // reset for next game
    startGame(playerSetups);
  });
}

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Token overlay layer — tokens live in a single absolutely-positioned layer
// over the board grid so movement only touches style properties, not the DOM.
// ---------------------------------------------------------------------------

function getSpaceCenter(spaceIdx) {
  const board = document.querySelector('.board');
  const space = document.querySelector(`.space[data-idx="${spaceIdx}"]`);
  if (!board || !space) return null;
  const br = board.getBoundingClientRect();
  const sr = space.getBoundingClientRect();
  return {
    x: sr.left - br.left + sr.width  / 2,
    y: sr.top  - br.top  + sr.height / 2,
  };
}

function renderTokenLayer() {
  const board = document.querySelector('.board');
  if (!board) return;

  // Remove stale layer (fresh render)
  board.querySelector('.token-layer')?.remove();

  const layer = document.createElement('div');
  layer.className = 'token-layer';

  const TOKEN_HALF = 7; // half of 14px token size

  // Group non-eliminated players by position for stacking offsets
  const byPos = {};
  state.players.forEach(p => {
    if (p.eliminated) return;
    (byPos[p.position] ??= []).push(p.id);
  });

  state.players.forEach(p => {
    if (p.eliminated) return;
    const isActive = p.id === state.players[state.current]?.id;
    const token = document.createElement('div');
    token.className = `player-token${isActive ? ' active-player' : ''}`;
    token.style.background = p.color;
    token.dataset.playerId = p.id;
    token.title = p.name + (p.commander ? ' · ' + p.commander.name : '');
    if (p.commander?.monogram) {
      const mono = document.createElement('span');
      mono.className = 'token-monogram';
      mono.textContent = p.commander.monogram;
      token.appendChild(mono);
    }

    // Position using getBoundingClientRect — only works after board is in DOM
    // We defer to positionTokensOnLayer() called right after this returns.
    const center = getSpaceCenter(p.position);
    if (center) {
      const group = byPos[p.position] ?? [];
      const idx = group.indexOf(p.id);
      const total = group.length;
      const xOff = total > 1 ? (idx - (total - 1) / 2) * 7 : 0;
      token.style.left = (center.x + xOff - TOKEN_HALF) + 'px';
      token.style.top  = (center.y         - TOKEN_HALF) + 'px';
    }

    layer.appendChild(token);
  });

  board.appendChild(layer);
}

function positionTokensOnLayer() {
  const TOKEN_HALF = 7;
  const byPos = {};
  state.players.forEach(p => {
    if (p.eliminated) return;
    (byPos[p.position] ??= []).push(p.id);
  });

  state.players.forEach(p => {
    if (p.eliminated) return;
    const el = document.querySelector(`.token-layer .player-token[data-player-id="${p.id}"]`);
    if (!el) return;
    const center = getSpaceCenter(p.position);
    if (!center) return;
    const group = byPos[p.position] ?? [];
    const idx = group.indexOf(p.id);
    const total = group.length;
    const xOff = total > 1 ? (idx - (total - 1) / 2) * 7 : 0;
    el.style.left = (center.x + xOff - TOKEN_HALF) + 'px';
    el.style.top  = (center.y         - TOKEN_HALF) + 'px';
  });
}

/**
 * Render building level as gold pip squares (1–4) or a ★ (5 = Army Corps).
 * Reads instantly at small sizes — no text decoding required.
 */
function renderBuildingMarker(level) {
  if (level === 0) return '';
  if (level === 5) return `<div class="building-corps">★</div>`;
  const pips = Array(level).fill('<span class="building-pip"></span>').join('');
  return `<div class="building-pips">${pips}</div>`;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function renderBoard() {
  const cells = BOARD.map(sp => {
    const pos = spaceGridPos(sp.i);
    const owner = getOwner(sp.i);
    const buildings = state.buildings[sp.i] || 0;
    const isSelected = state.selectedSpace === sp.i;

    let inner = '';
    if (sp.type === 'corner') {
      inner = `
        <div class="corner-icon">${sp.icon}</div>
        <div class="space-name">${sp.name}</div>
      `;
    } else if (sp.type === 'territory') {
      inner = `
        <div class="color-bar color-${sp.group}"></div>
        <div class="space-name">${sp.name}</div>
        <div class="space-price">₣${sp.price}</div>
      `;
    } else if (sp.type === 'card') {
      const icon = sp.subtype === 'orders' ? '📜' : '🕊';
      inner = `
        <div style="font-size:18px;text-align:center;margin-top:6px;color:var(--ink-faded)">${icon}</div>
        <div class="space-name">${sp.name}</div>
      `;
    } else if (sp.type === 'tax') {
      inner = `
        <div style="font-size:18px;text-align:center;margin-top:6px;color:var(--crimson)">⚒</div>
        <div class="space-name">${sp.name}</div>
        <div class="space-price">−₣${sp.amount}</div>
      `;
    } else if (sp.type === 'supply') {
      inner = `
        <div style="font-size:18px;text-align:center;margin-top:6px;color:var(--ink-faded)">⛟</div>
        <div class="space-name">${sp.name}</div>
        <div class="space-price">₣${sp.price}</div>
      `;
    } else if (sp.type === 'economic') {
      inner = `
        <div style="font-size:18px;text-align:center;margin-top:6px;color:var(--ink-faded)">⚔</div>
        <div class="space-name">${sp.name}</div>
        <div class="space-price">₣${sp.price}</div>
      `;
    }

    const ownershipFlag = owner
      ? `<div class="ownership-flag" style="background:${owner.color}"></div>`
      : '';

    const buildingMarker = renderBuildingMarker(buildings);

    const ownerTint = owner
      ? `background: linear-gradient(135deg, ${owner.color}2a 0%, ${owner.color}10 100%);`
      : '';

    const battleClass  = sp.battle  ? 'is-battle'  : '';
    const capitalClass = sp.capital ? 'is-capital' : '';
    const cornerSub = sp.type === 'corner'
      ? (sp.i === 0 ? 'march-start' : sp.i === 30 ? 'exile-goto' : sp.i === 20 ? 'free-parley' : '')
      : '';

    return `
      <div class="space ${sp.type === 'corner' ? 'corner' : ''} ${battleClass} ${capitalClass} ${cornerSub} ${isSelected ? 'selected' : ''}"
           data-idx="${sp.i}"
           style="grid-column:${pos.col};grid-row:${pos.row};${ownerTint}">
        ${inner}
        ${ownershipFlag}
        ${buildingMarker}
      </div>
    `;
  }).join('');

  const cp = currentPlayer();
  const center = `
    <div class="board-center">
      <div class="center-title">Round ${state.round} / ${state.maxRounds}</div>
      <div class="center-eagle">⚜</div>
      <div class="turn-indicator">
        <span style="color:${cp.color};font-weight:600">${cp.name}</span>
        ${cp.inExile ? ' — exiled on Elba' : cp.collapsed ? ' — Collapse State' : ' to play'}
      </div>
      <div class="dice-display">
        <div class="die">${state.lastRoll[0] || '·'}</div>
        <div class="die">${state.lastRoll[1] || '·'}</div>
      </div>
      <div class="center-message">${getCenterMessage()}</div>
    </div>
  `;

  return `<div class="board">${cells}${center}</div>`;
}

function getCenterMessage() {
  const p = currentPlayer();
  if (state.phase === 'gameOver')    return 'The campaign has ended.';
  if (state.pendingAction)           return 'Awaiting decision...';
  if (p.skipNext)                    return `${p.name} winters in camp.`;
  if (p.inExile)                     return `${p.name} is exiled on Elba.`;
  if (!state.rolledThisTurn)         return `${p.name} prepares to march.`;
  if (state.lastRoll[0] === state.lastRoll[1]) return 'Doubles! Roll again after this turn.';
  return `On ${spaceAt(p.position).name}.`;
}

// ---------------------------------------------------------------------------
// Players panel
// ---------------------------------------------------------------------------

function renderPlayers() {
  return `
    <div class="panel">
      <div class="panel-title">Commanders</div>
      ${state.players.map((p, i) => {
        const buildings = countBuildings(p);
        const properties = Object.values(state.ownership).filter(id => id === p.id).length;
        const cmd = p.commander;
        const isExpanded = state.expandedPlayer === p.id;

        const commanderLine = cmd ? `
          <div class="player-commander-line" data-expand-player="${p.id}">
            <div class="cmd-monogram ${cmd.faction}" style="width:18px;height:18px;font-size:9px;display:inline-flex;vertical-align:middle;margin-right:5px">${cmd.monogram}</div>
            ${cmd.name} · ${cmd.abilityName} ${isExpanded ? '▲' : '▼'}
          </div>
        ` : '';

        const expandedBlock = (cmd && isExpanded) ? `
          <div class="commander-expanded">
            <div class="commander-bio">"${cmd.bio}"</div>
            <div class="commander-ability-full"><strong>${cmd.abilityName}:</strong> ${cmd.abilityText}</div>
          </div>
        ` : '';

        return `
          <div class="player-card ${i === state.current ? 'active' : ''} ${p.collapsed ? 'collapsed' : ''}">
            <div class="player-row">
              <div class="player-color" style="background:${p.color}"></div>
              <div class="player-name">${p.name}</div>
              <div class="player-money">₣${p.money}</div>
            </div>
            <div class="player-stats">
              <span>📍 ${properties}</span>
              <span>⚔ ${buildings.regiments}R ${buildings.armyCorps}★</span>
              <span>💰 ${netWorth(p)}</span>
            </div>
            ${commanderLine}
            ${expandedBlock}
            ${p.inExile ? '<div class="player-status">⚓ Exiled on Elba</div>' : ''}
            ${p.collapsed && !p.inExile ? '<div class="player-status">⚠ Collapse State</div>' : ''}
            ${p.outOfExileCard ? '<div class="player-status">🕊 Holds Pardon Card</div>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Holdings panel
// ---------------------------------------------------------------------------

const GROUP_ORDER  = ['Brown','LightBlue','Pink','Orange','Red','Yellow','Green','Blue'];
const GROUP_COLOR  = {
  Brown:     '#6b4423',
  LightBlue: '#87ceeb',
  Pink:      '#d47ba0',
  Orange:    '#d97a2e',
  Red:       '#8b1d1d',
  Yellow:    '#d4a93e',
  Green:     '#2d4a2b',
  Blue:      '#1e3a5f',
};
const GROUP_LABEL  = {
  Brown:     'Brown',
  LightBlue: 'Light Blue',
  Pink:      'Pink',
  Orange:    'Orange',
  Red:       'Red',
  Yellow:    'Yellow',
  Green:     'Green',
  Blue:      'Blue',
};

function renderHoldings() {
  const groupSpaces = {};
  for (const g of GROUP_ORDER) {
    groupSpaces[g] = BOARD.filter(s => s.type === 'territory' && s.group === g);
  }

  const cards = state.players.map(p => {
    // Active player defaults open; others default closed.
    // An explicit true/false in holdingsExpanded overrides the default.
    const isActive = p.id === state.players[state.current].id;
    const open = p.id in state.holdingsExpanded ? state.holdingsExpanded[p.id] : isActive;

    // Build one row per group this player owns at least one territory in
    const groupRows = GROUP_ORDER.map(g => {
      const spaces = groupSpaces[g];
      const mine   = spaces.filter(s => state.ownership[s.i] === p.id);
      if (mine.length === 0) return null;

      const full    = mine.length === spaces.length;
      const missing = full ? null : spaces.find(s => state.ownership[s.i] !== p.id);
      const oneAway = missing && mine.length === spaces.length - 1;

      // Named territory list: owned = normal, unowned = muted with ⊘
      const names = spaces.map(s =>
        state.ownership[s.i] === p.id
          ? `<span class="hd-t-owned">${s.name}</span>`
          : `<span class="hd-t-missing">⊘ ${s.name}</span>`
      ).join('<span class="hd-t-sep"> · </span>');

      const badge = full
        ? `<span class="hd-full-badge">✓ Full Set</span>`
        : oneAway
          ? `<span class="hd-needs">← need ${missing.name}</span>`
          : '';

      return `
        <div class="hd-group-row ${full ? 'full-set' : ''}">
          <div class="hd-group-header">
            <div class="hd-swatch" style="background:${GROUP_COLOR[g]}"></div>
            <span class="hd-group-name">${GROUP_LABEL[g]}</span>
            ${badge}
          </div>
          <div class="hd-territory-list">${names}</div>
        </div>
      `;
    }).filter(Boolean).join('');

    // Utility counts
    const supplies = BOARD.filter(s => s.type === 'supply'   && state.ownership[s.i] === p.id).length;
    const economic = BOARD.filter(s => s.type === 'economic' && state.ownership[s.i] === p.id).length;
    const bldg     = countBuildings(p);
    const propCount = Object.values(state.ownership).filter(id => id === p.id).length;
    const totalBuildings = bldg.regiments + bldg.armyCorps;

    // Collapsed one-liner: "7 territories · 2 supply · 4 buildings"
    const summaryParts = [];
    if (propCount > 0)      summaryParts.push(`${propCount} territor${propCount === 1 ? 'y' : 'ies'}`);
    if (supplies > 0)       summaryParts.push(`${supplies} supply`);
    if (economic > 0)       summaryParts.push(`${economic} econ`);
    if (totalBuildings > 0) summaryParts.push(`${totalBuildings} building${totalBuildings !== 1 ? 's' : ''}`);
    const summary = summaryParts.length ? summaryParts.join(' · ') : 'No holdings yet';

    // Misc row: "3 Regiments, 1 Army Corps" prose
    const bldgParts = [
      bldg.regiments > 0 ? `${bldg.regiments} Regiment${bldg.regiments !== 1 ? 's' : ''}` : '',
      bldg.armyCorps > 0 ? `${bldg.armyCorps} Army Corps` : '',
    ].filter(Boolean);

    const miscRow = (supplies > 0 || economic > 0 || bldgParts.length > 0) ? `
      <div class="hd-misc">
        ${supplies > 0  ? `<span>⛟ ${supplies} Supply Line${supplies !== 1 ? 's' : ''}</span>` : ''}
        ${economic > 0  ? `<span>⚔ ${economic} Economic</span>` : ''}
        ${bldgParts.length > 0 ? `<span>🏴 ${bldgParts.join(', ')}</span>` : ''}
      </div>
    ` : '';

    return `
      <div class="hd-player">
        <div class="hd-player-header" data-hd-player="${p.id}">
          <div class="player-color" style="background:${p.color}"></div>
          <span class="hd-player-name">${p.name}</span>
          <span class="hd-summary">${summary}</span>
          <span class="hd-toggle">${open ? '▲' : '▼'}</span>
        </div>
        ${open ? `<div class="hd-body">${groupRows}${miscRow}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="panel">
      <div class="panel-title">Holdings</div>
      ${cards}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Actions panel
// ---------------------------------------------------------------------------

function renderActions() {
  const p = currentPlayer();
  const buildableProps = BOARD.filter(s => canBuild(p, s));
  const canRoll = !state.rolledThisTurn || state.lastRoll[0] === state.lastRoll[1];

  return `
    <div class="panel action-panel">
      <div class="panel-title">Imperial Council</div>
      <button class="btn crimson" id="roll-btn" ${(!canRoll || state.pendingAction || state.diceRolling) ? 'disabled' : ''}>
        ${p.inExile ? 'Attempt Escape' : 'Roll the Dice'}
      </button>
      ${buildableProps.length > 0 ? `
        <div style="margin-top:12px">
          <div class="setup-label" style="font-size:12px">Build Forces:</div>
          ${buildableProps.map(s => {
            const lvl = (state.buildings[s.i] ?? 0) + 1;
            const label = lvl === 5 ? 'Army Corps ★' : `Regiment ${lvl}`;
            return `<button class="btn ghost build-btn" data-idx="${s.i}" style="margin-top:6px">
              ${s.name}: ${label} (₣${s.buildCost})
            </button>`;
          }).join('')}
        </div>
      ` : ''}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn ghost" id="end-turn-btn" ${(!state.rolledThisTurn || state.pendingAction) ? 'disabled' : ''}>End Turn</button>
        <button class="btn ghost" id="restart-btn">New Campaign</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Selected space detail
// ---------------------------------------------------------------------------

function renderSelectedSpace() {
  if (state.selectedSpace === null) return '';
  const sp = BOARD[state.selectedSpace];
  const owner = getOwner(sp.i);

  let content = `<h4>${sp.name}</h4>`;
  if (sp.type === 'territory') {
    const groupSpaces = BOARD.filter(s => s.type === 'territory' && s.group === sp.group);
    content += `
      <div class="property-detail">
        <div class="row"><span>Group</span><span>${sp.group}</span></div>
        <div class="row"><span>Price</span><span>₣${sp.price}</span></div>
        <div class="row"><span>Rent (base)</span><span>₣${sp.rent[0]}</span></div>
        <div class="row"><span>Rent (1 Reg)</span><span>₣${sp.rent[1]}</span></div>
        <div class="row"><span>Rent (Army Corps)</span><span>₣${sp.rent[5]}</span></div>
        <div class="row"><span>Build Cost</span><span>₣${sp.buildCost}</span></div>
        ${sp.battle  ? '<div class="row"><span>★</span><span>Battle Territory</span></div>' : ''}
        ${sp.capital ? '<div class="row"><span>★</span><span>Imperial Capital</span></div>' : ''}
      </div>
      <div class="group-properties">
        ${groupSpaces.map(s => {
          const o = getOwner(s.i);
          return `<div class="group-prop-pill ${o ? 'owned' : ''}">
            ${s.name}${o ? `<br><span style="color:${o.color}">●</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    `;
  } else if (sp.type === 'supply') {
    content += `<div class="property-detail">
      <div class="row"><span>Type</span><span>Supply Line</span></div>
      <div class="row"><span>Price</span><span>₣${sp.price}</span></div>
      <div class="row"><span>Rent (1/2/3/4)</span><span>25 / 50 / 100 / 200</span></div>
    </div>`;
  } else if (sp.type === 'economic') {
    content += `<div class="property-detail">
      <div class="row"><span>Type</span><span>Economic Warfare</span></div>
      <div class="row"><span>Price</span><span>₣${sp.price}</span></div>
      <div class="row"><span>Rent (1 owned)</span><span>Dice × 4</span></div>
      <div class="row"><span>Rent (2 owned)</span><span>Dice × 10</span></div>
    </div>`;
  } else {
    content += `<div class="property-detail">
      <div class="row"><span>Type</span><span>${sp.type}</span></div>
      ${sp.amount ? `<div class="row"><span>Amount</span><span>₣${sp.amount}</span></div>` : ''}
    </div>`;
  }

  if (owner) {
    content += `<div class="ownership-list">Owned by <span style="color:${owner.color};font-weight:600">${owner.name}</span></div>`;
  }

  return `<div class="panel space-detail">${content}</div>`;
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function renderLog() {
  return `
    <div class="panel">
      <div class="panel-title">Chronicle</div>
      <div class="log">
        ${state.log.map(e => `
          <div class="log-entry ${e.type}">
            <span style="color:var(--ink-faded);font-size:10px">[R${e.round}]</span> ${e.msg}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function renderModal() {
  const a = state.pendingAction;
  let body = '';
  let actions = '';

  if (a.type === 'purchase') {
    const sp = a.space;
    body = `
      <div class="property-detail">
        ${sp.type === 'territory' ? `<div class="row"><span>Group</span><span>${sp.group}</span></div>` : ''}
        <div class="row"><span>Price</span><span>₣${sp.price}</span></div>
        ${sp.type === 'territory' ? `<div class="row"><span>Base Rent</span><span>₣${sp.rent[0]}</span></div>` : ''}
        <div class="row"><span>Your Treasury</span><span>₣${currentPlayer().money}</span></div>
      </div>
      <p style="margin-top:12px">
        Acquire this ${sp.type === 'territory' ? 'territory' : sp.type === 'supply' ? 'supply line' : 'instrument of economic warfare'}?
      </p>
    `;
    actions = `
      <button class="btn gold" id="buy-btn">Acquire ₣${sp.price}</button>
      <button class="btn ghost" id="decline-btn">Decline</button>
    `;
  } else if (a.type === 'auction') {
    const sp = a.space;
    const bidder = a.bidderQueue[0];
    const half     = a.minBid;
    const quarter3 = Math.floor(sp.price * 0.75);
    const full     = sp.price;
    const custom   = a.currentHighest > 0 ? a.currentHighest + 10 : half;
    body = `
      <div class="property-detail">
        <div class="row"><span>Territory</span><span>${sp.name}</span></div>
        <div class="row"><span>Listed Price</span><span>₣${sp.price}</span></div>
        <div class="row"><span>Minimum Bid</span><span>₣${half}</span></div>
        ${a.currentHighest > 0
          ? `<div class="row"><span>Highest Bid</span><span>₣${a.currentHighest} (${state.players.find(pl => pl.id === a.highestBidderId)?.name ?? ''})</span></div>`
          : '<div class="row"><span>Highest Bid</span><span>None yet</span></div>'}
        <div class="row"><span>Bidding Now</span><span style="color:${bidder?.color ?? '#aaa'}">${bidder?.name ?? '—'}</span></div>
        <div class="row"><span>Treasury</span><span>₣${bidder?.money ?? 0}</span></div>
      </div>
    `;
    const canAffordHalf     = (bidder?.money ?? 0) >= half;
    const canAffordQuarter3 = (bidder?.money ?? 0) >= quarter3;
    const canAffordFull     = (bidder?.money ?? 0) >= full;
    const canAffordCustom   = (bidder?.money ?? 0) >= custom;
    actions = `
      <button class="btn gold"  id="bid-half-btn"     ${canAffordHalf     ? '' : 'disabled'}>Bid ₣${half} (½)</button>
      <button class="btn gold"  id="bid-75-btn"       ${canAffordQuarter3 ? '' : 'disabled'}>Bid ₣${quarter3} (¾)</button>
      <button class="btn gold"  id="bid-full-btn"     ${canAffordFull     ? '' : 'disabled'}>Bid ₣${full} (full)</button>
      <button class="btn ghost" id="bid-custom-btn"   ${canAffordCustom   ? '' : 'disabled'}>Bid ₣${custom} (+10)</button>
      <button class="btn ghost" id="auction-pass-btn">Pass</button>
    `;
  } else if (a.type === 'card') {
    body = `<p style="font-size:18px;font-style:italic;line-height:1.5">"${a.card.text}"</p>`;
    actions = `<button class="btn gold" id="apply-card-btn">Apply Order</button>`;
  } else if (a.type === 'exileChoice') {
    body = `<p>${a.message}</p>`;
    actions = a.options.map((opt, i) =>
      `<button class="btn ${i === 0 ? 'gold' : 'ghost'}" data-opt="${i}">${opt.label}</button>`
    ).join('');
  }

  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-title">${a.title}</div>
        ${a.flavor ? `<div class="modal-flavor">${a.flavor}</div>` : ''}
        <div class="modal-body">${body}</div>
        <div class="modal-actions">${actions}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Victory screen
// ---------------------------------------------------------------------------

function renderVictory() {
  const sorted = [...state.players].sort((a, b) => netWorth(b) - netWorth(a));
  return `
    <div class="modal-overlay">
      <div class="modal victory-modal">
        <div class="victory-eagle">⚜</div>
        <div class="victory-title">${state.winner.name} Triumphs</div>
        <div class="modal-flavor">${state.winReason}</div>
        <div class="standings">
          ${sorted.map((p, i) => `
            <div class="standing-row">
              <span>
                <span class="player-color"
                      style="background:${p.color};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle">
                </span>
                ${i + 1}. ${p.name}
              </span>
              <span>₣${netWorth(p)}</span>
            </div>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn gold" id="restart-victory-btn">New Campaign</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Event handler wiring
// ---------------------------------------------------------------------------

function attachGameHandlers() {
  document.getElementById('roll-btn')?.addEventListener('click', () => rollDice());

  document.getElementById('end-turn-btn')?.addEventListener('click', () => endTurn());

  document.getElementById('restart-btn')?.addEventListener('click', () => {
    if (confirm('Abandon this campaign and start anew?')) location.reload();
  });

  document.querySelectorAll('.build-btn').forEach(b => {
    b.addEventListener('click', () => build(+b.dataset.idx));
  });

  document.querySelectorAll('.space').forEach(sp => {
    sp.addEventListener('click', () => {
      const idx = +sp.dataset.idx;
      state.selectedSpace = state.selectedSpace === idx ? null : idx;
      render();
    });
  });

  document.querySelectorAll('[data-hd-player]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.hdPlayer;
      // default is open (undefined !== false), so first click collapses
      const current = state.holdingsExpanded[id] !== false;
      state.holdingsExpanded[id] = !current;
      render();
    });
  });

  document.querySelectorAll('[data-expand-player]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.expandPlayer;
      state.expandedPlayer = state.expandedPlayer === id ? null : id;
      render();
    });
  });

  document.getElementById('ts-toggle')?.addEventListener('change', e => {
    setTurnSummaryEnabled(e.target.checked);
  });

  document.getElementById('audio-toggle')?.addEventListener('change', e => {
    setAudioEnabled(e.target.checked);
  });

  document.getElementById('speech-toggle')?.addEventListener('change', e => {
    setSpeechEnabled(e.target.checked);
    if (!e.target.checked) cancelSpeech();
  });

  attachDebugHandlers();
}

function attachModalHandlers() {
  const a = state.pendingAction;
  if (!a) return;

  if (a.type === 'purchase') {
    document.getElementById('buy-btn')?.addEventListener('click', () => buyProperty(a.space));
    document.getElementById('decline-btn')?.addEventListener('click', declinePurchase);
  } else if (a.type === 'auction') {
    const sp = a.space;
    const half     = a.minBid;
    const quarter3 = Math.floor(sp.price * 0.75);
    document.getElementById('bid-half-btn')?.addEventListener('click', () => placeBid(half));
    document.getElementById('bid-75-btn')?.addEventListener('click', () => placeBid(quarter3));
    document.getElementById('bid-full-btn')?.addEventListener('click', () => placeBid(sp.price));
    document.getElementById('bid-custom-btn')?.addEventListener('click', () => {
      const custom = a.currentHighest > 0 ? a.currentHighest + 10 : half;
      placeBid(custom);
    });
    document.getElementById('auction-pass-btn')?.addEventListener('click', () => passAuction());
  } else if (a.type === 'card') {
    document.getElementById('apply-card-btn')?.addEventListener('click', () => applyCard(a.card));
  } else if (a.type === 'exileChoice') {
    document.querySelectorAll('[data-opt]').forEach(b => {
      b.addEventListener('click', () => a.options[+b.dataset.opt].action());
    });
  }
}

function attachVictoryHandlers() {
  document.getElementById('restart-victory-btn')?.addEventListener('click', () => location.reload());
  attachDebugHandlers();
}

// ---------------------------------------------------------------------------
// Dev debug panel — only visible when URL contains ?debug=true
// ---------------------------------------------------------------------------

const DEV_MODE = typeof window !== 'undefined' && window.location.search.includes('debug=true');

function renderDebugPanel() {
  if (!DEV_MODE) return '';
  return `
    <div id="debug-btn-wrap" style="position:fixed;bottom:12px;right:12px;z-index:200;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <button id="debug-toggle-btn" style="
        background:#1e3a5f;color:#e8dcc0;border:1px solid #b8902e;
        padding:6px 12px;font-family:JetBrains Mono,monospace;font-size:11px;
        cursor:pointer;letter-spacing:0.05em
      ">⚙ Events</button>
      <div id="debug-panel" style="display:none;background:#0d0a07;color:#e8dcc0;
        border:1px solid #b8902e;padding:12px;max-width:460px;max-height:400px;
        overflow:auto;font-family:JetBrains Mono,monospace;font-size:10px;
        white-space:pre;line-height:1.5">
      </div>
    </div>
  `;
}

function attachDebugHandlers() {
  if (!DEV_MODE) return;
  const btn   = document.getElementById('debug-toggle-btn');
  const panel = document.getElementById('debug-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    if (panel.style.display === 'none') {
      const turnJSON = JSON.stringify(state.currentTurnEvents, null, 2);
      const gameJSON = JSON.stringify(state.gameEvents, null, 2);
      panel.textContent =
        `── currentTurnEvents (${state.currentTurnEvents.length}) ──\n${turnJSON}\n\n` +
        `── gameEvents (${state.gameEvents.length}) ──\n${gameJSON}`;
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  });
}

// ---------------------------------------------------------------------------
// Turn Summary Modal
// ---------------------------------------------------------------------------

function formatCmdAbilityDetail(e) {
  const { target, amount, abilityName, context } = e;
  switch (target) {
    case 'battle_bonus':
      return { main: `✦ ${abilityName}: +${amount}₣`, note: 'Battle Territory bonus' };
    case 'doubles_bonus':
      return { main: `✦ ${abilityName}: +${amount}₣`, note: 'Cavalry Charge on doubles' };
    case 'rent_increase':
      return { main: `✦ ${abilityName}`, note: `Rent raised to ${context?.adjustedRent ?? '?'}₣ for ${context?.spaceName ?? ''}` };
    case 'rent_reduction':
      return { main: `✦ ${abilityName}`, note: `Rent reduced to ${context?.adjustedRent ?? '?'}₣ for ${context?.spaceName ?? ''}` };
    case 'bank_bonus':
      return { main: `✦ ${abilityName}: +${amount}₣`, note: `Bank bonus — ${context?.spaceName ?? ''}` };
    case 'exile_prevention':
      return context?.success
        ? { main: `✦ ${abilityName}`, note: `Rolled ${context.roll} — exile averted!` }
        : { main: `✦ ${abilityName}`, note: `Rolled ${context.roll} — exiled regardless` };
    case 'immediate_move':
      return { main: `✦ ${abilityName}`, note: 'Marches immediately after escape' };
    default:
      return { main: `✦ ${abilityName}${amount != null ? ': +' + amount + '₣' : ''}`, note: '' };
  }
}

function renderTurnSummaryEvent(e, summary) {
  switch (e.type) {

    case 'roll':
      return `
        <div class="ts-event ts-roll">
          <span class="ts-roll-icon">🎲</span>
          <span class="ts-roll-text">Rolled ${e.dice[0]} + ${e.dice[1]} &nbsp;(${e.total})</span>
          ${e.isDoubles ? '<span class="ts-doubles">✦ Doubles!</span>' : ''}
        </div>`;

    case 'move':
      return `
        <div class="ts-event ts-move">
          <span class="ts-move-arrow">→</span>
          Moved to <strong>${e.spaceName}</strong>
        </div>`;

    case 'pass_mobilization':
      return `
        <div class="ts-event ts-gain-line">
          🏛 +200₣ — Passed Mobilization
        </div>`;

    case 'purchase': {
      const sp = BOARD[e.spaceIndex];
      return `
        <div class="ts-event ts-purchase">
          <div class="ts-purchase-title">🪙 Acquired ${e.spaceName}</div>
          <div class="ts-purchase-price">−${e.price}₣</div>
          ${sp?.battle ? '<div class="ts-battle-badge">★ Battle Territory</div>' : ''}
        </div>`;
    }

    case 'purchase_declined':
      return `
        <div class="ts-event ts-declined">
          <em>Declined to acquire ${e.spaceName}.</em>
        </div>`;

    case 'building_built':
      return `
        <div class="ts-event ts-building ${e.isArmyCorps ? 'ts-army-corps' : ''}">
          <span>${e.isArmyCorps ? '★' : '🪖'} Built ${e.levelName} at ${e.spaceName}</span>
          <span class="ts-cost">−${e.cost}₣</span>
        </div>`;

    case 'rent_paid':
      return `
        <div class="ts-event ts-rent-paid">
          Paid <strong>${e.amount}₣</strong> rent to ${e.paidToName} for ${e.spaceName}
        </div>`;

    case 'rent_received':
      return `
        <div class="ts-event ts-rent-received">
          Received <strong>${e.amount}₣</strong> rent from ${e.paidByName} for ${e.spaceName}
        </div>`;

    case 'tax_paid':
      return `
        <div class="ts-event ts-tax-paid">
          ⚒ Paid <strong>${e.amount}₣</strong> — ${e.spaceName}
        </div>`;

    case 'card_drawn': {
      const icon  = e.subtype === 'orders' ? '📜' : '🕊';
      const label = e.subtype === 'orders' ? 'Imperial Orders' : 'Diplomatic Dispatch';
      return `
        <div class="ts-event ts-card">
          <div class="ts-card-label">${icon} ${label}</div>
          <div class="ts-card-text">"${e.cardText}"</div>
        </div>`;
    }

    case 'card_effect':
      return `
        <div class="ts-event ts-card-effect">
          → ${e.description}
        </div>`;

    case 'sent_to_exile': {
      const reason = e.reason === 'three_doubles' ? 'Three doubles in a row'
        : e.reason === 'card'                     ? 'As told above — card effect'
        : 'Landed on the Exile corner';
      return `
        <div class="ts-event ts-exile">
          <div class="ts-exile-title">⚓ Exiled to Elba</div>
          <div class="ts-exile-reason">${reason}</div>
        </div>`;
    }

    case 'exile_attempt':
      if (e.dice == null) return ''; // pay/card method — covered by escaped_exile
      return e.success
        ? `<div class="ts-event ts-exile-success">Rolled ${e.dice[0]}+${e.dice[1]} — ✦ Doubles! Freedom!</div>`
        : `<div class="ts-event ts-muted">Rolled ${e.dice[0]}+${e.dice[1]} — no escape${e.exileTurns ? ` (turn ${e.exileTurns}/3)` : ''}</div>`;

    case 'escaped_exile': {
      const howText = e.method === 'doubles' ? 'by rolling doubles'
        : e.method === 'pay'                 ? 'paid 50₣ for release'
        : 'used the Pardon Card';
      return `<div class="ts-event ts-escape">✓ Escaped Exile — ${howText}</div>`;
    }

    case 'commander_ability': {
      const cmdPlayer = state.players.find(p => p.commander?.id === e.commanderId);
      const cmdColor  = cmdPlayer?.color ?? summary.playerColor;
      const { main, note } = formatCmdAbilityDetail(e);
      return `
        <div class="ts-event ts-commander-ability" style="border-left-color:${cmdColor}">
          <div class="ts-cmd-title" style="color:${cmdColor}">${main}</div>
          ${note ? `<div class="ts-cmd-note">${note}</div>` : ''}
        </div>`;
    }

    case 'collapse_entered':
      return `
        <div class="ts-event ts-collapse">
          <div class="ts-collapse-title">⚠ Entered Collapse State</div>
          <div class="ts-collapse-note">Cannot purchase or build. Pays 50% rent. Recovers above 200₣.</div>
        </div>`;

    case 'collapse_recovered':
      return `<div class="ts-event ts-recover">✓ Recovered from Collapse State</div>`;

    case 'turn_skipped':
      return `<div class="ts-event ts-skipped">Skipped this turn — winter quarters</div>`;

    // Lifecycle and aggregated money events are not displayed
    case 'gain':
    case 'loss':
    case 'turn_started':
    case 'turn_ended':
    case 'round_started':
      return '';

    default:
      return '';
  }
}

function renderTurnSummary() {
  const s = state.pendingTurnSummary;
  if (!s) return '';

  const net        = calcTreasuryDelta(s.events);
  const moneyAfter = s.moneyAfter;
  const moneyBefore = moneyAfter - net;

  const eventRows = s.events
    .map(e => renderTurnSummaryEvent(e, s))
    .filter(Boolean)
    .join('');

  const deltaSign  = net > 0 ? '▲' : net < 0 ? '▼' : '→';
  const deltaClass = net > 0 ? 'ts-delta-gain' : net < 0 ? 'ts-delta-loss' : 'ts-delta-neutral';
  const treasuryRow = net !== 0 ? `
    <div class="ts-treasury">
      <div class="ts-treasury-row">
        <span class="ts-treasury-label">Treasury</span>
        <span class="ts-treasury-values">${moneyBefore.toLocaleString()}₣ → ${moneyAfter.toLocaleString()}₣</span>
      </div>
      <div class="${deltaClass}">(${deltaSign} ${Math.abs(net).toLocaleString()}₣)</div>
    </div>
  ` : '';

  const subtitleHtml = s.commanderTitle
    ? `<div class="ts-subtitle">${s.commanderTitle}</div>`
    : '';

  return `
    <div class="modal-overlay ts-overlay" id="ts-overlay">
      <div class="modal ts-modal">
        <div class="ts-header">
          <div class="ts-turn-label">Turn ${s.turnNumber} · ${s.playerName}</div>
          ${subtitleHtml}
          <hr class="ts-rule">
        </div>
        <div class="ts-body">
          ${eventRows || '<div class="ts-event ts-muted">An uneventful turn.</div>'}
        </div>
        <div class="ts-footer">
          <hr class="ts-rule">
          ${treasuryRow}
          <div class="ts-actions">
            <button class="btn gold" id="ts-continue-btn">Continue</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachTurnSummaryHandlers() {
  document.getElementById('ts-continue-btn')?.addEventListener('click', () => {
    cancelSpeech();
    state.pendingTurnSummary = null;
    render();
  });
}

function renderSettings() {
  return `
    <div class="panel panel-settings">
      <label class="settings-toggle-row">
        <input type="checkbox" id="ts-toggle" ${getTurnSummaryEnabled() ? 'checked' : ''}>
        <span>Turn Summary</span>
      </label>
      <label class="settings-toggle-row">
        <input type="checkbox" id="audio-toggle" ${getAudioEnabled() ? 'checked' : ''}>
        <span>Sound Effects</span>
      </label>
      <label class="settings-toggle-row">
        <input type="checkbox" id="speech-toggle" ${getSpeechEnabled() ? 'checked' : ''}>
        <span>Narration</span>
      </label>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dotted var(--ink-faded);text-align:center">
        <a href="rules.html" target="_blank"
           style="font-family:'IM Fell English SC',serif;font-size:12px;color:var(--gold);text-decoration:none;letter-spacing:0.06em">
          📜 Rules of Engagement
        </a>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Step-by-step token movement animation
// Moves the token one space at a time at STEP_MS intervals.
// Token movement via CSS transitions on the overlay layer.
// Only token positions are updated on each step — no board DOM rebuild.
// The CSS transition (140ms ease-out) provides smooth gliding between spaces.
// ---------------------------------------------------------------------------
function animateMove(p, fromPos, steps, onSettled) {
  const STEP_MS = 160;
  const dir     = steps >= 0 ? 1 : -1;
  const total   = Math.abs(steps);
  let   step    = 0;

  // Ensure token layer exists (render() may not have run yet if called directly)
  if (!document.querySelector('.token-layer')) renderTokenLayer();

  function doStep() {
    step++;
    const pos = ((fromPos + step * dir) % 40 + 40) % 40;
    p.position = pos;

    // Just reposition tokens on the overlay — no board DOM rebuild
    positionTokensOnLayer();

    if (step < total) {
      playTokenStep();
      setTimeout(doStep, STEP_MS);
    } else {
      playTokenLand();
      onSettled();
    }
  }

  doStep();
}

// ---------------------------------------------------------------------------
// Dice tumble animation
// Rapidly cycles random faces on each die for ~700ms, then settles on the
// final value with a short bounce. The two dice are offset by 100ms so they
// don't land at exactly the same moment.
// ---------------------------------------------------------------------------
function animateDiceRoll(finalValues, callback) {
  const dies = document.querySelectorAll('.die');
  if (!dies.length) { callback(); return; }

  HOOKS.onRollStart();

  const TUMBLE_MS  = 700;
  const TICK_MS    = 70;   // ~10 face changes per die
  const DIE_OFFSET = 100;  // ms between die starts

  const total = Math.min(dies.length, finalValues.length);
  let settled = 0;

  for (let i = 0; i < total; i++) {
    const dieEl   = dies[i];
    const finalVal = finalValues[i];

    setTimeout(() => {
      let elapsed = 0;
      dieEl.classList.remove('settled');

      const interval = setInterval(() => {
        elapsed += TICK_MS;
        if (elapsed >= TUMBLE_MS) {
          clearInterval(interval);
          dieEl.textContent = finalVal;
          dieEl.classList.add('settled');
          HOOKS.onSettle(i);
          settled++;
          if (settled === total) callback();
        } else {
          dieEl.textContent = 1 + Math.floor(Math.random() * 6);
        }
      }, TICK_MS);
    }, i * DIE_OFFSET);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
registerRenderer(render);
registerDiceAnimator(animateDiceRoll);
registerMoveAnimator(animateMove);
render();

// Reposition token overlay when window resizes (board changes size)
window.addEventListener('resize', () => {
  if (state.phase === 'playing') positionTokensOnLayer();
});

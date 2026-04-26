// ============================================================
//  RENDER — All DOM rendering and event-handler wiring
// ============================================================

import { state, PLAYER_COLORS, currentPlayer } from './state.js';
import { BOARD, spaceAt, playerAt, spaceGridPos } from './board.js';
import { COMMANDERS } from './commanders.js';
import {
  registerRenderer,
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
} from './rules.js';

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
    <div class="game-area">
      <div class="board-container">
        ${renderBoard()}
      </div>
      <div class="sidebar">
        ${renderPlayers()}
        ${renderActions()}
        ${renderSelectedSpace()}
        ${renderLog()}
      </div>
    </div>
  `;
  attachGameHandlers();

  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());

  if (state.pendingAction) {
    document.body.insertAdjacentHTML('beforeend', renderModal());
    attachModalHandlers();
  }
  if (state.phase === 'gameOver') {
    document.body.insertAdjacentHTML('beforeend', renderVictory());
    attachVictoryHandlers();
  }
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

/**
 * Render player tokens on a space.
 * ≤ 2 players → individual colored dots.
 * 3+ players  → first 2 dots + a "+N" overflow badge so nothing spills out.
 */
function renderTokens(players) {
  if (players.length === 0) return '';
  const visible = players.slice(0, 2);
  const overflow = players.length - visible.length;
  const dots = visible.map(p =>
    `<div class="player-token" style="background:${p.color}" title="${p.name}"></div>`
  ).join('');
  const badge = overflow > 0
    ? `<div class="token-overflow">+${overflow}</div>`
    : '';
  return `<div class="space-tokens">${dots}${badge}</div>`;
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
    const players = playerAt(sp.i);
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

    const tokens = renderTokens(players);

    const ownershipFlag = owner
      ? `<div class="ownership-flag" style="background:${owner.color}"></div>`
      : '';

    const buildingMarker = renderBuildingMarker(buildings);

    return `
      <div class="space ${sp.type === 'corner' ? 'corner' : ''} ${isSelected ? 'selected' : ''}"
           data-idx="${sp.i}"
           style="grid-column:${pos.col};grid-row:${pos.row};">
        ${inner}
        ${ownershipFlag}
        ${buildingMarker}
        <div class="space-tokens">${tokens}</div>
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
// Actions panel
// ---------------------------------------------------------------------------

function renderActions() {
  const p = currentPlayer();
  const buildableProps = BOARD.filter(s => canBuild(p, s));
  const canRoll = !state.rolledThisTurn || state.lastRoll[0] === state.lastRoll[1];

  return `
    <div class="panel">
      <div class="panel-title">Imperial Council</div>
      <button class="btn crimson" id="roll-btn" ${(!canRoll || state.pendingAction) ? 'disabled' : ''}>
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
  document.getElementById('roll-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.die').forEach(d => {
      d.classList.remove('rolling');
      void d.offsetWidth;
      d.classList.add('rolling');
    });
    setTimeout(() => rollDice(), 300);
  });

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

  document.querySelectorAll('[data-expand-player]').forEach(el => {
    el.addEventListener('click', () => {
      const id = +el.dataset.expandPlayer;
      state.expandedPlayer = state.expandedPlayer === id ? null : id;
      render();
    });
  });
}

function attachModalHandlers() {
  const a = state.pendingAction;
  if (!a) return;

  if (a.type === 'purchase') {
    document.getElementById('buy-btn')?.addEventListener('click', () => buyProperty(a.space));
    document.getElementById('decline-btn')?.addEventListener('click', declinePurchase);
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
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
registerRenderer(render);
render();

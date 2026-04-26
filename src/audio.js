// ============================================================
//  Audio — Web Audio API (sounds) + Web Speech API (narration)
//  All sounds are synthesized — no external files required.
//  Import into render.js only; never import into rules.js
//  (rules.js must stay DOM-free for Vitest).
// ============================================================

// ---------------------------------------------------------------------------
// Audio context (lazy-init — must be created on user gesture in modern browsers)
// ---------------------------------------------------------------------------
let _actx = null;
function ac() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

// ---------------------------------------------------------------------------
// Settings (persisted)
// ---------------------------------------------------------------------------
function ls(key, def) {
  try { const v = localStorage.getItem(key); return v === null ? def : v === 'true'; }
  catch { return def; }
}

let _audioOn  = ls('audioEnabled',  true);
let _speechOn = ls('speechEnabled', true);

export function getAudioEnabled()       { return _audioOn; }
export function getSpeechEnabled()      { return _speechOn; }
export function setAudioEnabled(v)  { _audioOn  = v; try { localStorage.setItem('audioEnabled',  v); } catch {} }
export function setSpeechEnabled(v) { _speechOn = v; try { localStorage.setItem('speechEnabled', v); } catch {} }

// ---------------------------------------------------------------------------
// Low-level primitives
// ---------------------------------------------------------------------------

function tone(freq, type, dur, gain = 0.28, delay = 0) {
  if (!_audioOn) return;
  try {
    const c = ac(), t = c.currentTime + delay;
    const osc = c.createOscillator(), g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (_) {}
}

function noise(dur, gain = 0.15, bandHz = 400, delay = 0) {
  if (!_audioOn) return;
  try {
    const c = ac(), t = c.currentTime + delay;
    const len = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch  = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = bandHz; flt.Q.value = 1.5;
    const g = c.createGain();
    src.connect(flt); flt.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Named sounds
// ---------------------------------------------------------------------------

/** Dice rattling noise burst */
export function playDiceRoll() {
  noise(0.55, 0.3, 600);
  tone(200, 'triangle', 0.35, 0.08);
}

/** Single die face changing tick */
export function playDiceTick() {
  noise(0.04, 0.12, 1800);
}

/** Sharp click when a die settles on its final value.
 *  die=0 → left pan, die=1 → right pan (staggered spatial effect).
 */
export function playDiceSettle(die = 0) {
  if (!_audioOn) return;
  try {
    const c = ac(), t = c.currentTime;
    const pan = die === 0 ? -0.5 : 0.5;

    const osc = c.createOscillator();
    const g   = c.createGain();
    const panner = c.createStereoPanner();
    osc.connect(g); g.connect(panner); panner.connect(c.destination);
    panner.pan.setValueAtTime(pan, t);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.start(t); osc.stop(t + 0.10);

    // noise burst, same pan
    const len = Math.ceil(c.sampleRate * 0.05);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const ch  = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 1400; flt.Q.value = 1.5;
    const gn  = c.createGain();
    const pn  = c.createStereoPanner();
    src.connect(flt); flt.connect(gn); gn.connect(pn); pn.connect(c.destination);
    pn.pan.setValueAtTime(pan, t);
    gn.gain.setValueAtTime(0.16, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.start(t); src.stop(t + 0.07);
  } catch (_) {}
}

/** Soft wooden tap — token moving one space */
export function playTokenStep() {
  tone(240, 'triangle', 0.07, 0.16);
  noise(0.05, 0.09, 450);
}

/** Heavier thud — token landing on final space */
export function playTokenLand() {
  tone(140, 'triangle', 0.14, 0.35);
  noise(0.09, 0.2, 280);
}

/** Upward arpeggio — player passes Mobilization */
export function playPassMobilization() {
  [330, 415, 494, 659].forEach((f, i) => tone(f, 'triangle', 0.18, 0.3, i * 0.1));
}

/** Coin deposit — buying a territory */
export function playPurchase() {
  tone(1100, 'sine', 0.09, 0.18, 0.00);
  tone(800,  'sine', 0.11, 0.18, 0.07);
  tone(550,  'sine', 0.16, 0.18, 0.14);
}

/** Coins leaving — paying rent */
export function playRentPaid() {
  tone(480, 'sine', 0.10, 0.2, 0.00);
  tone(320, 'sine', 0.14, 0.2, 0.07);
  noise(0.15, 0.12, 320, 0.02);
}

/** Paper whoosh — drawing a card */
export function playCardDraw() {
  noise(0.22, 0.2, 2800);
  tone(580, 'sine', 0.13, 0.1, 0.1);
}

/** Descending dramatic tone — exiled to Elba */
export function playExile() {
  try {
    const c = ac(), t = c.currentTime;
    const osc = c.createOscillator(), g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 1.1);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.start(t); osc.stop(t + 1.4);
  } catch (_) {}
}

/** Ascending fanfare — victory */
export function playVictory() {
  [262, 330, 392, 523].forEach((f, i) => tone(f, 'triangle', 0.22, 0.32, i * 0.1));
  [523, 659, 784].forEach((f, i) => tone(f, 'sine', 0.65, 0.22, 0.52 + i * 0.04));
}

/** Soft chime — end of turn */
export function playTurnEnd() {
  tone(440, 'sine', 0.24, 0.12, 0.00);
  tone(330, 'sine', 0.30, 0.08, 0.16);
}

// ---------------------------------------------------------------------------
// Speech — Web Speech API
// ---------------------------------------------------------------------------

let _voiceCache = null;

function getVoice() {
  if (_voiceCache) return _voiceCache;
  const all = window.speechSynthesis?.getVoices() ?? [];
  _voiceCache =
    all.find(v => /daniel|arthur|george|alex/i.test(v.name) && v.lang.startsWith('en')) ||
    all.find(v => v.lang === 'en-GB') ||
    all.find(v => v.lang.startsWith('en-')) ||
    all[0] || null;
  return _voiceCache;
}

// Voices load async in Chrome — reset cache on change
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { _voiceCache = null; };
}

/**
 * Speak text via Web Speech API.
 * opts.interrupt=true cancels any current speech first (use for high-priority lines).
 */
export function speak(text, opts = {}) {
  if (!_speechOn) return;
  if (!window.speechSynthesis) return;
  if (opts.interrupt) window.speechSynthesis.cancel();
  const utt    = new SpeechSynthesisUtterance(text);
  utt.rate     = opts.rate   ?? 0.82;
  utt.pitch    = opts.pitch  ?? 0.88;
  utt.volume   = opts.volume ?? 0.85;
  const voice  = getVoice();
  if (voice) utt.voice = voice;
  window.speechSynthesis.speak(utt);
}

/** Cancel any pending speech (call on turn transitions or skip). */
export function cancelSpeech() {
  try { window.speechSynthesis?.cancel(); } catch (_) {}
}

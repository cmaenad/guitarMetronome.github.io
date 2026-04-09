import { Metronome } from './metronome.js';
import { AudioInput } from './audio.js';
import { Game, PATTERNS } from './game.js';
import { saveState, loadState } from './storage.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const bpmSlider      = document.getElementById('bpm-slider');
const bpmDisplay     = document.getElementById('bpm-display');
const beatsSelect    = document.getElementById('beats-select');
const patternSelect  = document.getElementById('pattern-select');
const startBtn       = document.getElementById('start-btn');
const scoreEl        = document.getElementById('score');
const streakEl       = document.getElementById('streak');
const beatLights     = document.getElementById('beat-lights');
const feedbackBg     = document.getElementById('feedback-bg');
const sensitivitySlider = document.getElementById('sensitivity-slider');
const sensitivityDisplay = document.getElementById('sensitivity-display');

// ── State ─────────────────────────────────────────────────────────────────────
let activeBeat = -1;

const game = new Game({
  onScoreChange: (score, streak) => {
    scoreEl.textContent = score;
    streakEl.textContent = streak;
    persist();
  },
  onFeedback: (type) => {
    feedbackBg.className = 'feedback-bg ' + type;
  },
});

const metronome = new Metronome({
  bpm: 80,
  beatsPerBar: 4,
  onBeat: (beatIndex) => {
    activeBeat = beatIndex;
    renderLights();
    game.onBeat(beatIndex, performance.now());
  },
});

const audioInput = new AudioInput({
  onOnset: (timeMs) => {
    game.onOnset(timeMs);
  },
});

// ── Beat lights ───────────────────────────────────────────────────────────────
function buildLights(n) {
  beatLights.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const li = document.createElement('div');
    li.className = 'beat-light';
    li.dataset.index = i;
    beatLights.appendChild(li);
  }
}

function renderLights() {
  const lights = beatLights.querySelectorAll('.beat-light');
  lights.forEach((l, i) => {
    l.classList.toggle('active', i === activeBeat);
    l.classList.toggle('accent', i === 0 && activeBeat === 0);
  });
}

// ── Pattern selector ──────────────────────────────────────────────────────────
function buildPatternOptions(beats) {
  patternSelect.innerHTML = '';
  const options = PATTERNS[beats] || PATTERNS[4];
  options.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.label;
    patternSelect.appendChild(opt);
  });
  applyPattern(beats, 0);
}

function applyPattern(beats, idx) {
  const options = PATTERNS[beats] || PATTERNS[4];
  const chosen = options[idx] || options[0];
  game.setPattern(chosen.value);
  persist();
}

// ── Controls ──────────────────────────────────────────────────────────────────
bpmSlider.addEventListener('input', () => {
  const bpm = parseInt(bpmSlider.value);
  bpmDisplay.textContent = bpm;
  metronome.setBpm(bpm);
  persist();
});

beatsSelect.addEventListener('change', () => {
  const beats = parseInt(beatsSelect.value);
  metronome.setBeatsPerBar(beats);
  activeBeat = -1;
  buildLights(beats);
  buildPatternOptions(beats);
  persist();
});

patternSelect.addEventListener('change', () => {
  const beats = parseInt(beatsSelect.value);
  applyPattern(beats, parseInt(patternSelect.value));
});

sensitivitySlider.addEventListener('input', () => {
  const val = parseFloat(sensitivitySlider.value);
  sensitivityDisplay.textContent = val.toFixed(1);
  audioInput.threshold = val;
  persist();
});

startBtn.addEventListener('click', async () => {
  if (metronome.isRunning) {
    metronome.stop();
    audioInput.stop();
    startBtn.textContent = '▶ Iniciar';
    startBtn.classList.remove('active');
    activeBeat = -1;
    renderLights();
    game.reset();
  } else {
    try {
      await audioInput.start(metronome.getAudioContext());
      metronome.start();
      startBtn.textContent = '■ Detener';
      startBtn.classList.add('active');
    } catch (err) {
      alert('No se pudo acceder al micrófono: ' + err.message);
    }
  }
});

// ── Persistence ───────────────────────────────────────────────────────────────
function persist() {
  saveState({
    bpm: parseInt(bpmSlider.value),
    beats: parseInt(beatsSelect.value),
    patternIdx: parseInt(patternSelect.value),
    sensitivity: parseFloat(sensitivitySlider.value),
    ...game.getState(),
  });
}

function restoreState() {
  const s = loadState();
  if (!s) return;

  const bpm = s.bpm ?? 80;
  bpmSlider.value = bpm;
  bpmDisplay.textContent = bpm;
  metronome.setBpm(bpm);

  const beats = s.beats ?? 4;
  beatsSelect.value = beats;
  metronome.setBeatsPerBar(beats);
  buildLights(beats);
  buildPatternOptions(beats);

  const pidx = s.patternIdx ?? 0;
  patternSelect.value = pidx;
  applyPattern(beats, pidx);

  const sens = s.sensitivity ?? 1.5;
  sensitivitySlider.value = sens;
  sensitivityDisplay.textContent = parseFloat(sens).toFixed(1);
  audioInput.threshold = sens;

  game.loadState(s);
  scoreEl.textContent = s.score ?? 0;
  streakEl.textContent = s.streak ?? 0;
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildLights(4);
buildPatternOptions(4);
restoreState();

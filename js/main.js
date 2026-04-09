import { Metronome } from './metronome.js';
import { AudioInput } from './audio.js';
import { Game, PATTERNS } from './game.js';
import { saveState, loadState, clearState, DEFAULTS } from './storage.js';
import { LatencyCalibrator } from './latency-calibrator.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const bpmSlider          = document.getElementById('bpm-slider');
const bpmDisplay         = document.getElementById('bpm-display');
const beatsSelect        = document.getElementById('beats-select');
const patternSelect      = document.getElementById('pattern-select');
const startBtn           = document.getElementById('start-btn');
const scoreEl            = document.getElementById('score');
const streakEl           = document.getElementById('streak');
const beatLights         = document.getElementById('beat-lights');
const feedbackBg         = document.getElementById('feedback-bg');
const sensitivitySlider  = document.getElementById('sensitivity-slider');
const sensitivityDisplay = document.getElementById('sensitivity-display');
const helpBtn            = document.getElementById('help-btn');
const helpModal          = document.getElementById('help-modal');
const helpClose          = document.getElementById('help-close');
const latencyBtn         = document.getElementById('latency-btn');
const resetBtn           = document.getElementById('reset-btn');
const latencyInfo        = document.getElementById('latency-info');
const latencyValue       = document.getElementById('latency-value');

// ── State ─────────────────────────────────────────────────────────────────────
let activeBeat = -1;
let calibratedLatencySec = null;

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
  onBeat: (beatIndex, beatAudioTime) => {
    activeBeat = beatIndex;
    renderLights();
    game.onBeat(beatIndex, beatAudioTime);
  },
});

const audioInput = new AudioInput({
  onOnset: (onsetAudioTime) => {
    game.onOnset(onsetAudioTime);
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

// ── Latency display ───────────────────────────────────────────────────────────
function updateLatencyDisplay() {
  if (calibratedLatencySec !== null) {
    latencyInfo.hidden = false;
    latencyValue.textContent = `${(calibratedLatencySec * 1000).toFixed(0)} ms`;
  } else {
    latencyInfo.hidden = true;
  }
}

function applyLatency(sec) {
  calibratedLatencySec = sec;
  // The calibrated delta is: onsetAudioTime - bounceAudioTime
  // If positive (user played late), we need to shift the beat window forward,
  // which is equivalent to subtracting this offset from the onset timestamp.
  // We store it as latencyCompSec so AudioInput subtracts it automatically.
  audioInput.latencyCompSec = sec !== null ? sec : 0.06;
  updateLatencyDisplay();
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

// ── Latency calibration ───────────────────────────────────────────────────────
latencyBtn.addEventListener('click', async () => {
  // Need mic + AudioContext running for calibration
  let needsStop = false;
  if (!metronome.isRunning) {
    try {
      await audioInput.start(metronome.getAudioContext());
      needsStop = true;
    } catch (err) {
      alert('Se necesita acceso al micrófono para calibrar: ' + err.message);
      return;
    }
  }

  const cal = new LatencyCalibrator({
    audioContext: metronome.getAudioContext(),
    audioInput,
    onDone: (avgLatencySec) => {
      applyLatency(avgLatencySec);
      persist();
      if (needsStop) audioInput.stop();
    },
    onCancel: () => {
      if (needsStop) audioInput.stop();
    },
  });
  cal.open();
});

// ── Reset to defaults ─────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  if (!confirm('¿Restablecer toda la configuración a los valores por defecto?')) return;

  // Stop if running
  if (metronome.isRunning) {
    metronome.stop();
    audioInput.stop();
    startBtn.textContent = '▶ Iniciar';
    startBtn.classList.remove('active');
    activeBeat = -1;
    renderLights();
  }

  clearState();
  calibratedLatencySec = null;
  applyLatency(null);

  bpmSlider.value = DEFAULTS.bpm;
  bpmDisplay.textContent = DEFAULTS.bpm;
  metronome.setBpm(DEFAULTS.bpm);

  beatsSelect.value = DEFAULTS.beats;
  metronome.setBeatsPerBar(DEFAULTS.beats);
  buildLights(DEFAULTS.beats);
  buildPatternOptions(DEFAULTS.beats);

  sensitivitySlider.value = DEFAULTS.sensitivity;
  sensitivityDisplay.textContent = DEFAULTS.sensitivity.toFixed(1);
  audioInput.threshold = DEFAULTS.sensitivity;

  game.reset();
  persist();
});

// ── Persistence ───────────────────────────────────────────────────────────────
function persist() {
  saveState({
    bpm: parseInt(bpmSlider.value),
    beats: parseInt(beatsSelect.value),
    patternIdx: parseInt(patternSelect.value),
    sensitivity: parseFloat(sensitivitySlider.value),
    calibratedLatencySec,
    ...game.getState(),
  });
}

function restoreState() {
  const s = loadState();
  if (!s) return;

  const bpm = s.bpm ?? DEFAULTS.bpm;
  bpmSlider.value = bpm;
  bpmDisplay.textContent = bpm;
  metronome.setBpm(bpm);

  const beats = s.beats ?? DEFAULTS.beats;
  beatsSelect.value = beats;
  metronome.setBeatsPerBar(beats);
  buildLights(beats);
  buildPatternOptions(beats);

  const pidx = s.patternIdx ?? DEFAULTS.patternIdx;
  patternSelect.value = pidx;
  applyPattern(beats, pidx);

  const sens = s.sensitivity ?? DEFAULTS.sensitivity;
  sensitivitySlider.value = sens;
  sensitivityDisplay.textContent = parseFloat(sens).toFixed(1);
  audioInput.threshold = sens;

  if (s.calibratedLatencySec !== undefined && s.calibratedLatencySec !== null) {
    applyLatency(s.calibratedLatencySec);
  }

  game.loadState(s);
  scoreEl.textContent = s.score ?? 0;
  streakEl.textContent = s.streak ?? 0;
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildLights(4);
buildPatternOptions(4);
restoreState();

// ── Help modal ────────────────────────────────────────────────────────────────
helpBtn.addEventListener('click', () => { helpModal.hidden = false; });
helpClose.addEventListener('click', () => { helpModal.hidden = true; });
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.hidden = true; });

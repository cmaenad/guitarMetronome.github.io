const KEY = 'guitarRhythmGame';

export const DEFAULTS = {
  bpm: 80,
  beats: 4,
  patternIdx: 0,
  sensitivity: 1.5,
  score: 0,
  streak: 0,
  pattern: [1, 1, 1, 1],
  calibratedLatencySec: null, // null = not calibrated yet
};

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state', e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* ignore */ }
}

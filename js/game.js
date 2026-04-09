/**
 * Game — scoring logic.
 *
 * All times are AudioContext.currentTime (seconds).
 *
 * Beat window:
 *   A hit is valid if the onset falls within [beatTime - earlyWindow, beatTime + lateWindow].
 *   earlyWindow: how early the user can play (anticipation).
 *   lateWindow:  how late the user can play (reaction).
 *   Both default to 180ms, which is generous for human timing.
 *
 * The latency calibration is handled entirely in AudioInput (onset timestamps
 * are already compensated before reaching here). Game.js never touches latency.
 */
export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback    = onFeedback;

    this.score   = 0;
    this.streak  = 0;

    this._earlyWindowSec  = 0.18; // accept up to 180ms before beat
    this._lateWindowSec   = 0.18; // accept up to 180ms after beat

    this._beatTimes       = []; // ring buffer of last 2 beat AudioContext times
    this._hitThisBeat     = false;
    this._feedbackTimer   = null;
    this.pattern          = [1, 1, 1, 1];
  }

  // Called by metronome — beatAudioTime is the exact AudioContext.currentTime of the beat
  onBeat(beatIndex, beatAudioTime) {
    // Check if the previous beat was missed
    if (this._beatTimes.length > 0 && !this._hitThisBeat) {
      this._miss();
    }
    this._beatTimes = [beatAudioTime];
    this._hitThisBeat = false;
  }

  // Called by AudioInput — onsetAudioTime is already latency-compensated
  onOnset(onsetAudioTime) {
    if (this._beatTimes.length === 0) return;
    const beatTime = this._beatTimes[0];
    const delta    = onsetAudioTime - beatTime;

    if (delta >= -this._earlyWindowSec && delta <= this._lateWindowSec && !this._hitThisBeat) {
      this._hitThisBeat = true;
      this._hit();
    }
  }

  _hit() {
    this.score += 10 + this.streak * 2;
    this.streak++;
    this.onScoreChange && this.onScoreChange(this.score, this.streak);
    this._feedback('hit');
  }

  _miss() {
    this.score  = 0;
    this.streak = 0;
    this.onScoreChange && this.onScoreChange(this.score, this.streak);
    this._feedback('miss');
  }

  _feedback(type) {
    clearTimeout(this._feedbackTimer);
    this.onFeedback && this.onFeedback(type);
    this._feedbackTimer = setTimeout(() => {
      this.onFeedback && this.onFeedback('idle');
    }, 400);
  }

  setPattern(pattern) { this.pattern = pattern; }

  reset() {
    this.score         = 0;
    this.streak        = 0;
    this._beatTimes    = [];
    this._hitThisBeat  = false;
    this.onScoreChange && this.onScoreChange(0, 0);
    this.onFeedback    && this.onFeedback('idle');
  }

  getState() {
    return { score: this.score, streak: this.streak, pattern: this.pattern };
  }

  loadState(state) {
    if (!state) return;
    this.score   = state.score   ?? 0;
    this.streak  = state.streak  ?? 0;
    this.pattern = state.pattern ?? [1, 1, 1, 1];
  }
}

// ── Available patterns ────────────────────────────────────────────────────────
export const PATTERNS = {
  2: [
    { label: '2 negras',   value: [1, 1] },
    { label: '1 blanca',   value: [2] },
    { label: '4 corcheas', value: [0.5, 0.5, 0.5, 0.5] },
  ],
  3: [
    { label: '3 negras',        value: [1, 1, 1] },
    { label: '1 blanca + negra', value: [2, 1] },
    { label: '6 corcheas',      value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  ],
  4: [
    { label: '4 negras',           value: [1, 1, 1, 1] },
    { label: '1 redonda',          value: [4] },
    { label: '2 blancas',          value: [2, 2] },
    { label: '8 corcheas',         value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    { label: '1 blanca + 2 negras', value: [2, 1, 1] },
  ],
  6: [
    { label: '6 negras',     value: [1, 1, 1, 1, 1, 1] },
    { label: '2 grupos de 3', value: [3, 3] },
    { label: '12 corcheas',  value: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5] },
  ],
};

/**
 * Game — scoring logic.
 *
 * KEY DESIGN: Beat times are registered in advance (from the scheduler, before
 * the beat plays) so the onset detector can always find the nearest beat without
 * waiting for a setTimeout callback. This eliminates all JS-thread jitter from
 * the scoring path.
 *
 * All times: AudioContext.currentTime (seconds).
 *
 * Window: ±WINDOW_FRAC of the beat duration, centred on the beat.
 * Default 20% → at 80 BPM (750ms/beat) → ±150ms.
 * Tight enough to be musical, wide enough for human reaction.
 *
 * Miss logic: a beat is missed if no onset arrives within its window.
 * Evaluated lazily when the next beat is registered (no extra timers needed —
 * avoids setTimeout drift entirely in the scoring path).
 */

const WINDOW_FRAC = 0.20; // fraction of beat duration for hit window each side

export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback    = onFeedback;

    this.score   = 0;
    this.streak  = 0;
    this.pattern = [1, 1, 1, 1];

    // Ring buffer: last two scheduled beats
    // Each entry: { time: AudioContext seconds, duration: seconds, hit: bool }
    this._beats        = [];
    this._feedbackTimer = null;
  }

  /**
   * Called by the SCHEDULER (not the setTimeout UI callback) for every beat
   * that is about to be queued. beatTime is the exact AudioContext time.
   * This runs ahead of the actual beat, so the window is open before the sound plays.
   */
  scheduleBeat(beatTime, beatDuration) {
    // Evaluate miss for the previous beat before replacing it
    if (this._beats.length > 0) {
      const prev = this._beats[this._beats.length - 1];
      if (!prev.hit) this._miss();
    }

    this._beats.push({ time: beatTime, duration: beatDuration, hit: false });
    // Keep only last 2 to avoid unbounded growth
    if (this._beats.length > 2) this._beats.shift();
  }

  /**
   * Called by AudioInput — onsetAudioTime is already latency-compensated.
   * Finds the nearest scheduled beat and checks if the onset is within its window.
   */
  onOnset(onsetAudioTime) {
    if (this._beats.length === 0) return;

    // Find the beat whose window contains this onset
    for (let i = this._beats.length - 1; i >= 0; i--) {
      const b      = this._beats[i];
      const half   = b.duration * WINDOW_FRAC;
      const delta  = onsetAudioTime - b.time;

      if (delta >= -half && delta <= half) {
        if (!b.hit) {
          b.hit = true;
          this._hit();
        }
        return;
      }
    }
    // Onset outside all windows — not a miss, just noise or off-beat
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
    this._feedbackTimer = setTimeout(
      () => this.onFeedback && this.onFeedback('idle'), 350
    );
  }

  setPattern(p) { this.pattern = p; }

  reset() {
    clearTimeout(this._feedbackTimer);
    this.score   = 0;
    this.streak  = 0;
    this._beats  = [];
    this.onScoreChange && this.onScoreChange(0, 0);
    this.onFeedback    && this.onFeedback('idle');
  }

  getState()      { return { score: this.score, streak: this.streak, pattern: this.pattern }; }
  loadState(s)    {
    if (!s) return;
    this.score   = s.score   ?? 0;
    this.streak  = s.streak  ?? 0;
    this.pattern = s.pattern ?? [1, 1, 1, 1];
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
    { label: '3 negras',         value: [1, 1, 1] },
    { label: '1 blanca + negra', value: [2, 1] },
    { label: '6 corcheas',       value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  ],
  4: [
    { label: '4 negras',            value: [1, 1, 1, 1] },
    { label: '1 redonda',           value: [4] },
    { label: '2 blancas',           value: [2, 2] },
    { label: '8 corcheas',          value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    { label: '1 blanca + 2 negras', value: [2, 1, 1] },
  ],
  6: [
    { label: '6 negras',      value: [1, 1, 1, 1, 1, 1] },
    { label: '2 grupos de 3', value: [3, 3] },
    { label: '12 corcheas',   value: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5] },
  ],
};

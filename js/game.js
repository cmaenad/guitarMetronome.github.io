/**
 * Game — scoring logic.
 *
 * All times are AudioContext.currentTime (seconds).
 *
 * Beat window:
 *   Valid hit: onset within [beatTime - earlyFrac, beatTime + lateFrac] of the beat interval.
 *   Window is proportional to the beat duration so it stays musically meaningful at any BPM.
 *   Default: ±15% of the beat duration (e.g. 80 BPM → beat = 750ms → window = ±112ms).
 *
 *   Miss is triggered immediately when the window expires — not deferred to the next beat.
 *   This gives instant red feedback when the user plays too late or not at all.
 */
export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback    = onFeedback;

    this.score  = 0;
    this.streak = 0;

    // Fraction of beat duration accepted as early/late (0.15 = 15%)
    this.earlyFrac = 0.15;
    this.lateFrac  = 0.15;

    this._beatTime      = null;  // AudioContext time of current beat
    this._beatDuration  = null;  // seconds per beat (set by metronome)
    this._hitThisBeat   = false;
    this._missTimer     = null;  // fires when the late window expires
    this._feedbackTimer = null;
    this.pattern        = [1, 1, 1, 1];
  }

  /**
   * Called by metronome on every beat.
   * beatAudioTime — exact AudioContext.currentTime of the beat.
   * beatDuration  — seconds per beat at current BPM (60 / bpm).
   */
  onBeat(beatIndex, beatAudioTime, beatDuration) {
    // Cancel any pending miss timer from the previous beat
    clearTimeout(this._missTimer);

    // If previous beat window closed without a hit → miss
    if (this._beatTime !== null && !this._hitThisBeat) {
      this._miss();
    }

    this._beatTime     = beatAudioTime;
    this._beatDuration = beatDuration;
    this._hitThisBeat  = false;

    // Schedule a miss if the late window expires with no hit
    const lateWindowMs = beatDuration * this.lateFrac * 1000;
    this._missTimer = setTimeout(() => {
      if (!this._hitThisBeat) this._miss();
    }, lateWindowMs);
  }

  /**
   * Called by AudioInput — onsetAudioTime is already latency-compensated.
   */
  onOnset(onsetAudioTime) {
    if (this._beatTime === null || this._beatDuration === null) return;

    const delta      = onsetAudioTime - this._beatTime;
    const earlyLimit = -this._beatDuration * this.earlyFrac;
    const lateLimit  =  this._beatDuration * this.lateFrac;

    if (delta >= earlyLimit && delta <= lateLimit && !this._hitThisBeat) {
      clearTimeout(this._missTimer); // cancel the pending miss
      this._hitThisBeat = true;
      this._hit();
    }
    // Onset outside window: ignore (not a miss — user may have played noise)
    // Miss is only triggered by the timer expiry or the next beat arriving
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
    }, 350);
  }

  setPattern(pattern) { this.pattern = pattern; }

  reset() {
    clearTimeout(this._missTimer);
    clearTimeout(this._feedbackTimer);
    this.score        = 0;
    this.streak       = 0;
    this._beatTime    = null;
    this._hitThisBeat = false;
    this.onScoreChange && this.onScoreChange(0, 0);
    this.onFeedback   && this.onFeedback('idle');
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

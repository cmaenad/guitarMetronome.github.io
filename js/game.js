// Game logic: scoring, beat window, pattern config
export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback = onFeedback; // callback('hit'|'miss'|'idle')
    this.score = 0;
    this.streak = 0;
    this._beatWindowMs = 200; // ±ms around beat to count as hit
    this._lastBeatTime = null;
    this._hitThisBeat = false;
    this._feedbackTimer = null;
    // Pattern: array of subdivisions per beat slot
    // e.g. [2,2,2,2] = 4 beats each split in 2 (corcheas)
    this.pattern = [1, 1, 1, 1];
  }

  // Called by metronome on each beat
  onBeat(beatIndex, timeMs) {
    // Check if previous beat was missed
    if (this._lastBeatTime !== null && !this._hitThisBeat) {
      this._miss();
    }
    this._lastBeatTime = timeMs ?? performance.now();
    this._hitThisBeat = false;
  }

  // Called by audio input on onset
  onOnset(timeMs) {
    if (this._lastBeatTime === null) return;
    const delta = Math.abs(timeMs - this._lastBeatTime);
    if (delta <= this._beatWindowMs && !this._hitThisBeat) {
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
    this.score = 0;
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

  setPattern(pattern) {
    this.pattern = pattern;
  }

  reset() {
    this.score = 0;
    this.streak = 0;
    this._lastBeatTime = null;
    this._hitThisBeat = false;
    this.onScoreChange && this.onScoreChange(0, 0);
    this.onFeedback && this.onFeedback('idle');
  }

  getState() {
    return { score: this.score, streak: this.streak, pattern: this.pattern };
  }

  loadState(state) {
    if (!state) return;
    this.score = state.score ?? 0;
    this.streak = state.streak ?? 0;
    this.pattern = state.pattern ?? [1, 1, 1, 1];
  }
}

// Available patterns per number of beats
export const PATTERNS = {
  2: [
    { label: '2 negras', value: [1, 1] },
    { label: '1 blanca', value: [2] },
    { label: '4 corcheas', value: [0.5, 0.5, 0.5, 0.5] },
  ],
  3: [
    { label: '3 negras', value: [1, 1, 1] },
    { label: '1 blanca + negra', value: [2, 1] },
    { label: '6 corcheas', value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  ],
  4: [
    { label: '4 negras', value: [1, 1, 1, 1] },
    { label: '1 redonda', value: [4] },
    { label: '2 blancas', value: [2, 2] },
    { label: '8 corcheas', value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    { label: '1 blanca + 2 negras', value: [2, 1, 1] },
  ],
  6: [
    { label: '6 negras', value: [1, 1, 1, 1, 1, 1] },
    { label: '2 grupos de 3', value: [3, 3] },
    { label: '12 corcheas', value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  ],
};

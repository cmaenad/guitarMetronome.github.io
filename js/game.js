// Game logic: scoring, beat window, pattern config
// All times are in AudioContext.currentTime (seconds)
export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback = onFeedback; // callback('hit'|'miss'|'idle')
    this.score = 0;
    this.streak = 0;
    // Acceptance window: ±seconds around the beat
    // 0.18s = 180ms each side, generous enough for human reaction
    this._beatWindowSec = 0.18;
    this._lastBeatAudioTime = null;
    this._hitThisBeat = false;
    this._feedbackTimer = null;
    this.pattern = [1, 1, 1, 1];
  }

  // Called by metronome — beatAudioTime is AudioContext.currentTime of the beat
  onBeat(beatIndex, beatAudioTime) {
    // If previous beat was never hit, count as miss
    if (this._lastBeatAudioTime !== null && !this._hitThisBeat) {
      this._miss();
    }
    this._lastBeatAudioTime = beatAudioTime;
    this._hitThisBeat = false;
  }

  // Called by audio input — onsetAudioTime is AudioContext.currentTime of the onset
  onOnset(onsetAudioTime) {
    if (this._lastBeatAudioTime === null) return;
    const delta = Math.abs(onsetAudioTime - this._lastBeatAudioTime);
    if (delta <= this._beatWindowSec && !this._hitThisBeat) {
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

  setPattern(pattern) { this.pattern = pattern; }

  reset() {
    this.score = 0;
    this.streak = 0;
    this._lastBeatAudioTime = null;
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

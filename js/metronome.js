// Metronome using Web Audio API scheduler (lookahead scheduling)
export class Metronome {
  constructor({ bpm = 80, beatsPerBar = 4, onBeat } = {}) {
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.onBeat = onBeat; // callback(beatIndex 0-based)
    this._ctx = null;
    this._nextBeatTime = 0;
    this._currentBeat = 0;
    this._timerId = null;
    this._running = false;
    this.lookahead = 25;       // ms between scheduler calls
    this.scheduleAhead = 0.1;  // seconds to schedule ahead
  }

  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }

  _scheduleClick(time, isAccent) {
    const ctx = this._getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = isAccent ? 1000 : 800;
    gain.gain.setValueAtTime(isAccent ? 0.4 : 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  _scheduler() {
    const ctx = this._getCtx();
    const secondsPerBeat = 60 / this.bpm;
    while (this._nextBeatTime < ctx.currentTime + this.scheduleAhead) {
      const beat = this._currentBeat;
      this._scheduleClick(this._nextBeatTime, beat === 0);
      // fire callback slightly before the beat for UI sync
      const delay = Math.max(0, (this._nextBeatTime - ctx.currentTime) * 1000);
      setTimeout(() => this.onBeat && this.onBeat(beat), delay);
      this._currentBeat = (this._currentBeat + 1) % this.beatsPerBar;
      this._nextBeatTime += secondsPerBeat;
    }
    this._timerId = setTimeout(() => this._scheduler(), this.lookahead);
  }

  start() {
    if (this._running) return;
    this._running = true;
    const ctx = this._getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    this._currentBeat = 0;
    this._nextBeatTime = ctx.currentTime + 0.05;
    this._scheduler();
  }

  stop() {
    this._running = false;
    clearTimeout(this._timerId);
  }

  setBpm(bpm) {
    this.bpm = bpm;
  }

  setBeatsPerBar(n) {
    this.beatsPerBar = n;
    this._currentBeat = 0;
  }

  getAudioContext() {
    return this._getCtx();
  }

  get isRunning() {
    return this._running;
  }
}

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
    // Layered click: sine body + triangle attack for punchier sound
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = isAccent ? 1200 : 900;
    osc2.frequency.value = isAccent ? 600 : 450;
    const vol = isAccent ? 1.0 : 0.75;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.start(time);  osc.stop(time + 0.13);
    osc2.start(time); osc2.stop(time + 0.13);
  }

  _scheduler() {
    const ctx = this._getCtx();
    const secondsPerBeat = 60 / this.bpm;
    while (this._nextBeatTime < ctx.currentTime + this.scheduleAhead) {
      const beat = this._currentBeat;
      const beatTime = this._nextBeatTime;
      this._scheduleClick(beatTime, beat === 0);
      // Precise delay: schedule UI update to fire exactly when audio plays
      const delayMs = (beatTime - ctx.currentTime) * 1000;
      setTimeout(() => this.onBeat && this.onBeat(beat), Math.max(0, delayMs));
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

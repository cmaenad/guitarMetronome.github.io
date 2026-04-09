/**
 * Metronome — Web Audio API lookahead scheduler.
 *
 * Two separate callbacks:
 *   onSchedule(beatIndex, beatAudioTime, beatDuration)
 *     → called immediately when the beat is queued into the audio graph.
 *       Used for game scoring. No setTimeout, no jitter.
 *
 *   onBeat(beatIndex, beatAudioTime)
 *     → called via setTimeout timed to fire when the audio actually plays.
 *       Used only for UI (lights). Jitter here is fine — it's visual only.
 */
export class Metronome {
  constructor({ bpm = 80, beatsPerBar = 4, onSchedule, onBeat } = {}) {
    this.bpm         = bpm;
    this.beatsPerBar = beatsPerBar;
    this.onSchedule  = onSchedule; // scoring — called ahead of time, no delay
    this.onBeat      = onBeat;     // UI only — called via setTimeout

    this._ctx          = null;
    this._nextBeatTime = 0;
    this._currentBeat  = 0;
    this._timerId      = null;
    this._running      = false;
    this._lookahead    = 25;   // ms between scheduler polls
    this._scheduleAhead = 0.1; // seconds to schedule ahead
  }

  _getCtx() {
    if (!this._ctx)
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this._ctx;
  }

  _scheduleClick(time, isAccent) {
    const ctx  = this._getCtx();
    const osc  = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.type  = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value  = isAccent ? 1200 : 900;
    osc2.frequency.value = isAccent ? 600  : 450;
    const vol = isAccent ? 1.0 : 0.75;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.start(time);  osc.stop(time + 0.13);
    osc2.start(time); osc2.stop(time + 0.13);
  }

  _scheduler() {
    const ctx            = this._getCtx();
    const secondsPerBeat = 60 / this.bpm;

    while (this._nextBeatTime < ctx.currentTime + this._scheduleAhead) {
      const beat         = this._currentBeat;
      const beatAudioTime = this._nextBeatTime;

      this._scheduleClick(beatAudioTime, beat === 0);

      // ── Scoring: call immediately, no delay ──────────────────────────────
      this.onSchedule && this.onSchedule(beat, beatAudioTime, secondsPerBeat);

      // ── UI: fire when audio actually plays ───────────────────────────────
      const delayMs = (beatAudioTime - ctx.currentTime) * 1000;
      setTimeout(
        () => this.onBeat && this.onBeat(beat, beatAudioTime),
        Math.max(0, delayMs)
      );

      this._currentBeat  = (this._currentBeat + 1) % this.beatsPerBar;
      this._nextBeatTime += secondsPerBeat;
    }

    this._timerId = setTimeout(() => this._scheduler(), this._lookahead);
  }

  start() {
    if (this._running) return;
    this._running      = true;
    const ctx          = this._getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    this._currentBeat  = 0;
    this._nextBeatTime = ctx.currentTime + 0.05;
    this._scheduler();
  }

  stop() {
    this._running = false;
    clearTimeout(this._timerId);
  }

  setBpm(bpm)      { this.bpm = bpm; }
  setBeatsPerBar(n){ this.beatsPerBar = n; this._currentBeat = 0; }
  getAudioContext(){ return this._getCtx(); }
  get isRunning()  { return this._running; }
}

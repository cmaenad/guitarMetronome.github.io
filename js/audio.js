// Microphone input + onset detection (energy-based)
export class AudioInput {
  constructor({ onOnset } = {}) {
    this.onOnset = onOnset; // callback fired when a note onset is detected
    this._stream = null;
    this._ctx = null;
    this._analyser = null;
    this._rafId = null;
    this._prevEnergy = 0;
    this._onsetCooldown = 0;
    this.threshold = 1.5;   // onset sensitivity multiplier
    this.cooldownMs = 120;  // min ms between onsets
    this._lastOnset = 0;
  }

  async start(audioContext) {
    this._ctx = audioContext;
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const source = this._ctx.createMediaStreamSource(this._stream);
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 2048;
    source.connect(this._analyser);
    this._loop();
  }

  _loop() {
    const buf = new Float32Array(this._analyser.fftSize);
    const tick = () => {
      this._analyser.getFloatTimeDomainData(buf);
      // RMS energy
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (
        rms > this.threshold * this._prevEnergy &&
        rms > 0.01 &&
        now - this._lastOnset > this.cooldownMs
      ) {
        this._lastOnset = now;
        this.onOnset && this.onOnset(now);
      }
      this._prevEnergy = rms * 0.8 + this._prevEnergy * 0.2; // smoothed
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this._rafId);
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
  }
}

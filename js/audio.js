// Microphone input + onset detection using AudioContext time
// All timestamps are in AudioContext.currentTime (seconds) for precise sync
export class AudioInput {
  constructor({ onOnset } = {}) {
    this.onOnset = onOnset; // callback(audioContextTimeSecs)
    this._stream = null;
    this._ctx = null;
    this._analyser = null;
    this._rafId = null;
    this._prevEnergy = 0;
    this.threshold = 1.5;    // onset sensitivity multiplier
    this.cooldownSec = 0.12; // min seconds between onsets
    this._lastOnsetTime = -1;
    // Mic latency compensation in seconds (hardware round-trip).
    // The mic buffer arrives slightly after the sound was produced.
    // We subtract this to align the detected onset with when the note was played.
    this.latencyCompSec = 0.06; // 60ms default, tunable
  }

  async start(audioContext) {
    this._ctx = audioContext;
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const source = this._ctx.createMediaStreamSource(this._stream);

    // Use the stream's actual latency if available
    const track = this._stream.getAudioTracks()[0];
    if (track && track.getSettings) {
      const settings = track.getSettings();
      if (settings.latency) this.latencyCompSec = settings.latency;
    }

    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 1024; // smaller = lower latency per frame
    source.connect(this._analyser);
    this._loop();
  }

  _loop() {
    const buf = new Float32Array(this._analyser.fftSize);
    const tick = () => {
      this._analyser.getFloatTimeDomainData(buf);

      // RMS energy of current frame
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);

      // Onset: sudden energy spike above smoothed background
      if (
        rms > this.threshold * this._prevEnergy &&
        rms > 0.015
      ) {
        // Timestamp of when the note was actually played:
        // ctx.currentTime minus the mic hardware latency
        const onsetTime = this._ctx.currentTime - this.latencyCompSec;

        if (onsetTime - this._lastOnsetTime > this.cooldownSec) {
          this._lastOnsetTime = onsetTime;
          this.onOnset && this.onOnset(onsetTime);
        }
      }

      // Smooth background energy tracker
      this._prevEnergy = rms * 0.7 + this._prevEnergy * 0.3;
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this._rafId);
    if (this._stream) this._stream.getTracks().forEach(t => t.stop());
    this._prevEnergy = 0;
    this._lastOnsetTime = -1;
  }
}

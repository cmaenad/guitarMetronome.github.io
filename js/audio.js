/**
 * AudioInput — mic onset detection running in the audio thread.
 *
 * Strategy:
 *   - Use AudioWorklet (Chrome/Firefox/Safari 14.1+) with ScriptProcessor fallback.
 *   - All onset timestamps come from AudioContext.currentTime sampled inside the
 *     audio callback, which is driven by the hardware clock — same clock as the
 *     metronome. This eliminates rAF jitter entirely.
 *   - latencyCompSec is set ONCE at start() from the calibrated value and never
 *     changes during a session, giving a fixed, stable offset.
 *   - The analyser fftSize is kept small (256) so the buffer covers only ~5ms,
 *     minimising the timestamp error introduced by buffer boundaries.
 */
export class AudioInput {
  constructor({ onOnset } = {}) {
    this.onOnset = onOnset;
    this._stream   = null;
    this._ctx      = null;
    this._source   = null;
    this._processor = null;
    this._analyser = null;

    // Public — set before calling start()
    this.threshold      = 1.5;   // onset sensitivity multiplier
    this.cooldownSec    = 0.12;  // min seconds between onsets
    this.latencyCompSec = 0.0;   // calibrated offset (seconds); set by main.js

    // Internal
    this._prevEnergy    = 0;
    this._lastOnsetTime = -999;
    this._frozen        = false; // true while session is running (locks latencyCompSec)
    this._fixedLatency  = 0;     // snapshot of latencyCompSec taken at start()
  }

  /**
   * Start mic capture. latencyCompSec must be set before calling this.
   * Once started, latencyCompSec changes have no effect until stop()+start().
   */
  async start(audioContext) {
    this._ctx = audioContext;

    // Snapshot latency NOW — it will not change for the rest of the session
    this._fixedLatency = this.latencyCompSec;
    this._frozen = true;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation:  false,
        noiseSuppression:  false,
        autoGainControl:   false,
        // Request lowest possible latency from the OS
        latency: 0,
      },
      video: false,
    });

    this._source = this._ctx.createMediaStreamSource(this._stream);

    // Small analyser — 256 samples @ 44100 Hz ≈ 5.8ms per buffer
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 256;

    this._source.connect(this._analyser);

    // Try AudioWorklet first, fall back to ScriptProcessor
    if (this._ctx.audioWorklet) {
      await this._startWorklet();
    } else {
      this._startScriptProcessor();
    }
  }

  // ── AudioWorklet path ────────────────────────────────────────────────────────
  async _startWorklet() {
    const code = `
class OnsetDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this._prevEnergy = 0;
    this._lastOnsetTime = -999;
    this.port.onmessage = (e) => {
      if (e.data.type === 'config') {
        this._threshold   = e.data.threshold;
        this._cooldown    = e.data.cooldownSec;
        this._fixedLatency = e.data.fixedLatency;
      }
    };
    this._threshold    = 1.5;
    this._cooldown     = 0.12;
    this._fixedLatency = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch || ch.length === 0) return true;
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    const rms = Math.sqrt(sum / ch.length);
    if (
      rms > this._threshold * this._prevEnergy &&
      rms > 0.015
    ) {
      // currentTime here is the hardware-accurate start of this buffer
      const onsetTime = currentTime - this._fixedLatency;
      if (onsetTime - this._lastOnsetTime > this._cooldown) {
        this._lastOnsetTime = onsetTime;
        this.port.postMessage({ type: 'onset', time: onsetTime });
      }
    }
    this._prevEnergy = rms * 0.7 + this._prevEnergy * 0.3;
    return true;
  }
}
registerProcessor('onset-detector', OnsetDetector);
`;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url  = URL.createObjectURL(blob);
    await this._ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const node = new AudioWorkletNode(this._ctx, 'onset-detector');
    node.port.postMessage({
      type: 'config',
      threshold:    this.threshold,
      cooldownSec:  this.cooldownSec,
      fixedLatency: this._fixedLatency,
    });
    node.port.onmessage = (e) => {
      if (e.data.type === 'onset') {
        this.onOnset && this.onOnset(e.data.time);
      }
    };
    this._source.connect(node);
    this._processor = node;
  }

  // ── ScriptProcessor fallback (deprecated but widely supported) ───────────────
  _startScriptProcessor() {
    // bufferSize 256 = ~5.8ms @ 44100 Hz
    const sp = this._ctx.createScriptProcessor(256, 1, 1);
    const fixedLatency = this._fixedLatency;
    const threshold    = this.threshold;
    const cooldown     = this.cooldownSec;
    let prevEnergy     = 0;
    let lastOnsetTime  = -999;

    sp.onaudioprocess = (e) => {
      const ch  = e.inputBuffer.getChannelData(0);
      // playbackTime is the AudioContext time of the START of this buffer
      const bufferStartTime = e.playbackTime;
      let sum = 0;
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      const rms = Math.sqrt(sum / ch.length);
      if (rms > threshold * prevEnergy && rms > 0.015) {
        const onsetTime = bufferStartTime - fixedLatency;
        if (onsetTime - lastOnsetTime > cooldown) {
          lastOnsetTime = onsetTime;
          this.onOnset && this.onOnset(onsetTime);
        }
      }
      prevEnergy = rms * 0.7 + prevEnergy * 0.3;
    };

    this._source.connect(sp);
    sp.connect(this._ctx.destination); // must be connected to run
    this._processor = sp;
  }

  stop() {
    this._frozen = false;
    if (this._processor) {
      this._processor.disconnect();
      this._processor = null;
    }
    if (this._analyser) {
      this._analyser.disconnect();
      this._analyser = null;
    }
    if (this._source) {
      this._source.disconnect();
      this._source = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._prevEnergy    = 0;
    this._lastOnsetTime = -999;
  }
}

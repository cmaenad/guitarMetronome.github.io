// Latency calibrator: bouncing ball animation + mic onset detection
// Measures the perceptual offset between what the user sees and what they play.
// Returns the average delta in seconds over N rounds.

const TOTAL_ROUNDS = 5;
const BOUNCE_PERIOD_MS = 1200; // ms for one full bounce cycle

export class LatencyCalibrator {
  constructor({ audioContext, audioInput, onDone, onCancel }) {
    this._ctx = audioContext;
    this._audioInput = audioInput;
    this._onDone = onDone;   // callback(latencySec)
    this._onCancel = onCancel;
    this._samples = [];
    this._round = 0;
    this._animId = null;
    this._startTime = null;   // performance.now() when animation started
    this._lastBouncePerf = null; // performance.now() of last floor touch
    this._lastBounceAudio = null; // ctx.currentTime of last floor touch
    this._waitingForHit = false;
    this._overlay = null;
    this._canvas = null;
    this._statusEl = null;
    this._originalOnset = null;
  }

  open() {
    this._buildUI();
    this._hookAudio();
    this._startAnimation();
  }

  _buildUI() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cal-overlay';
    overlay.id = 'cal-overlay';
    overlay.innerHTML = `
      <div class="modal-box cal-box">
        <button class="modal-close" id="cal-close" aria-label="Cancelar calibración">✕</button>
        <h2>🎯 Calibrar latencia</h2>
        <p class="cal-instructions">Tocá una nota justo cuando la pelota toque el piso.<br>Se harán <strong>${TOTAL_ROUNDS} mediciones</strong> y se promediará el resultado.</p>
        <canvas id="cal-canvas" width="300" height="180" aria-label="Animación de pelota"></canvas>
        <div class="cal-progress" id="cal-progress">Medición 1 de ${TOTAL_ROUNDS}</div>
        <div class="cal-dots" id="cal-dots">${'<span class="cal-dot"></span>'.repeat(TOTAL_ROUNDS)}</div>
        <div class="cal-status" id="cal-status">Esperando...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._overlay = overlay;
    this._canvas = overlay.querySelector('#cal-canvas');
    this._statusEl = overlay.querySelector('#cal-status');
    this._progressEl = overlay.querySelector('#cal-progress');
    this._dotsEl = overlay.querySelector('#cal-dots');

    overlay.querySelector('#cal-close').addEventListener('click', () => this._cancel());
  }

  _hookAudio() {
    // Temporarily override the audioInput onset callback
    this._originalOnset = this._audioInput.onOnset;
    this._audioInput.onOnset = (onsetAudioTime) => this._onMicHit(onsetAudioTime);
  }

  _unhookAudio() {
    this._audioInput.onOnset = this._originalOnset;
  }

  _startAnimation() {
    this._startTime = performance.now();
    this._scheduleNextBounce();
    this._animLoop();
  }

  // Pre-compute the next floor-touch time so we know exactly when it happens
  _scheduleNextBounce() {
    const now = performance.now();
    const elapsed = now - this._startTime;
    // Floor touch happens at t = 0, BOUNCE_PERIOD_MS, 2*BOUNCE_PERIOD_MS, ...
    const nextBouncePerf = this._startTime + Math.ceil((elapsed + 50) / BOUNCE_PERIOD_MS) * BOUNCE_PERIOD_MS;
    const delayMs = nextBouncePerf - now;

    setTimeout(() => {
      if (!this._overlay) return;
      this._lastBouncePerf = nextBouncePerf;
      // Convert to AudioContext time for comparison with mic onset
      this._lastBounceAudio = this._ctx.currentTime + (nextBouncePerf - performance.now()) / 1000;
      this._waitingForHit = true;
      this._scheduleNextBounce();
    }, delayMs);
  }

  _onMicHit(onsetAudioTime) {
    if (!this._waitingForHit || this._lastBounceAudio === null) return;
    this._waitingForHit = false;

    // delta: positive = user played AFTER the bounce (late)
    //        negative = user played BEFORE the bounce (early)
    const delta = onsetAudioTime - this._lastBounceAudio;

    // Reject outliers > 500ms
    if (Math.abs(delta) > 0.5) {
      this._statusEl.textContent = 'Muy lejos del golpe, intentá de nuevo';
      this._waitingForHit = true;
      return;
    }

    this._samples.push(delta);
    this._round++;
    this._updateDots();

    if (this._round >= TOTAL_ROUNDS) {
      this._finish();
    } else {
      this._progressEl.textContent = `Medición ${this._round + 1} de ${TOTAL_ROUNDS}`;
      this._statusEl.textContent = `✓ Registrado (${delta >= 0 ? '+' : ''}${(delta * 1000).toFixed(0)} ms)`;
    }
  }

  _updateDots() {
    const dots = this._dotsEl.querySelectorAll('.cal-dot');
    dots.forEach((d, i) => {
      if (i < this._round) d.classList.add('done');
    });
  }

  _finish() {
    cancelAnimationFrame(this._animId);
    this._unhookAudio();
    const avg = this._samples.reduce((a, b) => a + b, 0) / this._samples.length;
    this._statusEl.textContent = `Listo. Latencia promedio: ${(avg * 1000).toFixed(0)} ms`;
    setTimeout(() => {
      this._destroy();
      this._onDone && this._onDone(avg);
    }, 1200);
  }

  _cancel() {
    cancelAnimationFrame(this._animId);
    this._unhookAudio();
    this._destroy();
    this._onCancel && this._onCancel();
  }

  _destroy() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  _animLoop() {
    const canvas = this._canvas;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const ballR = 18;
    const floorY = H - ballR - 8;
    const ceilY = ballR + 8;

    const draw = () => {
      if (!this._overlay) return;
      const t = (performance.now() - this._startTime) / BOUNCE_PERIOD_MS;
      // Parabolic bounce: y goes from floor → ceiling → floor
      // phase 0..1 maps to one full bounce
      const phase = t % 1;
      // Use abs(sin) for natural bounce arc
      const normalizedY = Math.abs(Math.sin(phase * Math.PI));
      const ballY = floorY - normalizedY * (floorY - ceilY);

      ctx2d.clearRect(0, 0, W, H);

      // Floor line
      ctx2d.strokeStyle = '#444';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(20, floorY + ballR + 4);
      ctx2d.lineTo(W - 20, floorY + ballR + 4);
      ctx2d.stroke();

      // Shadow on floor (grows as ball approaches)
      const shadowScale = 1 - normalizedY * 0.8;
      ctx2d.save();
      ctx2d.globalAlpha = 0.25 * shadowScale;
      ctx2d.fillStyle = '#7c5cfc';
      ctx2d.beginPath();
      ctx2d.ellipse(W / 2, floorY + ballR + 4, ballR * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();

      // Ball — flash accent color when near floor
      const nearFloor = normalizedY < 0.08;
      const ballColor = nearFloor ? '#fc5c7d' : '#7c5cfc';
      ctx2d.beginPath();
      ctx2d.arc(W / 2, ballY, ballR, 0, Math.PI * 2);
      ctx2d.fillStyle = ballColor;
      ctx2d.shadowColor = ballColor;
      ctx2d.shadowBlur = nearFloor ? 20 : 8;
      ctx2d.fill();
      ctx2d.shadowBlur = 0;

      this._animId = requestAnimationFrame(draw);
    };
    this._animId = requestAnimationFrame(draw);
  }
}

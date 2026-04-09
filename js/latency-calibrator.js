/**
 * LatencyCalibrator
 *
 * Shows a bouncing ball animation. The user plays a note when the ball hits
 * the floor. We measure delta = onsetAudioTime - bounceAudioTime over
 * TOTAL_ROUNDS taps, average them, and return the result.
 *
 * Timing model:
 *   - The bounce floor-touch time is computed as an AudioContext.currentTime
 *     value, derived from performance.now() at the moment the setTimeout fires.
 *   - The onset time comes from AudioInput (audio-thread accurate).
 *   - Both are on the same AudioContext clock → no cross-clock drift.
 *
 * The returned value is the average delta in seconds. A positive value means
 * the user consistently plays AFTER the visual cue (normal for humans).
 * This value is stored as latencyCompSec and subtracted from every future
 * onset timestamp so that the game window is centred on the user's natural
 * reaction time.
 */

const TOTAL_ROUNDS    = 5;
const BOUNCE_PERIOD_MS = 1400; // ms per full bounce cycle — slow enough to aim

export class LatencyCalibrator {
  constructor({ audioContext, audioInput, onDone, onCancel }) {
    this._ctx        = audioContext;
    this._audioInput = audioInput;
    this._onDone     = onDone;
    this._onCancel   = onCancel;

    this._samples          = [];
    this._round            = 0;
    this._animId           = null;
    this._startPerfTime    = null; // performance.now() when animation started
    this._startAudioTime   = null; // ctx.currentTime when animation started
    this._nextBounceAudio  = null; // ctx.currentTime of the upcoming floor touch
    this._waitingForHit    = false;
    this._bounceTimer      = null;

    this._overlay    = null;
    this._statusEl   = null;
    this._progressEl = null;
    this._dotsEl     = null;
    this._originalOnset = null;
  }

  open() {
    this._buildUI();
    this._hookAudio();
    // Small delay so the modal renders before we start timing
    setTimeout(() => this._startSession(), 300);
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  _buildUI() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay cal-overlay';
    overlay.innerHTML = `
      <div class="modal-box cal-box">
        <button class="modal-close" id="cal-close" aria-label="Cancelar">✕</button>
        <h2>🎯 Calibrar latencia</h2>
        <p class="cal-instructions">
          Tocá una nota justo cuando la pelota toque el piso.<br>
          <strong>${TOTAL_ROUNDS} mediciones</strong> — se promediará el resultado.
        </p>
        <canvas id="cal-canvas" width="300" height="200" aria-label="Pelota rebotando"></canvas>
        <div class="cal-progress" id="cal-progress">Medición 1 de ${TOTAL_ROUNDS}</div>
        <div class="cal-dots" id="cal-dots">${'<span class="cal-dot"></span>'.repeat(TOTAL_ROUNDS)}</div>
        <div class="cal-status" id="cal-status">Preparando…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._overlay    = overlay;
    this._statusEl   = overlay.querySelector('#cal-status');
    this._progressEl = overlay.querySelector('#cal-progress');
    this._dotsEl     = overlay.querySelector('#cal-dots');
    overlay.querySelector('#cal-close').addEventListener('click', () => this._cancel());
  }

  // ── Audio hook ───────────────────────────────────────────────────────────────
  _hookAudio() {
    this._originalOnset      = this._audioInput.onOnset;
    this._audioInput.onOnset = (t) => this._onMicHit(t);
  }

  _unhookAudio() {
    this._audioInput.onOnset = this._originalOnset;
  }

  // ── Session ──────────────────────────────────────────────────────────────────
  _startSession() {
    if (!this._overlay) return;
    // Anchor both clocks at the same instant
    this._startPerfTime  = performance.now();
    this._startAudioTime = this._ctx.currentTime;
    this._statusEl.textContent = 'Tocá cuando la pelota toque el piso';
    this._scheduleNextBounce(0);
    this._animLoop();
  }

  /**
   * Schedule the Nth bounce floor-touch.
   * We use setTimeout to know the exact performance.now() of the event,
   * then convert to AudioContext time using the anchored offset.
   */
  _scheduleNextBounce(n) {
    const targetPerfTime = this._startPerfTime + (n + 1) * BOUNCE_PERIOD_MS;
    const delay = targetPerfTime - performance.now();

    this._bounceTimer = setTimeout(() => {
      if (!this._overlay) return;
      // Convert to AudioContext time using the stable anchor
      const perfOffset = targetPerfTime - this._startPerfTime;
      this._nextBounceAudio = this._startAudioTime + perfOffset / 1000;
      this._waitingForHit   = true;

      // Accept hits for half a period on each side
      const acceptWindow = (BOUNCE_PERIOD_MS / 2) / 1000;
      setTimeout(() => {
        if (this._waitingForHit) {
          // Missed this bounce — don't penalise, just move on
          this._waitingForHit = false;
          if (this._round < TOTAL_ROUNDS) {
            this._scheduleNextBounce(n + 1);
          }
        }
      }, acceptWindow * 1000);

    }, Math.max(0, delay));
  }

  // ── Mic hit ──────────────────────────────────────────────────────────────────
  _onMicHit(onsetAudioTime) {
    if (!this._waitingForHit || this._nextBounceAudio === null) return;
    this._waitingForHit = false;

    const delta = onsetAudioTime - this._nextBounceAudio;

    // Reject if more than 600ms away from the bounce
    if (Math.abs(delta) > 0.6) {
      this._statusEl.textContent = 'Muy lejos del golpe, intentá de nuevo';
      this._scheduleNextBounce(this._round);
      return;
    }

    this._samples.push(delta);
    this._round++;
    this._updateDots();

    if (this._round >= TOTAL_ROUNDS) {
      this._finish();
    } else {
      this._progressEl.textContent = `Medición ${this._round + 1} de ${TOTAL_ROUNDS}`;
      this._statusEl.textContent =
        `✓ ${delta >= 0 ? '+' : ''}${(delta * 1000).toFixed(0)} ms — seguí tocando`;
      this._scheduleNextBounce(this._round);
    }
  }

  _updateDots() {
    this._dotsEl.querySelectorAll('.cal-dot').forEach((d, i) => {
      if (i < this._round) d.classList.add('done');
    });
  }

  _finish() {
    cancelAnimationFrame(this._animId);
    clearTimeout(this._bounceTimer);
    this._unhookAudio();

    // Trim outliers: remove highest and lowest if we have enough samples
    let samples = [...this._samples].sort((a, b) => a - b);
    if (samples.length >= 5) samples = samples.slice(1, -1);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    this._statusEl.textContent =
      `Listo ✓  Latencia: ${(avg * 1000).toFixed(0)} ms`;
    setTimeout(() => {
      this._destroy();
      this._onDone && this._onDone(avg);
    }, 1400);
  }

  _cancel() {
    cancelAnimationFrame(this._animId);
    clearTimeout(this._bounceTimer);
    this._unhookAudio();
    this._destroy();
    this._onCancel && this._onCancel();
  }

  _destroy() {
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
  }

  // ── Canvas animation ─────────────────────────────────────────────────────────
  _animLoop() {
    const canvas = this._overlay && this._overlay.querySelector('#cal-canvas');
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const ballR  = 20;
    const floorY = H - ballR - 12;
    const ceilY  = ballR + 12;

    const draw = () => {
      if (!this._overlay) return;

      const elapsed = performance.now() - this._startPerfTime;
      const phase   = (elapsed % BOUNCE_PERIOD_MS) / BOUNCE_PERIOD_MS; // 0..1
      // abs(sin) gives a natural parabolic arc: 0 at floor, 1 at peak
      const normalizedH = Math.abs(Math.sin(phase * Math.PI));
      const ballY = floorY - normalizedH * (floorY - ceilY);
      const nearFloor = normalizedH < 0.07;

      ctx2d.clearRect(0, 0, W, H);

      // Floor
      ctx2d.strokeStyle = '#555';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(16, floorY + ballR + 6);
      ctx2d.lineTo(W - 16, floorY + ballR + 6);
      ctx2d.stroke();

      // Shadow
      const sScale = 1 - normalizedH * 0.85;
      ctx2d.save();
      ctx2d.globalAlpha = 0.3 * sScale;
      ctx2d.fillStyle = '#7c5cfc';
      ctx2d.beginPath();
      ctx2d.ellipse(W / 2, floorY + ballR + 6, ballR * sScale, 5 * sScale, 0, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();

      // Ball
      const color = nearFloor ? '#fc5c7d' : '#7c5cfc';
      ctx2d.beginPath();
      ctx2d.arc(W / 2, ballY, ballR, 0, Math.PI * 2);
      ctx2d.fillStyle = color;
      ctx2d.shadowColor = color;
      ctx2d.shadowBlur  = nearFloor ? 28 : 10;
      ctx2d.fill();
      ctx2d.shadowBlur = 0;

      // "AHORA" flash label when near floor
      if (nearFloor) {
        ctx2d.fillStyle = '#fc5c7d';
        ctx2d.font = 'bold 13px system-ui';
        ctx2d.textAlign = 'center';
        ctx2d.fillText('¡AHORA!', W / 2, floorY + ballR + 24);
      }

      this._animId = requestAnimationFrame(draw);
    };
    this._animId = requestAnimationFrame(draw);
  }
}

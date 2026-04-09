/**
 * Game — lógica de puntuación.
 *
 * Todos los tiempos en AudioContext.currentTime (segundos).
 *
 * Patrón y figuras:
 *   El patrón es un arreglo de duraciones en tiempos (negra = 1, blanca = 2, etc.).
 *   El scheduler expande el patrón en slots: cada slot tiene un tiempo de beat
 *   y un flag `active` que indica si se espera nota en ese slot.
 *   Ejemplo: patrón [2, 2] en 4/4 → slot 0 activo, slot 1 silencio, slot 2 activo, slot 3 silencio.
 *
 * Ventana de detección:
 *   ±WINDOW_FRAC de la duración del beat, desplazada por `offsetFrac`.
 *   offsetFrac = -0.5 → ventana antes del beat (anticipación)
 *   offsetFrac =  0   → centrada en el beat
 *   offsetFrac = +0.5 → ventana después del beat (reacción tardía)
 */

const WINDOW_FRAC = 0.20; // ±20% de la duración del beat

export class Game {
  constructor({ onScoreChange, onFeedback } = {}) {
    this.onScoreChange = onScoreChange;
    this.onFeedback    = onFeedback;

    this.score      = 0;
    this.streak     = 0;
    this.pattern    = [1, 1, 1, 1];
    this.offsetFrac = 0; // desplazamiento de ventana: -0.5 a +0.5

    // Slots programados: { time, duration, active, hit }
    this._slots         = [];
    this._patternCursor = 0; // índice dentro del patrón expandido
    this._patternExpanded = []; // patrón expandido a beats individuales
    this._feedbackTimer = null;
  }

  /**
   * Llamado por el scheduler para cada beat del metrónomo.
   * Determina si este beat requiere nota según el patrón activo.
   */
  scheduleBeat(beatTime, beatDuration) {
    // Evaluar miss del slot anterior si no fue golpeado
    if (this._slots.length > 0) {
      const prev = this._slots[this._slots.length - 1];
      if (prev.active && !prev.hit) this._miss();
    }

    // Expandir patrón si es necesario
    if (this._patternExpanded.length === 0) this._expandPattern();

    const isActive = this._patternExpanded[this._patternCursor] === 'note';
    this._patternCursor = (this._patternCursor + 1) % this._patternExpanded.length;

    this._slots.push({ time: beatTime, duration: beatDuration, active: isActive, hit: false });
    if (this._slots.length > 4) this._slots.shift();
  }

  /**
   * Expande el patrón de duraciones a un arreglo de 'note' | 'rest' por beat.
   * Ejemplo: [2, 1, 1] → ['note','rest','note','note']
   */
  _expandPattern() {
    this._patternExpanded = [];
    for (const dur of this.pattern) {
      const beats = Math.round(dur); // duración en tiempos enteros
      this._patternExpanded.push('note');
      for (let i = 1; i < beats; i++) this._patternExpanded.push('rest');
    }
    this._patternCursor = 0;
  }

  /**
   * Llamado por AudioInput — onsetAudioTime ya tiene compensación de latencia.
   */
  onOnset(onsetAudioTime) {
    if (this._slots.length === 0) return;

    for (let i = this._slots.length - 1; i >= 0; i--) {
      const s    = this._slots[i];
      if (!s.active) continue; // slot de silencio — ignorar

      const half   = s.duration * WINDOW_FRAC;
      const center = s.time + s.duration * this.offsetFrac;
      const delta  = onsetAudioTime - center;

      if (delta >= -half && delta <= half) {
        if (!s.hit) {
          s.hit = true;
          this._hit();
        }
        return;
      }
    }
    // Onset fuera de todas las ventanas — ruido o nota a destiempo, no es miss
  }

  _hit() {
    this.score += 10 + this.streak * 2;
    this.streak++;
    this.onScoreChange && this.onScoreChange(this.score, this.streak);
    this._feedback('hit');
  }

  _miss() {
    this.score  = 0;
    this.streak = 0;
    this.onScoreChange && this.onScoreChange(this.score, this.streak);
    this._feedback('miss');
  }

  _feedback(type) {
    clearTimeout(this._feedbackTimer);
    this.onFeedback && this.onFeedback(type);
    this._feedbackTimer = setTimeout(
      () => this.onFeedback && this.onFeedback('idle'), 350
    );
  }

  setPattern(p) {
    this.pattern = p;
    this._expandPattern();
    this._patternCursor = 0;
  }

  reset() {
    clearTimeout(this._feedbackTimer);
    this.score          = 0;
    this.streak         = 0;
    this._slots         = [];
    this._patternCursor = 0;
    this.onScoreChange && this.onScoreChange(0, 0);
    this.onFeedback    && this.onFeedback('idle');
  }

  getState()   { return { score: this.score, streak: this.streak, pattern: this.pattern, offsetFrac: this.offsetFrac }; }
  loadState(s) {
    if (!s) return;
    this.score      = s.score      ?? 0;
    this.streak     = s.streak     ?? 0;
    this.offsetFrac = s.offsetFrac ?? 0;
    if (s.pattern) { this.pattern = s.pattern; this._expandPattern(); }
  }
}

// ── Patrones disponibles ──────────────────────────────────────────────────────
export const PATTERNS = {
  2: [
    { label: '2 negras',   value: [1, 1] },
    { label: '1 blanca',   value: [2] },
    { label: '4 corcheas', value: [0.5, 0.5, 0.5, 0.5] },
  ],
  3: [
    { label: '3 negras',          value: [1, 1, 1] },
    { label: '1 blanca + negra',  value: [2, 1] },
    { label: '6 corcheas',        value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  ],
  4: [
    { label: '4 negras',             value: [1, 1, 1, 1] },
    { label: '1 redonda',            value: [4] },
    { label: '2 blancas',            value: [2, 2] },
    { label: '8 corcheas',           value: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
    { label: '1 blanca + 2 negras',  value: [2, 1, 1] },
  ],
  6: [
    { label: '6 negras',       value: [1, 1, 1, 1, 1, 1] },
    { label: '2 grupos de 3',  value: [3, 3] },
    { label: '12 corcheas',    value: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5] },
  ],
};

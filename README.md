# 🎸 Guitar Rhythm Game

Juego de ritmo para navegador web diseñado para guitarra eléctrica (o cualquier instrumento que produzca notas solas). El jugador debe tocar en el momento exacto en que se enciende cada luz del compás.

## Cómo jugar

1. Abrí el juego en el navegador.
2. Elegí el tempo con el slider de BPM.
3. Elegí el compás (2/4, 3/4, 4/4, 6/8) y el patrón rítmico.
4. Ajustá la sensibilidad del micrófono según tu instrumento.
5. Presioná **Iniciar** y concedé permiso de micrófono.
6. Tocá una nota cada vez que se encienda una luz. El fondo se pone verde si acertás, rojo si fallás.
7. Los puntos se reinician a cero con cada fallo. ¡Construí tu racha!

## Características

- Metrónomo con scheduler de Web Audio API (lookahead scheduling para precisión)
- Compases: 2/4, 3/4, 4/4, 6/8
- Patrones rítmicos configurables por compás (negras, blancas, redonda, corcheas, combinaciones)
- Detección de onset por energía RMS del micrófono (sin librerías externas)
- Feedback visual inmediato (fondo verde/rojo)
- Sistema de puntos con racha multiplicadora
- Sesión persistente vía `localStorage` (el juego recuerda exactamente el estado al cerrar la pestaña)
- Slider de sensibilidad del micrófono

## Tecnologías usadas

| Tecnología | Uso |
|---|---|
| **Web Audio API** (`AudioContext`, `OscillatorNode`, `AnalyserNode`) | Metrónomo con clicks de acento, análisis de señal del micrófono |
| **MediaDevices API** (`getUserMedia`) | Captura de audio del micrófono |
| **Lookahead scheduling** | Técnica de Chris Wilson para metrónomo preciso: se programa el audio con anticipación usando `setTimeout` + `AudioContext.currentTime` |
| **RMS onset detection** | Detección de notas por energía cuadrática media de la señal, sin FFT ni librerías de pitch |
| **ES Modules** (`type="module"`) | Organización del código en módulos nativos del navegador |
| **localStorage** | Persistencia de sesión sin backend |
| **CSS custom properties + media queries** | UI responsiva para mobile y desktop |
| **Vanilla JS** | Sin frameworks, sin dependencias, sin build step |

## Compatibilidad

- ✅ Chrome Android 13+
- ✅ Chrome desktop
- ✅ Firefox desktop
- ✅ Safari iOS (requiere tap del usuario antes de iniciar AudioContext, cubierto por el botón Iniciar)
- ✅ Safari macOS

## Estructura del proyecto

```
guitarMetronome.github.io/
├── index.html          # Entrada única, markup semántico
├── style.css           # Estilos, tema oscuro, feedback visual
├── js/
│   ├── main.js         # Wiring: DOM, eventos, persistencia
│   ├── metronome.js    # Clase Metronome (Web Audio scheduler)
│   ├── audio.js        # Clase AudioInput (mic + onset detection)
│   ├── game.js         # Clase Game (scoring, ventana de tiempo, patrones)
│   └── storage.js      # save/load con localStorage
├── .kiro/
│   ├── hooks/
│   │   └── lint-on-save.json
│   └── steering/
│       └── project-rules.md
└── README.md
```

## Despliegue en GitHub Pages

Repo: https://github.com/cmaenad/guitarMetronome.github.io

URL del juego: **https://cmaenad.github.io/guitarMetronome.github.io/**

Activar Pages: Settings → Pages → Branch: `main` → `/` (root) → Save.

> El navegador requiere HTTPS para acceder al micrófono. GitHub Pages lo sirve por defecto.

## Ajuste de sensibilidad

- Valor bajo (1.1–1.5): detecta toques suaves, puede tener falsos positivos en ambientes ruidosos.
- Valor alto (2.5–4.0): solo detecta ataques fuertes, ideal para guitarra con distorsión.

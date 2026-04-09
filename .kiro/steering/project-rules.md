---
inclusion: always
---

# Guitar Rhythm Game - Project Rules

## Stack
- Vanilla JavaScript (ES6+), no frameworks, no build tools
- Single HTML file entry point (`index.html`)
- CSS in `style.css`
- JS modules in `js/`

## Code Standards
- Use ES modules (`type="module"`)
- No external dependencies or CDN imports
- All audio via Web Audio API
- Microphone input via `getUserMedia`
- Pitch detection via autocorrelation (no libraries)
- Session persistence via `localStorage`

## Browser Targets
- Chrome Android 13+
- Chrome/Firefox/Safari desktop
- iOS Safari (requires user gesture before AudioContext)

## File Responsibilities
- `js/metronome.js` — BPM, time signature, beat scheduling via AudioContext
- `js/audio.js` — mic input, pitch detection, note onset detection
- `js/game.js` — scoring, beat pattern config, UI state
- `js/storage.js` — localStorage save/load
- `js/main.js` — wires everything together, DOM events

## Conventions
- All DOM queries in `main.js` or passed as params
- No global state except what's exported from modules
- Save state on every meaningful user interaction

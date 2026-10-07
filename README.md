# Moke 墨課

A free, open-source whiteboard lesson-recording app — a spiritual successor to the retired [Doceri](https://web.archive.org/web/20241203232132/http://doceri.com/). Draw on a whiteboard, and every stroke becomes a replayable timeline event.

**[繁體中文說明](README.zh-Hant.md)**

**Try it live**: https://thomashuanggogo.github.io/moke-whiteboard/ (open in iPad Safari, landscape)

## Why Moke?

Doceri (2011–2022) proved the model: a whiteboard where every stroke is a time event, with stop markers for classroom pacing. Then it was retired. The open-source world never filled the gap — no GitHub project offers stroke-level timeline replay for teaching. Moke does.

Three things Moke gets right:

1. **Honest time** — the clock runs only while you draw. Pen down: ticking. Pen up: stopped. No idle time inflating your lesson length.
2. **Erasing is visible** — the eraser is a timeline event, not a delete. Replay shows the stroke appearing, then being erased. (Undo is different: undo means "it never happened" and removes the stroke from the timeline.)
3. **Free and local-first** — no account, no subscription, no cloud. Data lives in the browser's IndexedDB; the server only serves static files.

## Features

- ✏️ Pen, highlighter, eraser, shapes (line, arrow, rect, triangle, parallelogram, ellipse, axes), text, laser pointer
- 📏 Ruler, protractor, compass overlays
- 🪢 Lasso select — move or rotate groups of strokes (rotation never distorts)
- 🚩 Stop markers bound to strokes — playback auto-pauses for note-taking
- ⏱️ Per-page independent timelines, action-time clock
- 🖼️ Image backgrounds with adjust mode (resize/reposition)
- 📄 Export page as PNG, all pages as PDF; 💾 save/load lesson JSON
- 📡 Live projection sharing via WebRTC (peer-to-peer)
- 📱 PWA — installable, works offline

## Quick start

No build step. No dependencies to install. It's static files:

```bash
# Serve the folder with any static server, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Open in a browser (iPad Safari recommended, landscape). That's it.

To deploy: upload the folder to any static host (Cloudflare Pages/Workers, Netlify, GitHub Pages). HTTPS is recommended (microphone/screen-share features need it).

## Architecture

**Event-sourced canvas**: the board is not an image, it's an event stream. `state = fold(events ≤ t)` — deterministic replay, lossless scrubbing, clean undo.

- `js/board.js` — canvas, tools, gestures, rendering (Catmull-Rom smoothing)
- `js/lesson.js` — timeline engine, per-page clocks, replay controller
- `js/app.js` — UI wiring
- `js/share.js` — WebRTC projection sharing
- `js/vendor/` — bundled third-party libs (jsPDF, PeerJS, QRCode — all MIT/Apache-2.0)

Coordinates are normalized (0..1), resolution-independent. Design spec: [`ENGINE_SPEC.md`](ENGINE_SPEC.md).

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it in your classroom.

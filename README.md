# YouTube Pause

**A moment to think before every YouTube video.**

YouTube Pause is a Chrome extension that puts a short, calm pause between clicking a video and watching it. Every video on youtube.com is blocked behind a dark overlay showing the video title, one question — *"Do you actually want to watch this?"* — and a countdown. When the countdown ends, you make an explicit choice: **Watch** or **Go back**. Watching becomes a conscious decision instead of a reflex.

It is a self-control aid for breaking the video-after-video loop, not a parental control or security tool.

## Features

- **Blocks every video** — direct links, search results, sidebar recommendations, and autoplay-next are all caught, including YouTube's SPA navigation.
- **No audio leak** — the video is muted and paused immediately; spacebar and `k` are re-paused while blocked.
- **Explicit choice** — the video never resumes on its own. After the pause: **Watch** (unmute + play) or **Go back**.
- **Configurable pause** — 1–60 seconds (default 3), set from the toolbar popup.
- **On/off toggle** — temporarily disable blocking from the popup for legitimate sessions.
- **Stateless and private** — no stats, no history, no tracking, no network requests. See [PRIVACY.md](PRIVACY.md).
- **Fails open** — if YouTube's DOM changes and the extension can't attach, the video simply plays normally rather than breaking YouTube.

## Install

Not yet on the Chrome Web Store — load it as an unpacked extension:

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.

## How it works

Plain JavaScript, Manifest V3, no build step, no background service worker.

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest: content script on `https://www.youtube.com/*`, `storage` permission, toolbar popup. |
| `content.js` | All blocking logic: navigation detection, mute/pause, overlay, countdown, watchdog. |
| `shared.js` | Pure decision functions (URL parsing, duration clamping, countdown math, enabled check), unit-tested. |
| `overlay.css` | Overlay styling. |
| `popup.html` / `popup.js` / `popup.css` | Toolbar popup: on/off toggle and pause-duration slider. |

Settings live in `chrome.storage.sync`: `enabled` (anything but an explicit `false` counts as on) and `pauseDurationSeconds`.

## Development

Run the unit tests (Node 18+, no dependencies):

```sh
npm test
```

The design spec and implementation plan are in [`docs/superpowers/`](docs/superpowers/).

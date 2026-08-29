# YouTube Pause Extension — Design Spec

**Date:** 2026-08-29
**Status:** Approved design, pending implementation plan

## Problem

The user compulsively watches short YouTube videos (movie clips, food, sports) back to back. Shorts are already disabled, but the video-after-video loop persists. The missing ingredient is a moment of reflection between clicking a video and watching it.

## Solution

A Chrome extension that intercepts every video on youtube.com with a calm blocking overlay. The video cannot play until the user waits out a short pause and then makes an explicit choice: **Watch** or **Go back**. Watching becomes a conscious decision instead of a reflex.

## Requirements

1. **Every video is blocked** — no exceptions. This includes videos reached via direct link, search results, sidebar recommendations, and YouTube's autoplay-next.
2. **Explicit choice required** — the video never resumes on its own. After the pause, the user must click **Watch** to play or **Go back** to leave.
3. **Pause screen content** — a dark, calm full-player overlay showing only the video title, a reflective prompt ("Do you actually want to watch this?"), and a subtle countdown. No thumbnail (thumbnails are engineered to entice).
4. **Configurable pause duration** — 3–10 seconds, default 3, set via the toolbar popup.
5. **Snooze** — a "Snooze for 1 hour" button in the popup temporarily disables blocking (for legitimate sessions like tutorial series). Blocking resumes automatically when the hour expires.
6. **Stateless** — no stats, no counters, no history. The extension does one thing: create the pause.

## Architecture

Manifest V3 Chrome extension, plain JavaScript, no build step, no background service worker.

### Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest. Content script matched to `https://www.youtube.com/*`, `storage` permission, toolbar action popup. |
| `content.js` | All blocking logic (see Blocking Flow). |
| `overlay.css` | Styling for the blocking overlay. Injected alongside the content script. |
| `popup.html` / `popup.js` | Toolbar popup: pause-duration slider (3–10s) and "Snooze for 1 hour" button. |
| `shared.js` | Pure decision functions (should-block given URL + snooze state, countdown state) extracted for unit testing, used by `content.js`. |

### Settings storage

- `chrome.storage.sync` → `pauseDurationSeconds` (number, default 3).
- `chrome.storage.local` → `snoozeUntil` (epoch ms timestamp, absent when not snoozed).

## Blocking Flow

YouTube is a single-page app: clicking from video to video does **not** trigger a page load. The content script therefore listens to YouTube's internal navigation event (`yt-navigate-finish`), with a URL-polling fallback in case that event ever changes. Autoplay-next fires the same navigation path, so it is caught identically.

On each navigation to a `/watch` URL with a new video ID:

1. Check snooze: if `snoozeUntil` is in the future, do nothing.
2. Immediately **pause and mute** the `<video>` element.
3. Inject the overlay over the full player area: dark panel, video title, prompt, countdown.
4. While blocked, listen for `play` events on the video and re-pause immediately — this defeats spacebar, the `k` key, and any programmatic play attempts by YouTube.
5. When the countdown ends, reveal two buttons:
   - **Watch** → remove overlay, unmute, play the video.
   - **Go back** → `history.back()`; if there is no meaningful history, navigate to `https://www.youtube.com/` instead.
6. Navigating to another video (including autoplay-next) restarts the flow from step 1.

### Resilience details

- The overlay is attached to the player container; a `MutationObserver` (or re-check on navigation) restores it if YouTube re-renders the player while blocked.
- The video title is read from the page DOM; if not yet rendered, the overlay shows without a title rather than delaying the block.
- The video element may not exist at the instant of navigation; the script retries briefly until it appears, muting as the earliest possible action so no audio leaks.

## Out of Scope

- Embedded YouTube players on other sites.
- The miniplayer and hover/inline previews on browse pages.
- Firefox or other browsers.
- Any statistics, streaks, or history.
- Channel/playlist exemption lists.

## Error Handling

- If YouTube's DOM structure changes and the player container can't be found, the extension fails open (video plays normally) rather than breaking YouTube. This is a self-control aid, not a security boundary.
- Storage read failures fall back to defaults (3s pause, no snooze).

## Testing

- **Unit tests** for the pure functions in `shared.js`: should-block decisions (watch URL vs other pages, snooze active/expired), countdown state transitions.
- **Manual checklist** (loaded as unpacked extension), since the core behavior is DOM glue against YouTube's live page:
  1. Direct link to a video → blocked, title shown, buttons appear after the configured pause.
  2. Click a sidebar recommendation → blocked again.
  3. Click a search result → blocked.
  4. Let a video run to the end so autoplay-next fires → next video blocked, no audio leak.
  5. During the block: press space and `k` → video stays paused.
  6. **Watch** → plays with sound. **Go back** → returns to the previous page.
  7. Change duration in popup → next block uses the new duration.
  8. Snooze → videos play normally; after expiry (test with a short value), blocking resumes.

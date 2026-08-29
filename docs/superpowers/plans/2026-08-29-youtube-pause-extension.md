# YouTube Pause Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that blocks every YouTube video behind a calm overlay until the user waits out a short pause and explicitly clicks "Watch" or "Go back".

**Architecture:** A Manifest V3 content script on `www.youtube.com` listens for YouTube's SPA navigation event (`yt-navigate-finish`, plus URL polling fallback), and on each new video ID pauses/mutes the `<video>` element and overlays the player with a title + prompt + countdown panel. Pure decision functions live in `shared.js` so they can be unit-tested with Node's built-in test runner. A toolbar popup holds the two settings (pause duration, 1-hour snooze) in `chrome.storage`.

**Tech Stack:** Plain JavaScript (no build step, no dependencies), Chrome Manifest V3, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-29-youtube-pause-extension-design.md`

## Global Constraints

- Manifest V3, content script matched to `https://www.youtube.com/*` only, sole permission: `storage`.
- No build step, no npm dependencies, no background service worker.
- Pause duration: 3–10 seconds, default 3 (`pauseDurationSeconds` in `chrome.storage.sync`).
- Snooze: `snoozeUntil` epoch-ms timestamp in `chrome.storage.local`; absent = not snoozed.
- Stateless otherwise: no stats, counters, or history.
- Fail open: if YouTube's DOM can't be found, the video plays normally.
- Overlay shows title + prompt + countdown only — never a thumbnail.
- Extension name: "YouTube Pause".

---

### Task 1: Pure decision functions (`shared.js`)

**Files:**
- Create: `shared.js`
- Test: `test/shared.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Tasks 2 and 3):
  - `getWatchVideoId(urlString: string): string | null` — the `v` param if `urlString` is a `https://www.youtube.com/watch` URL, else `null`.
  - `isSnoozed(snoozeUntil: unknown, now: number): boolean` — `true` iff `snoozeUntil` is a number greater than `now`.
  - `clampPauseDuration(value: unknown): number` — rounds and clamps to [3, 10]; returns `3` for anything non-numeric.
  - Constants `MIN_PAUSE_SECONDS = 3`, `MAX_PAUSE_SECONDS = 10`, `DEFAULT_PAUSE_SECONDS = 3`.
  - The file defines these as top-level functions (globals when loaded as a content/popup script) and additionally exports them via `module.exports` when `module` exists, so Node tests can `require` it.

- [ ] **Step 1: Write the failing tests**

Create `test/shared.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getWatchVideoId, isSnoozed, clampPauseDuration } = require("../shared.js");

test("getWatchVideoId returns the id for a watch URL", () => {
  assert.equal(getWatchVideoId("https://www.youtube.com/watch?v=abc123"), "abc123");
});

test("getWatchVideoId ignores extra query params", () => {
  assert.equal(
    getWatchVideoId("https://www.youtube.com/watch?v=abc123&t=42s&list=PL1"),
    "abc123"
  );
});

test("getWatchVideoId returns null for non-watch youtube pages", () => {
  assert.equal(getWatchVideoId("https://www.youtube.com/"), null);
  assert.equal(getWatchVideoId("https://www.youtube.com/feed/subscriptions"), null);
  assert.equal(getWatchVideoId("https://www.youtube.com/results?search_query=x"), null);
});

test("getWatchVideoId returns null for other hosts", () => {
  assert.equal(getWatchVideoId("https://music.youtube.com/watch?v=abc123"), null);
  assert.equal(getWatchVideoId("https://example.com/watch?v=abc123"), null);
});

test("getWatchVideoId returns null for a watch URL without v", () => {
  assert.equal(getWatchVideoId("https://www.youtube.com/watch"), null);
});

test("getWatchVideoId returns null for garbage input", () => {
  assert.equal(getWatchVideoId("not a url"), null);
});

test("isSnoozed is true only for a future numeric timestamp", () => {
  assert.equal(isSnoozed(1000, 999), true);
  assert.equal(isSnoozed(1000, 1000), false);
  assert.equal(isSnoozed(999, 1000), false);
  assert.equal(isSnoozed(undefined, 1000), false);
  assert.equal(isSnoozed("2000", 1000), false);
});

test("clampPauseDuration clamps into [3, 10] and rounds", () => {
  assert.equal(clampPauseDuration(5), 5);
  assert.equal(clampPauseDuration(4.6), 5);
  assert.equal(clampPauseDuration(1), 3);
  assert.equal(clampPauseDuration(99), 10);
});

test("clampPauseDuration returns default 3 for non-numbers", () => {
  assert.equal(clampPauseDuration(undefined), 3);
  assert.equal(clampPauseDuration(NaN), 3);
  assert.equal(clampPauseDuration("7"), 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/`
Expected: FAIL — `Cannot find module '../shared.js'`

- [ ] **Step 3: Write the implementation**

Create `shared.js`:

```js
"use strict";

const MIN_PAUSE_SECONDS = 3;
const MAX_PAUSE_SECONDS = 10;
const DEFAULT_PAUSE_SECONDS = 3;

function getWatchVideoId(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.hostname !== "www.youtube.com") return null;
  if (url.pathname !== "/watch") return null;
  return url.searchParams.get("v") || null;
}

function isSnoozed(snoozeUntil, now) {
  return typeof snoozeUntil === "number" && snoozeUntil > now;
}

function clampPauseDuration(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PAUSE_SECONDS;
  }
  return Math.min(MAX_PAUSE_SECONDS, Math.max(MIN_PAUSE_SECONDS, Math.round(value)));
}

if (typeof module !== "undefined") {
  module.exports = {
    getWatchVideoId,
    isSnoozed,
    clampPauseDuration,
    MIN_PAUSE_SECONDS,
    MAX_PAUSE_SECONDS,
    DEFAULT_PAUSE_SECONDS,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shared.js test/shared.test.js
git commit -m "feat: add pure decision functions for URL, snooze, and duration"
```

---

### Task 2: Manifest, overlay styling, and the blocking content script

**Files:**
- Create: `manifest.json`
- Create: `overlay.css`
- Create: `content.js`

**Interfaces:**
- Consumes: `getWatchVideoId`, `isSnoozed`, `clampPauseDuration` as globals — `shared.js` is listed before `content.js` in the manifest's `content_scripts.js` array, so its top-level functions are available in the same isolated world.
- Consumes: `chrome.storage.sync` key `pauseDurationSeconds`, `chrome.storage.local` key `snoozeUntil` (written by Task 3's popup; both may be absent, in which case defaults apply).
- Produces: the user-visible blocking behavior. No exports.

There is no automated test for this task — it is DOM glue against YouTube's live page. Verification is the manual checklist in Step 4, performed by your human partner.

- [ ] **Step 1: Create the manifest**

Create `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "YouTube Pause",
  "version": "1.0.0",
  "description": "A moment to think before every YouTube video.",
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["shared.js", "content.js"],
      "css": ["overlay.css"],
      "run_at": "document_start"
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

Note: `popup.html` does not exist until Task 3. Chrome loads the extension fine with a missing popup file (clicking the toolbar icon just fails), so Task 2 remains independently testable.

- [ ] **Step 2: Create the overlay stylesheet**

Create `overlay.css`:

```css
#yt-pause-overlay {
  position: absolute;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  box-sizing: border-box;
  background: #0f0f0f;
  color: #f1f1f1;
  font-family: "Roboto", "Arial", sans-serif;
  text-align: center;
}

.yt-pause-title {
  font-size: 20px;
  font-weight: 500;
  max-width: 80%;
}

.yt-pause-prompt {
  font-size: 16px;
  color: #aaaaaa;
}

.yt-pause-countdown {
  font-size: 32px;
  font-variant-numeric: tabular-nums;
  color: #717171;
}

.yt-pause-buttons {
  display: flex;
  gap: 16px;
}

.yt-pause-hidden {
  display: none;
}

.yt-pause-button {
  font-size: 15px;
  padding: 10px 24px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
}

.yt-pause-go-back {
  background: #f1f1f1;
  color: #0f0f0f;
}

.yt-pause-watch {
  background: #272727;
  color: #f1f1f1;
}
```

- [ ] **Step 3: Create the content script**

Create `content.js`:

```js
"use strict";

// getWatchVideoId, isSnoozed, clampPauseDuration are globals from shared.js,
// which the manifest loads before this file.

const POLL_MS = 100;
const POLL_MAX_MS = 10000;
const TITLE_POLL_MS = 250;
const TITLE_POLL_MAX_MS = 5000;
const URL_POLL_MS = 1000;

let lastHandledVideoId = null;
let activeBlock = null;

function handleNavigation() {
  const videoId = getWatchVideoId(location.href);
  if (!videoId) {
    teardownBlock();
    lastHandledVideoId = null;
    return;
  }
  if (videoId === lastHandledVideoId) return;
  lastHandledVideoId = videoId;
  teardownBlock();

  chrome.storage.local.get("snoozeUntil", (local) => {
    if (isSnoozed(local.snoozeUntil, Date.now())) return;
    chrome.storage.sync.get("pauseDurationSeconds", (sync) => {
      // The user may have navigated again while storage was loading.
      if (getWatchVideoId(location.href) !== videoId) return;
      startBlock(videoId, clampPauseDuration(sync.pauseDurationSeconds));
    });
  });
}

function startBlock(videoId, pauseSeconds) {
  const block = {
    videoId,
    video: null,
    onPlay: null,
    overlay: null,
    observer: null,
    timers: [],
  };
  activeBlock = block;

  // Silence the video as early as possible.
  pollFor(
    block,
    () => document.querySelector("#movie_player video, video.html5-main-video, video"),
    POLL_MS,
    POLL_MAX_MS,
    (video) => {
      block.video = video;
      video.muted = true;
      video.pause();
      block.onPlay = () => video.pause();
      video.addEventListener("play", block.onPlay);
    },
    null
  );

  // Attach the overlay to the player container; fail open on timeout.
  pollFor(
    block,
    () => document.querySelector("#movie_player") || document.querySelector("ytd-player"),
    POLL_MS,
    POLL_MAX_MS,
    (container) => {
      block.overlay = buildOverlay(pauseSeconds);
      container.appendChild(block.overlay.root);
      keepAttached(block, container);
      runCountdown(block, pauseSeconds);
      fillTitle(block);
    },
    () => teardownBlock()
  );
}

function pollFor(block, getter, intervalMs, maxMs, onFound, onTimeout) {
  const started = Date.now();
  const attempt = () => {
    if (activeBlock !== block) return true;
    const found = getter();
    if (found) {
      onFound(found);
      return true;
    }
    if (Date.now() - started > maxMs) {
      if (onTimeout) onTimeout();
      return true;
    }
    return false;
  };
  if (attempt()) return;
  const timer = setInterval(() => {
    if (attempt()) clearInterval(timer);
  }, intervalMs);
  block.timers.push(timer);
}

function buildOverlay(pauseSeconds) {
  const root = document.createElement("div");
  root.id = "yt-pause-overlay";

  const title = document.createElement("div");
  title.className = "yt-pause-title";

  const prompt = document.createElement("div");
  prompt.className = "yt-pause-prompt";
  prompt.textContent = "Do you actually want to watch this?";

  const countdown = document.createElement("div");
  countdown.className = "yt-pause-countdown";
  countdown.textContent = String(pauseSeconds);

  const buttons = document.createElement("div");
  buttons.className = "yt-pause-buttons yt-pause-hidden";

  const goBack = document.createElement("button");
  goBack.className = "yt-pause-button yt-pause-go-back";
  goBack.textContent = "Go back";
  goBack.addEventListener("click", onGoBack);

  const watch = document.createElement("button");
  watch.className = "yt-pause-button yt-pause-watch";
  watch.textContent = "Watch";
  watch.addEventListener("click", onWatch);

  buttons.append(goBack, watch);
  root.append(title, prompt, countdown, buttons);
  return { root, titleEl: title, countdownEl: countdown, buttonsEl: buttons };
}

function runCountdown(block, pauseSeconds) {
  let remaining = pauseSeconds;
  const timer = setInterval(() => {
    if (activeBlock !== block) {
      clearInterval(timer);
      return;
    }
    remaining -= 1;
    if (remaining > 0) {
      block.overlay.countdownEl.textContent = String(remaining);
      return;
    }
    clearInterval(timer);
    block.overlay.countdownEl.classList.add("yt-pause-hidden");
    block.overlay.buttonsEl.classList.remove("yt-pause-hidden");
  }, 1000);
  block.timers.push(timer);
}

function fillTitle(block) {
  pollFor(
    block,
    () => {
      const el = document.querySelector(
        "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string"
      );
      const text = el && el.textContent.trim();
      return text || null;
    },
    TITLE_POLL_MS,
    TITLE_POLL_MAX_MS,
    (text) => {
      block.overlay.titleEl.textContent = text;
    },
    () => {
      // Fallback: the tab title, minus YouTube's suffix. May be stale; still
      // better than nothing, and the block itself never waited on it.
      const fallback = document.title.replace(/ - YouTube$/, "").trim();
      if (fallback) block.overlay.titleEl.textContent = fallback;
    }
  );
}

function keepAttached(block, container) {
  const observer = new MutationObserver(() => {
    if (activeBlock === block && !block.overlay.root.isConnected) {
      container.appendChild(block.overlay.root);
    }
  });
  observer.observe(container, { childList: true });
  block.observer = observer;
}

function onWatch() {
  const block = activeBlock;
  if (!block) return;
  const video = block.video;
  teardownBlock();
  if (video) {
    video.muted = false;
    video.play();
  }
}

function onGoBack() {
  teardownBlock();
  // Returning to this video later should block it again.
  lastHandledVideoId = null;
  if (history.length > 1) {
    history.back();
  } else {
    location.href = "https://www.youtube.com/";
  }
}

function teardownBlock() {
  const block = activeBlock;
  if (!block) return;
  activeBlock = null;
  block.timers.forEach(clearInterval);
  if (block.observer) block.observer.disconnect();
  if (block.overlay) block.overlay.root.remove();
  if (block.video) {
    if (block.onPlay) block.video.removeEventListener("play", block.onPlay);
    block.video.muted = false;
  }
}

document.addEventListener("yt-navigate-finish", handleNavigation);

let lastPolledUrl = location.href;
setInterval(() => {
  if (location.href !== lastPolledUrl) {
    lastPolledUrl = location.href;
    handleNavigation();
  }
}, URL_POLL_MS);

handleNavigation();
```

- [ ] **Step 4: Manual verification (requires your human partner)**

Ask your human partner to load the extension and run this checklist. Loading: open `chrome://extensions`, enable Developer mode, click "Load unpacked", select the project directory.

1. Open a video via direct URL → player is covered by a dark overlay with title, prompt, and a countdown; no audio plays.
2. After 3 seconds, **Watch** and **Go back** buttons appear; the video is still paused.
3. During the block, press space and `k` → the video stays paused.
4. Click **Watch** → overlay disappears, video plays with sound.
5. Click a sidebar recommendation → the new video is blocked again.
6. Click a search result → blocked.
7. Let a video play to the end so autoplay advances → the next video is blocked, no audio leak.
8. Click **Go back** on a blocked video → returns to the previous page; navigating to the same video again re-blocks it.
9. Browse pages (home, subscriptions, search) show no overlay and behave normally.

Expected: all nine pass.

- [ ] **Step 5: Commit**

```bash
git add manifest.json overlay.css content.js
git commit -m "feat: block YouTube videos behind a reflective pause overlay"
```

---

### Task 3: Toolbar popup — duration setting and 1-hour snooze

**Files:**
- Create: `popup.html`
- Create: `popup.css`
- Create: `popup.js`

**Interfaces:**
- Consumes: `isSnoozed`, `clampPauseDuration`, `MIN_PAUSE_SECONDS`, `MAX_PAUSE_SECONDS` as globals (`popup.html` loads `shared.js` before `popup.js`).
- Produces: writes `pauseDurationSeconds` (number) to `chrome.storage.sync` and `snoozeUntil` (epoch ms) to `chrome.storage.local` — the keys Task 2's content script reads.

- [ ] **Step 1: Create the popup markup**

Create `popup.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <h1>YouTube Pause</h1>

    <div class="setting">
      <label for="duration">Pause duration: <span id="duration-value">3</span>s</label>
      <input type="range" id="duration" min="3" max="10" step="1" value="3" />
    </div>

    <div class="setting">
      <button id="snooze">Snooze for 1 hour</button>
      <div id="snooze-status" hidden>
        <span>Snoozed — <span id="snooze-remaining"></span> left</span>
        <button id="resume">Resume now</button>
      </div>
    </div>

    <script src="shared.js"></script>
    <script src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the popup stylesheet**

Create `popup.css`:

```css
body {
  width: 240px;
  margin: 0;
  padding: 16px;
  font-family: "Roboto", "Arial", sans-serif;
  font-size: 14px;
  background: #0f0f0f;
  color: #f1f1f1;
}

h1 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 500;
}

.setting {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #aaaaaa;
}

input[type="range"] {
  width: 100%;
}

button {
  font-size: 13px;
  padding: 8px 16px;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  background: #272727;
  color: #f1f1f1;
}

#snooze-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #aaaaaa;
}
```

- [ ] **Step 3: Create the popup script**

Create `popup.js`:

```js
"use strict";

// isSnoozed and clampPauseDuration are globals from shared.js,
// loaded by popup.html before this file.

const durationInput = document.getElementById("duration");
const durationValue = document.getElementById("duration-value");
const snoozeButton = document.getElementById("snooze");
const snoozeStatus = document.getElementById("snooze-status");
const snoozeRemaining = document.getElementById("snooze-remaining");
const resumeButton = document.getElementById("resume");

chrome.storage.sync.get("pauseDurationSeconds", (items) => {
  const seconds = clampPauseDuration(items.pauseDurationSeconds);
  durationInput.value = String(seconds);
  durationValue.textContent = String(seconds);
});

durationInput.addEventListener("input", () => {
  const seconds = clampPauseDuration(Number(durationInput.value));
  durationValue.textContent = String(seconds);
  chrome.storage.sync.set({ pauseDurationSeconds: seconds });
});

function renderSnooze() {
  chrome.storage.local.get("snoozeUntil", (items) => {
    if (isSnoozed(items.snoozeUntil, Date.now())) {
      const minutes = Math.ceil((items.snoozeUntil - Date.now()) / 60000);
      snoozeRemaining.textContent = minutes + " min";
      snoozeStatus.hidden = false;
      snoozeButton.hidden = true;
    } else {
      snoozeStatus.hidden = true;
      snoozeButton.hidden = false;
    }
  });
}

snoozeButton.addEventListener("click", () => {
  chrome.storage.local.set({ snoozeUntil: Date.now() + 60 * 60 * 1000 }, renderSnooze);
});

resumeButton.addEventListener("click", () => {
  chrome.storage.local.remove("snoozeUntil", renderSnooze);
});

renderSnooze();
```

- [ ] **Step 4: Manual verification (requires your human partner)**

Ask your human partner to reload the extension at `chrome://extensions` (click the reload icon on the extension card), then:

1. Click the toolbar icon → popup opens showing the slider at 3s and a "Snooze for 1 hour" button.
2. Move the slider to 7 → label updates; open a new video → the countdown starts at 7.
3. Reopen the popup → slider still shows 7 (persisted).
4. Click "Snooze for 1 hour" → status shows "Snoozed — 60 min left" with a "Resume now" button; open a new video → it plays immediately, no overlay.
5. Click "Resume now" → snooze status disappears; open a new video → blocked again.

Note: snooze is checked when a block starts, so snoozing doesn't unblock an already-blocked video and resuming doesn't block one already playing. That is intended.

Expected: all five pass.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: add popup with pause duration setting and 1-hour snooze"
```

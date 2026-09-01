"use strict";

// getWatchVideoId, clampPauseDuration, countdownRemaining and isEnabled
// are globals from shared.js, which the manifest loads before this file.

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

  // teardownBlock() just unmuted the previous video (if any). Mute the
  // current video synchronously so there's no audio-leak window while we
  // wait on the async storage read below.
  const earlyVideo = document.querySelector(
    "#movie_player video, video.html5-main-video, video"
  );
  if (earlyVideo) earlyVideo.muted = true;

  chrome.storage.sync.get(["enabled", "pauseDurationSeconds"], (sync) => {
    if (!isEnabled(sync.enabled)) {
      if (earlyVideo) earlyVideo.muted = false;
      return;
    }
    // The user may have navigated again while storage was loading.
    // The newer navigation owns the element now; don't unmute it here.
    if (getWatchVideoId(location.href) !== videoId) return;
    startBlock(videoId, clampPauseDuration(sync.pauseDurationSeconds));
  });
}

function startBlock(videoId, pauseSeconds) {
  teardownBlock();
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
    () => document.querySelector("#movie_player"),
    POLL_MS,
    POLL_MAX_MS,
    (container) => {
      block.overlay = buildOverlay(pauseSeconds);
      container.appendChild(block.overlay.root);
      keepAttached(block, container);
      runCountdown(block, pauseSeconds);
      fillTitle(block);

      // Fail open if YouTube replaces the player container or the video
      // node while the block is active (keepAttached's re-append handles
      // the benign transient-detach case first).
      const watchdog = setInterval(() => {
        if (activeBlock !== block) {
          clearInterval(watchdog);
          return;
        }
        const overlayGone = !block.overlay.root.isConnected;
        const videoGone = block.video && !block.video.isConnected;
        if (overlayGone || videoGone) {
          const video = block.video;
          teardownBlock();
          if (video && video.isConnected) video.play().catch(() => {});
        }
      }, 1000);
      block.timers.push(watchdog);
    },
    () => {
      const video = activeBlock && activeBlock.video;
      teardownBlock();
      if (video) video.play().catch(() => {});
    }
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
  // Wall-clock based so a throttled/hidden background tab (where interval
  // ticks get stretched) still resolves the countdown correctly.
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (activeBlock !== block) {
      clearInterval(timer);
      return;
    }
    const remaining = countdownRemaining(startedAt, Date.now(), pauseSeconds);
    if (remaining > 0) {
      block.overlay.countdownEl.textContent = String(remaining);
      return;
    }
    clearInterval(timer);
    block.overlay.countdownEl.classList.add("yt-pause-hidden");
    block.overlay.buttonsEl.classList.remove("yt-pause-hidden");
  }, 250);
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
    video.play().catch(() => {});
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

"use strict";

const MIN_PAUSE_SECONDS = 1;
const MAX_PAUSE_SECONDS = 60;
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

function clampPauseDuration(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PAUSE_SECONDS;
  }
  return Math.min(MAX_PAUSE_SECONDS, Math.max(MIN_PAUSE_SECONDS, Math.round(value)));
}

function countdownRemaining(startedAtMs, nowMs, totalSeconds) {
  const elapsed = Math.floor((nowMs - startedAtMs) / 1000);
  return Math.max(0, totalSeconds - elapsed);
}

function isEnabled(value) {
  // Only an explicit stored false disables blocking; absent or garbage
  // values fail open to enabled.
  return value !== false;
}

if (typeof module !== "undefined") {
  module.exports = {
    getWatchVideoId,
    clampPauseDuration,
    countdownRemaining,
    isEnabled,
    MIN_PAUSE_SECONDS,
    MAX_PAUSE_SECONDS,
    DEFAULT_PAUSE_SECONDS,
  };
}

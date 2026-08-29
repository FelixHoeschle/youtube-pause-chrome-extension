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

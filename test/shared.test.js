"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getWatchVideoId, clampPauseDuration, countdownRemaining, isEnabled } = require("../shared.js");

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

test("clampPauseDuration clamps into [1, 60] and rounds", () => {
  assert.equal(clampPauseDuration(5), 5);
  assert.equal(clampPauseDuration(4.6), 5);
  assert.equal(clampPauseDuration(1), 1);
  assert.equal(clampPauseDuration(0), 1);
  assert.equal(clampPauseDuration(-5), 1);
  assert.equal(clampPauseDuration(60), 60);
  assert.equal(clampPauseDuration(99), 60);
});

test("clampPauseDuration returns default 3 for non-numbers", () => {
  assert.equal(clampPauseDuration(undefined), 3);
  assert.equal(clampPauseDuration(NaN), 3);
  assert.equal(clampPauseDuration("7"), 3);
});

test("countdownRemaining equals total at the start", () => {
  assert.equal(countdownRemaining(1000, 1000, 3), 3);
});

test("countdownRemaining decreases by 1 per elapsed second", () => {
  assert.equal(countdownRemaining(1000, 2000, 3), 2);
  assert.equal(countdownRemaining(1000, 2999, 3), 2);
  assert.equal(countdownRemaining(1000, 3000, 3), 1);
});

test("countdownRemaining returns 0 at exactly totalSeconds elapsed", () => {
  assert.equal(countdownRemaining(1000, 4000, 3), 0);
});

test("countdownRemaining clamps to 0 beyond totalSeconds elapsed", () => {
  assert.equal(countdownRemaining(1000, 5000, 3), 0);
});

test("countdownRemaining returns 0 for a large gap simulating a throttled tab", () => {
  // 60s elapsed on a 3s countdown, as could happen in a hidden/throttled tab.
  assert.equal(countdownRemaining(1000, 61000, 3), 0);
});

test("isEnabled is false only for a stored false", () => {
  assert.equal(isEnabled(false), false);
  assert.equal(isEnabled(true), true);
});

test("isEnabled defaults to true for absent or garbage values", () => {
  assert.equal(isEnabled(undefined), true);
  assert.equal(isEnabled(null), true);
  assert.equal(isEnabled(0), true);
  assert.equal(isEnabled("false"), true);
});

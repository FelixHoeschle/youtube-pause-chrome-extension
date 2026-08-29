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

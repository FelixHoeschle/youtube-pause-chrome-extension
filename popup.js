"use strict";

// clampPauseDuration and isEnabled are globals from shared.js,
// loaded by popup.html before this file.

const toggleInput = document.getElementById("toggle");
const durationInput = document.getElementById("duration");
const durationValue = document.getElementById("duration-value");

chrome.storage.sync.get("enabled", (items) => {
  toggleInput.checked = isEnabled(items.enabled);
});

toggleInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggleInput.checked });
});

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

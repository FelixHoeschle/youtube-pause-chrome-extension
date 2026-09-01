"use strict";

// clampPauseDuration and isEnabled are globals from shared.js,
// loaded by popup.html before this file.

const toggleButton = document.getElementById("toggle");
const enabledState = document.getElementById("enabled-state");
const durationInput = document.getElementById("duration");
const durationValue = document.getElementById("duration-value");

function renderEnabled() {
  chrome.storage.sync.get("enabled", (items) => {
    const on = isEnabled(items.enabled);
    enabledState.textContent = on ? "On" : "Off";
    toggleButton.textContent = on ? "Turn off" : "Turn on";
    toggleButton.classList.toggle("off", !on);
  });
}

toggleButton.addEventListener("click", () => {
  chrome.storage.sync.get("enabled", (items) => {
    chrome.storage.sync.set({ enabled: !isEnabled(items.enabled) }, renderEnabled);
  });
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

renderEnabled();

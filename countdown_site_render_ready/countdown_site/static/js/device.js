"use strict";
(() => {
  const status = document.getElementById("deviceIdentityStatus");
  if (!status) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 16000);
  fetch("/api/device", {cache: "no-store", credentials: "same-origin", signal: controller.signal})
    .then(async response => {
      if (!response.ok) throw new Error("Identity unavailable");
      const data = await response.json();
      if (data.recognized) {
        status.hidden = false;
        status.textContent = `${data.name} · Bu cihaz tanınıyor`;
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
})();

"use strict";
(() => {
  const rows = document.querySelectorAll(".availability-row[data-person]");
  let expiresAt = 0;
  let inFlight = false;
  let timer;
  function unknown() {
    for (const row of rows) {
      row.dataset.state = "unknown";
      row.querySelector(".availability-label").textContent =
        row.dataset.person === "seyda"
          ? "Şeyda · durum bilinmiyor"
          : "Rıdvan · durum bilinmiyor";
    }
  }
  function render(data) {
    for (const person of data.people) {
      const row = Array.from(rows).find(
        (item) => item.dataset.person === person.id,
      );
      if (!row) continue;
      row.dataset.state = person.state;
      row.querySelector(".availability-label").textContent = person.label;
      row.title = person.reason || "Ders ve çalışma programına göre durum";
    }
  }
  async function refresh() {
    if (document.hidden || inFlight) return;
    clearTimeout(timer);
    if (performance.now() >= expiresAt) unknown();
    inFlight = true;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let nextPoll = 15000;
    try {
      const response = await fetch("/api/availability", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Availability unavailable");
      const data = await response.json();
      const remaining =
        Date.parse(data.valid_until) - Date.parse(data.server_time);
      if (
        !Number.isFinite(remaining) ||
        remaining <= 0 ||
        !Array.isArray(data.people) ||
        data.people.length !== rows.length ||
        !["seyda", "ridvan"].every((id) =>
          data.people.some(
            (p) =>
              p.id === id &&
              ["busy", "active", "unknown"].includes(p.state) &&
              typeof p.label === "string",
          ),
        )
      ) {
        throw new Error("Invalid availability response");
      }
      // Sunucu saatini esas al; cihazın saat dilimi/saat ayarı sonucu değiştirmesin.
      const safeRemaining = remaining - (performance.now() - startedAt);
      if (safeRemaining <= 0) throw new Error("Expired availability response");
      expiresAt = performance.now() + safeRemaining;
      render(data);
      nextPoll = Math.max(250, Math.min(60000, safeRemaining));
    } catch {
      expiresAt = 0;
      unknown();
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      timer = setTimeout(refresh, nextPoll);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
    else clearTimeout(timer);
  });
  window.addEventListener("pageshow", refresh);
  window.addEventListener("online", refresh);
  refresh();
})();

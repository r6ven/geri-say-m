"use strict";
function updateCountdown(card, now = Date.now()) {
  const target = Date.parse(card.dataset.target);
  if (!Number.isFinite(target)) return;
  const elapsed = now >= target;
  const seconds = Math.floor(Math.abs(target - now) / 1000);
  const values = {
    days: Math.floor(seconds / 86400),
    hours: Math.floor(seconds / 3600) % 24,
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
  for (const [name, value] of Object.entries(values))
    card.querySelector(`.${name}`).textContent = String(value).padStart(2, "0");
  card.querySelector(".timer-state").textContent = elapsed
    ? card.dataset.event === "dugun"
      ? "Düğünümüzden beri geçen süre"
      : "Birlikte geçen süre"
    : "Kalan süre";
  card.querySelector(".card-note").textContent = elapsed
    ? card.dataset.afterNote
    : card.dataset.beforeNote;
  card.dataset.finished = String(elapsed);
}
function updateClocks() {
  const now = Date.now();
  document
    .querySelectorAll(".countdown-card")
    .forEach((card) => updateCountdown(card, now));
  document.querySelectorAll("[data-story-target]").forEach((item) => {
    const future = now < Date.parse(item.dataset.storyTarget);
    item.classList.toggle("is-future", future);
    item.querySelector(".story-state").textContent = future
      ? "Sıradaki güzel günümüz"
      : "Hikâyemizde bir dönüm noktası";
  });
}
updateClocks();
setInterval(() => {
  if (!document.hidden) updateClocks();
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClocks();
});

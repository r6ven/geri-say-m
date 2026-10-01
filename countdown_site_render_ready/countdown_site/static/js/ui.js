"use strict";
(() => {
  const menu = document.getElementById("siteMenu");
  const toggle = document.getElementById("menuToggle");
  const photoDialog = document.getElementById("photoDialog");
  const fullPhoto = document.getElementById("fullPhoto");
  const viewport = document.getElementById("photoViewport");
  const canvas = document.getElementById("photoCanvas");
  const zoomValue = document.getElementById("zoomValue");
  let zoom = 1;
  let zoomFrame;

  function syncDialogState() {
    document.body.classList.toggle(
      "has-dialog",
      Boolean(document.querySelector("dialog[open]")),
    );
    toggle.setAttribute("aria-expanded", String(menu.open));
  }
  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    syncDialogState();
  }
  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
    syncDialogState();
  }
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", () => {
      dialog.querySelectorAll("video").forEach((video) => video.pause());
      syncDialogState();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        closeDialog(dialog);
    });
    dialog
      .querySelectorAll("[data-close-dialog]")
      .forEach((button) =>
        button.addEventListener("click", () => closeDialog(dialog)),
      );
  });
  toggle.addEventListener("click", () => openDialog(menu));
  document.querySelectorAll("[data-open-dialog]").forEach((button) =>
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.openDialog);
      if (menu.open) closeDialog(menu);
      openDialog(target);
    }),
  );
  // Menüden geçilen galeri kapanınca odağı görünür menü düğmesine döndür.
  ["photosDialog", "videosDialog"].forEach((id) =>
    document.getElementById(id).addEventListener("close", () => toggle.focus()),
  );
  document.querySelectorAll("#videosDialog video").forEach((video) =>
    video.addEventListener("play", () => {
      document.querySelectorAll("#videosDialog video").forEach((other) => {
        if (other !== video) other.pause();
      });
    }),
  );

  function applyZoom(center = true) {
    const previousWidth = canvas.clientWidth || viewport.clientWidth;
    const previousHeight = canvas.clientHeight || viewport.clientHeight;
    const centerX =
      (viewport.scrollLeft + viewport.clientWidth / 2) / previousWidth;
    const centerY =
      (viewport.scrollTop + viewport.clientHeight / 2) / previousHeight;
    canvas.style.width = `${zoom * 100}%`;
    canvas.style.height = `${zoom * 100}%`;
    zoomValue.textContent = `%${Math.round(zoom * 100)}`;
    document.getElementById("zoomOut").disabled = zoom <= 1;
    document.getElementById("zoomIn").disabled = zoom >= 3;
    cancelAnimationFrame(zoomFrame);
    zoomFrame = requestAnimationFrame(() => {
      viewport.scrollLeft = center
        ? centerX * canvas.clientWidth - viewport.clientWidth / 2
        : 0;
      viewport.scrollTop = center
        ? centerY * canvas.clientHeight - viewport.clientHeight / 2
        : 0;
    });
  }
  function openPhoto(src, title, caption = "") {
    document.getElementById("photoTitle").textContent = title;
    document.getElementById("photoCaption").textContent = caption;
    fullPhoto.src = src;
    fullPhoto.alt = title;
    document.getElementById("photoDownload").href = src;
    openDialog(photoDialog);
    zoom = 1;
    applyZoom(false);
  }
  document
    .querySelectorAll("[data-photo-src]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openPhoto(
          button.dataset.photoSrc,
          button.dataset.photoTitle,
          button.dataset.photoCaption,
        ),
      ),
    );
  document.getElementById("zoomIn").addEventListener("click", () => {
    zoom = Math.min(3, Math.round((zoom + 0.25) * 100) / 100);
    applyZoom();
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    zoom = Math.max(1, Math.round((zoom - 0.25) * 100) / 100);
    applyZoom();
  });
  document.getElementById("zoomReset").addEventListener("click", () => {
    zoom = 1;
    applyZoom(false);
  });
  fullPhoto.addEventListener("dblclick", () => {
    zoom = zoom === 1 ? 2 : 1;
    applyZoom();
  });
  photoDialog.addEventListener("close", () => {
    cancelAnimationFrame(zoomFrame);
    fullPhoto.removeAttribute("src");
    zoom = 1;
  });

  const dailyImage = document.getElementById("dailyPhotoImage");
  const dailyButton = document.getElementById("dailyPhotoButton");
  const status = document.getElementById("dailyPhotoStatus");
  const fallbackSrc = dailyImage.getAttribute("src");
  const fallbackAlt = dailyImage.alt;
  const dayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayKey = () => dayFormat.format(new Date());
  let observedDay = todayKey();
  let inFlight = false;
  let nextAttempt = 0;
  let requestGeneration = 0;
  let dailyTitle = "Günün karesi";
  dailyButton.addEventListener("click", () => {
    if (!dailyButton.disabled) openPhoto(dailyImage.src, dailyTitle);
  });

  async function refreshDailyPhoto() {
    const now = Date.now();
    if (document.hidden || inFlight || now < nextAttempt) return;
    inFlight = true;
    const generation = ++requestGeneration;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/daily-photo", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Daily photo unavailable");
      const data = await response.json();
      if (!data.image_url) throw new Error("Missing image");
      await new Promise((resolve, reject) => {
        const probe = new Image();
        const imageTimeout = setTimeout(() => {
          probe.onload = probe.onerror = null;
          reject(new Error("Image timeout"));
        }, 12000);
        probe.onload = () => {
          clearTimeout(imageTimeout);
          resolve();
        };
        probe.onerror = () => {
          clearTimeout(imageTimeout);
          reject(new Error("Image unavailable"));
        };
        probe.src = data.image_url;
      });
      if (generation !== requestGeneration) return;
      dailyImage.onerror = () => {
        dailyImage.onerror = null;
        if (fallbackSrc) dailyImage.src = fallbackSrc;
        else dailyImage.hidden = true;
        dailyImage.alt = fallbackAlt;
        dailyButton.disabled = true;
        status.textContent =
          "Günün karesi yüklenemedi. Anı fotoğrafımız burada kalıyor.";
        nextAttempt = Date.now() + 60000;
      };
      dailyImage.src = data.image_url;
      dailyImage.hidden = false;
      dailyTitle = data.name ? `Günün karesi · ${data.name}` : "Günün karesi";
      dailyImage.alt = dailyTitle;
      dailyButton.disabled = false;
      status.textContent = data.stale
        ? "Son yüklenen kare · Yeni fotoğraf birazdan yeniden denenecek."
        : "Bugün bize eşlik eden anı.";
      nextAttempt =
        data.stale || data.retry_after_seconds
          ? Date.now() + 60000
          : Date.now() + 15 * 60000;
    } catch (error) {
      status.textContent = dailyButton.disabled
        ? "Günün karesi şu an yüklenemiyor. Anı fotoğrafımız burada kalıyor."
        : "Son yüklenen kare · Bağlantı gelince yenilenecek.";
      nextAttempt = Date.now() + 60000;
    } finally {
      clearTimeout(timeout);
      inFlight = false;
    }
  }
  // Gece yarısında bekleme süresini atla; İstanbul tarihini esas al.
  function checkDailyPhoto() {
    const currentDay = todayKey();
    if (observedDay !== currentDay) {
      observedDay = currentDay;
      nextAttempt = 0;
    }
    refreshDailyPhoto();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDailyPhoto();
  });
  window.addEventListener("pageshow", checkDailyPhoto);
  setInterval(checkDailyPhoto, 30000);
  refreshDailyPhoto();
})();

"use strict";
(() => {
  let invite = new URLSearchParams(location.hash.slice(1)).get("invite");
  // Enrollment tokens never enter request URLs, access logs or referrers.
  history.replaceState(null, "", location.pathname);
  const button = document.getElementById("enrollDevice");
  const status = document.getElementById("enrollStatus");
  const next = document.querySelector('meta[name="device-next"]').content;
  if (!invite || !/^[A-Za-z0-9_-]{43}$/.test(invite)) {
    button.disabled = true;
    status.textContent = "Cihaz tanıtmak için sana gönderilen özel bağlantıyı aç.";
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Cihaz tanıtılıyor…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("/api/device/enroll", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: {"Content-Type": "application/json", "X-Device-CSRF": document.querySelector('meta[name="device-csrf"]').content},
        body: JSON.stringify({invite}), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "already_registered") {
          status.textContent = `Bu tarayıcı zaten ${data.name} adına tanıtılmış.`;
          if (next === "/maintenance") location.replace(next);
        }
        else if (data.error === "storage_unavailable") status.textContent = "Kayıt sistemine şu an bağlanılamıyor. Biraz sonra yeniden dene.";
        else status.textContent = "Bağlantı kullanılmış, süresi dolmuş veya geçersiz. Yeni bağlantı iste.";
        button.disabled = data.error !== "storage_unavailable";
        return;
      }
      // Verify the browser actually retained its cookie before claiming success.
      const verification = await fetch("/api/device", {cache: "no-store", signal: controller.signal});
      const identity = await verification.json();
      if (!verification.ok || !identity.recognized || identity.device_id !== data.device_id) {
        status.textContent = "Kayıt oluşturuldu ancak tarayıcı doğrulanamadı. Çerez ayarlarını kontrol et; gerekirse yeni bağlantı iste.";
        return;
      }
      invite = null;
      status.textContent = `${data.name} · ${data.label} tanıtıldı. Sonraki ziyaretlerinde bu tarayıcı seni hatırlayacak.`;
      location.replace(next);
    } catch {
      status.textContent = "Sonuç doğrulanamadı. Önce siteye dön; tanınmıyorsan yeni bağlantı iste.";
    } finally { clearTimeout(timeout); }
  });
})();

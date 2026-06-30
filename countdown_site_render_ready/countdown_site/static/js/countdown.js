function updateCountdown(card) {
    const title = card.querySelector('.special-title')?.textContent || '';
    const isNikahCard = title.includes('NİKAH');

    const targetDate = new Date(card.dataset.target).getTime();

    if (Number.isNaN(targetDate)) {
        console.error('Geçersiz geri sayım tarihi:', card.dataset.target, card);
        card.dataset.finished = 'false';
        return;
    }

    const now = new Date().getTime();

    let diff = targetDate - now;
    const isFinished = diff <= 0;

    /*
        Nikah tarihi geçince:
        - Arka planda finished true kalır.
        - Video sürprizi yine tetiklenir.
        - Ekranda ileri sayım görünür.
    */
    if (isFinished && isNikahCard) {
        diff = now - targetDate;

        const note = card.querySelector('.card-note');
        if (note) {
            note.textContent = ''ŞEYDA YILMAZ BENİM KARIM' SAYACI';
        }
    } else if (diff < 0) {
        diff = 0;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    card.querySelector('.days').textContent = String(days).padStart(2, '0');
    card.querySelector('.hours').textContent = String(hours).padStart(2, '0');
    card.querySelector('.minutes').textContent = String(minutes).padStart(2, '0');
    card.querySelector('.seconds').textContent = String(seconds).padStart(2, '0');

    card.dataset.finished = isFinished ? 'true' : 'false';
}

const countdownCards = document.querySelectorAll('.countdown-card');

function tick() {
    countdownCards.forEach(updateCountdown);
    setupNikahSurprise();
}

/* FOTOĞRAF BÜYÜTME */
const galleryImages = document.querySelectorAll('.gallery-image');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');

if (galleryImages.length && lightbox && lightboxImage && lightboxClose) {
    galleryImages.forEach((img) => {
        img.addEventListener('click', () => {
            lightboxImage.src = img.src;
            lightboxImage.alt = img.alt;
            lightbox.classList.add('active');
            lightbox.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        });
    });

    function closeLightbox() {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImage.src = '';
        document.body.style.overflow = '';
    }

    lightboxClose.addEventListener('click', closeLightbox);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });
}

/* NİKAH SÜRPRİZ VİDEO */
const NIKAH_VIDEO_SRC = '/static/photos/nikah-surpriz.mp4';
const NIKAH_POSTER_SRC = '/static/photos/kapak.jpg';
const NIKAH_VIDEO_WATCHED_KEY = 'nikah_surprise_video_watched_v1';

let nikahSurpriseInitialized = false;

function getNikahCard() {
    return Array.from(document.querySelectorAll('.countdown-card')).find((card) => {
        const title = card.querySelector('.special-title')?.textContent || '';
        return title.includes('NİKAH');
    });
}

function hasWatchedNikahVideo() {
    return localStorage.getItem(NIKAH_VIDEO_WATCHED_KEY) === 'true';
}

function markNikahVideoWatched() {
    localStorage.setItem(NIKAH_VIDEO_WATCHED_KEY, 'true');
}

function setupNikahSurprise() {
    const nikahCard = getNikahCard();

    if (!nikahCard) return;

    const isFinished = nikahCard.dataset.finished === 'true';
    const watched = hasWatchedNikahVideo();

    if (!nikahSurpriseInitialized) {
        nikahSurpriseInitialized = true;
        createNikahVideoModal();
        addNikahHeartClick(nikahCard);
    }

    if (!isFinished) return;

    if (watched) {
        unlockNikahCard(nikahCard);
        renderNikahReplayBox();
        return;
    }

    lockNikahCard(nikahCard);
}

function lockNikahCard(card) {
    if (card.querySelector('.nikah-surprise-overlay')) return;

    card.classList.add('nikah-surprise-locked');

    const overlay = document.createElement('div');
    overlay.className = 'nikah-surprise-overlay';
    overlay.innerHTML = `
        <div class="nikah-surprise-message">
            <h3>Bugün nikah günümüz.</h3>
            <p>Seni çok seviyorum ve ufak bir sürpriz hazırladım.</p>
            <button type="button" class="nikah-watch-btn">İzle</button>
        </div>
    `;

    overlay.querySelector('.nikah-watch-btn').addEventListener('click', function (event) {
        event.stopPropagation();
        openNikahVideoModal();
    });

    card.appendChild(overlay);
}

function unlockNikahCard(card) {
    card.classList.remove('nikah-surprise-locked');

    const overlay = card.querySelector('.nikah-surprise-overlay');
    if (overlay) overlay.remove();
}

function createNikahVideoModal() {
    if (document.getElementById('nikahVideoModal')) return;

    const modal = document.createElement('div');
    modal.className = 'nikah-video-modal';
    modal.id = 'nikahVideoModal';
    modal.setAttribute('aria-hidden', 'true');

    modal.innerHTML = `
        <div class="nikah-video-card">
            <button type="button" class="nikah-video-close" id="nikahVideoClose" aria-label="Kapat">×</button>

            <video id="nikahVideo" controls playsinline poster="${NIKAH_POSTER_SRC}">
                <source src="${NIKAH_VIDEO_SRC}" type="video/mp4">
                Tarayıcın bu videoyu oynatamıyor.
            </video>

            <div class="nikah-video-tools">
                <a href="${NIKAH_VIDEO_SRC}" download class="nikah-download-btn">Videoyu indir</a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('nikahVideoClose');
    const video = document.getElementById('nikahVideo');

    closeBtn.addEventListener('click', closeNikahVideoModal);

    modal.addEventListener('click', function (event) {
        if (event.target === modal) {
            closeNikahVideoModal();
        }
    });

    video.addEventListener('ended', function () {
        markNikahVideoWatched();

        const nikahCard = getNikahCard();
        if (nikahCard) unlockNikahCard(nikahCard);

        renderNikahReplayBox();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeNikahVideoModal();
        }
    });
}

function openNikahVideoModal() {
    const modal = document.getElementById('nikahVideoModal');
    const video = document.getElementById('nikahVideo');

    if (!modal || !video) return;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    video.currentTime = 0;
    video.play().catch(() => {
        // Mobil tarayıcı izin vermezse kullanıcı play tuşuna basabilir.
    });
}

function closeNikahVideoModal() {
    const modal = document.getElementById('nikahVideoModal');
    const video = document.getElementById('nikahVideo');

    if (!modal || !video) return;

    video.pause();

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function renderNikahReplayBox() {
    if (document.getElementById('nikahReplayBox')) return;

    const box = document.createElement('div');
    box.className = 'nikah-replay-box';
    box.id = 'nikahReplayBox';

    box.innerHTML = `
        <p>Nikah sürprizi hazır. İstersen tekrar izleyebilirsin.</p>
        <div class="nikah-replay-actions">
            <button type="button" id="nikahReplayBtn">Tekrar izle</button>
            <a href="${NIKAH_VIDEO_SRC}" download>İndir</a>
        </div>
    `;

    document.body.appendChild(box);

    document.getElementById('nikahReplayBtn').addEventListener('click', openNikahVideoModal);
}

function addNikahHeartClick(card) {
    if (card.dataset.heartClickAdded === 'true') return;

    card.dataset.heartClickAdded = 'true';

    card.addEventListener('click', function (event) {
        if (
            event.target.closest('button') ||
            event.target.closest('a') ||
            event.target.closest('video')
        ) {
            return;
        }

        createHeartBurst(event.clientX, event.clientY);
    });
}

function createHeartBurst(x, y) {
    const heartCount = 14;
    const hearts = ['💗', '💖', '💕', '💓'];

    for (let i = 0; i < heartCount; i++) {
        const heart = document.createElement('span');
        heart.className = 'pink-heart-pop';
        heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];

        const angle = Math.random() * Math.PI * 2;
        const distance = 45 + Math.random() * 75;

        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;
        heart.style.setProperty('--tx', `${tx}px`);
        heart.style.setProperty('--ty', `${ty}px`);
        heart.style.animationDelay = `${Math.random() * 0.08}s`;

        document.body.appendChild(heart);

        setTimeout(() => {
            heart.remove();
        }, 900);
    }
}

async function loadDailyDrivePhoto() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const response = await fetch(`/api/daily-photo?v=${today}`);

        if (!response.ok) {
            console.warn('Günlük Drive fotoğrafı alınamadı.');
            return;
        }

        const data = await response.json();

        if (!data.image_url) {
            console.warn('Günlük fotoğraf verisi eksik.', data);
            return;
        }

        const targetCard = document.querySelector('.photo-rail-left .photo-card:first-child');

        if (!targetCard) {
            console.warn('Günlük fotoğraf için hedef fotoğraf kartı bulunamadı.');
            return;
        }

        const targetImage = targetCard.querySelector('img');

        if (!targetImage) {
            console.warn('Günlük fotoğraf kartında img bulunamadı.');
            return;
        }

        targetCard.classList.add('daily-drive-card');

        targetImage.src = data.image_url;
        targetImage.alt = `Günün fotoğrafı: ${data.name || ''}`;
        targetImage.loading = 'lazy';

        if (!targetCard.querySelector('.daily-drive-badge')) {
            const badge = document.createElement('span');
            badge.className = 'daily-drive-badge';
            badge.textContent = 'Günün karesi';
            targetCard.appendChild(badge);
        }

    } catch (error) {
        console.warn('Günlük Drive fotoğrafı yüklenirken hata oluştu:', error);
    }
}

loadDailyDrivePhoto();

tick();
setInterval(tick, 1000);

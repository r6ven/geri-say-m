function updateCountdown(card) {
    const targetDate = new Date(card.dataset.target).getTime();
    const now = new Date().getTime();
    let diff = targetDate - now;

    if (diff < 0) diff = 0;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    card.querySelector('.days').textContent = String(days).padStart(2, '0');
    card.querySelector('.hours').textContent = String(hours).padStart(2, '0');
    card.querySelector('.minutes').textContent = String(minutes).padStart(2, '0');
    card.querySelector('.seconds').textContent = String(seconds).padStart(2, '0');
}

const countdownCards = document.querySelectorAll('.countdown-card');

function tick() {
    countdownCards.forEach(updateCountdown);
}

tick();
setInterval(tick, 1000);

/* FOTOĞRAF BÜYÜTME */
const galleryImages = document.querySelectorAll('.gallery-image');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');

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

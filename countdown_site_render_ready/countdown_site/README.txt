BİZİM GERİ SAYIMIMIZ

KURULUM
Python 3.11 veya üstü önerilir.
Repo kökünden: cd countdown_site_render_ready/countdown_site
pip install -r requirements.txt
python app.py
Varsayılan adres: http://localhost:5000
Geliştirme hata ayıklaması istenirse FLASK_DEBUG=1 kullanılır; üretimde kapalıdır.

İÇERİK
site_config.json: sayfa başlığı, nikah/düğün tarihleri, mesajlar, hikâye ve fotoğraf/video notları.
Tarihler saat dilimi içermeli: 2026-10-31T00:00:00+03:00.
Saatler şu anda 00:00'dır; gerçek etkinlik saatini bu dosyada değiştirin.
media_notes bölümünde dosya adıyla title, caption ve isteğe bağlı poster eklenebilir.
Yeni hikâye dönüm noktası için events listesine benzersiz id ve aynı alanlarla yeni etkinlik ekleyin.

static/photos içindeki JPG/JPEG/PNG/WebP/GIF fotoğrafları ve MP4/WebM/OGG videoları otomatik listelenir.
Fotoğraf isimleri photo1.jpg, photo2.jpg şeklindeyse sayısal sıraya alınır.
Sürpriz fotoğraf dahil tüm yerel fotoğraflar menüdeki Fotoğraflar bölümündedir.
Günün karesi ayrı bir Drive fotoğrafıdır; bu galeriye eklenmez.
Videolar menüde oynatılır. Ana ekranda tekrar izle kutusu veya video kilidi yoktur.
İletişim menü öğesi şu anda pasiftir.

GÜNÜN KARESİ
Sunucuda GOOGLE_API_KEY ve DRIVE_FOLDER_ID ortam değişkenlerini tanımlayın.
Drive API etkin olmalı; API anahtarı klasörün özel dosyalarına erişim yetkisi sağlamaz.
Mevcut entegrasyon API anahtarıyla erişilebilen/paylaşılan bir klasör gerektirir.
Özel klasörler için ayrıca kimlik doğrulama entegrasyonu gerekir.
Anahtarı yalnızca sunucu ortamında saklayın; repoya yazmayın.
Fotoğraflar sabit, karıştırılmış sırayla İstanbul tarihine göre döner.
Klasör değişmediği sürece tüm fotoğraflar gösterilmeden aynı fotoğraf tekrar seçilmez.
Klasöre ekleme/silme yapılırsa sıra yeniden hesaplanır.
Sayfa açıkken gün değişiminde ve sekmeye dönüldüğünde otomatik kontrol yapılır.
Liste 15 dakika bellekte tutulur. Hata durumunda 60 saniye beklenir ve son başarılı kare korunur.
Bu önbellek süreç bazındadır; günlük seçim aynı dosya listesiyle tüm süreçlerde aynıdır.

RENDER
Blueprint dosyası: countdown_site_render_ready/countdown_site/render.yaml.
Yeni Blueprint kurarken bu dosya yolunu seçin; dosya rootDir ayarını içerir.
Mevcut manuel Web Service için Root Directory: countdown_site_render_ready/countdown_site.
Build Command: pip install -r requirements.txt
Start Command: gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60
Health Check Path: /healthz
GOOGLE_API_KEY ve DRIVE_FOLDER_ID değerlerini Render Environment bölümünde girin.
Blueprint dosyası değişikliği mevcut manuel servisin panel ayarlarını otomatik güncellemez.

KONTROL
python -m unittest discover -s tests -v
node --check static/js/countdown.js
node --check static/js/ui.js

NOT
Fotoğraf/video dosyaları herkese açık static yollarından sunulur; sürpriz bir erişim kontrolü değildir.
Fotoğraf penceresi ve galeriler Escape ile kapanır; klavye odağı modal içinde tutulur.
Fotoğraf yakınlaştırıldıktan sonra kaydırılarak tamamı incelenebilir.

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

DURUM PANELİ
availability_config.json yalnızca ders/mesai programını, tatilleri ve kaynakları tutar.
Saatler Europe/Istanbul ile sunucuda hesaplanır; Google Takvim bağlantısı gerekmez.
Şeyda'nın ders dağılımı: Pzt 1,2,3,4 / Sal 1,2,3,4 / Çar 1,2,3,4,5 /
Per 1,2,3,4,6,7,8 / Cum 1,2,5,6,7,8. Toplam 26 ders.
04.10.2026 tarihli dağılım 05.10.2026 itibarıyla uygulanır; önceki program
weekly_lessons_history içinde 04.10.2026 tarihine kadar korunur.
Ders süreleri okul duyurusuna göre 40 dakikadır. İlk teneffüs 15 dakika,
diğer teneffüsler 10 dakika, öğle arası 12:15–12:50 (35 dakika).
Dağılım belgesinin sütun saatleri farklıdır; ders numaraları korunup okulun duyuru saatleri kullanıldı.
Rıdvan: hafta içi 08:30–12:00 ve 13:00–18:00. Öğle arası, hafta sonu ve resmî tatiller aktif.
Resmî tatiller 2026 ve 2027 için doğrulandı; 28 Ekim ve bayram arifeleri 13:00'ten itibaren tatil.
Şeyda'nın dönemleri 14.09.2026–22.01.2027 ve 08.02.2027–25.06.2027.
Ara tatiller 16–20.11.2026 ve 08–12.03.2027; yarıyıl tatili 25.01–05.02.2027.
Yaz tatilinde derste gösterilmez. Bu program 31.08.2027'ye kadar geçerlidir;
sonrasında yeni program eklenene kadar hafta içi gri durum gösterilir.
Tören, nöbet ve seminer saatleri bilinmediğinden ders saati gibi gösterilmez.
Yeni yılın resmî tatillerini ve yeni dönem programını bu JSON dosyasında güncelleyin.
Kişiye özel izin veya geçici program için date_overrides içine tarih bazlı periods eklenebilir:
"2026-10-05": {"periods": []} izin; {"periods": [{"start":"10:00","end":"11:00"}]} özel meşgul saat.
Resmî tatil kuralları özel programdan önce gelir. İdari izinler otomatik varsayılmaz;
yeni bir okul kapanması/izin kararı açıklanırsa date_overrides ile eklenir.
Panel durumunu en geç 60 saniyede ve ders/mesai sınırlarında yeniler.
Sunucuya ulaşılamazsa veya takvim geçerliliği dolarsa gri durum görünür.
Aktif durumu gerçek çevrimiçi bağlantı değil, program dışında bulunmak anlamına gelir.

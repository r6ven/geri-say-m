# Özel cihaz kayıtlarını Google E-Tablo'ya bağlama

Bu entegrasyon yalnızca cihaz tanıma ve son giriş kaydı içindir. Mesaj/çizim özelliği veya telefon bildirimi eklemez. Kod hazır olsa bile aşağıdaki Google ve Render bağlantısı tamamlanmadan hiçbir cihaz tanıtılmaz.

## Bir kez yapılacak kurulum

1. Kendi hesabınızda oluşturduğunuz özel Google E-Tablo'yu açın. Paylaşım **Kısıtlı** kalmalı. **Uzantılar > Apps Script** menüsüne girin.
2. Bu klasördeki `device_storage.gs` içeriğini Apps Script'in `Code.gs` dosyasına yapıştırın ve kaydedin. Fonksiyon listesinden `setupDeviceStorage` seçip **Çalıştır** deyin. Google'ın bu script için istediği tablo erişimini kendi hesabınızla onaylayın. Bu işlem `Cihazlar` sekmesini ve dört boş cihaz satırını oluşturur; mevcut diğer sekmelere dokunmaz.
3. Gösterilen gizli anahtarı yalnızca **Render > geri-sayim > Environment** bölümüne, `DEVICE_STORAGE_SECRET` adıyla kaydedin. Anahtarı GitHub'a, tablo hücrelerine veya sohbete yazmayın. Diyaloğu kapattıysanız aynı fonksiyonu yeniden çalıştırabilirsiniz; anahtar değiştirilmez, kayıtlar sıfırlanmaz.
4. Apps Script'te **Dağıt > Yeni dağıtım > Web uygulaması** seçin. **Şu kullanıcı olarak yürüt: Ben**, **Erişimi olanlar: Herkes**. Sunucu Google oturumu açmadan çağrı yaptığı için uç noktaya erişim bu şekilde ayarlanır. Tabloyu herkese açmayın: script, imzalı sunucu isteği dışında hiçbir veri vermez veya kayıt değiştirmez. Dağıtımı Google hesabınızla yetkilendirin.
5. Sonu `/exec` olan web uygulaması adresini Render'da `DEVICE_STORAGE_URL` adıyla kaydedin. URL gizli anahtar değildir; yardım için bu adresi paylaşabilirsiniz. Render değişkenlerini kaydedip deploy edin. Mevcut Drive değişkenlerini silmeyin.

Google, Apps Script yetki ekranında sizi engellerse güvenlik uyarılarını aşmayın; ekranın metnini inceleyip uygun dağıtım/hesap yöntemini seçin. Google oturumu veya dağıtım yetkisi bu sohbet üzerinden kendiliğinden verilmiş olmaz.

## Dört bağlantıyı oluşturma

Sunucu bağlantısı tamamlandıktan sonra, yetkili bir terminal ortamında aynı `DEVICE_STORAGE_URL` ve `DEVICE_STORAGE_SECRET` ortam değişkenleriyle çalıştırın:

```bash
python scripts/create_device_invites.py --site-url https://geri-sayim.onrender.com
```

Komut dört cihazın her biri için ayrı, yaklaşık 71 saat geçerli bağlantı üretir. Gerekirse `--device seyda-phone` gibi tek cihaz seçilebilir. Bu bağlantıları yalnızca ilgili kişiye ve cihaza gönderin; genel liste veya repo içine koymayın. Anahtarları komut satırı argümanı olarak vermeyin.

Bağlantının içindeki davet kodu `#invite=...` bölümündedir: sunucu URL'sine ve erişim loglarına gitmez. Kişi kendi normal tarayıcısında bağlantıyı açıp **Bu cihazı tanıt** düğmesine bir kez basar. Ekranda başarı doğrulandıktan sonra ana sitedeki menüde adının yanında **Bu cihaz tanınıyor** görünür. Link önizlemeleri yalnızca sayfayı açarak daveti tüketmez.

Tanıtılmış bir slot için yeni davet üretilmez. Başarısız/yarım işlemde mevcut bağlantıyı tekrar tekrar kullanmak yerine durum kontrol edilir; gerekirse cihaz iptal edilerek yeni bağlantı oluşturulur. Cihaz tanıma Google bağlantısı yokken başarılı sayılmaz.

## Kayıtlar ve iptal

`Cihazlar` sekmesindeki `device_id`, `person` ve `label` sütunları sabittir; satırları silmeyin, sıralamayın ve başlıkları değiştirmeyin. `invite_hash` ve `device_hash` gizli anahtarların SHA-256 özetleridir. Açık davet veya tarayıcı anahtarı tabloya yazılmaz.

`created_at` ve `last_seen` UTC ISO tarihidir (`Z` ile biter); Türkiye saati UTC+3'tür. Son girişteki yazma sıklığı en fazla beş dakikada birdir; saniye saniye hareket veya sürekli etkinlik takibi yapılmaz. Site yalnızca açılışta tanıma sorgusu yapar; sürekli açık sekme tekrar ziyaret sayılmaz. Yeniden yükleme de sorgu yapar.

Erişimi iptal etmek için ilgili satırdaki `revoked` hücresini boolean **TRUE** yapın. Sonraki tanıma sorgusunda cihaz reddedilir. Ardından bu slot için yeni davet oluşturulabilir. Yeni tanıtma eski cihaz anahtarını geçersiz kılar.

Bir yıllık tarayıcı çerezi `Secure`, `HttpOnly`, `SameSite=Strict` ve `__Host-` korumalıdır. Çerez başka bir tarayıcıya taşınmaz; gizli sekme veya tarayıcı verilerini silmek yeniden tanıtma gerektirir. Google kayıtları devam eder, ama silinmiş cihaz çerezi geçmiş loglardan geri çıkarılamaz.

Apps Script tek kullanımı kalıcı hücre güncellemesi ve `LockService` kilidiyle korur. İstekler HMAC-SHA256, kısa zaman aralığı ve nonce kontrolüyle doğrulanır. Kayıt servisi çalışmazsa site ziyaretçiyi tanınmış kabul etmez. Gelecekteki özel çizim/mesaj uç noktaları ayrıca bu sunucu doğrulamasını kullanmalıdır; menüdeki yazıyı gizlemek tek başına erişim koruması değildir.

Apps Script kodu değişince dağıtımı **Dağıtımları yönet > Düzenle > Yeni sürüm** ile güncelleyin; yalnızca editörde kaydetmek mevcut `/exec` kodunu güncellemez.

## Kontroller

```bash
python -m unittest discover -s tests -v
node tests/test_device_storage.cjs
```

Gerçek Google bağlantısı için dört davetten önce: yetkisiz uç nokta çağrılarının reddedildiği, bir tanıtmanın tabloda hash ve zamanı oluşturduğu, ikinci tarayıcının aynı daveti kullanamadığı ve `revoked=TRUE` sonrası tanımanın reddedildiği kontrol edilmelidir.

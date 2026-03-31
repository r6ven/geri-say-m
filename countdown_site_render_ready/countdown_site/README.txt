KURULUM

1) static/photos klasörüne kendi fotoğraflarını aşağıdaki isimlerle koy:
   photo1.jpg
   photo2.jpg
   photo3.jpg
   ...
   photo12.jpg

Şu an sayfa 12 fotoğraf bekliyor. Elindeki fotoğrafları sohbetten otomatik dosyaya gömemediğim için bunları senin eklemen gerekiyor.

2) Lokal çalıştırma:
   pip install -r requirements.txt
   python app.py

3) Render deploy:
   - Bu klasörü GitHub reposuna yükle.
   - Render'da New + > Web Service seç.
   - Repo'yu bağla.
   - Ortam Python olsun.
   - render.yaml dosyasını kullanabilir ya da manuel şu komutları girebilirsin:
       Build Command: pip install -r requirements.txt
       Start Command: gunicorn app:app

4) Tarih değiştirmek istersen app.py içindeki COUNTDOWNS listesinden güncellersin.

NOT:
- Sayfa mobilde de çalışır.
- Sol ve sağ tarafta karışık, hafif eğik ve animasyonlu foto kartları vardır.
- 21.06.2026 ve 31.10.2026 için iki ayrı geri sayım hazırdır.

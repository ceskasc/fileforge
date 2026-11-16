# FileForge

**Görsellerin. Tam istediğin gibi.**

Sadık Can Çeşka'nın [portföyüyle](https://ceskacan.com/) aynı krem, mürekkep ve mavi paleti; yerel DM Sans ve Space Grotesk fontlarıyla tasarlanmış, tarayıcıda çalışan bir görsel stüdyosu.

## Araçlar

- **Dönüştür:** Durağan JPEG, PNG ve WebP arasında geçiş. Şeffaflık korunur; JPEG için arka plan rengi seçilir.
- **Sıkıştır:** WebP/JPEG dışa aktarma kalitesiyle daha hafif dosyalar. Gerçek boyut ve tasarruf gösterilir; sonuç büyürse de doğru belirtilir. PNG kayıpsız dışa aktarılır; PNG için kalite kaydırıcısı gösterilmez.
- **Boyutlandır:** Tek ölçü, oranı koruyarak kutuya sığdırma veya serbest ölçü. Varsayılan olarak küçük görseller büyütülmez.
- **Kalite artır:** Kenar koruyan gürültü azaltma, kontrollü luma netleştirme, sınırlı otomatik ton dengeleme ve isteğe bağlı 2× Lanczos3 büyütme. Yapay zekâ modeli kullanılmaz; var olmayan ayrıntılar yeniden üretilmez.
- Önce / sonra karşılaştırması, 10 görsele kadar toplu işlem, durdurma, tek tek ve ZIP indirme.
- Türkçe / İngilizce; açık / koyu tema; klavye ile kullanılabilir araç sekmeleri.

## Gizlilik ve sınırlar

Dosyalar sunucuya gönderilmez. İşlem bir Web Worker içinde, uygun olmayan tarayıcılarda sıra vererek ana iş parçacığında gerçekleşir. Harici çalışma zamanı bağımlılığı, API anahtarı, takipçi veya üyelik yoktur.

Bir seferde **10 dosya / toplam 80 MiB**, her biri **25 MiB**. Girişler **24 MP**, çıktılar **16 MP / uzun kenar 8192 px** ile sınırlıdır. Sonuç belleği 96 MiB ile sınırlandırılır. 2× sınırı aşarsa otomatik küçültme yerine açık bir hata gösterilir. Dosyalar sırayla işlenir; Lanczos için 32 satırlık bellek önbelleği kullanılır.

Hareketli GIF, APNG ve WebP kabul edilmez. EXIF/konum bilgileri çıktıya kopyalanmaz. Renkler tarayıcının Canvas renk yönetimiyle sRGB olarak dışa aktarılır. Profesyonel renk profili / HDR iş akışı amaçlanmaz. JPEG yönü tarayıcının EXIF yönlendirmesiyle okunur.

## Yerelde çalıştırma

Node.js 22+ ve Python 3 gerekir. Çalışma zamanı için paket kurulumu yoktur.

```sh
python3 -m http.server 8080
npm test
npm run check
```

Uygulama: http://localhost:8080/

Yayın paketi oluşturmak için librsvg'nin `rsvg-convert` komutu gerekir; GitHub iş akışı bunu yükler.

```sh
sudo apt-get install librsvg2-bin fonts-dejavu-core
npm run build
```

`public/` yalnızca yayımlanacak statik dosyaları içerir. Sosyal paylaşım ve Apple simgesi SVG kaynaklarından PNG olarak oluşturulur.

## GitHub Pages

Yayın adresi: https://ceskasc.github.io/fileforge/

İlk kurulumda repoda **Settings → Pages → Build and deployment → Source → GitHub Actions** seçilmelidir. Ardından **Actions → FileForge → Run workflow**. Sonraki main değişiklikleri otomatik test edilir ve yayımlanır. İlk Pages etkinleştirmesi için GitHub yönetici yetkisi gerekir; normal GITHUB_TOKEN bunu sağlayamayabilir.

İş akışı önce testleri ve kaynak kontrollerini çalıştırır; sonra statik paketi oluşturur. Yalnızca başarılı kontrolden sonra yayın adımı başlar. Kontrol ve yayın işleri ayrıdır; Pages kurulumu eksik olsa da doğrulama sonucu ve yayın paketi görülebilir.

## Doğrulama kapsamı

Birim testleri; dosya imzalarını, hatalı ve hareketli girdileri, geometriyi, renk/şeffaflık korumasını, gürültü azaltmayı, netleştirmeyi, büyütmeyi, durdurmayı ve standart Python ZIP okuyucusuyla arşiv uyumluluğunu denetler.

Pipeline testleri kodlayıcı/çözücü sınırlarını test ikizleriyle denetler. Bunlar gerçek tarayıcı kodekleri veya görsel ekran kontrolleri yerine geçmez. HTML yapısı, erişilebilir etiketler, UI bağlantıları, çeviriler ve yerel varlıklar ayrıca kontrol edilir. İlk hazırlama oturumunda tarayıcı önizlemesi kullanılamadığı için gerçek cihaz / tarayıcı görsel kontrolü gerçekleştirilmemiştir.

## Kaynak yapısı

`src/engine.mjs`: saf piksel/geometri/ZIP işlemleri. `src/process.mjs`: Canvas işleme hattı. `src/image-worker.mjs`: arka plan yürütme. `src/app.mjs`: arayüz, kuyruk, iptal ve indirme. `src/i18n.mjs`: TR/EN metinler.

MIT. Fontların SIL OFL lisansları `assets/` altında korunur.

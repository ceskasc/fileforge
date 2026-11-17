# FileForge

**Görsellerin. Tam istediğin gibi.**

[FileForge](https://ceskasc.github.io/fileforge/) · [Sadık Can Çeşka](https://ceskacan.com/)

CV portföyüyle aynı krem, mürekkep ve mavi paleti; DM Sans ve Space Grotesk fontlarıyla tasarlanan görsel stüdyosu. Mobil, TR/EN ve açık/koyu tema.

## Araçlar

Durağan JPG, PNG ve WebP dönüştürme; WebP/JPEG sıkıştırma; oran koruyan veya serbest boyutlandırma. Toplu işlem, durdurma, önce/sonra karşılaştırması ve ZIP indirme.

### AI fotoğraf iyileştirme

- **AI · Fotoğraf:** Eğitilmiş RDN 2× modeli; doğal ayrıntı ve netlik için.
- **AI · Ultra detay:** Daha derin RRDN / ESRGAN 2× modeli; yaklaşık 29 MB ağırlık ve daha uzun işlem süresi.
- **Hızlı filtre:** Model indirmeden kenar koruyan gürültü azaltma ve kontrollü netleştirme.

AI, fotoğrafı gerçek boyutunda paylı parçalara ayırıp işler. 2× seçeneği gerçek model çıktısını kullanır. 1×, yüksek çözünürlüklü neural çıktıyı Lanczos ile orijinal boyuta indirir. Kaynak sessizce küçültülmez. Kaynak görselden yalnızca küçük Canvas kesitleri okunur; tam boyutlu RGBA kopyaları oluşturulmaz. Global ton ayarı en fazla 256 px önizlemeden hesaplanır ve tüm parçalarda aynı uygulanır. Telefonlarda başlangıç parçaları daha küçüktür; gerçek bellek baskısında boyut kademeli azaltılır. GPU kullanılamaz hale gelirse aynı eğitilmiş model CPU üzerinde devam eder. Kenar payı, yansımalı sınırlar ve sabit parça ölçüleri, ek yerlerini ve bellek kullanımını kontrol altında tutar. Yapay zekâ tahmini ayrıntılar oluşturabilir; her bulanıklığın tamamen geri getirilmesi garanti edilmez.

AI yöntemi varsayılandır; iyileştirme çıktısı varsayılan **PNG** ile kayıpsız kaydedilir. Ayrıntı gücü ve hafif ön gürültü azaltma ayrı ayarlanır. **%100** önizleme gerçek çıktı piksel boyutunu gösterir; sürükleyerek veya klavye oklarıyla aynı bölgeyi iki katmanda inceleyebilirsin.

TensorFlow.js ve yalnızca seçilen model ilk kullanımda aynı siteden yüklenir. WebGL hızlandırma varsa kullanılır; CPU aynı modeli çalıştırır ve daha yavaştır. Boş WebGL texture önbelleği mobilde 16 MiB, masaüstünde 64 MiB eşiğiyle sınırlandırılır. Model 30 saniye kullanılmadığında serbest bırakılır. Süre tahmini gerçek tamamlanan parçalardan hesaplanır. İptal parça aralarında uygulanır; tamamlanan indirmeler korunur. AI yükleme hatasında sessizce klasik filtreye geçilmez.

## Gizlilik ve sınırlar

Fotoğraflar veya sonuçlar hiçbir sunucuya yüklenmez. Harici çalışma zamanı CDN'i, üyelik, API anahtarı veya takipçi kullanılmaz. Tema ve dil yalnızca cihazda saklanır. EXIF ve konum bilgileri çıktıya kopyalanmaz.

Bir seferde **10 dosya / toplam 80 MiB**, dosya başına **25 MiB**; girişler **24 MP**, çıktılar **16 MP / uzun kenar 8192 px**. Sonuç belleği 96 MiB. 2× sınırı aşarsa 1× seçilebilir veya önce boyutlandırılabilir. Hareketli GIF, APNG ve WebP desteklenmez. Profesyonel ICC / HDR iş akışı amaçlanmaz.

Büyük fotoğrafların AI ile işlenmesi özellikle Ultra ve CPU modunda birkaç dakika veya daha uzun sürebilir. Fotoğraf / Ultra modelleri birbirinin hız bahanesiyle değiştirilmez.

## Geliştirme ve doğrulama

Node.js 22+, Python 3 ve SVG paylaşım görselleri için librsvg gerekir. npm bağımlılık kurulumu gerekmez; AI varlıkları paket bütünlüğü doğrulanarak indirilir.

```sh
npm run prepare:ai
npm run test:browser-init
npm test
npm run test:ai
npm run check
sudo apt-get install librsvg2-bin fonts-dejavu-core
npm run build
python3 -m http.server --directory public 8080
```

`prepare:ai`, TensorFlow.js **4.22.0** npm tarballının SHA-512 bütünlüğünü ve her model dosyasının sabit Git blob SHA değerini doğrular. Kaynak revizyonu `6d074fb5835a6c659a19c83123beab8c3f28beac` olarak sabittir. Yayımlanan `ai-assets-manifest.json` SHA-256 özetlerini içerir. Lisanslar ve kaynaklar: [THIRD_PARTY.md](THIRD_PARTY.md).

Birim testleri dosya doğrulama, geometri, şeffaflık, filtreler, ZIP uyumluluğu, neural parça birleştirme, iptal ve ilerlemeyi kapsar. Bellek regresyon testleri 12 MP görsellerde tam kare piksel okumasını reddeden bir Canvas sınırı, parça boyutunun düşürülerek tekrar denenmesi, CPU kurtarma ve farklı teknik hataların bellek hatası olarak gösterilmemesini doğrular. `test:ai`, **her iki gerçek eğitilmiş modeli** TensorFlow CPU üzerinde üretimdeki tahmin ve birleştirme koduyla çalıştırır; çıktı şekli, normalizasyon, sonucun basit büyütmeden farklı olması ve tensor belleğinin serbest bırakılması doğrulanır. Ölçümler `ai-validation.json` içinde tutulur. Bu kontroller gerçek mobil WebGL veya görsel tarayıcı kontrolü yerine geçmez.

## Yayın

GitHub Pages kaynağı **GitHub Actions** olmalıdır. Main üzerindeki değişiklikler varlık doğrulaması, test ve paketleme başarılı olunca otomatik yayımlanır. `ai-photo-quality` dalı aynı kontrolleri çalıştırır ve üretime yayımlamaz. Yayından sonra HTML, AI runtime ve her iki model manifestinin HTTP erişimi ayrıca kontrol edilir.

## Kaynak yapısı

`src/engine.mjs`: piksel/geometri/ZIP. `src/process.mjs`: kodlama hattı. `src/ai-tiles.mjs`: paylı neural işleme ve alfa koruması. `src/ai-runtime.mjs`: TensorFlow, model ve backend yönetimi. `src/ai.mjs`: iyileştirme akışı. `src/app.mjs`: arayüz ve önizleme.

MIT. Fontların SIL OFL lisansları ve AI bileşenlerinin kendi lisansları korunur.

## Tarayıcıda AI başlangıcı

TensorFlow tarayıcı paketi, kod dizgisi çalıştırması yasak olan bir ortamda ayrıca sınanır. Bu test önce eski paketteki gerçek başlangıç hatasını yeniden üretir; ardından yayımlanan uyumlu paketin başlamasını ve gerçek TensorFlow işlemlerini doğrular. Kısmen yüklenmiş bir tf nesnesi hazır sayılmaz. Sitenin CSP ayarı script-src self olarak korunur; unsafe-eval eklenmez. Paket bütünlüğü, uyumluluk dönüşümü ve kaynak/yayın SHA-256 özetleri THIRD_PARTY.md ve ai-assets-manifest.json içinde açıklanır.

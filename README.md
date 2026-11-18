# FileForge

**Görsellerin. Tam istediğin gibi.**

[FileForge](https://ceskasc.github.io/fileforge/) · [Sadık Can Çeşka](https://ceskacan.com/)

CV portföyüyle aynı krem, mürekkep ve mavi paleti; DM Sans ve Space Grotesk fontlarıyla tasarlanan görsel stüdyosu. Mobil, TR/EN ve açık/koyu tema.

## Araçlar

Durağan JPG, PNG ve WebP dönüştürme; WebP/JPEG sıkıştırma; oran koruyan veya serbest boyutlandırma. Toplu işlem, durdurma, önce/sonra karşılaştırması ve ZIP indirme.

### AI fotoğraf iyileştirme

- **AI · Hızlı büyüt:** Tarayıcıya uygun hafif RDN 2× modeli; 222.075 parametre ve yaklaşık 0,9 MB ağırlık.
- **AI · Cihazda onar** yaklaşık 4,9 MB ağırlığında **RealESRGAN general x4v3** ile bulanıklık ve sıkıştırma izlerini azaltır.
- **AI · Sunucuda onar** sunucu bağlandığında **Real-ESRGAN x2plus** modelini ONNX Runtime üzerinde çalıştırır. Büyük görseller model için küçültülür. Modelin ürettiği ayrıntılar, 1× veya 2× ölçüdeki görsele uygulanır.
- **AI · Ultra detay:** Daha derin RRDN / ESRGAN 2× modeli; yaklaşık 29 MB ağırlık ve daha uzun işlem süresi.
- **Hızlı filtre:** Model indirmeden kenar koruyan gürültü azaltma ve kontrollü netleştirme.

AI, fotoğrafı gerçek boyutunda paylı parçalara ayırıp işler. Onarım modeli kendi doğal 4× çözünürlüğünde tahmin yapar; seçilen 1× veya 2× sonuca Lanczos ile indirilir. Hızlı büyüt ve Ultra modellerinin doğal ölçeği 2×’tir. Kaynak sessizce küçültülmez. Kaynak görselden yalnızca küçük Canvas kesitleri okunur; tam boyutlu RGBA kopyaları oluşturulmaz. Global ton ayarı en fazla 256 px önizlemeden hesaplanır ve tüm parçalarda aynı uygulanır. Telefonlarda başlangıç parçaları daha küçüktür; gerçek bellek baskısında boyut kademeli azaltılır. GPU kullanılamaz hale gelirse aynı eğitilmiş model önce WebAssembly SIMD, ardından JavaScript CPU üzerinde denenir. Kenar payı, yansımalı sınırlar ve sabit parça ölçüleri, ek yerlerini ve bellek kullanımını kontrol altında tutar. Yapay zekâ tahmini ayrıntılar oluşturabilir; her bulanıklığın tamamen geri getirilmesi garanti edilmez.

AI yöntemi varsayılandır; iyileştirme çıktısı varsayılan **PNG** ile kayıpsız kaydedilir. Ayrıntı gücü ve isteğe bağlı ön gürültü azaltma ayrı ayarlanır. Onarım modelinin kendi gürültü temizleme yeteneği nedeniyle ek ön filtre ve renkleri değiştirebilen otomatik kontrast varsayılan kapalıdır. **%100** önizleme gerçek çıktı piksel boyutunu gösterir; sürükleyerek veya klavye oklarıyla aynı bölgeyi iki katmanda inceleyebilirsin.

TensorFlow.js ve yalnızca seçilen model ilk kullanımda aynı siteden yüklenir. WebGL hızlandırma varsa kullanılır; yoksa vektörleştirilmiş konvolüsyon için aynı siteden TensorFlow WASM/SIMD motoru yüklenir. O da kullanılamıyorsa aynı model JavaScript CPU üzerinde çalışır. WASM dosyaları toplam yaklaşık 1,2 MB, yüklenen SIMD dosyası yaklaşık 425 KB boyutundadır. GitHub Pages izolasyon başlıklarını sağlayamadığından SIMD tek iş parçacığıyla çalışır; SharedArrayBuffer veya Service Worker gerektirmez. Boş WebGL texture önbelleği mobilde 16 MiB, masaüstünde 64 MiB eşiğiyle sınırlandırılır. Model 30 saniye kullanılmadığında serbest bırakılır. Süre tahmini gerçek tamamlanan parçalardan hesaplanır. AI dahil işlemler desteklenen tarayıcılarda ayrı bir Web Worker içinde yürür. Birden fazla dosyada aynı worker ve seçilen model yeniden kullanılır. İptal, worker’ı hemen sonlandırır; tamamlanan indirmeler korunur. Worker 60 saniye boşta kaldığında kapanır. OffscreenCanvas bulunmayan tarayıcılarda ana iş parçacığı kullanılır ve iptal parça aralarında uygulanır. AI yükleme hatasında sessizce klasik filtreye geçilmez.

## Gizlilik ve sınırlar

Yerel araçlar fotoğrafları cihazda işler. Sunucuda onarma başlatıldığında fotoğraf FileForge sunucusuna gönderilir. Sunucu fotoğrafı ve sonucu işlem boyunca bellekte tutar. Tema ve dil cihazda saklanır. EXIF ve konum bilgileri çıktıya kopyalanmaz.

Bir seferde **10 dosya / toplam 80 MiB**, dosya başına **25 MiB**; girişler **24 MP**, çıktılar **16 MP / uzun kenar 8192 px**. Sonuç belleği 96 MiB. 2× sınırı aşarsa 1× seçilebilir veya önce boyutlandırılabilir. Hareketli GIF, APNG ve WebP desteklenmez. Profesyonel ICC / HDR iş akışı amaçlanmaz.

Büyük fotoğrafların AI ile işlenmesi özellikle Ultra ve CPU modunda birkaç dakika veya daha uzun sürebilir. Hızlı / Onarım / Ultra modelleri kullanıcının seçimidir; sessizce değiştirilmez. Hızlı modda da kaynak küçültülmez ve gerçek eğitilmiş model tüm pikselleri işler.

## Geliştirme ve doğrulama

Node.js 22+, Python 3 ve SVG paylaşım görselleri için librsvg gerekir. npm bağımlılık kurulumu gerekmez; AI varlıkları paket bütünlüğü doğrulanarak indirilir.

```sh
npm run prepare:ai
npm run test:browser-init
npm test
npm run test:ai
npm run test:wasm
npm run check
sudo apt-get install librsvg2-bin fonts-dejavu-core
npm run build
python3 -m http.server --directory public 8080
```

`prepare:ai`, TensorFlow.js **4.22.0** npm tarballının ve sabit SHA-512 ile eşlenen WASM motoru paketinin bütünlüğünü ve her model dosyasının sabit Git blob SHA değerini doğrular. Hızlı büyüt ve Ultra kaynak revizyonu `6d074fb5835a6c659a19c83123beab8c3f28beac` olarak sabittir. Onarım ağırlıkları, resmi Real-ESRGAN v0.2.5.0 sürümündeki checkpoint’ten sabit SHA-256 doğrulanarak hazırlanır. Build sırasında yalnızca izin verilen tensor meta verilerini okuyan Python standart kütüphane dönüştürücüsü kullanılır; PyTorch kurulumu veya keyfi pickle global çalıştırması yoktur. Konvolüsyon çekirdekleri OIHW → HWIO düzenine çevrilir; son katman PyTorch CRD / TensorFlow DCR kanal sırasına eşlenir. PReLU ve nearest-neighbor residual korunur. Yayımlanan `ai-assets-manifest.json` SHA-256 özetlerini içerir. Lisanslar ve kaynaklar: [THIRD_PARTY.md](THIRD_PARTY.md).

Birim testleri dosya doğrulama, geometri, şeffaflık, filtreler, ZIP uyumluluğu, neural parça birleştirme, iptal ve ilerlemeyi kapsar. Bellek regresyon testleri 12 MP görsellerde tam kare piksel okumasını reddeden bir Canvas sınırı, parça boyutunun düşürülerek tekrar denenmesi, CPU kurtarma ve farklı teknik hataların bellek hatası olarak gösterilmemesini doğrular. `test:ai`, **üç gerçek eğitilmiş modeli** TensorFlow CPU üzerinde üretimdeki tahmin ve birleştirme koduyla çalıştırır; çıktı şekli, normalizasyon, sonucun basit büyütmeden farklı olması ve tensor belleğinin serbest bırakılması doğrulanır. Ölçümler `ai-validation.json` içinde tutulur. `test:wasm`, üç gerçek modeli dizgisel JavaScript çalıştırması yasak olan bir tarayıcı ortamında gerçek WASM/SIMD üzerinde çalıştırır; her çıktıyı aynı ağırlıkların CPU çıktısıyla karşılaştırır ve hız ölçümlerini `ai-speed-validation.json` içine kaydeder. Küçük parça benchmarkları uçtan uca telefon süresi değildir. Onarım modelinin float32 çıktısı ayrıca özgün kanal düzeninde bağımsız NumPy referansına karşı sınanır; RGB sırası, PReLU ve 4× residual hataları yakalanır. Bu kontroller gerçek mobil WebGL veya görsel tarayıcı kontrolü yerine geçmez.

## Yayın

GitHub Pages kaynağı **GitHub Actions** olmalıdır. Main üzerindeki değişiklikler varlık doğrulaması, test ve paketleme başarılı olunca otomatik yayımlanır. `ai-photo-quality` dalı aynı kontrolleri çalıştırır ve üretime yayımlamaz. Yayından sonra HTML, AI runtime ve üç model manifestinin HTTP erişimi ayrıca kontrol edilir.

Sunucu modu için `cloud/` dizinini bir FastAPI projesi olarak dağıt. `/api/health` servis ve model adını döndürür. Tarayıcıya sunucu adresi vermek için `package.json` içindeki `cloudOrigin` alanına HTTPS origin değerini yaz. Yerel denemede bu ayar `FILEFORGE_CLOUD_ORIGIN=http://127.0.0.1:8000 npm run build` ile değiştirilebilir. Köken ayarı boşken arayüz cihazda çalışan yöntemleri gösterir.

Sunucu, en fazla 4 MB boyutunda JPG, PNG ve WebP yüklemesi alır. Tarayıcı daha büyük dosyaları aynı ölçüde yeniden kodlayarak göndermeyi dener. Sunucu ilk gerçek işlemde resmi model ağırlığını indirir ve SHA-256 doğrulamasından sonra ONNX modelini belleğe yükler.

## Kaynak yapısı

`src/engine.mjs`: piksel/geometri/ZIP. `src/process.mjs`: kodlama hattı. `src/ai-tiles.mjs`: paylı neural işleme ve alfa koruması. `src/ai-runtime.mjs`: TensorFlow, model ve backend yönetimi. `src/ai.mjs`: iyileştirme akışı. `src/app.mjs`: arayüz ve önizleme.

MIT. Fontların SIL OFL lisansları ve AI bileşenlerinin kendi lisansları korunur.

## Tarayıcıda AI başlangıcı

TensorFlow tarayıcı paketi, kod dizgisi çalıştırması yasak olan bir ortamda ayrıca sınanır. Bu test önce eski paketteki gerçek başlangıç hatasını yeniden üretir; ardından yayımlanan uyumlu paketin başlamasını ve gerçek TensorFlow işlemlerini doğrular. Kısmen yüklenmiş bir tf nesnesi hazır sayılmaz. CSP yalnızca aynı siteden script yüklemeye izin verir. WebAssembly derlemesi için wasm-unsafe-eval kullanılır; JavaScript eval/Function ve satır içi scriptler engellenmeye devam eder. Paket bütünlüğü, uyumluluk dönüşümü ve kaynak/yayın SHA-256 özetleri THIRD_PARTY.md ve ai-assets-manifest.json içinde açıklanır.

# Cityport Hotel Misafir Uygulaması — Next.js

Bu klasör, mevcut misafir uygulamasının Next.js App Router kopyasıdır. Vercel projesini bu klasörün kökünden derleyin; ana klasördeki bağımsız uygulama yapılandırması bu kopyadan ayrıdır.

## Vercel'e dağıtım

1. Vercel'de depoyu içe aktarın.
2. Project Settings → Build and Deployment → **Root Directory** değerini `nextjs-app` olarak ayarlayın. Depo kökünde Next.js paketi bulunmadığından bu adım gereklidir.
3. Framework Preset değerinin **Next.js** olduğunu doğrulayın. Install, Build ve Output ayarlarını varsayılan bırakın; proje `package-lock.json` ile `npm run build` kullanır.
4. Aşağıdaki gerekli ortam değişkenlerini Project Settings → Environment Variables bölümünde Production ve Preview için tanımlayın. Yerel geliştirme için `.env.example` dosyasını `.env.local` olarak kopyalayıp değerleri doldurun.
5. Firebase ve Telegram ayarlarını yaptıktan sonra Deploy edin veya Redeploy seçin. Ortam değişkenleri yeni deploy'da etkinleşir.

## Gerekli ortam değişkenleri

| Değişken | Kullanım |
| --- | --- |
| `FIREBASE_WEB_API_KEY` | Anonim Firebase oturumu ve sunucu tarafı token doğrulaması. Web API anahtarıdır; veritabanı sırrı değildir. |
| `FIREBASE_DATABASE_URL` | Otel oda/konaklama ve misafir talepleri için Realtime Database adresi. |
| `FIREBASE_DATABASE_SECRET` | API işleyicilerinin sunucu tarafında veritabanına erişmesi için kullanılan gizli kimlik bilgisi. Yalnızca Vercel'in server-side Environment Variables alanında saklayın. |
| `TELEGRAM_BOT_TOKEN` | Giriş, talep, taksi ve kafe bildirimi. |
| `TELEGRAM_CHAT_ID` | Varsayılan Telegram bildirim hedefi. Ayrı hedefler gerekiyorsa `TELEGRAM_REQUEST_CHAT_IDS` ve `TELEGRAM_SESSION_CHAT_IDS` kullanın. |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram callback webhook isteklerini doğrular. Uzun, tahmin edilemez bir değer kullanın. |
| `TELEGRAM_STATUS_USER_IDS` | Durum butonlarını kullanmasına izin verilen Telegram kullanıcı ID'leri (virgülle ayrılmış). |

Vercel derlemesi ortam değişkenleri olmadan tamamlanabilir; ancak misafir doğrulaması ve bağlı servisler çalışmaz. Firebase Console'da **Anonymous** oturum açmayı etkinleştirin, Vercel/custom domain'i yetkili alan adlarına ekleyin ve Firebase oda kayıtlarının uygulamanın beklediği şemada olduğundan emin olun. `FIREBASE_DATABASE_SECRET` mevcut değilse dağıtım build'i geçse bile sunucu özellikleri çalışmaz; bu kopya şu an Firebase Admin SDK yerine bu sunucu kimlik bilgisini kullanıyor.

## Telegram durum butonları ve bildirimler

Telegram'da inline butonların çalışması için webhook'u Vercel production URL'sine bir kez kaydedin. BotFather botundaki webhook'u şu şablonla ayarlayın; değerleri komut geçmişine veya herkese açık bir yere koymayın:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>/api/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

`TELEGRAM_STATUS_USER_IDS` değerine yalnızca yetkili personelin Telegram sayısal kullanıcı ID'lerini ekleyin. Talep, arıza ve kafe siparişindeki butonlar Firebase durumunu günceller; misafir hesabında bildirim oluşturur. Kredi kartı, yalnızca ödeme tercihi olarak kaydedilir ve misafirin kart bilgisi alınmaz.

Taksi talepleri ayrı sayfadan gönderilir; yolcu sayısı, alınış noktası, isteğe bağlı varış adresi ve ödeme tercihi `guest_requests` kaydına eklenir. Alınış/varış adresi önerileri Trabzon için Photon (Komoot) açık adres API'si ve OpenStreetMap verilerini kullanır. Harita/veri sağlayıcısının kullanım koşullarına ve hız sınırlarına uyun. Personel Telegram mesajındaki “Taksi çağrıldı”, “Hazır” ve “İptal” butonlarıyla durumu günceller; misafire uygulama dilinde bildirim kaydedilir ve mümkünse push gönderilir. Taksi mesajları için de `TELEGRAM_REQUEST_CHAT_IDS` veya genel Telegram hedef değişkenleri kullanılır.

Kafe siparişleri için `TELEGRAM_REQUEST_CHAT_IDS` (veya mevcut yapılandırmalarda `TELEGRAM_CHANNEL_CHAT_ID`, `TELEGRAM_CHANNEL_CHAT_IDS`, `TELEGRAM_CHAT_IDS` ya da `TELEGRAM_CHAT_ID`) bildirim hedefi olarak kullanılır. Sipariş Firebase'e kaydedildikten sonra Telegram bildirimi başarısız olursa Vercel Function Logs'taki Telegram hata ayrıntısını kontrol edin; uygulama misafire siparişin kaydedildiğini ve tekrar göndermemesi gerektiğini bildirir.

## Web push ve checkout cron

Push gönderimi ve push aboneliği için ayrıca:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase servis hesabının tam JSON içeriği; gizli tutulmalıdır.
- `PUSH_API_SECRET`: Yönetim uygulamasının `/api/send-push` çağrısını yetkilendirir.
- `CRON_SECRET`: Vercel Cron ve `/api/taxi-request` içindeki yetkili zamanlanmış GET işlemleri için.

`vercel.json`, her gün saat **08:00 Europe/Istanbul** (05:00 UTC) için `/api/send-push` çağrısı planlar. Bu görev checkout tarihindeki odalara Firebase uygulama bildirimi yazar ve kayıtlı cihazlara dil tercihinde push gönderir. Cron için `FIREBASE_SERVICE_ACCOUNT_JSON` ve `CRON_SECRET` gerekir.

## Yerel çalıştırma

```powershell
npm install
npm run dev
```

Ardından <http://localhost:3000> adresini açın. API/Firebase özelliklerini denemek için `.env.local` dosyasında gerekli değerler bulunmalıdır.

## Proje yapısı

- `app/` — App Router sayfası, metadata, viewport ve API route adapter'ı.
- `public/app.js` ve `public/styles.css` — misafir arayüzü ve tasarım sistemi.
- `api/` ve `lib/` — sunucu API işleyicileri ve misafir güvenlik yardımcıları.
- `public/sw.js` — Next.js uygulama kabuğu için service worker.

Orijinal uygulamanın proje kökündeki dosyaları değiştirilmemiştir.

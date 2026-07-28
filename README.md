# Nöbet Çizelgesi Sistemi

Hastane nöbet çizelgesi hazırlama uygulaması. Kişiler, lokasyonlar, vardiya
şablonları ve kapsama kuralları tanımlanır; sistem dönem için çizelgeyi üretir,
Excel / Word / PDF olarak dışa aktarır.

## Veri nerede

**Sunucu yok.** Tüm veri tarayıcının IndexedDB'sinde (`nobet-v1` veritabanı)
tutulur. Giriş ekranı, şifre, kullanıcı hesabı yoktur — veriye erişim sınırı
tarayıcı profilinin kendisidir.

İsteğe bağlı senkron, kullanıcının **kendi** Google Drive'ına yapılır: veritabanı
tek bir JSON dosyası olarak `appDataFolder/nobet-data.json` altına yazılır. Bu
alan Drive arayüzünde görünmez ve yalnızca bu uygulama erişebilir. İstenen tek
yetki `drive.appdata`.

Cihazlar arası birleştirme kayıt bazında, `updatedAt` alanına göre
son-yazan-kazanır mantığıyla yapılır. Silinen kayıtlar mezar taşı (tombstone)
olarak saklanır, aksi halde bir sonraki senkronda diğer cihazdan geri gelirlerdi.

> **Uyarı:** Tarayıcı verisi temizlenirse ve Drive senkronu açık değilse veri
> geri getirilemez. Senkronu açmanız önerilir.

## Kurulum

```bash
pnpm install
pnpm dev
```

`http://localhost:3100` adresinde açılır. Veritabanı kurulumu, migration, `.env`
dosyası veya ortam değişkeni gerekmez.

## Derleme ve dağıtım

```bash
pnpm build
```

Çıktı statik dosyalardır: `apps/web/out`. Herhangi bir statik sunucu ile servis
edilebilir; depodaki `Dockerfile` bunları nginx ile yayınlar
(`apps/web/nginx.conf`).

```bash
docker compose up -d --build
```

## Doğrulama

```bash
pnpm --filter @nobet/web test          # vitest
pnpm --filter @nobet/web lint
cd apps/web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Tip kontrolünü doğrudan yerel `tsc` ikilisiyle çalıştırın; bu makinede `npx tsc`
bir proxy'ye yönleniyor ve hata varken de başarı raporlayabiliyor.

## Yapı

```
apps/web                Next.js uygulaması (statik export)
  src/lib/db            IndexedDB veri modeli, Dexie şeması, repository katmanı
  src/lib/sync          Google Drive senkronu (snapshot + birleştirme)
  src/lib/export        Excel / Word / PDF üretimi (tarayıcıda)
packages/scheduler      Çizelge üretim algoritması (saf TypeScript)
packages/shared         Ortak tipler, enum'lar, Zod şemaları
```

# Görev: sayfaları sunucudan kopar — `fetch('/api/...')` ve Prisma yerine IndexedDB

## Bağlam

Proje: `nobet-cizelgesi-sistemi` — pnpm monorepo, Next.js 15 App Router +
TypeScript, uygulama `apps/web` altında.

Uygulama **Next.js + Prisma + PostgreSQL + şifreli giriş** mimarisinden
**local-first tarayıcı uygulamasına** çevriliyor: tüm veri tarayıcıda IndexedDB
(Dexie), Google Drive ile senkron, sunucu yok, giriş yok, statik dosya olarak
deploy.

### Zaten tamamlanan (yeniden yazma, sadece kullan)

| Dosya | Ne |
|---|---|
| `apps/web/src/lib/db/types.ts` | Kayıt tipleri. Hepsi `SyncMeta { id, updatedAt, deleted? }` taşır. Tarihler **ISO string**, `Date` değil. |
| `apps/web/src/lib/db/db.ts` | Dexie şeması, tablo adları, indeksler |
| `apps/web/src/lib/db/repo.ts` | **37 API route'un yerini alan repository katmanı.** İhtiyacın olan her veri burada bir fonksiyon. İşe bunu okuyarak başla. |
| `apps/web/src/lib/sync/*` | Google Drive senkronu (`driveSync`, `useSync`) |

Silinmiş olanlar: `app/api/**` (37 route), `lib/auth/**`, `middleware.ts`,
`lib/prisma.ts`, `prisma/**`, `app/login/`, `start.sh`. Geri getirme.

`apps/web/next.config.ts` artık `output: "export"` — statik export.

### Paralel çalışan başka bir ajan var

Şu dosyalar **başka bir ajanın**, dokunma:

- `apps/web/src/lib/export/**`
- `apps/web/src/app/export/page.tsx`

Excel/Word/PDF export'unu tarayıcıya taşıyor. `lib/export/resolve-options.ts`
şu an Prisma'ya bağlı görünüyor — onu o ajan düzeltecek, sen atla.

## Mevcut durum

`npx tsc --noEmit` temiz görünüyor ama **build patlıyor**:

```
./src/app/page.tsx              Module not found: Can't resolve '@/lib/prisma'
./src/lib/setup-readiness.ts    Module not found: Can't resolve '@/lib/prisma'
```

Sayfalar iki farklı şekilde sunucuya bağlı:

1. `app/page.tsx` bir **server component**, doğrudan Prisma çağırıyor
2. Kalan sayfalar **client component**, silinmiş route'lara `fetch('/api/...')`
   atıyor — tip hatası vermiyor (fetch string tabanlı) ama çalışma anında ölü

## Senin dosyaların

```
apps/web/src/app/page.tsx                  SERVER → client'a çevrilecek (6 prisma sorgusu)
apps/web/src/app/people/page.tsx           4 fetch
apps/web/src/app/people/[id]/page.tsx      8 fetch  + dinamik route sorunu (aşağıda)
apps/web/src/app/locations/page.tsx        2 fetch
apps/web/src/app/shifts/page.tsx           2 fetch
apps/web/src/app/coverage-rules/page.tsx   4 fetch
apps/web/src/app/periods/page.tsx          6 fetch
apps/web/src/app/schedule/page.tsx         6 fetch
apps/web/src/app/calculator/page.tsx       (fetch yok, kontrol et)
apps/web/src/components/dashboard/DashboardContent.tsx
apps/web/src/lib/setup-readiness.ts        Prisma'ya bağlı
apps/web/src/lib/person-location-defaults.ts  Prisma'ya bağlı
README.md, apps/web/README.md              yeniden yazılacak (aşağıda)
```

Bunların dışına çıkma. Özellikle `lib/db/**`, `lib/sync/**`, `lib/export/**`,
`app/export/**`, `components/ui/**`, `i18n/**` sana ait değil.

## Yapılacaklar

### 1. Prisma'ya bağlı iki lib dosyası

`lib/setup-readiness.ts` ve `lib/person-location-defaults.ts`. Önce
`lib/db/repo.ts` içinde karşılıklarının **zaten yazılmış olup olmadığına bak** —
`getSetupReadiness` benzeri bir fonksiyon var. Varsa bu dosyaları sil ve
çağıranları repo'ya yönlendir; yoksa Prisma sorgularını repo çağrılarına çevir.
İkisini birden yazma, tek kaynak kalsın.

### 2. `app/page.tsx` — server component'ten client'a

Dashboard şu an sunucuda Prisma ile veri çekip `DashboardContent`'e veriyor.
Statik export'ta sunucu yok. `"use client"` yap, veriyi repo'dan çek.

Veriyi Dexie'nin `liveQuery`'si ile bağla (`dexie-react-hooks` kuruluysa
`useLiveQuery`, değilse `liveQuery` + `useEffect` aboneliği). Sebep: Drive'dan
gelen bir pull IndexedDB'yi arkadan değiştiriyor — tek seferlik `useEffect` ile
çekilen veri o an bayatlıyor ve kullanıcı senkron sonrası eski tabloya bakıyor.

### 3. Yedi client sayfası

Her `fetch('/api/...')` çağrısını karşılık gelen repo fonksiyonuna çevir.
Kurallar:

- **UI'ı değiştirme.** Aynı düzen, aynı Türkçe metinler, aynı bileşenler. Sadece
  veri kaynağı değişiyor.
- **Hata yönetimi**: repo `RepoError` fırlatıyor, içinde `code`
  (`NOT_FOUND` / `DUPLICATE` / `IN_USE` / `VALIDATION_ERROR` …). Sayfalar
  şu an `{ error: { code, message } }` JSON'ına bakıyordu — aynı kodları
  `try/catch` ile yakala, kullanıcıya gösterilen mesajlar birebir aynı kalsın.
- **Yazma sonrası senkron**: her başarılı mutasyondan sonra
  `driveSync.markDirty()` çağır (`@/lib/sync`). Eski kod bunu `window.fetch`'i
  monkey-patch ederek yapıyordu; o patch silindi. Çağrıyı unutan bir mutasyon
  Drive'a hiç gitmez ve kullanıcı veriyi kaybettiğini diğer cihazda anlar.
  Tek tek her sayfaya serpiştirmek yerine repo'yu saran ince bir yardımcı
  düşün — ama `lib/db/repo.ts`'i **değiştirme**, sarmalayıcıyı kendi dosyanda
  tut.
- **Yükleme/boş durumları**: veri artık anında (yerel) geliyor; spinner'ları
  koru ama ilk render'da boş dizi ile "kayıt yok" yazıp hemen dolan bir ekran
  bırakma.

### 4. `people/[id]` — dinamik route statik export'ta çalışmaz

`output: "export"` her dinamik segment için `generateStaticParams()` ister.
Kişi listesi tarayıcıda yaşadığı için build anında bilinemez — bu route bu
haliyle build'i kıracak.

İki seçenek var, **birincisini tercih et**:

1. Route'u kaldır, detayları sorgu parametresine taşı: `/people?id=<id>`.
   `people/page.tsx` içinde `useSearchParams()` ile id varsa detay görünümünü
   render et. Tek statik sayfa, tüm yönlendirme istemcide.
2. Detayı modal'a çevir (proje zaten `components/ui/Modal.tsx` kullanıyor).

Hangisini seçersen seç, `people/[id]/` klasörü silinmeli ve ona giden tüm
linkler (`Sidebar`, liste satırları, `router.push`) güncellenmeli. `grep -rn`
ile ara: doğrudan `href`, şablon literalleri, `router.push`, `Link` bileşenleri
ayrı ayrı aranmalı.

### 5. README

`README.md` ve `apps/web/README.md` silinmiş durumda. Yeniden yaz — kısa tut:

- Ne olduğu: tarayıcıda çalışan nöbet çizelgesi, veri kullanıcının kendi
  cihazında, senkron kullanıcının kendi Google Drive'ında
- Kurulum: `pnpm install`, `pnpm dev` — veritabanı yok, şifre yok, env dosyası
  gerekmiyor
- Build/deploy: `pnpm build` → `apps/web/out`, nginx ile servis edilir
  (`apps/web/nginx.conf`, `Dockerfile`)
- Veri nerede: IndexedDB (`nobet-v1`), Drive'da `appDataFolder/nobet-data.json`.
  Tarayıcı verisi silinirse ve Drive senkronu kapalıysa veri gider — bunu
  açıkça yaz.

Eski README'lerin içeriğine `git show HEAD:README.md` ile bakabilirsin; Postgres
ve giriş şifresiyle ilgili her şey artık geçersiz.

## Katı kurallar

- `any` yok. Dışa açık fonksiyonlarda dönüş tipi açık. `console.log` yok.
- Hiçbir şey `@prisma/client`, `next/server` veya `app/api/` altından import
  edemez — hepsi silindi.
- Kayıtlardaki tarihler **ISO string**. `Date` bekleyen eski kodu dönüştür.
- Silmeden önce ara. Bu kod tabanında barrel dosyaları ve yeniden export'lar var;
  kaldırdığın her sembol için ayrı ayrı ara: doğrudan import, tip-only import,
  string yol, test dosyası, barrel girdisi. Tek grep yetmez.
- Yarım bırakılmış bir geçiş, hiç başlanmamışından kötüdür: bir sayfayı repo'ya
  bağlıyorsan o sayfadaki **tüm** çağrıları bağla.

## Doğrulama (bitti demeden önce zorunlu)

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
pnpm --filter @nobet/web lint
pnpm --filter @nobet/web build
```

Üçü de temiz geçmeli. Özellikle `build` — statik export'un gerçekten ürettiğini
`apps/web/out/` içinde sayfaların oluştuğunu görerek doğrula.

Paralel ajan `lib/export/**` üzerinde çalıştığı için oradan gelen geçici
hatalar seni ilgilendirmiyor; onun dışındaki her hata senin.

## Kapsam dışı

- `lib/export/**` ve `app/export/page.tsx` (başka ajan)
- `lib/db/**` ve `lib/sync/**` (yazıldı, sabit)
- Bağımlılık ekleme — `dexie` kurulu. `dexie-react-hooks` gerekiyorsa **önce
  sor**, kendin kurma.
- Veri göçü yok: kullanıcı boş veritabanıyla başlıyor, kişi listesi boş.

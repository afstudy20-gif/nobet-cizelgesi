# Teknik Mimari

## Önerilen Mimari

Tek uygulama yüzeyi olan, monorepo tabanlı bir yapı önerilir:

- `apps/web`: Next.js tabanlı yönetim paneli ve route handler API katmanı
- `packages/shared`: Ortak tipler, Zod şemaları ve yardımcı sabitler
- `packages/scheduler`: Nöbet üretim motoru
- `packages/exporter`: Excel, PDF, Word üretim mantığı

## Neden Bu Yapı

- Yönetim paneli ve API tek deploy ile yönetilebilir.
- Çizelge üretim mantığı bağımsız test edilebilir.
- Export katmanı UI'dan ayrıldığı için bakım kolaylaşır.
- İleride bağımsız API veya worker sürecine geçmek kolay olur.

## Uygulama Katmanları

### Sunum Katmanı

- Dashboard
- Kişi yönetimi sayfaları
- Lokasyon yönetimi sayfaları
- Vardiya şablon ekranları
- Uygunluk ve kısıt takvimi
- Çizelge oluşturma sihirbazı
- Sonuç görüntüleme ve düzenleme ekranı
- Export ekranı

### Uygulama Katmanı

- Form doğrulama
- Çizelge üretim isteği alma
- Kilitli atamaları koruma
- Çakışma ve eksik atama raporu üretme
- Export isteklerini yönlendirme

### Domain Katmanı

- Personel kuralları
- Zaman çakışması kontrolü
- Dinlenme süresi kontrolü
- Lokasyon uygunluğu
- Kural puanlama
- Çizelge optimizasyonu

### Veri Katmanı

- Prisma modelleri
- PostgreSQL tabloları
- Seed verisi

## Veri Akışı

1. Yönetici kişi, lokasyon, vardiya ve kural verilerini girer.
2. Yönetici dönem seçerek çizelge üretimini başlatır.
3. Sistem önce dönem içindeki gerekli nöbet örneklerini üretir.
4. Scheduler, her nöbet için uygun adayları bulur.
5. Hard constraint filtrelenir.
6. Soft constraint skorlaması yapılır.
7. En iyi aday atanır, gerekiyorsa geri izleme uygulanır.
8. Sonuç kaydedilir.
9. Kullanıcı sonucu manuel düzeltir veya export eder.

## Tavsiye Edilen Kütüphaneler

- UI: `shadcn/ui` veya benzeri yönetim paneli bileşen seti
- Tablo: `@tanstack/react-table`
- Takvim: `@fullcalendar/*`
- Form: `react-hook-form`
- Doğrulama: `zod`
- Excel: `exceljs`
- Word: `docx`
- PDF: `playwright`
- Tarih işlemleri: `date-fns`

## Genişlemeye Açık Noktalar

- Arka planda çalışan job sistemi
- Çok kiracılı mimari
- Yetkinlik eşleme matrisi
- API anahtarı veya kurum bazlı erişim

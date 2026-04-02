# Uygulama Planı

## Faz 1: Monorepo ve Temel Kurulum

- `pnpm` workspace yapısını kur
- `apps/web`, `packages/shared`, `packages/scheduler`, `packages/exporter` paketlerini oluştur
- TypeScript ve lint ayarlarını tamamla

## Faz 2: Veri Tabanı

- Prisma şemasını yaz
- PostgreSQL bağlantısını kur
- Seed veri senaryosunu hazırla

## Faz 3: Yönetim Modülleri

- Kişi CRUD
- Lokasyon CRUD
- Vardiya şablonu CRUD
- Nöbet ihtiyaç kuralı CRUD
- Kişi kural ekranları

## Faz 4: Çizelge Motoru

- Gereksinim üretme
- Aday hesaplama
- Hard constraint filtreleme
- Soft constraint puanlama
- Atama kaydı oluşturma
- Conflict log üretme

## Faz 5: Sonuç Ekranı

- Tablo görünümü
- Takvim görünümü
- Manuel değişiklik
- Kilitleme

## Faz 6: Export

- Excel
- PDF
- Word

## Faz 7: Test ve Demo

- Scheduler birim testleri
- Temel form doğrulama testleri
- Seed veri ile demo dönem üretimi

# Claude Code Ana Prompt

Sen kıdemli bir full-stack mühendissin. Türkçe arayüzlü, üretime yakın kalitede bir "Nöbet Çizelgesi Hazırlama Sistemi" geliştir.

Önce şu dosyaları oku ve uygulamayı bunlara göre inşa et:

- `README.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SCHEDULING_RULES.md`
- `docs/API_CONTRACT.md`
- `docs/UI_FLOW.md`
- `docs/EXPORTS.md`
- `docs/ACCEPTANCE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `examples/seed-data.json`

## Ürün amacı

Yönetici kullanıcıların kişi, çalışma yeri, vardiya ve nöbet kurallarını tanımlayabildiği; personel müsaitliklerini ve çalışamayacağı gün/saatleri girebildiği; aylık çizelge oluşturabildiği; sonucu elle düzenleyebildiği; son çıktıyı Excel, PDF ve Word olarak alabileceği bir sistem kur.

## Teknik kararlar

- Monorepo kullan.
- `pnpm` kullan.
- `Next.js 15 + TypeScript` kullan.
- Veri tabanı olarak `PostgreSQL + Prisma` kullan.
- UI tarafında modern, temiz ve yönetim paneline uygun bir tasarım kur.
- Tüm form girişlerinde sunucu ve istemci tarafı doğrulama uygula.
- Türkçe metinleri merkezi bir sabit dosyada veya sözlük yapısında tut.

## Mutlaka olacak modüller

- Kişi yönetimi
- Çalışma yeri yönetimi
- Vardiya ve nöbet şablonları
- Lokasyon bazlı nöbet ihtiyaç şablonları
- Uygunluk ve kısıt yönetimi
- Dönem seçip çizelge üretme
- Çizelgeyi tablo ve takvim görünümünde görüntüleme
- Manuel atama ve kilitleme
- Çakışma ve eksik atama raporu
- Excel, PDF, Word dışa aktarma

## Davranış kuralları

- Zorunlu kurallar ihlal edilmemeli.
- Yumuşak kurallarda puanlama yaklaşımı kullanılmalı.
- Çizelge üretimi tamamlandığında gerekçe ve uyarılar kullanıcıya gösterilmeli.
- Sistem boşta kalan nöbetleri açıkça raporlamalı.
- Aynı kişiye aynı saat aralığında çakışan iki görev verilmemeli.

## Kod kalitesi beklentisi

- Güçlü tip güvenliği kur.
- Bileşenleri küçük ve tekrar kullanılabilir tasarla.
- Çizelge üretim mantığını UI'dan ayır.
- Export mantığını ayrı paket veya servis katmanına al.
- Seed veri ekle.
- Temel testler yaz: özellikle çizelge kuralları için.

## İstenen teslim sırası

1. Monorepo iskeletini kur.
2. Prisma şemasını ve migration dosyalarını oluştur.
3. Temel seed verisini ekle.
4. CRUD ekranlarını tamamla.
5. Çizelge üretim motorunu geliştir.
6. Manuel düzenleme akışını ekle.
7. Export katmanını ekle.
8. Örnek veri ile çalışan bir demo senaryosu hazırla.

## Çıktı beklentisi

- Çalışan uygulama
- Kurulum yönergesi
- Örnek veri ile demo
- Kabul kriterlerini karşılayan ekranlar
- Export dosyaları üretebilen akış

Belirsiz bir noktada önce en güvenli MVP varsayımını yap, ama veri modelini geleceğe açık bırak.

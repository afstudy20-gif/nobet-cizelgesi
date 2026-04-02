# Nöbet Çizelgesi Sistemi

Bu klasör, Claude Code ile geliştirilecek nöbet ve çalışma çizelgesi uygulaması için hazırlanmış ürün ve teknik iskeleti içerir.

Amaç, aşağıdaki ihtiyaçları kapsayan bir web tabanlı yönetim sistemi kurmaktır:

- Çalışan veya görevli kişi kayıtları eklemek
- Çalışma yerlerini tanımlamak
- Nöbet ve vardiya şablonları oluşturmak
- Lokasyon bazlı nöbet ihtiyacı şablonları tanımlamak
- Kişi bazlı müsaitlik, yasaklı gün, yasaklı saat ve tercih bilgisi girmek
- Aylık veya dönemsel çizelge üretmek
- Manuel düzeltme yapmak
- Sonuçları Excel, PDF ve Word olarak dışa aktarmak

## Önerilen MVP

- Türkçe arayüz
- Web tabanlı yönetim paneli
- Aylık çizelge üretimi
- Tek yönetici rolü ile başlangıç
- Sonradan genişlemeye açık veri modeli

## Önerilen Teknoloji

- `Next.js 15` + `TypeScript`
- `PostgreSQL`
- `Prisma ORM`
- `Zod` ile doğrulama
- `Tailwind CSS` + yönetim paneli bileşenleri
- Takvim görünümü için `FullCalendar`
- Excel için `exceljs`
- Word için `docx`
- PDF için HTML tabanlı çıktı + `Playwright`

## Klasör Yapısı

- `docs/PRD.md`: Ürün kapsamı ve kullanıcı hikayeleri
- `docs/ARCHITECTURE.md`: Teknik mimari ve modüller
- `docs/DATA_MODEL.md`: Veri modeli ve tablo önerileri
- `docs/SCHEDULING_RULES.md`: Nöbet üretim kuralları
- `docs/API_CONTRACT.md`: API uçları
- `docs/UI_FLOW.md`: Ekranlar ve kullanıcı akışı
- `docs/EXPORTS.md`: Excel, PDF, Word çıktı tasarımı
- `docs/ACCEPTANCE.md`: Kabul kriterleri
- `docs/IMPLEMENTATION_PLAN.md`: Claude Code için iş sırası
- `CLAUDE_CODE_PROMPT.md`: Claude Code'a verilecek ana prompt
- `examples/seed-data.json`: Örnek veri seti
- `apps/web/`: Web arayüzü ve route handler katmanı
- `packages/shared/`: Ortak tipler ve şema dosyaları
- `packages/scheduler/`: Çizelge üretim motoru
- `packages/exporter/`: Excel/PDF/Word üretimi

## Claude Code ile Kullanım

1. Önce `docs` altındaki dosyaları Claude Code'a bağlam olarak ver.
2. Ardından `CLAUDE_CODE_PROMPT.md` içeriğini ana görev olarak kullan.
3. Claude Code'dan önce iskeleti, sonra veri modelini, sonra ekranları ve en sonda export katmanını istemek en güvenli akıştır.

## Varsayımlar

- Planlama temel olarak ay bazlı yapılır.
- Nöbet ihtiyacı, lokasyon + vardiya + tekrar kuralı kombinasyonundan üretilir.
- Bir kişi aynı zaman aralığında birden fazla göreve atanamaz.
- Zorunlu kurallar ile tercih kuralları ayrı tutulur.
- Sistem önce yönetici kullanımı için tasarlanır; çoklu rol yapısı ikinci aşamaya bırakılabilir.
- Yetkinlik bazlı görev atama ihtiyacı doğarsa veri modeli buna açık olacak şekilde hazırlanmalıdır.

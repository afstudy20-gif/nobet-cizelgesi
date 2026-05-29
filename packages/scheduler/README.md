# @nobet/scheduler

Nöbet üretim motorunun saf (yan etkisiz, Prisma'dan bağımsız) çekirdek
yardımcılarını barındırır. Bu fonksiyonlar web uygulamasındaki çizelge üretim
route'u (`apps/web/.../schedule/generate`) tarafından kullanılır ve birim
testleriyle doğrulanır.

## İçerik

- `time.ts` — zaman yardımcıları
  - `parseHHMM` — `"HH:MM"` ayrıştırma
  - `shiftStart` / `shiftEnd` — vardiya başlangıç/bitiş `DateTime` üretimi (gece yarısı geçişi dahil)
  - `overlaps` — iki zaman aralığının çakışıp çakışmadığı
  - `isWeekend` — hafta sonu kontrolü (ISO Cmt/Paz)
- `availability.ts` — uygunluk yardımcıları
  - `isPersonUnavailable` — kişi ilgili tarih/saatte yasaklı mı (hard constraint)
  - `getAvailabilityMatch` — tercih eşleşmesi (`preferred` / `neutral` / `unpreferred`, soft constraint puanlama)

## Test

```bash
pnpm --filter @nobet/scheduler test
```

Hard constraint (yasaklı gün/saat, çakışma) ve soft constraint (tercih) mantığı
`src/__tests__/` altında kapsanır.

# Veri Modeli

## Temel Varlıklar

### Person

Kişi kaydı.

Önerilen alanlar:

- `id`
- `code`
- `firstName`
- `lastName`
- `fullName`
- `phone`
- `email`
- `isActive`
- `notes`
- `createdAt`
- `updatedAt`

### Location

Çalışma yeri veya nöbet noktası.

Önerilen alanlar:

- `id`
- `code`
- `name`
- `address`
- `isActive`
- `notes`

### ShiftTemplate

Tekrarlı vardiya veya nöbet tanımı.

Önerilen alanlar:

- `id`
- `code`
- `name`
- `startTime`
- `endTime`
- `crossesMidnight`
- `requiredHeadcount`
- `defaultLocationId`
- `color`
- `isNightShift`
- `minimumRestHoursAfter`
- `isActive`

### CoverageRule

Bir lokasyonda, belirli gün veya tekrar düzeninde hangi vardiyadan kaç kişi gerektiğini tanımlar.

Önerilen alanlar:

- `id`
- `locationId`
- `shiftTemplateId`
- `ruleType`
- `weekday`
- `specificDate`
- `validFrom`
- `validTo`
- `requiredHeadcount`
- `priority`
- `isActive`

Açıklama:

- `ruleType`: `WEEKLY`, `SPECIFIC_DATE`, `DATE_RANGE`

### PersonLocationRule

Bir kişinin hangi lokasyonda çalışabileceğini tanımlar.

Önerilen alanlar:

- `id`
- `personId`
- `locationId`
- `allowed`
- `priority`

### PersonWorkRule

Kişi bazlı çalışma sınırları.

Önerilen alanlar:

- `id`
- `personId`
- `minAssignmentsPerPeriod`
- `maxAssignmentsPerPeriod`
- `maxNightAssignmentsPerPeriod`
- `maxWeekendAssignmentsPerPeriod`
- `maxConsecutiveDays`
- `minRestHoursBetweenAssignments`
- `allowBackToBackNightShift`

### AvailabilityRule

Tekrarlayan uygunluk veya uygunsuzluk kuralı.

Önerilen alanlar:

- `id`
- `personId`
- `ruleType`
- `availabilityType`
- `weekday`
- `startTime`
- `endTime`
- `validFrom`
- `validTo`
- `locationId`
- `notes`

Açıklama:

- `ruleType`: `WEEKLY`, `DATE_RANGE`, `ONE_DAY`
- `availabilityType`: `AVAILABLE`, `UNAVAILABLE`, `PREFERRED`

### SchedulePeriod

Planlama yapılan dönem.

Önerilen alanlar:

- `id`
- `name`
- `startDate`
- `endDate`
- `status`
- `generationNotes`
- `createdAt`

### ShiftRequirement

Dönem içinde doldurulması gereken nöbet örnekleri.

Önerilen alanlar:

- `id`
- `periodId`
- `date`
- `shiftTemplateId`
- `locationId`
- `requiredHeadcount`
- `priority`

### Assignment

Kişinin belirli nöbete atanmış hali.

Önerilen alanlar:

- `id`
- `periodId`
- `shiftRequirementId`
- `personId`
- `date`
- `startDateTime`
- `endDateTime`
- `status`
- `isLocked`
- `source`
- `score`
- `notes`

Açıklama:

- `status`: `ASSIGNED`, `UNFILLED`, `CANCELLED`
- `source`: `AUTO`, `MANUAL`

### ConflictLog

Üretim sırasında oluşan sorunlar.

Önerilen alanlar:

- `id`
- `periodId`
- `shiftRequirementId`
- `personId`
- `type`
- `severity`
- `message`
- `metadata`

## İlişkiler

- Bir kişi birçok uygunluk kuralına sahip olabilir.
- Bir kişi birçok lokasyon kuralına sahip olabilir.
- Bir lokasyon birçok nöbet ihtiyacı kuralına sahip olabilir.
- Bir dönem birçok nöbet gereksinimine sahiptir.
- Bir nöbet gereksinimi birden fazla kişi gerektiriyorsa birden fazla atama oluşabilir.
- Bir atama bir kişiye ve bir gereksinime bağlıdır.

## Önemli Tasarım Kararları

- Tekrarlayan kurallar ile tarih bazlı istisnalar ayrı tutulmalıdır.
- Gereksinim üretimi `CoverageRule` kaynaklı olmalıdır; `ShiftRequirement` doğrudan kullanıcı tarafından tek tek yazılmamalıdır.
- Manuel kilitli atamalar scheduler tarafından bozulmamalıdır.
- `Assignment` içinde zaman damgaları ayrıca tutulmalıdır; sadece şablona bakmak yeterli değildir.
- Çakışma raporu ayrı tabloda saklanırsa geriye dönük denetim kolay olur.

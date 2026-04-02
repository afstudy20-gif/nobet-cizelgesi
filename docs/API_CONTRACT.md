# API Sözleşmesi

Bu uçlar `apps/web` içinde route handler veya server action olarak uygulanabilir.

## Kişiler

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/:id`
- `PATCH /api/people/:id`
- `DELETE /api/people/:id`

Örnek `POST /api/people` gövdesi:

```json
{
  "code": "P001",
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "05550000000",
  "email": "ayse@example.com",
  "isActive": true,
  "notes": "Gece nöbeti tercih etmiyor."
}
```

## Lokasyonlar

- `GET /api/locations`
- `POST /api/locations`
- `GET /api/locations/:id`
- `PATCH /api/locations/:id`
- `DELETE /api/locations/:id`

## Vardiya Şablonları

- `GET /api/shift-templates`
- `POST /api/shift-templates`
- `GET /api/shift-templates/:id`
- `PATCH /api/shift-templates/:id`
- `DELETE /api/shift-templates/:id`

## Nöbet İhtiyaç Kuralları

- `GET /api/coverage-rules`
- `POST /api/coverage-rules`
- `GET /api/coverage-rules/:id`
- `PATCH /api/coverage-rules/:id`
- `DELETE /api/coverage-rules/:id`

## Uygunluk ve Kısıtlar

- `GET /api/people/:id/availability`
- `POST /api/people/:id/availability`
- `PATCH /api/availability/:id`
- `DELETE /api/availability/:id`
- `GET /api/people/:id/work-rules`
- `PUT /api/people/:id/work-rules`
- `GET /api/people/:id/location-rules`
- `PUT /api/people/:id/location-rules`

## Dönem ve Çizelge

- `GET /api/periods`
- `POST /api/periods`
- `GET /api/periods/:id`
- `POST /api/periods/:id/requirements/generate`
- `POST /api/periods/:id/schedule/generate`
- `GET /api/periods/:id/schedule`
- `PATCH /api/assignments/:id`
- `POST /api/assignments/:id/lock`
- `POST /api/assignments/:id/unlock`

`POST /api/periods/:id/schedule/generate` beklenen davranış:

- Seçili dönem için gereksinimleri yükler
- Kilitli atamaları dikkate alır
- Yeni atamalar üretir
- Sonuç, özet ve conflict log döner

Örnek yanıt:

```json
{
  "periodId": "period_2026_04",
  "summary": {
    "requirements": 90,
    "assigned": 84,
    "unfilled": 6,
    "conflicts": 4
  },
  "warnings": [
    "6 nöbet doldurulamadı.",
    "2 kişide hafta sonu yükü ortalamanın üstünde."
  ]
}
```

## Export

- `GET /api/periods/:id/export/excel`
- `GET /api/periods/:id/export/pdf`
- `GET /api/periods/:id/export/word`

Sorgu parametreleri:

- `view=grid|person|location`
- `includeSummary=true|false`
- `includeConflicts=true|false`

## Hata Formatı

Standart hata cevabı:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Girilen vardiya saatleri geçersiz.",
    "details": []
  }
}
```

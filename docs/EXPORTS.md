# Dışa Aktarma Tasarımı

## Excel

Excel çıktısı birden fazla sayfa içermelidir:

- `Plan`: gün x vardiya x lokasyon ana tablo
- `Kişi Özeti`: kişi başına toplam nöbet, gece nöbeti, hafta sonu nöbeti
- `Lokasyon Özeti`: lokasyon başına toplam görev
- `Çatışmalar`: boşta kalan veya uyarılı atamalar

Excel beklentileri:

- Başlık satırları sabitlenmeli
- Hafta sonları farklı renkle gösterilmeli
- Gece nöbetleri farklı renkle vurgulanmalı
- Dosya adı dönem bilgisi içermeli

Örnek dosya adı:

- `nobet-plani-2026-04.xlsx`

## PDF

PDF çıktısı yazdırılabilir formatta olmalıdır.

Beklentiler:

- Yatay sayfa düzeni
- A4 veya ihtiyaç olursa A3 destekli
- Kurum adı ve dönem başlığı
- Ana tablo net okunur olmalı
- Sayfa sonlarında özet bilgisi bulunmalı

Örnek içerik:

- Başlık
- Dönem özeti
- Günlük çizelge tablosu
- Boş nöbetler listesi

## Word

Word çıktısı paylaşım ve resmi yazışma için uygun olmalıdır.

İçerik önerisi:

- Kapak başlığı
- Dönem bilgisi
- Genel özet
- Kişi bazlı tablo
- Lokasyon bazlı tablo
- Açıklama ve not alanı

Örnek dosya adı:

- `nobet-raporu-2026-04.docx`

## Export Filtreleri

Kullanıcı şu seçenekleri belirleyebilmelidir:

- Tüm plan
- Sadece kişi özeti
- Sadece lokasyon özeti
- Çatışmaları dahil et
- Kilitli atamaları işaretle

## Teknik Not

- Excel ve Word üretimi veri odaklı olmalıdır.
- PDF üretimi HTML şablonu üzerinden yapılırsa tasarım kontrolü daha kolay olur.

# Çizelge Üretim Kuralları

## Hard Constraint

Bu kurallar ihlal edilirse atama yapılamaz:

- Kişi aktif değilse atanamaz.
- Kişi ilgili lokasyonda çalışamıyorsa atanamaz.
- Kişi ilgili tarih veya saat aralığında müsait değilse atanamaz.
- Kişi aynı saatlerde başka bir göreve atanmışsa atanamaz.
- Kişi için tanımlanan minimum dinlenme süresi sağlanmıyorsa atanamaz.
- Kişi dönem içi maksimum atama limitini aşıyorsa atanamaz.
- Kişi dönem içi maksimum gece veya hafta sonu limitini aşıyorsa atanamaz.

## Soft Constraint

Bu kurallar puanlama ile yönetilir:

- Atamaların kişiler arasında dengeli dağılması
- Tercih edilen gün ve saatlerin öne alınması
- Aynı kişiye art arda zor nöbet verilmemesi
- Aynı lokasyonda sürekli aynı kişilerin toplanmaması
- Hafta sonu yükünün dengelenmesi

## Önerilen Üretim Yaklaşımı

1. Dönem için `ShiftRequirement` kayıtlarını oluştur.
2. Kilitli manuel atamaları önce yerleştir.
3. Geriye kalan gereksinimleri zorluk derecesine göre sırala.
4. Her gereksinim için aday listesini üret.
5. Hard constraint ile adayları filtrele.
6. Soft constraint skoru hesapla.
7. En yüksek skorlu adayı ata.
8. Çıkmaza girilirse sınırlı geri izleme yap.
9. Yine doldurulamayan nöbetleri `UNFILLED` olarak işaretle.

## Skor Önerisi

Başlangıç puanı: `100`

Önerilen cezalar:

- Tercih edilmeyen gün: `-10`
- Son 24 saat içinde yoğun vardiya: `-15`
- Gece nöbeti sonrası yeni gece nöbeti: `-25`
- Dönem ortalamasının üstünde yük: `-20`
- Aynı lokasyonda tekrarlı yoğunluk: `-10`

Önerilen bonuslar:

- Tercihli gün veya saat: `+15`
- Dönem ortalamasının altında yük: `+10`
- İlgili lokasyon için yüksek öncelik: `+10`

## Manuel Düzenleme Kuralları

- Kullanıcı herhangi bir atamayı elle değiştirebilir.
- Kullanıcı atamayı kilitleyebilir.
- Yeniden üretim yapılırken kilitli atamalar korunur.
- Manuel atama hard constraint ihlal ediyorsa kullanıcı açık uyarı görmelidir.

## Raporlama Kuralları

Üretim sonunda şu bilgiler görünmelidir:

- Toplam gereksinim sayısı
- Dolu atama sayısı
- Boşta kalan nöbet sayısı
- Kural ihlali sayısı
- Kişi bazlı toplam nöbet sayısı
- Lokasyon bazlı toplam nöbet sayısı

## İleri Seviye Not

İlk sürümde greedy + puanlama + sınırlı backtracking yeterlidir. Daha sonra ihtiyaç olursa kısıt programlama veya lineer optimizasyon katmanı eklenebilir.

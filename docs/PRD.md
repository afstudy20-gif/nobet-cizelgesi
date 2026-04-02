# Ürün Gereksinimleri

## Problem

Nöbet ve çalışma çizelgeleri çoğu zaman Excel üzerinde elle hazırlanır. Bu yaklaşım, özellikle kişi sayısı arttığında şu sorunları doğurur:

- Kim hangi gün müsait takip etmek zorlaşır
- Aynı kişiye çakışan görev verilebilir
- Çalışamayacağı gün veya saatler gözden kaçabilir
- Haftalık ve aylık denge bozulabilir
- Farklı çalışma yerlerine adil dağılım yapmak zorlaşır
- Excel, PDF ve Word çıktıları ayrı ayrı hazırlanmak zorunda kalır

## Hedef Kullanıcı

- Yönetici
- Sorumlu planlayıcı
- İkinci aşamada görüntüleyici rolü eklenebilir

## Ana Özellikler

- Kişi kaydı oluşturma
- Kişi adı, iletişim bilgisi, aktiflik durumu, not alanı
- Çalışma yerlerini tanımlama
- Vardiya veya nöbet şablonları tanımlama
- Lokasyon bazlı nöbet ihtiyacı ve tekrar eden talep şablonları tanımlama
- Gün, saat ve tekrar eden düzen bazlı müsaitlik tanımlama
- Belirli tarih aralıklarında çalışamaz bilgisi girme
- Belirli gün ve saatlerde çalışabilir bilgisi girme
- Lokasyon bazlı çalışabilirlik tanımlama
- Aylık veya özel tarih aralığı için çizelge üretme
- Elle atama düzeltme ve kilitleme
- Kişi bazlı, lokasyon bazlı ve genel özet alma
- Excel, PDF, Word çıktı alma

## Kullanıcı Hikayeleri

- Planlayıcı olarak yeni personel eklemek istiyorum, böylece isimleri çizelgeye dahil edebileyim.
- Planlayıcı olarak çalışma yerlerini tanımlamak istiyorum, böylece nöbetlerin hangi lokasyonda tutulacağını belirleyebileyim.
- Planlayıcı olarak sabit vardiya şablonları girmek istiyorum, böylece her ay yeniden saat tanımlamak zorunda kalmayayım.
- Planlayıcı olarak lokasyon bazlı nöbet ihtiyacını haftalık düzende tanımlamak istiyorum, böylece her dönem otomatik gereksinim oluşsun.
- Planlayıcı olarak bir kişinin hangi günler müsait olmadığını girmek istiyorum, böylece hatalı atama yapılmasın.
- Planlayıcı olarak bir kişinin yalnızca belirli saatlerde çalışabileceğini girmek istiyorum, böylece vardiya kısıtları korunsun.
- Planlayıcı olarak otomatik çizelge üretmek istiyorum, böylece zamandan tasarruf edeyim.
- Planlayıcı olarak otomatik sonucu manuel düzeltebilmek istiyorum, böylece istisnai durumları yönetebileyim.
- Planlayıcı olarak çizelgeyi Excel, PDF ve Word olarak almak istiyorum, böylece paylaşım ve arşivleme kolay olsun.

## Fonksiyonel Gereksinimler

- Sistem kişi, lokasyon, vardiya ve kural kayıtlarını saklamalıdır.
- Sistem tekrarlayan haftalık uygunluk kurallarını desteklemelidir.
- Sistem tarih bazlı izin ve engel kayıtlarını desteklemelidir.
- Sistem kişi bazlı minimum ve maksimum nöbet sayısı tanımlayabilmelidir.
- Sistem kişi bazlı lokasyon izinleri tanımlayabilmelidir.
- Sistem farklı nöbet tiplerini desteklemelidir.
- Sistem lokasyon bazlı tekrar eden nöbet ihtiyacı tanımlayabilmelidir.
- Sistem dönem için eksik atamaları raporlamalıdır.
- Sistem kullanıcıya kural ihlallerini göstermelidir.
- Sistem manuel kilitlenmiş atamaları koruyarak yeniden üretim yapabilmelidir.

## Fonksiyonel Olmayan Gereksinimler

- Arayüz mobilde de temel seviyede kullanılabilir olmalıdır.
- Aylık plan için üretim süresi makul düzeyde olmalıdır.
- Export çıktıları yazdırılabilir kalitede olmalıdır.
- Tüm kritik işlemler doğrulanmış veri ile çalışmalıdır.

## MVP Dışı Ama Geleceğe Açık Konular

- Yetkinlik veya unvan bazlı görev eşleştirme
- Onay akışı
- E-posta veya mesaj ile bildirim
- Çoklu kurum desteği
- Personel self-service ekranı

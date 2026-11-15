# AGENTS.md — MarsPath (repo: Luna-9)

Bu dosyayı Codex her oturumda okur. Aynı içerik `CLAUDE.md` dosyasında Claude Code için de var. Codex bu projede **Kişi 2** için çalışır: sadece `data-pipeline/`, `frontend/src/routing/` ve `frontend/public/data/` klasörlerini değiştirir; branch'i `feature/data-routing`.

## Proje

**MarsPath**: NASA Space Apps Challenge 2026 ("Interplanetary Survival Guide: Martian Map") için web uygulaması. Gerçek NASA/USGS Mars verileriyle bir astronotun Jezero Krateri'nde bilimsel bir hedefe güvenli yürüyüş (EVA) rotasını planlamasını sağlar. Kullanıcı başlangıç ve hedef seçer; uygulama eğim ve arazi pürüzlülüğüne göre A* ile rota hesaplar, alternatif rotaları karşılaştırır, Tobler fonksiyonuyla süre tahmin eder ve güncel koşulları (Perseverance MEDA) gösterir.

- Çalışma alanı: Jezero Krateri'nde yaklaşık 2×2 km
- Backend yok: veri bir kez Python ile işlenir, sonuçlar `frontend/public/data/` içine statik dosya olarak konur, rota tarayıcıda hesaplanır
- Yayın: Vercel (`main` branch'inden)

## Teknoloji

- `frontend/`: Vite + React + TypeScript, OpenLayers (`ol`), Recharts, Vitest
- `data-pipeline/`: Python 3.11+, rasterio, numpy, pillow

## Ekip, branch ve klasör sahipliği (KESİN KURAL)

| Kişi | Araç | Branch | Sahip olduğu yerler |
| --- | --- | --- | --- |
| Kişi 1 | Claude Code | `feature/frontend` | `frontend/src/map/`, `frontend/src/panels/`, `frontend/src/mocks/`, `frontend/src/App.tsx`, stiller, `frontend/public/content/`, `frontend/package.json`, `package-lock.json`, Vite ayarları, `docs/CONTRACT.md`, `CLAUDE.md`, `AGENTS.md`, `.gitignore` |
| Kişi 2 | Codex | `feature/data-routing` | `data-pipeline/`, `frontend/src/routing/`, `frontend/public/data/` |
| Kişi 3 | GitHub web | `feature/docs` | `README.md`, `docs/gorseller/` |

Kurallar:

1. **Sadece çalıştığın kişinin sahip olduğu dosyaları değiştir.** Başka birinin klasöründe hata görürsen düzeltme; kullanıcıya bildir.
2. **`main` ve `develop` branch'lerine asla doğrudan commit veya push yapma;** ikisi de sadece Pull Request ile değişir. Akış: `feature/*` → PR → `develop` → PR → `main` (develop → main sadece MVP'de ve teslimde). (Tek istisna: Kişi 1'in ilk iskelet commit'i `develop`'a, kullanıcı açıkça isterse.)
3. **Kullanıcı açıkça istemeden commit, push, merge, rebase veya branch silme yapma.** Commit'ler sadece aşama sonlarında, kullanıcının onayıyla yapılır.
4. `git add .` öncesi `git status` çıktısını kullanıcıya göster; `node_modules`, `data-pipeline/raw/`, `.tif` dosyaları asla commit edilmez.
5. `frontend/package.json` sadece Kişi 1'in oturumunda değiştirilir. Kişi 2 oturumunda `npm install <paket>` çalıştırma; kurulum için `npm ci` kullan.
6. `docs/CONTRACT.md` (v2) iki tarafın ortak sözleşmesidir. Veri formatları ve rota API'si oradadır; ona birebir uy. Değişiklik gerekiyorsa kodu değiştirmeden önce kullanıcıya söyle.

## Veri dürüstlüğü (KESİN KURAL)

- **Veri seti linki, koordinat, ölçüm değeri veya bilimsel bilgi uydurma.** Emin olmadığın bir kaynak için "doğrulanmalı" diye not düş.
- Gerçek veri (uydu görüntüsü, DEM, MEDA ölçümleri) ile senaryo parametreleri (ağırlıklar, skafandr katsayısı, EVA limiti) ayrı tutulur. Senaryo parametreleri tek yerde (`frontend/src/routing/config.ts`) durur ve arayüzde "senaryo" etiketiyle gösterilir.
- Rota çıktısı "kesin güvenli rota" değil, "ön değerlendirme rotası" olarak sunulur.
- MEDA hava verisi **geçmiş ölçümdür**; arayüzde asla "current", "live" veya "bugünkü hava" gibi sunulmaz. Her değerin yanında sol, Dünya tarihi ve kaynak görünür (CONTRACT Bölüm 7).

## Kod kuralları

- TypeScript strict; `any` kullanma.
- Küçük, tek işi yapan fonksiyonlar. Kod yorumları İngilizce, kısa ve "neden"i anlatan.
- Kullanıcıya görünen arayüz metinleri İngilizce (uluslararası jüri); astronot dili ("EVA ready", "Point of no return", "Science target").
- Yeni bağımlılık eklemeden önce sor.
- Bir görevi bitirince kullanıcıya Türkçe olarak neyi, hangi dosyada ve neden yaptığını özetle; kullanıcı yazılım mühendisliği öğrencisi ve ne olduğunu anlamak istiyor.
- Değişiklik sonrası çalıştığını doğrula: `npm run build` ve varsa `npm test`.

## Komutlar (`frontend/` içinde)

- `npm ci` — bağımlılıkları kilit dosyasına göre kur
- `npm run dev` — geliştirme sunucusu
- `npm run build` — üretim derlemesi
- `npm test` — Vitest testleri

## Önemli dosyalar

- `docs/CONTRACT.md` — veri formatları, koordinat sistemi, rota API'si
- `frontend/src/mocks/` — Kişi 1'in, Kişi 2'nin gerçek verisi gelene kadar kullandığı sahte veri ve sahte `findRoute()`

# CONTRACT.md — MarsPath veri ve arayüz sözleşmesi (v3.1)

> **v3.1: Section 7 MEDA schema v2.** `meda.json` yeni şemaya geçti: `version: 2`, `site`, `source.datasets`, `historical: true`; her sol birden çok observation içerir ve her dolu değerin kaynağı (`measurements`: dosya, sütun, birim, belirsizlik, kalite) yazılır. Diğer bölümler değişmedi.

> **v3 değişiklikleri (Kişi 2'nin önerisiyle):** `RouteResult.reason` içine `invalid-input` eklendi; geçersiz girdi artık `unreachable` dönmüyor (Bölüm 9). `meanSlopeDeg` mesafe ağırlıklı ortalama olarak tanımlandı (Bölüm 9). `pointOfNoReturnIndex` tanımlandı (Bölüm 9). Hiçbir alternatif rota bulunamazsa `recommended: null` (Bölüm 9). **v3 dondurulmuştur:** bundan sonra sadece bir şey gerçekten çalışmıyorsa, aşama sonunda değiştirilir.

> **v2 değişiklikleri (Kişi 2'nin incelemesiyle):** çapraz geçişte köşe kesme yasağı (Bölüm 9), gidiş ve dönüş sürelerinin ayrı hesaplanması (Bölüm 9), harita sınırında indeks taşmasının önlenmesi (Bölüm 1), DEM–ortofoto hizalama doğrulaması (Bölüm 3a), mesafe ağırlığının sıfır olamaması (Bölüm 9), MEDA verisinin geçmiş ölçüm olarak gösterilmesi (Bölüm 7), NoData ve ızgara kenarı kuralları (Bölüm 3b), `roughnessP95 = 0` durumunda sıfıra bölme koruması (Bölüm 9).

Bu dosya Kişi 1 (frontend, Claude Code) ile Kişi 2 (veri + rota, Codex) arasındaki ortak dildir.
İki taraf da buradaki formatlara birebir uyar. Kişi 1 bu formatta **mock veri** ile, Kişi 2 **gerçek veri** ile çalışır; parçalar birleşince sorunsuz oturur.

**Değişiklik kuralı:** Bu dosyada bir şey değişecekse önce grupta konuşulur, değişikliği sadece Kişi 1 yapar ve sürüm numarasını artırır (v3 → v4).

---

## 1. Koordinat sistemi

Tüm uygulama tek bir **yerel metrik koordinat sistemi** kullanır. Coğrafi koordinat dönüşümü yapılmaz; bu, harita ile ızgaranın birebir hizalanmasını garanti eder.

- Çalışma alanı, kenarları `width × cellSize` ve `height × cellSize` metre olan bir dikdörtgendir.
- **Harita koordinatı (x, y), metre:** Sol alt köşe `(0, 0)`, sağ üst köşe `(width × cellSize, height × cellSize)`. `x` doğuya, `y` kuzeye artar. Görüntüler kuzey yukarı olacak şekilde hazırlanır.
- **Izgara hücresi (col, row):** Sol üst köşe `(0, 0)`. `col` doğuya (sağa), `row` güneye (aşağı) artar.
- **Dizi indeksi:** `i = row × width + col` (satır öncelikli, row-major).

Dönüşüm (Kişi 1 `frontend/src/map/coords.ts` içinde yazar):

```
W = width × cellSize, H = height × cellSize

Harita dışı tıklama: x < 0, x > W, y < 0 veya y > H ise hücre YOK (null döner, nokta konmaz).

col = clamp(floor(x / cellSize), 0, width − 1)
row = clamp(floor((H − y) / cellSize), 0, height − 1)

hücre merkezi:
x = (col + 0.5) × cellSize
y = H − (row + 0.5) × cellSize
```

`clamp` gereklidir: tam sağ sınıra (`x = W`) veya üst sınıra (`y = H`) tıklanınca `floor` sonucu `width` ya da `−1` olur ve dizi dışına taşar. Kişi 1 bunun için birim testi yazar (dört köşe ve dört kenar).

OpenLayers tarafında: birimi metre olan özel bir projeksiyon (ör. kod `LUNA9-LOCAL`), extent `[0, 0, width × cellSize, height × cellSize]`.

---

## 2. Dosyalar ve sahipleri

| Dosya | Sahibi | Açıklama |
| --- | --- | --- |
| `frontend/public/data/grid.json` | Kişi 2 | Yükseklik, eğim, pürüzlülük ızgarası |
| `frontend/public/data/ortho.png` | Kişi 2 | Ortofoto, ızgarayla birebir aynı alan |
| `frontend/public/data/slope.png` | Kişi 2 | Renkli eğim katmanı, aynı alan |
| `frontend/public/data/roughness.png` | Kişi 2 | Renkli pürüzlülük katmanı, aynı alan |
| `frontend/public/data/layers.json` | Kişi 2 | Katman listesi, kaynak ve lejant bilgileri |
| `frontend/public/data/geology.geojson` | Kişi 2 | Jeolojik birimler (yerel metrik koordinatta) |
| `frontend/public/data/meda.json` | Kişi 2 | Seçilmiş MEDA solleri |
| `frontend/public/content/stops.json` | Kişi 1 | Bilimsel duraklar (metin içeriği Kişi 3'ten) |
| `frontend/public/content/photos/` | Kişi 1 | Durak fotoğrafları (Kişi 3 seçer) |
| `frontend/src/routing/` | Kişi 2 | Rota motoru (aşağıdaki API) |
| `frontend/src/routing/types.ts` | İskelette Kişi 1 oluşturur, sonra Kişi 2'nin | Ortak tipler |

---

## 3. `grid.json`

```json
{
  "version": 1,
  "width": 400,
  "height": 400,
  "cellSize": 5.0,
  "nodata": -9999,
  "elevation": [-2570.12, -2570.08],
  "slope": [3.2, 4.1],
  "roughness": [0.21, 0.35],
  "stats": {
    "elevationMin": -2610.5,
    "elevationMax": -2480.2,
    "slopeMax": 38.4,
    "roughnessP95": 1.8
  },
  "source": {
    "dem": "USGS Jezero HiRISE DTM (tam ad ve link)",
    "ortho": "USGS Jezero HiRISE ortofoto (tam ad ve link)",
    "crs": "Kaynak verinin projeksiyonu (WKT veya proj string)",
    "bounds": [0, 0, 0, 0],
    "boundsLonLat": [77.40, 18.40, 77.45, 18.45]
  }
}
```

| Alan | Birim | Açıklama |
| --- | --- | --- |
| `width`, `height` | hücre | Izgara boyutu (önerilen en fazla 400 × 400) |
| `cellSize` | metre | Bir hücrenin kenarı (5 veya 10) |
| `nodata` | — | Veri olmayan hücre değeri; bu hücreler geçilmez |
| `elevation` | metre | Uzunluk `width × height`, row-major, 2 ondalık |
| `slope` | derece | 0–90, 1 ondalık |
| `roughness` | metre | 3×3 penceredeki yükseklik standart sapması, 2 ondalık |
| `stats.roughnessP95` | metre | Pürüzlülüğün 95. yüzdeliği (normalizasyon için) |
| `source.bounds` | kaynak CRS metre | Kırpılan alanın kaynak projeksiyondaki sınırları `[minX, minY, maxX, maxY]` |
| `source.boundsLonLat` | derece | Yaklaşık `[batı, güney, doğu, kuzey]`; sadece genel bakış haritasında konum göstermek için |

Örnekteki sayılar biçimi göstermek içindir, gerçek değer değildir.

### 3a. DEM–ortofoto hizalama doğrulaması (Kişi 2)

Ortofoto ile ızgaranın birebir örtüşmesi bu sözleşmenin temelidir. Kişi 2, `grid.json` ve PNG'leri üretmeden önce:

1. `gdalinfo` ile DEM ve ortofotonun **projeksiyonunu (CRS)** karşılaştırır. Farklıysa ortofotoyu DEM'in projeksiyonuna dönüştürür (`gdalwarp -t_srs`), tersini değil.
2. İkisini **aynı kaynak-CRS sınırlarıyla** kırpar (`-projwin` veya `-te` ile aynı dört sayı).
3. Kırpılmış iki dosyanın sınırlarının birebir aynı olduğunu tekrar `gdalinfo` ile doğrular ve sonucu gruba yazar.
4. Kullandığı CRS'i ve sınırları `grid.json` içindeki `source.crs` ve `source.bounds` alanlarına yazar.

Sınırlar uyuşmuyorsa veri üretilmez; önce düzeltilir.

### 3b. NoData ve ızgara kenarı kuralları (Kişi 2)

- Yüksekliği `nodata` olan hücrenin `slope` ve `roughness` değeri de `nodata` yazılır.
- **NoData hücreleri hiçbir hesaba katılmaz:** Bir hücrenin eğimi veya pürüzlülüğü hesaplanırken 3×3 penceredeki `nodata` komşular atlanır, sadece geçerli komşular kullanılır. `-9999` asla bir yükseklik gibi ortalamaya veya farka girmez (girerse yanındaki hücrelerde sahte uçurumlar oluşur).
- **Izgara kenarı:** En dış satır ve sütunlardaki hücrelerde pencerenin ızgara dışında kalan kısmı da aynı şekilde atlanır.
- Eğim için yeterli geçerli komşu yoksa (yatay ya da dikey yönde hiç geçerli komşu kalmıyorsa) o hücrenin `slope` değeri `nodata` yazılır; yani hücre geçilmez olur (güvenli taraf).
- `stats` alanları (`elevationMin`, `elevationMax`, `slopeMax`, `roughnessP95`) **sadece geçerli hücrelerden** hesaplanır.
- PNG katmanlarında `nodata` hücreler şeffaftır.

---

## 4. Görüntü katmanları (`ortho.png`, `slope.png`, `roughness.png`)

- Üçü de **ızgarayla birebir aynı alanı** kaplar: harita extent'i `[0, 0, width × cellSize, height × cellSize]`.
- Kuzey yukarı. Piksel çözünürlüğü serbest (önerilen en fazla 2048 px kenar).
- Veri olmayan alanlar şeffaf.

## 5. `layers.json`

```json
[
  {
    "id": "slope",
    "title": "Eğim",
    "file": "slope.png",
    "source": "HiRISE DTM – MRO / USGS",
    "unit": "°",
    "legend": [
      { "value": 0, "color": "#2b83ba", "label": "0°" },
      { "value": 10, "color": "#abdda4", "label": "10°" },
      { "value": 20, "color": "#fdae61", "label": "20°" },
      { "value": 30, "color": "#d7191c", "label": "30°+" }
    ]
  }
]
```

## 6. `geology.geojson`

GeoJSON `FeatureCollection`; koordinatlar **yerel metrik sistemde (Bölüm 1)**. Her özellik:

```json
{ "unit": "Birim kodu", "name": "Birim adı", "description": "Kısa açıklama", "source": "USGS kaynak adı ve linki" }
```

## 7. `meda.json` (şema v2)

Perseverance MEDA ölçümlerinden seçilmiş soller. Dosya **isteğe bağlıdır**: yoksa veya bu şemaya uymuyorsa arayüz koşullar panelini hiç göstermez, uygulamanın geri kalanı aynen çalışır.

**Temel ilke:** Her değer tek bir sensörün, tek bir LMST zamanındaki ölçümüdür. Farklı sensörlerin farklı zamanlardaki ölçümleri **ayrı observation** olarak tutulur, aynı satıra birleştirilmez (ör. 13:05'teki basınç ile 13:20'deki rüzgâr iki ayrı observation'dır).

### Örnek

> **Uyarı:** Aşağıdaki sayılar, tarihler, dosya ve sütun adları **yalnızca biçimi göstermek içindir; gerçek ölçüm değildir.** Gerçek değerleri Kişi 2, kaynak veri setinden alır ve `source` alanına veri setinin tam adını ve linkini/DOI'sini yazar.

```json
{
  "version": 2,
  "site": { "name": "Jezero Crater", "approxLon": 77.5, "approxLat": 18.4 },
  "source": {
    "datasets": [
      { "name": "Veri setinin tam adı (örnek)", "url": "https://example.org/dataset", "doi": null }
    ]
  },
  "historical": true,
  "sols": [
    {
      "sol": 100,
      "observations": [
        {
          "localTime": "13:05",
          "timeSystem": "LMST",
          "earthDate": "2021-06-01",
          "pressurePa": 700.0,
          "relativeHumidityPct": null,
          "sensorTempC": -20.0,
          "airTempC": null,
          "windSpeedMps": null,
          "opacity": null,
          "measurements": {
            "pressurePa": { "file": "ORNEK_PS_DOSYASI.CSV", "column": "PRESSURE", "unit": "Pa", "uncertainty": 1.0, "quality": null },
            "sensorTempC": { "file": "ORNEK_RHS_DOSYASI.CSV", "column": "SENSOR_TEMP", "unit": "°C", "uncertainty": null, "quality": "ornek-bayrak" }
          },
          "isSample": false
        },
        {
          "localTime": "13:20",
          "timeSystem": "LMST",
          "earthDate": "2021-06-01",
          "pressurePa": null,
          "relativeHumidityPct": null,
          "sensorTempC": null,
          "airTempC": null,
          "windSpeedMps": 5.0,
          "opacity": null,
          "measurements": {
            "windSpeedMps": { "file": "ORNEK_WS_DOSYASI.CSV", "column": "WIND_SPEED", "unit": "m/s", "uncertainty": 0.5, "quality": null }
          },
          "isSample": false
        }
      ]
    }
  ]
}
```

### Üst düzey alanlar

| Alan | Tip | Birim | Null olabilir mi | Açıklama |
| --- | --- | --- | --- | --- |
| `version` | sayı | – | hayır | Her zaman `2`. Başka bir değer geçersiz dosya sayılır. |
| `site.name` | string | – | hayır | Bölgenin adı, ör. "Jezero Crater". |
| `site.approxLon` | sayı | ° doğu | hayır | Yaklaşık boylam, −180…180, doğu pozitif. Sadece bilgi amaçlı; haritada kullanılmaz. Hangi koordinat sistemine göre verildiği (planetocentric/planetographic) kaynakta doğrulanmalı. |
| `site.approxLat` | sayı | ° kuzey | hayır | Yaklaşık enlem, −90…90. |
| `source.datasets[]` | dizi | – | hayır (en az 1 eleman) | Kullanılan veri setleri. |
| `source.datasets[].name` | string | – | hayır | Veri setinin tam adı. |
| `source.datasets[].url` | string | – | evet | Veri setinin linki. `url` ve `doi`'den en az biri dolu olmalıdır. |
| `source.datasets[].doi` | string | – | evet | DOI, ör. `10.xxxx/...`. |
| `historical` | boolean | – | hayır | Her zaman `true`: veri geçmiş ölçümdür. |
| `sols[]` | dizi | – | hayır (en az 1 eleman) | Seçilmiş soller. |
| `sols[].sol` | tam sayı ≥ 0 | sol | hayır | Görev sol numarası. Aynı sol iki kez yer almaz. |
| `sols[].observations[]` | dizi | – | hayır (en az 1 eleman) | O sol'deki ölçümler. |

### Observation alanları

| Alan | Tip | Birim | Null olabilir mi | Açıklama |
| --- | --- | --- | --- | --- |
| `localTime` | string `"HH:MM"` | – | hayır | Ölçüm zamanı, 24 saat biçiminde yerel ortalama güneş saati. |
| `timeSystem` | string | – | hayır | Her zaman `"LMST"` (Local Mean Solar Time). |
| `earthDate` | string `"YYYY-MM-DD"` | – | evet | Ölçümün Dünya tarihi (UTC). Bilinmiyorsa `null`. |
| `pressurePa` | sayı | Pa | evet | Atmosfer basıncı. |
| `relativeHumidityPct` | sayı | % | evet | Bağıl nem, 0–100. |
| `sensorTempC` | sayı | °C | evet | **Sensör sıcaklığı, hava sıcaklığı değildir** (ör. nem sensörünün kendi sıcaklığı). |
| `airTempC` | sayı | °C | evet | Hava sıcaklığı. Sadece kaynak bunu açıkça hava sıcaklığı olarak veriyorsa doldurulur. |
| `windSpeedMps` | sayı | m/s | evet | Rüzgâr hızı. |
| `opacity` | sayı ≥ 0 | boyutsuz | evet | Atmosfer opaklığı. Hangi ürün/tanım olduğu `measurements.opacity.column` ve veri seti adıyla belirtilir. |
| `measurements` | nesne | – | hayır | **Dolu (null olmayan) her değer alanı için** aynı adlı bir girdi zorunludur. Null alanlar için girdi yazılmaz (yazılırsa yok sayılır). |
| `isSample` | boolean | – | hayır | `true`: değerler gerçek ölçüm değil, açıkça etiketlenmiş örnek senaryodur (B planı). |

Bir observation'da en az bir değer alanı dolu olmalıdır.

### `measurements.<alan>` girdisi

| Alan | Tip | Birim | Null olabilir mi | Açıklama |
| --- | --- | --- | --- | --- |
| `file` | string | – | hayır | Değerin alındığı kaynak dosyanın adı. |
| `column` | string | – | hayır | Dosyadaki sütun adı. |
| `unit` | string | – | hayır | Bu JSON'daki değerin birimi; alanın birimiyle aynı olmalı: `"Pa"`, `"%"`, `"°C"`, `"m/s"`, opaklık için `"1"` (boyutsuz). Kaynakta başka birim varsa (ör. K) değer önce dönüştürülür. |
| `uncertainty` | sayı ≥ 0 | alanın birimi | evet | Kaynağın verdiği belirsizlik (±). Yoksa `null`; uydurulmaz. |
| `quality` | string | – | evet | Kaynaktaki kalite bayrağı, olduğu gibi. Yoksa `null`. |

**Geçerlilik:** Yukarıdaki kurallardan biri bozulursa (yanlış `version`, eksik zorunlu alan, yanlış tip veya birim, dolu bir değerin `measurements` girdisinin olmaması) dosyanın tamamı geçersiz sayılır ve panel gösterilmez.

### Arayüz kuralları (Kişi 1)

**MEDA verisi geçmiş ölçümdür, güncel hava durumu değildir.**

- Panel "Current weather", "Live", "Today" gibi ifadeler kullanmaz; **"HISTORICAL"** rozeti taşır.
- Seçili ölçüm her zaman şu metinle sunulur: **"Historical MEDA data – Sol X, LMST hh:mm – not current conditions"**. `earthDate` doluysa yanında gösterilir.
- Sadece null olmayan değerler gösterilir; null bir alan için satır, "–" veya "N/A" gösterilmez.
- `sensorTempC` her zaman **"Sensor temperature (not air temperature)"** olarak etiketlenir.
- Her değerin yanında birimi ve kaynak bilgisi (dosya/sütun, belirsizlik, kalite) görünür; kaynak `source.datasets[]` linkleriyle verilir.
- `isSample: true` olan observation **"Sample"** rozetiyle ve "Sample scenario – not a measurement" notuyla gösterilir.
- **EVA uygunluk hükmü:** `opacity` veya `airTempC` yokken "EVA için uygun / dikkat" hükmü verilmez. Mevcut arayüz hiçbir durumda bu verilerden EVA hükmü üretmez; ileride eklenirse yalnızca seçilen geçmiş sol için bir senaryo değerlendirmesi olarak sunulur, bugünkü koşullar için değil.

## 8. `stops.json` (Kişi 1)

```json
[
  {
    "id": "delta-edge",
    "name": "Durak adı",
    "col": 120,
    "row": 85,
    "description": "Astronot diliyle 2–3 cümle",
    "whyImportant": "Bilimsel önemi",
    "sourceUrl": "https://...",
    "photo": { "file": "photos/xxx.jpg", "sol": 0, "camera": "Kamera adı", "imageId": "Görüntü kimliği", "url": "https://..." }
  }
]
```

---

## 9. Rota motoru API (`frontend/src/routing/`)

Kişi 1 sadece `frontend/src/routing/index.ts` dosyasının dışa aktardıklarını kullanır. İç yapı Kişi 2'nindir.

```ts
// frontend/src/routing/types.ts
export interface Grid {
  version: number;
  width: number;
  height: number;
  cellSize: number;          // metre
  nodata: number;
  elevation: number[];       // metre, row-major
  slope: number[];           // derece
  roughness: number[];       // metre
  stats: { elevationMin: number; elevationMax: number; slopeMax: number; roughnessP95: number };
}

export interface Cell { col: number; row: number }

export interface RouteOptions {
  wDistance: number;    // α (> 0; en az MIN_DISTANCE_WEIGHT = 0.1, sıfır olamaz)
  wSlope: number;       // β (≥ 0)
  wRoughness: number;   // γ (≥ 0)
  maxSlopeDeg: number;  // bu eğimin üstündeki hücre geçilmez
}

export interface ProfilePoint { distanceM: number; elevationM: number; slopeDeg: number }

export interface RouteResult {
  ok: boolean;
  reason?: 'unreachable' | 'start-blocked' | 'goal-blocked' | 'out-of-bounds' | 'invalid-input';
  path: Cell[];             // başlangıç ve hedef dahil
  distanceM: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;      // mesafe ağırlıklı ortalama (Bölüm 9, Hesap kuralları)
  durationMin: number;        // gidiş süresi: başlangıç → hedef, Tobler × skafandr katsayısı
  returnDurationMin: number;  // dönüş süresi: aynı yol ters yönde (hedef → başlangıç), ayrı Tobler hesabı
  profile: ProfilePoint[];
}

export interface Alternatives {
  shortest: RouteResult;    // β = γ = 0
  safest: RouteResult;      // β ve γ yüksek
  balanced: RouteResult;    // kullanıcının ayarları
  recommended: 'shortest' | 'safest' | 'balanced' | null;  // null: hiçbir rota bulunamadı
  reason: string;           // tek cümle, ör. "400 m daha uzun ama dik yamaçtan kaçınıyor"
}

export interface EvaProfile {
  maxEvaMinutes: number;
  researchMinutes: number;
  safetyMarginPct: number;
}

export interface EvaCheck {
  outboundMin: number;       // = route.durationMin
  researchMin: number;
  returnMin: number;         // = route.returnDurationMin (gidişle aynı varsayılmaz)
  totalMin: number;
  limitMin: number;          // maxEvaMinutes × (1 − safetyMarginPct / 100)
  withinLimit: boolean;
  pointOfNoReturnIndex?: number;  // sadece withinLimit = false iken; tanım Bölüm 9
}
```

```ts
// frontend/src/routing/index.ts
export function findRoute(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): RouteResult;
export function findAlternatives(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): Alternatives;
export function checkEva(route: RouteResult, profile: EvaProfile): EvaCheck;
export { DEFAULT_OPTIONS, DEFAULT_EVA_PROFILE, SUIT_FACTOR, MIN_DISTANCE_WEIGHT } from './config';
```

### Hesap kuralları

- Komşuluk: 8 yönlü; çapraz adım mesafesi `√2 × cellSize`.
- **Köşe kesme yasağı:** Çapraz adıma sadece iki yan komşu hücrenin **ikisi de** geçilebilirse izin verilir. Örnek: (c, r) → (c+1, r+1) için hem (c+1, r) hem (c, r+1) geçilebilir olmalı. Böylece rota, iki engelli hücrenin köşesinden "sızamaz".
- Kenar maliyeti: `d × (α + β·S + γ·H)`; `S = slope / maxSlopeDeg` (0–1), `H = min(roughness / stats.roughnessP95, 1)`. Kenarın S ve H değeri iki hücrenin ortalamasıdır (iki hücre de geçilebilir olduğu için `nodata` bu ortalamaya hiç girmez).
- **Sıfıra bölme koruması:** `stats.roughnessP95 ≤ 0.001` ise (tamamen düz arazi) bütün hücrelerde `H = 0` kabul edilir. Hiçbir koşulda `NaN` veya `Infinity` maliyet üretilmez.
- `slope > maxSlopeDeg` veya `nodata` olan hücre geçilmez.
- Heuristic: hedefe düz mesafe × α.
- **Ağırlık doğrulaması:** `wDistance` en az `MIN_DISTANCE_WEIGHT` (0.1) olur; daha küçük bir değer gelirse bu değere yükseltilir. Böylece üç ağırlık aynı anda sıfır olamaz ve heuristic anlamlı kalır. `wSlope` ve `wRoughness` sıfır olabilir (en kısa rota). Negatif ağırlık kabul edilmez. Arayüzde mesafe kaydırıcısının alt sınırı 0.1'dir (Kişi 1).
- Süre: her adımda Tobler hızı `W = 6 · e^(−3.5 · |tan θ + 0.05|)` km/sa (θ: adımın yön eğimi, yokuş yukarı pozitif) × `SUIT_FACTOR`.
- **Gidiş ve dönüş ayrı hesaplanır:** Tobler yöne bağlıdır (aynı yamaç inişte hızlı, çıkışta yavaş). `durationMin` yol başlangıçtan hedefe izlenerek, `returnDurationMin` aynı yol ters sırayla (θ işareti ters) izlenerek hesaplanır. Dönüş için ayrıca A* çalıştırılmaz; astronot aynı yoldan döner.
- Hedefe ulaşılamazsa hata fırlatılmaz; `ok: false` ve `reason` döner.
- **`reason` değerlerinin anlamı:**

| `reason` | Ne zaman | Arayüzde nasıl gösterilir (Kişi 1) |
| --- | --- | --- |
| `invalid-input` | Girdi geçersiz: ızgara Bölüm 3 formatına uymuyor, `start`/`goal` tam sayı değil, ağırlıklardan biri negatif veya sayı değil (`NaN`/`Infinity`), `maxSlopeDeg ≤ 0` veya sayı değil | Bir program/veri hatası olarak: "Route could not be computed (invalid input)". Arazi hakkında bir şey söylemez |
| `out-of-bounds` | Girdi geçerli, ama `start` veya `goal` ızgaranın dışında | "Point is outside the study area" |
| `start-blocked` | Başlangıç hücresi geçilemez (nodata veya `maxSlopeDeg` üstü) | "Habitat cell is not passable" |
| `goal-blocked` | Hedef hücresi geçilemez | "Target cell is not passable" |
| `unreachable` | Girdi geçerli, iki uç da geçilebilir ama aralarında `maxSlopeDeg` sınırına uyan bir yol yok | Arazi gerçeği olarak: "No safe route within the slope limit" |

  Kontrol sırası: önce `invalid-input`, sonra `out-of-bounds`, sonra `start-blocked` / `goal-blocked`, en son arama (`unreachable`). `wDistance` değerinin `MIN_DISTANCE_WEIGHT`'ın altında olması `invalid-input` değildir; bu değere yükseltilir.
- **`maxSlopeDeg` ve `meanSlopeDeg`:**
  - `maxSlopeDeg` = yoldaki hücrelerin `slope` değerlerinin en büyüğü.
  - `meanSlopeDeg` = **mesafe ağırlıklı ortalama**: her adımın (kenarın) eğimi, iki uç hücrenin `slope` ortalamasıdır; `meanSlopeDeg = Σ(kenar eğimi × kenar uzunluğu) / Σ(kenar uzunluğu)`. Çapraz adımlar (√2 × cellSize) düz adımlardan daha fazla ağırlık taşır.
  - Yol tek hücreyse (`start = goal`): `distanceM = 0`, `maxSlopeDeg = meanSlopeDeg` = o hücrenin eğimi, süreler 0.
- **Alternatif rotalar ve öneri (`findAlternatives`):**
  - `recommended` **sadece `ok: true` olan** bir rotayı gösterebilir.
  - Üç rotadan hiçbiri `ok: true` değilse `recommended: null` olur ve `reason`, `balanced` rotanın başarısızlık sebebini insan diliyle açıklar (ör. "No safe route within the slope limit").
  - Arayüz (Kişi 1) `recommended === null` iken hiçbir rotayı "önerilen" diye göstermez, rota çizmez ve sadece bu açıklamayı gösterir.
- **EVA kontrolü ve geri dönüş noktası (`checkEva`):**
  - `limitMin = maxEvaMinutes × (1 − safetyMarginPct / 100)`; `totalMin = outboundMin + researchMin + returnMin`; `withinLimit = totalMin ≤ limitMin`.
  - Yol üzerindeki her `i` indeksi için: `t_out(i)` = başlangıçtan `path[i]`'ye kadar gidiş süresi (Tobler, gidiş yönü); `t_back(i)` = `path[i]`'den başlangıca aynı yolu ters izleyerek dönüş süresi (Tobler, dönüş yönü). İkisi de `SUIT_FACTOR` dahil, dakika.
  - **`pointOfNoReturnIndex`** = `t_out(i) + t_back(i) ≤ limitMin` koşulunu sağlayan **en büyük `i`**. Yani astronotun limit içinde habitata geri dönebileceği en uzak nokta; bu noktayı geçerse zamanında dönemez.
  - Sadece `withinLimit = false` iken doldurulur; `withinLimit = true` ise `undefined` kalır. `i = 0` (habitat) her zaman koşulu sağlar, bu yüzden değer en az 0'dır.
  - Araştırma süresi (`researchMinutes`) hedefte harcandığı için `pointOfNoReturnIndex` hesabına girmez; sadece `totalMin` içinde sayılır.
  - Arayüz (Kişi 1) bu noktayı haritada rota üzerinde "Point of no return" işaretiyle gösterir.

### Senaryo parametreleri (`frontend/src/routing/config.ts`, Kişi 2)

Bunlar NASA onaylı model değil, bizim senaryo varsayımlarımızdır; arayüzde "senaryo" etiketiyle gösterilir.

```ts
export const DEFAULT_OPTIONS = { wDistance: 1, wSlope: 3, wRoughness: 2, maxSlopeDeg: 25 };
export const MIN_DISTANCE_WEIGHT = 0.1;
export const SUIT_FACTOR = 0.6;
export const DEFAULT_EVA_PROFILE = { maxEvaMinutes: 240, researchMinutes: 30, safetyMarginPct: 20 };
```

Kişi 2 bu varsayılanları ayarlayabilir; değiştirirse gruba haber verir.

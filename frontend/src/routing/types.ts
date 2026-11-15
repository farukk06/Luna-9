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
  meanSlopeDeg: number;     // distance-weighted mean of edge endpoint slopes
  durationMin: number;        // gidiş süresi: başlangıç → hedef, Tobler × skafandr katsayısı
  returnDurationMin: number;  // dönüş süresi: aynı yol ters yönde (hedef → başlangıç), ayrı Tobler hesabı
  profile: ProfilePoint[];
}

export interface Alternatives {
  shortest: RouteResult;    // β = γ = 0
  safest: RouteResult;      // β ve γ yüksek
  balanced: RouteResult;    // kullanıcının ayarları
  recommended: 'shortest' | 'safest' | 'balanced' | null;
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
  pointOfNoReturnIndex?: number;  // path içindeki indeks; limit aşılıyorsa
}

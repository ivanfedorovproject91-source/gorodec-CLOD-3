export type PathType = 'road' | 'highway' | 'rail' | 'pedestrian';
export type PathMode = 'ground' | 'elevated' | 'bridge' | 'tunnel';
export type PathPresetId =
  | 'road' | 'highway' | 'flyover' | 'bridge' | 'tunnel'
  | 'rail' | 'railElevated' | 'railBridge' | 'pedestrian';

export interface PathPoint { x: number; y: number }

/**
 * Дорога / рельсы / дорожка — редактируемая ломаная в плоскости вида сбоку.
 * Точки задают линию верхнего края полотна (x — вдоль, y — высота над землёй).
 * Ширина (глубина) = полосы × ширина полосы, видна как верхняя грань полотна.
 */
export interface PathParams {
  type: PathType;
  mode: PathMode;
  points: PathPoint[];
  /** Полосы движения (для рельсов — число путей) */
  lanes: number;
  laneWidth: number;
  /** Толщина полотна */
  thickness: number;
  /** Плавная кривая через точки */
  curved: boolean;
  /** Опоры (для эстакад и мостов) */
  supports: boolean;
}

export const PATH_OPTIONS = {
  type: [
    { value: 'road', label: 'Дорога' },
    { value: 'highway', label: 'Шоссе' },
    { value: 'rail', label: 'Железная дорога' },
    { value: 'pedestrian', label: 'Пешеходная' },
  ] as { value: PathType; label: string }[],
  mode: [
    { value: 'ground', label: 'По земле' },
    { value: 'elevated', label: 'Эстакада' },
    { value: 'bridge', label: 'Мост' },
    { value: 'tunnel', label: 'Тоннель' },
  ] as { value: PathMode; label: string }[],
};

export const PATH_PRESETS: Record<PathPresetId, { label: string; params: Omit<PathParams, 'points'> }> = {
  road: { label: 'Дорога', params: { type: 'road', mode: 'ground', lanes: 2, laneWidth: 35, thickness: 6, curved: false, supports: true } },
  highway: { label: 'Шоссе', params: { type: 'highway', mode: 'ground', lanes: 4, laneWidth: 37, thickness: 8, curved: false, supports: true } },
  flyover: { label: 'Эстакада', params: { type: 'road', mode: 'elevated', lanes: 2, laneWidth: 35, thickness: 14, curved: false, supports: true } },
  bridge: { label: 'Мост', params: { type: 'road', mode: 'bridge', lanes: 4, laneWidth: 35, thickness: 18, curved: false, supports: true } },
  tunnel: { label: 'Тоннель', params: { type: 'road', mode: 'tunnel', lanes: 2, laneWidth: 35, thickness: 10, curved: false, supports: false } },
  rail: { label: 'Железная дорога', params: { type: 'rail', mode: 'ground', lanes: 1, laneWidth: 50, thickness: 5, curved: false, supports: true } },
  railElevated: { label: 'Ж/д эстакада', params: { type: 'rail', mode: 'elevated', lanes: 1, laneWidth: 50, thickness: 16, curved: false, supports: true } },
  railBridge: { label: 'Ж/д мост', params: { type: 'rail', mode: 'bridge', lanes: 2, laneWidth: 50, thickness: 18, curved: false, supports: true } },
  pedestrian: { label: 'Пешеходная дорожка', params: { type: 'pedestrian', mode: 'ground', lanes: 1, laneWidth: 25, thickness: 4, curved: false, supports: true } },
};

export const isPathPreset = (k: string): k is PathPresetId => k in PATH_PRESETS;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pick = <T extends string>(v: unknown, list: { value: T }[], d: T): T =>
  list.some((o) => o.value === v) ? (v as T) : d;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Проверка параметров пути. Возвращает null, если нет хотя бы двух корректных точек. */
export function sanitizePath(raw: unknown, fb: Omit<PathParams, 'points'> = PATH_PRESETS.road.params): PathParams | null {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const points: PathPoint[] = [];
  if (Array.isArray(a.points)) {
    for (const q of a.points.slice(0, 2000)) {
      const o = q as { x?: unknown; y?: unknown } | null;
      if (o && typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x) && Number.isFinite(o.y)) {
        points.push({ x: o.x, y: o.y });
      }
    }
  }
  if (points.length < 2) return null;
  return {
    type: pick(a.type, PATH_OPTIONS.type, fb.type),
    mode: pick(a.mode, PATH_OPTIONS.mode, fb.mode),
    points,
    lanes: clamp(Math.round(num(a.lanes, fb.lanes)), 1, 12),
    laneWidth: clamp(Math.round(num(a.laneWidth, fb.laneWidth)), 10, 80),
    thickness: clamp(Math.round(num(a.thickness, fb.thickness)), 2, 80),
    curved: typeof a.curved === 'boolean' ? a.curved : fb.curved,
    supports: typeof a.supports === 'boolean' ? a.supports : fb.supports,
  };
}

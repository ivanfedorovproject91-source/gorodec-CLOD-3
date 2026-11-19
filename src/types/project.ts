import { MIN_BUILDING_W, heightOf, sanitizeBuilding } from './building';
import type { BuildingParams } from './building';
import { sanitizePath } from './path';
import type { PathParams } from './path';
import { updatePathBounds } from '../engine/pathModel';

export interface GridSettings {
  visible: boolean;
  /** Шаг сетки в мировых единицах (1 ед. = 10 см; 10 ед. = 1 м) */
  size: number;
  snap: boolean;
}

export interface CameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

/** Объект мира. x,y — левый нижний угол (мир: Y вверх), единицы: 1 ед. = 10 см. */
export interface SceneObject {
  id: string;
  kind: 'block' | 'building' | 'path';
  /** Только для kind === 'building'. Высота h всегда = этажи*высота этажа + крыша. */
  building?: BuildingParams;
  /** Только для kind === 'path' (дороги, рельсы). x, y, w, h — вычисляемые габариты. */
  path?: PathParams;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
}

export interface ProjectData {
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  camera: CameraSnapshot;
  grid: GridSettings;
  objects: SceneObject[];
}

export const GRID_SIZES = [10, 50, 100] as const;
export const DEFAULT_GRID: GridSettings = { visible: true, size: 10, snap: true };
export const DEFAULT_CAMERA: CameraSnapshot = { x: 0, y: 120, zoom: 1 };
export const PROJECT_KEY = 'current';

export function createProject(): ProjectData {
  const now = Date.now();
  return {
    formatVersion: 1,
    id: PROJECT_KEY,
    name: 'Новый город',
    createdAt: now,
    updatedAt: now,
    camera: { ...DEFAULT_CAMERA },
    grid: { ...DEFAULT_GRID },
    objects: [],
  };
}

const num = (v: unknown, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;

/** Проверка и нормализация данных (загрузка из IndexedDB / импорт JSON) */
export function parseProject(raw: unknown): ProjectData {
  if (!raw || typeof raw !== 'object') throw new Error('Неверный формат файла');
  const o = raw as any;
  if (o.formatVersion !== 1) throw new Error('Неподдерживаемая версия проекта');
  const base = createProject();
  return {
    formatVersion: 1,
    id: PROJECT_KEY,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.slice(0, 80) : base.name,
    createdAt: num(o.createdAt, base.createdAt),
    updatedAt: num(o.updatedAt, base.updatedAt),
    camera: {
      x: num(o.camera?.x, DEFAULT_CAMERA.x),
      y: num(o.camera?.y, DEFAULT_CAMERA.y),
      zoom: num(o.camera?.zoom, DEFAULT_CAMERA.zoom),
    },
    grid: {
      visible: o.grid?.visible !== false,
      size: (GRID_SIZES as readonly number[]).includes(o.grid?.size) ? o.grid.size : 10,
      snap: o.grid?.snap !== false,
    },
    objects: parseObjects(o.objects),
  };
}

function parseObjects(v: unknown): SceneObject[] {
  if (!Array.isArray(v)) return [];
  const out: SceneObject[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const a = item as any;
    const ok = ['x', 'y', 'w', 'h'].every((k) => typeof a[k] === 'number' && Number.isFinite(a[k]));
    if (typeof a.id !== 'string') continue;
    const name = typeof a.name === 'string' ? a.name.slice(0, 60) : undefined;
    if (a.kind === 'path') {
      const path = sanitizePath(a.path);
      if (!path) continue;
      const obj: SceneObject = { id: a.id, kind: 'path', x: 0, y: 0, w: 1, h: 1, path, name };
      updatePathBounds(obj);
      out.push(obj);
      continue;
    }
    if (!ok || a.w <= 0 || a.h <= 0) continue;
    if (a.kind === 'building') {
      const b = sanitizeBuilding(a.building);
      out.push({ id: a.id, kind: 'building', x: a.x, y: a.y, w: Math.max(MIN_BUILDING_W, a.w), h: heightOf(b), building: b, name });
    } else {
      out.push({ id: a.id, kind: 'block', x: a.x, y: a.y, w: a.w, h: a.h, name });
    }
  }
  return out;
}

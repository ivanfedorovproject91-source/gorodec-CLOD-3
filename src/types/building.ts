export type Facade = 'punched' | 'ribbon' | 'curtain' | 'industrial';
export type RoofType = 'flat' | 'gable' | 'shed' | 'stepped';
export type DoorType = 'none' | 'single' | 'double' | 'gate';
export type DoorPos = 'left' | 'center' | 'right';
export type Material = 'concrete' | 'graphite' | 'stone' | 'glass';
export type PresetId = 'residential' | 'office' | 'tower' | 'industrial';

/** Параметры процедурного здания. Длины — в мировых единицах (1 ед. = 10 см). */
export interface BuildingParams {
  facade: Facade;
  floors: number;
  floorHeight: number;
  /** Целевая ширина фасадного модуля (шаг окон). Реальная ширина подгоняется под ширину здания. */
  bayWidth: number;
  /** Глубина здания (визуальная боковая грань) */
  depth: number;
  roof: RoofType;
  door: DoorType;
  doorPos: DoorPos;
  material: Material;
  balconies: boolean;
}

export const OPTIONS = {
  facade: [
    { value: 'punched', label: 'Оконный' },
    { value: 'ribbon', label: 'Ленточный' },
    { value: 'curtain', label: 'Витражный' },
    { value: 'industrial', label: 'Промышленный' },
  ] as { value: Facade; label: string }[],
  roof: [
    { value: 'flat', label: 'Плоская' },
    { value: 'gable', label: 'Двускатная' },
    { value: 'shed', label: 'Односкатная' },
    { value: 'stepped', label: 'Ступенчатая' },
  ] as { value: RoofType; label: string }[],
  door: [
    { value: 'none', label: 'Нет' },
    { value: 'single', label: 'Одинарная' },
    { value: 'double', label: 'Двойная' },
    { value: 'gate', label: 'Ворота' },
  ] as { value: DoorType; label: string }[],
  doorPos: [
    { value: 'left', label: 'Слева' },
    { value: 'center', label: 'По центру' },
    { value: 'right', label: 'Справа' },
  ] as { value: DoorPos; label: string }[],
  material: [
    { value: 'concrete', label: 'Бетон' },
    { value: 'graphite', label: 'Графит' },
    { value: 'stone', label: 'Светлый камень' },
    { value: 'glass', label: 'Стекло' },
  ] as { value: Material; label: string }[],
};

export const PRESETS: Record<PresetId, { label: string; defaultW: number; params: BuildingParams }> = {
  residential: {
    label: 'Жилой дом', defaultW: 160,
    params: { facade: 'punched', floors: 5, floorHeight: 30, bayWidth: 36, depth: 80, roof: 'gable', door: 'single', doorPos: 'center', material: 'stone', balconies: true },
  },
  office: {
    label: 'Офисное здание', defaultW: 240,
    params: { facade: 'ribbon', floors: 8, floorHeight: 38, bayWidth: 50, depth: 100, roof: 'flat', door: 'double', doorPos: 'center', material: 'concrete', balconies: false },
  },
  tower: {
    label: 'Небоскрёб', defaultW: 160,
    params: { facade: 'curtain', floors: 30, floorHeight: 38, bayWidth: 30, depth: 100, roof: 'stepped', door: 'double', doorPos: 'center', material: 'glass', balconies: false },
  },
  industrial: {
    label: 'Завод / склад', defaultW: 400,
    params: { facade: 'industrial', floors: 2, floorHeight: 60, bayWidth: 80, depth: 200, roof: 'shed', door: 'gate', doorPos: 'left', material: 'graphite', balconies: false },
  },
};

export const MIN_BUILDING_W = 40;
export const MAX_FLOORS = 200;

const ROOF_HEIGHT: Record<RoofType, number> = { flat: 8, gable: 40, shed: 30, stepped: 60 };
export const roofHeightFor = (r: RoofType): number => ROOF_HEIGHT[r];

/** Полная высота здания = этажи + крыша */
export const heightOf = (b: BuildingParams): number => b.floors * b.floorHeight + roofHeightFor(b.roof);

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pick = <T extends string>(v: unknown, list: { value: T }[], d: T): T =>
  list.some((o) => o.value === v) ? (v as T) : d;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Проверка и приведение параметров к допустимым значениям (импорт, загрузка, инспектор) */
export function sanitizeBuilding(raw: unknown, fb: BuildingParams = PRESETS.residential.params): BuildingParams {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    facade: pick(a.facade, OPTIONS.facade, fb.facade),
    floors: clamp(Math.round(num(a.floors, fb.floors)), 1, MAX_FLOORS),
    floorHeight: clamp(Math.round(num(a.floorHeight, fb.floorHeight)), 20, 80),
    bayWidth: clamp(Math.round(num(a.bayWidth, fb.bayWidth)), 20, 200),
    depth: clamp(Math.round(num(a.depth, fb.depth)), 0, 400),
    roof: pick(a.roof, OPTIONS.roof, fb.roof),
    door: pick(a.door, OPTIONS.door, fb.door),
    doorPos: pick(a.doorPos, OPTIONS.doorPos, fb.doorPos),
    material: pick(a.material, OPTIONS.material, fb.material),
    balconies: typeof a.balconies === 'boolean' ? a.balconies : fb.balconies,
  };
}

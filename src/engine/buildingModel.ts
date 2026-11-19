import type { SceneObject } from '../types/project';
import { MAX_FLOORS, heightOf, roofHeightFor, sanitizeBuilding } from '../types/building';
import type { BuildingParams } from '../types/building';

/**
 * Подгонка высоты здания под целое число этажей.
 * anchor 'bottom' — низ остаётся на месте (тянем верх), 'top' — верх остаётся (тянем низ).
 */
export function fitHeight(o: SceneObject, anchor: 'bottom' | 'top'): void {
  const b = o.building;
  if (!b) return;
  const rh = roofHeightFor(b.roof);
  const floors = Math.min(MAX_FLOORS, Math.max(1, Math.round((o.h - rh) / b.floorHeight)));
  b.floors = floors;
  const nh = heightOf(b);
  if (anchor === 'top') o.y = o.y + o.h - nh;
  o.h = nh;
}

/** Изменение параметров здания (инспектор): проверка значений и пересчёт высоты, низ на месте */
export function applyBuildingPatch(o: SceneObject, patch: Partial<BuildingParams>): void {
  if (!o.building) return;
  const merged = sanitizeBuilding({ ...o.building, ...patch }, o.building);
  o.building = merged;
  o.h = heightOf(merged);
}

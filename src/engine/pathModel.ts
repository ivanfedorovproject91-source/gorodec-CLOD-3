import type { SceneObject } from '../types/project';
import type { PathParams } from '../types/path';
import type { Scene } from './Scene';
import { DEPTH_K, SKEW } from './projection';

export type Pt = { x: number; y: number };
export interface Junction { x: number; y: number; width: number }

const SEG = 10; // отрезков на пролёт при сглаживании
const cache = new Map<string, { sig: string; pts: Pt[] }>();

export const pathWidth = (p: PathParams): number => p.lanes * p.laneWidth;
export const deckThickness = (p: PathParams): number =>
  p.mode === 'bridge' ? Math.round(p.thickness * 1.6) : p.thickness;

const signature = (p: PathParams): string => {
  let s = p.curved ? 'c' : 'l';
  for (const q of p.points) s += q.x + ',' + q.y + ';';
  return s;
};

function catmull(P: Pt[]): Pt[] {
  const out: Pt[] = [{ x: P[0].x, y: P[0].y }];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 1; k <= SEG; k++) {
      const t = k / SEG, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Точки линии с учётом сглаживания (кэшируются по id и содержимому) */
export function sampledPoints(o: SceneObject): Pt[] {
  const p = o.path;
  if (!p) return [];
  const sig = signature(p);
  const c = cache.get(o.id);
  if (c && c.sig === sig) return c.pts;
  const pts = p.curved && p.points.length > 2 ? catmull(p.points) : p.points.map((q) => ({ x: q.x, y: q.y }));
  if (cache.size > 5000) cache.clear();
  cache.set(o.id, { sig, pts });
  return pts;
}

/** Пересчёт габаритов объекта (для индекса, отсечения и сохранения) по точкам пути */
export function updatePathBounds(o: SceneObject): void {
  const p = o.path;
  if (!p) return;
  const pts = sampledPoints(o);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  const t = deckThickness(p);
  const piers = p.supports && (p.mode === 'elevated' || p.mode === 'bridge');
  let bottom = minY - t - 4;
  if (piers) bottom = Math.min(bottom, 0);
  const top = maxY + (p.mode === 'tunnel' ? 60 : 20);
  o.x = minX - 4;
  o.w = Math.max(8, maxX - minX + 8);
  o.y = bottom;
  o.h = Math.max(8, top - bottom);
}

export function pathLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return l;
}

/** Обход линии с шагом step по длине дуги; cb получает точку и единичную касательную */
export function walk(
  pts: Pt[], step: number, cb: (x: number, y: number, tx: number, ty: number) => void, start = 0,
): void {
  if (step <= 0) return;
  let next = start;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      cb(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, (b.x - a.x) / len, (b.y - a.y) / len);
      next += step;
    }
    acc += len;
  }
}

export function closestOnSeg(px: number, py: number, a: Pt, b: Pt): { x: number; y: number; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t;
  return { x, y, d: Math.hypot(px - x, py - y) };
}

/** Попадание точки в полотно (линия + толщина вниз + верхняя грань вверх) */
export function hitPath(o: SceneObject, wx: number, wy: number, pad: number): boolean {
  const p = o.path;
  if (!p) return false;
  const t = deckThickness(p);
  const dy = pathWidth(p) * DEPTH_K * SKEW;
  const tol = (t + dy) / 2 + pad;
  if (wx < o.x - tol || wx > o.x + o.w + tol) return false;
  const cy = (dy - t) / 2;
  const pts = sampledPoints(o);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = { x: pts[i].x, y: pts[i].y + cy };
    const b = { x: pts[i + 1].x, y: pts[i + 1].y + cy };
    if (closestOnSeg(wx, wy, a, b).d <= tol) return true;
  }
  return false;
}

/** Привязка к сети: сначала к точкам других путей, затем к их отрезкам */
export function snapToNetwork(scene: Scene, w: Pt, zoom: number, excludeId?: string): Pt | null {
  const r = 12 / zoom;
  const list = scene.visible(w.x - r, w.x + r).filter(
    (o) => o.path && o.id !== excludeId && w.x >= o.x - r && w.x <= o.x + o.w + r && w.y >= o.y - r && w.y <= o.y + o.h + r,
  );
  let best: { x: number; y: number; d: number } | null = null;
  for (const o of list) {
    for (const q of o.path!.points) {
      const d = Math.hypot(w.x - q.x, w.y - q.y);
      if (d <= r && (!best || d < best.d)) best = { x: q.x, y: q.y, d };
    }
  }
  if (best) return { x: best.x, y: best.y };
  for (const o of list) {
    const pts = sampledPoints(o);
    for (let i = 0; i < pts.length - 1; i++) {
      const c = closestOnSeg(w.x, w.y, pts[i], pts[i + 1]);
      if (c.d <= r * 0.7 && (!best || c.d < best.d)) best = c;
    }
  }
  return best ? { x: Math.round(best.x * 10) / 10, y: Math.round(best.y * 10) / 10 } : null;
}

/**
 * Перекрёстки: конец пути, лежащий на внутренней части другого пути (Т-образный),
 * либо сходятся три и более конца в одной точке.
 */
export function findJunctions(objs: SceneObject[]): Junction[] {
  const roads = objs.filter((o) => o.path && o.path.type !== 'rail');
  if (roads.length < 2) return [];
  const out = new Map<string, Junction>();
  const TOL = 2;
  for (const o of roads) {
    const P = o.path!;
    const ends = [P.points[0], P.points[P.points.length - 1]];
    for (const e of ends) {
      let touch = false;
      let coincident = 0;
      let width = pathWidth(P);
      for (const q of roads) {
        if (q === o) continue;
        const Q = q.path!;
        const sp = sampledPoints(q);
        const q0 = Q.points[0], q1 = Q.points[Q.points.length - 1];
        for (let i = 0; i < sp.length - 1; i++) {
          const c = closestOnSeg(e.x, e.y, sp[i], sp[i + 1]);
          if (c.d > TOL) continue;
          width = Math.max(width, pathWidth(Q));
          if (Math.hypot(e.x - q0.x, e.y - q0.y) <= TOL || Math.hypot(e.x - q1.x, e.y - q1.y) <= TOL) coincident++;
          else touch = true;
          break;
        }
      }
      if (touch || coincident >= 2) {
        out.set(Math.round(e.x) + ',' + Math.round(e.y), { x: e.x, y: e.y, width });
      }
    }
  }
  return Array.from(out.values());
}

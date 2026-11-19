import type { Graphics } from 'pixi.js';
import type { Camera } from './Camera';
import type { SceneObject } from '../types/project';
import type { PathType } from '../types/path';
import { DEPTH_K, SKEW } from './projection';
import { deckThickness, pathLength, pathWidth, sampledPoints, walk } from './pathModel';
import type { Junction, Pt } from './pathModel';

interface Pal { top: number; front: number; mark: number; side: number }

const PAL: Record<PathType, Pal> = {
  road: { top: 0x34373b, front: 0x8a8e92, mark: 0xe6e8ea, side: 0x62666a },
  highway: { top: 0x2b2e32, front: 0x7d8185, mark: 0xe6e8ea, side: 0x5a5e62 },
  rail: { top: 0x6b6f73, front: 0x777b7f, mark: 0xcfd2d4, side: 0x55595d },
  pedestrian: { top: 0xa7abae, front: 0x8a8e92, mark: 0xe6e8ea, side: 0x6d7175 },
};
const PIER_FRONT = 0x7a7e82;
const PIER_SIDE = 0x5d6165;
const TUNNEL = 0x1c1e21;
const MAX_STEPS = 3000;

/**
 * Отрисовка пути (дорога, шоссе, рельсы, дорожка) в виде сбоку:
 * полотно с толщиной (передняя грань), верхняя грань со смещением по глубине
 * (разметка, пути, шпалы), опоры эстакад и мостов, ферма моста, тоннель.
 */
export function drawPath(g: Graphics, o: SceneObject, cam: Camera): void {
  const p = o.path;
  if (!p) return;
  const pts = sampledPoints(o);
  if (pts.length < 2) return;
  const z = cam.zoom;
  const ox = cam.viewW / 2 - cam.x * z;
  const oy = cam.viewH / 2 + cam.y * z;
  const X = (wx: number) => wx * z + ox;
  const Y = (wy: number) => oy - wy * z;

  const pal = PAL[p.type];
  const t = deckThickness(p);
  const width = pathWidth(p);
  const d = width * DEPTH_K;
  const dy = d * SKEW;
  const len = pathLength(pts);
  const tunnel = p.mode === 'tunnel';
  const alpha = tunnel ? 0.85 : 1;
  const raw = p.points;

  // полоса между линией, смещённой на (xa, ya), и линией, смещённой на (xb, yb)
  const strip = (xa: number, ya: number, xb: number, yb: number): number[] => {
    const out: number[] = [];
    for (const q of pts) out.push(X(q.x + xa), Y(q.y + ya));
    for (let i = pts.length - 1; i >= 0; i--) out.push(X(pts[i].x + xb), Y(pts[i].y + yb));
    return out;
  };
  const fillPoly = (arr: number[], color: number, a = 1) => {
    g.poly(arr).fill({ color, alpha: a });
  };
  const polyline = (xo: number, yo: number, color: number, a: number, w = 1) => {
    g.moveTo(X(pts[0].x + xo), Y(pts[0].y + yo));
    for (let i = 1; i < pts.length; i++) g.lineTo(X(pts[i].x + xo), Y(pts[i].y + yo));
    g.stroke({ width: w, color, alpha: a });
  };

  // --- тоннель: тёмная оболочка над полотном ---
  if (tunnel) {
    fillPoly(strip(0, 55, 0, -t), TUNNEL, 0.35);
    polyline(0, 55, TUNNEL, 0.6, 1.5);
    polyline(0, -t, TUNNEL, 0.6, 1.5);
    for (const e of [raw[0], raw[raw.length - 1]]) {
      g.moveTo(X(e.x), Y(e.y - t)).lineTo(X(e.x), Y(e.y + 55));
      g.stroke({ width: 3, color: TUNNEL, alpha: 0.8 });
    }
  }

  // --- опоры эстакад и мостов ---
  if ((p.mode === 'elevated' || p.mode === 'bridge') && p.supports) {
    const spacing = p.mode === 'bridge' ? 800 : 400;
    const pw = p.mode === 'bridge' ? 18 : 12;
    if (spacing * z >= 6 && len / spacing < 600) {
      const list: Pt[] = [raw[0], raw[raw.length - 1]];
      walk(pts, spacing, (x, y) => list.push({ x, y }), spacing);
      const sides: number[][] = [];
      for (const q of list) {
        const top = q.y - t;
        if (top <= 2) continue;
        g.rect(X(q.x - pw / 2), Y(top), pw * z, top * z);
        sides.push([
          X(q.x + pw / 2), Y(0), X(q.x + pw / 2 + d * 0.8), Y(dy * 0.8),
          X(q.x + pw / 2 + d * 0.8), Y(top + dy * 0.8), X(q.x + pw / 2), Y(top),
        ]);
      }
      g.fill(PIER_FRONT);
      for (const s of sides) g.poly(s).fill(PIER_SIDE);
    }
  }

  // --- полотно: передняя грань и верхняя грань ---
  fillPoly(strip(0, 0, 0, -t), pal.front, alpha);
  if (d > 0) fillPoly(strip(0, 0, d, dy), pal.top, alpha);

  // ферма моста (зигзаг в толще полотна)
  if (p.mode === 'bridge' && t * z >= 3) {
    const step = t * 1.4;
    if (len / step < MAX_STEPS) {
      const nodes: number[] = [];
      let k = 0;
      walk(pts, step, (x, y) => { nodes.push(X(x), Y(k % 2 === 0 ? y : y - t)); k++; }, 0);
      if (nodes.length >= 4) {
        g.moveTo(nodes[0], nodes[1]);
        for (let i = 2; i < nodes.length; i += 2) g.lineTo(nodes[i], nodes[i + 1]);
        g.stroke({ width: 1, color: pal.side, alpha: 0.9 });
      }
    }
  }
  // ограждение
  if (p.mode === 'elevated' || p.mode === 'bridge' || p.type === 'pedestrian') {
    if (d * z >= 2) polyline(0, 9, pal.side, 0.8, 1);
  }

  // --- разметка / пути / шпалы на верхней грани ---
  if (d * z >= 2) {
    const lineAt = (f: number, color: number, a: number, w = 1) => polyline(d * f, dy * f, color, a, w);
    const dashedAt = (f: number, color: number, a: number) => {
      const dash = 30;
      const step = 60;
      if ((len / step > MAX_STEPS) || step * z < 6) return;
      walk(pts, step, (x, y, tx, ty) => {
        g.moveTo(X(x + d * f), Y(y + dy * f)).lineTo(X(x + tx * dash + d * f), Y(y + ty * dash + dy * f));
      }, 0);
      g.stroke({ width: 1, color, alpha: a });
    };

    if (p.type === 'road' || p.type === 'highway') {
      lineAt(0.05, pal.mark, 0.7);
      lineAt(0.95, pal.mark, 0.7);
      for (let k = 1; k < p.lanes; k++) {
        const f = k / p.lanes;
        if (p.type === 'highway' && p.lanes % 2 === 0 && k === p.lanes / 2) {
          lineAt(f - 0.02, pal.mark, 0.9);
          lineAt(f + 0.02, pal.mark, 0.9);
        } else {
          dashedAt(f, pal.mark, 0.8);
        }
      }
    } else if (p.type === 'rail') {
      const half = 13 / width;
      if (12 * z >= 3 && len / 12 < 4000) {
        for (let tr = 0; tr < p.lanes; tr++) {
          const fc = (tr + 0.5) / p.lanes;
          walk(pts, 12, (x, y) => {
            g.moveTo(X(x + d * (fc - half)), Y(y + dy * (fc - half))).lineTo(X(x + d * (fc + half)), Y(y + dy * (fc + half)));
          }, 0);
        }
        g.stroke({ width: 1, color: 0x4a4d50, alpha: 0.8 });
      }
      const gauge = 7 / width;
      for (let tr = 0; tr < p.lanes; tr++) {
        const fc = (tr + 0.5) / p.lanes;
        lineAt(fc - gauge, pal.mark, 1, 1.3);
        lineAt(fc + gauge, pal.mark, 1, 1.3);
      }
    } else {
      lineAt(0.08, pal.mark, 0.6);
      lineAt(0.92, pal.mark, 0.6);
    }
  }
}

/** Перекрёстки: площадка на верхней грани с пешеходными полосами */
export function drawJunctions(g: Graphics, js: Junction[], cam: Camera): void {
  const z = cam.zoom;
  const ox = cam.viewW / 2 - cam.x * z;
  const oy = cam.viewH / 2 + cam.y * z;
  const X = (wx: number) => wx * z + ox;
  const Y = (wy: number) => oy - wy * z;
  for (const j of js) {
    const d = j.width * DEPTH_K;
    const dy = d * SKEW;
    const a = j.width / 2;
    g.poly([X(j.x - a), Y(j.y), X(j.x + a), Y(j.y), X(j.x + a + d), Y(j.y + dy), X(j.x - a + d), Y(j.y + dy)])
      .fill(0x34373b);
    if (d * z >= 3) {
      for (let i = 0; i < 5; i++) {
        const sx = j.x - a * 0.8 + i * ((a * 1.6) / 4);
        g.moveTo(X(sx), Y(j.y)).lineTo(X(sx + d), Y(j.y + dy));
      }
      g.stroke({ width: 1, color: 0xe6e8ea, alpha: 0.45 });
    }
  }
}

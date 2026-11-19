import type { Graphics } from 'pixi.js';
import type { Camera } from './Camera';
import type { SceneObject } from '../types/project';
import type { Material } from '../types/building';
import { roofHeightFor } from '../types/building';
import { DEPTH_K, SKEW } from './projection';

interface Palette { front: number; side: number; top: number; line: number; glass: number }

// Сдержанная монохромная палитра: графит, бетон, камень, холодное стекло
const MATERIALS: Record<Material, Palette> = {
  concrete: { front: 0x9ea2a6, side: 0x70757a, top: 0xb9bdc0, line: 0x55595d, glass: 0x2b3137 },
  graphite: { front: 0x4a4e53, side: 0x34373b, top: 0x5d6268, line: 0x1f2124, glass: 0x1b1e22 },
  stone: { front: 0xc3c5c6, side: 0x929597, top: 0xd9dadb, line: 0x6d7072, glass: 0x30363c },
  glass: { front: 0x7a8790, side: 0x56626a, top: 0x95a2aa, line: 0x3a444b, glass: 0x4b5961 },
};
const DOOR = 0x1c1e21;

type Rect = [number, number, number, number];

const shade = (c: number, f: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/**
 * Процедурная отрисовка здания (вид сбоку с боковой гранью).
 * Фасад строится из параметров: число модулей (пролётов) зависит от ширины,
 * число этажей — от высоты. Текстуры не растягиваются.
 */
export function drawBuilding(g: Graphics, o: SceneObject, cam: Camera): void {
  const b = o.building;
  if (!b) return;
  const z = cam.zoom;
  const ox = cam.viewW / 2 - cam.x * z;
  const oy = cam.viewH / 2 + cam.y * z;
  const X = (wx: number) => wx * z + ox;
  const Y = (wy: number) => oy - wy * z;
  const sr = (x: number, y: number, w: number, h: number): Rect => [X(x), Y(y + h), w * z, h * z];
  const rc = (r: Rect) => g.rect(r[0], r[1], r[2], r[3]);
  const fillRects = (rs: Rect[], color: number, alpha = 1) => {
    if (!rs.length) return;
    for (const r of rs) rc(r);
    g.fill({ color, alpha });
  };
  const strokeRects = (rs: Rect[], color: number, alpha: number, width = 1) => {
    if (!rs.length) return;
    for (const r of rs) rc(r);
    g.stroke({ width, color, alpha });
  };
  const lines = (segs: number[][], color: number, alpha: number, width = 1) => {
    if (!segs.length) return;
    for (const s of segs) g.moveTo(s[0], s[1]).lineTo(s[2], s[3]);
    g.stroke({ width, color, alpha });
  };
  const poly = (pts: number[], color: number) => {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(X(pts[i]), Y(pts[i + 1]));
    g.poly(out).fill(color);
  };

  const mat = MATERIALS[b.material];
  const rh = roofHeightFor(b.roof);
  const bodyH = o.h - rh;
  const d = b.depth * DEPTH_K;
  const dy = d * SKEW;
  const { x, y, w } = o;
  const topY = y + bodyH;
  const roofFront = shade(mat.front, 0.82);
  const roofSide = shade(mat.side, 0.85);
  const roofTop = shade(mat.top, 0.92);

  // --- корпус: фасад и боковая грань ---
  fillRects([sr(x, y, w, bodyH)], mat.front);
  if (d > 0) poly([x + w, y, x + w + d, y + dy, x + w + d, topY + dy, x + w, topY], mat.side);

  // --- крыша ---
  if (b.roof === 'flat') {
    fillRects([sr(x, topY, w, rh)], roofFront);
    if (d > 0) {
      poly([x + w, topY, x + w + d, topY + dy, x + w + d, topY + rh + dy, x + w, topY + rh], roofSide);
      poly([x, topY + rh, x + w, topY + rh, x + w + d, topY + rh + dy, x + d, topY + rh + dy], roofTop);
    }
  } else if (b.roof === 'gable') {
    poly([x, topY, x + w, topY, x + w / 2, topY + rh], roofFront);
    if (d > 0) poly([x + w, topY, x + w / 2, topY + rh, x + w / 2 + d, topY + rh + dy, x + w + d, topY + dy], roofSide);
  } else if (b.roof === 'shed') {
    poly([x, topY, x + w, topY, x + w, topY + rh], roofFront);
    if (d > 0) {
      poly([x, topY, x + w, topY + rh, x + w + d, topY + rh + dy, x + d, topY + dy], roofTop);
      poly([x + w, topY, x + w + d, topY + dy, x + w + d, topY + rh + dy, x + w, topY + rh], roofSide);
    }
  } else {
    // ступенчатая: три уступа
    if (d > 0) poly([x, topY, x + w, topY, x + w + d, topY + dy, x + d, topY + dy], roofTop);
    const n = 3;
    const sh = rh / n;
    for (let k = 0; k < n; k++) {
      const sw = w * (1 - 0.2 * (k + 1));
      const x0 = x + (w - sw) / 2;
      const yk = topY + k * sh;
      fillRects([sr(x0, yk, sw, sh)], roofFront);
      if (d > 0) {
        poly([x0 + sw, yk, x0 + sw + d, yk + dy, x0 + sw + d, yk + sh + dy, x0 + sw, yk + sh], roofSide);
        poly([x0, yk + sh, x0 + sw, yk + sh, x0 + sw + d, yk + sh + dy, x0 + d, yk + sh + dy], roofTop);
      }
    }
  }

  // --- детализация фасада (уровни детализации по экранному размеру) ---
  const fl = b.floorHeight;
  const m = Math.min(b.bayWidth * 0.5, w * 0.2);
  const bays = Math.max(1, Math.round((w - 2 * m) / b.bayWidth));
  const bw = (w - 2 * m) / bays; // реальная ширина модуля — подгоняется под ширину здания
  const detail = bw * z >= 3 && fl * z >= 4;

  if (fl * z >= 5) {
    const segs: number[][] = [];
    for (let f = 1; f < b.floors; f++) segs.push([X(x), Y(y + f * fl), X(x + w), Y(y + f * fl)]);
    lines(segs, mat.line, 0.35);
  }

  const doorBay = b.doorPos === 'left' ? 0 : b.doorPos === 'right' ? bays - 1 : Math.floor((bays - 1) / 2);
  const hasDoor = b.door !== 'none';

  if (detail) {
    if (b.facade === 'punched') {
      const wins: Rect[] = [];
      for (let f = 0; f < b.floors; f++) {
        for (let i = 0; i < bays; i++) {
          if (f === 0 && hasDoor && i === doorBay) continue;
          wins.push(sr(x + m + i * bw + bw * 0.25, y + f * fl + fl * 0.3, bw * 0.5, fl * 0.5));
        }
      }
      fillRects(wins, mat.glass);
      if (bw * z >= 10) strokeRects(wins, mat.line, 0.6);
      if (b.balconies && fl * z >= 8) {
        const slabs: Rect[] = [];
        const rails: Rect[] = [];
        for (let f = 1; f < b.floors; f++) {
          for (let i = 0; i < bays; i += 2) {
            const bx = x + m + i * bw + bw * 0.1;
            slabs.push(sr(bx, y + f * fl, bw * 0.8, 2.5));
            rails.push(sr(bx, y + f * fl + 2.5, bw * 0.8, 9));
          }
        }
        fillRects(slabs, mat.top);
        strokeRects(rails, mat.line, 0.7);
      }
    } else if (b.facade === 'ribbon') {
      const bands: Rect[] = [];
      for (let f = 0; f < b.floors; f++) bands.push(sr(x + m * 0.5, y + f * fl + fl * 0.28, w - m, fl * 0.45));
      fillRects(bands, mat.glass);
      if (bw * z >= 6) {
        const segs: number[][] = [];
        for (let f = 0; f < b.floors; f++) {
          for (let i = 0; i <= bays; i++) {
            const mx = x + m + i * bw;
            segs.push([X(mx), Y(y + f * fl + fl * 0.28), X(mx), Y(y + f * fl + fl * 0.73)]);
          }
        }
        lines(segs, mat.front, 1, 1.5);
      }
    } else if (b.facade === 'curtain') {
      fillRects([sr(x + 2, y + 2, w - 4, bodyH - 4)], mat.glass);
      if (bw * z >= 5) {
        const segs: number[][] = [];
        for (let i = 0; i <= bays; i++) {
          const mx = x + m + i * bw;
          segs.push([X(mx), Y(y + 2), X(mx), Y(y + bodyH - 2)]);
        }
        lines(segs, mat.line, 0.55);
      }
    } else {
      const wins: Rect[] = [];
      for (let f = 0; f < b.floors; f++) {
        for (let i = 0; i < bays; i++) wins.push(sr(x + m + i * bw + bw * 0.15, y + f * fl + fl * 0.62, bw * 0.7, fl * 0.2));
      }
      fillRects(wins, mat.glass);
      if (bw * z >= 6) {
        const segs: number[][] = [];
        for (let i = 0; i <= bays; i++) {
          const mx = x + m + i * bw;
          segs.push([X(mx), Y(y), X(mx), Y(y + bodyH)]);
        }
        lines(segs, mat.line, 0.18);
      }
    }

    // дверь / ворота
    if (hasDoor && fl * z >= 6) {
      let dw: number;
      let dh: number;
      if (b.door === 'gate') { dw = Math.min(bw * 0.9, 70); dh = Math.min(fl * 0.8, 50); }
      else if (b.door === 'double') { dw = Math.min(bw * 0.8, 34); dh = Math.min(fl * 0.75, 22); }
      else { dw = Math.min(bw * 0.5, 14); dh = Math.min(fl * 0.75, 22); }
      const cx = x + m + (doorBay + 0.5) * bw;
      const dr = sr(cx - dw / 2, y, dw, dh);
      fillRects([dr], DOOR);
      strokeRects([dr], mat.top, 0.8);
      if (b.door === 'double') lines([[X(cx), Y(y), X(cx), Y(y + dh)]], mat.top, 0.8);
    }
  }

  // контур фасада
  strokeRects([sr(x, y, w, bodyH)], mat.line, 0.7);
}

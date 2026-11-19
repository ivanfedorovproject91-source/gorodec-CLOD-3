import type { SceneObject } from '../types/project';
import { hitPath } from './pathModel';

const MAX_HISTORY = 100;
/** Размер чанка по X (мировые единицы) */
export const CHUNK = 2048;
/** Запас справа/сверху под боковую грань и крышу при отсечении */
export const VIEW_PAD = 160;
const WIDE_CHUNKS = 64;

/** Объекты мира, выделение и история (undo/redo на снимках состояния). */
export class Scene {
  objects: SceneObject[] = [];
  selectedId: string | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private index = new Map<number, SceneObject[]>();
  private wide: SceneObject[] = [];
  private order = new Map<string, number>();
  private indexDirty = true;

  /** Пометить пространственный индекс устаревшим (после любого изменения объектов) */
  invalidate(): void {
    this.indexDirty = true;
  }

  private rebuild(): void {
    this.index.clear();
    this.wide = [];
    this.order.clear();
    this.objects.forEach((o, i) => {
      this.order.set(o.id, i);
      const c0 = Math.floor(o.x / CHUNK);
      const c1 = Math.floor((o.x + o.w + VIEW_PAD) / CHUNK);
      if (c1 - c0 > WIDE_CHUNKS) { this.wide.push(o); return; }
      for (let c = c0; c <= c1; c++) {
        const list = this.index.get(c);
        if (list) list.push(o); else this.index.set(c, [o]);
      }
    });
    this.indexDirty = false;
  }

  /** Объекты чанков, пересекающих полосу [minX, maxX], в порядке отрисовки */
  visible(minX: number, maxX: number): SceneObject[] {
    if (this.indexDirty) this.rebuild();
    const seen = new Set<string>();
    const out: SceneObject[] = [];
    const add = (o: SceneObject) => { if (!seen.has(o.id)) { seen.add(o.id); out.push(o); } };
    this.wide.forEach(add);
    const c0 = Math.floor(minX / CHUNK);
    const c1 = Math.floor(maxX / CHUNK);
    for (let c = c0; c <= c1; c++) this.index.get(c)?.forEach(add);
    out.sort((a, b) => this.order.get(a.id)! - this.order.get(b.id)!);
    return out;
  }

  reset(objects: SceneObject[]): void {
    this.objects = JSON.parse(JSON.stringify(objects));
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.indexDirty = true;
  }

  snapshot(): string {
    return JSON.stringify(this.objects);
  }

  /** Восстановить состояние из снимка (история не меняется) */
  load(snap: string): void {
    this.objects = JSON.parse(snap);
    this.indexDirty = true;
    if (!this.objects.some((o) => o.id === this.selectedId)) this.selectedId = null;
  }

  /** Записать шаг истории. `before` — снимок ДО изменения. Возвращает true, если что-то изменилось. */
  record(before: string): boolean {
    if (before === this.snapshot()) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (prev === undefined) return false;
    this.redoStack.push(this.snapshot());
    this.load(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (next === undefined) return false;
    this.undoStack.push(this.snapshot());
    this.load(next);
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  get(id: string): SceneObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  selected(): SceneObject | undefined {
    return this.selectedId ? this.get(this.selectedId) : undefined;
  }

  /** Верхний объект под точкой (последний в списке рисуется сверху) */
  hitTest(wx: number, wy: number, pad: number): SceneObject | null {
    const list = this.visible(wx - pad, wx + pad);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.path) {
        if (hitPath(o, wx, wy, pad)) return o;
        continue;
      }
      if (wx >= o.x - pad && wx <= o.x + o.w + pad && wy >= o.y - pad && wy <= o.y + o.h + pad) return o;
    }
    return null;
  }

  newId(): string {
    return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
}

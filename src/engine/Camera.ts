export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Камера. Мировые координаты: X вправо, Y ВВЕРХ, земля на y = 0.
 * Экранные координаты: Y вниз (как в браузере). Все преобразования — здесь.
 */
export class Camera {
  x = 0;
  y = 120;
  zoom = 1;
  viewW = 1;
  viewH = 1;

  set(s: CameraState): void {
    if (Number.isFinite(s.x)) this.x = s.x;
    if (Number.isFinite(s.y)) this.y = s.y;
    if (Number.isFinite(s.zoom)) this.zoom = clamp(s.zoom, MIN_ZOOM, MAX_ZOOM);
  }

  get(): CameraState {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: -(wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: -(sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom;
  }

  /** Масштабирование вокруг точки экрана (точка под курсором остаётся на месте) */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  visibleBounds() {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.viewW, this.viewH);
    return { minX: tl.x, maxX: br.x, minY: br.y, maxY: tl.y };
  }
}

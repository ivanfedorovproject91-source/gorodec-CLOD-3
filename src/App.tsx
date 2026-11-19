import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './engine/Engine';
import type { DrawKind, EditorState, ObjectPatch, Tool } from './engine/Engine';
import type { CameraState } from './engine/Camera';
import { Inspector } from './components/Inspector';
import { loadProject, saveProject } from './services/storage';
import { PRESETS } from './types/building';
import type { PresetId } from './types/building';
import { PATH_PRESETS } from './types/path';
import type { PathPresetId } from './types/path';
import { DEFAULT_CAMERA, DEFAULT_GRID, GRID_SIZES, createProject, parseProject } from './types/project';
import type { GridSettings, ProjectData } from './types/project';

const SAVE_DELAY = 800;
const meters = (u: number) => (u / 10).toFixed(1);
const clock = () => new Date().toLocaleTimeString('ru-RU');
const EMPTY_ED: EditorState = { tool: 'select', drawKind: 'residential', selectedPoint: null, drafting: 0, count: 0, selected: null, canUndo: false, canRedo: false };

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Выбор', key: 'V' },
  { id: 'draw', label: 'Рисовать', key: 'B' },
  { id: 'hand', label: 'Рука', key: 'H' },
];

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const projectRef = useRef<ProjectData | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [grid, setGridState] = useState<GridSettings>(DEFAULT_GRID);
  const [cam, setCam] = useState<CameraState>(DEFAULT_CAMERA);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [ed, setEd] = useState<EditorState>(EMPTY_ED);
  const [status, setStatus] = useState('Загрузка…');
  const [panel, setPanel] = useState(false);

  const saveNow = useCallback(async (manual = false) => {
    const p = projectRef.current;
    const eng = engineRef.current;
    if (!p || !eng) return;
    window.clearTimeout(timerRef.current);
    p.camera = eng.getCamera();
    p.objects = eng.getObjects();
    p.updatedAt = Date.now();
    try {
      await saveProject({ ...p });
      setStatus(`${manual ? 'Сохранено' : 'Автосохранено'} ${clock()}`);
    } catch {
      setStatus('Ошибка сохранения (хранилище браузера недоступно)');
    }
  }, []);

  const scheduleSave = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void saveNow(false), SAVE_DELAY);
  }, [saveNow]);

  // запуск
  useEffect(() => {
    let cancelled = false;
    const engine = new Engine();
    (async () => {
      let p: ProjectData | null = null;
      try {
        p = await loadProject();
      } catch {
        p = null;
      }
      const restored = !!p;
      if (!p) p = createProject();
      if (cancelled || !hostRef.current) return;
      projectRef.current = p;
      setName(p.name);
      setGridState(p.grid);
      setCam(p.camera);
      engine.setObjects(p.objects);
      engine.onCameraChange = () => {
        setCam(engine.getCamera());
        scheduleSave();
      };
      engine.onCursorChange = () => setCursor(engine.getCursor());
      engine.onEditorChange = () => setEd(engine.getEditorState());
      engine.onObjectsChange = () => scheduleSave();
      await engine.start(hostRef.current, p.camera, p.grid);
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      setEd(engine.getEditorState());
      setStatus(restored ? 'Проект восстановлен' : 'Новый проект');
    })();

    const flush = () => {
      if (document.visibilityState === 'hidden') void saveNow(false);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush as () => void);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush as () => void);
      engine.destroy();
      engineRef.current = null;
    };
  }, [saveNow, scheduleSave]);

  const updateGrid = useCallback(
    (patch: Partial<GridSettings>) => {
      const p = projectRef.current;
      if (!p) return;
      const g = { ...p.grid, ...patch };
      p.grid = g;
      setGridState(g);
      engineRef.current?.setGrid(g);
      scheduleSave();
    },
    [scheduleSave],
  );

  const rename = (v: string) => {
    setName(v);
    if (projectRef.current) projectRef.current.name = v.trim() ? v : 'Новый город';
    scheduleSave();
  };

  const doExport = () => {
    const p = projectRef.current;
    const eng = engineRef.current;
    if (!p || !eng) return;
    p.camera = eng.getCamera();
    p.objects = eng.getObjects();
    p.updatedAt = Date.now();
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(p.name || 'city').replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus(`Экспортировано ${clock()}`);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const p = parseProject(JSON.parse(await file.text()));
      projectRef.current = p;
      setName(p.name);
      setGridState(p.grid);
      const eng = engineRef.current;
      eng?.setGrid(p.grid);
      eng?.setCamera(p.camera);
      eng?.setObjects(p.objects);
      await saveNow(true);
      setStatus(`Импортировано ${clock()}`);
    } catch (e) {
      setStatus(`Ошибка импорта: ${(e as Error).message}`);
    }
  };

  const patchSelected = (patch: ObjectPatch) => engineRef.current?.updateSelected(patch);

  // горячие клавиши
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
      const eng = engineRef.current;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        eng?.setSpace(true);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (k === 's') { e.preventDefault(); void saveNow(true); }
        else if (k === 'z') { e.preventDefault(); if (e.shiftKey) eng?.redo(); else eng?.undo(); }
        else if (k === 'y') { e.preventDefault(); eng?.redo(); }
        else if (k === 'd') { e.preventDefault(); eng?.duplicateSelected(); }
        return;
      }
      const step = projectRef.current?.grid.size ?? 10;
      switch (k) {
        case 'delete': case 'backspace': e.preventDefault(); eng?.deleteKey(); break;
        case 'enter': eng?.finishPath(); break;
        case 'escape': eng?.escape(); break;
        case 'arrowleft': e.preventDefault(); eng?.nudge(-step, 0); break;
        case 'arrowright': e.preventDefault(); eng?.nudge(step, 0); break;
        case 'arrowup': e.preventDefault(); eng?.nudge(0, step); break;
        case 'arrowdown': e.preventDefault(); eng?.nudge(0, -step); break;
        case 'v': eng?.setTool('select'); break;
        case 'b': eng?.setTool('draw'); break;
        case 'h': eng?.setTool('hand'); break;
        case 'g': updateGrid({ visible: !projectRef.current?.grid.visible }); break;
        case 's': updateGrid({ snap: !projectRef.current?.grid.snap }); break;
        case '+': case '=': eng?.zoomBy(1.25); break;
        case '-': eng?.zoomBy(0.8); break;
        case '0': eng?.resetView(); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        engineRef.current?.setSpace(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [saveNow, updateGrid]);

  const eng = () => engineRef.current;

  return (
    <div className={'app' + (panel ? ' panel-open' : '')}>
      <header className="topbar">
        <span className="logo">INFINITE CITY</span>
        <input className="name" value={name} maxLength={80} onChange={(e) => rename(e.target.value)} aria-label="Название проекта" />
        <div className="spacer" />
        <button disabled={!ed.canUndo} onClick={() => eng()?.undo()} title="Ctrl+Z">↶ Отмена</button>
        <button disabled={!ed.canRedo} onClick={() => eng()?.redo()} title="Ctrl+Y">↷ Повтор</button>
        <button onClick={() => void saveNow(true)} title="Ctrl+S">Сохранить</button>
        <button onClick={doExport}>Экспорт</button>
        <button onClick={() => fileRef.current?.click()}>Импорт</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
      </header>

      <div className="main">
        <aside className="sidebar left">
          <h3>Здания</h3>
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button key={id} className={'lib' + (ed.tool === 'draw' && ed.drawKind === id ? ' on' : '')}
              onClick={() => eng()?.setDrawKind(id)}>{PRESETS[id].label}</button>
          ))}
          <button className={'lib' + (ed.tool === 'draw' && ed.drawKind === 'block' ? ' on' : '')}
            onClick={() => eng()?.setDrawKind('block')}>Блок (примитив)</button>
          <h3>Инфраструктура</h3>
          {(Object.keys(PATH_PRESETS) as PathPresetId[]).map((id) => (
            <button key={id} className={'lib' + (ed.tool === 'draw' && ed.drawKind === id ? ' on' : '')}
              onClick={() => eng()?.setDrawKind(id)}>{PATH_PRESETS[id].label}</button>
          ))}
          <h3>Скоро</h3>
          {['Станции', 'Коммуникации', 'Окружение'].map((c) => (
            <button key={c} disabled className="lib">{c}<small>скоро</small></button>
          ))}
          <p className="muted small">Здания: выберите тип и протяните прямоугольник (или нажмите). Дороги и рельсы: кликайте точки, двойной клик или «Готово» — завершить. Для эстакад и мостов кликайте на нужной высоте.</p>
        </aside>

        <div className="viewport" ref={hostRef} />
        {ed.drafting > 0 && (
          <div className="draft-bar">
            <span>Точек: {ed.drafting}</span>
            <button className="on" disabled={ed.drafting < 2} onClick={() => eng()?.finishPath()}>Готово</button>
            <button onClick={() => eng()?.cancelPath()}>Отмена</button>
          </div>
        )}

        <aside className="sidebar right">
          <h3>Инспектор</h3>
          <Inspector sel={ed.selected} selectedPoint={ed.selectedPoint} onChange={patchSelected}
            onPoint={(p) => eng()?.setSelectedPoint(p)} onDeletePoint={() => eng()?.deleteSelectedPoint()} />
          <h3>Камера</h3>
          <dl>
            <dt>X</dt><dd>{meters(cam.x)} м</dd>
            <dt>Y</dt><dd>{meters(cam.y)} м</dd>
            <dt>Масштаб</dt><dd>{Math.round(cam.zoom * 100)}%</dd>
          </dl>
          <h3>Проект</h3>
          <dl><dt>Объектов</dt><dd>{ed.count}</dd></dl>
        </aside>
      </div>

      <footer className="bottombar">
        <div className="group">
          {TOOLS.map((t) => (
            <button key={t.id} className={ed.tool === t.id ? 'on' : ''} onClick={() => eng()?.setTool(t.id)} title={t.key}>{t.label}</button>
          ))}
          <select className="kind" value={ed.drawKind}
            onChange={(e) => { eng()?.setDrawKind(e.target.value as DrawKind); e.target.blur(); }} title="Что рисовать">
            <optgroup label="Здания">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
              <option value="block">Блок (примитив)</option>
            </optgroup>
            <optgroup label="Инфраструктура">
              {(Object.keys(PATH_PRESETS) as PathPresetId[]).map((id) => <option key={id} value={id}>{PATH_PRESETS[id].label}</option>)}
            </optgroup>
          </select>
          <button className="mobile-only" onClick={() => setPanel(!panel)}>Свойства</button>
          <button disabled={!ed.selected} onClick={() => eng()?.duplicateSelected()} title="Ctrl+D">Дублировать</button>
          <button disabled={!ed.selected} onClick={() => eng()?.deleteSelected()} title="Delete">Удалить</button>
        </div>
        <div className="group">
          <button onClick={() => eng()?.zoomBy(0.8)} title="−">−</button>
          <span className="zoom">{Math.round(cam.zoom * 100)}%</span>
          <button onClick={() => eng()?.zoomBy(1.25)} title="+">+</button>
          <button onClick={() => eng()?.resetView()} title="0">Сброс вида</button>
        </div>
        <div className="group">
          <button className={grid.visible ? 'on' : ''} onClick={() => updateGrid({ visible: !grid.visible })} title="G">Сетка</button>
          <button className={grid.snap ? 'on' : ''} onClick={() => updateGrid({ snap: !grid.snap })} title="S">Привязка</button>
          {GRID_SIZES.map((s) => (
            <button key={s} className={grid.size === s ? 'on' : ''} onClick={() => updateGrid({ size: s })}>{s / 10} м</button>
          ))}
        </div>
        <div className="spacer" />
        <span className="coords">{cursor ? `X ${meters(cursor.x)}  Y ${meters(cursor.y)} м` : '—'}</span>
        <span className="status">{status}</span>
      </footer>
    </div>
  );
}

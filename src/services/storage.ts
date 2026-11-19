import { PROJECT_KEY, parseProject } from '../types/project';
import type { ProjectData } from '../types/project';

const DB_NAME = 'infinite-city';
const STORE = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project: ProjectData): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadProject(): Promise<ProjectData | null> {
  const db = await openDb();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(PROJECT_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return raw ? parseProject(raw) : null;
}

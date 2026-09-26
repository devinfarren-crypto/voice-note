// Tiny IndexedDB wrapper for saved takes. Everything stays on the device —
// audio blobs are too big for localStorage, and there's no account to sync to.

export type TakeKind = "lyrics" | "melody";

export interface Take {
  id: string;
  kind: TakeKind;
  title: string;
  createdAt: number;
  /** Lyric text (lyrics) or optional jotted note (melody). */
  text: string;
  /** Recorded audio — melodies only. */
  audio?: Blob;
  /** Recording length in ms — melodies only. */
  durationMs?: number;
  /** Most common note heard during the take, e.g. "A3" — melodies only. */
  keyHint?: string;
  /** Normalised loudness profile (0..1) for drawing the waveform — melodies only. */
  peaks?: number[];
}

const DB_NAME = "catch";
const STORE = "takes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listTakes(): Promise<Take[]> {
  const all = await tx<Take[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export function saveTake(take: Take): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(take));
}

export function deleteTake(id: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(id));
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Minimal promise-based IndexedDB wrapper. All data stays on the device.
const DB_NAME = 'yoman2';
const VERSION = 1;
export const STORES = ['events', 'tasks', 'folders', 'docs', 'files', 'vault', 'kv'];

let dbPromise;
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let result;
    const req = fn(st);
    if (req && 'onsuccess' in req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  }));
}

export const db = {
  all: (s) => run(s, 'readonly', (st) => st.getAll()),
  get: (s, key) => run(s, 'readonly', (st) => st.get(key)),
  put: (s, val) => run(s, 'readwrite', (st) => st.put(val)),
  del: (s, key) => run(s, 'readwrite', (st) => st.delete(key)),
  clear: (s) => run(s, 'readwrite', (st) => st.clear()),
  putMany: (s, vals) => run(s, 'readwrite', (st) => { vals.forEach((v) => st.put(v)); }),
  delMany: (s, keys) => run(s, 'readwrite', (st) => { keys.forEach((k) => st.delete(k)); }),
};

export async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* ignore */ }
}

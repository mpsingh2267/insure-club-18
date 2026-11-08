/**
 * InsureClub laptop file vault (website)
 *
 * Uploaded documents (PAN card, Aadhaar, policy PDFs, ...) are kept ON THIS LAPTOP,
 * never in the cloud:
 *   - always in this browser's storage for the site (IndexedDB) — works in every browser, incl. Safari
 *   - and, in browsers that allow it (Chrome/Edge), also as real files in a folder you choose
 * Only the document details (customer, type, title, file name, size) sync to Supabase.
 */
(function () {
  'use strict';

  const DB_NAME = 'insureclub_local_files';
  const DB_VERSION = 1;
  const FILES = 'files';
  const SETTINGS = 'settings';
  const FOLDER_KEY = 'folderHandle';

  let dbPromise = null;
  const known = new Set();

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage aborted'));
    });
  }

  const req2promise = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  // Ask the browser not to clear this storage automatically (Safari/Chrome honour this when they can).
  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch {}
  }

  // --- Optional real folder (File System Access API; Chrome/Edge on desktop) ---
  const folderSupported = typeof window.showDirectoryPicker === 'function';

  async function getFolder() {
    if (!folderSupported) return null;
    try {
      return await tx(SETTINGS, 'readonly', s => req2promise(s.get(FOLDER_KEY))) || null;
    } catch {
      return null;
    }
  }

  async function ensureFolderPermission(handle, ask) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!ask) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  async function chooseFolder() {
    if (!folderSupported) throw new Error('This browser cannot save into a chosen folder. Files are kept in the browser on this laptop instead.');
    const handle = await window.showDirectoryPicker({ id: 'insureclub-documents', mode: 'readwrite', startIn: 'documents' });
    await tx(SETTINGS, 'readwrite', s => s.put(handle, FOLDER_KEY));
    return handle.name;
  }

  async function folderName() {
    const h = await getFolder();
    return h ? h.name : null;
  }

  function safeName(name) {
    return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  }

  function folderFileName(id, name) {
    return `${safeName(id)}__${safeName(name)}`;
  }

  // --- Public API ---
  async function save(id, file) {
    await requestPersistence();
    const record = {
      id,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      savedAt: new Date().toISOString(),
      blob: file
    };
    await tx(FILES, 'readwrite', s => s.put(record));
    known.add(id);

    let savedToFolder = null;
    const folder = await getFolder();
    if (folder && (await ensureFolderPermission(folder, true).catch(() => false))) {
      try {
        const fh = await folder.getFileHandle(folderFileName(id, file.name), { create: true });
        const w = await fh.createWritable();
        await w.write(file);
        await w.close();
        savedToFolder = folder.name;
      } catch (err) {
        console.warn('Folder copy failed, browser copy kept:', err);
      }
    }
    return { savedToFolder };
  }

  async function get(id) {
    const rec = await tx(FILES, 'readonly', s => req2promise(s.get(id)));
    if (rec && rec.blob) return rec;
    // Fall back to the chosen folder (e.g. browser data was cleared but the folder copy remains).
    const folder = await getFolder();
    if (folder && (await ensureFolderPermission(folder, true).catch(() => false))) {
      for await (const [name, handle] of folder.entries()) {
        if (handle.kind === 'file' && name.startsWith(`${safeName(id)}__`)) {
          const file = await handle.getFile();
          return { id, name: name.slice(safeName(id).length + 2), type: file.type, size: file.size, blob: file };
        }
      }
    }
    return null;
  }

  async function remove(id) {
    const rec = await tx(FILES, 'readonly', s => req2promise(s.get(id))).catch(() => null);
    await tx(FILES, 'readwrite', s => s.delete(id));
    known.delete(id);
    const folder = await getFolder();
    if (folder && rec && (await ensureFolderPermission(folder, false).catch(() => false))) {
      await folder.removeEntry(folderFileName(id, rec.name)).catch(() => {});
    }
  }

  async function refreshIndex() {
    const keys = await tx(FILES, 'readonly', s => req2promise(s.getAllKeys())).catch(() => []);
    known.clear();
    (keys || []).forEach(k => known.add(k));
    return known;
  }

  const has = id => known.has(id);

  function download(rec) {
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rec.name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // In-page viewer: PDFs and images open inside the site; other types download.
  function view(rec, title) {
    const type = rec.type || '';
    if (!/^image\//.test(type) && type !== 'application/pdf') {
      download(rec);
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    const overlay = document.createElement('div');
    overlay.className = 'lfv-overlay';
    overlay.innerHTML = `
      <div class="lfv-dialog" role="dialog" aria-modal="true">
        <div class="lfv-head">
          <strong class="lfv-title"></strong>
          <div class="lfv-actions">
            <button type="button" class="btn secondary sm" data-lfv="download">⬇ Download</button>
            <button type="button" class="btn secondary sm" data-lfv="close">✕ Close</button>
          </div>
        </div>
        <div class="lfv-body">
          ${type === 'application/pdf'
            ? `<iframe class="lfv-frame" src="${url}" title="Document preview"></iframe>`
            : `<img class="lfv-img" src="${url}" alt="Document preview">`}
        </div>
      </div>`;
    overlay.querySelector('.lfv-title').textContent = title || rec.name;
    const close = () => { overlay.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-lfv="close"]').addEventListener('click', close);
    overlay.querySelector('[data-lfv="download"]').addEventListener('click', () => download(rec));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  const style = document.createElement('style');
  style.textContent = `
    .lfv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
    .lfv-dialog{background:var(--surface,#fff);color:inherit;width:min(960px,100%);height:min(88vh,100%);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .lfv-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid rgba(127,127,127,.25)}
    .lfv-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .lfv-actions{display:flex;gap:8px;flex-shrink:0}
    .lfv-body{flex:1;min-height:0;background:#525659;display:flex;align-items:center;justify-content:center}
    .lfv-frame{width:100%;height:100%;border:0;background:#fff}
    .lfv-img{max-width:100%;max-height:100%;object-fit:contain}
  `;
  document.head.appendChild(style);

  window.InsureClubFiles = {
    folderSupported,
    chooseFolder,
    folderName,
    save,
    get,
    remove,
    has,
    refreshIndex,
    view,
    download
  };
})();

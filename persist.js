/* Keeps your save safe: asks the browser not to delete it, and keeps a second copy in IndexedDB.
   If the main save ever disappears, the copy is restored automatically. Loaded before game.js. */
(function () {
  'use strict';
  const KEY = 'coc.save.v1', DB = 'coc-backup';
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const get = () => db().then((d) => new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null);
  const put = (v) => db().then((d) => { d.transaction('kv', 'readwrite').objectStore('kv').put(v, KEY); }).catch(() => {});
  let has = null; try { has = localStorage.getItem(KEY); } catch (e) { /* blocked */ }
  if (!has) {
    // main save missing: try the backup copy, once
    get().then((v) => {
      let tried = false; try { tried = sessionStorage.getItem('coc.restored'); } catch (e) { /* ignore */ }
      if (v && !tried) { try { localStorage.setItem(KEY, v); sessionStorage.setItem('coc.restored', '1'); location.reload(); } catch (e) { /* ignore */ } }
    });
  }
  function mirror() { try { const v = localStorage.getItem(KEY); if (v) put(v); } catch (e) { /* ignore */ } }
  setInterval(mirror, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) mirror(); });
  window.addEventListener('pagehide', mirror);
})();

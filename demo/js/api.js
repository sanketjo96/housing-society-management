/*
 * Saral Society data layer.
 *
 * Two modes, chosen at startup:
 *   server  A REST API (json-server today, a real backend later) holds the data.
 *           Every write is sent as plain REST calls on resources:
 *             POST   /<collection>        create a record
 *             PUT    /<collection>/<id>   replace a record
 *             DELETE /<collection>/<id>   delete a record
 *             PUT    /<singleton>         replace settings / meta / society
 *   memory  No API reachable (GitHub Pages, static preview), or a client preset.
 *           db.json is loaded as seed data and changes are saved in this
 *           browser's localStorage, so they survive a reload. The saved copy is
 *           keyed by client preset and by a fingerprint of the seed, so editing
 *           the seed starts everyone on the new data. Reset clears it.
 *
 * The app never calls fetch itself. Screens change a copy of the data inside
 * update('actionName', fn); this layer diffs before/after and sends the REST
 * calls. See API.md for the resource list and every named action.
 *
 * Choosing the API:
 *   ?api=http://localhost:3001     query parameter (wins)
 *   window.SARAL_CONFIG.apiBase    from js/config.js ('' forces memory mode)
 *   otherwise                       the page's own origin, which is where
 *                                   json-server serves it with --static
 */
(function () {
  'use strict';

  var COLLECTIONS = ['users', 'flats', 'ledger', 'receipts', 'expenses', 'complaints', 'notices', 'amenities', 'bookings',
    'messages', 'runs', 'gatePasses', 'visitors', 'intents', 'noticeReads', 'importSample'];
  var SINGLETONS = ['meta', 'society', 'settings'];
  // Collections shown newest first. json-server appends new records, so order
  // is restored from the `ts` (created-at, ms) field after every load.
  var NEWEST_FIRST = ['complaints', 'expenses', 'gatePasses', 'visitors', 'messages', 'notices'];

  var cfg = window.SARAL_CONFIG || {};
  var base = null;
  var mode = 'memory';
  var queue = Promise.resolve();
  var opts = {};   // from init(): { seedUrl, resetUrl, memoryOnly, storeId } (client presets use these)
  var storeKey = null;   // localStorage key for memory mode, null when saving isn't possible
  var saved = false;     // true while memory-mode changes are being saved in this browser
  var STORE_PREFIX = 'saral-demo:data:';

  function join(path) { return base.replace(/\/+$/, '') + '/' + path; }

  function getJSON(u) {
    return fetch(u, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('GET ' + u + ' → ' + r.status);
      return r.json();
    });
  }

  function normalise(db) {
    COLLECTIONS.forEach(function (k) { if (!Array.isArray(db[k])) db[k] = []; });
    SINGLETONS.forEach(function (k) { if (!db[k] || typeof db[k] !== 'object') db[k] = {}; });
    NEWEST_FIRST.forEach(function (k) {
      db[k] = db[k].map(function (x, i) { return { x: x, i: i }; })
        .sort(function (a, b) { return ((b.x.ts || 0) - (a.x.ts || 0)) || (a.i - b.i); })
        .map(function (w) { return w.x; });
    });
    return db;
  }

  // Give new records in newest-first collections a created-at stamp.
  function stamp(db) {
    var now = Date.now();
    NEWEST_FIRST.forEach(function (k) { (db[k] || []).forEach(function (x, i) { if (x && x.ts == null) x.ts = now - i; }); });
    return db;
  }

  function candidates() {
    if (opts.memoryOnly) return [];
    var q = null;
    try { q = new URLSearchParams(location.search).get('api'); } catch (e) {}
    if (q) return [q];
    if (typeof cfg.apiBase === 'string') return cfg.apiBase ? [cfg.apiBase] : [];
    if (/^https?:$/.test(location.protocol)) return [new URL('.', location.href).href];
    return [];
  }

  function loadFrom(b) {
    base = b;
    return getJSON(join('meta')).then(function (meta) {
      if (!meta || typeof meta !== 'object' || !meta.today) throw new Error('not a Saral API');
      var db = { meta: meta };
      var keys = COLLECTIONS.concat(SINGLETONS.filter(function (k) { return k !== 'meta'; }));
      return Promise.all(keys.map(function (k) { return getJSON(join(k)).then(function (v) { db[k] = v; }); }))
        .then(function () { return normalise(db); });
    });
  }

  // Small, stable string hash (FNV-1a) used to fingerprint the seed text.
  function fingerprint(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  // Memory mode: use the copy saved in this browser if it was made from the
  // same seed, else the seed itself. Older copies for this preset are removed.
  function loadMemory() {
    var url = opts.seedUrl || cfg.seedUrl || 'db.json';
    return fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('GET ' + url + ' → ' + r.status);
      return r.text();
    }).then(function (text) {
      var seed = JSON.parse(text);
      var scope = STORE_PREFIX + (opts.storeId || 'default') + ':';
      storeKey = scope + fingerprint(text);
      saved = false;
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf(scope) === 0 && k !== storeKey) localStorage.removeItem(k);
        }
        var kept = localStorage.getItem(storeKey);
        saved = true;
        if (kept) return normalise(JSON.parse(kept));
      } catch (e) { saved = false; storeKey = null; }
      return normalise(seed);
    });
  }

  // Save memory-mode data. If the browser refuses (storage full or blocked),
  // stop trying and tell the app once through SaralApi.onSaveFailed.
  function save(db) {
    if (!storeKey) return;
    try { localStorage.setItem(storeKey, JSON.stringify(db)); }
    catch (e) {
      storeKey = null; saved = false;
      if (typeof window.SaralApi.onSaveFailed === 'function') window.SaralApi.onSaveFailed(e);
    }
  }

  function init(options) {
    opts = options || {};
    var list = candidates();
    var tryNext = function (i) {
      if (i >= list.length) {
        base = null; mode = 'memory';
        return loadMemory().then(function (db) { return { db: db, mode: mode, base: null, saved: saved }; });
      }
      return loadFrom(list[i]).then(function (db) { mode = 'server'; return { db: db, mode: mode, base: base }; })
        .catch(function () { return tryNext(i + 1); });
    };
    return tryNext(0);
  }

  function diff(before, after) {
    var ops = [];
    SINGLETONS.forEach(function (k) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) ops.push({ method: 'PUT', path: k, body: after[k] });
    });
    COLLECTIONS.forEach(function (k) {
      var a = new Map((before[k] || []).map(function (x) { return [String(x.id), x]; }));
      var b = new Map((after[k] || []).map(function (x) { return [String(x.id), x]; }));
      b.forEach(function (x, id) {
        var o = a.get(id);
        if (!o) ops.push({ method: 'POST', path: k, body: x });
        else if (JSON.stringify(o) !== JSON.stringify(x)) ops.push({ method: 'PUT', path: k + '/' + encodeURIComponent(id), body: x });
      });
      a.forEach(function (x, id) { if (!b.has(id)) ops.push({ method: 'DELETE', path: k + '/' + encodeURIComponent(id) }); });
    });
    return ops;
  }

  // One REST call, retried twice on a network error (not on an HTTP error).
  function send(action, op, attempt) {
    return fetch(join(op.path), {
      method: op.method,
      headers: { 'Content-Type': 'application/json', 'X-Saral-Action': action },
      body: op.body === undefined ? undefined : JSON.stringify(op.body),
    }).then(function (r) {
      if (!r.ok) { var e = new Error(action + ': ' + op.method + ' /' + op.path + ' → ' + r.status); e.http = true; throw e; }
    }).catch(function (e) {
      if (e.http || attempt >= 2) throw e;
      return new Promise(function (res) { setTimeout(res, 300 * (attempt + 1)); }).then(function () { return send(action, op, attempt + 1); });
    });
  }

  // Send the REST calls for one action. Calls run one after another, and
  // actions run in the order they happened.
  function sync(action, before, after) {
    if (mode !== 'server') { save(after); return Promise.resolve([]); }
    var ops = diff(before, after);
    if (!ops.length) return Promise.resolve([]);
    var run = queue.then(function () {
      return ops.reduce(function (p, op) {
        return p.then(function () {
          return send(action, op, 0);
        });
      }, Promise.resolve()).then(function () { return ops; });
    });
    queue = run.catch(function () {});
    return run;
  }

  function reload() { return mode === 'server' ? loadFrom(base) : Promise.reject(new Error('memory mode')); }

  // Restore the original sample data (db.seed.json). In server mode the
  // differences are written back so the API matches the seed again.
  function reset(current) {
    return getJSON(opts.resetUrl || opts.seedUrl || cfg.seedResetUrl || 'db.seed.json').then(function (seed) {
      var db = normalise(seed);
      if (mode !== 'server') {
        try { if (storeKey) localStorage.removeItem(storeKey); } catch (e) { /* storage blocked */ }
        return db;
      }
      return sync('resetDemo', current, db).then(function () { return db; });
    });
  }

  window.SaralApi = {
    init: init, sync: sync, reset: reset, reload: reload, diff: diff, stamp: stamp,
    get mode() { return mode; }, get base() { return base; }, get saved() { return saved; },
    onSaveFailed: null,
  };
})();

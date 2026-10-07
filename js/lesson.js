/* 墨課 · 錄課引擎 lesson.js
 * Doceri 式錄課：向量筆跡事件＋語音分段錄音 → 課程檔（小檔案，可重播/編輯/轉影片）
 * 錄影可暫停：暫停時時鐘與錄音同時停，最終成品沒有空白段。
 */
'use strict';

/* ---------- 暫停感知時鐘 ---------- */
class LessonClock {
  constructor() { this.reset(); }
  reset() { this.base = 0; this.t0 = 0; this.running = false; this.speed = 1; }
  start() { this.t0 = performance.now(); this.running = true; }
  pause() { if (this.running) { this.base = this.now(); this.running = false; } }
  resume() { if (!this.running) { this.t0 = performance.now(); this.running = true; } }
  now() { return this.running ? this.base + (performance.now() - this.t0) * (this.speed || 1) : this.base; }
  /* 變速：先結算當前時間再換速，避免跳變（Doceri Playback Speed） */
  setSpeed(s) {
    const t = this.now();
    this.speed = s > 0 ? s : 1;
    this.base = t;
    if (this.running) this.t0 = performance.now();
  }
}


function audioDuration(url) {
  return new Promise((res, rej) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => res((a.duration || 0) * 1000);
    a.onerror = rej;
    a.src = url;
  });
}
function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/* ================= 錄影器 ================= */


/* v27：標記綁筆跡（Doceri GStrokeTimeStop 式）——解析標記的時間。
 * 新格式用 strokeId 綁定筆跡（時間＝該筆跡 add 事件的 t）；
 * 舊格式（只有 t）直接回傳 t，載入舊課程檔時相容。
 * 筆跡被刪除時回傳 null（呼叫端應跳過或刪除該標記）。 */
function resolveStopTime(events, m) {
  if (!m) return null;
  if (m.strokeId && events) {
    for (const e of events) {
      if (e.evt === 'add' && e.data && e.data.stroke && e.data.stroke.id === m.strokeId) return e.t;
    }
    return null;
  }
  return typeof m.t === 'number' ? m.t : null;
}

/* ================= 全時時間軸 =================
 * 時間軸是白板本身的屬性，不是錄影的附屬品：
 * App 開啟就開始記錄事件流，即使不錄影也有完整筆跡時間軸。
 * 「儲存白板」會把整條時間軸存成可重播/可拖曳的課程；
 * 「● 錄影」則是在此基礎上多錄聲音與 Stop Marker。
 */
const SessionLog = {
  clock: new LessonClock(),
  events: [],
  stops: [],              // Stop Marker（session 層級）：{id, t, label}，不錄影也能插
  basePages: null,
  started: false,
  insertBase: null,       // 插入模式：{sessionT0, timelineT, eventIdx0}
  _unadded: [],           // v25：被復原暫存的 add 事件（重做時依原 t 插回）
  begin(basePages) {
    this.basePages = basePages;
    // 就地清空而非換新陣列：TimelineController 持有 events/stops 的 live 引用
    this.events.length = 0;
    this.stops.length = 0;
    this._unadded.length = 0;
    this.insertBase = null;
    this.clock.reset();
    this.clock.start();
    this.started = true;
  },
  reset(basePages) { this.begin(basePages); },
  snapshotPages(pages) {
    return pages.map(p => ({
      bg: p.bg, image: p.image,
      strokes: JSON.parse(JSON.stringify(p.strokes))
    }));
  },
  /* 時間軸當前時間；插入模式中換算為插入點起算的時間 */
  now() {
    const t = Math.round(this.clock.now());
    const ib = this.insertBase;
    return ib ? Math.round(ib.timelineT + (t - ib.sessionT0)) : t;
  },
  handle(type, data) {
    if (!this.started) return;
    let d = data;
    try { d = JSON.parse(JSON.stringify(data)); } catch (e) {}
    // v25：復原＝從時間軸移除該筆（不記錄為新事件）；v26：橡皮擦同（ids 陣列）；
    // v27：標記綁筆跡，筆跡刪除時標記一起刪除
    if (type === 'unadd' && d && (d.id || d.ids)) {
      const ids = new Set(d.ids || [d.id]);
      const gone = new Set();
      for (let i = this.events.length - 1; i >= 0; i--) {
        const e = this.events[i];
        if (e.evt === 'add' && e.data && e.data.stroke && ids.has(e.data.stroke.id)) {
          gone.add(e.data.stroke.id);
          this._unadded.push(e);
          this.events.splice(i, 1);
        }
      }
      this._purgeStopsForStrokeIds(gone);
      return;
    }
    if (type === 'readd' && d && d.id) {
      const k = this._unadded.findIndex(ev => ev.data && ev.data.stroke && ev.data.stroke.id === d.id);
      if (k >= 0) {
        const ev = this._unadded.splice(k, 1)[0];
        let j = this.events.findIndex(e => e.t > ev.t);
        if (j < 0) j = this.events.length;
        this.events.splice(j, 0, ev);
        d.t = ev.t;  // 回填原時間，供分享廣播用
      }
      return;
    }
    // v21：刪除頁面時同步刪除該頁的時間軸（筆跡事件＋標記），後方頁碼前移
    if (type === 'delpage' && d && typeof d.page === 'number') {
      this._purgePage(d.page);
    }
    // v43：新增頁面時，後方頁面的時間軸頁碼後移（+1），新頁的時間軸是空的
    if (type === 'addpage' && d && typeof d.page === 'number') {
      this._shiftPagesAfter(d.page, 1);
    }
    // v39：清除本頁時同步清除該頁的時間軸（筆跡事件＋標記）
    if (type === 'clear' && d && typeof d.page === 'number') {
      this._purgePageTimeline(d.page);
    }
    this.events.push({ t: this.now(), evt: type, data: d });
  },
  /* 刪除第 idx 頁的時間軸：該頁內容事件/標記移除，後方頁碼 -1。
   * 結構事件（addpage/delpage/page）是歷史索引，重播依序套用才正確，不動。原地修改（engine 持有陣列引用）。 */
  _purgePage(idx) {
    const structural = e => e.evt === 'delpage' || e.evt === 'addpage' || e.evt === 'page';
    const evs = this.events;
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (structural(e)) continue;
      if (!e.data || typeof e.data.page !== 'number') continue;
      if (e.data.page === idx) evs.splice(i, 1);
      else if (e.data.page > idx) e.data.page--;
    }
    const sts = this.stops;
    for (let i = sts.length - 1; i >= 0; i--) {
      const m = sts[i];
      const p = m.page === undefined ? 0 : m.page;
      if (p === idx) sts.splice(i, 1);
      else if (m.page !== undefined && m.page > idx) m.page--;
    }
    // v43：復原暫存同步（刪除頁的丟棄，後方頁碼前移）
    this._unadded = this._unadded.filter(e => {
      if (!e.data || typeof e.data.page !== 'number') return true;
      if (e.data.page === idx) return false;
      if (e.data.page > idx) e.data.page--;
      return true;
    });
    this.renumberStops();
  },
  /* v43：新增頁面時，index 之後（含）的頁面時間軸頁碼 +delta（新頁插入，後方頁碼後移） */
  _shiftPagesAfter(index, delta) {
    for (const e of this.events) {
      if (!e.data || typeof e.data.page !== 'number') continue;
      if (e.evt === 'delpage' || e.evt === 'addpage' || e.evt === 'page') continue;
      if (e.data.page >= index) e.data.page += delta;
    }
    for (const m of this.stops) {
      const p = m.page === undefined ? 0 : m.page;
      if (p >= index && m.page !== undefined) m.page += delta;
    }
    // 復原暫存的頁碼也同步
    for (const e of this._unadded) {
      if (e.data && typeof e.data.page === 'number' && e.data.page >= index) e.data.page += delta;
    }
    this.renumberStops();
  },
  /* v39：清除該頁時間軸（筆跡事件＋標記），不動頁碼（頁面還在，只是清空）。 */
  _purgePageTimeline(idx) {
    const structural = e => e.evt === 'delpage' || e.evt === 'addpage' || e.evt === 'page';
    const evs = this.events;
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (structural(e)) continue;
      if (!e.data || typeof e.data.page !== 'number') continue;
      if (e.data.page === idx) evs.splice(i, 1);
    }
    const sts = this.stops;
    for (let i = sts.length - 1; i >= 0; i--) {
      const m = sts[i];
      const p = m.page === undefined ? 0 : m.page;
      if (p === idx) sts.splice(i, 1);
    }
    // 清掉該頁暫存的 unadd（復原暫存），避免重做時復活已清除的筆跡
    this._unadded = this._unadded.filter(e => !e.data || e.data.page !== idx);
    this.renumberStops();
  },
  /* v27：解析標記時間（綁定筆跡的 add 事件時間；舊版用 m.t） */
  stopTime(m) { return resolveStopTime(this.events, m); },
  /* v30：該頁時間軸起點（該頁第一筆筆跡的 session 時間）。每頁時間軸顯示用相對時間＝t - offset，頁與頁真正獨立。 */
  pageOffset(pg) {
    let m = Infinity;
    for (const e of this.events) {
      if (e.evt !== 'add' || !e.data || e.data.page !== pg) continue;
      if (e.t < m) m = e.t;
    }
    return m === Infinity ? 0 : m;
  },
  /* v27：在指定時間插入標記——改為綁定該頁在 t（含）之前最後一筆筆跡；
   * 無筆跡可綁時回傳 null（由呼叫端提示）。v18：標記屬於該頁。 */
  addStopAt(t, page) {
    if (!this.started) return null;
    const pg = page === undefined ? 0 : page;
    let best = null;
    for (const e of this.events) {
      if (e.evt !== 'add' || !e.data || e.data.page !== pg || !e.data.stroke) continue;
      if (e.t <= t + 1 && (!best || e.t >= best.t)) best = e;
    }
    if (!best) return null;
    const m = {
      id: 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      strokeId: best.data.stroke.id,
      page: pg,
      label: ''
    };
    this.stops.push(m);
    this.renumberStops();
    return m;
  },
  /* v27：刪除筆跡時連帶刪除綁定的標記（就地 splice，保持 live 引用） */
  _purgeStopsForStrokeIds(ids) {
    if (!ids || !ids.size) return;
    let changed = false;
    for (let i = this.stops.length - 1; i >= 0; i--) {
      if (this.stops[i].strokeId && ids.has(this.stops[i].strokeId)) {
        this.stops.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.renumberStops();
  },
  /* 依時間順序重編號（拖曳/增刪標記後呼叫）；v18：每頁各自編號；v27：依綁定筆跡時間排序 */
  renumberStops() {
    this.stops.sort((a, b) => {
      const ta = this.stopTime(a), tb = this.stopTime(b);
      return (ta === null ? -1 : ta) - (tb === null ? -1 : tb);
    });
    const byPage = {};
    for (const m of this.stops) {
      const p = m.page === undefined ? 0 : m.page;
      byPage[p] = (byPage[p] || 0) + 1;
      m.label = '段落 ' + byPage[p];
    }
  },
  /* 插入模式：在 timelineT 處切開時間軸，之後記錄的事件換算時間 */
  beginInsert(timelineT) {
    this.insertBase = {
      sessionT0: Math.round(this.clock.now()),
      timelineT: Math.round(timelineT),
      eventIdx0: this.events.length
    };
  },
  /* 結束插入：回傳 {timelineT, D, eventIdx0}；呼叫端負責位移舊事件/標記並排序 */
  endInsert() {
    const ib = this.insertBase;
    this.insertBase = null;
    if (!ib) return null;
    const inserted = this.events.slice(ib.eventIdx0);
    let endT = ib.timelineT;
    for (const e of inserted) {
      const dur = (e.evt === 'add' && e.data && e.data.stroke && e.data.stroke.dur) || 0;
      endT = Math.max(endT, e.t + dur);
    }
    return { timelineT: ib.timelineT, D: Math.round(endT - ib.timelineT), eventIdx0: ib.eventIdx0 };
  },
  /* 取消插入：丟棄插入期間記錄的事件 */
  cancelInsert() {
    const ib = this.insertBase;
    this.insertBase = null;
    if (!ib) return;
    this.events.length = ib.eventIdx0;
  },
};

/* ================= 課程儲存（IndexedDB） ================= */
const LessonStore = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open('moke-lessons', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('lessons', { keyPath: 'id' });
      rq.onsuccess = () => { this._db = rq.result; res(this._db); };
      rq.onerror = () => rej(rq.error);
    });
  },
  async _tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('lessons', mode);
      const st = tx.objectStore('lessons');
      const out = fn(st);
      tx.oncomplete = () => res(out && out.result !== undefined ? out.result : null);
      tx.onerror = () => rej(tx.error);
    });
  },
  save(lesson) { return this._tx('readwrite', st => st.put(lesson)); },
  del(id) { return this._tx('readwrite', st => st.delete(id)); },
  get(id) {
    return this.open().then(db => new Promise((res, rej) => {
      const rq = db.transaction('lessons').objectStore('lessons').get(id);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    }));
  },
  list() {
    return this.open().then(db => new Promise((res, rej) => {
      const rq = db.transaction('lessons').objectStore('lessons').getAll();
      rq.onsuccess = () => {
        const arr = (rq.result || []).map(l => ({
          id: l.id, title: l.title, created: l.created, duration: l.duration,
          kb: Math.round(JSON.stringify(l.basePages).length / 1024 +
            l.events.reduce((a, e) => a + JSON.stringify(e).length, 0) / 1024 +
            l.audio.reduce((a, s) => a + (s.blob ? s.blob.size : 0), 0) / 1024)
        }));
        arr.sort((a, b) => b.created - a.created);
        res(arr);
      };
      rq.onerror = () => rej(rq.error);
    }));
  },
  // 匯出成 .json（音訊轉 base64）
  async exportFile(id) {
    const l = await this.get(id);
    if (!l) return null;
    const audio = [];
    for (const s of l.audio || []) {
      audio.push({ t0: s.t0, mime: s.mime, dataUrl: await blobToDataUrl(s.blob) });
    }
    const doc = Object.assign({}, l, { audio, app: 'moke', v: 1 });
    delete doc.id;
    return { name: '墨課_' + (l.title || '未命名') + '.moke.json', json: JSON.stringify(doc) };
  },
  // 匯入 .json
  async importFile(file) {
    const text = await file.text();
    const doc = JSON.parse(text);
    if (doc.app !== 'moke' || !doc.basePages) throw new Error('不是墨課課程檔');
    const audio = [];
    for (const s of doc.audio || []) {
      audio.push({ t0: s.t0, mime: s.mime, blob: dataUrlToBlob(s.dataUrl) });
    }
    const lesson = Object.assign({}, doc, { id: 'L' + Date.now(), audio });
    delete lesson.app; delete lesson.v;
    await this.save(lesson);
    return lesson;
  }
};
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ================= 重播引擎（播放器＋匯出器共用） ================= */
class LessonEngine {
  constructor(board, lesson) {
    this.board = board;
    this.lesson = lesson;
    this._base = JSON.stringify(lesson.basePages);
    this.pageFilter = null;   // v18：只重建該頁（null＝全域，不過濾）
    this.reset();
  }
  reset() {
    const pages = JSON.parse(this._base);
    this.board.pages = pages.map(p => ({ bg: p.bg, image: p.image, strokes: p.strokes || [], undo: [], redo: [] }));
    this.board.pageIndex = this.lesson.startPage || 0;
    this.evIdx = 0;
    this.anims = new Map();
    this.board.render();
  }
  async preloadImages() {
    for (const p of this.board.pages) {
      await new Promise(res => this.board.ensureImage(p, res));
    }
    this.board.render();
  }
  // 跳轉到指定時間（重播拖曳用）：重建該時間點前的所有狀態，不做動畫
  // v18 pageFilter：只套用該頁的筆跡事件，換頁事件跳過（停留在該頁）
  _acceptForPage(e) {
    const pf = this.pageFilter;
    if (pf === null || pf === undefined) return true;
    if (e.evt === 'page') return false;
    if ((e.evt === 'add' || e.evt === 'erase') && (!e.data || e.data.page !== pf)) return false;
    return true;
  }
  seek(tMs) {
    this.reset();
    const evs = this.lesson.events || [];
    while (this.evIdx < evs.length && evs[this.evIdx].t <= tMs) {
      const e = evs[this.evIdx++];
      if (this._acceptForPage(e)) this.board.applyRemote(e.evt, e.data);
    }
    if (this.pageFilter !== null && this.pageFilter !== undefined) {
      this.board.pageIndex = Math.max(0, Math.min(this.board.pages.length - 1, this.pageFilter));
    }
    this.anims.clear();
    this.board.render();
  }
  update(nowMs) {
    const evs = this.lesson.events || [];
    while (this.evIdx < evs.length && evs[this.evIdx].t <= nowMs) {
      const e = evs[this.evIdx++];
      if (!this._acceptForPage(e)) continue;
      if (e.evt === 'add' && e.data && e.data.stroke) {
        this.board.applyRemote('add', e.data);
        this.anims.set(e.data.stroke.id, { stroke: e.data.stroke, start: e.t });
      } else {
        this.board.applyRemote(e.evt, e.data);
      }
    }
    for (const [id, a] of this.anims) {
      if (nowMs - a.start >= Math.max(1, a.stroke.dur || 300)) this.anims.delete(id);
    }
    this._draw(nowMs);
  }
  _draw(nowMs) {
    const board = this.board, ctx = board.ctx, W = board._cssW, H = board._cssH;
    const pg = board.page;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    board._drawBg(ctx, pg, W, H);
    if (pg.image && pg._imgEl) {
      const img = pg._imgEl;
      const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    for (const s of pg.strokes) {
      const a = this.anims.get(s.id);
      const prog = a ? Math.min(1, (nowMs - a.start) / Math.max(1, s.dur || 300)) : 1;
      board.drawStroke(ctx, s, prog, W, H);
    }
    ctx.restore();
  }
}

/* ================= 播放器 ================= */
class LessonPlayer {
  constructor(canvas, lesson, ui) {
    this.board = new Board(canvas, { interactive: false });
    this.lesson = lesson;
    this.engine = new LessonEngine(this.board, lesson);
    this.ui = ui || {};
    this.clock = new LessonClock();
    this.segments = [];
    this.timers = [];
    this.activeAudio = null;
    this.playing = false;
    this.stopAt = null;          // nextStop 的目標時間
    this.pendingMarker = null;
    this.speed = 1;              // 變速重播（Doceri Playback Speed）
    this.atMarker = false;       // 是否正停在 Stop Marker（可接受 Live Overlay）
    this.atMarkerT = 0;
    this._raf = 0;
  }
  async prepare() {
    const wrap = this.board.canvas.parentElement;
    const r = wrap.getBoundingClientRect();
    this.board.setSize(Math.max(320, r.width), Math.max(240, r.height));
    await this.engine.preloadImages();
    this.segments = [];
    for (const s of this.lesson.audio || []) {
      const url = URL.createObjectURL(s.blob);
      let dur = 0;
      try { dur = await audioDuration(url); } catch (e) {}
      this.segments.push({ t0: s.t0, dur, url });
    }
    if (this.ui.onTime) this.ui.onTime(0, this.lesson.duration);
  }
  _scheduleAudio(fromMs) {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.activeAudio) { try { this.activeAudio.pause(); } catch (e) {} this.activeAudio = null; }
    const sp = this.speed || 1;
    for (const s of this.segments) {
      if (s.t0 + s.dur <= fromMs) continue;
      const delay = Math.max(0, s.t0 - fromMs) / sp;   // wall-clock 延遲隨速度縮放
      this.timers.push(setTimeout(() => {
        const a = new Audio(s.url);
        const offset = Math.max(0, (fromMs - s.t0) / 1000);
        a.currentTime = Math.min(offset, (s.dur / 1000) || 0);
        a.playbackRate = sp;                            // 聲音與筆跡保持同步
        a.play().catch(() => {});
        this.activeAudio = a;
      }, delay));
    }
  }
  /* 變速重播；播放中切換會用新速度重排聲音 */
  setSpeed(s) {
    this.speed = s > 0 ? s : 1;
    this.clock.setSpeed(this.speed);
    if (this.playing) this._scheduleAudio(this.clock.now());
  }
  play() {
    if (this.playing) return;
    this.playing = true;
    this.atMarker = false;
    this.clock.resume();
    this._scheduleAudio(this.clock.now());
    const step = () => {
      if (!this.playing) return;
      const now = this.clock.now();
      this.engine.update(now);
      if (this.ui.onTime) this.ui.onTime(now, this.lesson.duration);
      // 到達 Stop Marker → 自動靜止（進入 at-marker，可 Live Overlay）
      if (this.stopAt !== null && now >= this.stopAt) {
        const m = this.pendingMarker;
        this.atMarker = true;
        this.atMarkerT = m ? (resolveStopTime(this.lesson.events, m) ?? now) : now;
        this.pause();
        if (this.ui.onMarker) this.ui.onMarker(m);
        return;
      }
      if (now >= this.lesson.duration + 500) { this.pause(); if (this.ui.onEnd) this.ui.onEnd(); return; }
      this._raf = requestAnimationFrame(step);
    };
    step();
    if (this.ui.onState) this.ui.onState(true);
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.clock.pause();
    this.stopAt = null; this.pendingMarker = null;
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.activeAudio) { try { this.activeAudio.pause(); } catch (e) {} this.activeAudio = null; }
    if (this.ui.onState) this.ui.onState(false);
  }
  restart() {
    this.pause();
    this.atMarker = false;
    const sp = this.speed || 1;
    this.clock.reset(); this.clock.setSpeed(sp); this.engine.reset();
    this.play();
  }
  /* 播到下一個 Stop Marker 自動停（Doceri 靈魂）；無下一個時回傳 null；v27：標記綁筆跡 */
  _sortedStops() {
    const evts = (this.lesson && this.lesson.events) || [];
    return (this.lesson.stops || [])
      .map(s => ({ s, t: resolveStopTime(evts, s) }))
      .filter(x => x.t !== null)
      .sort((a, b) => a.t - b.t);
  }
  nextStop() {
    const stops = this._sortedStops();
    const t = this.clock.now();
    const next = stops.find(x => x.t > t + 50);
    if (!next) return null;
    this.stopAt = next.t;
    this.pendingMarker = next.s;
    if (!this.playing) this.play();
    return next.s;
  }
  /* 回到上一個 Marker（講錯可退回重講） */
  prevStop() {
    const stops = this._sortedStops();
    const t = this.clock.now();
    const prev = stops.reverse().find(x => x.t < t - 50);
    this.seek(prev ? prev.t : 0);
  }
  /* 雙擊 ⏭：瞬間呈現下一段的完成畫面（無動畫，Doceri 式控場） */
  revealNext() {
    const stops = this._sortedStops();
    const t = this.clock.now();
    const next = stops.find(x => x.t > t + 50);
    const wasPlaying = this.playing;
    this.seek(next ? next.t : this.lesson.duration);
    if (wasPlaying) this.pause();   // 雙擊是為了看完成畫面，不自動繼續播
    return next ? next.s : null;
  }
  seek(tMs) {
    tMs = Math.max(0, Math.min(this.lesson.duration, tMs));
    const wasPlaying = this.playing;
    this.pause();
    this.atMarker = false;
    const sp = this.speed || 1;
    this.clock.reset();
    this.clock.setSpeed(sp);
    this.clock.base = tMs;
    this.engine.seek(tMs);
    if (this.ui.onTime) this.ui.onTime(tMs, this.lesson.duration);
    if (wasPlaying) this.play();
  }
  close() {
    this.pause();
    this.segments.forEach(s => URL.revokeObjectURL(s.url));
  }
}

/* ================= 匯出影片 ================= */


/* ================= 主白板時間軸控制器（v12 統一時間軸） =================
 * Doceri 式：時間軸與書寫共存於同一畫布，沒有獨立的「重播模式」。
 * - playhead：畫布目前顯示的時間點；liveEdge：事件流末端（最後事件 t）。
 * - playhead 在 liveEdge → 即時書寫；playhead < liveEdge → 回放。
 * - 回放中落筆＝插入：SessionLog.insertBase 時間換算，後方事件/標記自動後移。
 * - 引擎直接操作主白板；events/stops 用 SessionLog 的 live 引用。
 */
class TimelineController {
  /* v47：每頁獨立時間軸（Doceri 式重構）。
   * - 時間軸資料在 board.page.tl（每頁自己的 events/stops/clock）
   * - 筆跡自帶 tlT（該頁時間軸時間，第一筆＝00:00）
   * - 播放＝依 tlT 顯示/隱藏筆跡，不重播事件、不動其他頁
   * - 換頁＝換整組時間軸物件，無需過濾、無需頁碼搬移
   */
  constructor(board, ui) {
    this.board = board;
    this.ui = ui || {};
    this.clock = new LessonClock();
    this.active = false;
    this.playing = false;
    this.playhead = 0;
    this.speed = 1;
    this.stopAt = null;
    this.pendingMarker = null;
    this._raf = 0;
  }
  /* 當前頁的時間軸 */
  get tl() {
    const pg = this.board.page;
    if (!pg.tl) pg.tl = { events: [], stops: [], clock: null, unadded: [] };
    return pg.tl;
  }
  /* 該頁時間軸終點＝最後一筆筆跡的 tlT */
  liveEdge() {
    let m = 0;
    for (const s of this.board.page.strokes) {
      const t = (s.tlT === undefined ? 0 : s.tlT);
      if (t > m) m = t;
    }
    // v97：也要考慮被擦除筆跡的擦除時間，否則重播播不到擦除動作
    const tl = this.board.page.tl;
    if (tl && tl.erased) {
      for (const { eraseT } of tl.erased) {
        if (eraseT > m) m = eraseT;
      }
    }
    return m;
  }
  isLive() { return this.playhead >= this.liveEdge() - 50; }

  activate() {
    if (this.active) return;
    this.active = true;
    this.playhead = this.liveEdge();
    this.board.tlCutoff = null;  // 即時＝全顯示
    this.board.render();
    this._ui();
  }
  deactivate() {
    this.pause();
    this.active = false;
    this.board.tlCutoff = null;  // 還原全顯示
    this.board.render();
  }

  /* 換頁時呼叫：切到新頁的時間軸（各頁記住自己的 playhead） */
  syncPage() {
    if (!this.active) return false;
    this.pause();
    // 記住舊頁的 playhead
    if (this._lastPage !== undefined && this._lastPage !== this.board.pageIndex) {
      // 舊頁已離開，不需特別處理（playhead 存在各頁可選）
    }
    this._lastPage = this.board.pageIndex;
    this.playhead = this.liveEdge();
    this.board.tlCutoff = null;
    this.board.render();
    return true;
  }

  /* 渲染到時間 t：只顯示 tlT <= t 的筆跡 */
  _renderAt(t) {
    this.board.tlCutoff = t;
    this.board.render();
  }
  goTo(t) {
    if (!this.active) return;
    t = Math.max(0, Math.min(this.liveEdge(), t));
    this.pause();
    this.playhead = t;
    this._renderAt(t);
    this._ui();
    if (this.ui.onNav) this.ui.onNav({ action: 'goto', t: Math.round(this.playhead) });
  }
  _seekClock(t) {
    const sp = this.speed > 0 ? this.speed : 1;
    this.clock.reset();
    this.clock.setSpeed(sp);
    this.clock.base = t;
  }
  _playTo(t, marker) {
    this.pause();
    this.stopAt = t;
    this.pendingMarker = marker;
    this.playing = true;
    this._seekClock(this.playhead);
    this.clock.resume();
    if (this.ui.onNav) this.ui.onNav({
      action: 'play', from: Math.round(this.playhead),
      speed: this.speed, stopAt: Math.round(t)
    });
    this._loop();
  }
  /* v51：播放到下一個 🚩 自動停（Doceri Stop Marker 式）。
   * 按播放→播到標記停→再按播放→播到下一個標記停。無標記時播到尾。 */
  play() {
    if (!this.active || this.playing || this.isLive()) return false;
    const next = this._sortedStops().find(x => x.t > this.playhead + 50);
    if (next) {
      this._playTo(next.t, next.s);
    } else {
      this._playTo(this.liveEdge(), null);
    }
    return true;
  }
  pause() {
    const wasPlaying = this.playing;
    if (!this.playing) { this.stopAt = null; this.pendingMarker = null; return; }
    this.playing = false;
    cancelAnimationFrame(this._raf);
    this.clock.pause();
    this.stopAt = null; this.pendingMarker = null;
    this._ui();
    if (wasPlaying && this.ui.onNav) this.ui.onNav({ action: 'pause', t: Math.round(this.playhead) });
  }
  /* 標記綁筆跡：回傳 [{s, t}]，t 為筆跡的 tlT */
  _sortedStops() {
    const tl = this.tl;
    const strokes = this.board.page.strokes;
    const byId = new Map(strokes.map(s => [s.id, s]));
    return tl.stops
      .map(m => {
        const st = byId.get(m.strokeId);
        return st ? { s: m, t: (st.tlT === undefined ? 0 : st.tlT) } : null;
      })
      .filter(x => x !== null)
      .sort((a, b) => a.t - b.t);
  }
  /* 在該頁時間軸新增標記（綁到最後一筆筆跡） */
  addStop() {
    const strokes = this.board.page.strokes;
    if (!strokes.length) return null;
    // v57：標記綁 playhead 位置的筆跡（拉回時間軸可隨意標記）
    // 找 tlT ≤ playhead 的最大筆跡；若 playhead 在最前，則綁第一筆
    const ph = this.active ? this.playhead : Infinity;
    let target = null;
    for (const s of strokes) {
      const t = (s.tlT === undefined ? 0 : s.tlT);
      if (t <= ph + 50) {
        if (!target || t > (target.tlT === undefined ? 0 : target.tlT)) target = s;
      }
    }
    if (!target) {
      // playhead 在所有筆跡之前，綁第一筆
      target = strokes[0];
      for (const s of strokes) {
        const t = (s.tlT === undefined ? 0 : s.tlT);
        const tt = (target.tlT === undefined ? 0 : target.tlT);
        if (t < tt) target = s;
      }
    }
    const m = { id: 'm' + Date.now().toString(36), strokeId: target.id, label: '' };
    this.tl.stops.push(m);
    this.renumberStops();
    return m;
  }
  renumberStops() {
    const sorted = this._sortedStops();
    sorted.forEach((x, i) => { x.s.label = '段落 ' + (i + 1); });
  }
  /* ◀| |▶ 單筆進退：跳到上一／下一筆筆跡的 tlT */
  prevStroke() {
    if (!this.active) return null;
    const strokes = this.board.page.strokes
      .map(s => (s.tlT === undefined ? 0 : s.tlT))
      .filter(t => t < this.playhead - 50)
      .sort((a, b) => a - b);
    const t = strokes.length ? strokes[strokes.length - 1] : 0;
    this.goTo(t);
    return t;
  }
  nextStroke() {
    if (!this.active) return null;
    const strokes = this.board.page.strokes
      .map(s => (s.tlT === undefined ? 0 : s.tlT))
      .filter(t => t > this.playhead + 50)
      .sort((a, b) => a - b);
    if (strokes.length) { this.goTo(strokes[0]); return strokes[0]; }
    if (!this.isLive()) { this.goTo(this.liveEdge()); return 'tolive'; }
    return 'live';
  }
  nextStop() {
    if (!this.active) return null;
    const next = this._sortedStops().find(x => x.t > this.playhead + 50);
    if (!next) {
      if (this.isLive()) return 'live';
      this._playTo(this.liveEdge(), null);
      return 'tolive';
    }
    this._playTo(next.t, next.s);
    return next.s;
  }
  prevStop() {
    if (!this.active) return;
    const prev = this._sortedStops().reverse().find(x => x.t < this.playhead - 50);
    this.goTo(prev ? prev.t : 0);
  }
  revealNext() {
    if (!this.active) return null;
    const next = this._sortedStops().find(x => x.t > this.playhead + 50);
    this.goTo(next ? next.t : this.liveEdge());
    return next ? next.s : null;
  }
  setSpeed(s) {
    this.speed = s > 0 ? s : 1;
    this.clock.setSpeed(this.speed);
  }
  _loop = () => {
    if (!this.playing) return;
    const now = this.clock.now();
    const live = this.liveEdge();
    if (this.stopAt !== null && now >= this.stopAt) {
      const m = this.pendingMarker;
      this.playhead = this.stopAt;
      this._renderAt(this.playhead);
      this.pause();
      if (this.ui.onMarker) this.ui.onMarker(m);
      this._ui();
      return;
    }
    if (now >= live) {
      this.playhead = live;
      this._renderAt(live);
      this.pause();
      this._ui();
      return;
    }
    this.playhead = now;
    this._renderAt(now);
    this._ui();
    this._raf = requestAnimationFrame(this._loop);
  };
  /* 新筆跡進入（app.js dispatcher 呼叫）
   * v48：無論是否在 live 都重繪——下拉開著寫字時，畫布也要即時看到新筆跡 */
  onEventAppended() {
    if (!this.active) return;
    const live = this.liveEdge();
    if (this.playhead >= live - 100) {
      this.playhead = live;
      this.board.tlCutoff = null;
    }
    this.board.render();
    this._ui();
  }
  _ui() {
    if (this.ui.onTime) this.ui.onTime(this.playhead, this.liveEdge());
    if (this.ui.onPlayState) this.ui.onPlayState(this.playing);
  }
}


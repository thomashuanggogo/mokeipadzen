/* 墨課 · 白板核心 board.js
 * 純 Canvas 白板：座標以相對比例(0~1)儲存，換解析度不失真。
 * 筆跡事件透過 onEvent 回報給錄課引擎（lesson.js）。
 */
'use strict';

class Board {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { desynchronized: true });  // v77：跳過合成器同步，降一幀延遲
    this.interactive = !opts || opts.interactive !== false;
    this.pages = [this._newPage('white')];
    this.pageIndex = 0;
    this.tool = 'pen';
    this.color = '#111111';
    this.width = 5;
    this.textSize = 48;
    this.onEvent = null;          // (type, data) => void，由 app.js 接錄影
    this.onDrawStart = null;      // 落筆前鉤子（時間軸：回放中落筆＝插入）
    this.onDrawEnd = null;        // 提筆後鉤子
    this.tlCutoff = null;         // v47：時間軸回放過濾（null＝全顯示，否則只畫 tlT <= cutoff 的筆跡）
    this._tlPlayhead = null;        // v47：回放中落筆時，筆跡的時間（null＝用自然時間）
    this.lockDraw = false;          // v50：時間軸打開時鎖定書寫
    this.onLockDraw = null;         // v50：鎖定時嘗試書寫的回調（提示用）
    this._strokeSeq = 1;
    this._lastActivity = 0;       // v101：最後動作時間（performance.now），5 秒閒置自動暫停時鐘
    this._drawing = null;         // 進行中的筆跡
    this._shapeDrag = null;       // 進行中的圖形
    this._laserTrail = [];        // 雷射筆暫存 [{x,y,at}]
    this._laserTicking = false;
    this._cssW = 0; this._cssH = 0;
    // v42：雙指縮放視圖 {scale, ox, oy}（scale=縮放倍率，ox/oy=CSS px 偏移）
    this.view = { scale: 1, ox: 0, oy: 0 };
    this._pinch = null;  // 進行中的雙指手勢 {p1, p2, d0, scale0, mx0, my0, ox0, oy0}
    this._pointers = new Map();  // pointerId -> {x, y}
    // v73：底圖調整模式（匯入圖片後可調大小/位置）
    this.imgAdjust = false;
    this._imgDrag = null;  // 單指拖曳底圖 {x0, y0, imgX0, imgY0}
    // v76：手指寫字開關（預設關＝只有 Apple Pencil 能畫，防手掌誤觸）
    this.fingerDraw = true;  // v104：預設手指可寫（南勛：預設手寫，用 Apple Pencil 再按開關切換）
    // 幾何規尺（v14）：由 app.js 設定
    this.ruler = null;            // {x,y,angle,len,wd} px，null=隱藏
    this.protractor = null;       // {x,y,angle,R} px，null=隱藏
    this.overlay = null;          // (ctx,W,H)=>void，render() 結尾繪製
    this.overlayHit = null;       // (p)=>bool，命中規尺本體（移動/旋轉）
    this.onOverlayDown = null;    // (p)=>void，開始規尺拖曳

    this._bindPointer();
    this.resize();
  }

  /* 固定尺寸（播放器 / 影片匯出用，不依賴父容器） */
  setSize(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this._cssW = w; this._cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  /* ---------- 頁面 ---------- */
  _newPage(bg) {
    // v47：每頁獨立時間軸（Doceri 式）— events/stops/clock 都是該頁自己的，
    // 不再用全域 SessionLog + page 標籤過濾。換頁＝換整組時間軸，不可能串頁。
    // v73：底圖變換（使用者可調大小/位置）— imgS 縮放、imgX/imgY 位移
    return {
      bg: bg || 'white', image: null, strokes: [], undo: [], redo: [],
      imgS: 1, imgX: 0, imgY: 0,
      tl: { events: [], stops: [], clock: null, unadded: [] }
    };
  }
  get page() { return this.pages[this.pageIndex]; }
  pageCount() { return this.pages.length; }

  addPage() {
    const idx = this.insertPage(this.pageIndex + 1, this.page.bg, null);
    this.gotoPage(idx); // 觸發 'page' 事件
  }
  /** 在指定位置插入一頁（PDF 整份匯入用）；會發出 'addpage' 事件，錄影/分享可重現 */
  insertPage(index, bg, imageDataUrl, record = true) {
    index = Math.max(0, Math.min(this.pages.length, index | 0));
    const pg = this._newPage(bg || 'white');
    pg.image = imageDataUrl || null;
    this.pages.splice(index, 0, pg);
    if (index <= this.pageIndex) this.pageIndex++;
    if (record) this._emit('addpage', { page: index, bg: pg.bg, image: imageDataUrl || null });
    this.render();
    return index;
  }
  delPage() {
    if (this.pages.length <= 1) { this.clearPage(false); return; }
    const idx = this.pageIndex;
    this.pages.splice(idx, 1);
    if (this.pageIndex >= this.pages.length) this.pageIndex = this.pages.length - 1;
    this._emit('delpage', { page: idx });
    this._emit('page', { page: this.pageIndex });
    this.render();
  }
  gotoPage(i) {
    i = Math.max(0, Math.min(this.pages.length - 1, i));
    if (i === this.pageIndex) return;
    this.pageIndex = i;
    this._emit('page', { page: i });
    this.render();
  }

  /* ---------- 背景 / 底圖 ---------- */
  setBackground(bg) {
    this.page.bg = bg;
    this._emit('bg', { page: this.pageIndex, bg });
    this.render();
  }
  setImage(dataUrl) {
    this.page.image = dataUrl;
    this._emit('image', { page: this.pageIndex, dataUrl });
    this.render();
  }
  clearImage() {
    this.page.image = null;
    this._emit('image', { page: this.pageIndex, dataUrl: null });
    this.render();
  }

  /* ---------- 工具 ---------- */
  setTool(t) {
    // v111：切換工具時清除套索選取（選完轉完後，切回筆框框就消失）
    if (t !== 'lasso' && this._lassoSel) {
      this._lassoSel = null;
      this._lassoPath = null;
      if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      this.render();
    }
    this.tool = t;
  }
  setColor(c) { this.color = c; }
  setWidth(w) { this.width = w; }
  setTextSize(s) { this.textSize = s; }

  /* ---------- 筆跡操作 ---------- */
  /* v47：每頁獨立時間軸。事件寫入當頁的 tl.events，時間是該頁時鐘（第一筆為 00:00）。
   * 不再經由全域 SessionLog，不再需要 page 標籤。
   * 回放中落筆（TLC.active 且不在 live）：用 playhead 時間，讓筆跡落在回放位置。 */
  _emit(type, data) {
    const pg = this.page;
    if (pg && pg.tl) {
      const tl = pg.tl;
      if (!tl.clock) {
        tl.clock = new LessonClock();
        tl.clock.start();
      }
      let t = Math.round(tl.clock.now());
      // v99：時間戳最小為 1，避免 tlT=0 在 cutoff=0 時被顯示（拉到最前應為空白）
      if (t < 1) t = 1;
      // v101：任何時間軸事件都算動作（復原/重做按鈕不走 _down，這裡補上）
      this._lastActivity = performance.now();
      if (tl.clock && !tl.clock.running) tl.clock.resume();
      // v47：回放中落筆，用 playhead 時間（需 app.js 設定 board._tlPlayhead）
      if (this._tlPlayhead !== null && this._tlPlayhead !== undefined && type === 'add') {
        t = Math.round(this._tlPlayhead);
      }
      if (type === 'add' && data && data.stroke && data.stroke.tlT === undefined) {
        data.stroke.tlT = t;
      }
      tl.events.push({ t, evt: type, data: data || {} });
    }
    if (this.onEvent) this.onEvent(type, data);
  }

  _newStroke(tool, extra) {
    const s = Object.assign({
      id: this._strokeSeq++, tool, color: this.color,
      width: this.width, pts: [], t0: 0, dur: 0, page: this.pageIndex
    }, extra || {});
    return s;
  }

  addStroke(stroke, record = true) {
    stroke.page = this.pageIndex;
    this.page.strokes.push(stroke);
    this.page.undo.push(stroke);
    this.page.redo.length = 0;
    if (record) this._emit('add', { page: this.pageIndex, stroke });
    this.render();
    return stroke;
  }

  _r4(v) { return Math.round(v * 10000) / 10000; } // 座標取小數4位，0.1px 精度，省一半空間

  addText(fx, fy, text, size) {
    if (!text || !text.trim()) return null;
    const s = this._newStroke('text', { fx: this._r4(fx), fy: this._r4(fy), text: text.trim(), size: size || this.textSize });
    return this.addStroke(s);
  }

  eraseAt(fx, fy) {
    const x = fx * this._cssW, y = fy * this._cssH;
    const removed = [];
    const keep = [];
    for (const s of this.page.strokes) {
      if (this._hitStroke(s, x, y)) removed.push(s); else keep.push(s);
    }
    if (!removed.length) return;
    this.page.strokes = keep;
    // 從 undo 堆疊移除
    const ids = new Set(removed.map(s => s.id));
    this.page.undo = this.page.undo.filter(s => !ids.has(s.id));
    this.page.redo.push(...removed);
    // v96：記錄擦除時間，供重播時判斷顯示/隱藏
    const eraseT = this.page.tl && this.page.tl.clock ? Math.round(this.page.tl.clock.now()) : 0;
    if (!this.page.tl.erased) this.page.tl.erased = [];
    for (const s of removed) {
      this.page.tl.erased.push({ stroke: s, eraseT });
    }
    this._emit('erase', { page: this.pageIndex, ids: removed.map(s => s.id) });  // v94：橡皮擦＝時間軸事件，重播時會看到擦除動作
    this.render();
  }

  _hitStroke(s, x, y) {
    const W = this._cssW, H = this._cssH;
    const tol = Math.max(14, s.width * (W / 1000) + 8);
    if (s.tool === 'text') {
      const sx = s.fx * W, sy = s.fy * H;
      return Math.hypot(x - sx, y - sy) < Math.max(30, s.size * (W / 1000));
    }
    if (s.tool === 'shape') {
      const x0 = s.fx0 * W, y0 = s.fy0 * H, x1 = s.fx1 * W, y1 = s.fy1 * H;
      for (const sg of this._shapeSegments(s.shape, x0, y0, x1, y1)) {
        if (this._distToSeg(x, y, sg[0], sg[1], sg[2], sg[3]) < tol) return true;
      }
      return false;
    }
    for (let i = 1; i < s.pts.length; i++) {
      const ax = s.pts[i-1][1] * W, ay = s.pts[i-1][2] * H;
      const bx = s.pts[i][1] * W, by = s.pts[i][2] * H;
      if (this._distToSeg(x, y, ax, ay, bx, by) < tol) return true;
    }
    // 單點
    if (s.pts.length === 1) {
      return Math.hypot(x - s.pts[0][1] * W, y - s.pts[0][2] * H) < tol;
    }
    return false;
  }

  _distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // 圖形各線段（橡皮擦 hit-test 用），與 _strokeShape 的繪製一致
  _shapeSegments(shape, x0, y0, x1, y1) {
    const segs = [];
    const line = (ax, ay, bx, by) => segs.push([ax, ay, bx, by]);
    if (shape === 'line' || shape === 'arrow') {
      line(x0, y0, x1, y1);
    } else if (shape === 'rect') {
      line(x0, y0, x1, y0); line(x1, y0, x1, y1); line(x1, y1, x0, y1); line(x0, y1, x0, y0);
    } else if (shape === 'ellipse') {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      let px = cx + rx, py = cy;
      for (let i = 1; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const qx = cx + rx * Math.cos(a), qy = cy + ry * Math.sin(a);
        line(px, py, qx, qy); px = qx; py = qy;
      }
    } else if (shape === 'rtriangle') {
      line(x0, y1, x0, y0); line(x0, y0, x1, y1); line(x1, y1, x0, y1);
    } else if (shape === 'parallelogram') {
      const sx = (x1 - x0) * 0.25;
      line(x0 + sx, y0, x1, y0); line(x1, y0, x1 - sx, y1);
      line(x1 - sx, y1, x0, y1); line(x0, y1, x0 + sx, y0);
    } else if (shape === 'axes') {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const hw = Math.abs(x1 - x0) / 2, hh = Math.abs(y1 - y0) / 2;
      line(cx - hw, cy, cx + hw, cy);
      line(cx, cy + hh, cx, cy - hh);
    }
    return segs;
  }

  undo() {
    const s = this.page.undo.pop();
    if (!s) return;
    this.page.strokes = this.page.strokes.filter(x => x.id !== s.id);
    this.page.redo.push(s);
    this._emit('unadd', { page: this.pageIndex, id: s.id });  // v25：復原＝從時間軸移除該筆（同步刪除它的時間）
    this.render();
  }
  redo() {
    const s = this.page.redo.pop();
    if (!s) return;
    this.page.strokes.push(s);
    // v96：重做恢復被擦除的筆跡時，從 erased 記錄移除（避免重播時重複繪製）
    if (this.page.tl && this.page.tl.erased) {
      this.page.tl.erased = this.page.tl.erased.filter(e => e.stroke.id !== s.id);
    }
    this.page.undo.push(s);
    this._emit('readd', { page: this.pageIndex, id: s.id, stroke: s });  // v25：重做＝恢復該筆的時間軸紀錄
    this.render();
  }
  clearPage(keepImage = true) {
    if (!this.page.strokes.length && !this.page.image) return;
    const pg = this.page;
    pg.strokes = [];
    pg.undo = [];
    pg.redo = [];
    // v74：預設保留底圖（清除筆跡≠清除圖片）；只有刪到剩最後一頁時才清圖片
    if (!keepImage) {
      pg.image = null;
      pg._imgEl = null;
      pg.imgS = 1; pg.imgX = 0; pg.imgY = 0;
    }
    // v47：清除該頁時間軸（事件＋標記＋時鐘重置，下次從 00:00 開始）
    // 不經過 _emit（避免重建時鐘），直接清空
    if (pg.tl) {
      pg.tl.events = [];
      pg.tl.stops = [];
      pg.tl.clock = null;
      pg.tl.unadded = [];
      pg.tl.erased = [];  // v96：清除擦除記錄
    }
    // 通知 UI（不寫入時間軸）
    if (this.onEvent) this.onEvent('clear', { page: this.pageIndex });
    this.render();
  }

  /* ---------- 輸入 ---------- */
  _bindPointer() {
    if (!this.interactive) return;
    const cv = this.canvas;
    cv.addEventListener('pointerdown', e => this._down(e));
    cv.addEventListener('pointermove', e => this._move(e));
    cv.addEventListener('pointerup', e => this._up(e));
    cv.addEventListener('pointercancel', e => this._up(e));
  }
  _pos(e, rect) {
    const r = rect || this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    // v42：螢幕座標 → 畫布座標（考慮縮放平移），再轉正規化座標
    const v = this.view;
    const cx = (sx - v.ox) / v.scale, cy = (sy - v.oy) / v.scale;
    return { x: sx, y: sy, cx, cy, fx: cx / r.width, fy: cy / r.height };
  }
  /* 形狀拖曳開始：快照畫布，拖曳中只還原快照＋畫預覽，不重繪整頁（v19） */
  _beginShapeDrag(d) {
    this._shapeDrag = d;
    this._shapeSnap = null;
    try {
      const c = document.createElement('canvas');
      c.width = this.canvas.width; c.height = this.canvas.height;
      const cx = c.getContext('2d');
      if (cx && c.width > 0) { cx.drawImage(this.canvas, 0, 0); this._shapeSnap = c; }
    } catch (err) { this._shapeSnap = null; }
  }
  /* v101：任何動作都喚醒時鐘（5 秒閒置暫停後，下筆/擦除等繼續走） */
  pokeActivity() {
    this._lastActivity = performance.now();
    const tl = this.page && this.page.tl;
    if (tl && tl.clock && !tl.clock.running) {
      tl.clock.resume();
    }
  }
  /* v104：手抓工具—點中文字就開始拖曳 */
  _handDown(p) {
    // 從上往下找最頂的文字筆跡（hit test：點在文字範圍內）
    const W = this._cssW, H = this._cssH;
    for (let i = this.page.strokes.length - 1; i >= 0; i--) {
      const s = this.page.strokes[i];
      if (s.tool !== 'text') continue;
      // 估算文字框範圍（用 canvas 量文字寬度）
      const k = W / 1000;
      const ctx = this.ctx;
      ctx.save();
      ctx.font = `${(s.size || 48) * k}px "PingFang TC","Microsoft JhengHei",sans-serif`;
      const tw = ctx.measureText(s.text || '').width;
      ctx.restore();
      const x0 = s.fx * W, y0 = s.fy * H;
      const pad = 12;  // 觸控寬容
      if (p.x >= x0 - pad && p.x <= x0 + tw + pad &&
          p.y >= y0 - pad && p.y <= y0 + (s.size || 48) * k + pad) {
        // v104：第一次拖曳時記下原始位置（重播時 cutoff 在移動前要用舊位置）
        // v108：也記原始旋轉角
        if (s._origFx === undefined) { s._origFx = s.fx; s._origFy = s.fy; s._origRot = s.rot || 0; }
        this._handDrag = { stroke: s, dx: p.x - x0, dy: p.y - y0, moved: false,
                           fx0: s.fx, fy0: s.fy };
        this.pokeActivity();
        return;
      }
    }
    // 沒點中文字：不做事（畫布平移用雙指）
  }
  /* v105：套索工具 */
  _lassoDown(p) {
    // 如果已有選取且點在選取內→開始拖曳整個選取
    if (this._lassoSel && this._lassoSel.length) {
      if (this._pointInSelection(p.cx, p.cy)) {
        this._lassoDrag = { x0: p.cx, y0: p.cy, moved: false,
          orig: this._lassoSel.map(s => ({ s, fx: s.fx, fy: s.fy,
            fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
            pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2]]) : null })) };
        // 記原始位置（重播用）
        for (const s of this._lassoSel) {
          if (s._origFx === undefined) {
            s._origFx = s.fx; s._origFy = s.fy; s._origRot = s.rot || 0;
            s._origFx0 = s.fx0; s._origFy0 = s.fy0;
            s._origFx1 = s.fx1; s._origFy1 = s.fy1;
            s._origPts = s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2]]) : null;
          }
        }
        this.pokeActivity();
        return;
      }
    }
    // 否則：開始新的套索路徑（清除舊選取）
    this._lassoSel = null;
    if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
    this._lassoPath = [{ x: p.cx, y: p.cy }];  // v105：用畫布座標（cx/cy），與筆跡一致
    this.pokeActivity();
  }
  /* v107：旋轉套索選取（angleDeg，正＝順時針）
     v110：silent=true 時不發時間軸事件（手勢連續旋轉用，結束時統一發一次） */
  rotateSelection(angleDeg, silent) {
    if (!this._lassoSel || !this._lassoSel.length) return;
    const bb = this._lassoBBox();
    if (!bb) return;
    const W = this._cssW, H = this._cssH;
    // 中心點（正規化座標）
    const cx = ((bb.x0 + bb.x1) / 2) / W;
    const cy = ((bb.y0 + bb.y1) / 2) / H;
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // 注意：x 和 y 的尺度不同（W vs H），旋轉時要考慮長寬比
    // 為了視覺正確，在像素空間做旋轉再轉回正規化
    const cxPx = (bb.x0 + bb.x1) / 2, cyPx = (bb.y0 + bb.y1) / 2;
    const rotPx = (px, py) => {
      const dx = px - cxPx, dy = py - cyPx;
      return [cxPx + dx * cos - dy * sin, cyPx + dx * sin + dy * cos];
    };
    for (const s of this._lassoSel) {
      // 記原始位置（重播用）
      if (s._origFx === undefined) {
        s._origFx = s.fx; s._origFy = s.fy;
        s._origFx0 = s.fx0; s._origFy0 = s.fy0;
        s._origFx1 = s.fx1; s._origFy1 = s.fy1;
        s._origPts = s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2]]) : null;
      }
      if (s.tool === 'text' && s.fx !== undefined) {
        const [nx, ny] = rotPx(s.fx * W, s.fy * H);
        s.fx = this._r4(nx / W); s.fy = this._r4(ny / H);
        // v108：文字本身也旋轉（累計角度，不變形）
        s.rot = ((s.rot || 0) + angleDeg) % 360;
      } else if (s.tool === 'shape' && s.fx0 !== undefined) {
        // v109：圖形不轉角點（會變形），改轉中心＋累計角度
        const scx = (s.fx0 + s.fx1) / 2 * W, scy = (s.fy0 + s.fy1) / 2 * H;
        const [ncx, ncy] = rotPx(scx, scy);
        const w2 = (s.fx1 - s.fx0) / 2, h2 = (s.fy1 - s.fy0) / 2;
        s.fx0 = this._r4(ncx / W - w2); s.fx1 = this._r4(ncx / W + w2);
        s.fy0 = this._r4(ncy / H - h2); s.fy1 = this._r4(ncy / H + h2);
        s.rot = ((s.rot || 0) + angleDeg) % 360;
      } else if (s.pts) {
        s.pts = s.pts.map(pt => {
          const [nx, ny] = rotPx(pt[1] * W, pt[2] * H);
          return [pt[0], this._r4(nx / W), this._r4(ny / H)];
        });
      }
      // 發時間軸事件（silent 時跳過，手勢結束統一發）
      if (!silent) this._emit('move', { page: this.pageIndex, id: s.id, rotate: angleDeg });
    }
    this.pokeActivity();
    this.render();
    // 旋轉後立即暫停時鐘（視為一次動作完成）
    const tl = this.page && this.page.tl;
    if (tl && tl.clock && tl.clock.running) {
      tl.clock.pause();
      const lastT = Math.round(this._liveEdgeT());
      tl.clock.base = lastT;
      if (typeof window !== 'undefined' && window._mokeSyncTime) {
        window._mokeSyncTime(lastT);
      }
    }
  }
  /* v105：套索圈選—任一關鍵點在多邊形內就選中 */
  _selectInLasso(poly) {
    const W = this._cssW, H = this._cssH;
    const sel = [];
    for (const s of this.page.strokes) {
      const pts = this._strokePointsPx(s, W, H);
      for (const [px, py] of pts) {
        if (this._pointInPoly(px, py, poly)) { sel.push(s); break; }
      }
    }
    return sel.length ? sel : null;
  }
  /* 點是否在目前選取的包圍盒內（含寬容） */
  _pointInSelection(x, y) {
    const bb = this._lassoBBox();
    if (!bb) return false;
    const pad = 20;
    return x >= bb.x0 - pad && x <= bb.x1 + pad && y >= bb.y0 - pad && y <= bb.y1 + pad;
  }
  _lassoBBox() {
    if (!this._lassoSel || !this._lassoSel.length) return null;
    const W = this._cssW, H = this._cssH;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of this._lassoSel) {
      const pts = this._strokePointsPx(s, W, H);
      for (const [px, py] of pts) {
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { x0, y0, x1, y1 };
  }
  /* 取筆跡的所有關鍵點（像素座標），供包圍盒與套索包含測試
     v111：shape/text 若有 s.rot，回傳旋轉後的四角（選取框才會跟著轉） */
  _strokePointsPx(s, W, H) {
    const pts = [];
    const rot = (s.rot || 0) * Math.PI / 180;
    const rotPt = (px, py, cx, cy) => {
      if (!rot) return [px, py];
      const dx = px - cx, dy = py - cy;
      return [cx + dx * Math.cos(rot) - dy * Math.sin(rot),
              cy + dx * Math.sin(rot) + dy * Math.cos(rot)];
    };
    if (s.tool === 'text') {
      // 文字繞 (fx,fy) 旋轉，取錨點即可（選取框用）
      pts.push([s.fx * W, s.fy * H]);
    } else if (s.tool === 'shape') {
      const x0 = s.fx0 * W, y0 = s.fy0 * H, x1 = s.fx1 * W, y1 = s.fy1 * H;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // 四角都轉，取旋轉後的實際範圍
      pts.push(rotPt(x0, y0, cx, cy), rotPt(x1, y0, cx, cy),
               rotPt(x0, y1, cx, cy), rotPt(x1, y1, cx, cy));
    } else if (s.pts) {
      for (const pt of s.pts) pts.push([pt[1] * W, pt[2] * H]);
    }
    return pts;
  }
  /* 點是否在多邊形內（ray casting） */
  _pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
  /* v105：取筆跡在指定 cutoff 時間的位置（考慮 move 事件）
   * 如果 cutoff 在第一次移動之前，返回原始位置；否則返回 null（用當前值） */
  _strokePosAt(s, cutoff) {
    // 沒移動過
    if (s._origFx === undefined && s._origPts === undefined && s._origFx0 === undefined) {
      return null;
    }
    const evts = (this.page.tl && this.page.tl.events) || [];
    for (const e of evts) {
      if (e.evt === 'move' && e.data && e.data.id === s.id && e.t <= cutoff) {
        return null;  // cutoff 在某次移動之後（含），用當前值（最終位置）
      }
    }
    // cutoff 在所有移動之前，用原始位置（含原始旋轉角）
    if (s._origPts) return { pts: s._origPts };
    if (s._origFx0 !== undefined) return { fx0: s._origFx0, fy0: s._origFy0, fx1: s._origFx1, fy1: s._origFy1, rot: s._origRot || 0 };
    return { fx: s._origFx, fy: s._origFy, rot: s._origRot || 0 };
  }
  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    // v101：有動作就喚醒時鐘（5 秒閒置自動暫停後，下筆繼續走）
    this.pokeActivity();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    this._pointers.set(e.pointerId, { x: px, y: py });
    const now = performance.now();
    // v42：雙指手勢（縮放／平移）優先於 v20 雙指復原
    if (this._pointers.size === 2) {
      // 取消進行中的繪製（暫存，供之後判斷是否為輕觸復原）
      if (this._drawing || this._erasing || this._shapeDrag) {
        this._pinchCandidate = { drawing: this._drawing, t0: now };
        this._drawing = null; this._erasing = null; this._shapeDrag = null;
        this._shapeSnap = null;
        this.render();
      } else {
        this._pinchCandidate = { drawing: null, t0: now };
      }
      const [p1, p2] = [...this._pointers.values()];
      this._pinch = {
        d0: Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
        a0: Math.atan2(p2.y - p1.y, p2.x - p1.x),  // v110：雙指旋轉用
        scale0: this.view.scale,
        mx0: (p1.x + p2.x) / 2, my0: (p1.y + p2.y) / 2,
        ox0: this.view.ox, oy0: this.view.oy,
        imgS0: this.page.imgS || 1,  // v73：底圖調整用
        moved: false
      };
      return;
    }
    if (this._pointers.size > 2) return;  // 三指以上忽略
    // v76：Apple Pencil / 手指分離（防手掌誤觸）
    // fingerDraw=false 時，只有 pen（Apple Pencil）和 mouse 能畫圖，touch（手指/手掌）忽略
    if (!this.fingerDraw && e.pointerType === 'touch') {
      // 單指 touch 不畫圖，直接返回（雙指縮放已在上方處理）
      this._pointers.delete(e.pointerId);
      return;
    }
    // v20：雙指輕觸＝復原上一步（已由上方雙指邏輯接管，此處保留單指流程）
    const p = this._pos(e);
    // 規尺本體（移動／旋轉）：交給 app.js 的 overlay 手勢
    if (this.overlayHit && this.overlayHit(p)) { if (this.onOverlayDown) this.onOverlayDown(p); return; }
    if (this.tool === 'laser') { this._laser(p.x, p.y); return; }
    // v50：時間軸打開時鎖定書寫（只能拉時間軸；雙指縮放不受影響）
    if (this.lockDraw) {
      if (this.onLockDraw) this.onLockDraw();
      this._pointers.delete(e.pointerId);
      return;
    }
    // v73：底圖調整模式—單指拖曳移動底圖（不繪製）
    if (this.imgAdjust && this.page.image) {
      const pg = this.page;
      this._imgDrag = { x0: px, y0: py, imgX0: pg.imgX || 0, imgY0: pg.imgY || 0 };
      return;
    }
    if (this.onDrawStart) this.onDrawStart();
    // v104：手抓工具—拖曳移動文字（不繪製）
    if (this.tool === 'hand') { this._handDown(p); return; }
    // v105：套索工具—框選或拖曳已選筆跡
    if (this.tool === 'lasso') { this._lassoDown(p); return; }
    if (this.tool === 'eraser') { this.eraseAt(p.fx, p.fy); this._erasing = true; return; }
    if (this.tool === 'text') { if (this.onTextTap) this.onTextTap(p.fx, p.fy); return; }
    if (['line', 'arrow', 'rect', 'ellipse', 'rtriangle', 'parallelogram', 'axes'].includes(this.tool)) {
      this._beginShapeDrag({ shape: this.tool, fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy, t: performance.now() });
      return;
    }
    if (this.tool === 'compass') {
      // 圓規：圓心鎖定，拖曳定半徑
      this._beginShapeDrag({ shape: 'ellipse', fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy, t: performance.now(), _cx: p.fx, _cy: p.fy, _compass: true });
      return;
    }
    // pen / highlighter：先檢查規尺吸附
    if (this.tool === 'pen' || this.tool === 'highlighter') {
      if (this.ruler) {
        const s = this._rulerSnap(p);
        if (s) {
          this._beginShapeDrag({ shape: 'line', fx0: s.fx, fy0: s.fy, fx1: s.fx, fy1: s.fy, t: performance.now(), _ruler: true });
          return;
        }
      }
      if (this.protractor) {
        const s = this._protractorSnap(p);
        if (s) {
          this._beginShapeDrag({ shape: 'line', fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1, t: performance.now(), _protractor: true, _deg: s.deg });
          return;
        }
      }
    }
    const s = this._newStroke(this.tool);
    s.pts.push([0, p.fx, p.fy]);
    s._startPerf = performance.now();
    s._drawn = 0;
    s._renderGen = this._renderGen || 0;
    s._downT = now;      // v20：雙指復原手勢用
    s._moved = false;
    this._drawing = s;
    this._drawLiveSegment(s);  // 落筆即出墨，不等 move（v19）
  }
  _move(e) {
    // v103：移動中也算動作（長筆畫不會被 5 秒閒置暫停）
    if (this._drawing || this._erasing || this._shapeDrag) {
      this._lastActivity = performance.now();
    }
    // v42：更新 pointer 位置；雙指縮放／平移
    if (this._pointers.has(e.pointerId)) {
      const rect = this.canvas.getBoundingClientRect();
      this._pointers.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    // v104：手抓拖曳文字
    if (this._handDrag) {
      const d = this._handDrag;
      const p2 = this._pos(e);
      d.stroke.fx = this._r4((p2.x - d.dx) / this._cssW);
      d.stroke.fy = this._r4((p2.y - d.dy) / this._cssH);
      d.moved = true;
      this._lastActivity = performance.now();
      this.render();
      return;
    }
    // v105：套索路徑繪製中
    if (this._lassoPath) {
      const p2 = this._pos(e);
      const last = this._lassoPath[this._lassoPath.length - 1];
      // 降採樣：移動超過 6px 才記錄（用畫布座標）
      if (Math.hypot(p2.cx - last.x, p2.cy - last.y) > 6) {
        this._lassoPath.push({ x: p2.cx, y: p2.cy });
        this._lastActivity = performance.now();
        this.render();
      }
      return;
    }
    // v105：套索選取拖曳中
    if (this._lassoDrag) {
      const p2 = this._pos(e);
      const d = this._lassoDrag;
      const dx = (p2.cx - d.x0) / this._cssW, dy = (p2.cy - d.y0) / this._cssH;
      for (const o of d.orig) {
        const s = o.s;
        if (s.fx !== undefined) { s.fx = this._r4(o.fx + dx); s.fy = this._r4(o.fy + dy); }
        if (s.fx0 !== undefined) {
          s.fx0 = this._r4(o.fx0 + dx); s.fy0 = this._r4(o.fy0 + dy);
          s.fx1 = this._r4(o.fx1 + dx); s.fy1 = this._r4(o.fy1 + dy);
        }
        if (o.pts) {
          s.pts = o.pts.map(pt => [pt[0], this._r4(pt[1] + dx), this._r4(pt[2] + dy)]);
        }
      }
      d.moved = true;
      this._lastActivity = performance.now();
      this.render();
      return;
    }
    // v73：底圖調整模式—單指拖曳移動底圖
    if (this._imgDrag && this._pointers.size === 1) {
      const rect = this.canvas.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const d = this._imgDrag, pg = this.page;
      pg.imgX = d.imgX0 + (px - d.x0);
      pg.imgY = d.imgY0 + (py - d.y0);
      this.render();
      return;
    }
    if (this._pinch && this._pointers.size === 2) {
      const [p1, p2] = [...this._pointers.values()];
      const d = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const pc = this._pinch;
      if (!pc.moved && (Math.abs(d - pc.d0) > 12 || Math.hypot(mx - pc.mx0, my - pc.my0) > 12)) {
        pc.moved = true;
        this._pinchCandidate = null;  // 移動了＝縮放手勢，不是輕觸復原
      }
      if (pc.moved) {
        // v110：有套索選取時，雙指旋轉選取（角度變化轉為旋轉）
        if (this._lassoSel && this._lassoSel.length && !this.imgAdjust) {
          const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          let da = (a - pc.a0) * 180 / Math.PI;
          // 處理角度跳變（-180 ~ 180）
          if (da > 180) da -= 360;
          if (da < -180) da += 360;
          if (Math.abs(da) > 2) {  // 2° 死區，避免誤觸
            this.rotateSelection(da, true);  // silent：結束時統一發事件
            pc.rotated = true;
            pc.a0 = a;  // 重置基準，連續旋轉
          }
        }
        // v73：底圖調整模式時，雙指縮放底圖（不動視圖）
        if (this.imgAdjust && this.page.image) {
          const pg = this.page;
          pg.imgS = Math.max(0.2, Math.min(5, (pc.imgS0 || pg.imgS || 1) * d / pc.d0));
          this.render();
        } else {
          const v = this.view;
          const newScale = Math.max(0.5, Math.min(5, pc.scale0 * d / pc.d0));
          const k = newScale / pc.scale0;
          // 以中點為中心縮放：中點下的畫布點保持在手指中點下
          v.scale = newScale;
          v.ox = mx - (pc.mx0 - pc.ox0) * k;
          v.oy = my - (pc.my0 - pc.oy0) * k;
          this.render();
        }
      }
      return;
    }
    const p = this._pos(e);
    if (this.tool === 'laser' && e.buttons) { this._laser(p.x, p.y); return; }
    if (this._erasing) { this.eraseAt(p.fx, p.fy); return; }
    if (this._shapeDrag) {
      const d = this._shapeDrag;
      if (d._compass) {
        // 圓規：圓心鎖定，半徑＝px 距離
        const rpx = Math.hypot((p.fx - d._cx) * this._cssW, (p.fy - d._cy) * this._cssH);
        d.fx0 = d._cx - rpx / this._cssW; d.fy0 = d._cy - rpx / this._cssH;
        d.fx1 = d._cx + rpx / this._cssW; d.fy1 = d._cy + rpx / this._cssH;
      } else if (d._ruler && this.ruler) {
        // 直尺：投影到尺緣
        const s = this._rulerSnap(p);
        if (s) { d.fx1 = s.fx; d.fy1 = s.fy; }
      } else if (d._protractor && this.protractor) {
        // 量角器：角度吸附更新射線末端
        const s = this._protractorSnap(p);
        if (s) { d.fx1 = s.fx1; d.fy1 = s.fy1; d._deg = s.deg; }
      } else {
        d.fx1 = p.fx; d.fy1 = p.fy;
      }
      if (this._shapeSnap) {
        // 快照還原＋預覽（v19，不重繪整頁）
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this._shapeSnap, 0, 0);
        ctx.restore();
      } else {
        this.render();
      }
      this._drawShapePreview(d);
      return;
    }
    if (this._drawing) {
      // v19：Apple Pencil 240Hz 取 coalesced events，不掉點；只畫新增線段，不重繪整頁
      const rect = this.canvas.getBoundingClientRect();
      const evts = (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]);
      let added = false;
      for (const ce of evts) {
        const p = this._pos(ce, rect);
        const dt = performance.now() - this._drawing._startPerf;
        const last = this._drawing.pts[this._drawing.pts.length - 1];
        // 過濾過近的點，省空間
        if (Math.hypot((p.fx - last[1]) * this._cssW, (p.fy - last[2]) * this._cssH) < 2) continue;
        this._drawing.pts.push([Math.round(dt), this._r4(p.fx), this._r4(p.fy)]);
        this._drawing._moved = true;  // v20：雙指復原手勢用
        added = true;
      }
      if (added) {
        // 中途若有人重繪過（世代變了，如圖片載入）：整筆重畫，否則只畫新增線段
        if (this._drawing._renderGen !== this._renderGen) {
          this._drawLiveStroke(this._drawing);
          this._drawing._drawn = this._drawing.pts.length;
          this._drawing._renderGen = this._renderGen;
        } else {
          this._drawLiveSegment(this._drawing);
        }
      }
    }
  }
  _up(e) {
    // v42：雙指手勢結束
    this._pointers.delete(e.pointerId);
    // v73：底圖拖曳結束
    if (this._imgDrag) this._imgDrag = null;
    if (this._pinch) {
      if (this._pointers.size < 2) {
        // 雙指輕觸（未移動、350ms 內）＝復原（v20 行為）
        if (!this._pinch.moved && this._pinchCandidate) {
          const dt = performance.now() - this._pinchCandidate.t0;
          const d = this._pinchCandidate.drawing;
          if (dt < 350 && d && !d._moved) {
            this.render();  // 清掉首指的落筆點
            this.undo();
          }
          // 若有未完成的繪製（非輕觸），直接丟棄（已在 _down 時 render 清掉）
        }
        // v110：雙指旋轉過套索選取，統一發一次時間軸事件
        if (this._pinch.rotated && this._lassoSel && this._lassoSel.length) {
          for (const s of this._lassoSel) {
            this._emit('move', { page: this.pageIndex, id: s.id, rotate: 'gesture' });
          }
          this.pokeActivity();
          // 暫停時鐘（視為一次動作完成）
          const tl = this.page && this.page.tl;
          if (tl && tl.clock && tl.clock.running) {
            tl.clock.pause();
            const lastT = Math.round(this._liveEdgeT());
            tl.clock.base = lastT;
            if (typeof window !== 'undefined' && window._mokeSyncTime) {
              window._mokeSyncTime(lastT);
            }
          }
        }
        this._pinch = null;
        this._pinchCandidate = null;
      }
      return;
    }
    if (this._tap2done) { this._tap2done = false; return; }  // v20：雙指復原，不提交
    const hadGesture = !!(this._erasing || this._shapeDrag || this._drawing);
    if (this._erasing) { this._erasing = false; }
    else if (this._shapeDrag) {
      const d = this._shapeDrag; this._shapeDrag = null;
      this._shapeSnap = null;
      if (Math.hypot((d.fx1 - d.fx0) * this._cssW, (d.fy1 - d.fy0) * this._cssH) < 6) { this.render(); }
      else {
        const s = this._newStroke('shape', {
          shape: d.shape,
          fx0: this._r4(d.fx0), fy0: this._r4(d.fy0),
          fx1: this._r4(d.fx1), fy1: this._r4(d.fy1),
          dur: Math.round(performance.now() - d.t)
        });
        this.addStroke(s);
      }
    }
    else if (this._drawing) {
      const s = this._drawing; this._drawing = null;
      s.dur = Math.round(performance.now() - s._startPerf);
      delete s._startPerf;
      delete s._drawn;  // v19：內部計數，不存檔、不廣播
      delete s._renderGen;
      delete s._downT;  // v20：內部計數，不存檔
      delete s._moved;
      if (s.pts.length === 1) s.pts.push([s.dur, s.pts[0][1], s.pts[0][2]]);
      this.addStroke(s);
    }
    if (hadGesture && this.onDrawEnd) this.onDrawEnd();
    // v104：手抓拖曳結束—有移動就記一筆時間軸事件
    const handMoved = this._handDrag && this._handDrag.moved;
    if (this._handDrag) {
      const d = this._handDrag;
      this._handDrag = null;
      if (d.moved) {
        this._emit('move', { page: this.pageIndex, id: d.stroke.id,
          fx: d.stroke.fx, fy: d.stroke.fy, fx0: d.fx0, fy0: d.fy0 });
      }
      this.render();
    }
    // v105：套索路徑完成—計算選取
    if (this._lassoPath) {
      const path = this._lassoPath;
      this._lassoPath = null;
      if (path.length > 8) {
        this._lassoSel = this._selectInLasso(path);
      } else {
        this._lassoSel = null;  // 太短，當作點一下→取消選取
      }
      if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      this.render();
    }
    // v105：套索拖曳結束—為每個移動的筆跡記時間軸事件
    const lassoMoved = this._lassoDrag && this._lassoDrag.moved;
    if (this._lassoDrag) {
      const d = this._lassoDrag;
      this._lassoDrag = null;
      if (d.moved) {
        for (const o of d.orig) {
          const s = o.s;
          this._emit('move', { page: this.pageIndex, id: s.id,
            fx: s.fx, fy: s.fy, fx0: o.fx, fy0: o.fy,
            fx0s: s.fx0, fy0s: s.fy0, fx1s: s.fx1, fy1s: s.fy1,
            pts: s.pts ? true : undefined });
        }
      }
      this.render();
    }
    // v103：提筆就停（南勛：動作停就該停止讀秒，不用等 5 秒）
    // 只在沒有其他手指還按著時暫停（避免多指操作中斷）
    if ((hadGesture || handMoved || lassoMoved) && this._pointers.size === 0) {
      const tl = this.page && this.page.tl;
      if (tl && tl.clock && tl.clock.running) {
        tl.clock.pause();
        // 倒回最後事件時間，保持與時間軸一致（v102 邏輯）
        const lastT = Math.round(this._liveEdgeT());
        tl.clock.base = lastT;
        this._lastActivity = performance.now();
        if (typeof window !== 'undefined' && window._mokeSyncTime) {
          window._mokeSyncTime(lastT);
        }
      }
    }
  }
  /* v103：供 _up 暫停時取得最後事件時間（與 TLC.liveEdge 一致） */
  _liveEdgeT() {
    let m = 0;
    for (const s of this.page.strokes) {
      const t = (s.tlT === undefined ? 0 : s.tlT);
      if (t > m) m = t;
    }
    const tl = this.page.tl;
    if (tl && tl.erased) {
      for (const { eraseT } of tl.erased) {
        if (eraseT > m) m = eraseT;
      }
    }
    return m;
  }

  _laser(x, y) {
    this._laserTrail.push({ x, y, at: performance.now() });
    if (!this._laserTicking) { this._laserTicking = true; requestAnimationFrame(() => this._laserFrame()); }
  }
  _laserFrame() {
    const now = performance.now();
    this._laserTrail = this._laserTrail.filter(p => now - p.at < 500);
    this.render();
    const ctx = this.ctx;
    for (const p of this._laserTrail) {
      const a = 1 - (now - p.at) / 500;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff2d2d';
      ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this._laserTrail.length) requestAnimationFrame(() => this._laserFrame());
    else { this._laserTicking = false; this.render(); }
  }

  /* ---------- 繪製 ---------- */
  resize() {
    const wrap = this.canvas.parentElement;
    if (!wrap) return; // 離屏 canvas（影片匯出用）稍後由 setSize 設定尺寸
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this._cssW = Math.max(50, r.width); this._cssH = Math.max(50, r.height);
    this.canvas.width = Math.round(this._cssW * dpr);
    this.canvas.height = Math.round(this._cssH * dpr);
    this.canvas.style.width = this._cssW + 'px';
    this.canvas.style.height = this._cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  /* v42：重置縮放視圖 */
  resetView() {
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.render();
  }

  render() {
    const ctx = this.ctx, W = this._cssW, H = this._cssH;
    const pg = this.page;
    this._renderGen = (this._renderGen || 0) + 1;  // v19：增量繪製用世代計數
    const dpr = window.devicePixelRatio || 1;
    const v = this.view;
    ctx.save();
    // v42：先清整個畫布（螢幕座標），再套用縮放變換畫內容
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
    this._drawBg(ctx, pg, W, H);
    if (pg.image && pg._imgEl) {
      const img = pg._imgEl;
      // v73：底圖可調大小/位置（imgS 縮放、imgX/imgY 位移）
      const s = Math.min(W / img.naturalWidth, H / img.naturalHeight) * (pg.imgS || 1);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, (W - dw) / 2 + (pg.imgX || 0), (H - dh) / 2 + (pg.imgY || 0), dw, dh);
    }
    for (const s of pg.strokes) {
      // v47：時間軸回放時只顯示 cutoff 之前的筆跡
      if (this.tlCutoff !== null && this.tlCutoff !== undefined) {
        const st = (s.tlT === undefined ? 0 : s.tlT);
        if (st > this.tlCutoff) continue;
      }
      this.drawStroke(ctx, s, 1, W, H);
    }
    // v96：重播時顯示「曾存在但已被擦除」的筆跡（擦除時間 > cutoff 才顯示）
    if (this.tlCutoff !== null && this.tlCutoff !== undefined && pg.tl && pg.tl.erased) {
      for (const { stroke: s, eraseT } of pg.tl.erased) {
        const st = (s.tlT === undefined ? 0 : s.tlT);
        if (st <= this.tlCutoff && eraseT > this.tlCutoff) {
          this.drawStroke(ctx, s, 1, W, H);
        }
      }
    }
    ctx.restore();
    // v105：套索路徑（繪製中）與選取框
    if (this._lassoPath && this._lassoPath.length > 1) {
      const dpr2 = window.devicePixelRatio || 1;
      const v2 = this.view;
      ctx.save();
      ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
      ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(this._lassoPath[0].x * v2.scale + v2.ox, this._lassoPath[0].y * v2.scale + v2.oy);
      for (let i = 1; i < this._lassoPath.length; i++) {
        ctx.lineTo(this._lassoPath[i].x * v2.scale + v2.ox, this._lassoPath[i].y * v2.scale + v2.oy);
      }
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    if (this._lassoSel && this._lassoSel.length) {
      const bb = this._lassoBBox();
      if (bb) {
        const dpr2 = window.devicePixelRatio || 1;
        const v2 = this.view;
        ctx.save();
        ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
        ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        const x0 = bb.x0 * v2.scale + v2.ox, y0 = bb.y0 * v2.scale + v2.oy;
        const x1 = bb.x1 * v2.scale + v2.ox, y1 = bb.y1 * v2.scale + v2.oy;
        ctx.strokeRect(x0 - 8, y0 - 8, (x1 - x0) + 16, (y1 - y0) + 16);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
    if (this.overlay) this.overlay(ctx, W, H);
  }

  _drawBg(ctx, pg, W, H) {
    if (pg.bg === 'blackboard') {
      ctx.fillStyle = '#26382e'; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      if (pg.bg === 'grid' || pg.bg === 'lines') {
        ctx.strokeStyle = '#d7e3f4'; ctx.lineWidth = 1;
        const step = 40;
        ctx.beginPath();
        if (pg.bg === 'grid') {
          for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
          for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        } else {
          for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        }
        ctx.stroke();
      }
    }
  }

  drawStroke(ctx, s, progress, W, H) {
    progress = Math.max(0, Math.min(1, progress === undefined ? 1 : progress));
    const k = W / 1000;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'highlighter') { ctx.globalAlpha = 0.35; }
    if (s.tool === 'text') {
      let fx = s.fx, fy = s.fy, rot = s.rot || 0;
      // v104/v105：重播時位置要對—用 _strokePosAt 取 cutoff 時間的位置
      // v108：也要還原旋轉角
      if (this.tlCutoff !== null && this.tlCutoff !== undefined) {
        const pos = this._strokePosAt(s, this.tlCutoff);
        if (pos && pos.fx !== undefined) { fx = pos.fx; fy = pos.fy; rot = pos.rot || 0; }
      }
      ctx.fillStyle = s.color;
      ctx.font = `${(s.size || 48) * k}px "PingFang TC","Microsoft JhengHei",sans-serif`;
      // v108：文字本身旋轉（繞文字左下角，不變形）
      if (rot) {
        ctx.save();
        ctx.translate(fx * W, fy * H + (s.size || 48) * k * 0.8);
        ctx.rotate(rot * Math.PI / 180);
        ctx.fillText(s.text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(s.text, fx * W, fy * H + (s.size || 48) * k * 0.8);
      }
      ctx.restore(); return;
    }
    if (s.tool === 'shape') {
      // v105：重播時用 cutoff 時間的位置
      // v109：圖形旋轉不變形（轉中心＋角度，不轉角點）
      let fx0 = s.fx0, fy0 = s.fy0, fx1 = s.fx1, fy1 = s.fy1, rot = s.rot || 0;
      if (this.tlCutoff !== null && this.tlCutoff !== undefined) {
        const pos = this._strokePosAt(s, this.tlCutoff);
        if (pos && pos.fx0 !== undefined) { fx0 = pos.fx0; fy0 = pos.fy0; fx1 = pos.fx1; fy1 = pos.fy1; rot = pos.rot || 0; }
      }
      const x0 = fx0 * W, y0 = fy0 * H;
      const x1 = fx0 * W + (fx1 - fx0) * W * progress;
      const y1 = fy0 * H + (fy1 - fy0) * H * progress;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
      if (rot) {
        // 繞圖形中心旋轉
        const scx = (x0 + x1) / 2, scy = (y0 + y1) / 2;
        ctx.save();
        ctx.translate(scx, scy);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-scx, -scy);
        this._strokeShape(ctx, s.shape, x0, y0, x1, y1);
        ctx.restore();
      } else {
        this._strokeShape(ctx, s.shape, x0, y0, x1, y1);
      }
      ctx.restore(); return;
    }
    // pen / highlighter：依時間進度繪製
    // v105：重播時若 cutoff 在移動前，用原始點位
    let pts = s.pts;
    if (this.tlCutoff !== null && this.tlCutoff !== undefined) {
      const pos = this._strokePosAt(s, this.tlCutoff);
      if (pos && pos.pts) pts = pos.pts;
    }
    if (!pts.length) { ctx.restore(); return; }
    const total = s.dur || 1;
    const cutoff = progress * total;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
    ctx.beginPath();
    let started = false, prev = null;
    for (let i = 0; i < pts.length; i++) {
      const [dt, fx, fy] = pts[i];
      if (dt > cutoff) {
        // 在兩點之間插值，畫到精確進度
        if (prev && prev[0] < cutoff) {
          const r = (cutoff - prev[0]) / Math.max(1, dt - prev[0]);
          const ix = (prev[1] + (fx - prev[1]) * r) * W;
          const iy = (prev[2] + (fy - prev[2]) * r) * H;
          if (!started) { ctx.moveTo(prev[1] * W, prev[2] * H); started = true; }
          ctx.lineTo(ix, iy);
        }
        break;
      }
      const x = fx * W, y = fy * H;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      prev = pts[i];
    }
    // 單點 → 點
    if (pts.length >= 1 && !started) {
      const x = pts[0][1] * W, y = pts[0][2] * H;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, (s.width * k) / 2, 0, Math.PI * 2); ctx.fill();
    } else if (started) {
      ctx.stroke();
    }
    ctx.restore();
  }

  _strokeShape(ctx, shape, x0, y0, x1, y1) {
    ctx.beginPath();
    if (shape === 'line' || shape === 'arrow') {
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.stroke();
      if (shape === 'arrow') {
        const ang = Math.atan2(y1 - y0, x1 - x0);
        const len = Math.max(12, ctx.lineWidth * 3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - len * Math.cos(ang - 0.45), y1 - len * Math.sin(ang - 0.45));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - len * Math.cos(ang + 0.45), y1 - len * Math.sin(ang + 0.45));
        ctx.stroke();
      }
    } else if (shape === 'rect') {
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (shape === 'ellipse') {
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'rtriangle') {
      // 直角三角形：直角在 (x0,y1)
      ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y1); ctx.closePath();
      ctx.stroke();
    } else if (shape === 'parallelogram') {
      // 平行四邊形
      const sx = (x1 - x0) * 0.25;
      ctx.moveTo(x0 + sx, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1 - sx, y1); ctx.lineTo(x0, y1); ctx.closePath();
      ctx.stroke();
    } else if (shape === 'axes') {
      // 座標軸：中心在矩形中心，x 軸向右、y 軸向上，含箭頭與刻度
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const hw = Math.abs(x1 - x0) / 2, hh = Math.abs(y1 - y0) / 2;
      const alen = Math.max(10, ctx.lineWidth * 2.5);
      const tick = Math.max(4, ctx.lineWidth * 0.8);
      ctx.moveTo(cx - hw, cy); ctx.lineTo(cx + hw, cy);                       // x 軸
      ctx.moveTo(cx + hw, cy); ctx.lineTo(cx + hw - alen, cy - alen * 0.45);  // x 箭頭
      ctx.moveTo(cx + hw, cy); ctx.lineTo(cx + hw - alen, cy + alen * 0.45);
      ctx.moveTo(cx, cy + hh); ctx.lineTo(cx, cy - hh);                       // y 軸
      ctx.moveTo(cx, cy - hh); ctx.lineTo(cx - alen * 0.45, cy - hh + alen);  // y 箭頭
      ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + alen * 0.45, cy - hh + alen);
      for (let i = 1; i < 10; i++) {                                         // 刻度
        const tx = cx - hw + (2 * hw * i) / 10;
        ctx.moveTo(tx, cy - tick); ctx.lineTo(tx, cy + tick);
        const ty = cy - hh + (2 * hh * i) / 10;
        ctx.moveTo(cx - tick, ty); ctx.lineTo(cx + tick, ty);
      }
      ctx.stroke();
    }
  }

  _drawLiveStroke(s) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1, v = this.view;
    ctx.save();
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
    this.drawStroke(ctx, s, 1, this._cssW, this._cssH);
    ctx.restore();
  }
  /* v19：增量繪製——只畫新增的線段，不重繪整頁。s._drawn 記已繪製點數。 */
  _drawLiveSegment(s) {
    const ctx = this.ctx, W = this._cssW, H = this._cssH;
    const k = W / 1000;
    const dpr = window.devicePixelRatio || 1, v = this.view;
    const pts = s.pts;
    const from = s._drawn || 0;
    if (pts.length <= from) return;
    ctx.save();
    // v42：套用縮放變換（線寬除以 scale 保持視覺粗細一致）
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k / v.scale;
    if (s.tool === 'highlighter') ctx.globalAlpha = 0.35;
    if (from === 0 && pts.length === 1) {
      // 單點 → 圓點
      const x = pts[0][1] * W, y = pts[0][2] * H;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, (s.width * k / v.scale) / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      const p0 = pts[Math.max(0, from - 1)];
      ctx.moveTo(p0[1] * W, p0[2] * H);
      for (let i = Math.max(1, from); i < pts.length; i++) {
        ctx.lineTo(pts[i][1] * W, pts[i][2] * H);
      }
      ctx.stroke();
    }
    ctx.restore();
    s._drawn = pts.length;
  }
  /* ---------- 幾何規尺（v14） ---------- */
  // 直尺吸附：p 靠近任一長邊 → 回傳投影點（fx,fy），否則 null
  _rulerSnap(p) {
    const r = this.ruler, W = this._cssW, H = this._cssH;
    if (!r) return null;
    const snap = 16;
    const dx = Math.cos(r.angle), dy = Math.sin(r.angle);
    const nx = -dy, ny = dx;
    const rx = p.x - r.x, ry = p.y - r.y;
    const along = rx * dx + ry * dy, perp = rx * nx + ry * ny;
    if (Math.abs(along) > r.len / 2 + snap) return null;
    const edgeDist = Math.abs(Math.abs(perp) - r.wd / 2);
    if (edgeDist > snap) return null;
    const s = perp >= 0 ? 1 : -1;
    const px = r.x + along * dx + s * (r.wd / 2) * nx;
    const py = r.y + along * dy + s * (r.wd / 2) * ny;
    return { fx: px / W, fy: py / H };
  }
  // 量角器：p 在圓盤內 → 回傳圓心起的吸附射線，否則 null
  _protractorSnap(p) {
    const t = this.protractor, W = this._cssW, H = this._cssH;
    if (!t) return null;
    const dx = p.x - t.x, dy = p.y - t.y;
    const dist = Math.hypot(dx, dy);
    if (dist > t.R) return null;
    const step = Math.PI / 36; // 5°
    const rel = Math.atan2(dy, dx) - t.angle;
    const snapped = Math.round(rel / step) * step;
    const a = t.angle + snapped;
    const len = Math.max(dist, 24);
    const ex = t.x + len * Math.cos(a), ey = t.y + len * Math.sin(a);
    const deg = Math.round(((snapped * 180 / Math.PI) % 360 + 360) % 360);
    return { fx0: t.x / W, fy0: t.y / H, fx1: ex / W, fy1: ey / H, deg };
  }

  _drawShapePreview(d) {
    const ctx = this.ctx, W = this._cssW, H = this._cssH, k = W / 1000;
    const dpr = window.devicePixelRatio || 1, v = this.view;
    ctx.save();
    // v42：套用縮放變換
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
    ctx.strokeStyle = this.color; ctx.lineWidth = this.width * k / v.scale;
    ctx.setLineDash([8, 6]);
    this._strokeShape(ctx, d.shape, d.fx0 * W, d.fy0 * H, d.fx1 * W, d.fy1 * H);
    ctx.setLineDash([]);
    if (d._compass) {
      // 圓規圓心標記
      const cx = d._cx * W, cy = d._cy * H, m = 8;
      ctx.beginPath();
      ctx.moveTo(cx - m, cy); ctx.lineTo(cx + m, cy);
      ctx.moveTo(cx, cy - m); ctx.lineTo(cx, cy + m);
      ctx.stroke();
    }
    if (d._protractor && d._deg !== undefined) {
      // 量角器角度讀數
      ctx.fillStyle = this.color;
      ctx.font = `${Math.round(20 * k + 12)}px sans-serif`;
      ctx.fillText(d._deg + '°', d.fx1 * W + 10, d.fy1 * H - 10);
    }
    ctx.restore();
  }

  /* ---------- 遠端 / 重播事件套用（分享、播放器、匯出器共用） ---------- */
  applyRemote(evt, data) {
    if (!data) return;
    const pages = this.pages;
    if (evt === 'page') {
      if (typeof data.page === 'number' && pages[data.page]) this.pageIndex = data.page;
    } else if (evt === 'addpage') {
      const idx = Math.max(0, Math.min(data.page | 0, pages.length));
      const pg = this._newPage(data.bg || 'white');
      pg.image = data.image || null;
      pages.splice(idx, 0, pg);
      if (idx <= this.pageIndex) this.pageIndex++;
      if (pg.image) this.ensureImage(pg, () => this.render());
    } else if (evt === 'delpage') {
      const idx = data.page | 0;
      if (pages.length > 1 && pages[idx]) {
        pages.splice(idx, 1);
        if (this.pageIndex >= pages.length) this.pageIndex = pages.length - 1;
        else if (idx < this.pageIndex) this.pageIndex--;
      }
    } else {
      const pg = pages[data.page];
      if (!pg) return;
      if (evt === 'add' && data.stroke) {
        pg.strokes.push(data.stroke); pg.undo.push(data.stroke);
      } else if (evt === 'erase' && data.ids) {
        const ids = new Set(data.ids);
        pg.strokes = pg.strokes.filter(s => !ids.has(s.id));
      } else if (evt === 'unadd' && (data.id || data.ids)) {
        // v25：復原＝從畫布移除；v26：橡皮擦 ids 陣列（學生端同步）
        const ids = new Set(data.ids || [data.id]);
        pg.strokes = pg.strokes.filter(s => !ids.has(s.id));
        pg.undo = pg.undo.filter(s => !ids.has(s.id));
        pg.redo = pg.redo.filter(s => !ids.has(s.id));
      } else if (evt === 'readd' && data.stroke) {
        // v25：重做＝恢復到畫布（學生端同步）
        if (!pg.strokes.some(s => s.id === data.stroke.id)) {
          pg.strokes.push(data.stroke); pg.undo.push(data.stroke);
        }
      } else if (evt === 'clear') {
        pg.strokes = []; pg.undo = []; pg.redo = [];
      } else if (evt === 'bg') {
        pg.bg = data.bg;
      } else if (evt === 'image') {
        pg.image = data.dataUrl;
        if (data.dataUrl) this.ensureImage(pg, () => this.render());
        else pg._imgEl = null;
      }
    }
    this.render();
  }

  /* 底圖圖片載入（重播/匯入時用） */
  ensureImage(page, cb) {
    if (!page.image || page._imgEl) { cb && cb(); return; }
    const img = new Image();
    img.onload = () => { page._imgEl = img; cb && cb(); };
    img.onerror = () => { cb && cb(); };
    img.src = page.image;
  }

  /* 序列化（課程檔用）：圖片已在 page.image */
  serialize() {
    return {
      bg: this.page.bg, image: this.page.image,
      strokes: this.page.strokes.map(s => {
        const o = Object.assign({}, s);
        delete o._startPerf;
        return o;
      })
    };
  }
}

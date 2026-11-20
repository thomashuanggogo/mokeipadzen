/* 墨課 · 白板核心 board.js
 * 純 Canvas 白板：座標以相對比例(0~1)儲存，換解析度不失真。
 * 筆跡事件透過 onEvent 回報給錄課引擎（lesson.js）。
 */
'use strict';

/* v207：時間軸區隔常數（ms）——插入筆跡與後方筆跡之間的最小間隔。
 * 學長（Doceri 資深用戶）定版的不重疊不變量：時間軸上每個時段只容一筆，
 * 穿插新筆跡時系統擠出 TL_EPS 做區隔（旗標 sepAfter 記在新筆上），
 * 刪除該筆時連區隔一併回收。詳見 _insertYield / rippleCompact。 */
const TL_EPS = 20;

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
    /* v210：圖形專屬設定（學長第五件主張，GoodNotes 式兩組獨立）——圖形框線自己的
       顏色／粗細／線型，與筆那組 board.color/width 完全分開；app.js 由 localStorage 載入。
       shapeDash：0=實線、1=短虛線。圖形定稿時一律吃這組，不得再吃筆的設定。 */
    this.shapeColor = '#111111';
    this.shapeWidth = 5;
    this.shapeDash = 0;
    this.textSize = 48;
    this.onEvent = null;          // (type, data) => void，由 app.js 接錄影
    this.onUntimedStamp = null;   // v206：不計時事件的戳記來源（app.js 提供：回放中回傳播放頭，否則 null→用 liveEdge）
    this.onPasteAppend = null;    // v209：append 貼上完成後的回呼（app.js 提供：播放頭推到新結尾＋時間軸 UI 更新）
    this._clipboard = null;       // v206：筆跡剪貼簿（深拷貝，跨頁存活；複製鈕/貼上鈕用）
    this._pasteSeq = 0;           // v206：連續貼上的累進偏移計數（重新複製時歸零）
    this._selBase = null;         // v206：選取手勢（捏合/縮放）的起始快照，_selGestureBegin/End 管理
    this._selBaseCenter = null;   // v206：選取手勢的包圍盒中心（畫布 px）
    this._selCleared = null;      // v206：pen 落筆時被 v147 先清掉的選取（雙指成立時還原改走選取捏合）
    this.onDrawStart = null;      // 落筆前鉤子（時間軸：回放中落筆＝插入）
    this.onDrawEnd = null;        // 提筆後鉤子
    this.tlCutoff = null;         // v47：時間軸回放過濾（null＝全顯示，否則只畫 tlT <= cutoff 的筆跡）
    this._stickerEls = new Map(); // v195：貼紙圖形物件的圖片元素快取（key=筆跡 id+src 特徵，不存進課程檔）
    this._tlPlayhead = null;        // v47：回放中落筆時，筆跡的時間（null＝用自然時間）
    this._tlInsertNext = 0;         // v175：補線游標（下一筆插入的時間點）
    this._tlInsertFor = null;       // v175：游標所屬的播放頭位置
    this.rippleOk = true;           // v173/v174：刪除後漣波補位（墨課不錄音，無條件補位；此旗標保留備用）
    this.lockDraw = false;          // v50：時間軸打開時鎖定書寫
    this.onLockDraw = null;         // v50：鎖定時嘗試書寫的回調（提示用）
    this._strokeSeq = 1;
    this._lastActivity = 0;       // v101：最後動作時間（performance.now），5 秒閒置自動暫停時鐘
    this._drawing = null;         // 進行中的筆跡
    this._shapeDrag = null;       // 進行中的圖形
    this._laserTrail = [];        // 雷射筆軌跡點 [{x,y}]
    this._laserTicking = false;
    this._laserHeld = false;      // v154：按住中（軌跡保留）
    this._laserFadeStart = 0;     // v154：放開時間（整條淡出用）
    this._cssW = 0; this._cssH = 0;
    // v42：雙指縮放視圖 {scale, ox, oy}（scale=縮放倍率，ox/oy=CSS px 偏移）
    this.view = { scale: 1, ox: 0, oy: 0 };
    this._pinch = null;  // 進行中的雙指手勢 {p1, p2, d0, scale0, mx0, my0, ox0, oy0}
    this._pointers = new Map();  // pointerId -> {x, y}
    // v73：底圖調整模式（匯入圖片後可調大小/位置）
    this.imgAdjust = false;
    this._imgDrag = null;  // 單指拖曳底圖 {id, x0, y0, imgX0, imgY0}
    this.imgSelId = null;  // v139：多圖調整時選中的圖片 id
    // v143：圖片裁切模式
    this.cropMode = false;
    this.cropId = null;    // 正在裁切的圖片 id
    this._crop = null;     // {fx0, fy0, fx1, fy1} 正規化裁切框（相對圖片 0~1）
    this._cropDrag = null; // {handle} 或 {move}
    // v76：手指寫字開關（預設關＝只有 Apple Pencil 能畫，防手掌誤觸）
    this.fingerDraw = true;  // v104：預設手指可寫（南勛：預設手寫，用 Apple Pencil 再按開關切換）
    this.fingerLift = 0;     // v163：手指落點補正量（px），🎯 按鈕可調 0–24（食指大小/習慣因人而異）；v167：預設改 0，要補正的人自己調高
    this.fingerShiftX = 0;   // v164：手指左右偏移（px），🎯 可調 −16…16（手指是斜著碰螢幕的，左右也會偏）
    // v145：圖形自動辨識（畫圓/直線後停頓 0.6 秒自動變乾淨圖形，預設開；localStorage 可關）
    this.autoShape = true;
    this._autoShapeTimer = null;
    // v184：座標軸原點模式（'center' 中央／'bl' 左下角第一象限），由 app.js 從 localStorage 設定
    this.axesOrigin = 'center';
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
    // v139：多圖疊放 — images 陣列，每張 {id, src, x, y, s}；舊版單張 image 自動遷移
    return {
      bg: bg || 'white', image: null, images: [], strokes: [], undo: [], redo: [],
      imgS: 1, imgX: 0, imgY: 0,
      tl: { events: [], stops: [], clock: null, unadded: [] }
    };
  }
  /* v139：舊版單張底圖遷移到 images 陣列（讀舊檔時呼叫） */
  _migrateImages(pg) {
    if (pg.image && (!pg.images || !pg.images.length)) {
      pg.images = [{
        id: 'img_' + Date.now().toString(36) + '_m',
        src: pg.image, x: pg.imgX || 0, y: pg.imgY || 0, s: pg.imgS || 1
      }];
      pg.image = null;
    }
    if (!pg.images) pg.images = [];
    return pg.images;
  }
  _imgById(pg, id) {
    const imgs = this._migrateImages(pg);
    return imgs.find(im => im.id === id) || null;
  }
  /* v139：圖片在畫布上的邊界（畫布座標），供點擊判斷 */
  _imgBounds(im) {
    const W = this._cssW, H = this._cssH;
    if (!im._el || !im._el.naturalWidth) return null;
    const s = Math.min(W / im._el.naturalWidth, H / im._el.naturalHeight) * (im.s || 1);
    const dw = im._el.naturalWidth * s, dh = im._el.naturalHeight * s;
    const cx = W / 2 + (im.x || 0), cy = H / 2 + (im.y || 0);
    return { x0: cx - dw / 2, y0: cy - dh / 2, x1: cx + dw / 2, y1: cy + dh / 2, cx, cy };
  }
  /* v139：從上層往下找點中的圖片（sx, sy 為螢幕座標） */
  _imgHitTest(sx, sy) {
    const v = this.view;
    const cx = (sx - v.ox) / v.scale, cy = (sy - v.oy) / v.scale;
    const imgs = this._migrateImages(this.page);
    // v187：lockBg 頁（轉檔課程）的第一張圖是整頁板面底圖，筆跡釘在它的座標上——調整模式不可選、不可拖，避免整頁移位
    const skipId = (this.page.lockBg && imgs.length) ? imgs[0].id : null;
    for (let i = imgs.length - 1; i >= 0; i--) {
      if (imgs[i].id === skipId) continue;
      const b = this._imgBounds(imgs[i]);
      if (b && cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1) return imgs[i];
    }
    return null;
  }
  /* v187：本頁可調整的圖片（lockBg 頁扣掉板面底圖） */
  _movableImages(pg) {
    const imgs = this._migrateImages(pg);
    return (pg && pg.lockBg && imgs.length) ? imgs.slice(1) : imgs;
  }
  /* v143：進入/離開裁切模式 */
  enterCrop(id) {
    const im = this._imgById(this.page, id);
    if (!im || !im._el) return false;
    this.cropMode = true;
    this.cropId = id;
    this._crop = { fx0: 0, fy0: 0, fx1: 1, fy1: 1 }; // 預設全圖
    this._cropDrag = null;
    this.render();
    return true;
  }
  exitCrop() {
    this.cropMode = false;
    this.cropId = null;
    this._crop = null;
    this._cropDrag = null;
    this.render();
  }
  /* v143：裁切框在畫布上的座標（canvas coords） */
  _cropBounds() {
    if (!this._crop) return null;
    const im = this._imgById(this.page, this.cropId);
    if (!im) return null;
    const b = this._imgBounds(im);
    if (!b) return null;
    const c = this._crop;
    return {
      x0: b.x0 + c.fx0 * (b.x1 - b.x0),
      y0: b.y0 + c.fy0 * (b.y1 - b.y0),
      x1: b.x0 + c.fx1 * (b.x1 - b.x0),
      y1: b.y0 + c.fy1 * (b.y1 - b.y0)
    };
  }
  /* v143：裁切把手位置（8 個：四角＋四邊中點） */
  _cropHandles() {
    const cb = this._cropBounds();
    if (!cb) return [];
    const { x0, y0, x1, y1 } = cb;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return [
      { x: x0, y: y0, id: 'nw' }, { x: mx, y: y0, id: 'n' }, { x: x1, y: y0, id: 'ne' },
      { x: x0, y: my, id: 'w' },                                 { x: x1, y: my, id: 'e' },
      { x: x0, y: y1, id: 'sw' }, { x: mx, y: y1, id: 's' }, { x: x1, y: y1, id: 'se' }
    ];
  }
  /* v143：執行裁切，用 canvas 把選區轉成新圖片 */
  applyCrop() {
    const im = this._imgById(this.page, this.cropId);
    const c = this._crop;
    if (!im || !im._el || !c) return false;
    const natW = im._el.naturalWidth, natH = im._el.naturalHeight;
    const sx = Math.round(c.fx0 * natW), sy = Math.round(c.fy0 * natH);
    const sw = Math.round((c.fx1 - c.fx0) * natW), sh = Math.round((c.fy1 - c.fy0) * natH);
    if (sw < 4 || sh < 4) return false;
    // 記住裁切區中心在畫布上的位置，裁完對齊
    const b = this._imgBounds(im);
    const W = this._cssW, H = this._cssH;
    const ccx = b.x0 + (c.fx0 + c.fx1) / 2 * (b.x1 - b.x0);
    const ccy = b.y0 + (c.fy0 + c.fy1) / 2 * (b.y1 - b.y0);
    const cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    cv.getContext('2d').drawImage(im._el, sx, sy, sw, sh, 0, 0, sw, sh);
    const newSrc = cv.toDataURL('image/jpeg', 0.92);
    const oldS = im.s || 1;
    const newImg = new Image();
    newImg.onload = () => {
      im._el = newImg;
      im.x = ccx - W / 2;
      im.y = ccy - H / 2;
      im.s = oldS;
      this._emit('image', { page: this.pageIndex, action: 'crop', id: im.id }, true); // v206：不計時
      this.render();
    };
    newImg.src = newSrc;
    im.src = newSrc;
    return true;
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
    if (record) this._emit('addpage', { page: index, bg: pg.bg, image: imageDataUrl || null }, true); // v206：不計時
    this.render();
    return index;
  }
  delPage() {
    if (this.pages.length <= 1) { this.clearPage(false); return; }
    const idx = this.pageIndex;
    this.pages.splice(idx, 1);
    if (this.pageIndex >= this.pages.length) this.pageIndex = this.pages.length - 1;
    this._emit('delpage', { page: idx }, true); // v206：不計時
    this._emit('page', { page: this.pageIndex }, true);
    this.render();
  }
  gotoPage(i) {
    i = Math.max(0, Math.min(this.pages.length - 1, i));
    if (i === this.pageIndex) return;
    this.pageIndex = i;
    this._emit('page', { page: i }, true); // v206：不計時（換頁不該在新頁建立/喚醒時鐘）
    this.render();
  }

  /* ---------- 背景 / 底圖 ---------- */
  setBackground(bg) {
    this.page.bg = bg;
    this._emit('bg', { page: this.pageIndex, bg }, true); // v206：不計時
    this.render();
  }
  setImage(dataUrl) {
    // v139：改為多圖，setImage 保留相容（加一張）
    return this.addImage(dataUrl);
  }
  /* v139：新增一張底圖，回傳 image 物件 */
  addImage(dataUrl) {
    const pg = this.page;
    const imgs = this._migrateImages(pg);
    const im = {
      id: 'img_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      src: dataUrl, x: 0, y: 0, s: 1, _el: null
    };
    imgs.push(im);
    this._emit('image', { page: this.pageIndex, action: 'add', id: im.id }, true); // v206：不計時（Doceri 貼圖不計時）
    this.ensureImage(pg, im, () => this.render());
    this.render();
    return im;
  }
  /* v195：貼紙＝圖形物件（南勛定版：貼紙要跟三角形、圓形一樣看待）。
     不再進底圖層，改建一筆 tool:'sticker' 的筆跡：有自己的時間點（tlT），
     回放時到點才出現；套索可跟筆跡一起選、中心把手移動、角落把手旋轉、第二排 ✕ 刪除。
     幾何：fx/fy=中心（分數）、fw/fh=寬高（分數）、rot=旋轉角；src=圖的 data URL。
     座標一律走頁面的分數空間（lockBg 頁自動換算），與其他筆跡一致。 */
  addSticker(src, cxPx, cyPx, wPx, hPx) {
    const b = this._lockBounds();
    const spanX = b ? (b.x1 - b.x0) : this._cssW;
    const spanY = b ? (b.y1 - b.y0) : this._cssH;
    const fx = b ? (cxPx - b.x0) / spanX : cxPx / this._cssW;
    const fy = b ? (cyPx - b.y0) / spanY : cyPx / this._cssH;
    const s = this._newStroke('sticker', {
      src,
      fx: this._r4(fx), fy: this._r4(fy),
      fw: this._r4(wPx / spanX), fh: this._r4(hPx / spanY),
      rot: 0, dur: 300, pts: []
    });
    return this.addStroke(s, true, true); // v206：貼紙不計時（Doceri 模型），tlT 蓋 liveEdge/播放頭戳
  }
  /* v195：貼紙圖片元素（載入後自動重繪；快取不進存檔） */
  _stickerEl(s) {
    const key = s.id + ':' + (s.src ? s.src.length : 0) + ':' + (s.src ? s.src.slice(-24) : '');
    let el = this._stickerEls.get(key);
    if (!el) {
      el = new Image();
      el.onload = () => this.render();
      el.src = s.src;
      this._stickerEls.set(key, el);
    }
    return el;
  }
  /* v139：刪除指定圖片 */
  removeImage(id) {
    const pg = this.page;
    const imgs = this._migrateImages(pg);
    const i = imgs.findIndex(im => im.id === id);
    if (i >= 0) {
      imgs.splice(i, 1);
      this._emit('image', { page: this.pageIndex, action: 'remove', id }, true); // v206：不計時
      this.render();
      return true;
    }
    return false;
  }
  clearImage() {
    const pg = this.page;
    this._migrateImages(pg);
    pg.images = [];
    pg.image = null;
    this._emit('image', { page: this.pageIndex, dataUrl: null }, true); // v206：不計時
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
  /* v210：圖形專屬設定 setter（與 setColor/setWidth 對偶，互不影響） */
  setShapeColor(c) { this.shapeColor = c; }
  setShapeWidth(w) { this.shapeWidth = w; }
  setShapeDash(d) { this.shapeDash = d ? 1 : 0; }
  /* v210：短虛線樣式——段長≈3×線寬、間隔≈2×線寬，與線寬成比例（lw＝當下 ctx 的 lineWidth 值） */
  _dashPattern(lw) { return [Math.max(2, lw * 3), Math.max(2, lw * 2)]; }

  /* ---------- 筆跡操作 ---------- */
  /* v47：每頁獨立時間軸。事件寫入當頁的 tl.events，時間是該頁時鐘（第一筆為 00:00）。
   * 不再經由全域 SessionLog，不再需要 page 標籤。
   * 回放中落筆（TLC.active 且不在 live）：用 playhead 時間，讓筆跡落在回放位置。
   * v206：事件分兩類（Doceri 計時模型）——
   * 計時類（untimed 省略/false）：筆/螢光筆/圖形工具的書寫、橡皮擦、播放頭補筆。
   *   只有它們能建立/喚醒頁面時鐘、推進時間軸。
   * 不計時類（untimed=true）：貼紙、圖片、文字、複製/貼上產物、移動/旋轉/縮放調整、
   *   復原/重做、圖形辨識替換、換頁/背景/增刪頁。永不建立時鐘、永不 resume 時鐘；
   *   需要 tlT 的物件蓋 liveEdge 戳（回放中且播放頭不在末端時取播放頭，經 onUntimedStamp），
   *   不佔用、不平移任何時間。此分流修掉舊制的「時鐘洩漏」：非手勢 _emit 喚醒時鐘後
   *   無人暫停，下一筆把真實秒數吞進 tlT，在末端長出幽靈時間軸。 */
  _emit(type, data, untimed) {
    const pg = this.page;
    if (pg && pg.tl) {
      const tl = pg.tl;
      // v101：任何時間軸事件都算動作（復原/重做按鈕不走 _down，這裡補上）
      this._lastActivity = performance.now();
      if (untimed) {
        let t;
        if (type === 'add' && data && data.stroke && data.stroke.tlT !== undefined) {
          t = Math.round(data.stroke.tlT);   // 預置戳記（圖形辨識替換繼承原筆 tlT）：沿用
        } else if (type === 'add' && this._tlPlayhead !== null && this._tlPlayhead !== undefined) {
          t = Math.round(this._tlPlayhead);
        } else {
          t = this._untimedStamp();
        }
        // v99：時間戳最小為 1（同計時類）
        if (t < 1) t = 1;
        if (type === 'add' && data && data.stroke && data.stroke.tlT === undefined) {
          data.stroke.tlT = t;
        }
        tl.events.push({ t, evt: type, data: data || {} });
      } else {
        let freshClock = false;
        if (!tl.clock) {
          tl.clock = new LessonClock();
          tl.clock.start();
          freshClock = true;
        }
        let t = Math.round(tl.clock.now());
        // v99：時間戳最小為 1，避免 tlT=0 在 cutoff=0 時被顯示（拉到最前應為空白）
        if (t < 1) t = 1;
        // v172：新事件不得早於本頁結尾——轉檔課舊筆跡自帶 Doceri 原始時間，
        // 本機時鐘卻從 0 起算，不夾住的話新筆會被蓋到時間軸最前面（兩套時間）。
        // v208：append 的新筆要「接在」舊結尾之後——tlT 是結束戳，釘在 edge 會讓
        // 區間變成 [edge−dur, edge]、與前筆重疊且總長不長（無時鐘頁面首筆實測：
        // 剛打開的轉檔課寫第一筆，總長紋風不動）。改釘 edge＋dur，區間＝
        // [edge, edge＋dur]，總長正確延長。erase 事件戳維持釘 edge（事件點在結尾）。
        if ((type === 'add' || type === 'erase') && (this._tlPlayhead === null || this._tlPlayhead === undefined)) {
          const edge = Math.round(this._liveEdgeT());
          if (t < edge) {
            t = (type === 'add' && data && data.stroke && data.stroke.tlT === undefined)
              ? edge + Math.round(data.stroke.dur || 0)
              : edge;
            tl.clock.base = t;
            if (tl.clock.running) tl.clock.t0 = performance.now();
          }
        }
        if (tl.clock && !tl.clock.running) tl.clock.resume();
        // v47：回放中落筆，用 playhead 時間（需 app.js 設定 board._tlPlayhead）
        // v206：補筆改結束戳——tlT := 播放頭 + dur，全系統筆跡統一 [tlT−dur, tlT] 區間模型
        // （舊制 tlT=播放頭是開始戳，與其他筆跡的結束戳混用，補筆區間會凸出總長之外）。
        // v207：補筆＝插入，必須讓位（不重疊不變量）——先由 _insertYield 解析有效插入點
        // 並把後方筆跡推開 dur＋TL_EPS，新筆帶 sepAfter 旗標；游標接續時跨過區隔
        // （_tlInsertNext = tlT + TL_EPS），刪除/復原時由 rippleCompact 連區隔回收，
        // 任意插入/刪除順序下總長與各筆 tlT 分毫不差回到原值。
        let insFlagged = false;
        if (this._tlPlayhead !== null && this._tlPlayhead !== undefined && type === 'add'
            && data && data.stroke && data.stroke.tlT === undefined) {
          const D = Math.round(data.stroke.dur || 0);
          const ins = this._insertYield(pg, Math.round(this._tlPlayhead), D, data.stroke);
          t = ins.effP + D;
          insFlagged = ins.flagged;
          if (insFlagged) {
            data.stroke.sepAfter = TL_EPS;
            // v207：實際位移量一併記下（sepYield）——插入點前若本來有間隙 g，
            // shift = D + TL_EPS − g < D + TL_EPS；刪除回收必須照實際位移量，
            // 否則每插刪一輪就漂移 g（實測天然間隙 1ms → 回復差 1ms）。
            data.stroke.sepYield = ins.shift;
          }
        } else if (this._tlPlayhead !== null && this._tlPlayhead !== undefined && type === 'add') {
          t = Math.round(this._tlPlayhead) + Math.round((data && data.stroke && data.stroke.dur) || 0);
        }
        if (type === 'add' && data && data.stroke && data.stroke.tlT === undefined) {
          // v206：本頁第一筆的時鐘是在這次 _emit 內才建立的，now()≈0 會讓 tlT≈1 與 dur 脫鉤
          // （區間 [tlT−dur, tlT] 變成負起點）；新建時鐘的第一筆以 dur 為下限，區間起點落在 0。
          if (freshClock) t = Math.max(t, Math.round(data.stroke.dur || 0));
          data.stroke.tlT = t;
        }
        // v175：補線游標接續——同一播放頭的下一筆接在這一筆後面
        // v206：游標＝本筆的結束戳（與 tlT 同值），接續語意不變
        // v207：有區隔旗標時游標跨過 TL_EPS，下一筆接在區隔之後（與刪除回收的數學對稱）
        if (type === 'add' && this._tlPlayhead !== null && this._tlPlayhead !== undefined) {
          this._tlInsertNext = t + (insFlagged ? TL_EPS : 0);
        }
        tl.events.push({ t, evt: type, data: data || {} });
      }
    }
    if (this.onEvent) this.onEvent(type, data);
  }
  /* v206：不計時事件的戳記——app.js 有提供播放頭就用播放頭，否則用本頁 liveEdge */
  _untimedStamp() {
    if (typeof this.onUntimedStamp === 'function') {
      const v = this.onUntimedStamp();
      if (v !== null && v !== undefined) return Math.round(v);
    }
    return Math.round(this._liveEdgeT());
  }

  /* v207：插入讓位（不重疊不變量的核心）——要在時間點 p 插入總長 D 的新筆跡（或整批）時：
   * 1) 有效插入點 effP：若 p 落在某筆區間內部（start < p < end），改用該筆的區間終點
   *    （再加該筆的 sepAfter，若有）；多筆重疊包含 p 時取最晚的終點。
   * 2) 後方筆跡（區間起點 >= effP，不限類型）的最早起點 nextStart 決定位移量：
   *    shift = max(0, effP + D + TL_EPS - nextStart)；後方無筆＝append，不位移、不打旗標。
   * 3) 位移同步套用到：後方筆跡的 tlT、已擦除紀錄（eraseT 保持＝該筆 tlT）、
   *    參照到被位移筆跡的事件 t。段落標記綁 strokeId、讀取時由 tlT 推導，自動跟隨。
   * 回傳 { effP, shift, flagged, ids }：ids＝被位移的既有筆跡 id（貼上整批復原要用）。 */
  _insertYield(pg, p, D, exclude) {
    const iv = s => {
      const end = s.tlT || 0;
      return [end - (s.dur || 300), end];
    };
    let effP = p;
    for (const s of pg.strokes) {
      if (s === exclude) continue;
      const [a, b] = iv(s);
      if (a < p && p < b) effP = Math.max(effP, b + (s.sepAfter || 0));
    }
    let nextStart = Infinity;
    for (const s of pg.strokes) {
      if (s === exclude) continue;
      const [a] = iv(s);
      if (a >= effP && a < nextStart) nextStart = a;
    }
    if (nextStart === Infinity) return { effP, shift: 0, flagged: false, ids: [] };
    const shift = Math.max(0, effP + D + TL_EPS - nextStart);
    const ids = [];
    if (shift > 0) {
      const idSet = new Set();
      for (const s of pg.strokes) {
        if (s === exclude) continue;
        const [a] = iv(s);
        if (a >= effP) { idSet.add(s.id); ids.push(s.id); }
      }
      // 已擦除的筆跡不在 pg.strokes 裡，但它的 eraseT 參與 liveEdge，位移集合要一併納入
      if (pg.tl && pg.tl.erased) {
        for (const e of pg.tl.erased) {
          const [a] = iv(e.stroke);
          if (a >= effP && !idSet.has(e.stroke.id)) { idSet.add(e.stroke.id); ids.push(e.stroke.id); }
        }
      }
      this._applyYieldDelta(pg, idSet, shift);
    }
    return { effP, shift, flagged: true, ids };
  }

  /* v207：把一組筆跡（idSet）的時間軸位置整體平移 delta——筆跡 tlT、已擦除紀錄、
   * 參照到這些筆跡的事件 t 一起動，頁面時鐘 base 同步到 liveEdge。
   * _insertYield 用 +shift 讓位；貼上整批的復原/重做用 ∓shift 精確反向/重放。 */
  _applyYieldDelta(pg, idSet, delta) {
    if (!delta) return;
    for (const s of pg.strokes) {
      if (idSet.has(s.id)) s.tlT = (s.tlT || 0) + delta;
    }
    if (pg.tl && pg.tl.erased) {
      for (const e of pg.tl.erased) {
        if (idSet.has(e.stroke.id)) { e.stroke.tlT = (e.stroke.tlT || 0) + delta; e.eraseT = e.stroke.tlT; }
      }
    }
    if (pg.tl && pg.tl.events) {
      for (const ev of pg.tl.events) {
        const d = ev.data || {};
        const sid = (d.stroke && d.stroke.id !== undefined) ? d.stroke.id : d.id;
        if (sid !== undefined && idSet.has(sid)) ev.t += delta;
        else if (Array.isArray(d.ids) && d.ids.some(id => idSet.has(id))) ev.t += delta;
      }
    }
    if (pg.tl && pg.tl.clock) {
      pg.tl.clock.base = Math.round(this._liveEdgeT());
      if (pg.tl.clock.running) pg.tl.clock.t0 = performance.now();
    }
  }

  _newStroke(tool, extra) {
    const s = Object.assign({
      id: this._strokeSeq++, tool, color: this.color,
      width: this.width, pts: [], t0: 0, dur: 0, page: this.pageIndex
    }, extra || {});
    return s;
  }

  addStroke(stroke, record = true, untimed = false) {
    stroke.page = this.pageIndex;
    this.page.strokes.push(stroke);
    this.page.undo.push(stroke);
    this.page.redo.length = 0;
    if (record) this._emit('add', { page: this.pageIndex, stroke }, untimed);
    this.render();
    return stroke;
  }

  /* v204：筆跡在分數空間的包圍盒（供複製偏移 clamp 用；text 以錨點計、sticker 以中心±半寬高計） */
  _strokeFracBBox(s) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const eat = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    if (s.tool === 'sticker') {
      eat(s.fx - (s.fw || 0) / 2, s.fy - (s.fh || 0) / 2);
      eat(s.fx + (s.fw || 0) / 2, s.fy + (s.fh || 0) / 2);
    } else if (s.tool === 'shape' || s.fx0 !== undefined) {
      eat(s.fx0, s.fy0); eat(s.fx1, s.fy1);
    } else if (s.fx !== undefined) {
      eat(s.fx, s.fy);
    }
    if (s.pts) for (const pt of s.pts) eat(pt[1], pt[2]);
    return x1 >= x0 ? { x0, y0, x1, y1 } : null;
  }
  /* v204：把一筆在分數空間平移（fx/fy、fx0..、pts 全套，比照 _applyPosItems 的欄位慣例） */
  _shiftStrokeFrac(s, dx, dy) {
    if (s.fx !== undefined) { s.fx = this._r4(s.fx + dx); s.fy = this._r4(s.fy + dy); }
    if (s.fx0 !== undefined) {
      s.fx0 = this._r4(s.fx0 + dx); s.fy0 = this._r4(s.fy0 + dy);
      s.fx1 = this._r4(s.fx1 + dx); s.fy1 = this._r4(s.fy1 + dy);
    }
    if (s.pts) for (const pt of s.pts) { pt[1] = this._r4(pt[1] + dx); pt[2] = this._r4(pt[2] + dy); }
  }
  /* v206：筆跡剪貼簿（跨頁存活）——把目前套索選取深拷貝存起來：
     剝除 id、tlT 與所有 _ 暫存欄位（_orig* 等）；不複製段落標記 stops（標記留在原筆）。 */
  copySelectionToClipboard() {
    const sel = this._lassoSel;
    if (!sel || !sel.length) return 0;
    this._clipboard = sel.map(s => {
      const c = JSON.parse(JSON.stringify(s));
      for (const k of Object.keys(c)) if (k[0] === '_') delete c[k];
      delete c.tlT;
      delete c.id;
      delete c.sepAfter;   // v207：區隔旗標是原頁的插入帳目，不跟著筆跡走（貼上時由插入邏輯重新決定）
      delete c.sepYield;
      return c;
    });
    this._pasteSeq = 0;   // 重新複製→累進偏移從頭算
    return this._clipboard.length;
  }
  clipboardCount() { return this._clipboard ? this._clipboard.length : 0; }
  /* v206：把剪貼簿貼到目前頁——新 id、整體偏移 0.03×次數（分數空間，clamp 不超出畫布），
     貼上組成為新選取；每筆走不計時 _emit('add')（預賦 tlT 沿用，不喚醒時鐘）；
     復原一次整批退掉（{_dupUndo} 紀錄，同 v204 慣例）。
     v207：回放中（播放頭不在末端）貼上＝插入，整批視為一個插入單位：先 _insertYield 讓位，
     整批依剪貼簿順序首尾相接佈置（批總長 D＝各筆 dur 總和），最後一筆帶 sepAfter: TL_EPS；
     讓位紀錄（shift＋被位移筆 id）存進 _dupUndo 筆記，整批復原/重做時精確反向/重放位移。
     v209：append 路廢止 v206「貼上不佔時間」模型（學長主張：寫字的時間也要複製），
     改與插入路同模型：自目標頁 liveEdge 起、依剪貼簿順序首尾相接、各筆保留原 dur，
     總長增加 D；不讓位、不打旗標（shift＝0），刪除走一般漣波精確回收 D。
     貼完經 onPasteAppend 回呼請 app.js 把播放頭推到新結尾（比照 v208 手寫 append）。 */
  pasteClipboard() {
    if (!this._clipboard || !this._clipboard.length) return [];
    const pg = this.page;
    this._pasteSeq = (this._pasteSeq || 0) + 1;
    let maxX = -1e9, maxY = -1e9;
    for (const s of this._clipboard) {
      const bb = this._strokeFracBBox(s);
      if (bb) { if (bb.x1 > maxX) maxX = bb.x1; if (bb.y1 > maxY) maxY = bb.y1; }
    }
    const step = 0.03 * this._pasteSeq;
    const dx = Math.max(0, Math.min(step, 1 - maxX));
    const dy = Math.max(0, Math.min(step, 1 - maxY));
    const copies = this._clipboard.map(src => {
      const c = JSON.parse(JSON.stringify(src));
      c.id = this._strokeSeq++;
      c.page = this.pageIndex;
      delete c.sepAfter;   // v207：旗標只由本次插入邏輯決定（見下）
      delete c.sepYield;
      this._shiftStrokeFrac(c, dx, dy);
      return c;
    });
    // v207：插入判定——onUntimedStamp 有給播放頭（回放中）才可能是插入
    // v209：插入未成立（無播放頭、或播放頭後方已無筆可讓位）一律走 append 佈置
    let ins = null;
    if (typeof this.onUntimedStamp === 'function') {
      const v = this.onUntimedStamp();
      if (v !== null && v !== undefined) {
        const D = copies.reduce((a, c) => a + (c.dur || 300), 0);
        const y = this._insertYield(pg, Math.round(v), D, null);
        if (y.flagged) {
          ins = y;
          let cur = y.effP;
          for (const c of copies) { cur += (c.dur || 300); c.tlT = cur; }
          copies[copies.length - 1].sepAfter = TL_EPS;
          copies[copies.length - 1].sepYield = y.shift;   // v207：實際位移量，刪除時精確回收
        }
      }
    }
    if (!ins) {
      // v209 append：自本頁 liveEdge 起首尾相接（空白／無時鐘頁 liveEdge＝0、自 0 起跳）；
      // 預賦 tlT 由不計時 _emit 沿用，v172/v208 clamp 只作用於 tlT 未定的計時新筆、不干擾。
      let cur = Math.round(this._liveEdgeT());
      for (const c of copies) { cur += (c.dur || 300); c.tlT = cur; }
    }
    for (const c of copies) {
      pg.strokes.push(c);
      this._emit('add', { page: this.pageIndex, stroke: c }, true);
    }
    pg.redo.length = 0;
    const entry = { _dupUndo: 1, strokes: copies };
    if (ins) { entry._yieldShift = ins.shift; entry._yieldIds = ins.ids; entry._yieldApplied = ins.shift > 0; }
    pg.undo.push(entry);
    this._lassoSel = copies;
    if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
    this.render();
    // v209：append 貼上後把播放頭推到新結尾（插入路不推——播放頭留在插入點，v207 行為不變）
    if (!ins && typeof this.onPasteAppend === 'function') this.onPasteAppend();
    return copies;
  }
  /* v204：複製選取（Doceri 式圈選複製貼上）——複製一份、整體偏移、複製組成為新選取、整批可復原。
     v206：改走剪貼簿——入剪貼簿＋立即貼上一份（手感與 v204 相同，且剪貼簿留著可再貼/跨頁貼）。 */
  duplicateSelection() {
    if (!this._lassoSel || !this._lassoSel.length) return [];
    this.copySelectionToClipboard();
    return this.pasteClipboard();
  }
  /* v204：整批複製的復原/重做——只處理實際還在畫布上的複製筆（中途被刪/擦掉的不復活） */
  _dupUndoStep(isUndo) {
    const from = isUndo ? this.page.undo : this.page.redo;
    const to = isUndo ? this.page.redo : this.page.undo;
    const entry = from.pop();
    if (!entry) return;
    if (!entry._dupUndo) { from.push(entry); return; }
    if (isUndo) {
      const ids = new Set(entry.strokes.map(s => s.id));
      const present = this.page.strokes.filter(s => ids.has(s.id));
      this.page.strokes = this.page.strokes.filter(s => !ids.has(s.id));
      for (const s of present) this._emit('unadd', { page: this.pageIndex, id: s.id }, true); // v206：不計時
      // v207：整批是插入單位時，復原要把當初的讓位位移精確反向（複製筆已被其他路徑刪掉時
      // 不重複反向——那份位移已由 rippleCompact 在刪除時回收）
      let yieldApplied = !!entry._yieldApplied;
      if (yieldApplied && present.length) {
        this._applyYieldDelta(this.page, new Set(entry._yieldIds || []), -(entry._yieldShift || 0));
        yieldApplied = false;
      }
      to.push({ _dupUndo: 1, strokes: entry.strokes, _removedIds: present.map(s => s.id),
                _yieldShift: entry._yieldShift, _yieldIds: entry._yieldIds, _yieldApplied: yieldApplied });
      if (this._lassoSel && this._lassoSel.some(s => ids.has(s.id))) {
        this._lassoSel = this._lassoSel.filter(s => !ids.has(s.id));
        if (!this._lassoSel.length) this._lassoSel = null;
        if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      }
    } else {
      const want = new Set(entry._removedIds || entry.strokes.map(s => s.id));
      const back = entry.strokes.filter(s => want.has(s.id) && !this.page.strokes.some(x => x.id === s.id));
      for (const s of back) {
        this.page.strokes.push(s);
        this._emit('readd', { page: this.pageIndex, id: s.id, stroke: s }, true); // v206：不計時
      }
      // v207：重做把複製筆放回時，當初的讓位位移一併重放（與復原的反向對稱）
      let yieldApplied = !!entry._yieldApplied;
      if (!yieldApplied && back.length && entry._yieldShift) {
        this._applyYieldDelta(this.page, new Set(entry._yieldIds || []), entry._yieldShift);
        yieldApplied = true;
      }
      to.push({ _dupUndo: 1, strokes: entry.strokes,
                _yieldShift: entry._yieldShift, _yieldIds: entry._yieldIds, _yieldApplied: yieldApplied });
    }
    this.render();
  }

  _r4(v) { return Math.round(v * 10000) / 10000; } // 座標取小數4位，0.1px 精度，省一半空間

  /* v145：鋼筆筆壓 — 讀 PointerEvent.pressure（Apple Pencil 0..1；滑鼠按住時 0.5；
     無壓感/讀不到時 fallback 0.5＝等寬）。回傳 0..1（小數2位）。 */
  _press(e) {
    let p = (e && typeof e.pressure === 'number') ? e.pressure : 0.5;
    if (!(p > 0)) p = 0.5;
    if (p > 1) p = 1;
    return Math.round(p * 100) / 100;
  }
  /* v145：該點的筆寬（px）— pressure 0.5＝標準寬度，0→0.35x，1→1.65x。
     舊檔/無壓感（pt[3] 缺失）fallback 0.5，渲染與舊版完全一致。 */
  _pressW(s, pt, k) {
    const p = (pt.length > 3 && typeof pt[3] === 'number') ? pt[3] : 0.5;
    return s.width * k * (0.35 + 1.3 * Math.max(0, Math.min(1, p)));
  }

  addText(fx, fy, text, size) {
    if (!text || !text.trim()) return null;
    const s = this._newStroke('text', { fx: this._r4(fx), fy: this._r4(fy), text: text.trim(), size: size || this.textSize });
    return this.addStroke(s, true, true); // v206：文字不計時（Doceri 模型）
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
    // v172：擦除即生效——eraseT 記為該筆自己的 tlT，重播時該筆不再復活。
    // （v96 舊制用時鐘時間：轉檔課上 eraseT 會大於被擦筆的 tlT，拉時間軸到中間時被擦的筆又被畫回來，像沒擦掉）
    if (!this.page.tl.erased) this.page.tl.erased = [];
    for (const s of removed) {
      this.page.tl.erased.push({ stroke: s, eraseT: (s.tlT === undefined ? 0 : s.tlT) });
    }
    this._emit('erase', { page: this.pageIndex, ids: removed.map(s => s.id) });  // v94：橡皮擦＝時間軸事件，重播時會看到擦除動作
    this.rippleCompact(removed);   // v173：刪掉的時間段跟著消除，後面的筆往前補
    this.render();
  }

  /* v173：漣波補位——移除被刪筆跡佔的時間區間，其後筆跡/事件同步前移，總長跟著縮。
     v174：墨課沒有錄音功能（2026-11-13 拍板不做、2026-11-16 南勛重申），不需護欄，無條件補位。
     v206：區間模型修正——tlT 是「結束戳」，筆跡真實區間是 [tlT−dur, tlT]；
     舊制用 [tlT, tlT+dur]（開始戳模型）算，刪一筆後，凡在被刪筆 dur 內畫完的後續筆跡
     都會被 shift() 精確塌陷到被刪筆的 tlT 上（重播時整批同時冒出＝學長的「筆跡錯亂」）。
     v207：被刪筆若帶 sepAfter（插入時打的區隔旗標），區隔連帶回收——移除跨度
     ＝ [區間起點, 起點＋sepYield]：sepYield 是插入當下實際造成的位移量
     （D + TL_EPS − 插入點前的既有間隙），照它回收才能分毫不差回到插入前
     （只用 tlT＋sepAfter 會多回收那段既有間隙）。無 sepYield 的帶旗標筆退回
     tlT＋sepAfter；未帶旗標者維持 v206 行為，只扣 dur。三條刪除路徑
     （抽屜多選刪、套索 ✕、橡皮擦）共用本函式，一處全通。 */
  rippleCompact(removed) {
    if (!removed || !removed.length) return;
    const pg = this.page;
    const spans = removed
      .map(s => {
        const a = Math.max(0, (s.tlT || 0) - (s.dur || 300));
        const b = (s.sepYield !== undefined && s.sepYield !== null)
          ? a + s.sepYield
          : (s.tlT || 0) + (s.sepAfter || 0);
        return [a, b];
      })
      .sort((a, b) => a[0] - b[0]);
    if (!spans.length) return;
    const merged = [spans[0].slice()];
    for (let i = 1; i < spans.length; i++) {
      const last = merged[merged.length - 1];
      if (spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
      else merged.push(spans[i].slice());
    }
    const shift = (t) => {
      let d = 0;
      for (const [a, b] of merged) {
        if (t <= a) break;
        d += Math.min(b, t) - a;
      }
      return d;
    };
    for (const s of pg.strokes) {
      if (s.tlT) s.tlT -= shift(s.tlT);
    }
    if (pg.tl) {
      for (const ev of pg.tl.events) ev.t -= shift(ev.t);
      if (pg.tl.erased) {
        for (const e of pg.tl.erased) {
          // v208：幽靈帳本一律跟著漣波對映——本次移除的筆也一樣（舊制只把它的
          // eraseT 歸零、tlT 留在已被移除的舊座標裡；之後任一次漣波拿那個陳舊
          // tlT 重推 eraseT，總長被重新釘回舊位置：逆序/混合序擦除會留殘值，
          // 全擦光總長仍不歸零——學長實測）。對映後幽靈塌到被移除區間的起點，
          // eraseT 恆等於壓縮後座標，任何擦除順序下總長都正確。
          if (e.stroke.tlT) e.stroke.tlT -= shift(e.stroke.tlT);
          e.eraseT = (e.stroke.tlT || 0);
        }
      }
      if (pg.tl.clock) {
        pg.tl.clock.base = Math.round(this._liveEdgeT());
        if (pg.tl.clock.running) pg.tl.clock.t0 = performance.now();
      }
    }
  }

  _hitStroke(s, x, y) {
    const W = this._cssW, H = this._cssH;
    const tol = Math.max(14, s.width * (W / 1000) + 8);
    if (s.tool === 'sticker') {
      // v202：橡皮擦對貼紙比照圖形（南勛：貼紙跟圖形同等待遇）——
      // 點落在貼紙範圍內（含 rot 旋轉後的四角）或距邊線 tol 內，整張擦掉（跟圖形整筆移除一致）。
      const cxp = s.fx * W, cyp = s.fy * H;
      const hw = s.fw / 2 * W, hh = s.fh / 2 * H;
      const rot = (s.rot || 0) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const cs = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]]
        .map(([dx, dy]) => ({ x: cxp + dx * cos - dy * sin, y: cyp + dx * sin + dy * cos }));
      const quad = [cs[0], cs[1], cs[3], cs[2]];
      if (this._pointInPoly(x, y, quad)) return true;
      for (let i = 0; i < 4; i++) {
        const a = quad[i], b = quad[(i + 1) % 4];
        if (this._distToSeg(x, y, a.x, a.y, b.x, b.y) < tol) return true;
      }
      return false;
    }
    if (s.tool === 'text') {
      const sx = s.fx * W, sy = s.fy * H;
      return Math.hypot(x - sx, y - sy) < Math.max(30, s.size * (W / 1000));
    }
    if (s.tool === 'shape') {
      const x0 = s.fx0 * W, y0 = s.fy0 * H, x1 = s.fx1 * W, y1 = s.fy1 * H;
      for (const sg of this._shapeSegments(s.shape, x0, y0, x1, y1, s.origin)) {
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
  _shapeSegments(shape, x0, y0, x1, y1, origin) {
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
      if (origin === 'bl') {
        // v184：原點左下角——x 軸沿底邊、y 軸沿左邊
        const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
        const ty = Math.min(y0, y1), by = Math.max(y0, y1);
        line(lx, by, rx, by);
        line(lx, by, lx, ty);
      } else {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hw = Math.abs(x1 - x0) / 2, hh = Math.abs(y1 - y0) / 2;
        line(cx - hw, cy, cx + hw, cy);
        line(cx, cy + hh, cx, cy - hh);
      }
    }
    return segs;
  }

  /* v180：移動復原——把一組筆跡的位置存成 {_moveUndo} 紀錄放進 undo/redo 堆疊。
     先前 undo 只記新增筆跡：移動後按復原不會退回移動、反而刪掉最近一筆（學長實測）。 */
  _posItems(strokes) {
    return strokes.map(s => ({ id: s.id, fx: s.fx, fy: s.fy,
      fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
      // v206：連同尺寸欄位一起快照（縮放復原/重播歷史用；舊紀錄缺欄位時 _applyPosItems 自動跳過）
      width: s.width, size: s.size, fw: s.fw, fh: s.fh, rot: s.rot,
      pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null }));
  }
  _applyPosItems(items) {
    for (const it of items) {
      const s = this.page.strokes.find(x => x.id === it.id);
      if (!s) continue;
      if (it.fx !== undefined) { s.fx = it.fx; s.fy = it.fy; }
      if (it.fx0 !== undefined) { s.fx0 = it.fx0; s.fy0 = it.fy0; s.fx1 = it.fx1; s.fy1 = it.fy1; }
      if (it.width !== undefined) s.width = it.width;
      if (it.size !== undefined) s.size = it.size;
      if (it.fw !== undefined) s.fw = it.fw;
      if (it.fh !== undefined) s.fh = it.fh;
      if (it.rot !== undefined) s.rot = it.rot;
      if (it.pts) s.pts = it.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]);
    }
  }
  _pushMoveUndo(origItems) {
    if (!origItems || !origItems.length) return;
    this.page.undo.push({ _moveUndo: 1, items: origItems.map(o => ({ id: o.s.id,
      fx: o.fx, fy: o.fy, fx0: o.fx0, fy0: o.fy0, fx1: o.fx1, fy1: o.fy1,
      width: o.width, size: o.size, fw: o.fw, fh: o.fh, rot: o.rot,
      pts: o.pts ? o.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null })) });
    this.page.redo = [];
  }
  _moveUndoStep(fromStack, toStack) {
    const entry = fromStack.pop();
    if (!entry) return false;
    if (!entry._moveUndo) { fromStack.push(entry); return false; }
    const cur = this._posItems(entry.items
      .map(it => this.page.strokes.find(x => x.id === it.id)).filter(Boolean));
    toStack.push({ _moveUndo: 1, items: cur });
    this._applyPosItems(entry.items);
    this.render();
    return true;
  }

  undo() {
    const top = this.page.undo[this.page.undo.length - 1];
    if (top && top._moveUndo) { this._moveUndoStep(this.page.undo, this.page.redo); return; }
    if (top && top._dupUndo) { this._dupUndoStep(true); return; }
    const s = this.page.undo.pop();
    if (!s) return;
    this.page.strokes = this.page.strokes.filter(x => x.id !== s.id);
    this.page.redo.push(s);
    this._emit('unadd', { page: this.pageIndex, id: s.id }, true);  // v25：復原＝從時間軸移除該筆（同步刪除它的時間）；v206：不計時（復原不喚醒時鐘）
    // v207：復原的若是插入筆（帶 sepAfter），它當初推開的後方筆跡要一併收回——
    // 走 rippleCompact（跨度照 sepYield 精確回收），與刪除路徑同一套回收數學。
    if (s.sepAfter) this.rippleCompact([s]);
    this.render();
  }
  redo() {
    const top = this.page.redo[this.page.redo.length - 1];
    if (top && top._moveUndo) { this._moveUndoStep(this.page.redo, this.page.undo); return; }
    if (top && top._dupUndo) { this._dupUndoStep(false); return; }
    const s = this.page.redo.pop();
    if (!s) return;
    // v207：重做的若是插入筆，先在它的原插入點重放讓位（後方筆跡推開 dur+TL_EPS），
    // 再把筆放回——與 undo 的 ripple 回收對稱，數值分毫不差。
    if (s.sepAfter) {
      const y = this._insertYield(this.page, (s.tlT || 0) - (s.dur || 300), Math.round(s.dur || 0), s);
      if (y.flagged) s.sepYield = y.shift;   // 版面已精確還原，重算值應與原值相同，一併刷新
    }
    this.page.strokes.push(s);
    // v96：重做恢復被擦除的筆跡時，從 erased 記錄移除（避免重播時重複繪製）
    if (this.page.tl && this.page.tl.erased) {
      this.page.tl.erased = this.page.tl.erased.filter(e => e.stroke.id !== s.id);
    }
    this.page.undo.push(s);
    this._emit('readd', { page: this.pageIndex, id: s.id, stroke: s }, true);  // v25：重做＝恢復該筆的時間軸紀錄；v206：不計時
    this.render();
  }
  clearPage(keepImage = true) {
    const pg = this.page;
    const imgs = this._migrateImages(pg);
    if (!pg.strokes.length && !imgs.length && !pg.image) return;
    pg.strokes = [];
    pg.undo = [];
    pg.redo = [];
    // v74：預設保留底圖（清除筆跡≠清除圖片）；只有刪到剩最後一頁時才清圖片
    // v139：多圖
    if (!keepImage) {
      pg.image = null;
      pg.images = [];
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
    // v142：手機瀏覽器 UI 收合時，顯示尺寸可能跟 resize 時的 _cssW/H 脫鉤
    // 先把螢幕座標換算回邏輯尺寸，再做後續轉換，避免點位偏移
    const sx = (e.clientX - r.left) * (this._cssW / (r.width || 1));
    const sy = (e.clientY - r.top) * (this._cssH / (r.height || 1));
    // v42：螢幕座標 → 畫布座標（考慮縮放平移），再轉正規化座標
    const v = this.view;
    const cx = (sx - v.ox) / v.scale, cy = (sy - v.oy) / v.scale;
    return { x: sx, y: sy, cx, cy, fx: cx / this._cssW, fy: cy / this._cssH };
  }
  /* v162：手指書寫補正——系統回報的觸點是指腹中心，比使用者瞄準的指尖上緣低約 10px，
     用手指寫字時墨會出現在瞄準點下方（感覺沒對準）。pen/mouse 不補正；
     只套用在筆/螢光筆/橡皮擦的落點，選取/拖曳/圖形不動，避免點按錯位 */
  _lift(e, p) {
    if (!e || e.pointerType !== 'touch' || !p) return p;
    const L = (typeof this.fingerLift === 'number') ? this.fingerLift : 0;     // v163：上下可調
    const LX = (typeof this.fingerShiftX === 'number') ? this.fingerShiftX : 0; // v164：左右可調
    if (!L && !LX) return p;
    const sc = (this.view && this.view.scale) || 1;
    const cy = p.cy - L / sc, cx = p.cx + LX / sc;
    return Object.assign({}, p, { cx, cy, fx: cx / this._cssW, fy: cy / this._cssH });
  }
  /* v165：lockBg 頁（轉檔匯入）的筆跡座標以整頁底圖為準（render 用底圖 fit 座標系繪製）。
     輸入端必須把觸點從畫布座標換算進底圖座標，否則寫的當下跟手、放筆重繪時整筆往畫面中心縮：
     正中間準、左邊往右偏、右邊往左偏（畫布比 16:9 寬時最明顯，如 iPad mini）。 */
  _lockBounds() {
    const pg = this.page;
    if (!pg || !pg.lockBg) return null;
    const im = this._migrateImages(pg)[0];
    return im ? this._imgBounds(im) : null;
  }
  _toImgSpace(p) {
    const b = this._lockBounds();
    if (!b || !p) return p;
    const fx = (p.cx - b.x0) / (b.x1 - b.x0), fy = (p.cy - b.y0) / (b.y1 - b.y0);
    return Object.assign({}, p, { fx, fy });
  }
  /* 書寫落點：手指補正（畫布座標）→ 底圖座標換算（lockBg 頁），筆/螢光筆/橡皮擦共用 */
  _inkPos(e, p) { return this._toImgSpace(this._lift(e, p)); }
  /* v180：選取家族的座標換算——lockBg 頁的筆跡分數是「底圖分數」，換成畫布 px 必須走底圖 bounds；
     只用畫布寬高換算會整組偏移（v165 只修了寫/畫，點選/套索/選取框/拖曳都中招，學長實測圈不精確）。 */
  _fracToPx(fx, fy) {
    const b = this._lockBounds();
    if (b) return [b.x0 + fx * (b.x1 - b.x0), b.y0 + fy * (b.y1 - b.y0)];
    return [fx * this._cssW, fy * this._cssH];
  }
  /* px 位移 → 分數位移（拖曳用；lockBg 頁除以底圖寬高，不是畫布寬高） */
  _fracDelta(dxPx, dyPx) {
    const b = this._lockBounds();
    if (b) return [dxPx / (b.x1 - b.x0), dyPx / (b.y1 - b.y0)];
    return [dxPx / this._cssW, dyPx / this._cssH];
  }
  /* 形狀拖曳開始：快照畫布，拖曳中只還原快照＋畫預覽，不重繪整頁（v19） */
  _beginShapeDrag(d) {
    this._shapeDrag = d;
    this._shapeSnap = null;
    // v141：不在這裡清選取——第一指下去可能是雙指手勢的前半，清掉會導致雙指轉失效
    // 新圖形建好時會自動取代選取（v127），小拖曳沒建成則保留舊選取
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
        // v211：變換只記結果——不再記 _orig*（回放一律畫最終幾何）
        this._handDrag = { stroke: s, dx: p.x - x0, dy: p.y - y0, moved: false,
                           fx0: s.fx, fy0: s.fy };
        this.pokeActivity();
        return;
      }
    }
    // v155：手抓升級（南勛核准）— 沒點中文字時，改抓圖形/筆跡：
    // 與套索點選同一命中規則，按住直接拖曳（借套索拖曳機制）；
    // 只點一下不拖＝順便選取（框會留著，可接著用角落把手旋轉）
    const hit = this._tapSelect(p.cx, p.cy);
    if (hit && hit.length) {
      const s = hit[0];
      this._lassoSel = [s];
      if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      this._lassoDrag = { x0: p.cx, y0: p.cy, moved: false,
        orig: [{ s, fx: s.fx, fy: s.fy, fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
                 pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null }] };
      this.pokeActivity();
      this.render();
    }
    // 都沒點中：不做事（畫布平移用雙指）
  }
  /* v105：套索工具 */
  _lassoDown(p) {
    // 如果已有選取且點在選取內→開始拖曳整個選取
    if (this._lassoSel && this._lassoSel.length) {
      if (this._pointInSelection(p.cx, p.cy)) {
        this._lassoDrag = { x0: p.cx, y0: p.cy, moved: false,
          orig: this._lassoSel.map(s => ({ s, fx: s.fx, fy: s.fy,
            fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
            pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null })) };
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
     v110：silent 參數（手勢連續旋轉用）；v211：變換只記結果——不再發時間軸事件、不記 _orig*（silent 與否皆同） */
  rotateSelection(angleDeg, silent) {
    if (!this._lassoSel || !this._lassoSel.length) return;
    // v142：直線/箭頭不需要旋轉
    if (this._lassoSel.length === 1 && (this._lassoSel[0].shape === 'line' || this._lassoSel[0].shape === 'arrow')) return;
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
      if ((s.tool === 'text' || s.tool === 'sticker') && s.fx !== undefined) {
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
          return [pt[0], this._r4(nx / W), this._r4(ny / H), pt[3]];
        });
      }
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
  /* v206：畫布 px → 分數座標（_fracToPx 的逆運算；lockBg 頁走底圖 bounds） */
  _pxToFrac(px, py) {
    const b = this._lockBounds();
    if (b) return [(px - b.x0) / (b.x1 - b.x0), (py - b.y0) / (b.y1 - b.y0)];
    return [px / this._cssW, py / this._cssH];
  }
  /* v206：選取快照（手勢/縮放的起始幾何，格式比照套索拖曳的 orig，另含尺寸欄位） */
  _selSnapshot(strokes) {
    return strokes.map(s => ({ s, fx: s.fx, fy: s.fy,
      fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
      pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null,
      width: s.width, size: s.size, fw: s.fw, fh: s.fh, rot: s.rot || 0 }));
  }
  /* v206：選取群組變換——以快照為基準，繞 (cxPx, cyPx)（畫布 px）縮放 factor、旋轉 angleDeg，
     再平移 (dxPx, dyPx)。每次都從快照重算（手勢給累計值，不累積誤差）。
     筆/螢光筆：點位變換＋筆寬×factor；圖形：中心變換＋寬高×factor＋rot 累計（不轉角點，同 rotateSelection）；
     文字：錨點變換＋字級×factor＋rot 累計；貼紙：中心變換＋fw/fh×factor＋rot 累計。
     tlT/dur 一律不動（Doceri 模型：調整不計時）。 */
  _applySelTransform(items, factor, angleDeg, cxPx, cyPx, dxPx, dyPx) {
    const rad = angleDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const tf = (px, py) => {
      const rx = (px - cxPx) * factor, ry = (py - cyPx) * factor;
      return [cxPx + rx * cos - ry * sin + dxPx, cyPx + rx * sin + ry * cos + dyPx];
    };
    for (const o of items) {
      const s = o.s;
      if (o.pts && o.pts.length) {
        s.pts = o.pts.map(pt => {
          const [px, py] = this._fracToPx(pt[1], pt[2]);
          const [nx, ny] = tf(px, py);
          const [fx, fy] = this._pxToFrac(nx, ny);
          return [pt[0], this._r4(fx), this._r4(fy), pt[3]];
        });
        if ((s.tool === 'pen' || s.tool === 'highlighter') && o.width !== undefined) {
          s.width = Math.round(o.width * factor * 100) / 100;
        }
      }
      if (o.fx0 !== undefined) {
        const [ax, ay] = this._fracToPx(o.fx0, o.fy0);
        const [bx, by] = this._fracToPx(o.fx1, o.fy1);
        const [ncx, ncy] = tf((ax + bx) / 2, (ay + by) / 2);
        const hw = (bx - ax) / 2 * factor, hh = (by - ay) / 2 * factor;
        const [fx0, fy0] = this._pxToFrac(ncx - hw, ncy - hh);
        const [fx1, fy1] = this._pxToFrac(ncx + hw, ncy + hh);
        s.fx0 = this._r4(fx0); s.fy0 = this._r4(fy0);
        s.fx1 = this._r4(fx1); s.fy1 = this._r4(fy1);
        s.rot = ((o.rot || 0) + angleDeg) % 360;
      }
      if (o.fx !== undefined) {
        const [px, py] = this._fracToPx(o.fx, o.fy);
        const [nx, ny] = tf(px, py);
        const [fx, fy] = this._pxToFrac(nx, ny);
        s.fx = this._r4(fx); s.fy = this._r4(fy);
        s.rot = ((o.rot || 0) + angleDeg) % 360;
        if (s.tool === 'text' && o.size !== undefined) s.size = Math.round(o.size * factor * 10) / 10;
        if (s.tool === 'sticker') {
          if (o.fw !== undefined) s.fw = this._r4(o.fw * factor);
          if (o.fh !== undefined) s.fh = this._r4(o.fh * factor);
        }
      }
    }
  }
  /* v206：選取手勢開始——拍快照、算中心。
     v211：變換只記結果，不再記 _orig* 重播歷史（replayOrig 參數保留、僅供呼叫端相容，不再使用）。 */
  _selGestureBegin(replayOrig) {
    const sel = this._lassoSel;
    if (!sel || !sel.length) { this._selBase = null; this._selBaseCenter = null; return null; }
    this._selBase = this._selSnapshot(sel);
    const bb = this._lassoBBox();
    this._selBaseCenter = bb ? { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 } : null;
    return this._selBase;
  }
  /* v206：選取手勢結束——整批一筆復原＋暫停時鐘（同旋轉手勢慣例）。
     v211：變換只記結果，不再發 'move' 事件（extra 參數保留、僅供呼叫端相容，不再使用）。
     undoItems：復原要退回的快照（預設手勢快照；由拖曳轉來時傳拖曳 orig，整段手勢一次退回）。 */
  _selGestureEnd(extra, undoItems) {
    const base = this._selBase;
    this._selBase = null;
    this._selBaseCenter = null;
    if (!base || !base.length) return;
    this._pushMoveUndo(undoItems || base);
    this.pokeActivity();
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
  /* v206：縮放選取（比照 rotateSelection 架構）——factor 為倍率（clamp 0.2–5，比照圖片縮放），
     center 為畫布 px {x, y}，省略＝選取包圍盒中心。silent=true 為手勢模式：
     從 _selGestureBegin 的快照套用累計 factor（手勢結束由 _selGestureEnd 統一收口/復原）；
     非 silent 立即完成並留一筆整批復原。tlT/dur 不變（調整不計時；v211：不發時間軸事件）。 */
  scaleSelection(factor, center, silent) {
    if (!this._lassoSel || !this._lassoSel.length) return;
    factor = Math.max(0.2, Math.min(5, factor || 1));
    if (silent) {
      if (!this._selBase) this._selGestureBegin();
      const c = center || this._selBaseCenter;
      if (this._selBase && c) this._applySelTransform(this._selBase, factor, 0, c.x, c.y, 0, 0);
      this.render();
      return;
    }
    this._selGestureBegin();
    const c = center || this._selBaseCenter;
    if (this._selBase && c) this._applySelTransform(this._selBase, factor, 0, c.x, c.y, 0, 0);
    this._selGestureEnd({ scale: factor });
    this.render();
  }
  /* v105：套索圈選—任一關鍵點在多邊形內就選中 */
  /* v150：套索點選 — 點一下選中單一筆跡/圖形（南勛要求：不用畫圈）。
     命中規則（canvas 座標）：文字＝距錨點 32px；手寫筆跡＝距線段 16px；
     直線/箭頭＝距線身 16px；其他圖形＝點在範圍內或距邊線 16px。
     多個命中時取最後畫的那個（視覺上最上面）。沒命中回傳 null（＝取消選取）。 */
  _tapSelect(cx, cy) {
    const W = this._cssW, H = this._cssH;
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null;
    for (const s of this.page.strokes) {
      let hit = false;
      if (s.tool === 'text') {
        const [ax, ay] = this._fracToPx(s.fx, s.fy);
        hit = Math.hypot(cx - ax, cy - ay) <= 32;
      } else if (s.tool === 'shape' && (s.shape === 'line' || s.shape === 'arrow')) {
        const [ax, ay] = this._fracToPx(s.fx0, s.fy0);
        const [bx, by] = this._fracToPx(s.fx1, s.fy1);
        hit = segDist(cx, cy, ax, ay, bx, by) <= 16;
      } else if (s.tool === 'shape' || s.tool === 'sticker') {
        const c = this._strokePointsPx(s, W, H);  // 旋轉後四角，順序 (x0,y0)(x1,y0)(x0,y1)(x1,y1)
        const quad = [c[0], c[1], c[3], c[2]].map(([x, y]) => ({ x, y }));
        if (this._pointInPoly(cx, cy, quad)) hit = true;
        for (let i = 0; i < 4 && !hit; i++) {
          const a = quad[i], b = quad[(i + 1) % 4];
          hit = segDist(cx, cy, a.x, a.y, b.x, b.y) <= 16;
        }
      } else if (s.pts && s.pts.length) {
        const mp = s.pts.map(pt => this._fracToPx(pt[1], pt[2]));
        if (mp.length === 1) {
          hit = Math.hypot(cx - mp[0][0], cy - mp[0][1]) <= 16;
        }
        for (let i = 1; i < mp.length && !hit; i++) {
          hit = segDist(cx, cy, mp[i - 1][0], mp[i - 1][1], mp[i][0], mp[i][1]) <= 16;
        }
      }
      if (hit) best = s;
    }
    return best ? [best] : null;
  }
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
  /* v133：中心移動把手的螢幕座標（供點擊判斷），無選取回傳 null */
  /* v149：選取框角落旋轉把手的螢幕座標（與 render 繪製位置一致） */
  _rotateHandlesScreen() {
    const bb = this._lassoBBox();
    if (!bb) return null;
    const v = this.view;
    const x0 = bb.x0 * v.scale + v.ox, y0 = bb.y0 * v.scale + v.oy;
    const x1 = bb.x1 * v.scale + v.ox, y1 = bb.y1 * v.scale + v.oy;
    return [{ x: x1 + 8, y: y0 - 8 }, { x: x0 - 8, y: y1 + 8 }];
  }
  /* v149：按住角落旋轉把手拖曳＝旋轉選取（先前把手只是裝飾、拖了沒反應，南勛：根本沒辦法用）
     p.x/p.y 為螢幕座標；命中任一把手（放寬到 28）就開始旋轉拖曳 */
  _rotateDragDown(p) {
    if (!this._lassoSel || !this._lassoSel.length) return false;
    // v142 沿用：單選直線/箭頭不旋轉
    if (this._lassoSel.length === 1 && (this._lassoSel[0].shape === 'line' || this._lassoSel[0].shape === 'arrow')) return false;
    const hs = this._rotateHandlesScreen();
    const c = this._centerHandleScreen();
    if (!hs || !c) return false;
    for (const h of hs) {
      if (Math.hypot(p.x - h.x, p.y - h.y) <= 28) {
        this._rotateDrag = { cx: c.x, cy: c.y, a0: Math.atan2(p.y - c.y, p.x - c.x), moved: false };
        this.pokeActivity();
        return true;
      }
    }
    return false;
  }
  _centerHandleScreen() {
    const bb = this._lassoBBox();
    if (!bb) return null;
    const v = this.view;
    return {
      x: (bb.x0 + bb.x1) / 2 * v.scale + v.ox,
      y: (bb.y0 + bb.y1) / 2 * v.scale + v.oy
    };
  }
  /* v133：點到中心把手→開始拖曳整個選取（任何工具下都可用） */
  _centerDragDown(p) {
    if (!this._lassoSel || !this._lassoSel.length) return false;
    const h = this._centerHandleScreen();
    if (!h) return false;
    // p.x/p.y 是螢幕座標；把手半徑 14，點擊判定放寬到 26
    if (Math.hypot(p.x - h.x, p.y - h.y) > 26) return false;
    this._lassoDrag = { x0: p.cx, y0: p.cy, moved: false,
      orig: this._lassoSel.map(s => ({ s, fx: s.fx, fy: s.fy,
        fx0: s.fx0, fy0: s.fy0, fx1: s.fx1, fy1: s.fy1,
        pts: s.pts ? s.pts.map(pt => [pt[0], pt[1], pt[2], pt[3]]) : null })) };
    this.pokeActivity();
    return true;
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
      pts.push(this._fracToPx(s.fx, s.fy));
    } else if (s.tool === 'sticker') {
      // v195：貼紙取旋轉後四角（中心±半寬半高），順序同 shape：(x0,y0)(x1,y0)(x0,y1)(x1,y1)
      const [cx, cy] = this._fracToPx(s.fx, s.fy);
      const [x0, y0] = this._fracToPx(s.fx - s.fw / 2, s.fy - s.fh / 2);
      const [x1, y1] = this._fracToPx(s.fx + s.fw / 2, s.fy + s.fh / 2);
      pts.push(rotPt(x0, y0, cx, cy), rotPt(x1, y0, cx, cy),
               rotPt(x0, y1, cx, cy), rotPt(x1, y1, cx, cy));
    } else if (s.tool === 'shape') {
      const [x0, y0] = this._fracToPx(s.fx0, s.fy0);
      const [x1, y1] = this._fracToPx(s.fx1, s.fy1);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // 四角都轉，取旋轉後的實際範圍
      pts.push(rotPt(x0, y0, cx, cy), rotPt(x1, y0, cx, cy),
               rotPt(x0, y1, cx, cy), rotPt(x1, y1, cx, cy));
    } else if (s.pts) {
      for (const pt of s.pts) pts.push(this._fracToPx(pt[1], pt[2]));
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
  _down(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    // v145：新筆跡開始＝使用者沒在停頓，取消待發的圖形辨識
    if (this._autoShapeTimer) { clearTimeout(this._autoShapeTimer); this._autoShapeTimer = null; }
    // v101：有動作就喚醒時鐘（5 秒閒置自動暫停後，下筆繼續走）
    this.pokeActivity();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    this._pointers.set(e.pointerId, { x: px, y: py, type: e.pointerType }); // v129：記類型，供雙指手勢判斷
    const now = performance.now();
    // v143：裁切模式 — 單指操作裁切框（不支援雙指）
    if (this.cropMode && this._crop) {
      const p = this._pos(e, rect);
      // 先測把手（canvas 座標轉螢幕：把手在 canvas 座標系，需經 view 變換）
      const v = this.view;
      let hitHandle = null;
      for (const h of this._cropHandles()) {
        const hsx = h.x * v.scale + v.ox, hsy = h.y * v.scale + v.oy;
        if (Math.hypot(px - hsx, py - hsy) < 28) { hitHandle = h.id; break; }
      }
      const cb = this._cropBounds();
      if (hitHandle) {
        this._cropDrag = { handle: hitHandle, fx0: this._crop.fx0, fy0: this._crop.fy0, fx1: this._crop.fx1, fy1: this._crop.fy1, cx: p.cx, cy: p.cy };
      } else if (cb) {
        // 轉成螢幕座標判斷是否在框內
        const sx0 = cb.x0 * v.scale + v.ox, sy0 = cb.y0 * v.scale + v.oy;
        const sx1 = cb.x1 * v.scale + v.ox, sy1 = cb.y1 * v.scale + v.oy;
        if (px >= sx0 && px <= sx1 && py >= sy0 && py <= sy1) {
          this._cropDrag = { move: true, fx0: this._crop.fx0, fy0: this._crop.fy0, fx1: this._crop.fx1, fy1: this._crop.fy1, cx: p.cx, cy: p.cy };
        }
      }
      return; // 裁切模式不做別的事
    }
    // v42：雙指手勢（縮放／平移）優先於 v20 雙指復原
    if (this._pointers.size === 2) {
      const [q1, q2] = [...this._pointers.values()];
      // v129：兩指須同類型才算手勢（避免手掌 touch＋筆 pen 誤觸成縮放）
      if (q1.type !== q2.type) {
        // 刪掉 touch 那個（手掌），剩下的走單指流程
        for (const [id, q] of this._pointers) {
          if (q.type === 'touch') { this._pointers.delete(id); break; }
        }
      } else {
        // 取消進行中的繪製（暫存，供之後判斷是否為輕觸復原）
        // v136：手抓文字拖曳也要取消，否則雙指縮放被卡住
        if (this._drawing || this._erasing || this._shapeDrag || this._handDrag) {
          this._pinchCandidate = { drawing: this._drawing, t0: now };
          this._drawing = null; this._erasing = null; this._shapeDrag = null;
          this._handDrag = null;
          this._shapeSnap = null;
          this.render();
        } else {
          this._pinchCandidate = { drawing: null, t0: now };
        }
        // v206：第二指落下＝雙指手勢確定——取消套索路徑（否則 _move 會先被套索路徑吃掉，
        // 捏合變成拖移選取，學長實測）；進行中的選取拖曳/把手旋轉轉交捏合接手。
        const hadLassoPath = !!this._lassoPath;
        this._lassoPath = null;
        const dragOrig = this._lassoDrag ? this._lassoDrag.orig : null;
        const dragMoved = !!(this._lassoDrag && this._lassoDrag.moved);
        this._lassoDrag = null;
        const rotDragMoved = !!(this._rotateDrag && this._rotateDrag.moved);
        this._rotateDrag = null;
        // v206：第一指用 pen 在選取外落筆時，v147 已先清掉選取並開始畫——
        // 雙指成立就還原選取，整組改走選取捏合（不觸發雙指輕觸復原）
        if (this._selCleared && this._pinchCandidate && this._pinchCandidate.drawing) {
          this._lassoSel = this._selCleared;
          this._pinchCandidate = null;
          if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
        }
        this._selCleared = null;
        const [p1, p2] = [...this._pointers.values()];
        this._pinch = {
          d0: Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
          a0: Math.atan2(p2.y - p1.y, p2.x - p1.x),  // v110：雙指旋轉用
          scale0: this.view.scale,
          mx0: (p1.x + p2.x) / 2, my0: (p1.y + p2.y) / 2,
          ox0: this.view.ox, oy0: this.view.oy,
          // v139：多圖 — 用選中圖片的縮放當基準
          imgS0: (() => { const s = this._imgById(this.page, this.imgSelId); return (s && s.s) || 1; })(),
          moved: false
        };
        // v206：有選取且不在底圖調整模式→捏合整組判給選取（距離縮放/角度旋轉/中點移動），
        // 手勢期間 view 凍結；底圖調整的圖片縮放優先級照現行（imgAdjust 時不搶）
        if (this._lassoSel && this._lassoSel.length && !this.imgAdjust) {
          const pc = this._pinch;
          pc.sel = true;
          pc.aCum = 0;
          pc.preMoved = dragMoved || rotDragMoved;
          if (dragOrig) {
            // 拖曳 orig 補上尺寸欄位（拖曳本身不改尺寸，值＝拖曳前值），整段手勢一筆復原退回拖曳前
            for (const o of dragOrig) {
              if (o.width === undefined) {
                o.width = o.s.width; o.size = o.s.size;
                o.fw = o.s.fw; o.fh = o.s.fh; o.rot = o.s.rot || 0;
              }
            }
            pc.undoOrig = dragOrig;
            this._selGestureBegin(dragOrig);
          } else {
            this._selGestureBegin();
          }
          pc.selCx = this._selBaseCenter ? this._selBaseCenter.x : 0;
          pc.selCy = this._selBaseCenter ? this._selBaseCenter.y : 0;
        }
        if (hadLassoPath) this.render();
        return;
      }
    }
    if (this._pointers.size > 2) return;  // 三指以上忽略
    // v76：Apple Pencil / 手指分離（防手掌誤觸）
    // fingerDraw=false 時，只有 pen（Apple Pencil）和 mouse 能畫圖，touch（手指/手掌）忽略
    // v128：底圖調整模式除外——調圖本來就是用手指，雙指縮放不受 ✋ 開關影響
    // v129：有筆跡選取時也除外——雙指旋轉/移動是操作手勢不是寫字，不用擋
    const hasSel = this._lassoSel && this._lassoSel.length;
    // v138：fingerDraw 關閉時，touch 不畫圖但留在 _pointers 裡，雙指縮放照常用
    // （v129 的同類型檢查會擋掉手掌＋筆的誤觸，不用擔心）
    if (!this.fingerDraw && e.pointerType === 'touch' && !this.imgAdjust) {
      const p138 = this._pos(e);
      // 中心把手例外：手指可拖曳移動選取
      if (hasSel && this._centerDragDown(p138)) return;
      // v149：角落旋轉把手例外：手指可拖曳旋轉選取
      if (hasSel && this._rotateDragDown(p138)) return;
      // v147：手指點其他地方＝確定（取消選取）
      if (hasSel) {
        this._lassoSel = null;
        if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
        this.render();
      }
      return; // 不畫圖，但保留在 _pointers 供雙指手勢用
    }
    // v20：雙指輕觸＝復原上一步（已由上方雙指邏輯接管，此處保留單指流程）
    const p = this._pos(e);
    // v141：中心把手拖曳（筆/滑鼠/手指都可用）——v138 改壞漏掉這行，補回
    if (hasSel && this._centerDragDown(p)) return;
    // v149：角落旋轉把手拖曳（筆/滑鼠/手指都可用）
    if (hasSel && this._rotateDragDown(p)) return;
    // v147：有選取時在其他地方下筆＝先確定（取消選取，把手立刻消失），同一筆照常畫下一筆（南勛指定的確定方式）
    if (hasSel && !this.imgAdjust && this.tool !== 'lasso') {
      this._selCleared = this._lassoSel;  // v206：先記住——第二指落下成立雙指時還原，改走選取捏合
      this._lassoSel = null;
      if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      this.render();
    }
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
    // v139：多圖 — 點哪張選哪張，拖曳移動選中的圖
    if (this.imgAdjust) {
      const pg = this.page;
      const imgs = this._migrateImages(pg);
      if (imgs.length) {
        const hit = this._imgHitTest(px, py);
        if (hit) this.imgSelId = hit.id;
        const sel = this._imgById(pg, this.imgSelId) || imgs[imgs.length - 1];
        this.imgSelId = sel.id;
        this._imgDrag = { id: sel.id, x0: px, y0: py, imgX0: sel.x || 0, imgY0: sel.y || 0 };
        this.render(); // 重畫以更新選中高亮
        return;
      }
    }
    if (this.onDrawStart) this.onDrawStart();
    // v104：手抓工具—拖曳移動文字（不繪製）
    if (this.tool === 'hand') { this._handDown(p); return; }
    // v105：套索工具—框選或拖曳已選筆跡
    if (this.tool === 'lasso') { this._lassoDown(p); return; }
    if (this.tool === 'eraser') { const lp = this._inkPos(e, p); this.eraseAt(lp.fx, lp.fy); this._erasing = true; return; }
    if (this.tool === 'text') { if (this.onTextTap) this.onTextTap(p.fx, p.fy); return; }
    if (['line', 'arrow', 'rect', 'ellipse', 'rtriangle', 'parallelogram', 'axes'].includes(this.tool)) {
      this._beginShapeDrag({ shape: this.tool, fx0: p.fx, fy0: p.fy, fx1: p.fx, fy1: p.fy, t: performance.now(),
        origin: this.tool === 'axes' ? this.axesOrigin : undefined });
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
    const pr0 = this._press(e);  // v145：首點壓感
    const lp0 = this._inkPos(e, p);  // v162：手指補正；v165：lockBg 換算
    s.pts.push([0, lp0.fx, lp0.fy, pr0]);
    s._pressSm = pr0;  // v145：壓感平滑狀態（暫存，_up 時刪除不存檔）
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
    // v143：裁切拖曳
    if (this._cropDrag && this.cropMode) {
      const rect = this.canvas.getBoundingClientRect();
      const p = this._pos(e, rect);
      const d = this._cropDrag;
      const dx = (p.cx - d.cx), dy = (p.cy - d.cy);
      // 轉成正規化座標的位移（相對於圖片顯示尺寸）
      const im = this._imgById(this.page, this.cropId);
      const b = im ? this._imgBounds(im) : null;
      if (b) {
        const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
        const dfx = dx / bw, dfy = dy / bh;
        const c = this._crop;
        if (d.move) {
          // 整框移動，限制不超出圖片
          const w = d.fx1 - d.fx0, h = d.fy1 - d.fy0;
          let nx0 = Math.min(1 - w, Math.max(0, d.fx0 + dfx));
          let ny0 = Math.min(1 - h, Math.max(0, d.fy0 + dfy));
          c.fx0 = nx0; c.fy0 = ny0; c.fx1 = nx0 + w; c.fy1 = ny0 + h;
        } else {
          // 把手縮放
          const hdl = d.handle;
          if (hdl.includes('w')) c.fx0 = Math.min(d.fx1 - 0.02, Math.max(0, d.fx0 + dfx));
          if (hdl.includes('e')) c.fx1 = Math.max(d.fx0 + 0.02, Math.min(1, d.fx1 + dfx));
          if (hdl.includes('n')) c.fy0 = Math.min(d.fy1 - 0.02, Math.max(0, d.fy0 + dfy));
          if (hdl.includes('s')) c.fy1 = Math.max(d.fy0 + 0.02, Math.min(1, d.fy1 + dfy));
        }
        this.render();
      }
      return;
    }
    // v42：更新 pointer 位置；雙指縮放／平移
    if (this._pointers.has(e.pointerId)) {
      const rect = this.canvas.getBoundingClientRect();
      const old = this._pointers.get(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top, type: old.type }); // v130：保留 type，否則雙指被誤判
    }
    // v206：雙指手勢優先於套索路徑/拖曳（_down 在第二指落下時已取消它們，這裡再把順序釘死）
    if (this._pinch && this._pointers.size === 2) {
      const [p1, p2] = [...this._pointers.values()];
      const d = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const pc = this._pinch;
      // v131：純旋轉時距離/中點都不變，也要算成 moved，否則旋轉永遠不觸發
      const aNow = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      let daNow = (aNow - pc.a0) * 180 / Math.PI;
      if (daNow > 180) daNow -= 360;
      if (daNow < -180) daNow += 360;
      if (!pc.moved && (Math.abs(d - pc.d0) > 12 || Math.hypot(mx - pc.mx0, my - pc.my0) > 12 || Math.abs(daNow) > 5)) {
        pc.moved = true;
        this._pinchCandidate = null;  // 移動了＝縮放手勢，不是輕觸復原
      }
      if (pc.moved) {
        if (pc.sel && this._selBase) {
          // v206：捏合判給選取——距離→繞選取中心縮放、角度→旋轉、中點位移→移動選取；
          // 全部從手勢快照套用累計值，view 凍結不動
          const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          let da = (a - pc.a0) * 180 / Math.PI;
          if (da > 180) da -= 360;
          if (da < -180) da += 360;
          if (Math.abs(da) > 2) { pc.aCum += da; pc.a0 = a; }  // 2° 死區（同 v110）
          const factor = Math.max(0.2, Math.min(5, d / pc.d0));
          pc.lastFactor = factor;
          const sc = this.view.scale || 1;
          this._applySelTransform(this._selBase, factor, pc.aCum, pc.selCx, pc.selCy,
            (mx - pc.mx0) / sc, (my - pc.my0) / sc);
          pc.touched = true;
          this.render();
        } else {
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
          // v139：多圖 — 縮放選中的那張
          if (this.imgAdjust) {
            const pg = this.page;
            const imgs = this._migrateImages(pg);
            const sel = this._imgById(pg, this.imgSelId) || imgs[imgs.length - 1];
            if (sel) {
              sel.s = Math.max(0.2, Math.min(5, (pc.imgS0 || sel.s || 1) * d / pc.d0));
              this.render();
            }
          } else if (!pc.sel) {
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
      }
      return;
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
    // v149：角落把手旋轉拖曳中（增量旋轉，silent；_up 統一發事件）
    if (this._rotateDrag) {
      const p2 = this._pos(e);
      const d = this._rotateDrag;
      const a = Math.atan2(p2.y - d.cy, p2.x - d.cx);
      let da = (a - d.a0) * 180 / Math.PI;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      if (Math.abs(da) > 1) {
        this.rotateSelection(da, true);
        d.a0 = a;
        d.moved = true;
      }
      return;
    }
    // v105：套索選取拖曳中
    if (this._lassoDrag) {
      const p2 = this._pos(e);
      const d = this._lassoDrag;
      const [dx, dy] = this._fracDelta(p2.cx - d.x0, p2.cy - d.y0);  // v180：lockBg 頁除以底圖寬高
      for (const o of d.orig) {
        const s = o.s;
        if (s.fx !== undefined) { s.fx = this._r4(o.fx + dx); s.fy = this._r4(o.fy + dy); }
        if (s.fx0 !== undefined) {
          s.fx0 = this._r4(o.fx0 + dx); s.fy0 = this._r4(o.fy0 + dy);
          s.fx1 = this._r4(o.fx1 + dx); s.fy1 = this._r4(o.fy1 + dy);
        }
        if (o.pts) {
          s.pts = o.pts.map(pt => [pt[0], this._r4(pt[1] + dx), this._r4(pt[2] + dy), pt[3]]);
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
      // v139：多圖 — 移動選中的那張
      const im = this._imgById(pg, d.id);
      if (im) {
        im.x = d.imgX0 + (px - d.x0);
        im.y = d.imgY0 + (py - d.y0);
      }
      this.render();
      return;
    }
    const p = this._pos(e);
    if (this.tool === 'laser' && e.buttons) { this._laser(p.x, p.y); return; }
    if (this._erasing) { const lp = this._inkPos(e, p); this.eraseAt(lp.fx, lp.fy); return; }
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
        const p = this._inkPos(ce, this._pos(ce, rect));  // v162：手指補正；v165：lockBg 換算
        const dt = performance.now() - this._drawing._startPerf;
        const last = this._drawing.pts[this._drawing.pts.length - 1];
        // 過濾過近的點，省空間
        if (Math.hypot((p.fx - last[1]) * this._cssW, (p.fy - last[2]) * this._cssH) < 2) continue;
        // v145：壓感寫入第 4 欄（輕度平滑，防抖動）
        const rawP = this._press(ce);
        const sm = this._drawing._pressSm + (rawP - this._drawing._pressSm) * 0.35;
        this._drawing._pressSm = sm;
        this._drawing.pts.push([Math.round(dt), this._r4(p.fx), this._r4(p.fy), Math.round(sm * 100) / 100]);
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
    // v154：雷射放開 → 整條軌跡開始淡出
    if (this.tool === 'laser') this._laserUp();
    // v42：雙指手勢結束
    this._pointers.delete(e.pointerId);
    // v73：底圖拖曳結束
    if (this._imgDrag) this._imgDrag = null;
    // v143：裁切拖曳結束
    if (this._cropDrag) this._cropDrag = null;
    // v149：角落把手旋轉結束；v211：變換只記結果，不再發時間軸事件
    if (this._rotateDrag) {
      const rd = this._rotateDrag; this._rotateDrag = null;
      if (rd.moved && this._lassoSel && this._lassoSel.length) {
        this.pokeActivity();
      }
      this.render();
    }
    if (this._pinch) {
      if (this._pointers.size < 2) {
        // 雙指輕觸（未移動、350ms 內）＝復原（v20 行為）
        if (!this._pinch.moved && this._pinchCandidate) {
          const dt = performance.now() - this._pinchCandidate.t0;
          const d = this._pinchCandidate.drawing;
          if (dt < 350 && d && !d._moved) {
            this.render();  // 清掉首指的落筆點
            this.undo();
            // v135：第一次用雙指輕觸復原，提示這個手勢（每台裝置只提示一次）
            try {
              if (!localStorage.getItem('moke_hint_tap2undo')) {
                localStorage.setItem('moke_hint_tap2undo', '1');
                if (typeof window !== 'undefined' && window._mokeToast) {
                  setTimeout(() => window._mokeToast('💡 雙指輕觸＝復原上一步', 2500), 600);
                }
              }
            } catch (err) {}
          }
          // 若有未完成的繪製（非輕觸），直接丟棄（已在 _down 時 render 清掉）
        }
        // v110：雙指旋轉過套索選取；v211：變換只記結果，不再發時間軸事件（暫停時鐘照舊）
        if (this._pinch.rotated && this._lassoSel && this._lassoSel.length) {
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
        // v206：選取捏合結束—整批一筆復原（_selGestureEnd 內處理，含暫停時鐘；v211：不發事件）；
        // 完全沒動到就只清手勢快照
        if (this._pinch.sel) {
          if (this._pinch.touched || this._pinch.preMoved) {
            this._selGestureEnd({ scale: this._pinch.lastFactor || 1, rotate: 'gesture' },
              this._pinch.undoOrig || null);
          } else {
            this._selBase = null;
            this._selBaseCenter = null;
          }
          this.render();
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
          origin: d.shape === 'axes' ? (d.origin || 'center') : undefined,
          fx0: this._r4(d.fx0), fy0: this._r4(d.fy0),
          fx1: this._r4(d.fx1), fy1: this._r4(d.fy1),
          /* v210：圖形定稿一律吃圖形專屬設定（顏色/粗細/線型），不吃筆那組。
             座標軸同吃顏色/粗細（它本就走這條定稿路），但不套 dash。 */
          color: this.shapeColor, width: this.shapeWidth,
          dash: d.shape === 'axes' ? undefined : (this.shapeDash ? 1 : undefined),
          dur: Math.round(performance.now() - d.t)
        });
        this.addStroke(s);
        // v148：所有圖形畫完都不自動選取（南勛定版：中心拖曳把手要保留，但不要一畫完就跳出來；
        //       要移動/旋轉時，先用套索主動選取，把手才出現；在其他地方下筆即確定/取消選取）
        this._lassoSel = null;
        if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
        this.render();
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
      delete s._pressSm;  // v145：壓感平滑狀態，不存檔（已寫入各點第 4 欄）
      if (s.pts.length === 1) s.pts.push([s.dur, s.pts[0][1], s.pts[0][2], s.pts[0][3]]);
      this.addStroke(s);
      this._selCleared = null;  // v206：單指書寫已提交，v147 清掉的選取不需再還原
      // v145：圖形自動辨識 — 提筆後 600ms 沒新筆跡，判斷是否為圓/直線
      if (this.autoShape && s.tool === 'pen') {
        const sid = s.id;
        if (this._autoShapeTimer) clearTimeout(this._autoShapeTimer);
        this._autoShapeTimer = setTimeout(() => { this._autoShapeTimer = null; this._tryAutoShape(sid); }, 600);
      }
    }
    if (hadGesture && this.onDrawEnd) this.onDrawEnd();
    // v104：手抓拖曳結束；v211：變換只記結果，不再記時間軸事件（復原紀錄照留）
    const handMoved = this._handDrag && this._handDrag.moved;
    if (this._handDrag) {
      const d = this._handDrag;
      this._handDrag = null;
      if (d.moved) {
        this._pushMoveUndo([{ s: d.stroke, fx: d.fx0, fy: d.fy0 }]);  // v180：文字拖曳也留復原紀錄
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
        // v150：短路徑＝點一下 — 先試點選單一筆跡/圖形，沒點中才取消選取
        const tx = path.reduce((a, p) => a + p.x, 0) / path.length;
        const ty = path.reduce((a, p) => a + p.y, 0) / path.length;
        this._lassoSel = this._tapSelect(tx, ty);
      }
      if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
      // v135：選到東西就提示操作方式（v150：把三個把手與確定方式一次講清楚）
      // v142：單選直線/箭頭不提示旋轉
      if (this._lassoSel && this._lassoSel.length && typeof window !== 'undefined' && window._mokeToast) {
        const sel = this._lassoSel;
        const isLine = sel.length === 1 && (sel[0].shape === 'line' || sel[0].shape === 'arrow');
        window._mokeToast(isLine
          ? '已選取：按住中心把手拖曳移動；在其他地方下筆＝確定'
          : '已選取：中心把手拖曳移動、角落圓箭頭拖曳旋轉；在其他地方下筆＝確定', 3600);
      }
      this.render();
    }
    // v105：套索拖曳結束；v211：變換只記結果，不再記時間軸事件（復原紀錄照留）
    const lassoMoved = this._lassoDrag && this._lassoDrag.moved;
    if (this._lassoDrag) {
      const d = this._lassoDrag;
      this._lassoDrag = null;
      if (d.moved) {
        this._pushMoveUndo(d.orig);  // v180：移動留復原紀錄
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
  /* v145：圖形自動辨識 — 提筆後 600ms 沒新筆跡，判斷是否為圓/直線。
     只認圓和直線；命中→走事件通道換成乾淨圖形（replay 相容），沒命中→原筆跡不動。 */
  _tryAutoShape(sid) {
    if (!this.autoShape) return;
    const s = this.page.strokes.find(x => x.id === sid);
    if (!s || s.tool !== 'pen' || !s.pts || s.pts.length < 10) return;
    const W = this._cssW, H = this._cssH;
    const pts = s.pts.map(pt => [pt[1] * W, pt[2] * H]);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pts) {
      if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
      if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
    }
    const bw = x1 - x0, bh = y1 - y0;
    if (Math.max(bw, bh) < 28) return;  // 太小不辨識（點、勾都放過）
    const diag = Math.hypot(bw, bh);
    const first = pts[0], last = pts[pts.length - 1];
    const dEnd = Math.hypot(first[0] - last[0], first[1] - last[1]);
    let hit = null;
    if (dEnd < diag * 0.4) {
      // 可能是圓：形心＋半徑變異係數＋長寬比
      let cx = 0, cy = 0;
      for (const q of pts) { cx += q[0]; cy += q[1]; }
      cx /= pts.length; cy /= pts.length;
      const rs = pts.map(q => Math.hypot(q[0] - cx, q[1] - cy));
      const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
      if (mean >= 8) {
        let va = 0;
        for (const r of rs) va += (r - mean) * (r - mean);
        const cv = Math.sqrt(va / rs.length) / mean;
        const aspect = Math.min(bw, bh) / Math.max(bw, bh);
        if (cv < 0.25 && aspect > 0.55) {
          hit = { shape: 'ellipse', fx0: x0 / W, fy0: y0 / H, fx1: x1 / W, fy1: y1 / H };
        }
      }
    }
    if (!hit) {
      // 直線：以首尾為軸，最大垂距 < 長度 7% 且長度夠
      const len = Math.hypot(last[0] - first[0], last[1] - first[1]);
      if (len > 48) {
        let maxDev = 0;
        for (const q of pts) {
          const dev = Math.abs((last[0] - first[0]) * (first[1] - q[1]) - (first[0] - q[0]) * (last[1] - first[1])) / len;
          if (dev > maxDev) maxDev = dev;
        }
        if (maxDev < len * 0.07) {
          hit = { shape: 'line', fx0: first[0] / W, fy0: first[1] / H, fx1: last[0] / W, fy1: last[1] / H };
        }
      }
    }
    if (hit) this._applyAutoShape(s, hit);
  }
  /* v145：辨識命中 — 原筆跡走 unadd 事件移除（復原語義），乾淨圖形走 add 事件新增。
     時間軸上誠實記錄：筆跡曾出現(t1)、被替換(t2)，重播看得到變形過程。 */
  _applyAutoShape(s, hit) {
    const pg = this.page;
    pg.strokes = pg.strokes.filter(x => x.id !== s.id);
    pg.undo = pg.undo.filter(x => x.id !== s.id);
    pg.redo = pg.redo.filter(x => x.id !== s.id);
    this._emit('unadd', { page: this.pageIndex, id: s.id }, true); // v206：辨識替換不計時（不喚醒時鐘）
    const ns = this._newStroke('shape', {
      shape: hit.shape,
      fx0: this._r4(hit.fx0), fy0: this._r4(hit.fy0),
      fx1: this._r4(hit.fx1), fy1: this._r4(hit.fy1),
      /* v210：辨識圖形是筆那一邊的功能——沿用來源筆的顏色/粗細、實線，
         不吃圖形專屬設定（明確寫死，不靠 _newStroke 預設值碰巧相同） */
      color: s.color, width: s.width,
      dur: 0,
      // v180：替換圖形繼承原筆跡的 tlT——不繼承的話 _emit 會用當下時間重新蓋章，
      // 在舊課補筆時被 v172 夾制蓋到整頁結尾，筆跡當場消失（學長實測：中央線往後跳）
      tlT: s.tlT
    });
    this.addStroke(ns, true, true); // v206：不計時（tlT 已繼承，不重蓋、不喚醒時鐘）
    // v148：辨識成圖形也不自動選取（同圖形工具定版行為）
    this._lassoSel = null;
    if (typeof window !== 'undefined' && window._mokeUpdateRotateBtns) window._mokeUpdateRotateBtns();
    this.render();
    if (typeof window !== 'undefined' && window._mokeToast) {
      window._mokeToast(hit.shape === 'ellipse' ? '⭕ 已辨識為圓形' : '➖ 已辨識為直線', 1800);
    }
  }
  /* v207：時間順序的筆跡清單（複本）——照 tlT 由小到大穩定排序（同 tlT 保持原陣列
     順序）；描繪專用，不動儲存陣列本體。所有描繪路徑共用這一條順序規則。 */
  _tlOrdered(strokes) {
    return strokes.slice().sort((a, b) => ((a.tlT || 0) - (b.tlT || 0)));
  }

  /* v103：供 _up 暫停時取得最後事件時間（與 TLC.liveEdge 一致）
     v207：筆跡貢獻改為 tlT＋sepAfter——頁尾最後一筆若帶區隔旗標，liveEdge 含那段
     TL_EPS，之後的 append 從區隔之後起算，不會把區隔吃掉。 */
  _liveEdgeT() {
    let m = 0;
    for (const s of this.page.strokes) {
      const t = (s.tlT === undefined ? 0 : s.tlT) + (s.sepAfter || 0);
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

  /* v154：雷射改 GoodNotes 式（南勛指定）— 按住不放時整條軌跡保留不消失；
     軌跡是 3.5px 細平滑紅線＋筆頭亮點（舊版是 18px 粗圓點串、0.5 秒就消）；
     放開後整條在 0.6 秒內淡出。雷射不進時間軸、不被記錄（同舊版）。 */
  _laser(x, y) {
    if (!this._laserHeld) { this._laserTrail = []; this._laserFadeStart = 0; }
    this._laserHeld = true;
    const last = this._laserTrail[this._laserTrail.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 2) this._laserTrail.push({ x, y });
    if (!this._laserTicking) { this._laserTicking = true; requestAnimationFrame(() => this._laserFrame()); }
  }
  _laserUp() {
    if (this._laserHeld) { this._laserHeld = false; this._laserFadeStart = performance.now(); }
  }
  _laserFrame() {
    if (this.tool !== 'laser' && this._laserHeld) this._laserUp();  // 中途換工具也開始淡出
    const now = performance.now();
    let alpha = 1;
    if (!this._laserHeld && this._laserFadeStart) {
      alpha = 1 - (now - this._laserFadeStart) / 600;
      if (alpha <= 0) {
        this._laserTrail = []; this._laserFadeStart = 0; this._laserTicking = false;
        this.render();
        return;
      }
    }
    this.render();
    const pts = this._laserTrail;
    if (pts.length) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.strokeStyle = '#ff2d2d';
      ctx.fillStyle = '#ff2d2d';
      ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 6;
      ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 2) ctx.lineTo(pts[1].x, pts[1].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      if (pts.length > 2) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      const head = pts[pts.length - 1];
      ctx.beginPath(); ctx.arc(head.x, head.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(() => this._laserFrame());
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
    // v139：多圖疊放，依序繪製（後放的在上層）
    const imgs = this._migrateImages(pg);
    for (const im of imgs) {
      if (im._el && im._el.naturalWidth) {
        const img = im._el;
        const s = Math.min(W / img.naturalWidth, H / img.naturalHeight) * (im.s || 1);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        ctx.drawImage(img, (W - dw) / 2 + (im.x || 0), (H - dh) / 2 + (im.y || 0), dw, dh);
      }
    }
    // v139：調整模式下，每張圖顯示中心點（選中的高亮）
    // v187：lockBg 頁的板面底圖不畫中心點（它不可調整，畫了會誤導）
    if (this.imgAdjust && imgs.length) {
      for (const im of this._movableImages(pg)) {
        const b = this._imgBounds(im);
        if (!b) continue;
        const isSel = im.id === this.imgSelId;
        ctx.beginPath(); ctx.arc(b.cx, b.cy, isSel ? 16 : 12, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#1971c2' : 'rgba(25,113,194,0.45)';
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        // 中心十字
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        const r = isSel ? 8 : 6;
        ctx.beginPath();
        ctx.moveTo(b.cx - r, b.cy); ctx.lineTo(b.cx + r, b.cy);
        ctx.moveTo(b.cx, b.cy - r); ctx.lineTo(b.cx, b.cy + r);
        ctx.stroke();
      }
    }
    // v143：裁切模式 — 遮罩＋裁切框＋八把手
    if (this.cropMode && this._crop) {
      const cb = this._cropBounds();
      const im = this._imgById(pg, this.cropId);
      const ib = im ? this._imgBounds(im) : null;
      if (cb && ib) {
        // 圖片範圍外變暗（只蓋住圖片區域）
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(ib.x0, ib.y0, ib.x1 - ib.x0, cb.y0 - ib.y0); // 上
        ctx.fillRect(ib.x0, cb.y1, ib.x1 - ib.x0, ib.y1 - cb.y1); // 下
        ctx.fillRect(ib.x0, cb.y0, cb.x0 - ib.x0, cb.y1 - cb.y0); // 左
        ctx.fillRect(cb.x1, cb.y0, ib.x1 - cb.x1, cb.y1 - cb.y0); // 右
        ctx.restore();
        // 裁切框線
        ctx.save();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(cb.x0, cb.y0, cb.x1 - cb.x0, cb.y1 - cb.y0);
        ctx.setLineDash([]);
        // 三分線
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        const tw = (cb.x1 - cb.x0) / 3, th = (cb.y1 - cb.y0) / 3;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(cb.x0 + tw * i, cb.y0); ctx.lineTo(cb.x0 + tw * i, cb.y1); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cb.x0, cb.y0 + th * i); ctx.lineTo(cb.x1, cb.y0 + th * i); ctx.stroke();
        }
        // 八把手
        for (const h of this._cropHandles()) {
          ctx.beginPath(); ctx.arc(h.x, h.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.restore();
      }
    }
    // v146：lockBg 頁（外部轉檔匯入，筆跡座標以整頁底圖為準）— 筆跡改用底圖的 fit 座標系，
    // 使任何螢幕比例下筆跡都與底圖對齊（一般頁面無此旗標，行為不變）
    const lockIm = pg.lockBg ? this._migrateImages(pg)[0] : null;
    const lockB = lockIm ? this._imgBounds(lockIm) : null;
    if (lockB) { ctx.save(); ctx.translate(lockB.x0, lockB.y0); ctx.scale((lockB.x1 - lockB.x0) / W, (lockB.y1 - lockB.y0) / H); }
    // v207：圖層＝時間順序——描繪照 tlT 由小到大（穩定排序，同 tlT 以原陣列順序為準），
    // 不重排儲存陣列本體。後寫的筆蓋在先寫的之上，與 Doceri 的串流順序一致。
    for (const s of this._tlOrdered(pg.strokes)) {
      // v47：時間軸回放時只顯示 cutoff 之前的筆跡
      if (this.tlCutoff !== null && this.tlCutoff !== undefined) {
        const st = (s.tlT === undefined ? 0 : s.tlT);
        if (st > this.tlCutoff) continue;
      }
      this.drawStroke(ctx, s, 1, W, H);
    }
    if (lockB) ctx.restore();
    // v96：重播時顯示「曾存在但已被擦除」的筆跡（擦除時間 > cutoff 才顯示）
    // v207：這批覆蓋層同樣照 tlT 排序（穩定排序），與主描繪同一順序規則
    if (this.tlCutoff !== null && this.tlCutoff !== undefined && pg.tl && pg.tl.erased) {
      const erasedOrdered = pg.tl.erased.slice()
        .sort((a, b) => ((a.stroke.tlT || 0) - (b.stroke.tlT || 0)));
      for (const { stroke: s, eraseT } of erasedOrdered) {
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
        // v142：單選直線/箭頭不顯示旋轉把手
        const sel142 = this._lassoSel;
        const noRotate142 = sel142.length === 1 && (sel142[0].shape === 'line' || sel142[0].shape === 'arrow');
        const dpr2 = window.devicePixelRatio || 1;
        const v2 = this.view;
        ctx.save();
        ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
        ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        const x0 = bb.x0 * v2.scale + v2.ox, y0 = bb.y0 * v2.scale + v2.oy;
        const x1 = bb.x1 * v2.scale + v2.ox, y1 = bb.y1 * v2.scale + v2.oy;
        ctx.strokeRect(x0 - 8, y0 - 8, (x1 - x0) + 16, (y1 - y0) + 16);
        ctx.setLineDash([]);
        // v132：選取框右上/左下加旋轉把手（圓形箭頭），提示可雙指旋轉
        if (!noRotate142) {
        const handle = (hx, hy) => {
          ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill();
          ctx.strokeStyle = '#e67700'; ctx.lineWidth = 2.5; ctx.stroke();
          // 圓形箭頭
          ctx.beginPath(); ctx.arc(hx, hy, 7, -2.4, 1.1); ctx.stroke();
          const ax = hx + 7 * Math.cos(1.1), ay = hy + 7 * Math.sin(1.1);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - 6, ay - 1);
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + 1, ay - 6);
          ctx.stroke();
        };
        handle(x1 + 8, y0 - 8);  // 右上
        handle(x0 - 8, y1 + 8);  // 左下
        } // v142: noRotate142 結束
        // v133：中心移動把手（四向箭頭）
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.5; ctx.stroke();
        // 四向箭頭
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
        ctx.stroke();
        // 箭頭尖
        const arrow = (x, y, dx, dy) => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - dx * 5 - dy * 3, y - dy * 5 + dx * 3);
          ctx.moveTo(x, y);
          ctx.lineTo(x - dx * 5 + dy * 3, y - dy * 5 - dx * 3);
          ctx.stroke();
        };
        arrow(cx + 8, cy, 1, 0); arrow(cx - 8, cy, -1, 0);
        arrow(cx, cy + 8, 0, 1); arrow(cx, cy - 8, 0, -1);
        ctx.restore();
      }
    }
    if (this.overlay) this.overlay(ctx, W, H);
  }

  _drawBg(ctx, pg, W, H) {
    if (pg.bg === 'blackboard') {
      ctx.fillStyle = '#26382e'; ctx.fillRect(0, 0, W, H);
      return;
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    // v204：背景圖庫——新背景一律程序化繪製（不靠圖片檔）。底色皆為白，
    // 線色沿用既有格線淡藍 #d7e3f4；座標紙的軸線用較深的藍灰，確保看得見。
    if (pg.bg === 'grid' || pg.bg === 'gridfine' || pg.bg === 'lines' || pg.bg === 'axes') {
      ctx.strokeStyle = '#d7e3f4'; ctx.lineWidth = 1;
      const step = pg.bg === 'gridfine' ? 20 : 40;
      ctx.beginPath();
      if (pg.bg === 'lines') {
        for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      } else {
        for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      }
      ctx.stroke();
    }
    if (pg.bg === 'axes') {
      // 中央座標軸：原點在畫布中央，軸線較粗較深，四個端點都有箭頭
      const cx = W / 2, cy = H / 2;
      ctx.strokeStyle = '#5b7ba5'; ctx.fillStyle = '#5b7ba5'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
      ctx.stroke();
      const ah = 13, aw = 5.5; // 箭頭長／半寬
      const tri = (x, y, dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dx * ah - dy * aw, y - dy * ah + dx * aw);
        ctx.lineTo(x - dx * ah + dy * aw, y - dy * ah - dx * aw);
        ctx.closePath(); ctx.fill();
      };
      tri(W, cy, 1, 0); tri(0, cy, -1, 0); tri(cx, 0, 0, -1); tri(cx, H, 0, 1);
    }
    if (pg.bg === 'staff') {
      // 五線譜：五條一組、組間留空，往下重複
      ctx.strokeStyle = '#aebfd6'; ctx.lineWidth = 1;
      const gap = 10, pitch = gap * 4 + 60;
      ctx.beginPath();
      for (let y0 = 50; y0 < H; y0 += pitch) {
        for (let i = 0; i < 5; i++) {
          const y = y0 + i * gap;
          if (y >= H) break;
          ctx.moveTo(0, y); ctx.lineTo(W, y);
        }
      }
      ctx.stroke();
    }
  }

  drawStroke(ctx, s, progress, W, H) {
    progress = Math.max(0, Math.min(1, progress === undefined ? 1 : progress));
    const k = W / 1000;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'highlighter') { ctx.globalAlpha = 0.35; }
    if (s.tool === 'text') {
      // v211：變換只記結果——重播一律畫現行（最終）幾何，不再還原變換前位置/角度/字級
      const fx = s.fx, fy = s.fy, rot = s.rot || 0, size = s.size || 48;
      ctx.fillStyle = s.color;
      ctx.font = `${size * k}px "PingFang TC","Microsoft JhengHei",sans-serif`;
      // v108：文字本身旋轉（繞文字左下角，不變形）
      if (rot) {
        ctx.save();
        ctx.translate(fx * W, fy * H + size * k * 0.8);
        ctx.rotate(rot * Math.PI / 180);
        ctx.fillText(s.text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(s.text, fx * W, fy * H + size * k * 0.8);
      }
      ctx.restore(); return;
    }
    if (s.tool === 'sticker') {
      // v195：貼紙整張出現（不做逐筆進度）；v211：重播一律畫現行（最終）位置/寬高
      const fx = s.fx, fy = s.fy, rot = s.rot || 0, fw = s.fw, fh = s.fh;
      const el = this._stickerEl(s);
      if (el && el.naturalWidth) {
        const cx = fx * W, cy = fy * H, dw = fw * W, dh = fh * H;
        ctx.save();
        ctx.translate(cx, cy);
        if (rot) ctx.rotate(rot * Math.PI / 180);
        ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }
      ctx.restore(); return;
    }
    if (s.tool === 'shape') {
      // v109：圖形旋轉不變形（轉中心＋角度，不轉角點）
      // v211：重播一律畫現行（最終）幾何，不再還原變換前位置
      const fx0 = s.fx0, fy0 = s.fy0, fx1 = s.fx1, fy1 = s.fy1, rot = s.rot || 0;
      const x0 = fx0 * W, y0 = fy0 * H;
      const x1 = fx0 * W + (fx1 - fx0) * W * progress;
      const y1 = fy0 * H + (fy1 - fy0) * H * progress;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k;
      // v210：虛線圖形（dash 欄位；無欄位＝實線，舊課檔零遷移）。座標軸永遠實線。
      if (s.dash && s.shape !== 'axes') ctx.setLineDash(this._dashPattern(s.width * k));
      if (rot) {
        // 繞圖形中心旋轉
        const scx = (x0 + x1) / 2, scy = (y0 + y1) / 2;
        ctx.save();
        ctx.translate(scx, scy);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-scx, -scy);
        this._strokeShape(ctx, s.shape, x0, y0, x1, y1, s.origin);
        ctx.restore();
      } else {
        this._strokeShape(ctx, s.shape, x0, y0, x1, y1, s.origin);
      }
      ctx.setLineDash([]);  // v210：復原，不得污染後續筆跡
      ctx.restore(); return;
    }
    // pen / highlighter：依時間進度繪製
    // v211：變換只記結果——重播一律畫現行（最終）點位與筆寬，不再還原變換前幾何
    const pts = s.pts;
    if (!pts.length) { ctx.restore(); return; }
    const total = s.dur || 1;
    const cutoff = progress * total;
    ctx.strokeStyle = s.color;
    if (s.tool === 'pen') {
      // v145：鋼筆筆壓 — 逐段可變筆寬（螢光筆維持固定寬度）
      this._drawPressStroke(ctx, s, pts, cutoff, W, H, k);
      ctx.restore(); return;
    }
    ctx.lineWidth = s.width * k;
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

  /* v145：可變筆寬筆跡繪製（pen 工具專用）— 逐段 stroke，線寬取兩端平均，round cap 銜接；
     支援 progress（重播/動畫）：畫到 cutoff 時間，末段插值位置與筆寬。 */
  _drawPressStroke(ctx, s, pts, cutoff, W, H, k) {
    const wOf = (pt) => this._pressW(s, pt, k);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[0][1] * W, pts[0][2] * H, wOf(pts[0]) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const t0 = a[0], t1 = b[0];
      if (t0 > cutoff) break;
      let ex = b[1] * W, ey = b[2] * H, ew = wOf(b);
      let done = false;
      if (t1 > cutoff) {
        const r = (cutoff - t0) / Math.max(1, t1 - t0);
        ex = (a[1] + (b[1] - a[1]) * r) * W;
        ey = (a[2] + (b[2] - a[2]) * r) * H;
        ew = wOf(a) + (wOf(b) - wOf(a)) * r;
        done = true;
      }
      ctx.lineWidth = (wOf(a) + ew) / 2;
      ctx.beginPath();
      ctx.moveTo(a[1] * W, a[2] * H);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (done) break;
    }
  }

  _strokeShape(ctx, shape, x0, y0, x1, y1, origin) {
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
      const alen = Math.max(10, ctx.lineWidth * 2.5);
      const tick = Math.max(4, ctx.lineWidth * 0.8);
      if (origin === 'bl') {
        // v184：原點在左下角（第一象限作圖）：x 軸沿底邊向右、y 軸沿左邊向上；
        // 刻度等間距：x 一格＝寬/10、y 一格＝高/10（兩軸大小各自獨立）
        const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
        const ty = Math.min(y0, y1), by = Math.max(y0, y1);
        ctx.moveTo(lx, by); ctx.lineTo(rx, by);                        // x 軸
        ctx.moveTo(rx, by); ctx.lineTo(rx - alen, by - alen * 0.45);   // x 箭頭
        ctx.moveTo(rx, by); ctx.lineTo(rx - alen, by + alen * 0.45);
        ctx.moveTo(lx, by); ctx.lineTo(lx, ty);                        // y 軸
        ctx.moveTo(lx, ty); ctx.lineTo(lx - alen * 0.45, ty + alen);   // y 箭頭
        ctx.moveTo(lx, ty); ctx.lineTo(lx + alen * 0.45, ty + alen);
        for (let i = 1; i < 10; i++) {                                 // 刻度
          const tx = lx + ((rx - lx) * i) / 10;
          ctx.moveTo(tx, by - tick); ctx.lineTo(tx, by + tick);
          const ty2 = by - ((by - ty) * i) / 10;
          ctx.moveTo(lx - tick, ty2); ctx.lineTo(lx + tick, ty2);
        }
        ctx.stroke();
      } else {
        // 座標軸：中心在矩形中心，x 軸向右、y 軸向上，含箭頭與刻度
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const hw = Math.abs(x1 - x0) / 2, hh = Math.abs(y1 - y0) / 2;
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
  }

  _drawLiveStroke(s) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1, v = this.view;
    ctx.save();
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.ox, dpr * v.oy);
    // v165：lockBg 頁即時筆跡也要套底圖座標系（同 render），否則放筆時整筆跳位
    const lockB = this._lockBounds();
    if (lockB) { ctx.translate(lockB.x0, lockB.y0); ctx.scale((lockB.x1 - lockB.x0) / this._cssW, (lockB.y1 - lockB.y0) / this._cssH); }
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
    // v165：lockBg 頁即時筆跡也要套底圖座標系（同 render），否則放筆時整筆跳位
    const lockB = this._lockBounds();
    if (lockB) { ctx.translate(lockB.x0, lockB.y0); ctx.scale((lockB.x1 - lockB.x0) / W, (lockB.y1 - lockB.y0) / H); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width * k / v.scale;
    if (s.tool === 'highlighter') ctx.globalAlpha = 0.35;
    if (from === 0 && pts.length === 1) {
      // 單點 → 圓點（v145：筆工具吃壓感筆寬）
      const x = pts[0][1] * W, y = pts[0][2] * H;
      const dw = s.tool === 'pen' ? this._pressW(s, pts[0], k / v.scale) : s.width * k / v.scale;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, y, dw / 2, 0, Math.PI * 2); ctx.fill();
    } else if (s.tool === 'pen') {
      // v145：筆工具即時繪製 — 逐段可變筆寬（筆壓）
      const wOf = (pt) => this._pressW(s, pt, k / v.scale);
      for (let i = Math.max(1, from); i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        ctx.lineWidth = (wOf(a) + wOf(b)) / 2;
        ctx.beginPath();
        ctx.moveTo(a[1] * W, a[2] * H);
        ctx.lineTo(b[1] * W, b[2] * H);
        ctx.stroke();
      }
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
    // v210：預覽吃圖形專屬設定（顏色/粗細）；線型＝虛線時直接預覽真實短虛線樣式，
    // 實線時維持既有 [8,6] 預覽慣例（未定稿的視覺語彙）。座標軸不套圖形 dash。
    ctx.strokeStyle = this.shapeColor; ctx.lineWidth = this.shapeWidth * k / v.scale;
    if (d.shape !== 'axes' && this.shapeDash) ctx.setLineDash(this._dashPattern(this.shapeWidth * k / v.scale));
    else ctx.setLineDash([8, 6]);
    this._strokeShape(ctx, d.shape, d.fx0 * W, d.fy0 * H, d.fx1 * W, d.fy1 * H, d.origin);
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
      // 量角器角度讀數（v210：屬圖形預覽，吃圖形色）
      ctx.fillStyle = this.shapeColor;
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
      // v139：多圖
      if (data.images) pg.images = data.images.map(im => ({ id: im.id, src: im.src, x: im.x || 0, y: im.y || 0, s: im.s || 1, _el: null }));
      pages.splice(idx, 0, pg);
      if (idx <= this.pageIndex) this.pageIndex++;
      this._migrateImages(pg);
      this.ensureImage(pg, () => this.render());
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
        // v139：多圖同步
        if (data.action === 'add' && data.id) {
          const imgs = this._migrateImages(pg);
          // dataUrl 太大不走同步，來賓端需自行處理；這裡只記佔位
          if (!imgs.find(im => im.id === data.id)) {
            imgs.push({ id: data.id, src: null, x: 0, y: 0, s: 1, _el: null });
          }
        } else if (data.action === 'remove' && data.id) {
          const imgs = this._migrateImages(pg);
          const i = imgs.findIndex(im => im.id === data.id);
          if (i >= 0) imgs.splice(i, 1);
        } else {
          // 舊格式相容
          pg.image = data.dataUrl;
          if (data.dataUrl) this.ensureImage(pg, () => this.render());
        }
      }
    }
    this.render();
  }

  /* 底圖圖片載入（重播/匯入時用）— v139：支援單張 im 或整頁 */
  ensureImage(page, imOrCb, cb) {
    // 新用法：ensureImage(pg, im, cb)
    if (imOrCb && typeof imOrCb === 'object' && imOrCb.src) {
      const im = imOrCb;
      if (im._el) { cb && cb(); return; }
      const img = new Image();
      img.onload = () => { im._el = img; cb && cb(); };
      img.onerror = () => { cb && cb(); };
      img.src = im.src;
      return;
    }
    // 舊用法相容：ensureImage(pg, cb) — 載入全部
    const callback = typeof imOrCb === 'function' ? imOrCb : cb;
    const imgs = this._migrateImages(page);
    let pending = imgs.filter(im => !im._el).length;
    if (!pending) { callback && callback(); return; }
    for (const im of imgs) {
      if (im._el) continue;
      this.ensureImage(page, im, () => {
        if (--pending <= 0) { callback && callback(); }
      });
    }
  }

  /* 序列化（課程檔用）：圖片已在 page.image */
  serialize() {
    // v139：多圖 — 存 images 陣列（id, src, x, y, s；_el 不存）
    const imgs = this._migrateImages(this.page);
    return {
      bg: this.page.bg,
      image: this.page.image, // 舊格式相容保留
      images: imgs.map(im => ({ id: im.id, src: im.src, x: im.x || 0, y: im.y || 0, s: im.s || 1 })),
      strokes: this.page.strokes.map(s => {
        const o = Object.assign({}, s);
        delete o._startPerf;
        return o;
      })
    };
  }
}

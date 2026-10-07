/* 墨課 · UI 接線 app.js */
'use strict';

/* v45：版本號（發版時同步更新 sw.js 的 CACHE） */
const APP_VERSION = 'v119';

/* ---------- 小工具 ---------- */
const $ = id => document.getElementById(id);
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add('hidden'), ms || 2500);
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

/* ---------- 主程式 ---------- */
(function init() {
  const board = new Board($('board'));

  /* ----- 來賓模式（電子白板投影端，?room=CODE） ----- */
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) { initGuestMode(board, roomParam); return; }

  /* v47：每頁獨立時間軸——時鐘在每頁第一筆筆跡時才啟動，無需全域 begin */

  /* ----- 工具列 ----- */
  const COLORS = ['#111111', '#ffffff', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599'];
  const colorBox = $('colors');
  const colorPop = $('color-pop');
  const colorDot = $('color-dot');
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'color' + (c === '#111111' ? ' active' : '');
    b.style.background = c;
    b.title = c;
    b.onclick = () => {
      board.setColor(c);
      colorBox.querySelectorAll('.color').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      colorDot.style.background = c; // v112：按鈕圓點同步當前顏色
      colorPop.classList.add('hidden'); // v112：選完自動關閉
    };
    colorBox.appendChild(b);
  });
  // v112：顏色/粗細 popover 開關（點外面自動關）
  $('btn-color').onclick = (e) => {
    e.stopPropagation();
    colorPop.classList.toggle('hidden');
  };
  document.addEventListener('click', (e) => {
    if (!colorPop.classList.contains('hidden') && !$('color-group').contains(e.target)) {
      colorPop.classList.add('hidden');
    }
  });
  document.querySelectorAll('#tools .tool').forEach(b => {
    b.onclick = () => {
      board.setTool(b.dataset.tool);
      document.querySelectorAll('#tools .tool').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('#instruments .tool').forEach(x => { if (!x.dataset.overlay) x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  /* ----- 幾何規尺（v14，iPad 觸控操作） ----- */
  const ruler = { on: false, x: 0, y: 0, angle: 0, len: 420, wd: 56 };
  const protractor = { on: false, x: 0, y: 0, angle: 0, R: 130 };
  let overlayDrag = null;   // {kind, mode:'move'|'rotate', startX,startY, ox,oy,oangle}
  let overlayPending = null;

  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawRulerOverlay(ctx) {
    if (!ruler.on) return;
    const r = ruler;
    ctx.save();
    ctx.translate(r.x, r.y); ctx.rotate(r.angle);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = '#868e96'; ctx.lineWidth = 2;
    rrPath(ctx, -r.len / 2, -r.wd / 2, r.len, r.wd, 8);
    ctx.fill(); ctx.stroke();
    // 刻度（上下緣）
    ctx.strokeStyle = '#495057'; ctx.fillStyle = '#495057'; ctx.lineWidth = 1;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const n = 20, step = r.len / n;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = -r.len / 2 + i * step, big = i % 5 === 0, tl = big ? 12 : 7;
      ctx.moveTo(x, -r.wd / 2); ctx.lineTo(x, -r.wd / 2 + tl);
      ctx.moveTo(x, r.wd / 2); ctx.lineTo(x, r.wd / 2 - tl);
    }
    ctx.stroke();
    for (let i = 5; i < n; i += 5) ctx.fillText(String(i / 2), -r.len / 2 + i * step, -r.wd / 2 + 24);
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    // 旋轉把手
    const hx = r.len / 2 + 28;
    ctx.beginPath(); ctx.arc(hx, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(25,113,194,0.9)'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(hx, 0, 7, -2.2, 1.2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + 7 * Math.cos(1.2), 7 * Math.sin(1.2));
    ctx.lineTo(hx + 7 * Math.cos(1.2) - 6, 7 * Math.sin(1.2) - 1);
    ctx.moveTo(hx + 7 * Math.cos(1.2), 7 * Math.sin(1.2));
    ctx.lineTo(hx + 7 * Math.cos(1.2) + 1, 7 * Math.sin(1.2) - 6);
    ctx.stroke();
    ctx.restore();
  }
  function drawProtractorOverlay(ctx) {
    if (!protractor.on) return;
    const t = protractor;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.strokeStyle = '#868e96'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, t.R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.rotate(t.angle);
    ctx.strokeStyle = '#495057'; ctx.fillStyle = '#495057'; ctx.lineWidth = 1;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.beginPath();
    for (let d = 0; d < 360; d += 5) {
      const a = d * Math.PI / 180, big = d % 45 === 0, mid = d % 15 === 0;
      const r0 = t.R - (big ? 17 : mid ? 12 : 7);
      ctx.moveTo(r0 * Math.cos(a), r0 * Math.sin(a));
      ctx.lineTo(t.R * Math.cos(a), t.R * Math.sin(a));
    }
    ctx.stroke();
    for (let d = 0; d < 360; d += 45) {
      const a = d * Math.PI / 180, rr = t.R - 30;
      ctx.fillText(String(d), rr * Math.cos(a), rr * Math.sin(a));
    }
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(t.R, 0);
    ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1971c2'; ctx.fill();
    ctx.beginPath(); ctx.arc(t.R + 26, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(25,113,194,0.9)'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(t.R + 26, 0, 7, -2.2, 1.2); ctx.stroke();
    ctx.restore();
  }
  board.overlay = (ctx) => { drawRulerOverlay(ctx); drawProtractorOverlay(ctx); };

  function rulerHit(p) {
    if (!ruler.on) return null;
    const dx = p.x - ruler.x, dy = p.y - ruler.y;
    const c = Math.cos(-ruler.angle), s = Math.sin(-ruler.angle);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.hypot(lx - (ruler.len / 2 + 28), ly) < 24) return 'rotate';
    if (Math.abs(lx) <= ruler.len / 2 && Math.abs(ly) <= ruler.wd / 2) return 'move';
    return null;
  }
  function protractorHit(p) {
    if (!protractor.on) return null;
    const dx = p.x - protractor.x, dy = p.y - protractor.y;
    if (Math.hypot(dx - (protractor.R + 26), dy) < 24) return 'rotate';
    if (Math.hypot(dx, dy) <= protractor.R) return 'move';
    return null;
  }
  board.overlayHit = (p) => {
    const rh = rulerHit(p);
    if (rh) { overlayPending = { kind: 'ruler', mode: rh }; return true; }
    const ph = protractorHit(p);
    if (ph) { overlayPending = { kind: 'protractor', mode: ph }; return true; }
    return false;
  };
  board.onOverlayDown = (p) => {
    const o = overlayPending || { kind: 'ruler', mode: 'move' };
    overlayDrag = { kind: o.kind, mode: o.mode, startX: p.x, startY: p.y,
      ox: o.kind === 'ruler' ? ruler.x : protractor.x,
      oy: o.kind === 'ruler' ? ruler.y : protractor.y };
    overlayPending = null;
  };
  window.addEventListener('pointermove', (e) => {
    if (!overlayDrag) return;
    const bcr = board.canvas.getBoundingClientRect();
    const px = e.clientX - bcr.left, py = e.clientY - bcr.top;
    const o = overlayDrag, st = o.kind === 'ruler' ? ruler : protractor;
    if (o.mode === 'move') {
      st.x = o.ox + (px - o.startX); st.y = o.oy + (py - o.startY);
    } else {
      st.angle = Math.atan2(py - o.oy, px - o.ox);
    }
    board.render();
  });
  const endOverlayDrag = () => { overlayDrag = null; };
  window.addEventListener('pointerup', endOverlayDrag);
  window.addEventListener('pointercancel', endOverlayDrag);

  function toggleOverlay(kind, btn) {
    if (kind === 'ruler') {
      ruler.on = !ruler.on;
      if (ruler.on) {
        ruler.x = board._cssW / 2; ruler.y = board._cssH / 2; ruler.angle = 0;
        ruler.len = Math.min(440, board._cssW * 0.62);
        board.ruler = ruler;
      } else board.ruler = null;
      btn.classList.toggle('active', ruler.on);
    } else {
      protractor.on = !protractor.on;
      if (protractor.on) {
        protractor.x = board._cssW / 2; protractor.y = board._cssH / 2; protractor.angle = 0;
        board.protractor = protractor;
      } else board.protractor = null;
      btn.classList.toggle('active', protractor.on);
    }
    board.render();
  }
  document.querySelectorAll('#instruments .tool').forEach(b => {
    b.onclick = () => {
      if (b.dataset.overlay) toggleOverlay(b.dataset.overlay, b);
      else if (b.dataset.tool === 'compass') {
        // v38：圓規開關制（跟直尺/量角器一樣，點一下啟用，再點一下關閉）
        const isActive = b.classList.contains('active');
        document.querySelectorAll('#tools .tool').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('#instruments .tool').forEach(x => { if (!x.dataset.overlay) x.classList.remove('active'); });
        if (isActive) {
          board.setTool('pen');
          document.querySelector('#tools .tool[data-tool="pen"]').classList.add('active');
        } else {
          board.setTool('compass');
          b.classList.add('active');
        }
      }
      else {
        board.setTool(b.dataset.tool);
        document.querySelectorAll('#tools .tool').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('#instruments .tool').forEach(x => { if (!x.dataset.overlay) x.classList.remove('active'); });
        b.classList.add('active');
      }
    };
  });
  $('width-range').oninput = e => board.setWidth(+e.target.value);
  // v114：禪模式切換（工具列變左側直條；頂部列保留，🧘 直接開關）
  $('btn-zen').onclick = () => {
    document.body.classList.toggle('zen');
    setTimeout(positionTlPull, 300); // 等版面切換完再定位時間軸把手
  };
  $('btn-undo').onclick = () => board.undo();
  $('btn-redo').onclick = () => board.redo();
  // v20：畫布浮動鈕（寫字時拇指可及）
  $('btn-float-undo').onclick = () => board.undo();
  $('btn-float-redo').onclick = () => board.redo();
  $('btn-reset-view').onclick = () => board.resetView();  // v42：重置縮放
  $('btn-clear').onclick = () => {
    if (!confirm('確定清除本頁所有筆跡？')) return;
    board.clearPage();
    if (typeof updateImgAdjustBtn === 'function') updateImgAdjustBtn();
    // v93：清除後時間歸零（不管 TLC 有沒有啟用）
    TLC.playhead = 0;
    TLC._lastLive = 0;
    $('tl-time').textContent = '00:00 / 00:00';
    const seek = $('tl-seek');
    if (seek) { seek.max = 1; seek.value = 0; }
    if (TLC.active) {
      renderTlTicks(tlDuration());
      renderTlStrip();
      TLC._ui();
    }
  };

  /* ----- 背景 / 圖片 / 頁面 ----- */
  const BGS = ['white', 'blackboard', 'grid', 'lines'];
  const BG_NAMES = { white: '白板', blackboard: '黑板', grid: '方格', lines: '橫線' };
  $('btn-bg').onclick = () => {
    const cur = board.page.bg;
    const next = BGS[(BGS.indexOf(cur) + 1) % BGS.length];
    board.setBackground(next);
    if (next === 'blackboard' && board.color === '#111111') {
      board.setColor('#ffffff');
      colorBox.querySelectorAll('.color').forEach(x => x.classList.toggle('active', x.title === '#ffffff'));
    }
    toast('背景：' + BG_NAMES[next]);
  };
  $('btn-image').onclick = () => $('file-image').click();
  $('file-image').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = '';
    // v70：顯示處理中提示（大圖解碼＋壓縮需要時間）
    toast('🖼️ 圖片處理中…', 2000);
    const img = new Image();
    img.onload = () => {
      // 用 setTimeout 讓 toast 先顯示，避免 UI 卡住
      setTimeout(() => {
        const c = document.createElement('canvas');
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        // v72：先設 _imgEl 再 setImage（否則第一次 render 時圖片還沒好）
        board.page._imgEl = img;
        board.setImage(c.toDataURL('image/jpeg', 0.85));
        URL.revokeObjectURL(img.src);
        // v73：匯入後自動進入底圖調整模式
        enterImgAdjust();
      }, 50);
    };
    img.onerror = () => toast('圖片讀取失敗，換一張試試');
    img.src = URL.createObjectURL(f);
  };

  /* ----- v106：底圖縮放按鈕（電腦無觸控可用） ----- */
  const imgZoom = (factor) => {
    const pg = board.page;
    if (!pg || !pg.image) return;
    pg.imgS = Math.max(0.2, Math.min(5, (pg.imgS || 1) * factor));
    board.render();
  };
  $('btn-img-zoom-in').onclick = () => imgZoom(1.2);
  $('btn-img-zoom-out').onclick = () => imgZoom(1 / 1.2);
  /* ----- v107：套索選取旋轉按鈕 ----- */
  $('btn-rotate-left').onclick = () => board.rotateSelection(-15);
  $('btn-rotate-right').onclick = () => board.rotateSelection(15);
  window._mokeUpdateRotateBtns = () => {
    const show = !!(board._lassoSel && board._lassoSel.length);
    $('btn-rotate-left').classList.toggle('hidden', !show);
    $('btn-rotate-right').classList.toggle('hidden', !show);
  };
  /* ----- v73：底圖調整模式（雙指縮放調大小、單指拖曳移位置） ----- */
  const enterImgAdjust = () => {
    if (!board.page.image) { toast('本頁沒有底圖'); return; }
    board.imgAdjust = true;
    $('btn-img-adjust').classList.add('hidden');
    $('btn-img-done').classList.remove('hidden');
    $('btn-img-zoom-in').classList.remove('hidden');
    $('btn-img-zoom-out').classList.remove('hidden');
    toast('🖼️ 調整底圖：雙指縮放／＋－按鈕調大小、單指拖曳移位置', 3000);
  };
  const exitImgAdjust = () => {
    board.imgAdjust = false;
    board._imgDrag = null;
    $('btn-img-done').classList.add('hidden');
    $('btn-img-zoom-in').classList.add('hidden');
    $('btn-img-zoom-out').classList.add('hidden');
    updateImgAdjustBtn();
    board.render();
    toast('底圖調整完成');
  };
  const updateImgAdjustBtn = () => {
    // 有底圖且不在調整模式時，顯示「調整底圖」按鈕
    const show = board.page.image && !board.imgAdjust;
    $('btn-img-adjust').classList.toggle('hidden', !show);
  };
  $('btn-img-adjust').onclick = enterImgAdjust;
  $('btn-img-done').onclick = exitImgAdjust;

  /* ----- v81：點 logo 開使用說明 ----- */
  $('brand-help').onclick = () => openModal('modal-help');

  /* ----- v76：手指寫字開關 → v104：預設開＝手指可寫（南勛：預設手寫，要 Apple Pencil 防誤觸再按開關關掉） ----- */
  // 從 localStorage 讀取上次設定（沒存過就預設開）
  try { board.fingerDraw = localStorage.getItem('moke-fingerDraw') !== '0'; } catch (e) {}
  const updateFingerBtn = () => {
    const b = $('btn-finger');
    b.textContent = board.fingerDraw ? '✋' : '✋🚫';
    b.classList.toggle('active', board.fingerDraw);
    b.title = board.fingerDraw ? '手指寫字：開（點一下只留 Apple Pencil，防手掌誤觸）' : '手指寫字：關（只有 Apple Pencil 能寫，點一下開啟）';
  };
  $('btn-finger').onclick = () => {
    board.fingerDraw = !board.fingerDraw;
    try { localStorage.setItem('moke-fingerDraw', board.fingerDraw ? '1' : '0'); } catch (e) {}
    updateFingerBtn();
    toast(board.fingerDraw ? '✋ 手指可以寫字了' : '✋🚫 只有 Apple Pencil 能寫字（防手掌誤觸）');
  };
  updateFingerBtn();
  const updatePageLabel = () => {
    $('page-label').textContent = (board.pageIndex + 1) + ' / ' + board.pageCount();
    // v53：頁數提醒一直顯示，超過 20 頁變紅色
    const hint = $('page-hint');
    if (hint) {
      const over = board.pageCount() > 20;
      hint.style.color = over ? '#e03131' : '#adb5bd';
      hint.style.fontWeight = over ? '700' : '400';
    }
  };
  /* v18：換頁時若時間軸開著，切換到該頁的獨立時間軸 */
  // v47：換頁＝切換到該頁獨立時間軸（各頁從 00:00 開始，互不干擾）
  const afterPageChange = () => {
    updatePageLabel();
    board.tlCutoff = null;  // 換頁回到即時全顯示
    // v73：換頁時退出底圖調整模式，更新調整按鈕
    if (board.imgAdjust) { board.imgAdjust = false; $('btn-img-done').classList.add('hidden'); }
    updateImgAdjustBtn();
    board.render();
    if (TLC.active) {
      TLC.syncPage();  // 切換時間軸到新頁，playhead＝該頁 liveEdge
      renderTlTicks(tlDuration());
      renderTlStrip();
      TLC._ui();
      schedulePreview();
    }
  };
  $('btn-page-prev').onclick = () => { board.gotoPage(board.pageIndex - 1); afterPageChange(); };
  $('btn-page-next').onclick = () => { board.gotoPage(board.pageIndex + 1); afterPageChange(); };
  $('btn-page-add').onclick = () => { board.addPage(); afterPageChange(); toast('已新增第 ' + (board.pageIndex + 1) + ' 頁'); };
  $('btn-page-del').onclick = () => {
    if (!confirm('確定刪除第 ' + (board.pageIndex + 1) + ' 頁？')) return;
    board.delPage(); afterPageChange();
  };

  /* ----- 文字工具 ----- */
  board.onTextTap = (fx, fy) => {
    const ov = $('text-overlay'), input = $('text-input');
    const r = $('canvas-wrap').getBoundingClientRect();
    ov.style.left = (fx * r.width) + 'px';
    ov.style.top = (fy * r.height) + 'px';
    ov.classList.remove('hidden');
    input.value = ''; input.focus();
    $('text-ok').onclick = () => {
      board.addText(fx, fy, input.value, 44);
      ov.classList.add('hidden');
    };
    $('text-cancel').onclick = () => ov.classList.add('hidden');
  };

  /* ----- 事件分發：時間軸＋分享（v28：錄影已移除；v47：board._emit 已寫入當頁 tl，此處只做 UI 更新） ----- */
  board.onEvent = (type, data) => {
    // v47：筆跡時間軸由 board._emit 直接寫入當頁 tl.events（含 tlT），此處不再經 SessionLog
    const pg = board.page;
    const tl = pg && pg.tl;
    let _t = 0;
    if (tl && tl.events.length) _t = tl.events[tl.events.length - 1].t;
    Share.broadcast(type, data, _t);
    if (TLC.active) {
      TLC.onEventAppended();
      renderTlTicks(tlDuration());
      if (!$('tl-edit-panel').classList.contains('hidden')) renderTlStrip();
      schedulePreview();
    }
  };

  /* 🚩 標記：隨時可插。v27：綁筆跡——標記「這一段筆跡結束」的點 */
  $('btn-mark').onclick = () => {
    // v57：標記綁 playhead 位置的筆跡（拉回時間軸可隨意標記）
    const m = TLC.addStop();
    if (m) {
      const strokes = board.page.strokes;
      const st = strokes.find(s => s.id === m.strokeId);
      const t = st ? (st.tlT === undefined ? 0 : st.tlT) : 0;
      toast('🚩 已標記：' + m.label + '（' + fmtTime(t) + '）');
      if (TLC.active) { renderTlTicks(tlDuration()); renderTlStrip(); TLC._ui(); }
      schedulePreview();
    } else {
      toast('先寫點東西再插標記');
    }
  };

  /* ----- modal 通用 ----- */
  document.querySelectorAll('.modal-close').forEach(b => {
    b.onclick = () => b.closest('.modal').classList.add('hidden');
  });
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
  });
  const openModal = id => $(id).classList.remove('hidden');

  /* ----- 課程管理 ----- */
  $('btn-lessons').onclick = () => { refreshLessonList(); openModal('modal-lessons'); };
  $('btn-save-lesson').onclick = async () => {
    // v47：每頁獨立時間軸——直接存每頁的筆跡（含 tlT）＋標記，不再存全域事件簿
    const title = ($('lesson-title').value || '未命名課程').trim();
    const pages = board.pages.map(p => ({
      bg: p.bg, image: p.image || null,
      imgS: p.imgS || 1, imgX: p.imgX || 0, imgY: p.imgY || 0,
      strokes: JSON.parse(JSON.stringify(p.strokes)),
      stops: (p.tl ? p.tl.stops : []).map(m => ({ id: m.id, strokeId: m.strokeId, label: m.label }))
    }));
    const lesson = {
      id: 'L' + Date.now(), title, created: Date.now(), duration: 0,
      startPage: 0,
      pages,
      audio: [], meta: { aspect: board._cssW / Math.max(1, board._cssH) }, noAudio: true,
      v: 47  // v47 格式：每頁獨立時間軸
    };
    await LessonStore.save(lesson);
    $('lesson-title').value = '';
    toast('✅ 已儲存（含每頁獨立筆跡時間軸，可重播）');
    refreshLessonList();
  };

  /* v52：匯出/匯入備份＋存成圖片/PDF */
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // 匯出課程檔（JSON 備份，含每頁筆跡＋時間軸＋標記）
  $('btn-export-lesson').onclick = () => {
    const pages = board.pages.map(p => ({
      bg: p.bg, image: p.image || null,
      imgS: p.imgS || 1, imgX: p.imgX || 0, imgY: p.imgY || 0,
      strokes: p.strokes,
      stops: (p.tl ? p.tl.stops : []).map(m => ({ id: m.id, strokeId: m.strokeId, label: m.label }))
    }));
    const lesson = {
      id: 'L' + Date.now(), title: '白板備份 ' + new Date().toLocaleString(),
      created: Date.now(), pages, v: 47
    };
    const blob = new Blob([JSON.stringify(lesson)], { type: 'application/json' });
    downloadBlob(blob, 'moke-backup-' + Date.now() + '.json');
    toast('⬇️ 已匯出備份檔');
  };
  // 匯入課程檔
  $('btn-import-lesson').onclick = () => $('file-lesson').click();
  $('file-lesson').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const l = JSON.parse(text);
      if (!l.pages && !l.basePages) throw new Error('不是墨課課程檔');
      loadLessonToBoard(l);
      await LessonStore.save(l);
      refreshLessonList();
      toast('⬆️ 已匯入：' + (l.title || '課程'));
    } catch (err) {
      toast('匯入失敗：' + err.message);
    }
    e.target.value = '';
  };
  // 本頁存成 PNG 圖片
  $('btn-export-png').onclick = () => {
    // 確保畫布是完整渲染（不受時間軸 cutoff 影響）
    const savedCutoff = board.tlCutoff;
    board.tlCutoff = null;
    board.render();
    board.canvas.toBlob((blob) => {
      board.tlCutoff = savedCutoff;
      board.render();
      if (blob) {
        downloadBlob(blob, 'moke-page' + (board.pageIndex + 1) + '-' + Date.now() + '.png');
        toast('📷 已存成圖片（第 ' + (board.pageIndex + 1) + ' 頁）');
      } else {
        toast('圖片匯出失敗');
      }
    }, 'image/png');
  };
  // 全部頁面存成 PDF
  $('btn-export-pdf').onclick = async () => {
    if (!window.jspdf) { toast('PDF 套件載入中，請稍後再試'); return; }
    const { jsPDF } = window.jspdf;
    toast('📄 正在產生 PDF…', 2000);
    const savedIndex = board.pageIndex;
    const savedCutoff = board.tlCutoff;
    board.tlCutoff = null;
    try {
      // 用第一頁的尺寸決定 PDF 方向
      const W = board._cssW, H = board._cssH;
      const pdf = new jsPDF({ unit: 'px', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
      for (let i = 0; i < board.pages.length; i++) {
        board.pageIndex = i;
        board.render();
        // 等待圖片載入
        await new Promise(r => setTimeout(r, 50));
        const imgData = board.canvas.toDataURL('image/jpeg', 0.85);
        if (i > 0) pdf.addPage([W, H], W > H ? 'landscape' : 'portrait');
        pdf.addImage(imgData, 'JPEG', 0, 0, W, H);
      }
      pdf.save('moke-' + Date.now() + '.pdf');
      toast('📄 PDF 已匯出（共 ' + board.pages.length + ' 頁）');
    } catch (err) {
      toast('PDF 匯出失敗：' + err.message);
    }
    board.pageIndex = savedIndex;
    board.tlCutoff = savedCutoff;
    board.render();
  };
  async function refreshLessonList() {
    const ul = $('lesson-list'); ul.innerHTML = '';
    let list = [];
    try { list = await LessonStore.list(); } catch (e) { ul.innerHTML = '<li>儲存空間無法使用</li>'; return; }
    if (!list.length) { ul.innerHTML = '<li class="hint">尚無課程，先錄影或儲存白板吧。</li>'; return; }
    for (const m of list) {
      const li = document.createElement('li');
      const d = new Date(m.created);
      li.innerHTML = `<b>${escapeHtml(m.title)}</b>
        <span class="meta">${d.getMonth() + 1}/${d.getDate()} ${fmtTime(m.duration)} · 約${m.kb}KB</span>`;
      const btns = document.createElement('span');
      const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => fn(m.id); btns.appendChild(b); };
      mk('▶ 重播', openPlayer);
      mk('📝 載入編輯', async id => {
        const l = await LessonStore.get(id);
        loadLessonToBoard(l);
        $('modal-lessons').classList.add('hidden');
        updatePageLabel();
        toast('已載入，可繼續書寫');
      });
      mk('⬇️', async id => {
        const f = await LessonStore.exportFile(id);
        downloadBlob(new Blob([f.json], { type: 'application/json' }), f.name);
      });
      mk('🗑️', async id => { if (confirm('刪除此課程？')) { await LessonStore.del(id); refreshLessonList(); } });
      li.appendChild(btns);
      ul.appendChild(li);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function loadLessonToBoard(l) {
    if (TLC.active) closeTimeline();
    // v47：載入每頁獨立時間軸格式
    if (l.v === 47 && l.pages) {
      board.pages = l.pages.map(p => ({
        bg: p.bg, image: p.image || null, _imgEl: null,
        imgS: p.imgS || 1, imgX: p.imgX || 0, imgY: p.imgY || 0,
        strokes: JSON.parse(JSON.stringify(p.strokes || [])),
        undo: [], redo: [],
        tl: { events: [], stops: (p.stops || []).map(m => ({ id: m.id, strokeId: m.strokeId, label: m.label })), clock: null, unadded: [] }
      }));
    } else {
      // 舊格式相容：盡力還原
      board.pages = (l.basePages || []).map(p => ({
        bg: p.bg, image: p.image, imgS: p.imgS || 1, imgX: p.imgX || 0, imgY: p.imgY || 0, strokes: JSON.parse(JSON.stringify(p.strokes || [])),
        undo: [], redo: [], tl: { events: [], stops: [], clock: null, unadded: [] }
      }));
    }
    board.pageIndex = 0;
    let maxId = 0;
    for (const pg of board.pages) {
      for (const s of pg.strokes) {
        if (s.id > maxId) maxId = s.id;
      }
    }
    board._strokeSeq = maxId + 1;
    for (const p of board.pages) board.ensureImage(p, () => board.render());
    board.render();
  }

  /* ----- 播放器 ----- */
  let player = null;
  let seekDrag = false;
  window.addEventListener('pointerup', () => { seekDrag = false; });

  /* ----- Live Overlay：at-marker 暫停期的臨時塗鴉（規格 §2.4） ----- */
  const overlay = {
    strokes: [], seq: 0, sessionStart: 0, cur: null,
    get canvas() { return $('player-overlay'); },
    show() {
      const pc = $('player-canvas'), oc = this.canvas;
      oc.width = pc.width; oc.height = pc.height;   // device px 與播放畫布對齊
      const ctx = oc.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, oc.width, oc.height);
      this.strokes = []; this.cur = null;
      this.sessionStart = performance.now();
      oc.classList.add('active');
      $('overlay-bar').classList.remove('hidden');
    },
    hide() {
      this.strokes = []; this.cur = null;
      this.canvas.classList.remove('active');
      $('overlay-bar').classList.add('hidden');
    },
    pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        fx: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        fy: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
      };
    }
  };
  function overlayDraw(p, q) {
    const oc = overlay.canvas, ctx = oc.getContext('2d');
    const W = oc.width, H = oc.height;
    ctx.save();
    ctx.strokeStyle = '#E53935'; ctx.fillStyle = '#E53935';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, W * 0.005);
    ctx.beginPath();
    if (!q) { ctx.arc(p.fx * W, p.fy * H, Math.max(2, W * 0.004), 0, 7); ctx.fill(); }
    else { ctx.moveTo(p.fx * W, p.fy * H); ctx.lineTo(q.fx * W, q.fy * H); ctx.stroke(); }
    ctx.restore();
  }
  function overlayDown(e) {
    if (!player || !player.atMarker) return;
    e.preventDefault();
    try { overlay.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = overlay.pos(e);
    overlay.cur = {
      stroke: {
        id: 'ov' + Date.now().toString(36) + '_' + (overlay.seq++),
        tool: 'pen', color: '#E53935', width: 5,
        pts: [[0, p.fx, p.fy]], dur: 0,
        page: player.board.pageIndex
      },
      startWall: performance.now()
    };
    overlayDraw(p, null);
  }
  function overlayMove(e) {
    const c = overlay.cur; if (!c) return;
    e.preventDefault();
    const p = overlay.pos(e);
    const pts = c.stroke.pts;
    const prev = pts[pts.length - 1];
    pts.push([Math.round(performance.now() - c.startWall), p.fx, p.fy]);
    overlayDraw({ fx: prev[1], fy: prev[2] }, p);
  }
  function overlayUp() {
    const c = overlay.cur; if (!c) return;
    c.stroke.dur = Math.round(performance.now() - c.startWall);
    overlay.strokes.push({
      stroke: c.stroke,
      tEvent: player.atMarkerT + (c.startWall - overlay.sessionStart)
    });
    overlay.cur = null;
  }
  $('player-overlay').addEventListener('pointerdown', overlayDown);
  $('player-overlay').addEventListener('pointermove', overlayMove);
  $('player-overlay').addEventListener('pointerup', overlayUp);
  $('player-overlay').addEventListener('pointercancel', overlayUp);

  /* 併入時間軸：overlay 佔用真實時間，暫停點之後的事件/標記/聲音整體後移 */
  async function overlayCommit() {
    if (!player) return;
    const mT = player.atMarkerT;
    const items = overlay.strokes;
    if (!items.length) { overlay.hide(); return; }
    const lesson = player.lesson;
    lesson.events = lesson.events || [];
    const lastEnd = Math.max(...items.map(it => it.tEvent + it.stroke.dur));
    const D = Math.max(0, Math.round(lastEnd - mT));
    if (D > 0) {
      for (const e of lesson.events) if (e.t > mT) e.t += D;
      // v27：綁筆跡的標記跟著筆跡事件時間走（已平移），只平移舊格式（t）標記
      for (const mk of lesson.stops || []) if (!mk.strokeId && mk.t > mT) mk.t += D;
      for (const s of lesson.audio || []) if (s.t0 > mT) s.t0 += D;
      for (const s of player.segments) if (s.t0 > mT) s.t0 += D;
      lesson.duration += D;
    }
    for (const it of items) {
      lesson.events.push({ t: Math.round(it.tEvent), evt: 'add', data: { page: it.stroke.page, stroke: it.stroke } });
    }
    lesson.events.sort((a, b) => a.t - b.t);
    await LessonStore.save(lesson);
    overlay.hide();
    $('player-seek').max = lesson.duration;
    player.atMarker = false;
    player.seek(mT + D);
    toast('✅ 臨時塗鴉已併入時間軸');
  }
  $('btn-overlay-commit').onclick = overlayCommit;
  $('btn-overlay-discard').onclick = () => { overlay.hide(); toast('已丟棄臨時塗鴉'); };

  /* 離開 at-marker 狀態：未併入的塗鴉視為暫時，直接清除 */
  function leaveMarkerState() {
    if (overlay.canvas.classList.contains('active')) {
      overlay.hide();
      toast('未併入的臨時塗鴉已清除');
    }
  }

  /* 簡報筆 / 鍵盤控制（規格 §2.3b）：播放器開啟時有效 */
  let playerKeyHandler = null;
  function bindPlayerKeys() {
    unbindPlayerKeys();
    playerKeyHandler = (e) => {
      if ($('modal-player').classList.contains('hidden') || !player) return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault(); leaveMarkerState();
        const m = player.nextStop();
        if (m) toast('⏭ 播放到：' + (m.label || '段落'));
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault(); leaveMarkerState(); player.prevStop();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (player.playing) player.pause();
        else { leaveMarkerState(); player.play(); }
      }
    };
    window.addEventListener('keydown', playerKeyHandler);
  }
  function unbindPlayerKeys() {
    if (playerKeyHandler) { window.removeEventListener('keydown', playerKeyHandler); playerKeyHandler = null; }
  }
  function closePlayer() {
    if (!player) { $('modal-player').classList.add('hidden'); return; }
    unbindPlayerKeys();
    overlay.hide();
    player.close(); player = null;
    $('player-speed').value = '1';
    $('modal-player').classList.add('hidden');
  }

  async function openPlayer(id) {
    const l = await LessonStore.get(id);
    if (!l) return;
    closePlayer();
    $('modal-lessons').classList.add('hidden');
    openModal('modal-player');
    $('player-title').textContent = '▶ ' + l.title;
    const seek = $('player-seek');
    seek.max = l.duration; seek.value = 0;
    seek.onpointerdown = () => { seekDrag = true; };
    seek.oninput = () => { if (player) { leaveMarkerState(); player.seek(+seek.value); } };
    $('player-speed').value = '1';
    $('player-speed').onchange = () => { if (player) player.setSpeed(parseFloat($('player-speed').value)); };
    const stops = (l.stops || [])
      .map(s => ({ s, t: resolveStopTime(l.events, s) }))
      .filter(x => x.t !== null)
      .sort((a, b) => a.t - b.t);
    player = new LessonPlayer($('player-canvas'), l, {
      onTime: (t, d) => {
        $('player-time').textContent = fmtTime(t) + ' / ' + fmtTime(d);
        if (!seekDrag) seek.value = Math.round(t);
        const idx = stops.filter(x => x.t <= t + 50).length;
        $('player-marker').textContent = stops.length ? `📍 ${idx}/${stops.length}` : '';
      },
      onState: playing => { $('btn-play-toggle').textContent = playing ? '⏸ 暫停' : '▶ 播放'; },
      onMarker: m => {
        toast('📍 ' + (m && m.label || '段落') + ' — 已暫停，可臨時塗鴉');
        overlay.show();
      },
      onEnd: () => {
        toast('播放完畢');
        // v115：碼表一點即播（未開抽屜）時，播完自動回到即時書寫
        if (!$('tl-pull').classList.contains('open')) closeTimeline();
      }
    });
    bindPlayerKeys();
    await player.prepare();
    player.play();
  }
  $('btn-play-toggle').onclick = () => {
    if (!player) return;
    if (player.playing) player.pause();
    else { leaveMarkerState(); player.play(); }
  };
  $('btn-play-restart').onclick = () => { if (player) { leaveMarkerState(); player.restart(); } };
  $('btn-play-prev-stop').onclick = () => { if (player) { leaveMarkerState(); player.prevStop(); } };
  /* ⏭ 單擊：動畫播放到下一段；雙擊：瞬間呈現完成畫面 */
  let playNextTimer = null;
  $('btn-play-next-stop').onclick = () => {
    if (!player) return;
    clearTimeout(playNextTimer);
    playNextTimer = setTimeout(() => {
      leaveMarkerState();
      const m = player.nextStop();
      if (m) toast('⏭ 播放到：' + (m.label || '段落'));
      else toast('已是最後一段');
    }, 280);
  };
  $('btn-play-next-stop').ondblclick = () => {
    if (!player) return;
    clearTimeout(playNextTimer);
    leaveMarkerState();
    const m = player.revealNext();
    toast(m ? '⚡ 瞬間呈現：' + (m.label || '段落') : '已是最後一段');
  };
  $('modal-player').addEventListener('click', e => {
    if (e.target.id === 'modal-player') closePlayer();
  });
  $('modal-player').querySelector('.modal-close').onclick = () => closePlayer();

  /* ----- 主白板時間軸（v12：Doceri 式統一時間軸）-----
   * 抽屜只是 HUD，不鎖書寫；時間軸與書寫共存於同一畫布。
   * - 抽屜開啟時 playhead 從 liveEdge 起算，可 ⏮⏭▶/拖曳回放。
   * - 回放中（playhead < liveEdge）落筆＝自動插入，後方事件/標記自動後移。
   */
  let tlSeekDrag = false;
  const _playerPointerUp = () => { seekDrag = false; tlSeekDrag = false; };
  window.addEventListener('pointerup', _playerPointerUp);

  // v89: 講者視圖已移除，schedulePreview 保留空函數避免報錯
  function schedulePreview() {}

  const TLC = new TimelineController(board, {
    onTime: (t, live) => {
      // v47：每頁獨立時間軸，t 已是該頁相對時間（從 00:00 開始）
      $('tl-time').textContent = fmtTime(t) + ' / ' + fmtTime(live);
      const seek = $('tl-seek');
      seek.max = Math.max(1, Math.round(live));
      if (!tlSeekDrag) seek.value = Math.round(t);
      const pg = board.page;
      const stops = pg.tl ? pg.tl.stops : [];
      const byId = new Map(pg.strokes.map(s => [s.id, s]));
      const idx = stops.filter(m => {
        const st = byId.get(m.strokeId);
        const stt = st ? (st.tlT === undefined ? 0 : st.tlT) : 999999999;
        return stt <= t + 50;
      }).length;
      const tlMarkerEl = $('tl-marker');
      if (tlMarkerEl) tlMarkerEl.textContent = stops.length ? `📍 ${idx}/${stops.length}` : '';
      updateTlPlayhead(t, live);
      $('tl-handle-label').textContent = (t < live - 50) ? '⏪ 回放中 · 上滑收起回到即時' : '上滑收起時間軸';
      schedulePreview();
    },
    onPlayState: playing => { $('btn-tl-play').textContent = playing ? '❚❚' : '▶'; $('tl-time').classList.toggle('playing', playing); }, // v112：碼表同步播放狀態
    onMarker: m => { toast('📍 ' + (m && m.label || '段落')); },
    onEdit: () => {
      renderTlTicks(tlDuration());
      renderTlStrip();
      schedulePreview();
    },
    // 講者視圖：主持端時間軸導航即時廣播給學生端（v13）
    onNav: (nav) => { if (Share.mode === 'host') Share.broadcastTl(nav); }
  });
  // 學生中途加入：snapshot 帶上主持端目前 playhead
  Share._snapshotExtra = () => ({ tlPlayhead: TLC.active ? Math.round(TLC.playhead) : null });
  // v103：供 board._up 提筆暫停時同步頂部時間顯示
  window._mokeSyncTime = (t) => {
    if (TLC.active) return;
    $('tl-time').textContent = fmtTime(t) + ' / ' + fmtTime(t);
    const seek = $('tl-seek');
    seek.max = Math.max(1, t);
    seek.value = t;
  };
  // v100：寫字時時間即時跳（TLC 未啟動時，用頁面時鐘更新顯示）
  // v101：5 秒沒動作自動暫停時鐘（時間軸只記錄動作時間）
  // v103：提筆立即暫停（_up 直接處理，這裡只當按鈕動作的安全網）
  setInterval(() => {
    if (TLC.active) return;  // 回放中由 TLC 自己更新
    const pg = board.page;
    if (!pg || !pg.tl || !pg.tl.clock || !pg.tl.clock.running) return;
    // 5 秒閒置 → 暫停時鐘
    if (performance.now() - (board._lastActivity || 0) > 5000) {
      // v102：暫停時把時鐘倒回最後事件時間（去掉 5 秒 grace 的空白），
      // 否則頂部顯示 00:46 但時間軸只有 00:41，兩邊不一致
      const lastT = Math.round(TLC.liveEdge());
      pg.tl.clock.pause();
      pg.tl.clock.base = lastT;
      $('tl-time').textContent = fmtTime(lastT) + ' / ' + fmtTime(lastT);
      const seek = $('tl-seek');
      seek.max = Math.max(1, lastT);
      seek.value = lastT;
      return;
    }
    const t = Math.round(pg.tl.clock.now());
    $('tl-time').textContent = fmtTime(t) + ' / ' + fmtTime(t);
    const seek = $('tl-seek');
    seek.max = Math.max(1, t);
    seek.value = t;
  }, 250);

  function openTimeline() {
    // v60：抽屜視覺和 TLC 啟用分開（按播放後再下拉，抽屜也要能開）
    const wasActive = TLC.active;
    if (!wasActive) {
      // v95：有時間軸事件就能開（寫了又擦光也算，不能只看 strokes）
      const pg = board.page;
      const hasEvents = pg.tl && pg.tl.events && pg.tl.events.length > 0;
      if (!pg.strokes.length && !hasEvents) {
        toast('還沒有筆跡時間軸，先寫幾個字吧'); return;
      }
      TLC.activate();
      // v50：時間軸打開時鎖定畫布書寫，只能拉時間軸
      board.lockDraw = true;
      board.onLockDraw = () => toast('收起時間軸後再書寫', 1500);
    }
    $('tl-speed').value = '1'; $('tl-speed-label').textContent = '1x'; TLC.setSpeed(1);
    $('tl-pull').classList.add('open');
    $('tl-handle-label').textContent = '上滑收起時間軸';
    renderTlTicks(tlDuration());
    renderTlStrip();
    bindTimelineKeys();
    if (!wasActive) {
      toast('🕘 時間軸：邊寫邊用；⏮ 回到上一段，⏭ 逐段重播', 2500);
      if (Share.mode === 'host') toast('📡 分享中：電子白板不會同步時間軸操作，請改用螢幕鏡像投影', 3000);
    }
  }
  function closeTimeline() {
    if (!TLC.active) return;
    // v47：_endInsert 已移除（插入不再位移），直接回到即時並關閉
    TLC.goTo(TLC.liveEdge());   // 收起＝回到即時
    TLC.deactivate();
    // v50：解鎖畫布書寫
    board.lockDraw = false;
    board.onLockDraw = null;
    unbindTimelineKeys();
    $('tl-pull').classList.remove('open');
    $('tl-handle-label').textContent = '下拉展開時間軸';
    $('tl-edit-panel').classList.add('hidden');
    $('tl-pull').classList.remove('edit');
    $('btn-tl-edit').classList.remove('active');
    tlEditSelIds.clear();
  }
  let tlKeyHandler = null;
  function bindTimelineKeys() {
    unbindTimelineKeys();
    tlKeyHandler = (e) => {
      if (!TLC.active) return;
      if (e.key === 'PageDown' || e.key === 'ArrowRight') { e.preventDefault(); TLC.nextStop(); }
      else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); TLC.prevStop(); }
      else if (e.key === ' ') { e.preventDefault(); TLC.playing ? TLC.pause() : (TLC.play() || toast('已在即時進度')); }
      else if (e.key === 'Escape') { closeTimeline(); }
    };
    window.addEventListener('keydown', tlKeyHandler);
  }
  function unbindTimelineKeys() {
    if (tlKeyHandler) { window.removeEventListener('keydown', tlKeyHandler); tlKeyHandler = null; }
  }
  $('btn-tl-exit').onclick = closeTimeline;
  // v115：碼表一點即播，不開抽屜（恢復 v60 行為）；播完自動回到即時書寫
  function togglePlay() {
    if (!TLC.active) {
      const pg = board.page;
      const hasEvents = pg.tl && pg.tl.events && pg.tl.events.length > 0;
      if (!pg.strokes.length && !hasEvents) { toast('還沒有筆跡，先寫幾個字吧'); return; }
      TLC.activate();
      TLC.goTo(0);  // 從頭開始播
      board.lockDraw = true;
      board.onLockDraw = () => toast('下拉時間軸 → ✕ 回到即時書寫', 1500);
    } else if (TLC.playing) TLC.pause();
    else if (!TLC.play()) toast('已在即時進度');
  }
  $('tl-time').onclick = togglePlay;
  $('btn-tl-play').onclick = togglePlay; // v119：回頂部，一點即播不開抽屜
  // v60：控制鈕不用下拉也能用（自動啟用 TLC）
  const ensureTLC = () => {
    if (TLC.active) return true;
    const pg = board.page;
    const hasEvents = pg.tl && pg.tl.events && pg.tl.events.length > 0;
    if (!pg.strokes.length && !hasEvents) { toast('還沒有筆跡，先寫幾個字吧'); return false; }
    TLC.activate();
    // v91：跟播放一樣，啟用就鎖書寫
    board.lockDraw = true;
    board.onLockDraw = () => toast('按 ✕ 回到即時書寫', 1500);
    return true;
  };
  $('btn-tl-start').onclick = () => { if (ensureTLC()) TLC.goTo(0); };
  $('btn-tl-end').onclick = () => { if (ensureTLC()) TLC.goTo(TLC.liveEdge()); };
  $('btn-tl-prev').onclick = () => { if (ensureTLC()) TLC.prevStop(); };
  $('btn-tl-prev-stroke').onclick = () => { if (ensureTLC()) TLC.prevStroke(); };
  $('btn-tl-next-stroke').onclick = () => {
    if (!ensureTLC()) return;
    const r = TLC.nextStroke();
    if (r === 'live') toast('已在即時進度');
    else if (r === 'tolive') toast('▶ 回到即時');
  };
  /* ⏭ 單擊：動畫播放；雙擊：瞬間呈現 */
  let tlNextTimer = null;
  $('btn-tl-next').onclick = () => {
    if (!ensureTLC()) return;
    clearTimeout(tlNextTimer);
    tlNextTimer = setTimeout(() => {
      const m = TLC.nextStop();
      if (m === 'live') toast('已在即時進度');
      else if (m === 'tolive') toast('▶ 回到即時');
      else if (m) toast('⏭ 播放到：' + (m.label || '段落'));
    }, 280);
  };
  $('btn-tl-next').ondblclick = () => {
    if (!TLC.active) return;
    clearTimeout(tlNextTimer);
    const m = TLC.revealNext();
    toast(m ? '⚡ 瞬間呈現：' + (m.label || '段落') : '已在即時進度');
  };
  $('tl-seek').onpointerdown = () => { tlSeekDrag = true; };
  // v30：seek 值是該頁相對時間，轉回 session 時間再 goTo
  $('tl-seek').oninput = () => { if (TLC.active) TLC.goTo(+$('tl-seek').value); };
  // v55：速度改為可拖曳滑桿
  $('tl-speed').oninput = () => {
    const v = parseFloat($('tl-speed').value);
    $('tl-speed-label').textContent = v + 'x';
    TLC.setSpeed(v);
  };

  /* 回放中落筆＝直接寫在 playhead 時間點（v47 簡化版，不位移後方筆跡） */
  board.onDrawStart = () => {
    if (!TLC.active) { board._tlPlayhead = null; return; }
    if (TLC.playing) TLC.pause();
    // 若不在 live，用 playhead 時間；否則用 null（自然時間）
    board._tlPlayhead = TLC.isLive() ? null : Math.round(TLC.playhead);
  };
  board.onDrawEnd = () => {
    board._tlPlayhead = null;
    // 回放中新增筆跡後，更新時間軸 UI
    if (TLC.active) {
      renderTlTicks(tlDuration());
      TLC._ui();
    }
  };

  /* v12：插入改為自動（回放中落筆即插入），獨立插入模式已移除 */


  /* ----- 下滑式時間軸抽屜（Doceri 式） ----- */
  // v47：每頁獨立時間軸——直接讀當頁筆跡的 tlT，不再過濾全域事件簿
  function renderTlTicks(duration) {
    const box = $('tl-ticks');
    box.innerHTML = '';
    const pg = board.page;
    // v49：duration 為 0 時用 1 代替，避免第一筆（tlT=0）畫不出刻度
    const dur = (duration && duration > 0) ? duration : 1;
    if (!pg.strokes.length && !(pg.tl && pg.tl.stops.length)) return;
    // 筆劃刻度：每筆一刻度，位置 = tlT / duration
    for (const s of pg.strokes) {
      const t = (s.tlT === undefined ? 0 : s.tlT);
      const d = document.createElement('div');
      d.className = 'tl-tick-stroke';
      d.style.left = (Math.max(0, Math.min(100, t / dur * 100))).toFixed(2) + '%';
      box.appendChild(d);
    }
    // 段落標記（綁筆跡，用筆跡的 tlT 定位）
    const byId = new Map(pg.strokes.map(s => [s.id, s]));
    for (const m of (pg.tl ? pg.tl.stops : [])) {
      const st = byId.get(m.strokeId);
      if (!st) continue;
      const t = (st.tlT === undefined ? 0 : st.tlT);
      const d = document.createElement('div');
      d.className = 'tl-tick';
      d.title = m.label || '標記';
      d.style.left = (Math.max(0, Math.min(100, t / dur * 100))).toFixed(2) + '%';
      box.appendChild(d);
    }
  }
  function openTlPull() {
    $('tl-pull').classList.add('open');
    $('tl-handle-label').textContent = '上滑收起時間軸';
  }
  function closeTlPull() {
    $('tl-pull').classList.remove('open');
    $('tl-handle-label').textContent = '下拉展開時間軸';
  }
  /* 把手手勢：點按切換，下拉/上滑超過閾值開合，拖曳時跟手 */
  (() => {
    const handle = $('tl-handle'), wrap = $('tl-drawer-wrap');
    let drag = null;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      drag = { y0: e.clientY, dy: 0, wasOpen: $('tl-pull').classList.contains('open') };
    });
    handle.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.dy = e.clientY - drag.y0;
      if (!drag.wasOpen && drag.dy > 0) wrap.style.maxHeight = Math.min(140, drag.dy) + 'px';
      else if (drag.wasOpen && drag.dy < 0) wrap.style.maxHeight = Math.max(0, 140 + drag.dy) + 'px';
    });
    const end = () => {
      if (!drag) return;
      const { dy, wasOpen } = drag;
      drag = null;
      wrap.style.maxHeight = '';
      if (Math.abs(dy) < 10) { wasOpen ? closeTimeline() : openTimeline(); }
      else if (!wasOpen && dy > 40) openTimeline();
      else if (wasOpen && dy < -40) closeTimeline();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', () => { drag = null; wrap.style.maxHeight = ''; });
  })();

  /* ----- 筆跡級時間軸編輯（Doceri 式非線性時間軸） ----- */
  // v63: tlEditSelIds 為 Set（多選筆跡 ID）
  function tlDuration() {
    if (!TLC.active) return 0;
    // v47：每頁獨立時間軸——時長＝該頁最後一筆的 tlT（已從 00:00 起算）
    return Math.max(0, TLC.liveEdge());
  }
  function updateTlPlayhead(t, d) {
    const ph = $('tl-playhead');
    if (!ph || !d || d <= 0) return;
    // v47：t 已是該頁相對時間，直接定位
    ph.style.left = (Math.max(0, Math.min(100, t / d * 100))).toFixed(2) + '%';
  }
  // v47：每頁獨立——直接讀當頁筆跡，不再遍歷全域事件簿
  function renderTlStrip(duration) {
    const strip = $('tl-strip');
    if (!strip) return;
    strip.querySelectorAll('.tl-stroke,.tl-flag').forEach(n => n.remove());
    const d0 = duration || tlDuration();
    // v49：duration 為 0 時用 1 代替，避免第一筆畫不出
    const dur = (d0 && d0 > 0) ? d0 : 1;
    const pg = board.page;
    if (!pg.strokes.length && !(pg.tl && pg.tl.stops.length)) return;
    const strokes = pg.strokes;
    strokes.forEach((s, idx) => {
      const t = (s.tlT === undefined ? 0 : s.tlT);
      const n = document.createElement('div');
      n.className = 'tl-stroke tool-' + (s.tool || 'pen');
      n.style.left = (Math.max(0, Math.min(100, t / dur * 100))).toFixed(2) + '%';
      n.style.width = Math.max(0.8, ((s.dur || 300) / dur * 100)).toFixed(2) + '%';
      n.title = `${s.tool || 'pen'} · ${fmtTime(t)}`;
      if (tlEditSelIds.has(s.id)) n.classList.add('selected');
      n.addEventListener('pointerdown', pe => { pe.preventDefault(); selectTlStroke(s.id); });
      strip.appendChild(n);
    });
    const byId = new Map(strokes.map(s => [s.id, s]));
    for (const m of (pg.tl ? pg.tl.stops : [])) {
      const st = byId.get(m.strokeId);
      if (!st) continue;
      const t = (st.tlT === undefined ? 0 : st.tlT);
      const f = document.createElement('div');
      f.className = 'tl-flag';
      f.textContent = '🚩';
      f.title = m.label || '';
      f.style.left = (Math.max(0, Math.min(100, t / dur * 100))).toFixed(2) + '%';
      f.addEventListener('pointerdown', ev => tlFlagDrag(ev, m));
      strip.appendChild(f);
    }
    updateTlPlayhead(TLC.active ? TLC.playhead : 0, dur);
  }
  // v47：用筆跡 ID 選取（不再用全域 events index）
  // v63：多選筆跡（Set），點一下選、再點取消
  let tlEditSelIds = new Set();
  function selectTlStroke(strokeId) {
    if (tlEditSelIds.has(strokeId)) tlEditSelIds.delete(strokeId);
    else tlEditSelIds.add(strokeId);
    renderTlStrip();
    const btn = $('btn-tl-del-stroke');
    btn.classList.toggle('hidden', tlEditSelIds.size === 0);
    btn.textContent = `🗑️ 刪除所選筆跡 (${tlEditSelIds.size})`;
  }
  function deleteTlStroke() {
    if (!tlEditSelIds.size) return;
    if (!confirm(`確定刪除所選的 ${tlEditSelIds.size} 則筆跡？`)) return;
    TLC.pause();
    const pg = board.page;
    const sids = new Set(tlEditSelIds);
    // 從畫布刪除
    pg.strokes = pg.strokes.filter(s => !sids.has(s.id));
    pg.undo = pg.undo.filter(s => !sids.has(s.id));
    pg.redo = pg.redo.filter(s => !sids.has(s.id));
    // 從該頁時間軸刪除事件＋連帶標記
    if (pg.tl) {
      pg.tl.events = pg.tl.events.filter(e => !(e.evt === 'add' && e.data && e.data.stroke && sids.has(e.data.stroke.id)));
      pg.tl.stops = pg.tl.stops.filter(m => !sids.has(m.strokeId));
      TLC.renumberStops();
    }
    tlEditSelIds.clear();
    $('btn-tl-del-stroke').classList.add('hidden');
    board.render();
    TLC.goTo(Math.min(TLC.playhead, TLC.liveEdge()));
    renderTlTicks(tlDuration());
    renderTlStrip();
    toast('🗑️ 已刪除該筆筆跡');
  }
  /* 拖曳標記：夾在相鄰標記之間，保持有序 */
  /* v27：拖曳標記＝重新綁定到最接近的筆跡（標記綁筆跡，不綁時間） */
  // v47：拖曳標記＝重新綁定到最接近的筆跡（當頁獨立）
  function tlFlagDrag(e, m) {
    e.preventDefault(); e.stopPropagation();
    TLC.pause();
    const strip = $('tl-strip');
    const dur = tlDuration();
    if (!dur) return;
    const target = e.currentTarget;
    const pg = board.page;
    // 該頁所有筆跡（依 tlT）；已綁其他標記的不重複綁
    const boundIds = new Set((pg.tl ? pg.tl.stops : []).filter(x => x !== m && x.strokeId).map(x => x.strokeId));
    const strokes = pg.strokes
      .filter(s => !boundIds.has(s.id))
      .sort((a, b) => ((a.tlT === undefined ? 0 : a.tlT) - (b.tlT === undefined ? 0 : b.tlT)));
    if (!strokes.length) { toast('沒有可綁定的筆跡'); return; }
    let pendingId = m.strokeId;
    const move = (ev) => {
      const r = strip.getBoundingClientRect();
      const t = (ev.clientX - r.left) / r.width * dur;
      let best = strokes[0], bd = Math.abs((strokes[0].tlT === undefined ? 0 : strokes[0].tlT) - t);
      for (const s of strokes) {
        const st = (s.tlT === undefined ? 0 : s.tlT);
        const d = Math.abs(st - t);
        if (d < bd) { bd = d; best = s; }
      }
      pendingId = best.id;
      const bt = (best.tlT === undefined ? 0 : best.tlT);
      target.style.left = (Math.max(0, Math.min(100, bt / dur * 100))).toFixed(2) + '%';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (pendingId && pendingId !== m.strokeId) {
        m.strokeId = pendingId;
      }
      TLC.renumberStops();
      renderTlTicks(tlDuration());
      renderTlStrip();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  $('btn-tl-edit').onclick = () => {
    const panel = $('tl-edit-panel');
    const show = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
    $('tl-pull').classList.toggle('edit', show);
    $('btn-tl-edit').classList.toggle('active', show);
    if (show) {
      tlEditSelIds.clear();
      $('btn-tl-del-stroke').classList.add('hidden');
      renderTlStrip();
    }
  };
  $('btn-tl-del-stroke').onclick = deleteTlStroke;
  /* 雙擊 strip 空白處：在該位置補一個標記 */
  $('tl-strip').addEventListener('dblclick', (e) => {
    if (e.target !== $('tl-strip') || !TLC.active) return;
    TLC.pause();
    const strip = $('tl-strip'), dur = tlDuration();
    if (!dur) return;
    const r = strip.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width * dur;
    // v47：雙擊補標記——綁到最接近該時間的筆跡（當頁獨立）
    const pg = board.page;
    const strokes = pg.strokes.slice().sort((a, b) =>
      Math.abs((a.tlT === undefined ? 0 : a.tlT) - t) - Math.abs((b.tlT === undefined ? 0 : b.tlT) - t));
    if (!strokes.length) { toast('先寫點東西再插標記'); return; }
    const best = strokes[0];
    const boundIds = new Set((pg.tl ? pg.tl.stops : []).map(x => x.strokeId));
    if (boundIds.has(best.id)) { toast('該筆已有標記'); return; }
    const m = { id: 'm' + Date.now().toString(36), strokeId: best.id, label: '' };
    pg.tl.stops.push(m);
    TLC.renumberStops();
    renderTlTicks(dur);
    renderTlStrip();
    toast('🚩 已補標記：' + m.label);
  });

  /* ----- 匯出影片 ----- */
  /* ----- 分享投影（v34：按鈕先拿掉，功能保留） ----- */
  const _btnShare = $('btn-share');
  if (_btnShare) _btnShare.onclick = () => {
    $('share-host-setup').classList.toggle('hidden', Share.mode === 'host');
    $('share-host-live').classList.toggle('hidden', Share.mode !== 'host');
    openModal('modal-share');
  };
  Share.onHostViewers = n => { $('share-viewers').textContent = n; };
  $('btn-start-share').onclick = () => {
    const code = Share.startHost(board);
    if (!code) return;
    const url = Share.shareUrl(code);
    $('share-code').textContent = code;
    $('share-url').textContent = url;
    const qr = $('share-qrcode'); qr.innerHTML = '';
    try { new QRCode(qr, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); }
    catch (e) { qr.textContent = 'QR 產生失敗，請手動輸入房間碼'; }
    $('share-host-setup').classList.add('hidden');
    $('share-host-live').classList.remove('hidden');
    toast('📡 分享中，電子白板掃碼即可投影');
  };
  $('btn-stop-share').onclick = () => {
    Share.stop();
    $('share-host-setup').classList.remove('hidden');
    $('share-host-live').classList.add('hidden');
    $('modal-share').classList.add('hidden');
    toast('已停止分享');
  };
  $('btn-join-share').onclick = () => {
    const code = $('guest-code').value.trim();
    if (code.length < 4) { toast('請輸入 6 碼房間碼'); return; }
    $('modal-share').classList.add('hidden');
    enterGuestMode(board, code);
  };

  /* ----- PWA ----- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
  window.addEventListener('resize', () => board.resize());
  // v66：時間軸從工具箱下方開始，不蓋住筆刷工具
  function positionTlPull() {
    const tb = $('toolbar');
    if (!tb) return;
    // v114：禪模式工具列在左側直條，把手回到 stage 頂部
    $('tl-pull').style.top = document.body.classList.contains('zen') ? '0px' : tb.offsetHeight + 'px';
  }
  window.addEventListener('resize', positionTlPull);
  // 初始化時定位
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', positionTlPull);
  } else {
    positionTlPull();
  }

  // v45：顯示版本號
  const verEl = $('app-ver');
  if (verEl) {
    verEl.textContent = APP_VERSION;
    // v75：點版本號＝檢查更新（Safari 不主動更新 SW，手動觸發）
    verEl.title = '點我檢查更新';
    verEl.style.cursor = 'pointer';
    verEl.onclick = async (e) => {
      e.stopPropagation();  // v81：避免觸發 brand 的說明 modal
      if (!('serviceWorker' in navigator)) { toast('此瀏覽器不支援 Service Worker'); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) { toast('尚未註冊 Service Worker'); return; }
        toast('🔄 檢查更新中…');
        await reg.update();
        // 等待新版 SW 接管
        setTimeout(() => {
          toast('已檢查更新，若有新版請重整頁面', 2500);
        }, 1500);
      } catch (err) {
        toast('檢查更新失敗：' + (err.message || err));
      }
    };
  }
  updatePageLabel();
  board.render();
})();

/* ================= 來賓模式（電子白板端） ================= */
function initGuestMode(board, code) {
  document.body.classList.add('guest-mode');
  const bar = document.createElement('div');
  bar.id = 'guest-bar';
  bar.innerHTML = '<span id="guest-status">連線中…</span><button id="guest-exit">✕ 離開</button>';
  document.getElementById('app').prepend(bar);
  $('guest-exit').onclick = () => {
    Share.stop();
    location.href = location.pathname;
  };
  board.setTool('pen');
  Share.onGuestStatus = msg => { const s = $('guest-status'); if (s) s.textContent = '📡 ' + msg; };
  // v13：學生端時間軸跟隨（講者視圖）
  const GF = Share.createGuestFollower(board);
  Share.onGuestSnapshot = msg => GF.initFromSnapshot(msg);
  Share.onGuestEvt = msg => GF.onEvt(msg.t, msg.evt, msg.data);
  Share.onGuestTl = msg => GF.onTl(msg);
  Share.joinGuest(code, board);
  // 全螢幕按鈕（電子白板常需）
  const fs = document.createElement('button');
  fs.id = 'guest-fs'; fs.textContent = '⛶ 全螢幕';
  fs.onclick = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen && el.requestFullscreen();
  };
  bar.appendChild(fs);
  window.addEventListener('resize', () => board.resize());
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
}
function enterGuestMode(board, code) {
  location.href = location.pathname + '?room=' + encodeURIComponent(code.trim().toUpperCase());
}

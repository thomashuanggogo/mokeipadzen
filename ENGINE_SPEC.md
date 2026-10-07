# 教學白板核心引擎架構設計（Doceri-like）

> 設計哲學：**Event-Sourced Canvas** —— 畫布不是一張圖，而是一條「事件流」。
> 所有狀態都可以表示為 `state = fold(events)`，這是無損 scrubbing、無痕 undo、Stop Marker 的數學基礎。
> 參考：已下架的 Doceri（SP Controls，2022 年退役）。

---

## 0. 架構總覽

```
┌─────────────┐     events      ┌──────────────────┐     pixels     ┌──────────┐
│  Input Layer │ ─────────────▶ │  Timeline Engine │ ─────────────▶ │ Renderer │
│ (觸控/筆/鍵盤) │  StrokeEvent   │ (Event Sourcing) │   drawFrame(t) │ (Canvas) │
└─────────────┘  Erase/Clear/   └──────────────────┘                └──────────┘
                  Image/Bg/Slide         ▲
                                         │ master clock
                                  ┌──────────────┐
                                  │ Audio Engine │ (語音分段，與事件共用時鐘)
                                  └──────────────┘

┌──────────────────┐
│ ReplayController │  play / pause / nextStop / prevStop / seekTo / setSpeed
└──────────────────┘
┌──────────────────┐
│  OverlayLayer    │  Stop 暫停期的即時塗鴉（可選併入時間軸）
└──────────────────┘
```

**三個不變量（Invariant）：**
1. 同一組 events + 同一個 t ⇒ 同一個畫面（確定性重播）。
2. 座標全為正規化座標（0..1），與解析度無關 ⇒ 4K 投影不失真。
3. 音訊與事件共用同一個 pause-aware master clock ⇒ 聲音與筆跡永遠同步。

---

## 1. 資料結構（TypeScript Interfaces）

```typescript
/* ================= 1.1 基礎型別 ================= */

/** 正規化座標：以畫布寬高為 1。換裝置、換解析度不失真。 */
export interface StrokePoint {
  x: number;        // 0..1
  y: number;        // 0..1
  p?: number;       // pressure 0..1（Apple Pencil；無壓感裝置可省略）
  t: number;        // ms，相對於「本筆劃」起始時間
}

export type DrawTool = 'pen' | 'highlighter';
export type BgKind = 'white' | 'blackboard' | 'grid' | 'lines';

/* ================= 1.2 時間軸事件 =================
 * 所有改變畫布的動作都是事件。沒有「圖層快照」，只有事件流。
 */

interface BaseEvent {
  id: string;       // ulid / uuid，全域唯一（undo、擦除、同步都靠它）
  t: number;        // ms，在 slide 時間軸上的發生時間
  slide: number;    // 所屬 slide index
}

export interface StrokeEvent extends BaseEvent {
  kind: 'stroke';
  tool: DrawTool;
  color: string;              // '#rrggbb'
  width: number;              // 邏輯 px（以 1000px 畫布寬為基準，渲染時按比例縮放）
  points: StrokePoint[];
  dur: number;                // ms，書寫耗時（重播動畫的分母）
}

export interface EraseEvent extends BaseEvent {
  kind: 'erase';
  /** 被擦除的 stroke id 清單。
   *  關鍵設計：存「結果」（哪些 id 被刪），不存「過程」（橡皮擦路徑）。
   *  重播時不需要做碰撞運算，保證確定性，且事件極小。 */
  targetIds: string[];
}

export interface ClearEvent extends BaseEvent { kind: 'clear'; }

export interface BgEvent extends BaseEvent {
  kind: 'background';
  bg: BgKind;
}

export interface ImageEvent extends BaseEvent {
  kind: 'image';
  /** 指向 media store 的 key（blob ref / dataURL / 雲端 URL），事件本體不塞大圖 */
  imageRef: string | null;
}

export interface SlideEvent extends BaseEvent {
  kind: 'slide';              // slide 欄位即「切換到的目標頁」
}

export interface AddPageEvent extends BaseEvent {
  kind: 'addpage';
  /** page 欄位 = 插入位置 index */
  bg: BgKind;
  imageRef: string | null;    // PDF 整份匯入時，每頁的底圖直接帶在事件裡
}

export interface DelPageEvent extends BaseEvent {
  kind: 'delpage';            // page 欄位 = 被刪除的 index
}

export type TimelineEvent =
  | StrokeEvent
  | EraseEvent
  | ClearEvent
  | BgEvent
  | ImageEvent
  | SlideEvent
  | AddPageEvent
  | DelPageEvent;

/* ================= 1.3 Stop Marker（暫停標記點） ================= */

export interface StopMarker {
  id: string;
  t: number;                  // ms
  label?: string;             // 例如「列方程式」——老師備課時的語義錨點
}

/* ================= 1.4 Slide / Lesson ================= */

export interface Slide {
  id: string;
  bg: BgKind;
  imageRef: string | null;
  /** 錄製開始前已存在的筆跡（t=0 快照；重播/匯出時作為起點） */
  baseStrokes: StrokeEvent[];
  /** 依 t 排序的時間軸事件流 */
  events: TimelineEvent[];
  /** 依 t 排序的暫停標記 */
  stops: StopMarker[];
  /** slide 總長度 ms（= 最後一個事件時間 + 緩衝尾） */
  duration: number;
}

export interface AudioSegment {
  t0: number;                 // ms，對齊同一 master clock
  dur: number;
  ref: string;                // 指向 media store
}

export interface Lesson {
  id: string;
  title: string;
  created: number;
  slides: Slide[];
  /** 語音是 lesson 層級（跨 slide 連續），與事件共用時鐘 */
  audio: AudioSegment[];
}

/* ---------- 與提議 JSON 的相容 ---------- */
// 你給的 {"stop_after": true} 是很好的「書寫期速記法」：
// 錄製時允許在 StrokeEvent 上帶 stop_after，存檔前由 normalizeStops() 轉成正式 StopMarker。
export function normalizeStops(slide: Slide): StopMarker[] {
  const markers: StopMarker[] = [...slide.stops];
  for (const e of slide.events) {
    if (e.kind === 'stroke' && (e as any).stop_after) {
      markers.push({ id: 'm_' + e.id, t: e.t + e.dur, label: undefined });
      delete (e as any).stop_after;
    }
  }
  return markers.sort((a, b) => a.t - b.t);
}
```

---

## 2. 核心重播控制器（ReplayController）

```typescript
/* ================= 2.1 暫停感知時鐘 ================= */

export class PauseAwareClock {
  private base = 0;
  private t0 = 0;
  private running = false;
  constructor(private speed = 1) {}
  reset(t = 0) { this.base = t; this.running = false; }
  resume() { if (!this.running) { this.t0 = performance.now(); this.running = true; } }
  pause()  { if (this.running) { this.base = this.now(); this.running = false; } }
  now(): number {
    return this.running
      ? this.base + (performance.now() - this.t0) * this.speed
      : this.base;
  }
  setSpeed(s: number) {
    const t = this.now();      // 先結算當前時間
    this.speed = s;
    this.base = t;
    if (this.running) this.t0 = performance.now();
  }
}

/* ================= 2.2 渲染器介面（平台無關） ================= */

export interface Renderer {
  /** 無損重建：state = fold(events ≤ t)，不做動畫（seek 用） */
  rebuildUpTo(t: number): void;
  /** 套用單一事件（播放用，不含動畫） */
  applyEvent(e: TimelineEvent): void;
  /** 註冊一筆「動畫中」筆跡（重播時逐步畫出） */
  beginStrokeAnimation(e: StrokeEvent): void;
  /** 繪製一幀 */
  drawFrame(t: number): void;
  reset(): void;
}

export interface AudioEngine {
  /** 從 tMs 處恢復播放（seek / nextStop 後對齊用） */
  resumeAt(tMs: number): void;
  pause(): void;
}

/* ================= 2.3 ReplayController ================= */

export type ReplayState = 'idle' | 'playing' | 'paused' | 'at-marker' | 'ended';

export interface ReplayCallbacks {
  onTime?(t: number, duration: number): void;
  onMarker?(marker: StopMarker, index: number): void;
  onStateChange?(s: ReplayState): void;
  onEnd?(): void;
}

const EPS = 1; // ms，浮點比較寬容值

export class ReplayController {
  private clock = new PauseAwareClock();
  private cursor = 0;                    // 下一個「待套用」事件的 index
  private stopAt: number | null = null;  // nextStop 的目標時間
  private pendingMarker: StopMarker | null = null;
  private raf = 0;
  state: ReplayState = 'idle';

  constructor(
    private slide: Slide,
    private renderer: Renderer,
    private audio: AudioEngine,
    private cb: ReplayCallbacks = {},
  ) {}

  get time(): number { return this.clock.now(); }
  get duration(): number { return this.slide.duration; }

  /* ---------- 基本播放控制 ---------- */

  play(): void {
    if (this.state === 'playing') return;
    if (this.time >= this.duration - EPS) this.seekTo(0); // 播完後按播放 → 從頭
    this.stopAt = null;
    this.setState('playing');
    this.clock.resume();
    this.audio.resumeAt(this.time);
    this.loop();
  }

  pause(): void {
    if (this.state !== 'playing' && this.state !== 'at-marker') return;
    this.setState('paused');
    this.clock.pause();
    this.audio.pause();
    cancelAnimationFrame(this.raf);
  }

  /* ---------- Stop Marker：Doceri 的靈魂 ---------- */

  /**
   * 從當前位置「動畫重繪」到下一個 Stop Marker 並自動靜止。
   * 綁定：按鈕點擊 / 藍牙簡報筆下一頁 / 鍵盤 PageDown。
   */
  nextStop(): void {
    const t = this.time;
    const next = this.slide.stops.find(s => s.t > t + EPS);
    if (!next) { this.seekTo(this.duration); return; }  // 已是最後一段 → 跳結尾
    this.stopAt = next.t;
    this.pendingMarker = next;
    this.setState('playing');
    this.clock.resume();
    this.audio.resumeAt(t);
    this.loop();
  }

  /** 回到上一個 Marker（講錯可退回重講） */
  prevStop(): void {
    const t = this.time;
    const prev = [...this.slide.stops].reverse().find(s => s.t < t - EPS);
    this.seekTo(prev ? prev.t : 0);
  }

  /**
   * Overlay 併入歷史後呼叫：事件流被改寫（插入＋位移），cursor 重新二分定位，
   * 畫面用 rebuildUpTo 無損重建。
   */
  reindex(): void {
    const t = this.clock.now();
    const evs = this.slide.events;
    let lo = 0, hi = evs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (evs[mid].t <= t) lo = mid + 1; else hi = mid;
    }
    this.cursor = lo;
    this.renderer.rebuildUpTo(t);
    this.cb.onTime?.(t, this.duration);
  }

  /* ---------- 任意拖曳（無損回溯） ---------- */

  /**
   * Scrubbing：任意跳轉。因為是事件溯源，直接重建即可，
   * 不需要像影片那樣找 keyframe。
   */
  seekTo(tMs: number): void {
    const t = Math.max(0, Math.min(this.duration, tMs));
    const wasPlaying = this.state === 'playing';
    this.pause();                       // 先停（會清掉 stopAt）
    this.clock.reset(t);
    this.cursor = 0;
    this.renderer.rebuildUpTo(t);       // state = fold(events ≤ t)
    this.cb.onTime?.(t, this.duration);
    if (wasPlaying) this.play();
  }

  setSpeed(s: number): void { this.clock.setSpeed(s); }

  /* ---------- 主迴圈 ---------- */

  private loop = (): void => {
    if (this.state !== 'playing') return;
    const t = this.clock.now();
    const evs = this.slide.events;

    // 1) 套用到期的事件（事件本身不含動畫，動畫由 renderer 處理）
    while (this.cursor < evs.length && evs[this.cursor].t <= t) {
      const e = evs[this.cursor++];
      this.renderer.applyEvent(e);
      if (e.kind === 'stroke') this.renderer.beginStrokeAnimation(e);
    }

    // 2) 繪製一幀（含進行中筆跡的進度動畫）
    this.renderer.drawFrame(t);
    this.cb.onTime?.(t, this.duration);

    // 3) 到達 Stop Marker → 自動靜止（at-marker 狀態可接受 overlay 塗鴉）
    if (this.stopAt !== null && t >= this.stopAt) {
      const m = this.pendingMarker!;
      this.stopAt = null; this.pendingMarker = null;
      this.pause();
      this.setState('at-marker');
      this.cb.onMarker?.(m, this.slide.stops.indexOf(m));
      return;
    }

    // 4) 播完
    if (t >= this.duration) {
      this.pause();
      this.setState('ended');
      this.cb.onEnd?.();
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private setState(s: ReplayState) {
    this.state = s;
    this.cb.onStateChange?.(s);
  }
}

/* ================= 2.3b 鍵盤 / 簡報筆綁定 =================
 * Doceri 式上課操作：老師拿簡報筆或鍵盤就能逐段播放，不必碰螢幕。
 */
export const DEFAULT_KEYMAP = {
  nextStep: ['PageDown', 'ArrowRight'],  // → controller.nextStop()
  prevStep: ['PageUp', 'ArrowLeft'],     // → controller.prevStop()
  playPause: [' '],                      // → playing ? pause() : play()
} as const;

export function bindKeys(controller: ReplayController): () => void {
  const onKey = (e: KeyboardEvent) => {
    if ((DEFAULT_KEYMAP.nextStep as readonly string[]).includes(e.key)) controller.nextStop();
    else if ((DEFAULT_KEYMAP.prevStep as readonly string[]).includes(e.key)) controller.prevStop();
    else if ((DEFAULT_KEYMAP.playPause as readonly string[]).includes(e.key)) {
      e.preventDefault();
      controller.state === 'playing' ? controller.pause() : controller.play();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/* ================= 2.4 即時塗鴉層（Stop 暫停期的 Live Overlay） ================= */

export class OverlayLayer {
  private strokes: StrokeEvent[] = [];
  private pauseT = 0;        // 暫停點的 timeline 時間（markerT）
  private overlayT0 = 0;     // overlay 會話開始的 wall-clock
  constructor(private draw: (s: StrokeEvent) => void,
              private clearDraw: () => void) {}

  /** 進入 at-marker 時呼叫：overlay 時鐘從暫停點起算 */
  begin(pauseT: number) {
    this.pauseT = pauseT;
    this.overlayT0 = performance.now();
    this.strokes = [];
    this.clearDraw();
  }

  /** at-marker 狀態下老師的臨時筆跡：只畫在覆蓋層，不進時間軸 */
  addStroke(s: StrokeEvent) {
    s.t = this.pauseT + (performance.now() - this.overlayT0);
    this.strokes.push(s);
    this.draw(s);
  }
  discard() { this.strokes = []; this.clearDraw(); }

  /**
   * 「併入歷史」：overlay 佔用真實時間，暫停點之後的所有事件/標記整體後移 D。
   * D = 最後一筆 overlay 筆跡結束時間 − pauseT。
   * 呼叫端之後必須呼叫 controller.reindex() 重建 cursor。
   */
  commit(slide: Slide): void {
    if (!this.strokes.length) { this.clearDraw(); return; }
    const lastEnd = Math.max(...this.strokes.map(s => s.t + s.dur));
    const D = Math.max(0, lastEnd - this.pauseT);
    if (D > 0) {
      for (const e of slide.events) if (e.t > this.pauseT) e.t += D;
      for (const m of slide.stops) if (m.t > this.pauseT) m.t += D;
      slide.duration += D;
    }
    for (const s of this.strokes) {
      s.id = crypto.randomUUID();
      slide.events.push(s);   // t 已在 pauseT..pauseT+D 區間內，直接插入
    }
    slide.events.sort((a, b) => a.t - b.t);
    this.strokes = [];
    this.clearDraw();
  }
}
```

/* ================= 2.5 插入模式（Insert Mode，Doceri 式續錄） =================
 * 在時間軸任意 timelineT 處切開補寫，後方的事件/標記自動後移 D。
 * 時間換算：插入期間 SessionLog.now() 回傳 timelineT + (sessionNow - sessionT0)，
 * 因此 handle()/addStop() 無需改寫，事件自然落在 [timelineT, timelineT+D]。
 * D = max(插入事件 t + dur) - timelineT（內容時間，非牆鐘時間；思考停頓不計入）。
 * 結束時：t > timelineT 的舊事件/標記 += D，全陣列按 t 重排，cursor 重建。
 * 取消時：截斷插入期間的事件，無位移。
 */

---

## 3. 畫布渲染（HTML5 Canvas / rAF）

```typescript
/* 每幀 drawFrame(t) 的工作：
 *   1. 清畫布 → 畫背景（白板/黑板/方格/橫線）→ 畫底圖（PDF/圖片）
 *   2. 畫所有可見筆跡；「動畫中」的筆跡依進度只畫一部分
 *   3. 畫 overlay 層（即時塗鴉 / 雷射筆）
 *
 * 關鍵：Catmull-Rom 轉 Bézier，讓折線變平滑曲線。
 */

function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number; t: number }[],  // 像素座標 + 相對時間
  uptoT: number,                      // 只畫 t <= uptoT 的部分（動畫進度）
  style: { color: string; width: number; tool: DrawTool },
) {
  // 取時間範圍內的點，最後一段做線性插值 → 精確停在進度點
  const seg = clipByTime(pts, uptoT);
  if (seg.length === 0) return;
  if (seg.length === 1) { drawDot(ctx, seg[0], style); return; }

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  if (style.tool === 'highlighter') ctx.globalAlpha = 0.35; // 螢光筆半透明

  ctx.beginPath();
  ctx.moveTo(seg[0].x, seg[0].y);
  for (let i = 0; i < seg.length - 1; i++) {
    const p0 = seg[Math.max(0, i - 1)];
    const p1 = seg[i];
    const p2 = seg[i + 1];
    const p3 = seg[Math.min(seg.length - 1, i + 2)];
    // Catmull-Rom → Bézier 控制點
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** 依時間裁剪點列：取 t <= uptoT 的點，最後一段線性插值到精確進度點 */
declare function clipByTime(
  pts: { x: number; y: number; t: number }[],
  uptoT: number,
): { x: number; y: number }[];

/** 單點筆觸（點一下）畫成圓點 */
declare function drawDot(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  style: { color: string; width: number; tool: DrawTool },
): void;

/* iOS 原生對應：
 *   - 高筆刷延遲要求 → Metal 自繪（MTLRenderPipeline + 三角形帶描邊）
 *   - 一般需求 → CoreGraphics：UIBezierPath + CAShapeLayer（strokeEnd 做動畫）
 *   - 跨平台 Flutter → Skia/Impeller Path
 * 演算法（事件流、時鐘、marker）與平台無關，可共用。
 */
```

**效能備註：**
- 筆跡數 < 數千時，全量重繪每幀即可（現代裝置 60fps 無壓力）。
- 量大時：將「已完成」筆跡烘焙到離屏 canvas（bake layer），每幀只重畫 bake + 動畫中筆跡 + overlay。

---

## 4. 演講者模式（Dual-Screen）介面

```typescript
// Web：Presentation API / AirPlay； iOS：UIScreen.screens
interface PresenterMode {
  studentView: HTMLCanvasElement;   // 純畫布：無工具列、無時間軸、無 marker
  // teacherView 顯示：完整 UI + 時間軸滑桿 + Stop Marker 清單 + 下一段預覽
}
```
原則：**同一個 ReplayController，兩個 Renderer**（學生端 Renderer 只訂閱 drawFrame，不管 UI）。

---

## 5. 與「墨課」實作的對照（已驗證可跑的 JS 版）

| 規格模組 | 墨課 v3 現況（`~/workspace/moke/`） |
|---|---|
| Stroke Event Model | ✅ `js/board.js` 筆跡＋事件；`erase` 存 id 清單（同本文件 §1.2 設計） |
| PauseAwareClock | ✅ `js/lesson.js` LessonClock |
| play / pause / seekTo | ✅ `LessonPlayer`、`LessonEngine.seek()`（已單元測試） |
| Stop Marker / nextStop | ✅ v4 起：🚩 插入標記（自動編號）；重播 ⏭ 下一段播到 marker 自動靜止＋toast，⏮ 上一段退回；拖曳 seek 會取消待命中 marker；v8 起標記隨時可插（不限錄影中） |
| **全時時間軸（不錄影也記）** | ✅ v6：App 開啟即啟動 SessionLog 事件流；「儲存白板」存下整條時間軸，可重播/拖曳；載入課程後時間軸重新起算 |
| Live Overlay | ✅ v7：⏭ 播到 marker 自動停 → 臨時塗鴉（紅筆）；下一步自動消失，或 ✅ 併入時間軸（後續事件/標記/聲音整體後移）、🗑 丟棄 |
| 主白板時間軸（v8→v10→v12） | ✅ v8 起：不錄影也能在主白板上 ⏮/⏭/▶/拖曳重播整條 session 時間軸；v10 改為 Doceri 式**下滑抽屜**（頂部把手常駐，點按/下拉展開）；**v12 改為統一時間軸**：抽屜只是 HUD，不鎖書寫——`TimelineController` 直接操作主白板，playhead 在 liveEdge＝即時書寫，playhead < liveEdge＝回放；🚩 標記隨時可插；分享中進入會提醒改用螢幕鏡像 |
| 續錄插入 Insert Mode（v9→v12） | ✅ v9：時間軸模式中按 ✏️ 插入，在任意點切開補寫；SessionLog.insertBase 時間換算，後方事件/標記自動後移 D（內容時間）；**v12 改為自動插入**：回放中落筆即插入（`board.onDrawStart/onDrawEnd` 鉤子），獨立插入模式與 ✏️ 按鈕已移除；undo 經 engine.seek 自然重建 |
| 筆跡級時間軸編輯（v11→v12） | ✅ v11：抽屜 🛠️ 切換編輯面板——每筆筆跡為 strip 節點（點選＋🗑️ 刪除）；🚩 標記可拖曳移動（夾限相鄰標記、放開後重編號）；雙擊 strip 空白處補標記；**v12：刪除改為 `TLC.goTo(playhead)` 重建（保留 undo），標記操作直接改 SessionLog（TLC 即時讀取，無需重建播放器） |
| 雙擊瞬間呈現（v9） | ✅ v9：⏭ 點一下動畫播放到下一段，點兩下瞬間呈現完成畫面（LessonPlayer.revealNext）；播放器與主白板時間軸皆適用 |
| 講者視圖 Presenter Mode（v13） | ✅ v13：老師端 🎓 講者面板——Preview Next（離屏渲染下一段完成畫面縮圖）、段落 x/y、⏮⏭；學生端（guest）保持乾淨畫布並**時間軸跟隨**：evt 訊息帶 SessionLog 時間 t、snapshot 帶 basePages＋完整事件流＋stops＋主持端 playhead；主持端 TLC 導航（goto/play/pause）即時廣播，學生端 GuestFollower 用自己的 LessonEngine 重建相同畫面（含回放中插入跟隨、中途加入對齊、舊版相容降級為純即時） |
| 播放速度 UI / setSpeed | ✅ v7：0.5x/1x/1.5x/2x；時鐘先結算再換速，聲音用 playbackRate 同步，seek/重播保留速度 |
| 簡報筆 / 鍵盤控制 | ✅ v7：播放器開啟時 PageDown/→=下一段、PageUp/←=上一段、空白鍵=播放/暫停 |
| Multi-slide + per-slide timeline | ✅ 多頁，每頁獨立筆跡；事件帶 slide 欄位 |
| PDF / 圖片底圖層 | ✅ PDF.js 本機渲染為底圖 |
| 影片匯出（重播轉檔） | ✅ `exportLessonVideo()`（確定性重播 → MediaRecorder） |
| PDF 講義匯出（per stop） | ❌ 未實作 |
| Dual-screen 演講者視圖 | △ 有「分享投影」（同一畫面），非雙緩衝演講者模式 |

---

## 關鍵字速記

- **Event-Sourced Canvas** —— 事件溯源畫布：把畫筆當作事件流儲存，而非點陣圖
- **Step-by-step Stroke Replay** —— 筆畫逐步重繪
- **Breakpoint / Stop Marker Playback** —— 中斷點重播機制
- **Dual-screen Presentation Mode** —— 演講者模式：學生端只看畫布無 UI，講師端看時間軸與控制鈕

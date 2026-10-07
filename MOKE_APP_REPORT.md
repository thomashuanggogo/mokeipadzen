# 墨課（Moke）App 完整技術報告

> 版本：v95（2026-10-06）
> 目的：讓另一個 AI 讀完就能從零重建這個 App
> 專案：iPad 教學白板，Doceri 替代品

---

## 1. 專案概述

### 1.1 這是什麼

「墨課」是老師在 iPad 上用的電子白板 App，替代已退役的 Doceri（SP Controls，2022 年下架）。

核心差異（vs 一般白板 App）：
- **不是錄影，是向量筆跡時間軸**。每筆畫都有時間碼，可重播、暫停、跳段。
- **每頁獨立時間軸**，每頁從 00:00 開始。
- **Stop Marker（🚩）**：播放到標記自動停止，給學生抄筆記，老師按 ▶ 才繼續。

### 1.2 技術選型

| 項目 | 選擇 | 原因 |
|---|---|---|
| 平台 | 純網頁（HTML/CSS/JS） | 跨 iPad / Android / 桌面，不用上架 |
| 筆跡 | Canvas 2D + PointerEvent | Apple Pencil 用 `pointerType === 'pen'` 辨識 |
| 架構 | Event-Sourced | 畫布 = 事件流的折疊，`state = fold(events)` |
| 儲存 | IndexedDB（本機） | 課程、筆跡、圖片全存本機，不上傳 |
| 離線 | Service Worker + PWA | 可加到主畫面，離線可用 |
| 部署 | Cloudflare Workers | 靜態託管 |

### 1.3 檔案結構

```
moke/
├── index.html          # 主頁面（含所有 modal）
├── manifest.json       # PWA 設定
├── sw.js               # Service Worker
├── css/
│   └── style.css       # 全部樣式
├── js/
│   ├── app.js          # 主邏輯（UI、時間軸控制、事件綁定）~1400 行
│   ├── board.js        # 畫布引擎（筆跡、橡皮擦、圖形、縮放）~900 行
│   ├── lesson.js       # 課程引擎（事件重播、seek、LessonClock）
│   └── share.js        # 分享/投影（WebRTC，可選）
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
└── ENGINE_SPEC.md      # 引擎架構設計文件（TypeScript 介面）
```

---

## 2. 設計哲學（必讀）

### 2.1 Event-Sourced Canvas

畫布不是一張圖，而是一條事件流。所有狀態都可以從事件重建：

```
state = fold(events)
```

三個不變量：
1. 同一組 events + 同一個 t ⇒ 同一個畫面（確定性重播）
2. 座標全為正規化座標（0..1），與解析度無關
3. 時間軸與事件共用同一個時鐘

### 2.2 時間軸哲學（來自真實教學場景）

1. **犯錯值得記錄**：橡皮擦是時間軸事件（`erase`），重播會看到字寫出來再被擦掉。老師犯錯的過程也是教學。
2. **復原 ≠ 橡皮擦**：↩️ 復原用 `unadd`（那筆沒發生過，重播看不到）；🧽 橡皮擦用 `erase`（發生過再擦掉，重播看得到）。
3. **下拉時間軸 = 只能回放**：時間軸打開時鎖定書寫，只能拉時間軸、按播放。收起才回到即時書寫。
4. **每頁獨立**：每頁有自己的 `tl{events, stops, clock}`，從 00:00 開始。換頁切換整組，無副作用。

### 2.3 iPad 優先

- 所有 UI 決策以 iPad 橫屏為準，桌面「能用就好」。
- 按鈕用純文字元號，不用 emoji（iOS 會渲染成彩色圖案，很醜）。
- 工具列可橫向滑動，不硬擠。

---

## 3. 資料結構

### 3.1 Stroke（筆跡）

```javascript
{
  id: number,           // 唯一 ID（_strokeSeq 遞增）
  tool: 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'rtriangle' | 'parallelogram' | 'axes' | 'text' | 'compass' | 'laser',
  color: string,        // CSS 顏色
  width: number,        // 線寬（px）
  pts: [{               // 點陣列
    x: number,          // 正規化 0..1
    y: number,          // 正規化 0..1
    p: number,          // 壓感 0..1（可選）
    t: number           // ms，相對本筆起始
  }],
  t0: number,           // 開始時間（wall clock）
  dur: number,          // 持續時間 ms
  tlT: number,          // 時間軸時間（該頁相對時間，從 0 開始）
  page: number          // 所屬頁索引
}
```

### 3.2 Page（頁面）

```javascript
{
  strokes: Stroke[],    // 本頁筆跡
  undo: Stroke[],       // 復原堆疊
  redo: Stroke[],       // 重做堆疊
  bg: string,           // 背景：'white' | 'blackboard' | 'grid' | 'lines'
  image: string | null, // 底圖 dataURL（壓縮過）
  imgS: number,         // 底圖縮放（預設 1）
  imgX: number,         // 底圖 X 位移
  imgY: number,         // 底圖 Y 位移
  _imgEl: Image | null, // 快取的 Image 物件（不存檔）
  tl: {                 // 本頁時間軸（v47+）
    events: TimelineEvent[],
    stops: StopMarker[],
    clock: LessonClock | null,
    unadded: []         // 暫存（未用）
  }
}
```

### 3.3 TimelineEvent（時間軸事件）

```javascript
{
  t: number,            // ms，該頁相對時間
  evt: string,          // 事件類型
  data: object          // 事件資料
}
```

事件類型：

| evt | data | 說明 |
|---|---|---|
| `add` | `{page, stroke}` | 新增筆跡 |
| `erase` | `{page, ids[]}` | 橡皮擦擦除（v94+，重播可見） |
| `unadd` | `{page, id}` 或 `{page, ids[]}` | 復原/刪除（重播不可見） |
| `readd` | `{page, stroke}` | 重做 |
| `clear` | `{page}` | 清除本頁 |
| `bg` | `{page, bg}` | 切換背景 |
| `image` | `{page, dataUrl}` | 設定/清除底圖 |
| `addpage` | `{page, bg, image}` | 新增頁面 |
| `delpage` | `{page}` | 刪除頁面 |
| `page` | `{page}` | 切換頁面 |

### 3.4 StopMarker（🚩 標記）

```javascript
{
  id: number,
  strokeId: number,     // 綁定的筆跡 ID
  label: string          // 標記名稱（可選）
}
```

播放到標記的時間自動暫停。

### 3.5 Lesson（課程檔，JSON 匯出格式）

```javascript
{
  id: string,
  title: string,
  created: number,       // timestamp
  duration: number,
  startPage: number,
  basePages: Page[],     // 頁面陣列（含 tl）
  events: TimelineEvent[],
  stops: StopMarker[],
  audio: [],             // 保留（未用）
  meta: {}
}
```

---

## 4. UI 佈局

### 4.1 整體結構

```
┌─────────────────────────────────────────┐
│ #topbar（深色，可橫滑）                    │
│ [🖌️墨課 v95] [🚩標記] [播放控制] [頁碼] [工具]│
├─────────────────────────────────────────┤
│ #toolbar（筆刷工具列，淺色）               │
│ [筆][螢光筆][橡皮擦][圖形]...[顏色]...     │
│ [粗細滑桿] [↩️][↪️]                       │
├─────────────────────────────────────────┤
│ [下拉展開時間軸]  ← 把手                   │
├─────────────────────────────────────────┤
│                                         │
│           #board（畫布）                 │
│                                         │
├─────────────────────────────────────────┤
│ 右下浮動：[↩️][↪️]                        │
└─────────────────────────────────────────┘
```

### 4.2 #topbar 詳細（由左到右）

**品牌區：**
- `🖌️ 墨課` + 版本號（例：`v95`）
- 點 logo → 開使用說明 modal
- 點版本號 → 手動檢查 SW 更新（`stopPropagation` 避免開說明）

**#rec-controls（播放控制區）：**
| 按鈕 | 符號 | 顏色 | 功能 |
|---|---|---|---|
| btn-mark | 🚩 標記 | 深色 | 在 playhead 位置插入 Stop Marker |
| btn-tl-start | ◀◀ | 藍色 #1971c2 | 跳到最前 |
| btn-tl-prev | ◀◀ | 深色 | 上一個標記 |
| btn-tl-prev-stroke | ◀ | 深色 | 上一筆 |
| btn-tl-play | ▶ / ❚❚ | 綠色 #2f9e44 | 播放/暫停 |
| btn-tl-next-stroke | ▶ | 深色 | 下一筆 |
| btn-tl-next | ▶▶ | 深色 | 下一個標記 |
| btn-tl-end | ▶▶ | 藍色 #1971c2 | 跳到最後 |
| btn-tl-edit | ✎ | 深色 | 筆跡級時間軸編輯模式 |
| tl-time | `00:00 / 00:00` | — | 當前/總時長 |
| tl-speed | ⏱ + 滑桿 + `1x` | — | 播放速度 0.5x–3x |
| btn-tl-exit | ✕ | 深色 | 回到即時（退出回放） |

**注意：** 全部用純文字元號，不用 emoji。⏮⏭🛠️⏸ 在 iOS 會變彩色，很醜。

**.top-actions（頁面/工具區）：**
| 按鈕 | 標籤 | 功能 |
|---|---|---|
| btn-page-prev | ◀ | 上一頁 |
| page-label | `1 / 1` | 頁碼 |
| page-hint | 💡≤20頁 | 頁數建議（tooltip 說明） |
| btn-page-next | ▶ | 下一頁 |
| btn-page-add | ＋ | 新增頁面 |
| btn-page-del | 🗑️ | 刪除本頁（含確認框） |
| btn-bg | 🎨 背景 | 切換背景（白/黑板/格線/橫線） |
| btn-image | 🖼️ 圖片 | 選圖片設為底圖 |
| btn-img-adjust | 🖼️ 調整底圖 | 重新進入底圖調整模式（平時隱藏） |
| btn-img-done | ✅ 完成 | 完成底圖調整（調整模式才顯示） |
| btn-finger | ✋ / ✋🚫 | 手指書寫開關（預設關，防手掌誤觸） |
| btn-clear | 🧹 清除 | 清除本頁筆跡＋標記（保留底圖，含確認框） |
| btn-reset-view | ⤢ 100% | 重置縮放回到 100% |
| btn-lessons | 📂 課程 | 開課程管理 modal |

### 4.3 #toolbar（筆刷工具列）

- 工具：筆、螢光筆、橡皮擦、直線、箭頭、矩形、橢圓、直角三角形、平行四邊形、座標軸、文字、圓規、雷射筆
- 顏色：黑、白、紅、藍、綠、橘、紫、青（圓形色票）
- 粗細滑桿
- ↩️ 復原、↪️ 重做

### 4.4 時間軸抽屜

- 把手：`下拉展開時間軸` / `上滑收起時間軸`
- 展開後顯示：時間軸拉桿（可拖曳）、筆跡條（每筆一段）、標記點
- 位置：筆刷工具箱下方，不遮住工具箱
- 寬度 88%（最大 900px），圓角，半透明+模糊
- **打開時鎖定書寫**（`board.lockDraw = true`），只能操作時間軸

### 4.5 Modal 清單

| ID | 標題 | 用途 |
|---|---|---|
| modal-help | 🖌️ 墨課使用說明 | 點 logo 開，新手指南 |
| modal-lessons | 📂 課程檔案 | 存檔、載入、匯出/匯入 JSON |
| modal-share | 📡 分享投影 | WebRTC 分享（可選功能） |

---

## 5. 核心機制詳解

### 5.1 筆跡輸入流程

```
PointerEvent (pen/touch/mouse)
  → board._down(e)
    → 檢查 lockDraw（時間軸開著就擋掉）
    → 檢查 pointerType（手指書寫開關）
    → 檢查 imgAdjust（底圖調整模式）
    → 根據 tool 分派：
       - pen/highlighter → _beginStroke()
       - eraser → eraseAt() + _erasing = true
       - shapes → _beginShapeDrag()
       - text → onTextTap()
  → pointermove → _move(e)
    → getCoalescedEvents() 取中間點（降低延遲）
    → 只繪新增線段（不重繪整頁）
  → pointerup → _up(e)
    → 完成筆跡，_emit('add', {stroke})
```

**降低延遲技巧：**
- `getCoalescedEvents()` 取 Apple Pencil 中間點
- Canvas 用 `{ desynchronized: true }` 跳過合成器同步
- 只畫新增線段，不重繪整頁

**手指/Pencil 分離：**
- `e.pointerType === 'pen'` → Apple Pencil
- `e.pointerType === 'touch'` → 手指/手掌
- 預設 `moke-fingerDraw = false`：只有筆能寫
- 按 ✋ 切換，存 localStorage

### 5.2 時間軸時鐘

每頁第一次落筆時啟動 `LessonClock`：
```javascript
if (!tl.clock) {
  tl.clock = new LessonClock();
  tl.clock.start();
}
```

- 時間從 00:00 開始（該頁相對時間）
- `tlT` = 每筆的時間戳
- 換頁時切換整組 `tl` 物件

### 5.3 播放機制

`TimelineController`（在 app.js 內定義）：

```javascript
TLC.activate()    // 啟用時間軸（鎖書寫）
TLC.deactivate()  // 停用（解鎖）
TLC.play()        // 從 playhead 開始播
TLC.pause()       // 暫停
TLC.goTo(t)       // 跳到指定時間
TLC.nextStop()    // 下一個標記
TLC.prevStop()    // 上一個標記
TLC.setSpeed(s)   // 0.5x–3x
```

**Stop Marker 邏輯：**
播放時檢查下一個 marker 的時間，`playhead` 到達時自動 `pause()`，按 ▶ 才繼續。

**重播渲染：**
`LessonEngine.seek(t)` 重放 `events[0..t]`，用 `board.applyRemote(evt, data)` 重建畫面。

### 5.4 橡皮擦 vs 復原

| 操作 | 事件 | 重播效果 | 說明 |
|---|---|---|---|
| 🧽 橡皮擦 | `erase` | 字出現 → 被擦掉 → 消失 | 錯誤過程值得記錄 |
| ↩️ 復原 | `unadd` | 那筆直接不存在 | 取消動作 |
| ↪️ 重做 | `readd` | 恢復 | — |
| 🧹 清除 | `clear` + 重置 tl | 整頁清空，時間歸零 | 保留底圖 |

### 5.5 底圖（圖片）流程

1. 按 🖼️ 圖片 → 選檔
2. 顯示「🖼️ 圖片處理中…」（大圖解碼+壓縮）
3. 自動進入調整模式：
   - 雙指縮放 → 調大小（`imgS`）
   - 單指拖曳 → 移位置（`imgX`, `imgY`）
   - 按 ✅ 完成
4. 每頁存 `image`（dataURL）、`imgS`、`imgX`、`imgY`
5. 按「🖼️ 調整底圖」可重新調整
6. 🧹 清除保留底圖；🗑️ 刪到剩最後一頁才清底圖

### 5.6 縮放/平移

- 雙指捏合：0.5x–5x 縮放
- 雙指拖曳：平移
- 雙指輕觸（快速點兩下）：復原（保留手勢）
- ⤢ 100%：重置回 100%

---

## 6. 儲存

### 6.1 IndexedDB 結構

- **課程**：整份 `Lesson` JSON（含所有頁面、筆跡、時間軸、底圖）
- **自動儲存**：操作後 debounce 寫入
- **容量**：筆跡座標取小數 4 位，10 分鐘課程約 2.5–3MB

### 6.2 備份

- 📂 課程 → ⬇️ 匯出 JSON（下載 `.json`）
- 📂 課程 → ⬆️ 匯入 JSON（還原）
- ⚠️ Safari 清除網站資料會遺失，務必備份

### 6.3 匯出

- 📷：本頁存 PNG（`canvas.toDataURL`）
- 📄：全部頁面匯出 PDF（jsPDF，每頁一張圖）

---

## 7. PWA / Service Worker

### 7.1 manifest.json

```json
{
  "name": "墨課",
  "short_name": "墨課",
  "display": "standalone",
  "orientation": "landscape",
  "icons": [...]
}
```

### 7.2 sw.js 關鍵設計

```javascript
const CACHE = 'moke-v95';  // 版本號隨 App 更新

// 安裝：快取所有靜態檔
// 啟用：清掉舊版快取

// 請求策略：
if (req.mode === 'navigate') {
  // 導航：network-first（先抓網路，離線才用快取）
  e.respondWith(
    fetch(req).catch(() => caches.match('index.html'))
  );
  return;
}
// 其他：cache-first
```

**兩個關鍵修復（血淚史）：**
1. `updateViaCache: 'none'` — 註冊 SW 時加上，否則瀏覽器用快取的舊 `sw.js`，永遠看不到新版。
2. 導航 network-first — 壞掉的快取 `index.html` 會卡死頁面，先抓網路才安全。

### 7.3 更新流程

1. 部署新版 → `sw.js` 的 `CACHE` 版本號+1
2. 用戶開 App → SW 檢測到新 `sw.js` → 自動下載安裝
3. 下次開 App → 新版生效
4. 用戶也可點版本號手動觸發 `registration.update()`

---

## 8. 重要設計決策記錄

| 決策 | 原因 |
|---|---|
| 移除 PDF 匯入 | 51 頁 PDF 會破圖；老師實務上轉圖片一張張匯入；Doceri 本來就沒這功能 |
| 移除錄影/錄音 | iPad 內建螢幕錄影就夠 |
| 每頁獨立時間軸 | Doceri 式，換頁無副作用 |
| 橡皮擦是時間軸事件 | 犯錯過程值得記錄 |
| 下拉時間軸鎖書寫 | 避免誤觸，只能回放 |
| 按鈕純文字不用 emoji | iOS emoji 渲染醜 |
| iPad 優先 | 桌面能用就好 |

---

## 9. 已知限制

1. **延遲**：網頁版追不上 GoodNotes 原生 App（無預測觸控、無 Metal）。
2. **頁數**：建議 ≤20 頁，太多 iPad 會慢（非硬限制）。
3. **Safari 清資料**：會遺失課程，務必 JSON 備份。
4. **觸控筆**：只認 `pointerType === 'pen'`，非 Apple Pencil 的筆可能被當手指。

---

## 10. 版本歷史（v80–v95 精選）

| 版本 | 變更 |
|---|---|
| v80 | 導航改 network-first，修 SW 卡死 |
| v81 | 點 logo 開使用說明 modal |
| v82 | 頂部工具列可橫滑 |
| v83 | 播放按鈕去 emoji 化、改深色 |
| v84 | 播放按鈕縮小（iPad 優先） |
| v85 | 跳轉符號改雙三角 |
| v86 | 跳轉鍵改藍色（顏色區別） |
| v87 | 後排按鈕橫排不換行 |
| v88 | ⤢ 加上「100%」文字 |
| v89 | 移除講者視圖 |
| v90 | 移除重複的清除按鈕 |
| v91 | 修時間軸收不回去（schedulePreview 漏刪） |
| v92 | 修時間軸沒鎖書寫（ensureTLC 漏鎖） |
| v93 | 清除後時間歸零 |
| v94 | 橡皮擦列入時間軸（erase 事件） |
| v95 | 擦光也能開時間軸（查 events 不只看 strokes） |

---

## 11. 重建檢查清單

另一個 AI 從零重建時，依序實作：

- [ ] 1. 基本畫布 + PointerEvent 筆跡輸入
- [ ] 2. 筆跡資料結構（Stroke, Page）+ 正規化座標
- [ ] 3. 工具列（筆、橡皮擦、顏色、粗細）
- [ ] 4. Event-Sourced：`_emit` + `tl.events`
- [ ] 5. LessonClock：每頁獨立時鐘，從 00:00 開始
- [ ] 6. TimelineController：play/pause/seek/goTo
- [ ] 7. Stop Marker：播放到標記自動停
- [ ] 8. 時間軸抽屜 UI + 下拉鎖書寫
- [ ] 9. 橡皮擦發 `erase` 事件（不是 `unadd`）
- [ ] 10. 復原/重做（`unadd`/`readd`）
- [ ] 11. 多頁管理（新增/刪除/切換）
- [ ] 12. 底圖：圖片匯入 + 雙指調整 + 每頁保存
- [ ] 13. IndexedDB 自動存檔 + JSON 匯出/匯入
- [ ] 14. PNG/PDF 匯出
- [ ] 15. Service Worker（network-first + updateViaCache:none）
- [ ] 16. PWA manifest
- [ ] 17. 手指/Pencil 分離（pointerType）
- [ ] 18. 使用說明 modal
- [ ] 19. iPad 優化：按鈕尺寸、橫滑工具列、純文字元號

---

*報告結束。實作細節見 `ENGINE_SPEC.md`（TypeScript 介面）與原始碼。*

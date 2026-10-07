/* 墨課 · 即時分享 share.js
 * iPad（主持端）書寫 → 透過 WebRTC DataChannel 即時同步到電子白板（觀看端）。
 * 使用 PeerJS 免費公開節點做信令，不需自架伺服器、不需帳號。
 * 電子白板只需用瀏覽器開啟分享連結（或掃 QR Code），免安裝。
 */
'use strict';

const Share = {
  PREFIX: 'moke-',
  mode: 'idle',           // idle | host | guest
  peer: null,
  code: null,
  conns: [],              // host 端的觀看者連線
  guestConn: null,
  guestCode: null,
  onHostViewers: null,    // (n) => 觀看人數更新
  onGuestStatus: null,    // (msg) => 觀看端狀態
  _retryTimer: null,

  /* ---------- 工具 ---------- */
  genCode() {
    const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
    return s;
  },
  shareUrl(code) {
    return location.origin + location.pathname + '?room=' + code;
  },
  _peerReady() {
    if (typeof Peer === 'undefined') {
      alert('分享功能載入失敗（PeerJS），請檢查網路後重整頁面。');
      return false;
    }
    return true;
  },

  /* ================= 主持端（iPad 書寫） ================= */
  startHost(board) {
    if (!this._peerReady()) return null;
    this.stop();
    this.code = this.genCode();
    this.mode = 'host';
    this._board = board;
    const peer = this.peer = new Peer(this.PREFIX + this.code, { debug: 0 });
    peer.on('open', () => { if (this.onHostViewers) this.onHostViewers(0); });
    peer.on('connection', conn => {
      conn.on('open', () => {
        this.conns.push(conn);
        conn.send(this._snapshot(board));
        if (this.onHostViewers) this.onHostViewers(this.conns.length);
      });
      conn.on('close', () => this._dropConn(conn));
      conn.on('error', () => this._dropConn(conn));
    });
    peer.on('error', err => {
      console.warn('[share] peer error', err);
      if (err && err.type === 'unavailable-id') {
        // 代碼碰撞，換一個重試
        this.code = this.genCode();
        this.startHost(board);
      }
    });
    return this.code;
  },

  _snapshot(board) {
    return {
      type: 'snapshot',
      pageIndex: board.pageIndex,
      pages: board.pages.map(p => ({ bg: p.bg, image: p.image, strokes: p.strokes })),
      // 講者視圖：學生端時間軸跟隨需要的事件流（v13）
      basePages: SessionLog.basePages,
      events: SessionLog.events,
      stops: SessionLog.stops,
      tlPlayhead: (typeof this._snapshotExtra === 'function') ? this._snapshotExtra().tlPlayhead : null
    };
  },

  _dropConn(conn) {
    this.conns = this.conns.filter(c => c !== conn);
    if (this.onHostViewers) this.onHostViewers(this.conns.length);
  },

  // 由 app.js 在 board.onEvent 轉發呼叫（t = SessionLog 時間，供學生端時間軸跟隨）
  broadcast(evtType, data, t) {
    if (this.mode !== 'host' || !this.conns.length) return;
    const msg = { type: 'evt', evt: evtType, data, t };
    for (const c of this.conns) {
      try { if (c.open) c.send(msg); } catch (e) { /* ignore */ }
    }
  },

  // 講者視圖：主持端時間軸導航（goto/play/pause）廣播給學生端跟隨（v13）
  broadcastTl(nav) {
    if (this.mode !== 'host' || !this.conns.length) return;
    const msg = Object.assign({ type: 'tl' }, nav);
    for (const c of this.conns) {
      try { if (c.open) c.send(msg); } catch (e) { /* ignore */ }
    }
  },

  /* ================= 觀看端（電子白板） ================= */
  joinGuest(code, board) {
    if (!this._peerReady()) return;
    this.stop();
    this.mode = 'guest';
    this.guestCode = code.trim().toUpperCase();
    this._board = board;
    const peer = this.peer = new Peer({ debug: 0 });
    peer.on('open', () => this._guestConnect());
    peer.on('error', err => console.warn('[share] guest peer error', err));
    if (this.onGuestStatus) this.onGuestStatus('連線中…');
  },

  _guestConnect() {
    if (this.mode !== 'guest') return;
    if (this.onGuestStatus) this.onGuestStatus('連線中…（房間 ' + this.guestCode + '）');
    const conn = this.guestConn = this.peer.connect(this.PREFIX + this.guestCode, { reliable: true });
    conn.on('open', () => {
      if (this.onGuestStatus) this.onGuestStatus('已連線，等待老師分享…');
      clearInterval(this._retryTimer); this._retryTimer = null;
    });
    conn.on('data', msg => this._onGuestData(msg));
    conn.on('close', () => this._guestRetry());
    conn.on('error', () => this._guestRetry());
    // 若 8 秒沒連上，視為房間不存在或網路問題
    setTimeout(() => {
      if (this.mode === 'guest' && this.guestConn === conn && !conn.open) this._guestRetry();
    }, 8000);
  },

  _guestRetry() {
    if (this.mode !== 'guest') return;
    if (this.onGuestStatus) this.onGuestStatus('連線中斷，重新連線中…');
    if (!this._retryTimer) {
      this._guestRetryNow();
      this._retryTimer = setInterval(() => this._guestRetryNow(), 5000);
    }
  },
  _guestRetryNow() {
    if (this.mode !== 'guest' || !this.peer || this.peer.destroyed) return;
    try { this._guestConnect(); } catch (e) { /* ignore */ }
  },

  _onGuestData(msg) {
    const board = this._board;
    if (!board || !msg) return;
    if (msg.type === 'snapshot') {
      board.pages = msg.pages.map(p => ({ bg: p.bg, image: null, strokes: p.strokes || [], undo: [], redo: [] }));
      // 圖片另外載入
      msg.pages.forEach((p, i) => {
        if (p.image) {
          board.pages[i].image = p.image;
          board.ensureImage(board.pages[i], () => { if (board.pageIndex === i) board.render(); });
        }
      });
      board.pageIndex = Math.min(msg.pageIndex || 0, board.pages.length - 1);
      board.render();
      if (this.onGuestStatus) this.onGuestStatus('直播中 · 房間 ' + this.guestCode);
      if (this.onGuestSnapshot) this.onGuestSnapshot(msg);
      return;
    }
    if (msg.type === 'evt') {
      // v13：有 follower 時由它決定是否套用（時間軸跟隨）；否則直接套用（相容舊版）
      if (this.onGuestEvt) this.onGuestEvt(msg);
      else this._applyRemote(board, msg.evt, msg.data);
      return;
    }
    if (msg.type === 'tl') {
      if (this.onGuestTl) this.onGuestTl(msg);
      return;
    }
  },

  _applyRemote(board, evt, data) {
    board.applyRemote(evt, data);
  },

  /* ================= 學生端時間軸跟隨器（v13 講者視圖） =================
   * 主持端的時間軸導航（goto/play/pause）即時同步過來；
   * 事件流自帶 SessionLog 時間 t，學生端用自己的 LessonEngine 重建相同畫面。
   * 學生端永遠是乾淨畫布（guest-mode CSS 已隱藏所有工具）。
   */
  createGuestFollower(board) {
    const GF = {
      events: [], basePages: null,
      engine: null, clock: new LessonClock(),
      playhead: 0, liveEdge: 0, following: true,
      playing: false, speed: 1, stopAt: null, _raf: 0,
      initFromSnapshot(msg) {
        if (!msg.basePages || !msg.events) return;  // 舊版主持端：僅即時跟隨
        this.basePages = msg.basePages;
        this.events = msg.events.map(e => ({ t: e.t, evt: e.evt, data: e.data }));
        this.events.sort((a, b) => a.t - b.t);
        this.liveEdge = this.events.length ? this.events[this.events.length - 1].t : 0;
        this.playhead = this.liveEdge;
        this.following = true;
        this.engine = new LessonEngine(board, {
          id: 'GF', title: '', created: Date.now(), duration: 0, startPage: 0,
          basePages: this.basePages, events: this.events, stops: [], audio: [], meta: {}
        });
        this.engine.seek(this.playhead);
        // 主持端正在回放：學生直接跟到該位置
        if (typeof msg.tlPlayhead === 'number' && msg.tlPlayhead < this.liveEdge - 50) {
          this.playhead = Math.max(0, msg.tlPlayhead);
          this.following = false;
          this.engine.seek(this.playhead);
        }
      },
      onEvt(t, evt, data) {
        if (!this.engine) { board.applyRemote(evt, data); return; }  // 舊版主持端 fallback
        const evts = this.events;
        // v25：復原/重做＝同步增刪時間軸紀錄（不當新事件），再重建畫布；v26：ids 陣列
        if ((evt === 'unadd' || evt === 'readd') && data && (data.id || data.ids)) {
          if (evt === 'unadd') {
            const ids = new Set(data.ids || [data.id]);
            for (let i = evts.length - 1; i >= 0; i--) {
              const ce = evts[i];
              if (ce.evt === 'add' && ce.data && ce.data.stroke && ids.has(ce.data.stroke.id)) {
                (this._unadded = this._unadded || []).push(ce);
                evts.splice(i, 1);
              }
            }
          } else {
            const ua = this._unadded || [];
            const k = ua.findIndex(e => e.data && e.data.stroke && e.data.stroke.id === data.id);
            if (k >= 0) {
              const ev = ua.splice(k, 1)[0];
              let j = evts.findIndex(e => e.t > ev.t);
              if (j < 0) j = evts.length;
              evts.splice(j, 0, ev);
            } else if (data.stroke) {
              const ev = { t: typeof data.t === 'number' ? data.t : this.liveEdge, evt: 'add', data: { page: data.page, stroke: data.stroke } };
              let j = evts.findIndex(e => e.t > ev.t);
              if (j < 0) j = evts.length;
              evts.splice(j, 0, ev);
            }
          }
          this.liveEdge = evts.length ? evts[evts.length - 1].t : 0;
          if (this.following) this.playhead = this.liveEdge;
          this.engine.seek(this.playhead);
          return;
        }
        const e = { t, evt, data };
        let needResync = false;
        if (typeof t !== 'number') t = this.liveEdge;
        if (!evts.length || t >= evts[evts.length - 1].t) evts.push(e);
        else { evts.push(e); evts.sort((a, b) => a.t - b.t); needResync = true; }
        if (t > this.liveEdge) this.liveEdge = t;
        if (this.playing) return;  // 播放中不會有新事件（主持端落筆前會先 pause）
        if (needResync) { this.engine.seek(this.playhead); return; }
        if (this.following) {
          board.applyRemote(evt, data);
          this.playhead = this.liveEdge;
        } else if (t <= this.playhead + 200) {
          board.applyRemote(evt, data);  // 回放中插入：直接呈現
        }
      },
      onTl(m) {
        if (!this.engine || !m) return;
        if (m.action === 'goto') {
          this._stopPlay();
          this.playhead = Math.max(0, Math.min(this.liveEdge, m.t));
          this.following = this.playhead >= this.liveEdge - 50;
          this.engine.seek(this.playhead);
        } else if (m.action === 'play') {
          this._stopPlay();
          this.following = false;
          this.playhead = Math.max(0, Math.min(this.liveEdge, m.from));
          this.engine.seek(this.playhead);
          this.speed = m.speed > 0 ? m.speed : 1;
          this.stopAt = Math.min(this.liveEdge, m.stopAt);
          this.clock.reset(); this.clock.setSpeed(this.speed); this.clock.base = this.playhead;
          this.clock.resume();
          this.playing = true;
          this._loop();
        } else if (m.action === 'pause') {
          this._stopPlay();
          if (typeof m.t === 'number') {
            this.playhead = Math.max(0, Math.min(this.liveEdge, m.t));
            this.engine.seek(this.playhead);
          }
          this.following = this.playhead >= this.liveEdge - 50;
        }
      },
      _stopPlay() {
        this.playing = false;
        cancelAnimationFrame(this._raf);
        try { this.clock.pause(); } catch (e) {}
      },
      _loop: null
    };
    GF._loop = () => {
      if (!GF.playing) return;
      const now = GF.clock.now();
      if ((GF.stopAt !== null && now >= GF.stopAt) || now >= GF.liveEdge) {
        GF.playhead = GF.stopAt !== null ? Math.min(GF.stopAt, GF.liveEdge) : GF.liveEdge;
        GF.engine.seek(GF.playhead);
        GF._stopPlay();
        GF.following = GF.playhead >= GF.liveEdge - 50;
        return;
      }
      GF.playhead = now;
      GF.engine.update(now);
      GF._raf = requestAnimationFrame(GF._loop);
    };
    return GF;
  },

  /* ---------- 停止 ---------- */
  stop() {
    this.mode = 'idle';
    clearInterval(this._retryTimer); this._retryTimer = null;
    try { this.conns.forEach(c => c.close()); } catch (e) {}
    this.conns = [];
    try { this.guestConn && this.guestConn.close(); } catch (e) {}
    this.guestConn = null;
    try { this.peer && this.peer.destroy(); } catch (e) {}
    this.peer = null;
    this.code = null; this.guestCode = null;
  }
};

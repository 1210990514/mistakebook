/* app.js — Vue 3 应用主体 */
(function () {
  'use strict';
  const { createApp } = Vue;
  const db = DB.db;

  const DEFAULT_SUBJECTS = ['英语', '西综', '政治'];

  createApp({
    data() {
      return {
        tab: 'add',
        toast: '',
        // ---- 添加页 ----
        draft: { photos: [], subject: '', tagsText: '', note: '', text: '' },
        newSubject: '',
        saving: false,
        autoOcr: true,
        // ---- 列表页 ----
        items: [],
        filterSubject: '',
        filterStatus: '',
        searchText: '',
        // ---- 复习页 ----
        reviewQueue: [],
        reviewDone: 0,
        showAnswer: false,
        currentPhotos: [],
        // ---- 全局 ----
        subjects: DEFAULT_SUBJECTS.slice(),
        dueCount: 0,
        reviewCountdown: '',
        // ---- 详情弹层 ----
        detail: null,
        detailPhotos: [],
        editBuf: { text: '', note: '', tagsText: '' },
        fullscreenUrl: null,
        backingUp: false,
        _blobUrls: []
      };
    },

    computed: {
      current() {
        return this.reviewQueue[0] || {};
      },
      canSave() {
        return this.draft.photos.length > 0 || this.draft.text.trim() || this.draft.note.trim();
      },
      filteredItems() {
        let list = this.items;
        if (this.filterSubject) list = list.filter(m => m.subject === this.filterSubject);
        if (this.filterStatus) list = list.filter(m => m.status === this.filterStatus);
        const q = this.searchText.trim().toLowerCase();
        if (q) {
          list = list.filter(m =>
            (m.text || '').toLowerCase().includes(q) ||
            (m.note || '').toLowerCase().includes(q) ||
            (m.tags || []).join(',').toLowerCase().includes(q) ||
            (m.subject || '').toLowerCase().includes(q));
        }
        return list;
      }
    },

    async created() {
      this.autoOcr = await DB.getMeta('autoOcr', true);
      const saved = await DB.getMeta('subjects', null);
      if (Array.isArray(saved) && saved.length) this.subjects = saved;
      await this.refreshDueCount();
      this.startCountdownTimer();
    },

    methods: {
      /* ================= 通用 ================= */
      showToast(msg) {
        this.toast = msg;
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => { this.toast = ''; }, 2200);
      },
      fmtDate(ts) {
        if (!ts) return '';
        const d = new Date(ts), now = new Date();
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
      },
      statusLabel(s) { return { new: '未复习', learning: '复习中', mastered: '已掌握' }[s] || s; },
      trackUrl(u) { this._blobUrls.push(u); return u; },

      async refreshDueCount() {
        const now = Date.now();
        this.dueCount = await db.mistakes
          .where('nextReviewAt').below(now)
          .filter(m => m.status !== 'mastered')
          .count();
      },

      startCountdownTimer() {
        const tick = () => {
          const dueAt = this.reviewQueue.length ? this.reviewQueue[0].nextReviewAt : null;
          if (dueAt) {
            const ms = dueAt - Date.now();
            if (ms <= 0) { this.buildQueue(); return; }
            const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
            this.reviewCountdown = (h ? h + ' 小时 ' : '') + m + ' 分钟';
          } else {
            this.reviewCountdown = '';
          }
        };
        this._tickT = setInterval(tick, 30000);
      },

      /* ================= 添加页 ================= */
      onCameraPick(e) { this.addPhotos(e.target.files); e.target.value = ''; },
      onGalleryPick(e) { this.addPhotos(e.target.files); e.target.value = ''; },

      async addPhotos(fileList) {
        const files = Array.from(fileList || []).slice(0, 6 - this.draft.photos.length);
        for (const file of files) {
          try {
            const { blob } = await DB.compressImage(file);
            const item = { blob, url: this.trackUrl(URL.createObjectURL(blob)), ocrState: '' };
            this.draft.photos.push(item);
            if (this.autoOcr) this.ocrPhoto(item);
          } catch (err) { this.showToast('图片处理失败：' + err.message); }
        }
      },

      async ocrPhoto(item) {
        item.ocrState = '识别中…';
        try {
          const text = await OCR.recognize(item.blob, p => {
            item.ocrState = '识别中 ' + Math.round(p * 100) + '%';
          });
          item.ocrState = '完成';
          const merged = (this.draft.text ? this.draft.text + '\n' : '') + text;
          this.draft.text = merged.slice(0, 4000);
          setTimeout(() => { item.ocrState = ''; }, 1500);
        } catch (err) {
          item.ocrState = '失败(需联网)';
          setTimeout(() => { item.ocrState = ''; }, 3000);
        }
      },

      removeDraftPhoto(i) {
        this.draft.photos.splice(i, 1);
      },

      addSubject() {
        const s = this.newSubject.trim();
        if (!s) return;
        if (!this.subjects.includes(s)) {
          this.subjects.push(s);
          DB.setMeta('subjects', this.subjects);
        }
        this.draft.subject = s;
        this.newSubject = '';
      },

      async saveDraft() {
        if (!this.canSave || this.saving) return;
        this.saving = true;
        try {
          if (!this.draft.subject) this.draft.subject = '未分类';
          const doc = {
            subject: this.draft.subject,
            tags: this.draft.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean),
            note: this.draft.note.trim(),
            text: this.draft.text.trim(),
            photoCount: this.draft.photos.length,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          Object.assign(doc, DB.newReviewFields());
          const id = await db.mistakes.add(doc);
          for (let i = 0; i < this.draft.photos.length; i++) {
            await db.photos.add({ mistakeId: id, sort: i, blob: this.draft.photos[i].blob });
          }
          this.draft = { photos: [], subject: this.draft.subject, tagsText: '', note: '', text: '' };
          this.showToast('已保存 🎉');
          await this.refreshDueCount();
          this.tab = 'list';
          await this.loadList();
        } catch (err) {
          this.showToast('保存失败：' + err.message);
        } finally {
          this.saving = false;
        }
      },

      /* ================= 列表页 ================= */
      async loadList() {
        const rows = await db.mistakes.orderBy('createdAt').reverse().toArray();
        // 缩略图：取前 2 张图
        await Promise.all(rows.slice(0, 60).map(async m => {
          const ps = await db.photos.where('mistakeId').equals(m.id).sortBy('sort');
          m._thumbs = ps.slice(0, 2).map(p => this.trackUrl(URL.createObjectURL(p.blob)));
        }));
        this.items = rows;
      },

      async openDetail(m) {
        this.detail = m;
        this.editBuf = {
          text: m.text || '',
          note: m.note || '',
          tagsText: (m.tags || []).join(', ')
        };
        const ps = await db.photos.where('mistakeId').equals(m.id).sortBy('sort');
        this.detailPhotos = ps.map(p => this.trackUrl(URL.createObjectURL(p.blob)));
      },

      async saveDetail() {
        const patch = {
          text: this.editBuf.text.trim(),
          note: this.editBuf.note.trim(),
          tags: this.editBuf.tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean),
          updatedAt: Date.now()
        };
        await db.mistakes.update(this.detail.id, patch);
        Object.assign(this.detail, patch);
        this.detail = null;
        this.showToast('已保存');
      },

      async deleteMistake(m) {
        if (!confirm('确定删除这道错题？不可恢复。')) return;
        await db.transaction('rw', db.mistakes, db.photos, async () => {
          await db.photos.where('mistakeId').equals(m.id).delete();
          await db.mistakes.delete(m.id);
        });
        this.detail = null;
        this.items = this.items.filter(x => x.id !== m.id);
        await this.refreshDueCount();
        this.showToast('已删除');
      },

      fullscreen(u) { this.fullscreenUrl = u; },

      /* ================= 复习页 ================= */
      async goReview() {
        this.tab = 'review';
        await this.buildQueue();
      },

      async buildQueue() {
        const now = Date.now();
        const due = await db.mistakes
          .where('nextReviewAt').below(now)
          .filter(m => m.status !== 'mastered')
          .toArray();
        due.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
        this.reviewQueue = due.slice(0, 50);
        this.showAnswer = false;
        this.reviewDone = 0;
        await this.loadCurrentPhotos();
      },

      async loadCurrentPhotos() {
        for (const u of (this._curUrls || [])) URL.revokeObjectURL(u);
        const cur = this.reviewQueue[0];
        if (!cur) { this.currentPhotos = []; return; }
        const ps = await db.photos.where('mistakeId').equals(cur.id).sortBy('sort');
        this._curUrls = ps.map(p => URL.createObjectURL(p.blob));
        this.currentPhotos = this._curUrls;
      },

      async judge(correct) {
        const m = this.reviewQueue[0];
        if (!m) return;
        correct ? DB.judgeCorrect(m) : DB.judgeWrong(m);
        m.updatedAt = Date.now();
        await db.mistakes.update(m.id, {
          status: m.status, intervalIdx: m.intervalIdx,
          nextReviewAt: m.nextReviewAt, updatedAt: m.updatedAt
        });
        if (m.status === 'mastered') this.showToast('🎉 恭喜，这道题已掌握！');
        this.reviewQueue.shift();
        this.reviewDone++;
        this.showAnswer = false;
        await this.loadCurrentPhotos();
        await this.refreshDueCount();
      },

      /* ================= 设置页 ================= */
      async renameSubjectPrompt(s) {
        const ns = (prompt('重命名科目「' + s + '」为：', s) || '').trim();
        if (!ns || ns === s) return;
        const ms = await db.mistakes.where('subject').equals(s).toArray();
        await db.transaction('rw', db.mistakes, async () => {
          for (const m of ms) await db.mistakes.update(m.id, { subject: ns });
        });
        this.subjects = this.subjects.map(x => x === s ? ns : x);
        if (!this.subjects.includes(ns)) this.subjects.push(ns);
        await DB.setMeta('subjects', this.subjects);
        if (this.draft.subject === s) this.draft.subject = ns;
        this.showToast('已重命名 ' + ms.length + ' 道题');
      },

      async exportBackup() {
        this.backingUp = true;
        try {
          const data = await DB.exportBackup();
          const json = JSON.stringify(data);
          const name = 'cuoti-backup-' + new Date().toISOString().slice(0, 10) + '.json';
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          this.showToast('已导出 ' + name);
        } catch (err) {
          this.showToast('导出失败：' + err.message);
        } finally {
          this.backingUp = false;
        }
      },

      async importBackup(e) {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const added = await DB.importBackup(JSON.parse(text));
          this.showToast('导入完成，新增 ' + added + ' 道错题');
          await this.refreshDueCount();
        } catch (err) {
          this.showToast('导入失败：' + err.message);
        }
      },

      async clearAll() {
        if (!confirm('将删除全部错题和图片，且不可恢复。建议先「导出备份」。继续？')) return;
        if (!confirm('再次确认：真的要清空吗？')) return;
        await Promise.all([db.mistakes.clear(), db.photos.clear()]);
        this.items = []; this.reviewQueue = [];
        await this.refreshDueCount();
        this.showToast('已清空');
      }
    },

    watch: {
      autoOcr(v) { DB.setMeta('autoOcr', v); }
    },

    unmounted() {
      clearInterval(this._tickT);
      this._blobUrls.forEach(u => URL.revokeObjectURL(u));
    }
  }).mount('#app');
})();

/* db.js — Dexie 存储层 + 艾宾浩斯复习算法 + 图片压缩 */
(function (global) {
  'use strict';

  const db = new Dexie('cuoti-db');
  db.version(1).stores({
    // mistakes: 错题主表
    // photos:   图片单独存表，blob 不进主表避免列表加载过慢
    mistakes: '++id, subject, status, nextReviewAt, createdAt',
    photos:   '++id, mistakeId',
    meta:     'key'
  });

  /* ---------- 艾宾浩斯间隔（天） ---------- */
  const INTERVALS = [1, 2, 4, 7, 15, 30];

  function newReviewFields() {
    return {
      status: 'new',          // new | learning | mastered
      intervalIdx: 0,
      nextReviewAt: Date.now() + INTERVALS[0] * 86400000
    };
  }

  // 做对：推进到下一档；超过最后一档 => 已掌握
  function judgeCorrect(m) {
    const next = m.intervalIdx + 1;
    if (next >= INTERVALS.length) {
      m.status = 'mastered';
      m.nextReviewAt = null;
      m.intervalIdx = INTERVALS.length - 1;
    } else {
      m.status = 'learning';
      m.intervalIdx = next;
      m.nextReviewAt = Date.now() + INTERVALS[next] * 86400000;
    }
    return m;
  }

  // 做错：重置到第 1 档，当晚（30 分钟后）再排入队列
  function judgeWrong(m) {
    m.status = 'learning';
    m.intervalIdx = 0;
    m.nextReviewAt = Date.now() + 30 * 60000;
    return m;
  }

  /* ---------- 图片压缩（最长边 1600，JPEG 0.85） ---------- */
  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1600; quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('图片压缩失败')); return; }
          resolve({ blob: blob, width: w, height: h });
        }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  /* ---------- meta 设置读写 ---------- */
  function getMeta(key, def) {
    return db.meta.get(key).then(function (r) { return r ? r.value : def; });
  }
  function setMeta(key, value) {
    return db.meta.put({ key: key, value: value });
  }

  /* ---------- 备份：导出 / 导入 ---------- */
  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      const fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
  function dataURLtoBlob(dataURL) {
    const [head, b64] = dataURL.split(',');
    const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportBackup() {
    const mistakes = await db.mistakes.toArray();
    const photos = await db.photos.toArray();
    const photoPayloads = [];
    for (const p of photos) {
      photoPayloads.push({
        mistakeId: p.mistakeId, sort: p.sort || 0,
        data: await blobToDataURL(p.blob)
      });
    }
    return {
      app: 'cuoti-pwa', version: 1, exportedAt: Date.now(),
      mistakes: mistakes, photos: photoPayloads
    };
  }

  async function importBackup(payload) {
    if (!payload || payload.app !== 'cuoti-pwa' || !Array.isArray(payload.mistakes)) {
      throw new Error('备份文件格式不正确');
    }
    let added = 0;
    await db.transaction('rw', db.mistakes, db.photos, async function () {
      const idMap = {}; // 旧id -> 新id
      for (const m of payload.mistakes) {
        // 去重：createdAt 精确到毫秒 + 相同题目文字视为重复
        const dup = await db.mistakes
          .where('createdAt').equals(m.createdAt)
          .filter(function (x) { return (x.text || '') === (m.text || ''); })
          .first();
        if (dup) continue;
        const doc = Object.assign({}, m);
        const oldId = doc.id; delete doc.id;
        const newId = await db.mistakes.add(doc);
        idMap[oldId] = newId; added++;
      }
      for (const p of (payload.photos || [])) {
        const newMId = idMap[p.mistakeId];
        if (newMId == null) continue;
        await db.photos.add({
          mistakeId: newMId, sort: p.sort || 0,
          blob: dataURLtoBlob(p.data)
        });
      }
    });
    return added;
  }

  global.DB = {
    db: db, INTERVALS: INTERVALS,
    newReviewFields: newReviewFields,
    judgeCorrect: judgeCorrect, judgeWrong: judgeWrong,
    compressImage: compressImage,
    getMeta: getMeta, setMeta: setMeta,
    exportBackup: exportBackup, importBackup: importBackup
  };
})(window);

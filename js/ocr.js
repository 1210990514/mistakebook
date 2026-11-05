/* ocr.js — 基于 tesseract.js 的浏览器内 OCR（中文简体 + 英文）
 * tesseract.min.js 与 worker 由 vendor 目录提供；
 * 语言包（chi_sim）首次使用时从 CDN 下载，之后由 service worker 缓存。
 */
(function (global) {
  'use strict';

  let workerPromise = null;

  async function getWorker(onProgress) {
    if (!global.Tesseract) throw new Error('OCR 引擎未加载（vendor/tesseract 文件缺失）');
    // workerPath 走本地 vendor；wasm core 与中文语言包由 tesseract.js 默认 CDN 获取，
    // 首次联网下载后由 service worker 缓存，之后离线可用。
    const worker = await global.Tesseract.createWorker(['chi_sim', 'eng'], 1, {
      workerPath: './vendor/tesseract/worker.min.js',
      logger:    function (m) { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); }
    });
    return worker;
  }

  // 单例 worker，避免重复加载语言包
  function withWorker(onProgress) {
    if (!workerPromise) workerPromise = getWorker(onProgress);
    return workerPromise;
  }

  async function recognize(blob, onProgress) {
    const worker = await withWorker(onProgress);
    const { data } = await worker.recognize(blob);
    return (data.text || '').replace(/\n{3,}/g, '\n\n').trim();
  }

  global.OCR = { recognize: recognize };
})(window);

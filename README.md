# 错题集 PWA

手机拍照整理错题、按科目/知识点筛选、艾宾浩斯间隔复习的**纯本地应用**。
不需要服务器，所有数据（含照片）保存在手机浏览器的 IndexedDB 里，不上传任何地方。

## 功能

- ➕ **拍照/相册上传**：一题多图，自动压缩存储；调用手机相机（`capture`）
- 🔤 **OCR 识别**：Tesseract.js 浏览器内识别题目文字（中文简体+英文，印刷体效果好，手写有限）
- 📚 **筛选检索**：按科目、掌握状态、全文搜索（题目文字/标签/备注）
- 🔁 **复习闭环**：1/2/4/7/15/30 天艾宾浩斯间隔；「做对」推进、「又做错」重置并 30 分钟后重排
- 💾 **备份**：一键导出 JSON（含图片 base64），导入自动按创建时间去重
- 📱 **PWA**：添加到主屏幕当 App 用，除 OCR 语言包首次下载外完全离线可用

## 使用方式

### 方式 A：本机局域网直接访问（最快，适合先在自己手机上用）

```
cd cuoti-pwa
python -m http.server 8000        # 或 npx serve
```

手机与电脑连**同一个 Wi-Fi**，访问 `http://<电脑IP>:8000`。
> 注意：http 局域网地址下功能全部可用，但**无法注册 service worker**（不能离线、不能添加到主屏幕）。要 PWA 体验请用方式 B。

### 方式 B：免费 HTTPS 部署（推荐长期使用）

把 `cuoti-pwa/` 整个目录推到任意免费静态托管：

- **GitHub Pages**：新建仓库 → 上传目录 → Settings 开启 Pages
- **Cloudflare Pages / Vercel / Netlify**：拖拽上传即可

部署后用浏览器打开 → 菜单里选「**添加到主屏幕**」→ 像 App 一样使用，可离线。

### 方式 C：本机 HTTPS（想不换托管又要 PWA）

用 [mkcert](https://github.com/FiloSottile/mkcert) 给局域网签发受信证书后以 https 起服务，手机安装根证书。略折腾，适合动手党。

## 目录结构

```
cuoti-pwa/
├── index.html              # 单页应用（Vue 3，无构建步骤）
├── manifest.webmanifest    # PWA 清单
├── sw.js                   # service worker 离线缓存
├── css/app.css
├── js/db.js                # Dexie/IndexedDB 存储层 + 复习算法 + 备份
├── js/ocr.js               # Tesseract.js 封装
├── js/app.js               # Vue 应用主体
├── vendor/                 # 本地化的第三方库（vue / dexie / tesseract）
└── icons/                  # 应用图标
```

## 已知限制

- OCR 中文语言包首次使用需联网下载（约几 MB，之后走缓存）；识别对手写体、公式效果有限
- iOS Safari 本地通知支持较弱，复习提醒目前以「首页待复习角标 + 到期列表」形式呈现
- 数据在手机浏览器本地：清理浏览器数据会丢失，**请定期导出备份**
- 换浏览器/换手机迁移：旧机导出 → 新机导入

## 二期待办

- PDF 打印错题本导出
- 云 OCR（更高精度，保留接口位）
- 统计图表（科目正确率趋势）
- WebDAV / 坚果云自动备份

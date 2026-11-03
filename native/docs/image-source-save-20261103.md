# 普通图片原格式保存与另存（2026-11-03）

## 旧版依据

- `legacy/src/renderer/src/core/document-files.ts`：路径、格式与后缀规范化，PNG/JPEG/WebP/BMP/GIF源文件编码。
- `core/document-save-policy.ts`：普通图像会合并图层、单帧格式丢动画、GIF色数／半透明及JPEG透明度等限制。
- `store/document-file-service.ts`、`store/document-save-format.test.ts`：沿用原格式、保存前兼容选择、确认后重查、当前会话保留完整结构和原生另存。
- `core/png.ts`、`core/file-preferences.ts`、`locales/zh-CN.ts`：当前帧静态编码、WebP质量0.92、默认格式索引和提示文案。

## 本次承接

打开PNG、JPG/JPEG、WebP、BMP、GIF后，CtrlS在“沿用原格式保存”开启时写回来源，成功后更新savepoint；另存后优先使用新路径。GIF保存所有帧及其时长，PNG/JPEG/WebP/BMP/SVG/ICO保存当前帧。WebP这里按旧版静态保存，不借用动画导出。默认保存格式中原来灰置的PNG/JPEG/WebP/SVG/ICO已接通，既有PSD/ASE保持。

另存对话框复用原入口，保留前三项MoonSprite、ASE、PSD的索引，再追加PNG、JPEG、WebP、SVG、ICO、BMP、GIF。后缀处理沿旧版：认可后缀替换、未知后缀追加、JPEG两种和ASE两种后缀互认；补全后命中已有文件要求显式完整路径确认，不绕过覆盖提示。

普通图像保存先报告层／组、帧、循环、编辑内容、蒙版和效果、资源、缩时等损失；GIF另查颜色与半透明，JPEG另查透明度。使用现有PixelDialog抽出的共享格式兼容窗口，取消／保留格式／保存完整MoonSprite三选一。确认期间新增未获批准的损失会拒绝；继续图片保存不删除会话内图层、帧或历史。

保存继续使用原生已有分时快照、后台worker、串行队列、较新内容保护、原子替换、恢复清理及失败重试。图片保存不生成MoonSprite备份。未添加WebView、另一套事务或新启动路径。

静态WebP复用已有合成／缩放准备函数直接编码，避免先编码PNG。复用准备函数时发现单层直接像素路径未排除蒙版，现按旧版directPngSource同时排除蒙版、剪贴及特殊层，防止保存绕过可见效果。

## 已执行验证与边界

- `image-save-tests`通过：实际PNG/JPEG/WebP/BMP/GIF读回、SVG/ICO文件结构、源状态保护、GIF帧数／时长、损失判定、255色边界、后缀及默认索引、单层蒙版像素。
- 唯一正式Release构建通过。
- 正式 `--aseprite-save-check`返回0：六个来源后缀写回、七种另存、五种默认格式、队列／savepoint、PNG损失取消、确认期间新增动画拒绝、继续格式保留会话结构、完整工程保存、关闭原格式偏好、提交失败和排队重试。系统文件选择结果注入；兼容窗口实际打开。
- 正式 `--aseprite-io-check`返回0：PSD/ASE实际导出／重开及保存回归保持。
- 573文件来源覆盖检查通过，全量行为对齐仍未完成。

没有执行人工全格式查看或截图验收。JPEG/WebP属有损编码，测试不要求输出字节相同；现有JPEG编码与已有Chromium样本对照契约保持。SVG/ICO为旧版提供的保存格式，旧版普通打开也不将它们列入可导入图片，本批不自行开放读入。既有原生尺寸／内存预算和各编码器边界保留；图片文件不承接工程结构，需完整编辑能力时选择MoonSprite。

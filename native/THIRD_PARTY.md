# 原生底座依赖与许可

仅用于开发构建；首次接入日期 2026-10-12。下载缓存放 `.cache/`，不把整个 Aseprite 项目作为 MoonSprite 应用编译。复现入口为 `scripts/bootstrap.ps1`，固定提交和下载校验值均在脚本中。

| 依赖 | 固定来源 | 许可及范围 |
| --- | --- | --- |
| Aseprite UI | aseprite/aseprite `14fe117e853bd642672e72018166239506060cd4` | 仅 src/ui，自带 MIT LICENSE.txt；没有复制 app 或业务界面；默认皮肤素材现按下列独立许可接入 |
| Aseprite Default Theme | 同一 Aseprite 固定提交的 data/extensions/aseprite-theme | CC BY 4.0；原 sheet.png 和切片坐标保留，MoonSprite 样式映射有修改。署名及修改说明见 assets/themes/aseprite-default/ATTRIBUTION.md，许可原文随资源分发 |
| laf | aseprite/laf `500768cccc6447e3b7816bedbfcb378a5c5222e5` | MIT；Windows 窗口、输入、Skia 表面与字体 |
| observable | aseprite/observable `b21d07fb046b2422e940e7171340317af6518b88` | MIT；UI 信号 |
| fmt | aseprite/fmt `f781d2b9321934f881de1ddb5be1db69fae1632e` | MIT |
| clip | aseprite/clip `964847c26261f00c5e5bf9ceab622347b75cf85d` | MIT；laf Windows DND 及已有色卡等剪贴板后端；共享文本输入现经MIT UI delegate接入，验证范围见[文本剪贴板](docs/text-input-clipboard-20261031.md) |
| zlib | aseprite/zlib `51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf` | zlib 许可 |
| Skia | aseprite/skia `m124-08a5439a6b` Windows Release x64 | BSD 及其第三方许可；含 FreeType、HarfBuzz、libpng、ICU。保留下载包 LICENSE 和 third_party 通知，发布前整理完整分发清单 |
| Fusion Pixel | TakWolf/fusion-pixel-font `2026.09.25`，10px monospaced zh_hans BDF | SIL OFL 1.1；原字体及完整 LICENSES/OFL.txt 在 assets/fonts，未修改字形。发布包 SHA256：4E0F328F55E07A971DEE491CADB5472FA71587D29C33042F799FA209EBE53E2A |

Fusion 官方源：[项目](https://github.com/TakWolf/fusion-pixel-font)、[固定发布](https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.09.25)。`fusion-ascii.png` 仅为 laf 内部字符测量准备等高图集，由 `scripts/prepare-font.py` 从同一 BDF 原样排列；实际界面直接按 BDF 的字形边界、基线和前进宽度绘制。拉丁字符可以是 5px 前进宽度，中文通常为 10px，均属同一个 10px 字号；不拉伸成等宽方块。

所有上游完整许可文本保留在对应缓存源码中；可执行文件旁需附带的 MIT 原文由构建复制。当前不创建安装包、不作发行许可完备声明。

2026-10-31：构建时从锁定laf的`os/win/window.cpp`生成保留版权头的副本，仅将WM_IME_CHAR的UTF16代理对合成从错误的按位OR改为加法；原缓存源码不修改。生成副本替代原编译单元，许可仍为laf MIT，详见[原生输入法接线](docs/text-input-ime-20261031.md)。

# 2026-10-22：剪贴蒙版洋葱皮与 core 测试栈定位

本轮尚未提交、打包或发布。唯一正式程序仍为 `native/build/Release/moonsprite-native.exe`，唯一入口 `native/start-native.bat`。

## 已实现

`layer_compositor.cpp` 对包含剪贴层／组的洋葱皮采用 legacy `onion-skin.ts:createOnionSkinDisplayDocument` 的显示副本语义：邻帧对象独立应用 cel opacity 和附加蒙版，以普通 blend 的 ghost 插入当前剪贴链基底下方；ghost 继承锚点当前 Z，保持同组和有效可见性。当前剪贴链继续走既有 `compositeClippingRegion`。源图像显式共享至短命显示副本，普通 `Timeline`/`LinkedPixelStorage` copy 深拷贝与 explicit vector 构造保持。无 clipping 的原合成路径保持。

ghost 的基底透明范围与当前剪贴链分离：邻帧 ghost 可以出现在当前基底 alpha 之外；隐藏当前基底只隐藏当前链。当前 cel 的橡皮预览、组 opacity/visibility 和 clipping base Z 仍通过同一普通合成器处理。未宣称尚未迁移的 layer styles/adjustment 效果等价。

## 栈溢出实证

使用 Windows Debug API 启动原有 `moon-core-tests.exe`，首个异常为 `0xC00000FD`，指令位于程序 RVA `0xABC27`（`__chkstk`），栈上业务返回地址为 `0xA974`。`dumpbin /DISASM` 确认 main 从 RVA `0xA950` 开始，序言 `mov eax,10E6E0h; call __chkstk; sub rsp,rax`，进入第一个 fixture 前请求 1,107,680 bytes。`dumpbin /HEADERS` 显示原 PE stack reserve 为 `0x100000`，即 1,048,576 bytes。

仅 `moon-core-tests` 的 MSVC 链接增加 `/STACK:2097152`。这不改变正式程序和生产调用栈。

## 已完成验证

- `moon-core-tests`、`layer-group-compositor-tests` 使用 `/m:1 /nodeReuse:false` 串行构建通过。
- 原 `moon-core-tests` 运行 exit 0。
- `layer-group-compositor-tests` 运行 exit 0，新增 clipping onion 的 ghost 不受当前 base alpha 截断、隐藏 base、base opacity、组 opacity/visibility、ghost source opacity、eraser preview、base Z、源数据不变断言。
- 正式 `--clipping-mask-check` 已增加实际编辑器画布 upload 路由断言，等待统一冻结后构建和运行；不把仅源码扩展称为运行通过。

## 并行模块状态

瓦片与录像的后续接线、实际模型／工程回归及剩余缺口见 `lcd-tilemap-timelapse-integration-20261022.md`。当前已接入文档、历史、快照、IO 与原生 UI；未迁移的瓦片结构／全局栅格操作继续由门禁拒绝。不是仅保存模型／库文件即宣布完整迁移。

# 画布取色放大镜显示迁移（2026-11-16）

仅功能迁移。直接依据 legacy/core/eyedropper-magnifier.ts 及测试、components/useCanvasEyedropperMagnifier.tsx、EyedropperMagnifier.tsx、styles.css 1311–1333、raster.ts、canvas-visuals.ts、theme.ts、file-preferences.ts 及偏好窗口。内部复用已核对 legacy/LICENSE。

## 行为与适配

放大镜沿用 25×25 区域来源和已有缓存／pending paint；以连续文档位置为中心，先镜像再旋转，与画布共用 view::Rotation 的逆变换。镜头显示随亚像素位置连续移动，视图变化重新绘制但不重新读取同一个来源区域。checker 在每个源像素上先合成，采样范围外透明。

复用旧版 max(204/17, zoom×1.5) 放大规则。保留 256 CSS shell 中央的 204 CSS canvas，不把整个 shell 当作画布。原生已有 2× UI 对应 128／102 逻辑像素；native view.zoom 是逻辑单位，先转换为 CSS 单位再计算相对放大率。四档尺寸、上方优先／上边不足则下移、边缘约束和小于镜头的视口定位直接承接旧版函数。最终 UI 定位取整到原生逻辑格。

边缘效果保留中心 82% 未失真区、smoothstep 径向 14% 放大、红蓝径向 6 CSS 像素色散和右下加重的内缘阴影。直接复用公式，字节写入沿用 Uint8ClampedArray 的 ties-to-even 规则；源码循环的独立差分验证不依赖原生算法生成预期。

像素样式使用已有旧版 viewport、sampled／previous SVG 转换 PNG、frame 和黑白 pointer PNG。保留原始素材的部分 alpha，取样／原色透明度和指针 0.5 alpha，按 canvas-visuals 的 .2126/.7152/.0722 与阈值 145 选择指针。frame 按旧版 darkestThemeSeed 规则从原生现有对应皮肤色种子选取，使用 theme.ts 的线性亮度；原生主题只暴露旧版种子子集，这是必要主题接口适配。

线条样式直接转换旧版 CSS circle／border／radial mask：外半径 128、内半径 100、2 CSS 像素边框和 98–100 CSS 像素径向过渡，上半环为新颜色，下半为原颜色。原生在半分辨率像素中心计算边缘覆盖；不声称与浏览器圆形抗锯齿逐像素一致。drop-shadow(3px 4px 4px) 通过已有 Skia 绘制适配为一半逻辑坐标与半径对应 sigma，随尺寸缩放，保留旧版暗／亮阴影色规则。

原生偏好目录已存在两个条目，本阶段只补入 runtime allowlist 并由实际镜头消费。沿用通用控件和现有 editor-preferences 序列化；默认像素样式、失真关闭，保存及无效索引校验保持旧版。

本阶段只涉及画布镜头。全局桌面取色的 CSS contrast／saturate 属于另一路径，不加到画布镜头；跨画布／参考图取色等剩余缺口不在本次验收范围。生产 indexed 新建／转换／可编辑导入继续关闭，全仓迁移仍 INCOMPLETE。

## 验证

实际旧版 oracle 直接加载 TypeScript helper，读取 hook 源码的完整 distortion loop 原样执行；只提供离屏 canvas 尺寸、dpr=.5 和预先 checker 合成的源像素。320 组覆盖五个旋转角、四种镜像、四个缩放、两个含负坐标的亚像素位置与失真开／关，逐像素比对 3,329,280 个输出像素。另检查 64 组四档大小／视口／边缘位置、非有限缩放和旋转、实际 legacy blendOver。

原始素材检查覆盖部分 alpha、204 canvas 之外透明、两种样式和失真实际消费。设置默认、边界、编码／解码通过。第一次测试中的绿色亮度夹具选为 200，未达到正确阈值 145，已改为 210；全部像素差分本身已通过。旧版放大镜和偏好两文件 23 测试通过（3.05 秒）。三项定向 CTest 通过（3.88 秒）。

正式 Release 构建退出 0；唯一程序 native/build/Release/moonsprite-native.exe 于 2026-11-16 09:05:58 更新（30,782,464 bytes）。正式程序 --sampling-zoom-check 退出 0，覆盖 16 组样式／失真／旋转镜像实际输入、四档显示尺寸、待绘合并、稳定来源缓存、活动手势中切换视图、释放清理及像素／历史隔离。已查看正式程序生成的 1024×1024 镜头图集（native/build/Release/build/eyedropper-lens-styles.bmp），核对两种样式、原始素材轮廓、旋转镜像和边缘色散；图集只验证镜头本体，不代表完整工作区／多显示器／1× 实机验收。此前三项 CTest 通过（3.88 秒），关联 eyedropper、eyedropper-legacy-oracle、eyedropper-legacy、tile-repeat 四项通过（1.88 秒）。来源覆盖 1001 文件及既有快照、Editor 598 源码、架构 598 源码／273 targets、360 条偏好目录与 diff 检查通过；strict 因全仓剩余迁移缺口按要求退出 1。

生成 oracle、构建产物、截图和日志不提交。保留用户数据与已有未跟踪文件，阶段保存推送 dev；整体迁移仍 INCOMPLETE。

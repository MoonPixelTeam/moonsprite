# 开关组件

用户于 2026-10-15 指定：只提供文本开关、图标＋文本开关，不提供纯开关。`PixelSwitch` 的文字必填；整行是点击区域，右端始终显示开关，图标可选且只复用旧版对应素材。

旧版行为依据：`legacy/src/renderer/src/components/PreferenceToggle.tsx` 的受控 checked/onChange、label 整行点击和 disabled；`LivePreviewToggle.tsx` 的旧版图标＋文字组合。原生使用现有 PixelButton 的捕获、移出取消和 Space 释放确认，Enter 不切换。`setChecked` 只同步状态，不发出变更；用户操作一次调用一次 bool 回调。当前首先接入颜色调整的“实时预览”，保留原预览、取消及历史语义。

素材均在 `assets/themes/moonsprite-dark/sheet.png`：

- `switch.off.normal` / `switch.off.hover`：18×9，坐标 (0,662)/(0,672)。
- `switch.on.normal` / `switch.on.hover`：18×9，坐标 (19,662)/(19,672)。
- `switch.container`：81×17，坐标 (0,682)，2px 固定边框九宫格。

来源为用户 `codex-clipboard-7f3c7f81-0135-4a22-95fc-2b383e5d00b9.png` 和 `codex-clipboard-c6f8a655-49fe-4ed4-9b29-b0f90ef3698c.png`。开关原像素未改；容器只提取第一行空白容器，不把示例文字、图标烘焙进素材。原文件 SHA256 记录在 sheet-regions.json。

1x 布局：容器默认参考高度17px；开关18×9，距外边缘右侧4px（2px边框＋2px内容间距），纵向居中；文字左侧同样4px，图标与文字间2px。名称过长在文字区裁剪，不覆盖开关。悬浮整行时使用对应开／关悬浮素材，键盘焦点也显示该状态。禁用时不切换、不显示悬浮态；沿用正常素材降低透明度，不另画禁用素材。

```cpp
auto control = new PixelSwitch(font, skin, U"实时预览", enabled,
  [&](bool checked) { enabled = checked; updatePreview(); });
control->iconSkin = &legacyIcons;  // 文本开关省略这两行
control->icon = "eye";
control->setChecked(enabled);     // 外部状态同步，无回调
```

`switch-component` 检查四状态素材逐像素一致、两种组合、整行点击、状态同步、Space/Enter、禁用及实时预览状态绑定；渲染结果为正式构建目录下 `switch-states.bmp`。

验收：正式Release构建成功，theme-atlas、switch-component通过；已查看switch-states.bmp确认仅文本／图标＋文本两列，各含关正常、关悬浮、开正常、开悬浮四行。来源覆盖181文件与diff空白检查通过。

# 混合瓦片工程补间生成

实际旧版依据：`animation-tween.ts:281-310` 仅对普通目标补间，其他 Cel 独立复制；`workspace-commands-animation-tween.ts` 插入帧及蒙版后，使用 resizeDocumentAt／resizeAnimationCelsAt 完成画布扩展，并在一项历史中恢复结构、画布及选择；`animation.ts:497-585` 同步调整网格、自由实例与资源渲染。

原生解除混合工程生成拒绝及旧菜单限制，特殊图层仍不参与补间目标。需要扩展画布时，在独立临时 Document 上复用已有 resizeBackgroundCanvas，再将完整结果以单项结构历史安装，保留资源 ID、原链接、选区及中心点。

正式 Release 构建成功，正式程序 --moon-crossfade-check 退出 0，覆盖组内普通图层生成及组外瓦片保留。两项定向 CTest 通过（0.52 秒），新增网格／自由瓦片 × 变换／交叉淡化／形变 × 自动画布开关，验证尺寸、实例／网格数据、单步撤销重做、编码重开及合成像素一致。此前预览检查函数漏接 main，本批已接入并执行；不能把前批通过解释为当时执行了该函数。

未新增人工视觉验收。混合瓦片补间路径已接通，整体功能迁移仍未完成。

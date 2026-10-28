# 切片与画布视图旋转迁移

切片来源：core/slices.ts、workspace-commands-slice.ts、canvas-input-slice.ts、EditorToolOptions.tsx、project-format-*、document-file-service.ts、document-export.worker.ts。来源具体SHA256和逐文件适配登记在legacy-provenance.json。覆盖元数据历史、选择、创建/组移/Alt复制/缩放、自动切片预览/取消、工程/恢复、静态/动画/精灵表切片裁切和批量文件名去重。自动切片图标直接复用PixelUtilityIcon.tsx路径。

已知差异：当前工程JSON切片坐标读取只接受数字；legacy Number(value)对null/boolean/string/array转换尚未完全等价。不能把该差异说成完整迁移；正常数字工程应由读写回归验证。异常输入需明确报告，不允许静默损坏用户作品。

视图旋转来源：view-geometry.ts、document-view-state.ts、canvas-input-navigation.ts、CanvasStage.tsx、AppMenuBar.tsx与app-view-shortcuts.ts。原生适配保留镜像后旋转/逆序逆变换、22.5度吸附、三种旋转指示位置、缩放锚点/屏幕平移、会话及文档视图存储、平板复位。旋转指示器7张PNG逐字节复用，光标使用原rotate素材。原生画布在物理像素坐标中绘制和命中。

文档来源检查、模型回归与正式窗口运行验收分开报告。构建与实际运行结果追加到本轮交付记录；本文件不预先声明通过，也不把provenance覆盖当成行为等价。

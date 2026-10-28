# 使用帮助与使用技巧

旧版真实能力为HelpDialog内置阅读窗口，不是外链。完整来源及SHA256在legacy-provenance.json。正文由Node内置TypeScript类型剥离机械读取四个原始资源，保持24篇帮助、14篇技巧及中英文内容、13种修饰操作、原shortcut ID；不生成新文档。复用同仓库legacy/LICENSE内容，无第三方文档引入。

原生使用共享PixelDialog标题、背景、关闭按钮，Fusion Pixel10px/默认2倍与2px关联/6px分组间距；长导航标题及文章换行，两侧独立共享滚动条。分类、默认篇目、所有词AND搜索（含当前快捷键绑定）、无结果清空、当前快捷键展示均承接。窗口几何两mode分开保存，查询/选择不保存；快捷键设置关闭帮助后真实打开。

依赖未迁移：诊断日志已由runtime-diagnostics模块接入，帮助关闭后调用真实目录/仅内存导出服务，细节与原生lag适配局限见runtime-diagnostics-migration-20261020.md。原生全局语言尚未迁移，当前中文界面保留全部双语正文资源。尺寸/坐标由共享原生geometry与显示区域适配。

检查需分开：help-articles-tests验证原资源数量/唯一ID/双语非空/shortcut引用/13修饰操作；正式--help-check验证实际菜单、窗口导航、搜索/无结果/清空及文档历史不变，并输出两窗口截图。构建运行及图像结果由唯一写入者另记，不预先声明通过；provenance覆盖不表示行为等价，strict保留已知缺口失败。

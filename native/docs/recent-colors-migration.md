# 调色盘最近颜色与加入颜色板

## 最近颜色真实语义

依据 `core/recent-colors.ts` 与 `components/canvas-recent-colors.ts`、两者测试：最近颜色最多 24 个，以 RGBA 四通道完全相等去重，复用颜色移到第一项。输入数组依次前插，所以渐变传入 `[终色, 起色]` 后起色在前。单个输入已是首项时不保存、不通知。

仅 draw／airbrush／shape／fill／gradient 在首次真实像素变化后记录，每个拖动只一次。橡皮、零 alpha 和导航不记录。记录时点不是拾色或角色变更，也不等待事务提交，因此之后取消／撤销绘制不会撤销最近颜色。

`RecentColors` 是文档外的应用偏好；不得随新建工程重置、进入撤销历史或改变 dirty。`RecentPaintDrag` 只承担一次拖动门控，调用方在新拖动前 reset，在实际文档更新后传入有无像素变化；返回 true 才保存并刷新最近颜色区域。

## 显示与选择

`panels/RecentColors.tsx` 默认可见，无颜色不显示；单行只显示容纳的最前颜色，不另设滚动。左键调用前景色命令，右键调用背景色命令，不因选色重新排序 MRU。用户本次明确覆盖旧尺寸：每格 22 基础像素，包含四周 1px 描边，格间 2 基础像素；默认 2× 即 44px 格与 4px 间隔。容量公式为 `max(0,floor((width+2)/24))`，width 是基础像素。

## 加入颜色板

`ColorPicker.tsx` 检查可见 paletteOrder 中是否存在完全相同 RGBA；`ColorValueControl.tsx` 只在未匹配时显示 `PixelUtilityIcon kind="plus"`。图标必须复用该 legacy 素材。

底层 `workspace-palette.ts:addPaletteColor` 不是集合插入：即使 RGBA 相同也必须产生独立 ID。`workspace-commands-color.ts` 调用时 `selectAdded=paletteEditSynchronizationLocked()`，原生因此走 `Document::addPaletteColor(roleColor,paletteLocked)`。透明色允许加入，ID、空槽与撤销沿用现有命令，不建立第二套 palette，不额外记录最近颜色。

## 原生持久化适配

legacy 将 RGBA 数组保存于 `moonsprite.recent-colors.v1` localStorage。原生 `load/save(path)` 使用独立偏好文件，每行四个十进制通道 R G B A，路径由集成人选在现有 Native AppData 偏好目录。缺文件为空；非法行过滤、最多保留前 24 个有效项，加载时不擅自去重，零 alpha 仍可从持久化数据读入。错误抛出，由应用状态通道展示，禁止静默吞错。

此文件不是旧 localStorage JSON 的直接迁移格式；旧偏好自动导入、最近颜色显隐设置入口、渐变／喷枪等未接入工具的真实画布触发仍是迁移缺口。模型已预留对应 gate，不能因此宣称这些工具完成。

## 验证

定向测试复用 legacy 的 30 色截断至 24、同 RGB 不同 alpha、复用移到首项、单次拖动只记录第一次像素修改、橡皮／透明／导航排除及渐变顺序；另验证持久化重开、非法行、重复项加载保留与写入错误。桌面验收由集成人验证格尺寸、角色左右键、加号显示、真实绘制首次记录，以及保持此前画布局部刷新性能修复。

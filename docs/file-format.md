# MoonSprite 文件格式 v20

中文 | [English](file-format.en.md)

v20 支持缩时快照的本地引用 `local: { store, chunk, offset, length, checksum }`，与内嵌 PNG 的 `dataFile` 二选一。安装版普通保存及恢复快照仅保存已持久写入的引用；旧工程中的 PNG 在首次保存或继续录制时逐帧迁移，写入失败则保留内存字节并报告错误。v1-v19 不采纳未知 `local` 字段。播放、视频和序列帧导出按需读取并校验 CRC32；缺少本地库不阻止画作打开，但录像读取必须明确报错。另存为勾选“携带缩时录像”会内嵌完整 PNG，供分享或换电脑使用；仍使用 v20，需要支持此版本的阅读器。详见 [ADR 0023](adr/0023-local-timelapse-library.md)。

v18 为自由瓦片图层新增稳定 `freeTileSetId`。多个自由瓦片图层可以保存相同的非空 ID，并共同引用一份顺序完全一致的 `freeTileSources`、源 ID 与单瓦片 Tileset；源像素、源属性和源增删会同步作用于该集合的全部图层，而每个图层仍独立保存实例列表、动画 cel、位置和普通图层属性。同一集合内各图层的源元数据必须逐项一致；不同集合之间、自由瓦片与 Tilemap 之间仍禁止共享源 ID 或 Tileset。v1-v17 工程中的每个自由瓦片图层迁移为独立集合，不根据相同名称、像素或尺寸猜测共享关系。

v17 为普通栅格图层新增可选 `linkedContentId`。具有相同非空 ID 的图层在每个对应动画帧共享实际栅格资源，但各自保存独立的 `offsetX`、`offsetY`、名称、图层结构和显示属性；写入器允许多个图层或 cel 清单项引用同一个 `dataFile`，并只写入一次底层像素数据。读取器要求同一关联组的图层格式、宽高和解码后存储身份一致，同时要求每个对应帧的 cel surface 具有相同格式、宽高和存储身份；组内任一成员指向不同资源、缺少对应 surface，或把 `linkedContentId` 用于背景、文本、Tilemap、自由瓦片图层时，工程视为损坏并拒绝打开。只有一个成员的关联 ID 仍按普通图层读取，之后复制可继续扩展该组。v1-v16 工程迁移时删除未知 `linkedContentId`，不根据重复像素猜测关联关系。

v16 在动画时间轴中新增 `loopSections`。每个循环节保存稳定 `id`、名称、`startFrameId`、`endFrameId`、`direction`（当前支持 `forward`、`reverse`、`ping-pong` 和 `ping-pong-reverse`）以及 `repeatCount`；正整数表示总播放次数，`null` 表示无限重复。端点必须引用现有帧，读取时按当前帧顺序规范化起止范围，重复 ID 只保留首项，无效端点或非法条目忽略，并限制名称和重复次数。v1-v15 工程迁移为空循环节列表，不采纳旧版本中偶然出现的同名未知字段。v16 同时允许 `layerStyles` 保存顶层 `enabled` 开关；缺少该字段的 v11-v15 样式按启用迁移。

v15 将自由瓦片源从单一多瓦片 Tileset 改为图层级 `freeTileSources`。每个源保存稳定 `id`、名称、可选描述与显示颜色、显隐、锁定、不透明度、混合模式、整数像素偏移和 `tilesetId`；对应 Tileset 必须只含一个瓦片，其宽高就是该源的动态尺寸。v15-v17 中该资源由单个图层独占，v18 起独占边界提升为 `freeTileSetId` 集合：同一集合的图层共同引用，集合之间及与 Tilemap 之间不得共享。每个非链接源 cel 的 `freeTiles.instances` 按从后到前保存稳定实例 ID、有效 `sourceId`、cel surface 本地整数像素锚点，以及可选 `visible`、`locked`、`flipHorizontal`、`flipVertical` 布尔值、`rotation` 整 `90°` 四分之一转数、实例不透明度和混合模式，不再保存 v14 `tileId` 引用。省略变换字段表示不旋转、不镜像；读取时拒绝非 `0..3` 的旋转值、非布尔镜像值，并继续验证源 ID、实例 ID、自由瓦片所有权与坐标，再按源属性、源像素和实例列表重新生成 cel surface。v14 工程的 `freeTileTilesetId` 会按原 Tileset 的稳定瓦片顺序拆成多个独立源，为每个源创建单瓦片 Tileset，再把旧实例 `tileId` 映射到新 `sourceId`。

v14 新增初版自由瓦片图层。图层使用 `kind: "free-tile"` 和 `freeTileTilesetId` 独占一个可包含多瓦片的项目 Tileset；每个非链接源 cel 使用 `freeTiles.instances` 保存稳定实例 ID、`tileId` 和本地像素坐标。v15 只保留这些字段作为迁移输入，当前写入器不得再输出 `freeTileTilesetId` 或实例 `tileId`。v1-v13 工程迁移时不创建自由瓦片图层或实例数据。

v13 新增项目级 `tilesets` 与可编辑 Tilemap cel。Tileset 使用稳定 ID 保存瓦片宽高、表格行列、逐瓦片稳定 ID、允许空位的 `tileSlots` 栏目布局和 RGBA 图集资源；`tileSlots` 只控制瓦片集排布，图集像素仍按 `tileIds` 紧凑保存。Tilemap 图层使用 `kind: "tilemap"` 标记，并以 `tilemapTilesetId` 保存所引用的项目 Tileset；多个 Tilemap 图层允许保存相同 ID。每个非链接源 cel 保存瓦片尺寸、网格行列和非空格子的 `index + tilesetId + tileId` 引用。cel 的栅格 surface 继续写入工程并供既有合成、缩略图和导出路径使用，但打开工程时会按 Tilemap 源数据重新生成，不能作为可编辑源。v1-v12 工程迁移时使用空 Tileset 集合，早期未保存 `tileSlots` 的 v13 数据按紧凑 `tileIds` 顺序补齐，普通栅格和文本语义保持不变。

v12 为普通栅格图层新增可选 `background` 元数据。`mode: "preset"` 同时保存纯色或内置图案 ID，`mode: "canvas"` 表示由普通图层转换；实际可编辑像素仍保存在图层与各帧 cel 的原栅格资源中。背景图层扩大画布时以扩大前可见画布为单位一次性平铺全部帧，普通图层吸色时排除背景图层，选择背景图层后恢复完整合成吸色。v1-v11 工程迁移时不创建背景标记，旧版本中同名未知字段不采纳。

v11 为普通图层和图层组新增可选 `layerStyles`，保存描边、阴影、内发光、颜色叠加和渐变叠加各自的启用状态与参数。图层样式跨帧共享，图层组样式作用于每帧组内合成结果，两者都不写入 cel 像素；v1-v10 工程迁移时保持无图层样式，v10 及更早版本中即使存在同名未知字段也不采纳。当前整体开关的兼容规则见 v16。

v10 将文档 `colorMode` 扩展为 `rgba`、`indexed`、`grayscale`。灰度文档的图层和 cel 继续使用 `.rgba` 或 `.rgba.tiles` 保存四通道像素，RGB 三通道必须保持相等，透明度独立保存；v1-v9 文件继续只包含 RGBA 或索引模式并按原语义迁移。索引文档的栅格像素只能引用 `paletteOrder` 中当前可见的颜色 ID，打开旧工程或替换、移除色板颜色时，隐藏 ID 自动映射到当前可见色板中最接近的 RGBA 颜色。

v9 为区域文本新增可选的 `boxWidth`、`boxHeight`，用于保存画布像素坐标下的固定文本区域。缺少这两个字段的 v1-v8 文本继续按单击创建的自适应尺寸文本处理；同时存在时，文本按区域宽度自动换行并裁切到区域高度。

v8 为可编辑文本新增可选的 `styleRuns`。每个区间以 UTF-16 字符索引保存 `start`、`end`，并可覆盖默认字号、行间距、字间距和 RGBA 颜色；区间规范化为有序、非重叠数据。缺少 `styleRuns` 的 v7 文本继续使用整段默认样式。

v7 新增可编辑文本图层。图层使用 `kind: "text"` 标记，每个动画单元格可保存 `text` 源数据，包括文本、字体、字号、行距、字距、间距模式、抗锯齿模式与颜色；间距模式缺失时使用字体自带间距。`originX`、`originY` 保存初始插入点，`transforms` 按顺序保存 `Ctrl+T` 的源矩形、目标矩形、旋转角度和可选倾斜参数。对应 cel 的栅格 surface 仍作为显示和兼容缓存；缺少新增字段时按未变换文本处理。v1-v6 项目继续作为普通栅格图层迁移。

v6 新增项目级 `slices` 数组；每个切片保存稳定 ID、名称和画布像素坐标下的矩形。v1-v5 缺失该字段时迁移为空数组，v5 的 `sparse-tiles-v1` 栅格语义保持不变。

`.moonsprite` 是 ZIP 容器，包含：

- `manifest.json`：文档元数据、调色板、图层顺序、动画时间轴、项目显示设置、编辑统计、缩时设置、选区描边设置和格式版本。
- `layers/<id>.rgba` / `layers/<id>.idx32`：密集图层的原始 RGBA 或小端序无符号 32 位稳定调色板 ID。
- `layers/<id>.rgba.tiles` / `layers/<id>.idx32.tiles`：稀疏图层的 64 x 64 分块容器。
- `masks/<id>.rgba`：单元格或图层组蒙版的灰度 RGBA 字节，每像素四字节；透明像素表示尚未绘制。
- `cels/<id>.rgba` / `cels/<id>.idx32`：密集 cel 的原始像素字节。
- `cels/<id>.rgba.tiles` / `cels/<id>.idx32.tiles`：稀疏 cel 的 64 x 64 分块容器。
- `tilesets/<id>.rgba`：Tileset 的连续 RGBA 图集；图集尺寸为 `columns * tileWidth` 乘 `rows * tileHeight`，边缘不足一个瓦片的区域以透明像素补齐。
- `timelapse/<id>.png`（仅旧工程和便携打包）：开启缩时录制后，在已提交编辑边界生成的压缩合成快照；`recordUndoSteps` 控制是否记录撤销、重做和历史跳转，旧工程缺少该字段时默认关闭。
- `preview.png`：可见图层合成后的预览图；恢复快照等低延迟写入可以省略，首页会在后台生成有界缩略图并单独缓存，不改写原工程。

v5 动画元数据至少包含一帧、当前帧、帧持续时间、循环状态、cel 与图层/帧的稳定关联，以及可选的逐帧图层组蒙版；v16 额外保存上述命名循环节，v17 额外允许关联图层的对应 cel 共用同一像素资源，v18 额外允许自由瓦片图层通过 `freeTileSetId` 共用源库。`layers/` 保留活动帧兼容位图和图层属性，动画 cel 像素独立写入 `cels/`；解码后活动帧图层表面引用对应 cel，画布工具不直接解析时间轴。早期 v2 文件没有 `cels/` 时，使用 `layers/` 位图补成活动帧 cel。

图层和 cel 清单项通过可选 `dataEncoding` 声明资源编码。缺失或为 `raw` 时按原始连续像素读取；`sparse-tiles-v1` 时按稀疏分块读取。写入器逐资源比较原始字节数与分块容器字节数，仅在分块更小时使用 `.tiles`，因此小型或密集表面仍保持原始表示。稀疏资源可通过 `runtime-raster.ts` 以分块存储延迟接入图层和 cel，合成与读取按需访问已存分块；需要连续 `pixels` 的编辑路径才实体化 `Uint8ClampedArray` 或 `Uint32Array`。层偏移与稳定存储原点保持画布和撤销坐标一致。不得把“读取 `.tiles`”等同于立即展开完整连续位图。

`sparse-tiles-v1` 使用 24 字节小端序头：magic `0x3154534d`、块尺寸 `u16`（固定 64）、格式 `u8`（RGBA 为 1，索引色为 2）、保留字节、宽 `u32`、高 `u32`、块数 `u32`、payload 字节数 `u32`。随后每块使用 16 字节目录项：`x u32`、`y u32`、宽 `u16`、高 `u16`、数据偏移 `u32`；payload 按目录顺序保存每块连续原始像素。未列出的块按全零恢复。读取器拒绝 magic、格式、尺寸、块边界、目录顺序、重复槽位、偏移或 payload 长度不一致的资源。

图层和图层组元数据可选保存 `displayColor`、`description`、`clippingMask: true` 与完整 `layerStyles`：顶层 `enabled` 控制整组样式是否参与合成，缺失时默认为 `true`；`stroke` 保存 `enabled`、RGBA `color`、`size`、`position`（`inside`、`outside` 或 `both`）、`kernel`（`round`、`square`、`horizontal` 或 `vertical`）、八方向布尔值 `directions`、`smartHue` 和 `smartHueDarkness`；`shadow` 保存 `enabled`、RGBA `color`、`offsetX`、`offsetY`、`blur`、`smartShadow` 和 `smartShadowDarkness`；`innerGlow` 保存 `enabled`、RGBA `color` 和 `size`；`colorOverlay` 保存 `enabled` 和 RGBA `color`；`gradientOverlay` 保存 `enabled`、RGBA `from`、RGBA `to`、`angle` 和 `dither`。描边尺寸限制为 `1-64 px`，智能色相与智能阴影的深色系数限制为 `0-100%`，内发光尺寸限制为 `1-32 px`，阴影偏移限制为 `-64-64 px`，阴影模糊限制为 `0-32 px`，角度规范化为 `0-359`；渐变抖动值与渐变工具共用 `none`、Bayer 和方向抖动枚举。非法或缺失参数使用默认值，旧数据缺少智能色相或智能阴影字段时保持关闭并使用 `45%` 深色系数，缺少渐变抖动时使用 `none`，缺少描边位置时使用 `outside`，缺少形状或方向时使用圆形四方向描边。`displayColor` 是 RGBA 列表标记，不参与像素合成；`description` 是悬停说明；`clippingMask` 表示显示内容受同级紧邻下方对象的最终透明度限制。每个动画 cel 可选保存独立 `mask`，图层组则在动画元数据中按 `groupId + frameId` 保存独立蒙版；两者都包含蒙版 ID、本地尺寸、偏移和 `.rgba` 数据文件，并可通过 `linkedMaskId` 独立引用另一蒙版。透明像素表示未绘制且不改变显示，非透明像素必须为灰度且完全不透明，`255` 完全显示、`0` 完全隐藏，中间值按比例缩放所有者的最终透明度。蒙版引用缺失、自引用或形成循环时工程无效。图层组还可选保存 `cumulativeBlend: true`，表示先将组内内容与外部背景合成，再应用一次组混合模式。

项目显示设置只保存像素网格、自定义网格开关及自定义网格原点和尺寸；缩放、平移、旋转、镜像等临时视图导航不写入工程。工程可选保存图层栏上下文，包括活动图层、图层与组选择、选择锚点和组展开状态；缺少字段或引用已删除对象时自动回退到有效活动图层。项目统计保存笔画数、已提交编辑数和有效绘画时长。缩时设置保存开关、撤销步骤录制开关、画质、导出帧率、缩时倍速和完整快照清单，不设固定快照数量上限，快照像素存放在本地录像库；旧工程及便携打包使用 `timelapse/`，旧工程缺少这些字段时使用关闭录制、关闭撤销步骤录制、空统计和默认网格。

工程级 `outlineSettings` 保存选区描边的 RGBA `color`、`thickness`、`position`、`kernel`、八方向 `directions`、`smartHue`、`smartHueDarkness` 和 `previewEnabled`。位置、形状、尺寸和方向使用与图层样式描边相同的枚举与限制；智能色相深色系数限制为 `0-100%`。旧工程缺少智能色相字段时按关闭迁移，并使用 `45%` 的默认深色系数，不改变原有固定颜色描边结果。

`timelapse/` PNG 已经自行压缩，当前写入使用 ZIP Store。打开工程时只扫描一次 ZIP 中央目录，再按清单路径直接读取 Layer、Cel、蒙版和其他必需资源；Store 快照以只读归档视图接入文档，不再逐张二次解压或复制，旧工程中的 Deflate 条目仍按原方式兼容解压。任何编辑产生的新快照使用独立字节数组，保存时两类快照保持相同文件语义。

v1 工程打开时先补成单帧时间轴；v2 工程保留原图层、组和动画数据并按“无蒙版”迁移；v3 工程保留原有 cel 蒙版并按“无图层组蒙版”迁移；v4 资源显式按 `raw` 读取。v1-v4 都迁移到内存 v5，首次保存时按当前稀疏度重写。v1-v12 缺少 Tilemap 数据时迁移为空 Tileset 集合，v1-v13 缺少自由瓦片数据时保持普通图层语义，v14 自由瓦片按上述规则拆分为 v15 独立源，v1-v15 动画时间轴补为空循环节列表，v1-v16 不创建关联图层身份，v1-v17 为每个自由瓦片图层生成不同的 `freeTileSetId`。cel、图层组、蒙版、Tileset、Tilemap、自由瓦片或关联图层引用无效，像素文件缺失、编码未知、格式与字节长度不匹配时必须拒绝打开；Tilemap 格子引用不存在的 Tileset 或瓦片 ID、自由瓦片源引用不存在或重复的 Tileset、实例引用无效 `sourceId`、重复实例 ID、混入旧 `tileId`、同一自由瓦片集合元数据不一致、跨集合所有权冲突，或关联组成员不共享同一栅格存储时同样视为工程损坏。`app` 不是 `MoonSprite`、尺寸非法、图层数据缺失或字节长度异常时必须拒绝，未知未来版本不得静默降级读取。

索引颜色文档保留颜色 ID `0` 表示透明；其他颜色 ID 在调色板重排后保持稳定。绘制、粘贴、文本栅格化和 RGBA 转换都不得自动扩张调色板，而是精确匹配或映射到 `paletteOrder` 中最接近的可见颜色。导出 PNG 时，只有合成结果不超过 256 个唯一颜色才保留索引输出，否则导出等效 RGBA 图像。

`paletteOrder` 继续保存可见颜色的稳定顺序，`paletteColumns` 与 `paletteSlots` 额外保存调色板的二维列数以及按行排列的颜色 ID 或空槽 `null`。旧 v2 工程缺少这些字段时使用 8 列并按 `paletteOrder` 从左到右填入完整行；非法、重复或已隐藏的颜色 ID 会被忽略，缺失的可见颜色补入第一个空槽。栏目尺寸变化只在显示时安全增减空白边缘，用户拖动颜色后才把当前二维布局写回工程。

当前读取器也接受 v19，并在内存中规范化为 v20；本地录像引用仅从 v20 起采纳，v19 及更早版本仍使用内嵌 `dataFile` 语义。缩时设置还保存 `mode`（`full` 或 `smart`），旧工程缺省值规范化为 `smart`；快照可选 `changeScore` 用于智能采样压缩，不改变 PNG 像素格式。

图层与蒙版可保存 `autoLinkAnimationCels: true`，表示启用自动关联动画单元格；缺省为关闭。它属于轨道文档属性，与手动 cel 链接及跨图层的 `linkedContentId` 分开保存，编解码须连同对应像素资源保留该开关。

## 本地色板文件

用户保存到软件的 `*.palette.json` 使用 `schemaVersion: 2`。`colors` 保存独立 RGBA 颜色，`columns` 保存二维列数，`slots` 按行保存颜色在 `colors` 中的索引或空槽 `null`；每个颜色索引必须且只能出现一次。读取时拒绝未知版本、非法列数、越界或重复索引。旧 `schemaVersion: 1` 色板仍可读取，其仅包含紧凑颜色列表，应用后按当前默认列数顺序排列。

修改格式时必须新增迁移策略、兼容测试和 ADR，不得直接改变已有版本的读取语义。

普通保存可以只重新编码发生变化的 cel、图层或蒙版数据，并从当前磁盘工程直接复制未修改 ZIP 条目的既有压缩块。未修改 v5 栅格复用时必须同时沿用源条目的路径、编码、宽高、偏移与 CRC，不能用运行时紧凑表面的几何覆盖清单；资源发生修改后才按当前表面重新选择 `raw` 或 `sparse-tiles-v1`。复用前必须核对条目路径与 CRC，合并失败时回退为完整编码；增量合并使用的内部保存计划不得写入最终工程。资源在 `raw` 与 `sparse-tiles-v1` 之间切换时路径随之变化，因此必须写入新资源，不得复用旧路径。

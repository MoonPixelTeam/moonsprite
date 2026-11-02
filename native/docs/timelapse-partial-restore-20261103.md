# 缩时记录部分恢复与打开提示

来源：legacy/core/project-format-timelapse.ts 的 restoreProjectTimelapse、project-format-timelapse-restore.test.ts，以及 workspace-commands-document-io.ts 的 openPath 完成提示。旧版丢失可选录制帧时保留作品及其余记录，报告丢失数、唯一原因、实际恢复数，避免把损坏工程描述成全部恢复。

## 本次承接

- 共享工程读器跳过无法识别的帧对象／必要元数据、缺失或空的嵌入数据、无效数值尺寸，按旧版三类原因报告；已恢复帧保留原顺序、时间与数据。
- 普通打开、备份文件打开和恢复工程接收报告，成功后显示“该工程的缩时记录有 N 帧无法恢复，已保留 M 帧。”，并记录 project.timelapse.restore 诊断及计数／原因。没有丢失时沿用正常打开状态，不制造警告。
- 报告是读取结果，不进入作品、撤销历史或工程元数据。后台读取在候选发布后才操作界面。
- 对录制PNG资源沿用旧版归档索引语义；保存时重建已保留快照的资源，清理已跳过帧的旧PNG，其余工程资源保持。打开不写源文件；另存后重新打开不重复报告同一批丢失帧。

## 保留的原生边界

未知字段／重复或原生不可表示的ID／本地与嵌入数据歧义、超过2400px的录制帧、PNG签名及尺寸不匹配、ZIP结构／CRC和资源预算错误仍拒绝，不把整体容器损坏当作可选帧缺失。本次未承诺旧版所有宽松元数据转换：尺寸仍要求JSON数值，旧版把数值字符串转换为Number的情形未承接；本地录制chunk是否存在仍由原有录制存储流程检查。

## 验收

独立 timelapse-restore-tests 使用与旧版相同的三帧样本并实际重打包归档，覆盖完整、缺失、空载荷、全部缺失、零尺寸、缺少ID、混合原因、未知字段／坏PNG／原生尺寸与预算保护；验证原因去重及计数、源字节不变、作品像素／历史／dirty和保存重开及载荷数量。

正式程序 --timeline-gif-drop-check 增加普通打开的完整／缺失／无效尺寸／无ID／全部缺失，及混合损坏的恢复工程入口；检查精确中文提示、像素、保留数、正常／恢复dirty语义、原作品保护和源文件不变。

验收结果：唯一正式Release构建、timelapse-restore-tests、既有timelapse-tests和正式程序--timeline-gif-drop-check均返回0；553文件来源覆盖及git diff --check通过。未做人工操作或截图验收；不宣称整个工程恢复领域已完全等价。


## 后续：旧版元数据转换与默认值

本节取代前文“数值字符串转换未承接”及“同时有本地与嵌入字段时拒绝”的当前状态。直接承接 restoreProjectTimelapse 的 Number转换，以及 project-metadata.normalizeTimelapseSettings 和 validTimelapseReference 的类型、默认值、取整与范围规则。

- 尺寸和时间支持数值字符串、十／十六／二／八进制、空白和旧版JSON值转换；尺寸仍按安全正整数验证，时间取整且不小于0，无法转换的时间归0。
- enabled／recordUndoSteps只把布尔true视为开启；quality／mode不匹配时回默认；fps／speed只接受有限JSON数字，按旧版四舍五入和范围处理，数值字符串不会当作设置值。
- changeScore只接受有限JSON数字；字符串或其他值不当作有效评分，原生以既有0表示缺省评分。
- snapshots不是数组时按空记录处理，根timelapse不是对象时按默认设置处理。
- 字符串dataFile优先于local，包括忽略未选中local的元数据；空字符串仍是嵌入分支，报缺失数据。dataFile不是字符串时可以使用有效本地引用；本地offset等仍要求真正的安全整数，不宽松转换。

必要原生适配：复用WinRT JSON和独立C数值区域设置，避免机器区域设置改变小数含义；不引入JS运行环境。测试对照覆盖普通JSON转换，未宣称所有会触发JavaScript对象自定义转换异常的畸形元数据等价。未知字段、ID／路径限制、2400px、PNG／ZIP／CRC和预算保护保持；正无穷时间不能由原生工程数值表示，继续明确拒绝。本地chunk修复不在本次范围。

验证新增58组直接用Node Number生成的参考值，涵盖负零、字符串语法／Unicode空白、进制与大数舍入、溢出／下溢、数组等；13组真实ZIP变体覆盖转换、设置缺省、时间、数据优先级及保存重开，并扩展正式打开入口。验收结果：正式Release构建、timelapse-restore-tests（58组Number参考值与13组元数据归档场景）及正式程序--timeline-gif-drop-check均返回0；554文件来源覆盖和git diff --check通过。未做人工鼠标或截图外观验收。


## 后续：本地录像读取与失败保护

来源为 `legacy/src/renderer/src/platform/timelapse-library.ts`、`legacy/src-tauri/src/platform_timelapse.rs` 及 `timelapse-library-service.ts`／对应测试。

原生 Session 的直接读取与交给预览、导出、便携保存的读取回调现共用 readRecordingFrame，移除两处不同的英文缺失提示，改用旧版原文：“缩时录像不在本机。请从原电脑打包携带录像的工程后重新打开。”内嵌字节优先于本地引用；没有内嵌数据时才校验并读取本地引用。回调按值持有路径，不依赖 Session 生命周期。

本地库既有规则保持：只有正式目录的录像块不存在才查询旧版目录；正式目录存在的录像块截断、校验失败或不可访问时直接传播错误。普通工程及恢复归档只保存引用，不预读本地录像，不因当前机器缺少录像而丢弃作品或录像引用。便携打包读取失败不把已经读取的部分发布回当前文档，不自动修复、删除、截断或覆盖本地录像。

新增核心回归覆盖内嵌优先、无效／缺少引用、缺失文件、旧目录读取、脱离Session的回调、正式块截断及CRC损坏不回退、不可用录像的普通／恢复归档，以及首帧成功后第二帧失败的便携打包，检查作品像素、历史、dirty、引用、旧库数据和无额外目录写入。

验收结果：唯一正式Release构建及timelapse-tests返回0；554文件来源覆盖及git diff --check通过。未做人工预览／导出操作或截图验收。本次没有增加视频编码能力，也没有改变此前已登记的原生格式及预算边界。

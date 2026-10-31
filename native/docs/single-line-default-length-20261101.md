# 通用单行输入框默认长度迁移（2026-11-01）

## 问题及结果

原生通用PixelEntry构造时统一设置256字符上限，旧版通用TextInput没有这一默认限制。旧工程或应用传入超过256字符的值虽能显示，之后却可能无法继续输入；在长值中粘贴时，继承控件还会把整段结果裁至上限，连原有尾部也可能丢失。

本批移除通用输入框的人为256上限。继续使用MIT Entry的插入、粘贴、选择、内容通知和本地历史路径。明确设置长度限制的业务字段仍使用既有setter覆盖默认值；没有更改这些字段的产品限制、数值规则、界面素材或布局。

## 来源和必要适配

- `legacy/src/renderer/src/components/TextInput.tsx` 的 `InputHTMLAttributes<HTMLInputElement>` 与 `<input {...props}>`，未默认指定maxLength。
- `legacy/src/renderer/src/components/NumberInput.tsx` 的inputProps转发同样没有统一256限制。
- `native/.cache/aseprite/src/ui/entry.cpp` 的构造参数、setMaxTextLength和插入／粘贴命令；许可见相邻 `LICENSE.txt`。其API要求整数上限，原生适配使用int的可表示上限模拟未设默认maxLength，未声称存在无限可用内存。
- `native/src/native_widgets.h` 仅调整默认构造参数；业务显式setMaxTextLength调用保持原状。

## 行为证据与验收范围

`native/scripts/capture-entry-history.cjs` 在实际Edge156.0.4314.50新增8个场景24条观测，涵盖255／256／512字符后继续输入、中间插入保留尾部、长粘贴、选区替换、中文长值、1024字符粘贴及各自撤销／重做。全部3639条观测中3629条为规范对照，既有10条浏览器历史缺陷仍仅保留为证据。

正式 Release 构建成功；同一正式程序 `--text-tool-check` 实际退出码0，全部3629条规范观测回放通过。来源登记覆盖542个文件通过，`git diff --check` 通过；来源覆盖不代表整体行为已等价。没有新增性能基准或人工截图验收。

本批不宣告显式maxLength在UTF16计数、代理对和复杂字形中的行为已等价；已有各业务字段显式限制的来源另有迁移范围。完整IME、极长文本性能和逐像素滚动仍有缺口。项目文件保存格式和系统文件名／路径约束不在本批改动范围。

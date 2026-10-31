# 共享输入框文本剪贴板

## 来源与发现

旧版`TextAreaInput.tsx`使用浏览器textarea，`TextToolDialog.tsx`在文字变化时协调UTF16样式，不自行接管复制／剪切／粘贴。本次沿用浏览器实际操作语义，系统实现适配到已使用的MIT UI与MIT clip库。

原生`ui::set_clipboard_text/get_clipboard_text`只转发`UISystem::clipboardDelegate`，默认指针为空。此前应用没有注册这个接口，已有多行输入框与继承UI Entry的单行输入框无法通过它访问系统剪贴板；色卡等直接调用clip的能力属于另一条既有链路。

## 实现

- 在应用UI系统存活期间注册NativeTextClipboard，复用现有clip文本后端。作用于已有UI输入控件，退出时恢复之前的delegate，不另建剪贴板存储。
- 输出按Windows浏览器的CRLF规则规范换行，已有CRLF不重复添加CR；多行粘贴继续将CRLF／独立CR规范为LF。中文与补充平面字符沿用现有UTF8／U32／UTF16转换及样式协调。
- 多行输入框承接Ctrl+C／X／V，并补上Ctrl+Insert复制、Shift+Insert粘贴、Shift+Delete剪切。
- 没有选区的复制／剪切不写剪贴板、不改内容或历史；剪切仅在系统文本写入成功后删除选区。后端返回失败或抛出clip的运行异常时，多行框保留文字及选区。
- 区分“无文字格式／读取失败”和“成功读取有效空文本”。前者不编辑，后者按旧版浏览器实际行为用空文本替换选区；有选区时会产生一次可撤销删除。
- 复制不生成文字历史；剪切和粘贴沿用一次本地替换事务，撤销恢复原内容与范围，重做恢复结果。没有增加文档历史或改动色卡／图像剪贴板协议。

## 验证

`node native/scripts/capture-text-clipboard.cjs`在临时浏览器上下文中记录Edge 156.0.4314.50的216条实际键操作，保存于`tests/fixtures/text_clipboard_browser.h`。覆盖六种快捷键、正反向及空选区、中文／Emoji、多行、正常与空文本、CRLF和独立CR。临时HTTPS页面由Playwright拦截提供，不连接真实站点或用户浏览器会话。

正式Release构建及`--text-tool-check`通过（退出码0）。实际原生控件键消息逐条核对216条内容、选区及剪贴板结果；核对UTF16同步、一次撤销／重做、无操作不增加历史、写入返回失败／抛异常、读取返回失败／抛异常及缺失delegate。现有单行PixelEntry的复制／粘贴也通过同一delegate验证。检查通过既有delegate接口注入内存后端，结束恢复正式接口，不改用户系统剪贴板。现有换行、鼠标、按词操作与输入法提交检查同次通过。527文件来源与登记快照核对通过。

## 保留边界

系统clip后端复用既有实现并核对源码，本轮未执行跨应用真实剪贴板写入、锁竞争及富格式交互验收。UI Entry原库的单行剪切失败回滚不在本轮已验证范围；本次失败保护明确适用于PixelTextArea。右键编辑菜单、组合输入及整体文字输入等价性仍有缺口，不把共享接口接通等同于全部输入功能完成。

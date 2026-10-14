# 原生工程保存合同 D2.2

保存顺序为纯编码、同目录临时写入与Flush、读取比对及导入校验、原子替换，之后才调用Document.acceptSaved。应用路径只在成功返回后更新。当前调用同步且不泵UI输入，因此编码与acceptSaved之间无编辑竞态；未来异步化必须增加源身份和完整文档revision快照检查，不能仅比较像素revision（色卡元数据也能变化）。

来源：legacy/store/document-file-service.ts saveDocumentFile保存队列、失败传递和result.revision；workspace-commands-document-io.ts:388保存代次匹配才clean。workspace-commands-history.ts undo/redo通过touch(session,true)标dirty。因此本次纠正原生“返回保存cursor自动clean”差异：undo/redo成功均dirty，只有成功保存清除dirty。预览取消保留开始前dirty；无实际像素变化不新增修改。增量历史及像素存储不改变。

定向测试包括新建→笔刷→加入重复颜色/隐藏色卡条目/透明颜色→编码→原生解码/导入重开；身份、尺寸、关系、帧时长、精确透明RGB、色卡entries/order/slots/nextID保持。已有legacy RGBA样本往返保留ID、name、loop和透明RGB；encode不清dirty或改history；真实原子保存成功clean；作为目录的目标、文件作为父路径、锁定现有目标导致失败时原文件字节/Document基线/dirty不变，临时文件清理；后续成功覆盖重开一致。Undo/redo均dirty；活动预览不能编码。

验收均使用合成临时样本，不碰用户工程。此合同仅适用于已准入单层单帧RGBA；未知资源不能被编码器静默舍弃。没有承诺恢复、多文档或异步保存。

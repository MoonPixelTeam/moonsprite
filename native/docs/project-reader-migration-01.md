# D2.0 工程容器与RGBA解码首增量

已从隔离开发补丁集成到 native，包含容器读取器、测试及 legacy 样本生成脚本。

## 已实现

Archive读取ZIP32中央目录、stored/raw-deflate条目、输入/展开/逐条读取预算、CRC与本地/中央头对应检查；明确拒绝ZIP64、分卷、加密、未知压缩、重复条目和截断。

decodeRgba读取raw与sparse-tiles-v1，对齐64px瓦片、边缘残片、顺序偏移、重复槽、payload长度进行验证；保留透明像素非零RGB，不偷偷归零。所有解压在内存，名称不参与文件系统写入。

## 实际验证

已在隔离目录用MSVC Release编译并通过project-reader-tests。样本生成器调用legacy真实encodeSparseRasterData函数和fflate zipSync（stored/deflate两种），没有另写参考编码器。测试覆盖raw字节顺序、隐藏RGB、130×66边缘稀疏瓦片、空稀疏图、截断、CRC错误、缺资源、预算、尺寸溢出和错误sparse偏移/长度。

## 明确缺口

这不是完整decodeProject，没有manifest JSON/版本迁移/层帧cel关系、链接、资源映射，也没有打开UI、写入或恢复。JSON依赖aseprite/json11子模块为空，固定gitlink a4e1714f5592dbe9a9f11539e6f8742477f1d6b6下载遭连接重置，未替换为自制JSON。

当前稀疏解码返回受预算约束的dense像素，供后续小型RGBA导入适配；尚未移植legacy runtimeRaster稀疏常驻性能策略，不得宣称完整稀疏工程性能迁移。没有接入Document、撤销快照或用户工程写入。

## 集成

源：native/src/project_reader.{h,cpp}；测试：native/tests/project_reader_test.cpp；生成器：native/scripts/make-project-reader-fixtures.cjs。
CMake 已给独立 moon-project-reader 库链接已有 zlibstatic 并设置 include，project-reader-tests 依赖 fixture 生成目标。生成fixture：node native/scripts/make-project-reader-fixtures.cjs <repo-root> <build-fixtures-dir>，要求Node支持node:module stripTypeScriptTypes及legacy fflate已安装；生成器对迁移导致node_modules链接断开可只读定位唯一pnpm缓存。
然后project-reader-tests <build-fixtures-dir>。不要提交fixture生成物、隔离build或隔离CMakeLists.txt。

## 来源登记

4个新增源码/测试脚本均依据legacy/src/renderer/src/core/project-format-zip.ts、project-format-raster.ts、project-format-manifest-types.ts。测试错误边界还参考project-decode-errors.test.ts及project-format.test.ts。原生适配：zlib替代fflate解压，uint32小端RGBA替代JS字节视图；安全校验显式错误与预算。新增文件已登记 legacy-provenance.json，覆盖检查通过；整体保持 INCOMPLETE。

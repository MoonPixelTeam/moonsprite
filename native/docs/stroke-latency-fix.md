# 绘制跟随延迟：定向修复

定位到的实际偏差：画笔每个 MouseMove 都 invalidate 整个 Editor，绕过已有画布局部快路径，同时重绘字体、菜单与右栏。legacy canvas-input-stroke 的 invalidateStrokeSegment / requestDraw:scheduleDraw 分离局部内容失效与绘制调度。laf Manager 已保留输入队列并在 pump 后批量 paint，无需丢弃轨迹样本或另加定时器。

现在保留每个输入点及连续笔画插值，只在像素 revision 改变时失效投影到屏幕的脏矩形；预览区单独失效。首次 dirty 标题、结束笔画的命令状态仍更新。多次连续 revision 的脏区累积到 renderer 下一次 sync，避免一帧多条输入导致整图逐像素上传。未更改 blend/透明像素上传语义。

D1 单 Surface 直接 vector 访问并非逐像素关系查找。隔离核心微基准也显示32像素画布笔1更新 p95 1.6微秒，不能解释明显拖尾；该数字不包含UI。

## 验证与限制

Release构建、核心测试、原生smoke通过。512点蛇形轨迹逐点验证像素端点、撤销与重做；5种zoom×3种笔刷尺寸、50%透明度折线与取消通过。跨两次revision的局部上传测试确认只上传2像素。没有修改或关闭用户运行窗口、没有删除画布或恢复数据。

下面是同进程合成 MouseMessage + 软件绘帧回放，旧路径包含Editor chrome但不含子控件绘制，所以是旧成本下界。它证明CPU重绘热点已移除，**不是实际鼠标硬件到显示器的端到端延迟测量**。Windows输入/显示驱动现场是否还有残余延迟，需在新的preview实际拖绘复测。

```
Native mouse-message + software paint replay; 512 preserved serpentine samples. Full chrome excludes child paints (old lower bound); not hardware input-to-photon latency.
full-chrome input mean_us=39.4838 p95_us=58.1 max_us=288 paint mean_us=2358.89 p95_us=3180.3 max_us=5189.1 chrome_paints=512
dirty-canvas input mean_us=12.8264 p95_us=17.1 max_us=346.1 paint mean_us=12.2143 p95_us=17.3 max_us=44.6 chrome_paints=0
Static centers and rapid folded endpoints passed at zoom 1/2/4/8/16, brush 1/5/64, opacity50; cancel restored all pixels.
```

启动器已指向 build/stroke-latency-preview/moonsprite-native.exe。新增角色按钮/最近色任务暂停，尚未写入共享代码。

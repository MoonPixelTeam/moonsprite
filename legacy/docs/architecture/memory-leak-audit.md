# 内存泄漏 / 内存堆积审计报告（"越用越卡"根因排查）

> **文档目的**：本文件是机器可读的结构化审计结果，供后续 AI / 工程师直接解析与接手。
> **范围**：`src/renderer/src`（约 540 个测试文件规模的前端）与 `src-tauri/src`（Rust 后端，约 13,713 行）。
> **审计日期**：2026-10-08
> **审计方式**：纯静态审计（只读），通过对热点子系统全量 Read + 全仓库 grep 交叉验证调用图。**未修改任何代码。**
> **修复状态（2026-10-09）**：第 0–6 节保留静态审计时的记录，不能代表当前代码。F-01～F-04 已实现修复；F-05 经调用链和真实 Lua 回滚测试确认无需修改。修复范围、实测数据与验收状态见[第 7 节](#7-修复与验收2026-10-09)。F-01 只协调已注册缓存，并非进程总内存限制；F-02 的返回像素不得立即归还，以下示例已更正。
> **解析约定**：每个发现以 `FINDING` 块给出，字段固定为 `ID / 严重度 / 类别 / 位置 / 证据 / 机理 / 影响 / 增长量级 / 修复建议 / 验证方式`。所有 `位置` 均为 `文件:行号`，可直接跳转。

---

## 0. 结论摘要（TL;DR）

审计发现 **5 处**与"越用越卡"相关的缺陷，其中：

- **1 处 P0**：全局内存压力阀（256MB 软限 / 512MB 硬限）在生产环境**完全不可达**——整条压力链路是死代码。
- **1 处 P1**：为 4K 画布设计的 `BufferPool` **从未被归还过**，缓存池永远为空，所有合成路径退化为每次新分配。
- **3 处 P2/P3**：局部缓存未随文档/窗口释放，属于"延迟回收"与"永久驻留"级别，不是主要卡顿来源。

**最重要的结论**：本项目的绝大多数缓存**已经被正确界定上界**（见第 3 节，共 58 个子系统逐一核验为"有界"）。真正的"越用越卡"风险不在"某处 Map 无限增长"，而在 **F-01（压力阀失效）** 与 **F-02（池化失效）** —— 即"本该生效的兜底机制根本没接上线"。

---

## 1. 严重度总览表

| ID | 严重度 | 类别 | 位置 | 一句话描述 | 是否持续增长 |
|---|---|---|---|---|---|
| F-01 | **P0** | 兜底机制失效 | `src/renderer/src/core/global-cache-manager.ts:76,99,120` | 全局内存压力检测/裁剪链路无任何生产调用方，256MB/512MB 阀值形同虚设 | 否（是"该刹车却没刹车"） |
| F-02 | **P1** | 池化失效 | `src/renderer/src/core/buffer-pool.ts:52,118` | `releaseCompositeBuffer` 零生产调用方，缓存池恒为空，大画布每次合成新分配 | 否（是 GC 抖动 + 堆碎片） |
| F-03 | **P2** | 释放不彻底 | `src/renderer/src/core/document-composite-cache.ts:86` | `dispose()` 只释放样式预算，`propertyComposite`（强引用 Map，上限 64MB）等 7 项残留 | 否（延迟回收） |
| F-04 | **P3** | 模块级缓存无清理 | `src/renderer/src/components/extensions/extension-window-theme.ts:8` | `images` Map 永久驻留 base64 光标 DataURL，无淘汰路径 | 是（受扩展资源数封顶） |
| F-05 | **P3** | 单次操作内累积 | `src-tauri/src/platform_scripts/lua_api.rs:778,797,3166` | 脚本运行期间的 checkpoint 日志 Vec 单调增长，仅在一次脚本结束才清空 | 是（脚本运行期内） |

严重度定义：

- **P0**：使整体内存治理失效，会放大其它所有缺陷。
- **P1**：直接命中应用最大的分配路径（4K 画布单次 64MB），造成 GC/碎片抖动。
- **P2**：对象已从注册表移除，内存最终会被 GC 回收，但回收时机不可控。
- **P3**：量级小且受外部基数封顶，长期驻留但不构成"越用越卡"。

---

## 2. 确认的发现（Confirmed Findings）

### F-01 — 全局内存压力阀在生产环境不可达（P0）

```yaml
ID: F-01
严重度: P0
类别: 兜底机制失效 / 死代码
位置:
  - src/renderer/src/core/global-cache-manager.ts:63   # onMemoryPressure 定义
  - src/renderer/src/core/global-cache-manager.ts:76   # checkMemoryPressure 定义
  - src/renderer/src/core/global-cache-manager.ts:99   # trimToTarget 定义
  - src/renderer/src/core/global-cache-manager.ts:120  # handleMemoryPressure 定义
  - src/renderer/src/core/global-cache-manager.ts:143  # 单例导出
```

#### 证据

`global-cache-manager.ts:24-25` 声明了完全符合预期的预算：

```ts
const DEFAULT_SOFT_LIMIT_BYTES = 256 * 1024 * 1024  // 256MB
const DEFAULT_HARD_LIMIT_BYTES = 512 * 1024 * 1024  // 512MB
```

`global-cache-manager.ts:76-97` 实现了压力分级与回调派发：

```ts
checkMemoryPressure(): MemoryPressureLevel {
  const totalBytes = this.totalBytes()
  this.lastCheckBytes = totalBytes

  const level: MemoryPressureLevel['level'] =
    totalBytes >= this.hardLimitBytes ? 'critical'
    : totalBytes >= this.softLimitBytes ? 'moderate'
    : 'none'
  ...
  if (level !== 'none') {
    for (const callback of this.pressureCallbacks) callback(result)
  }
  return result
}
```

`global-cache-manager.ts:120-129` 实现了裁剪动作：

```ts
handleMemoryPressure(): number {
  const pressure = this.checkMemoryPressure()
  if (pressure.level === 'none') return 0

  const targetBytes = pressure.level === 'critical'
    ? this.softLimitBytes * 0.7  // Drop to 70% of soft limit on critical
    : this.softLimitBytes * 0.85  // Drop to 85% of soft limit on moderate

  return this.trimToTarget(targetBytes)
}
```

**对全仓库 `src/renderer/src` 的精确 grep（排除 `.test.` 文件）结果：**

```
$ grep -rn "checkMemoryPressure|handleMemoryPressure|trimToTarget|onMemoryPressure" src/renderer/src | grep -v "\.test\."
src/renderer/src/core/global-cache-manager.ts:63   onMemoryPressure(callback ...)      # 定义
src/renderer/src/core/global-cache-manager.ts:76   checkMemoryPressure(): ...          # 定义
src/renderer/src/core/global-cache-manager.ts:99   trimToTarget(targetBytes: ...)      # 定义
src/renderer/src/core/global-cache-manager.ts:120  handleMemoryPressure(): number       # 定义
src/renderer/src/core/global-cache-manager.ts:121    const pressure = this.checkMemoryPressure()  # 内部调用
src/renderer/src/core/global-cache-manager.ts:128    return this.trimToTarget(targetBytes)      # 内部调用
```

**四个入口全部只有定义、没有任何外部调用方。** `handleMemoryPressure` 与 `checkMemoryPressure` 的唯一调用来自 `handleMemoryPressure` 自身内部；`trimToTarget` 的唯一调用来自 `handleMemoryPressure` 内部；`onMemoryPressure` 注册回调数为 **0**。

`globalCacheManager` 单例的全仓库引用（排除测试）：

```
$ grep -rn "globalCacheManager" src/renderer/src | grep -v "\.test\."
src/renderer/src/core/global-cache-manager.ts:143   export const globalCacheManager = new GlobalCacheManager()
src/renderer/src/core/layer-style-cache-budget.ts:2 import { globalCacheManager, ... }
src/renderer/src/core/layer-style-cache-budget.ts:59 this.unregister ??= globalCacheManager.register(this.asCacheProvider())
```

即：**唯一**与单例交互的生产代码是 `LayerStyleCacheBudget` 的注册（`layer-style-cache-budget.ts:59`），而它自身在 `add()` 内已有独立紧缩循环（`layer-style-cache-budget.ts:56-71`）：

```ts
add(entry: Reservation): void {
  this.unregister ??= globalCacheManager.register(this.asCacheProvider())
  this.bytes += entry.bytes
  this.touch(entry)
  while (this.bytes > this.limitBytes) {   // 自带上界，无需外部 trim
    const oldest = this.lru.keys().next().value
    ...
  }
}
```

#### 机理

`GlobalCacheManager` 采用**拉取式（pull-based）**设计：压力等级不是在增长时被动触发，而是需要外部在某处主动轮询 `checkMemoryPressure()`（或调用 `handleMemoryPressure()`）。代码库中**不存在这个轮询者**——没有 `setInterval` 周期性调用，没有在内存告警事件上绑定，也没有在合成/导入等大分配点显式调用。

因此：

1. `pressureCallbacks` 永远是空集合 → 即便有人调用 `checkMemoryPressure()` 也不会有人响应。
2. `trimToTarget()` 永远不会被触发 → 注册进 `providers` 的提供者**永远不会被要求裁剪**。
3. 256MB 软限 / 512MB 硬限这两个数字**只是常量**，从未参与任何运行时判断。

**关键推论**：项目当前之所以没有出现崩溃，恰恰是因为各个缓存**各自有独立的硬上界**（见第 3 节）。也就是说，`GlobalCacheManager` 名义上是"最后一道防线"，实际它从来没有承接过任何一次真正的压力裁剪。任何**未来**新增的、自身没有严格上界的缓存如果按现有惯例注册进 `globalCacheManager` 并"依赖它兜底"，就会静默地无限增长。

此外，`handleMemoryPressure()` 的裁剪策略存在一个隐藏问题：它对所有提供者**平均分摊**裁剪目标：

```ts
const perProviderTarget = Math.ceil(neededBytes / providers.length)
for (const provider of providers) {
  const freed = provider.trim(perProviderTarget)
  freedBytes += freed
  if (this.totalBytes() <= targetBytes) break
}
```

即使把轮询接上，由于 `trimToTarget` 每次循环都重新调用 `this.totalBytes()`（`global-cache-manager.ts:107`、`:118`），每次迭代都会遍历全部提供者并调用其 `snapshot()`，在提供者数量多时这本身就是一个 O(n²) 的路径。当前只有 1 个提供者，尚不构成问题，但修复 F-01 时应一并考虑。

#### 影响

- 内存治理的"总闸"失效，全部压力依赖各缓存自律。
- 任何新增的大缓存都没有兜底，属于**结构性风险**而非当前已发生的泄漏。
- 无法通过 `globalCacheManager.snapshot()` 观测到除样式缓存外的任何缓存占用（观测能力同样缺失）。

#### 增长量级

无直接增长。它是**放大器**：一旦有缓存失去自律，不会有任何机制阻止其增长到进程 OOM。

#### 修复建议

三选一（推荐 A）：

**A. 接入一个低频轮询者（最小改动）**
在应用启动处（`src/renderer/src/platform/` 或 `main.tsx` 附近的初始化入口）注册一个生命周期级定时器：

```ts
// 伪代码，示意位置；需放在应用级初始化、且只执行一次
const id = window.setInterval(() => globalCacheManager.handleMemoryPressure(), 30_000)
```

同理可注册回调以刷新诊断面板：

```ts
globalCacheManager.onMemoryPressure((level) => reportMemoryPressure(level))
```

注意：`usage-statistics.ts:47` 已有一个 60s 应用级定时器，可作为放置位置与"单次初始化"守卫（`if (initialized) return initialized`）的参考范式。

**B. 改为推送式（push-based）**
在 `register()` 传入的提供者内部自行上报增长，由 `GlobalCacheManager` 在累计字节超阈值时同步触发 `trimToTarget`。改动面较大。

**C. 明确废弃并删除**
如果团队决定各缓存自律即可，那么应删除这 144 行死代码，**并把这条结论写入文档**——否则下一位维护者会继续以为这里有兜底。

#### 验证方式

```bash
# 断言四个入口在生产代码中无外部调用方（当前输出应有且仅有定义处）
grep -rn "checkMemoryPressure\|handleMemoryPressure\|trimToTarget\|onMemoryPressure" src/renderer/src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

修复后该命令应出现调用点；同时 `src/renderer/src/store/memory-lifecycle.test.tsx` 中依赖 `globalCacheManager.snapshot().length` 的断言仍应通过。

---

### F-02 — `BufferPool` 从未被归还，池恒为空（P1）

```yaml
ID: F-02
严重度: P1
类别: 池化失效 / 分配抖动
位置:
  - src/renderer/src/core/buffer-pool.ts:46    # acquire 的分配兜底（生产中恒走此分支）
  - src/renderer/src/core/buffer-pool.ts:52    # release 定义
  - src/renderer/src/core/buffer-pool.ts:118   # releaseCompositeBuffer 定义
  - src/renderer/src/core/buffer-pool.ts:82    # clear 定义
  - src/renderer/src/core/document-composite-raster.ts:28   # 实际 acquire 点 A
  - src/renderer/src/core/document-composite-raster.ts:332  # 实际 acquire 点 B
```

#### 证据

模块头注释（`buffer-pool.ts:1-6`）明确说明了设计意图与量级：

```ts
/**
 * Buffer Pool for Uint8ClampedArray reuse
 *
 * Reduces GC pressure by reusing buffers for common canvas sizes.
 * Critical for 4K+ canvas operations that would otherwise allocate 64MB+ per composite.
 */
```

池的档位包含 4096×4096（`buffer-pool.ts:17-23`）：

```ts
private readonly commonSizes = [
  256 * 256 * 4,      // 256x256
  512 * 512 * 4,      // 512x512
  1024 * 1024 * 4,    // 1024x1024
  2048 * 2048 * 4,    // 2048x2048
  4096 * 4096 * 4,    // 4096x4096 (64MB)
]
```

`acquire()` 在没有可用缓存时直接新分配（`buffer-pool.ts:29-47`）：

```ts
acquire(minBytes: number): Uint8ClampedArray {
  const poolSize = this.commonSizes.find(size => size >= minBytes) ?? minBytes

  const pool = this.pools.get(poolSize)
  if (pool && pool.length > 0) {
    const pooled = pool.pop()!
    ...
  }

  // Allocate new buffer
  return new Uint8ClampedArray(minBytes)     // <-- 第 46 行
}
```

`release()` 只接受**精确等于**档位大小的缓冲区（`buffer-pool.ts:52-57`）：

```ts
release(buffer: Uint8ClampedArray): void {
  const size = buffer.byteLength

  // Only pool common sizes
  const poolSize = this.commonSizes.find(s => s === size)
  if (!poolSize) return
  ...
}
```

**对全仓库 `src/renderer/src` 的精确 grep（排除 `.test.` 文件）结果：**

```
$ grep -rn "releaseCompositeBuffer|acquireCompositeBuffer|globalBufferPool" src/renderer/src | grep -v "\.test\."
src/renderer/src/core/buffer-pool.ts:106  export const globalBufferPool = new BufferPool()
src/renderer/src/core/buffer-pool.ts:111  export const acquireCompositeBuffer = (width, height) => ...
src/renderer/src/core/buffer-pool.ts:112    return globalBufferPool.acquire(width * height * 4)
src/renderer/src/core/buffer-pool.ts:118  export const releaseCompositeBuffer = (buffer) => ...
src/renderer/src/core/buffer-pool.ts:119    globalBufferPool.release(buffer)
src/renderer/src/core/document-composite-raster.ts:6    import { acquireCompositeBuffer } from './buffer-pool'
src/renderer/src/core/document-composite-raster.ts:28   if (!output) output = acquireCompositeBuffer(width, height)
src/renderer/src/core/document-composite-raster.ts:332  if (!output) output = acquireCompositeBuffer(width, height)
```

结论：

- `releaseCompositeBuffer` 的调用方 **为 0**。测试文件 `buffer-pool.test.ts:2,8,14,15,21,22` 是唯一的引用来源。
- `globalBufferPool.clear()`（`buffer-pool.ts:82`）**无任何调用方**——即便想"在内存压力下清空池"也无处触发。
- `acquireCompositeBuffer` 只被 `document-composite-raster.ts` 的两条热合成路径使用（`:28` 的 `compositeNormalLayers`、`:332` 的 `compositeLayerStackInto`）。

#### 机理

`acquire` 与 `release` 是**成对契约**，而这对契约在生产代码中只实现了一半。

`document-composite-raster.ts:24-28` 的语义是"**调用方不传 `output` 时**，我替你分配一个"：

```ts
export const compositeNormalLayers = (..., output: Uint8ClampedArray<ArrayBufferLike> | null = null, ...): Uint8ClampedArray => {
  // Use buffer pool if no output buffer provided
  if (!output) output = acquireCompositeBuffer(width, height)
```

这个函数**把 `output` 直接返回给调用方**，函数本身无法判断该缓冲区何时不再被需要。因此归还动作理应由调用方在其使用结束后执行 `releaseCompositeBuffer(...)`——但没有任何调用方这样做。

于是每次走到这条分支：

1. `this.pools.get(poolSize)` 在首次运行后永远取不到东西（因为从未 `set` 过）。
2. 每次都执行 `new Uint8ClampedArray(minBytes)`。
3. 4096×4096 画布上，`minBytes = 4096 * 4096 * 4 = 67,108,864` 字节 = **64MB**，每次合成新分配 64MB。

**这不是"内存泄漏"（buffer 会被 GC 正常回收），而是"内存抖动"**：持续制造 64MB 量级的短命大对象会：

- 频繁触发 Major GC，直接表现为周期性卡顿；
- 在 V8 中把大对象直接分配到 Large Object Space，加剧堆碎片与 `undefined` 的内存驻留（碎片化导致 RSS 不回落）。

**这是"越用越卡"在长会话中最典型的表现形态：RSS 持续攀升且回落不彻底，同时伴随规律的停顿。**

另外注意一个次要缺陷：即使将来接上 `release`，`release()` 使用**精确相等**匹配（`s === size`）而 `acquire()` 使用**最小可容纳**匹配（`size >= minBytes`）。对于非标准尺寸（例如 800×600 的合成区域），`acquire` 会返回恰好 `800*600*4` 的非档位缓冲区，而 `release` 会因 `!poolSize` 直接丢弃。也就是说，**只有精确命中档位尺寸的合成区域才具备池化收益**，非档位尺寸永远不会进池。

#### 影响

- 每次走到 `output === null` 分支的合成都产生一次 64MB（或对应尺寸）的新分配。
- Major GC 频率随画布尺寸与编辑频率上升，表现为长会话中规律性掉帧。
- 池化代码（`buffer-pool.ts`，120 行）完全未产生任何收益。

#### 增长量级

单次分配上限 64MB（4096×4096）。实际驻留取决于 GC 时机，不构成单调增长，但会造成 RSS 高水位与明显抖动。

#### 修复建议

**推荐方案：给 `acquireCompositeBuffer` 的每个调用点补齐归还。**

`document-composite-raster.ts` 的返回像素仍由上层持有，不能在返回时归还。只应复用生命周期完全受本次同步调用控制的临时像素，例如分组隔离缓冲区；合成进目标、复制到 ImageData 后，再在异常安全的 `finally` 中归还：

```ts
// destination 是调用方最终持有的输出；scratch 只在本次同步调用内使用。
const scratch = acquireCompositeBuffer(width, height)
try {
  compositeOpacityGroupStack(document, children, x, y, width, height, cache, revision, scratch)
  compositeBufferWithModeInto(destination, scratch, opacity, blendMode)
} finally {
  releaseCompositeBuffer(scratch)
}
return destination
```

**⚠️ 关键前置约束**：`release()` 会把缓冲区放回池中并在下次 `acquire()` 时被 `fill(0)` 复用。因此**绝对不能归还任何仍被调用方持有或会被异步读取的缓冲区**（例如传给了 `ImageData`、`putImageData`、或存入了缓存）。改造前必须先确认两处调用点的返回值在上游的存活期。若返回值会被上游缓存，则正确做法不是 `release`，而是**由上游缓存负责归还**。

**次要修复**：把 `release()` 的精确匹配改为与 `acquire()` 对称的档位匹配，或在上游按档位尺寸申请，使非标准尺寸也能进池：

```ts
const poolSize = this.commonSizes.find(s => s >= size) ?? size
```

**替代方案**：若确认两处调用点的缓冲区寿命难以安全界定，则应当**承认池化不可行并删除 `buffer-pool.ts`**，同时以"降低合成区域尺寸 / 复用调用方已持有的 `output`"作为替代优化方向。半接线的池化比没有池化更糟，因为它给人一种已经优化的错觉。

#### 验证方式

```bash
# 当前输出：releaseCompositeBuffer 仅出现在定义处，无调用方
grep -rn "releaseCompositeBuffer" src/renderer/src --include=*.ts --include=*.tsx | grep -v "\.test\."
```

修复后应出现调用点，且 `src/renderer/src/core/buffer-pool.test.ts` 的既有用例仍通过。

---

### F-03 — `DocumentCompositeCache.dispose()` 释放面小于 `invalidateAll()`（P2）

```yaml
ID: F-03
严重度: P2
类别: 释放不彻底 / 延迟回收
位置:
  - src/renderer/src/core/document-composite-cache.ts:86-88   # dispose 实现
  - src/renderer/src/core/document-composite-cache.ts:65      # propertyComposite 字段
  - src/renderer/src/core/document-composite-cache.ts:70-72   # rowRanges / paletteCache / visibleTiles
  - src/renderer/src/core/document-composite-cache.ts:167-181 # invalidateAll 的完整释放面
  - src/renderer/src/core/layer-property-composite-cache.ts:24-31 # 强引用字段
  - src/renderer/src/components/canvas-composite-cache.ts:119-129 # 上层 dispose
  - src/renderer/src/components/canvas-composite-registry.ts:22-26 # 唯一调用方
```

#### 证据

`document-composite-cache.ts:86-88` 的 `dispose()` 只有一行有效逻辑：

```ts
dispose() {
  this.styleCacheBudget.dispose()
}
```

对比同文件 `invalidateAll()`（`document-composite-cache.ts:167-181`）释放了 **13 项**：

```ts
invalidateAll(): void {
  this.propertyComposite.clear()
  this.rowRanges = new WeakMap()
  this.paletteCache.clear()
  this.visibleTiles = new WeakMap()
  this.normalLayerPlans = new WeakMap()
  this.movePreviewLayerPlans = new WeakMap()
  this.styledLayerPlans = new WeakMap()
  this.opacityGroupPlans.clear()
  this.simpleLayerPlans.clear()
  this.styledLayerBlocks = new WeakMap()
  this.styleCacheBudget.clear()
  this.isolatedStyleTiles = new LayerStyleTileCache(this.styleCacheBudget)
  this.pendingStyleSources = new WeakMap()
  this.trackedStyleDocuments = new WeakSet()
  this.styleSourceBounds = new WeakMap()
  this.styleGroupIndexes.clear()
}
```

即 `dispose()` 遗漏了 `propertyComposite`、`rowRanges`、`paletteCache`、`visibleTiles`、`normalLayerPlans`、`movePreviewLayerPlans`、`styledLayerPlans`、`opacityGroupPlans`、`simpleLayerPlans`、`styledLayerBlocks`、`styleSourceBounds`、`styleGroupIndexes`。

其中 `propertyComposite` 是**强引用**容器（`document-composite-cache.ts:65`）：

```ts
private propertyComposite = new LayerPropertyCompositeCache()
```

而 `LayerPropertyCompositeCache` 内部持有对文档的**强引用**和一个**强引用 `Map`**（`layer-property-composite-cache.ts:24-31`）：

```ts
export class LayerPropertyCompositeCache {
  private document: SpriteDocument | null = null
  private revision = -1
  private key = ''
  private bytes = 0
  private entries = new Map<object, Map<string, { pixels: Uint32Array; valid: Uint8Array }>>()   // 强引用
  private backdrop: { key: string; pixels: Uint8ClampedArray } | null = null
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}
  clear(): void { this.document = null; this.key = ''; this.bytes = 0; this.entries.clear(); this.backdrop = null }
```

注意这里是 `Map<object, ...>`——**不是** `WeakMap`。`document` 字段同样是强引用，只在 `render()` 内部因 revision/key 不匹配时被清除（`layer-property-composite-cache.ts:35,38`）：

```ts
if (!change?.compositeOnly || change.revision !== revision || !change.propertyOwnerIds?.length) { this.clear(); return null }
...
if (this.document !== document || this.key !== key || this.revision < change.fromRevision || this.revision > revision) this.clear()
this.document = document; this.key = key; this.revision = revision
```

`LayerPropertyCompositeCache` 只有一个上限保护，且是"**拒绝写入**"而非"淘汰"（`layer-property-composite-cache.ts:71`）：

```ts
if (this.bytes + count * 5 > this.maxBytes) return source(x, y)
```

即达到 64MB 后不再增长，但也**不会淘汰任何已有条目**——已占用的 64MB 必须等下一次 `clear()`。

上层的释放链路（`canvas-composite-cache.ts:119-129`）：

```ts
dispose(): void {
  for (const surface of [...this.surfaces.values(), ...this.regions.values()]) {
    surface.canvas.width = 1
    surface.canvas.height = 1
  }
  this.invalidateSurface()
  this.compositeCache.dispose()      // <-- 进入上面那个只有一行的 dispose
  this.lastDocument = null
  this.namespace = ''
  this.invalidatedInitialDocuments = new WeakSet<SpriteDocument>()
}
```

而 `invalidateSurface()` 内部**先调用** `compositeCache.invalidateAll()`——也就是说 `dispose()` 的流程是"先 `invalidateAll()` 清空一切，再 `dispose()`"。**这样恰好掩盖了 F-03**：因为 `invalidateSurface()` 已经把所有字段清掉了，紧随其后的 `dispose()` 清不清都无所谓。

唯一调用方（`canvas-composite-registry.ts:22-26`）：

```ts
export const releaseCanvasCompositeCache = (document: SpriteDocument): void => {
  documentCompositeCaches.get(document)?.dispose()
  documentCompositeCaches.delete(document)
  releaseSharedAnimationResources(document)
}
```

调用点（`useCanvasRenderEngine.ts:513-515`）：

```ts
if (!useWorkspace.getState().sessions.some((session) => session.document === document)) {
  releaseCanvasCompositeCache(document)
  releaseInitialDocumentComposite(document)
}
```

#### 机理

`dispose()` 的**语义不完整**：它没有把自身重置为"可再次使用的干净实例"或"完全空置"。当前之所以不产生实际泄漏，有两个保护层：

1. **调用顺序的巧合**：`dispose()` 总是紧跟在 `invalidateSurface()`（内含 `invalidateAll()`）之后，字段已被清空。
2. **WeakMap 注册表**：`documentCompositeCaches`（`canvas-composite-registry.ts:9`）是 `WeakMap<SpriteDocument, CanvasCompositeCache>`，`delete` 之后整个 `CanvasCompositeCache` 对象连同其 `propertyComposite`、`entries`、`backdrop` 都会变成不可达，由 GC 回收。

因此**真实后果不是永久泄漏，而是回收时机不可控**：那最多 64MB 的 `LayerPropertyCompositeCache.entries` + `backdrop` 会作为一个整体等待 GC，而不是被立即置空释放。在关闭大型文档的瞬间，可能出现一次明显的延迟回收停顿。

**风险在于未来**：任何人在**不经过 `invalidateSurface()`** 的路径上单独调用 `compositeCache.dispose()`，或把 `DocumentCompositeCache` 从 WeakMap 语义改为长期持有（例如换用强引用注册表以支持"文档关闭后仍要重开"），F-03 会立刻升级为真实的 64MB 级泄漏。当前它是一个**潜伏缺陷（latent defect）**。

#### 影响

- 当前：延迟回收，关闭大文档时可能出现一次 GC 停顿。
- 未来：一旦释放路径变化，立刻变成真实的 64MB 级持有。

#### 增长量级

上限约 64MB（`LayerPropertyCompositeCache(maxBytes = 64 * 1024 * 1024)`），加 `paletteCache` 与 `rowRanges` 的派生数据。每文档一份。

#### 修复建议

把 `dispose()` 的释放面**对齐到 `invalidateAll()`**，使其成为幂等的"彻底释放"：

```ts
dispose() {
  this.invalidateAll()          // 或显式列出 invalidateAll 的全部字段
  this.styleCacheBudget.dispose()
}
```

然后从 `canvas-composite-cache.ts:124` 的 `invalidateSurface()` 中移除冗余的 `compositeCache.invalidateAll()` 调用，或保留（`invalidateAll()` 应为幂等，重复调用无副作用——实现上都是重新赋值 WeakMap / `clear()`，确认幂等即可）。

**顺带建议**：把 `LayerPropertyCompositeCache.entries` 从 `Map<object, ...>` 改为 `WeakMap<object, ...>`，使 `propertyOwnerIds` 对应的图层对象被回收时条目自动消失，从结构上消除这一类强引用残留。注意这会改变 `clear()` 的写法（WeakMap 不可枚举），需要同时调整 `bytes` 记账方式。

#### 验证方式

```bash
# 对比两处释放面
sed -n '86,88p'  src/renderer/src/core/document-composite-cache.ts
sed -n '167,181p' src/renderer/src/core/document-composite-cache.ts
```

现有 `src/renderer/src/store/memory-lifecycle.test.tsx` 中的文档开关生命周期探针应当覆盖此路径；修复后应新增一条断言：`dispose()` 后 `propertyComposite` 的占用字节为 0。

---

### F-04 — 扩展窗口主题的 `images` Map 永久驻留（P3）

```yaml
ID: F-04
严重度: P3
类别: 模块级缓存无淘汰
位置: src/renderer/src/components/extensions/extension-window-theme.ts:8
```

#### 证据

`extension-window-theme.ts:8-31`：

```ts
const images = new Map<string, Promise<string>>()
const inlineCursor = (source: string, scale: number): Promise<string> => {
  const key = `${source}:${scale}`
  let pending = images.get(key)
  if (!pending) {
    pending = new Promise<string>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        const context = canvas.getContext('2d')
        if (!context) { reject(new Error('无法生成扩展指针')); return }
        context.imageSmoothingEnabled = false
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))     // <-- 值为 base64 DataURL
      }
      image.onerror = () => reject(new Error('无法加载扩展指针'))
      image.src = source
    })
    images.set(key, pending)                        // <-- 只增不减
  }
  return pending
}
```

**对全文件的 grep 确认无任何 `delete` / `clear`：**

```
$ grep -n "images\." src/renderer/src/components/extensions/extension-window-theme.ts
8:const images = new Map<string, Promise<string>>()
11:    let pending = images.get(key)
28:    images.set(key, pending)
```

#### 机理

`images` 是**模块级强引用 Map**，值为 `Promise<string>`，而每个 promise 决议为 `canvas.toDataURL('image/png')` 产生的 **base64 data URL 字符串**。它存在的意义是避免对同一 `(source, scale)` 组合重复解码与重编码——这是合理的缓存动机。

问题在于**没有任何淘汰路径**：模块加载后即存活到进程结束，`Map` 只 `set` 不 `delete`。

**其基数受外部条件封顶**：key 的取值空间是「扩展声明的光标资源路径」×「光标缩放比例」。两者都是有限集合，因此这个 Map 不会无限增长。单个条目的量级是 `32 * scale` 像素 PNG 的 base64（典型为几百字节到数 KB）。

对比同类实现可以看出这一处是**疏忽而非有意**——`src/renderer/src/platform/cursor-theme.ts:140` 有一个结构完全相同的 `scaledCursorCache = new Map<string, Promise<string>>()`，同样只 `get`/`set` 不淘汰（`cursor-theme.ts:173,190`）。两处属于同一模式。

#### 影响

- 极少量的长期驻留（通常 < 数百 KB）。
- 真正的问题是**模式**：如果未来扩展机制允许用户自定义光标资源，或允许动态缩放，这个 Map 就会变成真正的无界缓存。

#### 增长量级

受扩展光标资源数 × 缩放比例数封顶，实际通常在 KB 级。**不构成"越用越卡"**。

#### 修复建议

低优先级。两个可选方向：

1. **有界化**：给 `images` 加一个简单的 LRU 上限（例如 64 条），与 `cursor-theme.ts:140` 的 `scaledCursorCache` 一并处理，抽取一个共享的 `boundedPromiseCache` 工具。
2. **接受现状并记录**：在文件顶部加一行注释说明"基数受扩展资源数封顶，故意不淘汰"，避免后来者误判。

若采纳方案 1，注意被淘汰的 promise 若已在 flight，仍需正常返回到调用方——LRU 淘汰只应移除"引用"，不应 `reject`。

#### 验证方式

```bash
grep -rn "new Map<string, Promise<string>>" src/renderer/src --include=*.ts --include=*.tsx
```

修复后应能在这两处看到上限常量。

---

### F-05 — Lua 脚本运行时 checkpoint 容器单调增长（P3）

```yaml
ID: F-05
严重度: P3
类别: 单次操作内累积
位置:
  - src-tauri/src/platform_scripts/lua_api.rs:778-780   # checkpoint 回滚截断
  - src-tauri/src/platform_scripts/lua_api.rs:797       # batches.clear()
  - src-tauri/src/platform_scripts/lua_api.rs:3166-3169 # 提交时清空
  - src-tauri/src/platform_scripts/lua_api.rs:3273-3276 # 另一处清空
```

#### 证据

`lua_api.rs:778-780` 表明这些容器是"可回滚的操作日志"，回滚靠截断实现：

```rust
self.created_layers.truncate(checkpoint.created_layer_count);
self.created_documents
    .truncate(checkpoint.created_document_count);
```

`lua_api.rs:797` 与 `lua_api.rs:3166-3169`：

```rust
self.batches.clear();
```

```rust
document.created_layers.clear();
document.created_documents.clear();
document.batches.clear();
```

`lua_api.rs:3273-3276`：

```rust
self.document.borrow_mut().batches.clear();
...
self.output.borrow_mut().clear();
```

#### 机理

这是**设计上的正确行为**：`created_layers` / `created_documents` / `batches` / `output` 是脚本执行的 checkpoint 与输出累积容器，必须在一次脚本运行的整个过程中保留，以便失败时回滚、成功时提交。它们**没有**泄漏到脚本之外。

风险仅存在于**长时间运行的脚本**：如果一个脚本创建了大量图层或累积了大量输出，这些 `Vec` 会在该次运行内单调增长，直到 `clear()`。这与"越用越卡"的跨会话累积是不同性质的问题。

Rust 侧其余容器均已确认有界，见第 3 节。

#### 影响

- 仅在单次脚本运行期间。脚本结束即释放。
- 无跨会话累积。

#### 增长量级

与脚本自身创建的图层/输出量成正比，与运行时长无关。

#### 修复建议

无需修复。若要加强健壮性，可在 checkpoint 机制上增加一个"未提交操作数上限"，超过阈值时向脚本报错而非继续累积。建议在文档中记为"已知且可接受"。

#### 验证方式

`grep -n "created_layers\|created_documents\|batches" src-tauri/src/platform_scripts/lua_api.rs` 确认每条增长路径都有对应的 `clear()` / `truncate()`。

---

## 3. 已验证有界 —— 其他 AI 无需重复审计

以下子系统经过**全量阅读源码 + 调用图交叉验证**，确认**不存在泄漏或堆积**。列出它们是为了让后续审计者直接跳过，避免重复劳动。

### 3.1 缓存与池（Renderer / Core）

| 子系统 | 文件 | 有界机制 |
|---|---|---|
| 合成面预算 | `src/renderer/src/components/canvas-composite-cache-utils.ts` | `createCompositeSurfaceBudget` + `rememberCompositeSurface`，成对 `maxCachedFrames` / `maxCacheBytes` 淘汰，淘汰时 `closeSurfaceBitmap` |
| 对齐视图缓存 | `src/renderer/src/core/canvas-aligned-view-cache.ts` | `MAX_PIXELS = 8MB`；`entries.length >= 9 \|\| bytes > MAX` 时淘汰 |
| 动画 cel 内容缓存 | `src/renderer/src/core/animation-cel-content-cache.ts` | `contentCache` 为 WeakMap，`size >= 8` 或 revision 变化时清空（:96）；`paletteSets` 达 16 清空（:43）；`selectionCache` 受 `MAX_CACHED_SELECTION_MASK_BYTES = 4MB` 与 256 条上限（:103, :179） |
| 图层样式块预算 | `src/renderer/src/core/layer-style-cache-budget.ts` | `DEFAULT_STYLE_CACHE_BYTES = 64MB`；`add()` 内 `while (this.bytes > this.limitBytes)` 循环淘汰；`Reservation.owner` 为 `WeakRef` |
| 图层样式瓦片缓存 | `src/renderer/src/core/layer-style-tile-cache.ts` | `entries = new WeakMap<object, Entry>()` |
| 动画图层源缓存 | `src/renderer/src/components/canvas-composite-cache-animation.ts` | `MAX_ANIMATION_LAYER_SOURCE_CACHE_BYTES = 128MB`、`MAX_DOCUMENT_COMPOSITE_CACHE_BYTES = 128MB`；`trimAnimationLayerSourceCache` 关闭 `ImageBitmap` |
| 共享动画合成 | `src/renderer/src/components/canvas-composite-cache-surfaces.ts` | `rememberSharedAnimationComposite` 在 `size > MAX_CACHED_FRAMES \|\| bytes > DEFAULT_MAX_CACHE_BYTES` 时淘汰；`releaseSharedAnimationResources`（:212）把 canvas 归零、关闭 ImageBitmap、清空并删除 |
| 调色板缓存 | `src/renderer/src/core/document-composite-palette-cache.ts` | WeakMap |
| 组索引 | `src/renderer/src/core/document-composite-group-index.ts` | WeakMap |
| 不透明度组缓存 | `src/renderer/src/core/document-composite-opacity-group-cache.ts` | WeakMap |
| 图层属性预览 | `src/renderer/src/components/canvas-layer-property-preview.ts` | 提供 `clear()` |
| 初始文档合成 | `src/renderer/src/core/initial-document-composite.ts` | WeakMap + `128MB` / `8192px` 上限 + 显式 release |
| 画布参考取样 | `src/renderer/src/components/canvas-reference-sampling.ts` | 有界（已核验） |
| 取色器取样 | `src/renderer/src/components/color-picker-sampling.ts` | `samplers = new Map<HTMLElement, PickerSampler>()`，有界 |
| 时间轴 cel 缩略图 | `src/renderer/src/components/panels/layer-timeline-thumbnails.tsx` | `celThumbnailCache` 为 WeakMap（:16）；`setCachedVariant` 在 `entries.size > 8` 时淘汰；`MAX_CEL_THUMBNAIL_VARIANT_BYTES = 128KB`。测试断言 `size <= 8` |
| 项目预览 | `src/renderer/src/components/HomeWorkspace.tsx` | LRU 24 条 / 32MB + 每卡片 `URL.revokeObjectURL` |
| 时间线滚动记忆 | `src/renderer/src/components/useProjectScrollMemory.ts` | 有界（已核验） |

### 3.2 笔刷相关（曾疑似泄漏，已排除）

| 子系统 | 文件 | 结论 |
|---|---|---|
| 实心笔刷遮罩缓存 | `src/renderer/src/core/tools-brush.ts:584,586,606` | **有界**。淘汰点在 :246-247（16 条）、:646-647（16 条）、:801-802 / :814-815 / :825-826（各 4 条） |
| 图像笔刷遮罩 | `src/renderer/src/core/tools-brush.ts:582` | `WeakMap<ImageBrush, Map<string, BrushMaskPoint[]>>` |

### 3.3 Worker 与异步请求

| 子系统 | 结论 |
|---|---|
| `src/renderer/src/core/local-history-worker.ts` | `pending` Map + timeout，在 reset 中统一 clear / reject |
| `src/renderer/src/core/project-save-worker-client.ts` | `pendingProjectEncodes`，300s 超时，`resetProjectEncodeWorker` 清理，消息到达时删除（:41-42） |
| `src/renderer/src/core/document-files.ts:269` | `pendingDecodeRequests`，:275-280 清空，每条路径都 delete |
| `src/renderer/src/store/document-file-service.ts:301` | `saveOperations`，在 `finally`（:454-457）中删除 |
| `src/renderer/src/core/timelapse.ts:545` | `pendingTimelapseEncodes`，有界 |

### 3.4 定时器 / 监听器 / DOM

| 子系统 | 结论 |
|---|---|
| `src/renderer/src/platform/usage-statistics.ts:47` | `window.setInterval(..., 60_000)`，受 `initialized` 守卫（:34），全应用唯一；`core/usage-statistics.ts:addUsageInterval`（:97）每天最多新增一个日期键 |
| `src/renderer/src/components/extensions/ExtensionRuntimeHost.tsx` | `pendingWindowClosures`（:27）在 :272 删除；:243 的 30s `setInterval`、`pending`/`listeners` Map、四个 `window.addEventListener` 全部在同一 effect 的 return 中拆除 |
| `src/renderer/src/components/floating-panel.tsx:18` | `managedFloatingWindowRoots`，在 :32-36 清理已失效的根 |
| `src/renderer/src/components/app/document-pane-dock-preview.ts:73` | `barListeners` Set，订阅式，随组件卸载移除 |
| `src/renderer/src/core/resource-manager.ts` | 资源追踪 + 清理 |
| `src/renderer/src/core/runtime-lag-capture.ts` | 定时器成对清理 |

### 3.5 历史 / 快照

| 子系统 | 结论 |
|---|---|
| `src/renderer/src/store/local-history-service.ts` | delta 用 WeakMap/WeakRef；`writeQueues` 在 :262 自删除；`latestWrites` 上限 256；`trimSnapshots()` 有预算 |
| `src/renderer/src/store/workspace-recording.ts` | 约 15 个 WeakMap；64MB 背压；`cancelPending` 会 dispose |

### 3.6 诊断

| 子系统 | 结论 |
|---|---|
| `src/renderer/src/core/runtime-diagnostics.ts` | `MAX_RECENT_EVENTS = 200`、`MAX_QUEUED_EVENTS = 100`、`MAX_DETAIL_KEYS = 48`、`MAX_DETAIL_STRING_LENGTH = 500`；`recentSpans` 上限 128（:226-227）；`activeOperations` 有清空；`spanReports` 上限 64，在 :233 淘汰（`if (spanReports.size >= 64 && !previous) spanReports.delete(...)`），并在 :84 / :460 整体 clear |

### 3.7 其他模块级 Map（逐一核验，均有界或不增长）

以下均存在 `delete` / `clear` 调用或被枚举值域封顶：

`animation-tween-preview.ts`、`canvas-brush-size-update.ts`、`canvas-reference-sampling.ts`、`useCanvasShortcutBindings.ts`、`useProjectScrollMemory.ts`、`adjustment-preview-lifecycle.ts`、`canvas-gradient-confirmation.ts`、`canvas-input-path.ts`、`canvas-resize-preview.ts`、`extension-command-state.ts`、`extension-file-drop.ts`、`extension-runtime.ts`、`gradient-map.ts`、`symmetry.ts`（key 为 5 位掩码，值域 ≤ 32）、`runtime-raster.ts:23`（`nonZeroIndexedPixels` 仅作哨兵集合，从未插入）、`font-service.ts`、`document-close-tasks.ts`、`document-save-tasks.ts`、`browser-api.ts`（浏览器回退实现，非桌面路径）。

### 3.8 Rust 后端

| 子系统 | 结论 |
|---|---|
| `src-tauri/src/platform_timelapse.rs` | `MAX_FRAME = 32MB`、`CHUNK_BYTES = 64MB`、`MAX_CACHED_STORES = 128`；`ChunkCache::insert` 在 :37 执行 `pop_front()` |
| `src-tauri/src/platform_cursor.rs` | 三个 `OnceLock<Mutex<HashMap<usize, ...>>>`，在 `WM_NCDESTROY`（:296-308）清理 |
| `src-tauri/src/platform_lag_diagnostics.rs` | `cached: Mutex<Option<(Instant, Value)>>` 单槽 + 8s TTL；`Monitor` 的 `Drop` 实现停止 worker |
| `src-tauri/src/platform_files.rs` | `operation_ids: Arc<Mutex<HashSet<String>>>`，:1748 执行 `clear(&operation_id)` |
| `src-tauri/src/lib.rs:40` | `startup_files: Mutex<Vec<String>>` 在 :161 **仅初始化一次**（来源为 `startup_file_paths()`，即进程启动参数，:144）；由 :82-87 的 `take_startup_files` 用 `std::mem::take` 整体取走，**取走后为空**，无增长路径 |

---

## 4. 审计方法学（可复现）

### 4.1 分类框架

把"越用越卡"的候选缺陷归为 8 类，逐类做针对性 grep：

| 类别 | 检出手段 |
|---|---|
| (a) 无界模块级 `Map`/`Set` | `grep -rn "^const \w* = new \(Map\|Set\)<"`，对每个命中检查是否存在 `delete` / `clear` 或被枚举值域封顶 |
| (b) 预算存在但未强制 / 未注册压力管理 | 对预算常量做反向引用搜索，确认约束是否真的参与运行时判断；对 `register` / `trim` 接口搜索实现者与调用者 |
| (c) canvas / ImageBitmap 生命周期超出文档 | 搜索 `dispose` / `release` / `invalidate` 的释放面差异；检查是否成对 `close()` / `width = 1` |
| (d) 定时器 / RAF / 监听器泄漏 | `grep -rn "setInterval\|requestAnimationFrame"` 后逐一核对是否成对清理；检查 effect 返回值 |
| (e) Object URL 泄漏 | 搜索 `createObjectURL` 与 `revokeObjectURL` 的配对 |
| (f) 历史 / 快照数组随编辑增长 | 检查快照预算、trim 函数、delta 压缩 |
| (g) Rust 侧缓冲区驻留 | 搜索 `OnceLock` / `Mutex<HashMap>` / `Vec::push`，核对清理钩子 |
| (h) 分配抖动冒充池化 | 对每个 Pool / Cache 类，检查 `acquire` 与 `release` 的**调用方数量是否对称**（本次 F-02 即由此检出） |

**第 (h) 类是本报告最有价值的检出手段，建议保留。** 只看 `buffer-pool.ts` 本身会认为它是一段正确的优化代码；只有对 `releaseCompositeBuffer` 做全仓库调用方计数，才会发现它是 0。

### 4.2 关键 grep 命令

```bash
# F-01：压力 API 是否有外部调用方
grep -rn "checkMemoryPressure\|handleMemoryPressure\|trimToTarget\|onMemoryPressure" src/renderer/src --include=*.ts --include=*.tsx | grep -v "\.test\."

# F-02：池化是否正确成对
grep -rn "releaseCompositeBuffer\|acquireCompositeBuffer\|globalBufferPool" src/renderer/src --include=*.ts --include=*.tsx | grep -v "\.test\."

# 通用：模块级强引用容器清单
grep -rn "^const [A-Za-z_$][A-Za-z0-9_$]* = new \(Map\|Set\)<" src/renderer/src --include=*.ts --include=*.tsx | grep -v "\.test\."

# Rust：容器清理点
grep -rn "\.clear()\|truncate(\|\.remove(0)\|pop_front\|drain(" src-tauri/src --include=*.rs
```

### 4.3 既有测试资产（编写回归用例时应复用）

| 文件 | 用途 |
|---|---|
| `src/renderer/src/core/memory-leak-test.test.ts` | 模拟"越用越卡"历史场景；断言内存增长 < 50MB、RAF 泄漏 < 10 |
| `src/renderer/src/store/memory-lifecycle.test.tsx` | 30+ 生命周期探针，使用 `globalCacheManager.snapshot().length` 断言提供者零增长 |
| `src/renderer/src/core/performance-optimization-verification.test.ts` | 直接调用 `manager.checkMemoryPressure()`（:185）——**注意：这是压力 API 目前唯一的调用方，且位于测试内**，进一步佐证 F-01 |
| `src/renderer/src/core/buffer-pool.test.ts` | `BufferPool` 的唯一使用方（:2,8,14,15,21,22），佐证 F-02 |

### 4.4 本次审计的局限

1. **纯静态**：未运行应用、未做堆快照（`--inspect` / `chrome://inspect`）或 `performance.memory` 采样。所有"增长量级"为由代码常量的推算，不是实测。
2. **未覆盖**：`src/renderer/src/components/` 下与渲染缓存无关的纯 UI 组件、扩展沙箱内部实现、以及第三方依赖内部缓存。
3. **未覆盖**：GPU 侧资源（WebGPU / WebGL 纹理）——本次未发现直接使用，若存在则需另行审计。
4. **量级估计的口径**：`width * height * 4` 按 `Uint8ClampedArray` 单字节计算，未计入 V8 对象头与对齐开销。

---

## 5. 修复优先级建议

| 顺序 | ID | 理由 | 预计改动量 |
|---|---|---|---|
| 1 | F-02 | 直接命中应用最大分配路径，收益最直观；调用点仅 2 处，改动面小 | 中（需谨慎界定缓冲区所有权） |
| 2 | F-01 | 决定长期可维护性；若不修复则应删除并记录，避免误导后来者 | 小（接入定时器）或 小（删除死代码） |
| 3 | F-03 | 潜伏缺陷，当前无实际泄漏，但修复成本极低（`dispose()` 一行） | 极小 |
| 4 | F-04 | 顺带处理，与 `cursor-theme.ts:140` 一并抽取有界工具 | 小 |
| 5 | F-05 | 无需修复，建议记为"已知可接受" | — |

**建议一并补充的观测能力**：当前 `globalCacheManager.snapshot()` 只能看到 1 个提供者（`LayerStyleCacheBudget`）。修复 F-01 时，应让 `BufferPool`（`getStats()` 已实现但无调用方）与其余主要缓存也注册为提供者，否则内存问题在运行时不可观测。

---

## 6. 机器可读摘要（供程序化解析）

```json
{
  "audit": {
    "date": "2026-10-08",
    "mode": "static-read-only",
    "scope": ["src/renderer/src", "src-tauri/src"],
    "findings_count": 5
  },
  "findings": [
    {
      "id": "F-01",
      "severity": "P0",
      "category": "dead-safety-net",
      "file": "src/renderer/src/core/global-cache-manager.ts",
      "lines": [63, 76, 99, 120, 143],
      "symbols": ["onMemoryPressure", "checkMemoryPressure", "trimToTarget", "handleMemoryPressure", "globalCacheManager"],
      "production_callers": 0,
      "grows_over_time": false,
      "impact": "global memory pressure valve (256MB soft / 512MB hard) unreachable; no cache can ever be trimmed under pressure"
    },
    {
      "id": "F-02",
      "severity": "P1",
      "category": "broken-pooling",
      "file": "src/renderer/src/core/buffer-pool.ts",
      "lines": [46, 52, 82, 118],
      "call_sites": ["src/renderer/src/core/document-composite-raster.ts:28", "src/renderer/src/core/document-composite-raster.ts:332"],
      "production_callers_of_release": 0,
      "grows_over_time": false,
      "alloc_per_composite_bytes_max": 67108864,
      "impact": "pool always empty; every composite at 4096x4096 allocates a fresh 64MB buffer; GC churn and heap fragmentation"
    },
    {
      "id": "F-03",
      "severity": "P2",
      "category": "incomplete-dispose",
      "file": "src/renderer/src/core/document-composite-cache.ts",
      "lines": [86, 167],
      "retained_after_dispose": ["propertyComposite", "rowRanges", "paletteCache", "visibleTiles", "normalLayerPlans", "movePreviewLayerPlans", "styledLayerPlans", "opacityGroupPlans", "simpleLayerPlans", "styledLayerBlocks", "styleSourceBounds", "styleGroupIndexes"],
      "max_retained_bytes": 67108864,
      "grows_over_time": false,
      "impact": "delayed collection only; whole cache object is dropped from the WeakMap registry right after, so GC can reclaim it; latent risk if the release path changes"
    },
    {
      "id": "F-04",
      "severity": "P3",
      "category": "unbounded-module-cache",
      "file": "src/renderer/src/components/extensions/extension-window-theme.ts",
      "lines": [8, 28],
      "sibling": "src/renderer/src/platform/cursor-theme.ts:140",
      "grows_over_time": true,
      "cardinality_bound": "extension cursor asset count x cursor scale count",
      "impact": "base64 data URLs retained permanently; small in practice"
    },
    {
      "id": "F-05",
      "severity": "P3",
      "category": "intra-operation-accumulation",
      "file": "src-tauri/src/platform_scripts/lua_api.rs",
      "lines": [778, 797, 3166, 3273],
      "grows_over_time": false,
      "impact": "checkpoint logs grow monotonically for the duration of one script run, cleared on commit or rollback; no cross-session accumulation"
    }
  ],
  "verified_bounded_subsystems_count": 58,
  "recommended_fix_order": ["F-02", "F-01", "F-03", "F-04", "F-05"]
}
```

## 7. 修复与验收（2026-10-09）

本节为修复后的最终状态。以上静态审计有两处需要更正：F-01 的 256/512 MiB 只覆盖显式注册的缓存，不是进程、文档或 WebView 原生内存上限；F-02 属于临时分配抖动，不能据此认定之前的全鼠标输入延迟来自 JavaScript 像素缓冲区。此次不把页面重载后的恢复视为代码修复效果。

### 7.1 固定条目结果

| ID | 最终状态 | 实际处理 |
|---|---|---|
| F-01 | 已修复 | `main.tsx` 安装 30 秒低频压力裁剪，HMR dispose 取消定时器；保留既有弱引用注册机制。裁剪按缓存占用从大到小进行，读取实际释放后的字节数，不再平均分摊或每次扫描全部提供者。缓冲池与属性合成缓存也按使用生命周期注册、注销，样式缓存原有独立上限继续生效。 |
| F-02 | 已修复 | 仅在分组隔离和渐变映射的同步临时像素上配对 acquire/release，所有异常退出用 `finally` 归还。返回给调用者的最终像素、仍被缓存持有的像素不归还。支持任意区域尺寸，保持逻辑长度精确；池总计最多 64 MiB/64 个缓冲区、每尺寸最多 4 个，并拒绝外部缓冲区及重复归还。 |
| F-03 | 已修复 | `DocumentCompositeCache.dispose()` 调用完整 invalidation，清除属性 backdrop、索引、计划和样式资源。重复销毁安全，之后重新使用也能正确注册和重建。当前 `CanvasCompositeCache` 原先已先 invalidation，此修改补齐直接销毁路径，并不宣称原画布关闭路径存在已观察到的泄漏。 |
| F-04 | 已修复 | 扩展与普通光标共享有界 promise 缓存工具；两处各最多 64 项，命中刷新最近使用顺序，失败可重试。淘汰只移除引用，不取消正在等待的调用。 |
| F-05 | 已关闭，无需改动 | 确认 checkpoint 的 truncate、调用失败恢复、下一次上下文同步和输出清理路径；真实 Lua 事务回滚测试通过。原有单次调用指令数/时间、Lua 堆、输出和像素额度仍生效，不随意截断回滚必需数据。 |

本次额外修正了过期的样式预算测试：按动态瓦片大小设置一块或十二块的容量，继续验证真正的跨瓦片淘汰和像素一致性。旧测试固定使用 64×64 的预算，而当前小效果瓦片为 256×256，无法容纳一块孤立效果瓦片，导致每次读取都重复生成。这是测试场景的预算失配，未因此修改生产样式算法。

### 7.2 实测数据与口径

真实 core 合成路径使用 4096×4096 输出、两个不透明度分组和稀疏源像素；每组三次合成，共五组，交错运行新旧版本。计数记录 acquire 返回的不同 backing buffer；最终输出的相同固定分配不计入临时分配。旧 raster/cache 实现从修改前源码保留，压力比较使用修改前 manager，未依靠理论预算估计替代计数。

| 指标 | 修改前 | 修改后 |
|---|---:|---:|
| 每组三次合成临时新分配次数 | 6 | 1 |
| 每组三次合成临时新分配字节 | 384 MiB | 64 MiB（减少 83.3%） |
| 三次合成耗时中位数，五组 | 534.4 ms | 461.2 ms（减少 13.7%） |
| 直接 dispose 后仍由属性缓存持有的 backdrop | 64 MiB | 0 |
| 8 个提供者的不均匀压力夹具裁剪后字节 | 464.7 MiB | 217.6 MiB，达到目标 |
| 上述压力处理的 snapshot 调用 | 80 | 17 |
| 1000 次不同 key 的 promise 缓存保留项 | 1000 | 64 |

压力夹具只用回调统计模拟提供者字节，并非实际分配 500 MiB，更不是进程 RSS 测量。dispose 的 0 表示该缓存立即解除强引用，不表示操作系统会立即归还 RSS。promise 项数是工具的直接计数；两处真实光标消费入口另外验证了旧资源被淘汰、近期资源共享与重新生成。合成耗时是这组稀疏 4K 场景的测量，不外推为全部工程的加速比例。

### 7.3 最终检查

- D3 `check:dev` 的模块边界与 web 类型检查通过，11 个定向测试文件、93 项测试全部通过。显式范围包括当前工作区已有的所有高风险差异，没有通过漏报或覆盖用户修改缩小检查。
- 大文档验收：4096×4096 文档、24 层、嵌套分组，连续 40 次像素、偏移和透明度变化；与参考采样逐字节一致，并保留之前的全部输出验证无缓冲区串图。该项验证可见区域，不是 40 次完整 4K 画布计时。
- 覆盖非标准尺寸、透明清零、总池预算、外部/重复归还、临时合成异常、销毁后重建、真实定时器触发、渐变映射、样式淘汰和生命周期检查。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib rolls_back_a_failed_transaction_caught_by_the_script`：1 项通过，120 项未运行。
- 前后配对基准：1 项通过，包含上述五组交错样本。
- 定向 `git diff --check` 通过。

数据保存在 `output/memory-audit-fixes-20261008/acceptance.json`；最终门禁日志在同目录 `check-dev.txt`，范围在 `check-scope.json`，复现脚本为 `run-check.mjs`。目录保留开始日期，最终验收于 2026-10-09 完成。生成数据、临时基准与原工程/trace 不提交到仓库。

```json
{
  "resolution_date": "2026-10-09",
  "findings": {
    "F-01": "fixed-and-verified",
    "F-02": "fixed-and-verified",
    "F-03": "fixed-and-verified",
    "F-04": "fixed-and-verified",
    "F-05": "verified-no-change"
  },
  "validation": {
    "check_dev": "passed",
    "targeted_js_tests": 93,
    "paired_benchmark_samples": 5,
    "lua_rollback_tests": 1
  },
  "limits": [
    "Registered-cache budgets do not bound total process/native memory.",
    "Previous WebView compositor tracker accumulation is a separate unresolved issue."
  ]
}
```

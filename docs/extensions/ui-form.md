# 扩展宿主表单协议

中文 | [English](ui-form.en.md)

适用于 `windows.open({ windowId, resourceId, options: { presentation: "dialog", component: "form", title } })`。资源 HTML 使用[窗口桥](runtime-api.md)，作为隐藏的逻辑页面运行；宿主渲染下面的节点。它与清单 `settingsUi`、Lua `Dialog` 是三种独立接口。

## 状态与操作往返

页面通过 `moonsprite.window.postMessage({ type: "ui-state", nodes, status?, result? })` 推送**完整**视图。`nodes` 必须为数组，即使只更新状态或响应操作也要携带。初始状态应由页面主动发送，不能等待 Runtime 的窗口打开 Promise 作为页面就绪信号。

宿主操作经 `moonsprite.window.onMessage(listener)` 返回 `{ ...action, ...extra, values, requestId }`。`action` 是扩展自定义普通对象；不要占用宿主的 `values`、`requestId`、`files`、`value` 字段。`values` 只含用户修改过的 input/number/select 值，不包含所有默认值；扩展应与自己的模型合并。toggle 直接通过顶层 `value` 回传，不写入 `values`。file 回传 `files: [{ name, mime, bytes }]`。

一次操作后控件进入忙碌状态。扩展处理成功或失败都应返回完整视图和 `result: { requestId }`；匹配当前请求后宿主解除忙碌并清空本地输入覆盖值，因此新视图的 `node.value` 必须来自更新后的模型。不匹配或遗漏 requestId 不会解除忙碌；协议没有自动超时。普通 input/number/select 编辑不会立即派发 action，需要按钮等动作提交。

```html
<!doctype html><meta charset="utf-8">
<script>
let model = { name: 'Moon' };
const sendView = (status = '', requestId) => moonsprite.window.postMessage({
  type: 'ui-state', status,
  nodes: [
    { id: 'name', type: 'input', label: 'Name', value: model.name },
    { id: 'apply', type: 'button', label: 'Apply', primary: true,
      action: { type: 'apply' } }
  ],
  ...(requestId ? { result: { requestId } } : {})
});
moonsprite.window.onMessage(async message => {
  if (message.type !== 'apply' || !message.requestId) return;
  try {
    model = { ...model, ...message.values };
    await moonsprite.storage.set('profile', model);
    await sendView('Saved', message.requestId);
  } catch (error) {
    await sendView(String(error), message.requestId);
  }
});
sendView().catch(console.error);
</script>
```

## 全部节点类型

每个节点必须有稳定字符串 `id` 和下表中的 `type`。`label` 提供时必须是字符串；`children` 为节点数组。`visibleWhen: { id: string | number | boolean }` 对全部条件做严格相等比较，优先使用本地修改值，否则取节点 `value`。未知类型不渲染。`disabled` 和操作忙碌状态禁用交互控件，不会阻止所有容器事件。

| 类型 | 支持字段与行为 |
| --- | --- |
| `split` | `children`：最多前 2 个子节点，通常 sidebar + column。 |
| `sidebar` | `label`, `children`：导航容器。 |
| `column` | `label`, `children`：内容容器。 |
| `row` | `children`, `align: "end"`：字段与操作底部对齐；其他值使用默认布局。 |
| `slot` | `label`, `description`, `tooltip`, `children`（最多 16 个）, `contextAction`：右键派发自定义操作。 |
| `heading` | `label`：标题。 |
| `text` | `label`, `tooltip`：段落。 |
| `separator` | 分隔线。 |
| `image` | `src` 仅支持 `data:image/png;base64,`；`label` 为替代文字；`width` / `height` 默认 48，夹紧至 16–512。 |
| `choice` | `label`, `description`, `selected`, `disabled`, `action`：选择按钮。 |
| `input` | `label`, `tooltip`, `value`, `disabled`；最多输入 64 字符。 |
| `number` | `label`, `tooltip`, `value`, `min`, `max`, `disabled`；步长固定为 1，无效值默认 1，0 有效。 |
| `select` | `label`, `tooltip`, `value`, `disabled`, `options: [{ value, label, description? }]`；只渲染前 100 个有效选项。 |
| `toggle` | `label`, `tooltip`, `value`, `disabled`, `action`；值转为布尔，操作额外返回 `value`。 |
| `button` | `label`, `primary`, `selected`, `disabled`, `action`。 |
| `file` | `label`, `disabled`, `action`, `accept`，默认 `image/gif,image/png,image/webp`；`multiple` 默认 true。 |
| `dialog` | `label`, `children`, `action`：嵌套宿主弹窗，关闭按钮派发 action，扩展应在响应视图中移除此节点。 |

根节点最多渲染前 200 个；一般容器最多前 100 个子节点，split/slot 例外见表。根深度为 0，深度大于 8 的节点忽略。不要把渲染截断当成数据分页或业务校验。

## 文件输入与导出

文件选择最多 16 个，总量最多 16 MiB；`multiple: false` 时必须恰好选择一个。`accept` 是选择器筛选，扩展仍需校验文件内容。宿主只传文件名、MIME 和字节，不提供原始文件路径。

用户操作的响应可包含 `result: { requestId, file: { name, bytes } }`。只有匹配等待中的请求才打开保存对话框，主动推送状态不能直接发起保存。名称最多 120 字符，不能包含路径分隔符或 Windows 非法字符；`bytes` 必须是 0–255 整数数组，最多 1 MiB。宿主原子写入用户所选文件，取消或失败显示在状态区；这是宿主表单的受控导出，不是 Runtime `io` 权限的新方法。

## 实现与限制

实现依据：[ExtensionDialogForm.tsx](../../src/renderer/src/components/extensions/ExtensionDialogForm.tsx)、[ExtensionWindow.tsx](../../src/renderer/src/components/extensions/ExtensionWindow.tsx)、[extension-file.ts](../../src/renderer/src/platform/extension-file.ts)。HTML 桥不暴露 React、DOM 宿主引用或 Store；布局、焦点、主题和关闭行为由宿主管理。

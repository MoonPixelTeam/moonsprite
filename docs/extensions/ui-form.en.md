# Extension host form protocol

[中文](ui-form.md) | English

For `windows.open({ windowId, resourceId, options: { presentation: "dialog", component: "form", title } })`. Resource HTML runs as a hidden logic page using the [window bridge](runtime-api.en.md); the host renders its nodes. This is separate from manifest `settingsUi` and Lua `Dialog`.

## State and action round trips

Send a **complete** view with `moonsprite.window.postMessage({ type: "ui-state", nodes, status?, result? })`. `nodes` must be an array, including status-only updates and action responses. The page should send its initial state itself; resolving Runtime's window-open Promise does not signal page readiness.

Host actions arrive through `moonsprite.window.onMessage(listener)` as `{ ...action, ...extra, values, requestId }`. `action` is an extension-defined plain object; reserve `values`, `requestId`, `files`, `value` for the host. `values` contains only edited input/number/select values, not all defaults; merge it with your model. A toggle sends top-level `value` instead of updating `values`. A file action sends `files: [{ name, mime, bytes }]`.

After an action, controls become busy. Success and failure responses should both send a full view with `result: { requestId }`. Matching the pending request clears busy state and local input overrides, so updated `node.value` fields must reflect your model. A missing/mismatched requestId leaves the form busy; there is no automatic timeout. Editing input/number/select does not dispatch an action until a button or another action submits it.

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

## Complete node catalog

Each node requires a stable string `id` and a `type` below. If provided, `label` must be a string; `children` is a node array. `visibleWhen: { id: string | number | boolean }` strictly compares all conditions against edited values, falling back to node `value`. Unknown types render nothing. `disabled` and busy state disable interactive controls, not every container event.

| Type | Supported fields and behavior |
| --- | --- |
| `split` | First 2 `children`, typically sidebar + column. |
| `sidebar` | `label`, `children`: navigation container. |
| `column` | `label`, `children`: content container. |
| `row` | `children`, `align: "end"` for bottom alignment; other values use default layout. |
| `slot` | `label`, `description`, `tooltip`, first 16 `children`, `contextAction` dispatched on right-click. |
| `heading` | `label`: heading. |
| `text` | `label`, `tooltip`: paragraph. |
| `separator` | Divider. |
| `image` | `src` must start with `data:image/png;base64,`; `label` is alt text; `width` / `height` default 48, clamped to 16–512. |
| `choice` | `label`, `description`, `selected`, `disabled`, `action`: choice button. |
| `input` | `label`, `tooltip`, `value`, `disabled`; input limit 64 characters. |
| `number` | `label`, `tooltip`, `value`, `min`, `max`, `disabled`; fixed step 1, invalid value defaults to 1, zero is valid. |
| `select` | `label`, `tooltip`, `value`, `disabled`, `options: [{ value, label, description? }]`; first 100 valid options. |
| `toggle` | `label`, `tooltip`, `value`, `disabled`, `action`; boolean conversion, action adds `value`. |
| `button` | `label`, `primary`, `selected`, `disabled`, `action`. |
| `file` | `label`, `disabled`, `action`, `accept` (default `image/gif,image/png,image/webp`); `multiple` defaults to true. |
| `dialog` | `label`, `children`, `action`: nested host dialog; close dispatches action, and the extension removes the node in its response. |

Only the first 200 root nodes render. Most containers render their first 100 children; split/slot exceptions are above. Root depth is 0; nodes deeper than 8 are ignored. Rendering limits are not pagination or business validation.

## File input and export

File input permits at most 16 files totaling 16 MiB; `multiple: false` requires exactly one. `accept` filters the picker; extensions still validate contents. Only names, MIME types and bytes are exposed, not source paths.

An action response may include `result: { requestId, file: { name, bytes } }`. Only a matching pending request opens the save dialog; pushed state cannot initiate saving. Names allow at most 120 characters and no path separators or Windows-invalid characters. `bytes` must contain integers 0–255, at most 1 MiB. The host writes atomically to the chosen destination and reports cancellation/failure in form status. This controlled form export does not add a Runtime `io` method.

## Implementation and limits

Sources: [ExtensionDialogForm.tsx](../../src/renderer/src/components/extensions/ExtensionDialogForm.tsx), [ExtensionWindow.tsx](../../src/renderer/src/components/extensions/ExtensionWindow.tsx), [extension-file.ts](../../src/renderer/src/platform/extension-file.ts). The HTML bridge does not expose React, host DOM or Store; the host owns layout, focus, theme and closing.

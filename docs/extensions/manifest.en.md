# Extension manifest reference

[中文](manifest.md) | English

This reference describes raw JSON accepted by the current [installer](../../src-tauri/src/platform_extensions.rs). `StoredExtension` is processed host output, not a manifest template. See [extension development](README.en.md) and the [quickstart](quickstart.en.md).

## Root object

Unknown root fields are rejected. The table lists every root field. Omitted contribution arrays default to `[]`; optional descriptive text defaults to an empty string.

| Field | Type, defaults and constraints |
| --- | --- |
| `schemaVersion` | Required integer: `1` or `2`. |
| `id` | Required ID; keep stable after publishing. Also identifies updates and storage. |
| `name` | Required nonblank text, at most 160 UTF-8 bytes. |
| `version` | Required nonblank text, at most 80 bytes; semantic version syntax is not enforced. |
| `description` | Optional text, at most 4096 bytes. |
| `author` | Optional text, at most 160 bytes. |
| `apiVersion` | Optional nonblank string, at most 80 bytes; must be `"1.0.0"` with `runtime`. Independent of package `version` and Lua `mse.apiVersion`. |
| `entry` | Optional package-relative `.lua` path; legacy single script shown under File > Scripts, not an automatic startup hook. |
| `settingsEntry` | Optional package-relative `.html` / `.htm` path in schema 1/2; mutually exclusive with `settingsUi`. |
| `settingsUi` | Optional host settings object, schema 2 only; see below. |
| `runtime` | Optional persistent Runtime object, schema 2 only; see below. |
| `commands` | Command array, maximum 64. |
| `panels` | Command panel array, maximum 16. |
| `menuItems` | Built-in menu contribution array, maximum 32. |
| `topMenus` | Top-level menu array, maximum 16. |

IDs contain 1–80 ASCII bytes from letters, digits, `.`, `-`, `_`; they cannot start/end with a dot or contain `..`. IDs within each contribution/control/resource category must be unique ignoring case; references must match exact case. Text disallows control characters; required text cannot be blank. Lengths mean UTF-8 bytes unless explicitly stated as characters.

## Runtime object

| Field | Contract |
| --- | --- |
| `entry` | Required self-contained UTF-8 `.html` / `.htm`, maximum 1 MiB. |
| `permissions` | String array containing `runtime`; use only names in the [permission table](runtime-api.en.md), without duplicates. |
| `resources` | Optional `{ "resourceID": "relative/path" }`, default `{}`; maximum 64 resources, 16 MiB each. Cannot reference `manifest.json` or the Runtime entry itself. |

Window resources contain HTML; the mapping can also include binary assets such as PNG. Relative URLs in HTML do not resolve to package files: inline scripts/styles, read declared resources with `resources.read`, then construct Blob or data URLs. Release unused Blob URLs. Declare `resources` to read assets or window resources, and `windows` to open windows.

## Commands and contributions

| Object | Required | Optional fields and defaults |
| --- | --- | --- |
| `commands[]` | `id`, `name`, exactly one handler below | `description: ""`. |
| `panels[]` | `id`, `name` | `description: ""`, `defaultVisible: false`, `commands: []`; maximum 32 references. |
| `menuItems[]` | `id`, `menu`, `commands` | `name`, `description`, `position: "end"`. |
| `topMenus[]` | `id`, `name`, `commands` | `description: ""`, `position: "end"`. |

Each command must specify exactly one handler:

| Field | Constraint |
| --- | --- |
| `entry` | Package-relative `.lua` file, run on invocation. |
| `runtimeEvent` | ID-format string; requires a Runtime with `commands` permission. Sent as the `event` field of a `command` event. |
| `opensSettings: true` | Requires `settingsUi` or `settingsEntry`; `false` does not count as a handler. |

`name`/`description` use the root text limits. Command references must exist in this package and be unique. Each `menuItems` / `topMenus` entry needs 1–32 commands, even when it will also use `menus.setItems` for dynamic entries.

`menu` accepts `file`, `edit`, `select`, `canvas`, `layer`, `window`, `help`. Built-in contributions accept `position: "start" | "end"`; top-level menus also accept `before:<menu>` / `after:<menu>`. Omitting `menuItems.name` inserts commands directly; supplying it creates a submenu. Panels are host-rendered command lists, not custom HTML docked views. Unreferenced Lua commands remain accessible from the script list.

## Host component settings

`settingsUi` is `{ storageKey, controls }`. Required `storageKey` follows ID rules; `controls` defaults to `[]`, maximum 64. The host reads one storage object keyed by control IDs, merges defaults and validates types. Changes/reset persist the object and send `settings-changed` to a Runtime with `storage` permission. Buttons do not produce stored fields.

Every control requires `id`, `type`, nonblank `label`; optional `description: ""` and `visibleWhen: { otherCheckboxId: boolean }`. Conditions may reference only other checkboxes and all must match. Hidden values are retained. Labels allow 160 bytes; descriptions allow 4096 bytes.

| `type` | Fields and constraints |
| --- | --- |
| `checkbox` | Required boolean `defaultValue`. |
| `number` | Required numeric `defaultValue`; optional finite `min`, `max`, positive `step`, text `suffix`; `min <= max`, default within range. |
| `text` | Required string `defaultValue`; optional `placeholder`, `maxLength` (default 1024, range 1–4096 characters); default must fit. |
| `select` | Required string `defaultValue`; 1–64 `options: [{ value, label, description? }]`. Nonblank value/label, maximum 160 bytes; values unique ignoring case; default must match a value exactly. |
| `button` | Required `commandId` referencing this package's Runtime command. `variant`: `primary` / `secondary` / `danger`, default `secondary`; `closeOnRun: false`; only buttons accept `fullWidth`. No `defaultValue` needed. |

`suffix` / `placeholder` allow 160 bytes. Declarative settings and [dynamic host forms](ui-form.en.md) are different protocols: settings use `text`, while dynamic forms use `input`. Their fields are not interchangeable.

## Files and package limits

- Put `manifest.json` directly at ZIP root, without a wrapper directory. Package maximum 50 MiB, 256 entries, 256 MiB unpacked, manifest maximum 256 KiB.
- Settings entry maximum 512 KiB; Runtime/resource limits are above. Lua entries also obey script execution budgets.
- Relative paths allow at most 240 bytes and use `/`. No absolute paths, backslashes, leading `~`, empty segments, `.`, `..`, control characters, Windows reserved names or trailing spaces/dots. Symlinks are rejected.
- Missing entries, duplicate command references, unknown permissions, invalid versions and oversized resources fail installation validation. Correct the manifest and repack.

## Implementation sources

[platform_extensions.rs](../../src-tauri/src/platform_extensions.rs) validates manifests; [ExtensionSettingsDialog.tsx](../../src/renderer/src/components/dialogs/ExtensionSettingsDialog.tsx) implements settings behavior. [types-extensions.ts](../../src/shared/types-extensions.ts) describes processed installed contributions, not the raw manifest format.

Optional `translations` maps locale codes to dictionaries of source display text and translated text. The host localizes names, descriptions, labels, suffixes and placeholders, but preserves IDs and settings values. Up to 64 locales and 512 messages per locale are accepted, within the manifest size limit.

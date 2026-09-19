# MoonSprite UI Design System

[中文](ui-design-system.md) | English

This document defines the interface foundations, component specifications, and implementation constraints for the MoonSprite desktop pixel editor. The component library and production UI must use the same specifications and must not maintain a separate imitation style used only for demonstration.

## Design Principles

- The interface serves long, high-frequency pixel-editing sessions and remains compact, quiet, and clear.
- Every container has square corners. One-pixel borders and surface luminance establish hierarchy.
- `#2979FF` is the only accent color and represents selection, focus, primary actions, and critical states.
- Colors, font sizes, spacing, and control heights use semantic tokens. Local components must not invent near-duplicate values by visual judgment.
- UI icons and mouse cursors are pixel assets and display only at integer multiples of source pixels. Text, spacing, and ordinary layout are not restricted to integer scaling.

## Color

Continue using `--theme-*` semantic variables. Components must not copy theme colors. Artwork colors, palettes, checkerboards, and color models may use data colors.

State rules:

- Default: neutral surface and border.
- Hover: raise surface luminance by one level without changing geometry.
- Selected, expanded, or focused: use `--theme-accent`.
- Disabled: use disabled text, surface, and border while retaining readability.
- Destructive: use the danger color only for genuinely destructive operations.

## Typography Hierarchy

| Token | Purpose | Size / line height |
| --- | --- | --- |
| `--ui-font-small` | Supporting text, shortcuts, coordinates, badges, compact labels | 11px / 15px |
| `--ui-font-regular` | Menus, fields, buttons, body text, and every heading | 13px / 21px |

The interface permits only these two font sizes. Do not create extra sizes for headings or local cases. Express hierarchy through weight, color, separators, and compact spacing. Body text uses `Noto Sans SC` or the system sans-serif stack. Numeric values, HEX, shortcuts, and coordinates may use a monospace font. Letter spacing is always `0`.

These are the base values at `--ui-body-font-scale: 1`. Body-font preferences scale both font and line-height tokens; they are independent of UI scaling and canvas zoom. Components consume these tokens rather than hard-coding the base pixel sizes.

## Spacing

| Token | Value | Purpose |
| --- | ---: | --- |
| `--ui-space-1` | 2px | Pixel-level separation and adjacent states |
| `--ui-space-2` | 4px | Icon micro-spacing and menu padding |
| `--ui-space-3` | 6px | Compact control internal spacing |
| `--ui-space-4` | 8px | Default control spacing |
| `--ui-space-5` | 12px | Dialog content padding and large content grouping |

Ordinary controls, menus, and panels use `2px` through `8px`. Only dialog content padding and large content groups use `12px`. Do not add near-duplicate tiers such as `3px`, `5px`, `7px`, `9px`, `10px`, `14px`, `16px`, or `20px`. Drawing areas, the timeline, palettes, and positioning geometry may use other integer values only when constrained by a real pixel grid.

Buttons, menus, navigation, and tool-options bars use `8px` horizontal padding. Gaps between components must not exceed `8px`. Use borders, surface colors, or group headings for stronger hierarchy instead of large blank areas.

## Control Density

| Specification | Height | Usage |
| --- | ---: | --- |
| Compact icon button | 26px | Panel headers, tool options, continuous action groups |
| Compact command button | 30px | Tool settings, inline actions, menu triggers |
| Standard field | 34px | Text input, number input, select |
| Standard dialog button | 34px | Primary and secondary dialog actions |
| Settings toggle | 35px | Preferences, live preview, layer settings |
| Settings navigation row | 32px | Preferences and shortcut side navigation |
| Emphasized color/tool field | 38px | Fields needing a larger color sample or tool icon |

A component's size comes from an explicit density variant or semantic container. It must not change according to icon presence, DOM descendants, or selector specificity.

## Pixel Icons

- `PixelUtilityIcon` source dimensions are 5x5, 6x6, 7x7, or 11x11 and may display only at `1x`, `2x`, or another integer multiple.
- Common sizes for 11x11 icons are 11px and 22px. Common `2x` sizes for 5x5, 6x6, and 7x7 sources are 10px, 12px, and 14px.
- Tool icons use the matching normal or large source file. Do not produce intermediate sizes through browser smoothing.
- SVG pixel icons use integer `width`, `height`, and `viewBox`, with `shape-rendering: crispEdges`.
- Bitmap pixel icons use `image-rendering: pixelated`. Do not use `scale(1.5)`, percentage sizes, or fractional CSS pixels.
- An icon button may change button size but must not stretch its pixel icon to a non-integer multiple.

## Component Specifications

### Buttons

- `primary-button`, `quiet-button`, and `danger-button` share typography, padding, and height.
- Icon presence does not change button height, font size, or padding.
- Icon-only buttons use `icon-button`, 26px by default. Use an explicit size variant for a larger target.
- Hover, pressed, selected, and focus states change only color and border, never size.

### Forms

- `TextInput`, `NumberInput`, and `ThemedSelect` use the 34px standard field height by default.
- Tool options may explicitly use the 26px compact variant.
- Labels, controls, supporting text, and hover descriptions use `FormField`. Do not rebuild field layout separately in dialogs and Preferences.
- A generic single-value slider uses `RangeField`: the track stays square-cornered, left fill expresses progress, and value plus unit remain centered inside the track. `compact` and `regular` density determine typography and height. Dialogs must not each reimplement a slider row. Color-gradient bars and two-ended range controls may keep specialized structure, but they also must not use rounded sliders.
- Every scroll region uses the component-library pixel scrollbar. Shared styles provide a global fallback. New `overflow: auto/scroll` regions must not fall back to native system scrollbars or show arrow buttons.
- Independent check choices use `CheckboxField`, with pixel state rendered by `PixelCheckbox`.
- Mutually exclusive modes use `SegmentedControl`, with option descriptions shown through Tooltip.
- Color-value buttons use explicit `compact`, `regular`, or `emphasized` density from `ColorValueControl`. Parent containers may not override button height.
- Labels and errors use regular size; supporting help uses small size.
- Native `select` elements and native number steppers must not appear directly in production UI.

### Menus

- Top menus, context menus, and panel menus share 30px row height, a 22px icon column, and 8px content spacing.
- Shortcuts occupy the final column and use the `--ui-font-small` monospace token.
- Separators group commands and do not create density through extra blank space.

- Top-menu items use `MenuItemButton` to separate the label, shortcut, and state indicator. Popovers grow with content up to the viewport and configured maximum width; labels stay on one line and truncate with an ellipsis when needed, while shortcuts retain their own column. Full labels and descriptions use the shared tooltip path. `useMenuViewport` constrains open menus and flips submenus near the right edge.
- `ThemedSelect` uses content width with the trigger width as its minimum unless an explicit popup width is provided. It is capped by the viewport and repositions when its size changes. Truncated selected values and option labels retain full hover text; preserve existing tooltip visibility preferences.

### Toggles and Checkboxes

- Independent multi-select choices use `PixelCheckbox`.
- Settings toggles use shared `PreferenceToggle`. `LivePreviewToggle` reuses the same structure and must not duplicate input, track, or thumb markup.
- A toggle row is 35px high. Long explanations belong in Tooltip and do not increase the default row height.

### Panels

- Real panel headers and the tool-options bar are both 43px high. Right-side actions use 26px icon buttons.
- The component library renders the real `.panel > header` directly and does not maintain a separate preview-header implementation.

### Settings Sections

- Standard card-like settings groups inside dialogs use `SettingsSection`. Body content uses `.settings-section-body`; titles and right-side actions come from its internal `SettingsSectionHeader`.
- Settings sections use the `--theme-dialog-section` surface, a 1px border, 8px padding, and a heading separator. Business dialogs must not redefine transparent or dark group backgrounds.
- Page-style settings with side navigation, such as Preferences, may retain a compact page layout, but headings still use `SettingsSectionHeader` instead of near-duplicate custom sizes.
- Headings use `--ui-font-regular` and actions use 30px command buttons. One group must not mix near sizes such as 27px, 28px, and 30px.

### Dialogs

- Every dialog uses `ModalShell`.
- Standard title bars use `DialogHeader`, unifying eyebrow, title, close button, and title actions. Business dialogs must not rebuild title structure.
- Standard dialog and panel headers are both 43px high with 8px horizontal padding. Content uses 8px gaps and 12px padding by default. Footer actions use 8px gaps and 34px buttons.
- Dialog body, settings groups, and footer use `--theme-dialog-content`, `--theme-dialog-section`, and `--theme-dialog-footer`. The same semantic region must not use a local substitute surface.
- Ordinary inline fields use an 88px label column. Canvas-size, color-editor, toolbar, and other domain-constrained grids may override it explicitly.
- Specialized editors may declare compact or spacious content variants but must not assign arbitrary near-duplicate values dialog by dialog.
- Component-library previews reuse the real header, body, and footer styles.

### Settings Navigation

- Preferences, shortcuts, and other sectioned settings windows use `SettingsNavigation`.
- Navigation rows are 32px high, use `--ui-font-regular` body text, and show an accent-colored selected indicator on the left.
- Settings windows must not maintain separate hover, selected, and padding rules for navigation rows.

## Component-Library Gates

- Every reusable component registers its real source and production class.
- Previews render the real component and cover default, hover or selected, disabled, and interactive states.
- Do not use `component-*` classes to imitate a second version of a production component.
- Before adding a local size, decide whether it should be an explicit density variant of an existing component.

## Change Checklist

1. Confirm the change uses semantic tokens instead of new near-duplicate font sizes, spacing, and heights.
2. Confirm icon display size is an integer multiple of source pixels.
3. Confirm the same action has consistent feedback in toolbars, panels, menus, and dialogs.
4. Confirm component-library preview and production UI use the same component and styles.
5. The user performs final visual and interaction acceptance at 1024 x 640 and major desktop sizes.

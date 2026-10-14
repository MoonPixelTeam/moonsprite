# Localization Architecture

[中文](localization.md) | English

MoonSprite's interface language is managed by plain TypeScript language catalogs and a React language context. The registered languages are Simplified Chinese `zh-CN`, English `en-US`, Japanese `ja-JP`, Korean `ko-KR`, Spanish `es-ES`, French `fr-FR`, German `de-DE`, Brazilian Portuguese `pt-BR`, and Russian `ru-RU`. Every catalog must have the same keys and named interpolation placeholders as the source catalog.

## Module Boundaries

- `locales/<locale>.ts` stores one independent catalog per language. The Simplified Chinese catalog defines the complete translation-key set.
- `core/localization.ts` is the only entry for locale codes, available languages, catalog registration, default fallback, and interpolation. It does not depend on React or Tauri. Non-React core algorithms and state modules read the persisted current language through `translateCurrent()` and must not independently parse locale codes.
- `components/I18nProvider.tsx` reads the global language preference, provides `locale` and `t()` to React components, and updates `document.documentElement.lang` after preferences are applied.
- `platform/tauri-api.ts` passes the current language when opening save and export dialogs. `src-tauri/src/platform_dialogs.rs` selects native file-dialog filter text from the nine-language table in `platform_dialogs_localization.rs` and does not read Renderer storage itself.
- `core/file-preferences.ts` persists only languages registered as available. Unknown, damaged, or incomplete language codes fall back to `zh-CN`.
- User input, project names, layer names, file paths, and document pixel data must never be translated.

## Resource Rules

1. The Simplified Chinese catalog is authoritative for translation keys and fallback text. Keys use stable English domain paths such as `app.menu.file.open`.
2. New UI must not leave translatable text only inside JSX. Add a translation key first and read it through `useI18n().t()`.
3. Dynamic text uses named placeholders and does not concatenate sentence fragments whose order depends on language. Interpolation values may only be strings or numbers.
4. Dates, times, numbers, and percentages use `Intl` for the active `locale`. Shortcuts, file extensions, brand names, and API identifiers remain unchanged.
5. A new language catalog must cover every translation key and pass text-overflow checks at 1024 x 640, 1080p, and 4K before entering `AVAILABLE_APP_LOCALES`.
6. `TranslationCatalog` requires every key at compile time; `locales/catalogs.test.ts` checks missing/extra keys, empty values, interpolation placeholders, and known placeholder-copy regressions. These checks do not replace native-speaker review or desktop layout acceptance.
7. User-visible errors and history labels in the TypeScript core use `translateCurrent()`. Rust errors should gradually return stable error codes for Renderer translation; program behavior must never depend on parsing a Chinese error sentence.

## Current Migration Scope

All nine language catalogs cover the same typed key set. Startup, home, editor menus, toolbars, tool options, dialogs, preferences, shortcuts, layers, palettes, color editing, the component library, save and export messages, Windows native file dialogs, undo history, and TypeScript core errors all use language catalogs. Applying a language in Preferences refreshes the interface immediately and updates `document.documentElement.lang`. User input, existing project names, layer names, file paths, and pixel data remain unchanged.

Layout also forms part of localization: menus and dropdowns size to content within viewport bounds, keep shortcuts separate, and expose full text through shared tooltips when truncation is necessary. See the [UI design system](../ui-design-system.en.md). Key completeness and placeholder checks do not establish native-language quality or desktop visual acceptance.

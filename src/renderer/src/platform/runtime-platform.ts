/** Android is a Tauri runtime too; desktop window APIs must not use isTauri alone. */
export function isAndroidRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    && /Android/i.test(navigator.userAgent)
}

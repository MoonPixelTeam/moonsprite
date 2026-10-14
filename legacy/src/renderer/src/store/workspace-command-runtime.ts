// Shared coordination for exports and deferred history; never owns document state.
export const workspaceCommandRuntime: { activeExportCancellation: (() => void) | null; isApplyingDeferredProjectRollbackHistory: boolean } = {
  activeExportCancellation: null,
  isApplyingDeferredProjectRollbackHistory: false
}

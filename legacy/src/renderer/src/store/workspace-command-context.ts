import type { WorkspaceServices } from './workspace-services'
import type { WorkspaceData, WorkspaceState } from './workspace-state'
import type { WorkspaceRecording } from './workspace-recording'

/** Each domain declares the commands it may call; it cannot import the root store. */
export interface WorkspaceCommandContext<Commands extends keyof WorkspaceState = never, Services extends keyof WorkspaceServices = never> {
  get: () => WorkspaceData & Pick<WorkspaceState, Commands>
  set: (update: Partial<WorkspaceData> | ((state: WorkspaceData) => Partial<WorkspaceData>)) => void
  services: Pick<WorkspaceServices, Services>
  recording: WorkspaceRecording
}

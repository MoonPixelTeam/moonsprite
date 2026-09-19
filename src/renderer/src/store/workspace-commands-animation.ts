import { deleteAnimationFrame, setAnimationLoop } from '@/core/animation'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { createAnimationSelectionCommands } from './workspace-commands-animation-selection'
import { createAnimationCelPropertiesCommands } from './workspace-commands-animation-cel-properties'
import { createAnimationCelClipboardCommands } from './workspace-commands-animation-cel-clipboard'
import { createAnimationFrameClipboardCommands } from './workspace-commands-animation-frame-clipboard'
import { createAnimationMaskCommands } from './workspace-commands-animation-mask'
import { createAnimationPlaybackCommands } from './workspace-commands-animation-playback'
import { createAnimationFrameCommands } from './workspace-commands-animation-frame'
import { createAnimationTweenCommands } from './workspace-commands-animation-tween'

/** Composition only; each workflow declares its own command dependencies. */
export function createWorkspaceAnimationCommands(context: WorkspaceCommandContext<
  | 'advanceAnimationFrame'
  | 'commitFloatingPaste'
  | 'commitSelectionChange'
  | 'deleteAnimationFrame'
  | 'deleteSelectedLayerMasks'
  | 'mutateActive'
  | 'selectAnimationCell'
  | 'selectAnimationFrame'
  | 'selectLayer'
  | 'setActiveAnimationFrame'
  | 'setAnimationLoop'
  | 'setAnimationPlaying'
>): WorkspaceAnimationCommands {
  return {
    ...createAnimationSelectionCommands(context),
    ...createAnimationCelPropertiesCommands(context),
    ...createAnimationCelClipboardCommands(context),
    ...createAnimationFrameClipboardCommands(context),
    ...createAnimationMaskCommands(context),
    ...createAnimationPlaybackCommands(context),
    ...createAnimationFrameCommands(context),
    ...createAnimationTweenCommands(context),
  }
}

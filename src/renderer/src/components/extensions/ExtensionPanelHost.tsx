import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { ExtensionPanelContribution } from '@/core/extension-contributions'
import { extensionCommandScriptId } from '@/core/extension-contributions'
import { PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'

interface ExtensionPanelHostProps {
  contributions: ExtensionPanelContribution[]
  visibility: Record<string, boolean>
  documentAvailable: boolean
  commandRunning: boolean
  onVisibilityChange: (key: string, visible: boolean) => void
  onRunCommand: (scriptId: string) => void
}

function ExtensionPanelWindow({ contribution, index, documentAvailable, commandRunning, onClose, onRunCommand }: {
  contribution: ExtensionPanelContribution
  index: number
  documentAvailable: boolean
  commandRunning: boolean
  onClose: () => void
  onRunCommand: (scriptId: string) => void
}) {
  const { t } = useI18n()
  const initialPosition = useMemo(() => {
    const width = Math.min(340, Math.max(220, window.innerWidth - 12))
    const height = Math.min(360, Math.max(150, window.innerHeight - 12))
    const offset = (index % 6) * 22
    return {
      x: Math.max(6, window.innerWidth - width - 22 - offset),
      y: Math.max(6, Math.min(window.innerHeight - height - 6, 72 + offset)),
      width,
      height
    }
  }, [index])
  const floating = useFloatingPanel(
    initialPosition,
    false,
    false,
    `moonsprite.extension-panel-position.v1.${contribution.key}`,
    true,
    undefined,
    false,
    { minWidth: 220, minHeight: 150 }
  )

  return <section
    ref={floating.ref}
    className="panel extension-panel floating-panel"
    data-extension-panel-id={contribution.key}
    style={floating.style}
    onPointerDown={floating.bringToFront}
  >
    <header onPointerDown={floating.startDrag}>
      <strong className="extension-panel-title">{contribution.panel.name}</strong>
      <small>{contribution.extensionName}</small>
      <span className="panel-actions extension-panel-actions" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" title={t('extensions.panel.close')} aria-label={t('extensions.panel.close')} onClick={onClose}><PixelUtilityIcon kind="close" /></button>
      </span>
    </header>
    <div className="extension-panel-body component-scrollbar">
      {contribution.panel.description && <p className="extension-panel-description">{contribution.panel.description}</p>}
      <div className="extension-panel-command-list">
        {contribution.commands.map((command) => <button
          key={command.id}
          type="button"
          className="extension-panel-command"
          title={command.description || command.name}
          disabled={!documentAvailable || commandRunning}
          onClick={() => onRunCommand(extensionCommandScriptId(contribution.extensionId, command.id))}
        >
          <PixelUtilityIcon kind="properties" />
          <span>
            <strong>{command.name}</strong>
            {command.description && <small>{command.description}</small>}
          </span>
        </button>)}
      </div>
    </div>
    <PanelResizeHandles onResize={floating.startResize} />
  </section>
}

export function ExtensionPanelHost({ contributions, visibility, documentAvailable, commandRunning, onVisibilityChange, onRunCommand }: ExtensionPanelHostProps) {
  const visible = contributions.filter((contribution) => visibility[contribution.key])
  if (visible.length === 0) return null
  return createPortal(<>{visible.map((contribution, index) => <ExtensionPanelWindow
    key={contribution.key}
    contribution={contribution}
    index={index}
    documentAvailable={documentAvailable}
    commandRunning={commandRunning}
    onClose={() => onVisibilityChange(contribution.key, false)}
    onRunCommand={onRunCommand}
  />)}</>, document.body)
}

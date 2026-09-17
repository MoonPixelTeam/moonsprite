import { RecoveryService } from './recovery-service'
import { DocumentTransactionRegistry } from './document-transactions'
import type { DocumentSession } from './workspace-types'

export const createWorkspaceServices = () => ({
  documentTransactions: new DocumentTransactionRegistry<DocumentSession>(),
  recoveryService: new RecoveryService()
})
export type WorkspaceServices = ReturnType<typeof createWorkspaceServices>

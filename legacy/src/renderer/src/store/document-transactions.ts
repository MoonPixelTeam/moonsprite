export interface DocumentTransaction<TSession, TData> {
  id: string
  documentId: string
  kind: string
  data: TData
  cancel: (session: TSession, data: TData) => void
}

type StoredDocumentTransaction<TSession> = DocumentTransaction<TSession, unknown>

export class DocumentTransactionRegistry<TSession> {
  private sequence = 0
  private readonly transactions = new Map<string, StoredDocumentTransaction<TSession>>()

  begin<TData>(documentId: string, kind: string, data: TData, cancel: (session: TSession, data: TData) => void): string {
    const id = `${kind}:${documentId}:${++this.sequence}`
    this.transactions.set(id, { id, documentId, kind, data, cancel } as StoredDocumentTransaction<TSession>)
    return id
  }

  get<TData>(id: string, documentId: string, kind: string): DocumentTransaction<TSession, TData> | null {
    const transaction = this.transactions.get(id)
    if (!transaction || transaction.documentId !== documentId || transaction.kind !== kind) return null
    return transaction as DocumentTransaction<TSession, TData>
  }

  finish<TData>(id: string, documentId: string, kind: string): DocumentTransaction<TSession, TData> | null {
    const transaction = this.get<TData>(id, documentId, kind)
    if (!transaction) return null
    this.transactions.delete(id)
    return transaction
  }

  cancel(id: string, session: TSession): boolean {
    const transaction = this.transactions.get(id)
    if (!transaction) return false
    transaction.cancel(session, transaction.data)
    this.transactions.delete(id)
    return true
  }

  cancelDocument(documentId: string, session: TSession): boolean {
    const transactions = [...this.transactions.values()].filter((transaction) => transaction.documentId === documentId)
    for (const transaction of transactions.reverse()) this.cancel(transaction.id, session)
    return transactions.length > 0
  }

  cancelKind(documentId: string, kind: string, session: TSession): boolean {
    const transactions = [...this.transactions.values()].filter((transaction) => transaction.documentId === documentId && transaction.kind === kind)
    for (const transaction of transactions.reverse()) this.cancel(transaction.id, session)
    return transactions.length > 0
  }
}

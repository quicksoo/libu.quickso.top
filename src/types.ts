export type EventTheme = 'festive' | 'solemn'
export type PaymentMethod = 'cash' | 'wechat' | 'alipay' | 'other'

export interface GiftEvent {
  id: string
  name: string
  date: string
  recorder: string
  theme: EventTheme
  createdAt: string
  updatedAt: string
  revision: number
}

export interface GiftRecord {
  id: string
  eventId: string
  name: string
  amountCents: number
  method: PaymentMethod
  relationship: string
  note: string
  createdAt: string
  updatedAt: string
  revision: number
  deletedAt?: string
}

export interface AuditEntry {
  id: string
  eventId: string
  entityId: string
  entityType: 'event' | 'gift'
  action: 'create' | 'update' | 'delete' | 'restore' | 'import'
  occurredAt: string
  before?: string
  after?: string
}

export interface BackupPackage {
  schemaVersion: 1
  exportedAt: string
  events: GiftEvent[]
  gifts: GiftRecord[]
  audits: AuditEntry[]
  integrity: {
    algorithm: 'SHA-256'
    checksum: string
  }
}

export interface GiftDraft {
  name: string
  amountCents: number
  method: PaymentMethod
  relationship: string
  note: string
}

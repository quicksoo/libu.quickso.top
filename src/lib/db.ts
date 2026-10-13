import Dexie, { type EntityTable } from 'dexie'
import type { AuditEntry, GiftDraft, GiftEvent, GiftRecord } from '../types'
import { createId } from './format'

class GiftBookDatabase extends Dexie {
  events!: EntityTable<GiftEvent, 'id'>
  gifts!: EntityTable<GiftRecord, 'id'>
  audits!: EntityTable<AuditEntry, 'id'>

  constructor() {
    super('lihe-gift-book')
    this.version(1).stores({
      events: 'id, createdAt, updatedAt',
      gifts: 'id, eventId, [eventId+deletedAt], createdAt, deletedAt',
      audits: 'id, eventId, entityId, occurredAt',
    })
  }
}

export const db = new GiftBookDatabase()

function audit(
  eventId: string,
  entityId: string,
  entityType: AuditEntry['entityType'],
  action: AuditEntry['action'],
  before?: unknown,
  after?: unknown,
): AuditEntry {
  return {
    id: createId(),
    eventId,
    entityId,
    entityType,
    action,
    occurredAt: new Date().toISOString(),
    before: before ? JSON.stringify(before) : undefined,
    after: after ? JSON.stringify(after) : undefined,
  }
}

export async function listEvents() {
  return db.events.orderBy('updatedAt').reverse().toArray()
}

export async function listGifts(eventId: string, includeDeleted = false) {
  const gifts = await db.gifts.where('eventId').equals(eventId).sortBy('createdAt')
  return includeDeleted ? gifts : gifts.filter((gift) => !gift.deletedAt)
}

export async function createEvent(input: Pick<GiftEvent, 'name' | 'date' | 'recorder' | 'theme'>) {
  const now = new Date().toISOString()
  const event: GiftEvent = { ...input, id: createId(), createdAt: now, updatedAt: now, revision: 1 }
  await db.transaction('rw', db.events, db.audits, async () => {
    await db.events.add(event)
    await db.audits.add(audit(event.id, event.id, 'event', 'create', undefined, event))
  })
  return event
}

export async function addGift(eventId: string, draft: GiftDraft, createdAt = new Date().toISOString()) {
  const gift: GiftRecord = {
    ...draft,
    id: createId(),
    eventId,
    createdAt,
    updatedAt: new Date().toISOString(),
    revision: 1,
  }
  await db.transaction('rw', db.gifts, db.audits, async () => {
    await db.gifts.add(gift)
    await db.audits.add(audit(eventId, gift.id, 'gift', 'create', undefined, gift))
  })
  return gift
}

export async function updateGift(id: string, draft: GiftDraft, expectedRevision: number) {
  return db.transaction('rw', db.gifts, db.audits, async () => {
    const existing = await db.gifts.get(id)
    if (!existing || existing.deletedAt) throw new Error('记录不存在或已删除')
    if (existing.revision !== expectedRevision) throw new Error('记录已在其他页面更新，请刷新后重试')
    const next: GiftRecord = { ...existing, ...draft, updatedAt: new Date().toISOString(), revision: existing.revision + 1 }
    await db.gifts.put(next)
    await db.audits.add(audit(existing.eventId, id, 'gift', 'update', existing, next))
    return next
  })
}

export async function softDeleteGift(id: string, expectedRevision: number) {
  return db.transaction('rw', db.gifts, db.audits, async () => {
    const existing = await db.gifts.get(id)
    if (!existing || existing.deletedAt) throw new Error('记录不存在或已删除')
    if (existing.revision !== expectedRevision) throw new Error('记录已在其他页面更新，请刷新后重试')
    const next = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: existing.revision + 1 }
    await db.gifts.put(next)
    await db.audits.add(audit(existing.eventId, id, 'gift', 'delete', existing, next))
  })
}

export async function importGifts(eventId: string, drafts: Array<GiftDraft & { createdAt?: string }>) {
  const gifts = drafts.map((draft) => {
    const now = new Date().toISOString()
    return {
      ...draft,
      id: createId(),
      eventId,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
      revision: 1,
    } satisfies GiftRecord
  })
  await db.transaction('rw', db.gifts, db.audits, async () => {
    await db.gifts.bulkAdd(gifts)
    await db.audits.bulkAdd(gifts.map((gift) => audit(eventId, gift.id, 'gift', 'import', undefined, gift)))
  })
  return gifts.length
}

export async function getFullBackupData() {
  const [events, gifts, audits] = await Promise.all([db.events.toArray(), db.gifts.toArray(), db.audits.toArray()])
  return { events, gifts, audits }
}

export async function replaceAllData(events: GiftEvent[], gifts: GiftRecord[], audits: AuditEntry[]) {
  await db.transaction('rw', db.events, db.gifts, db.audits, async () => {
    await Promise.all([db.events.clear(), db.gifts.clear(), db.audits.clear()])
    await db.events.bulkAdd(events)
    await db.gifts.bulkAdd(gifts)
    await db.audits.bulkAdd(audits)
  })
}

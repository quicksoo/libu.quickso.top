import { z } from 'zod'
import type { BackupPackage, GiftEvent, GiftRecord } from '../types'
import { getFullBackupData, replaceAllData } from './db'
import { formatCurrency, formatDateTime, paymentLabels } from './format'

const eventSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), date: z.string().min(1), recorder: z.string(),
  theme: z.enum(['festive', 'solemn']), createdAt: z.string().min(1), updatedAt: z.string().min(1), revision: z.number().int().positive(),
})
const giftSchema = z.object({
  id: z.string().min(1), eventId: z.string().min(1), name: z.string().min(1), amountCents: z.number().int().positive(),
  method: z.enum(['cash', 'wechat', 'alipay', 'other']), relationship: z.string().default(''), note: z.string(), createdAt: z.string().min(1), updatedAt: z.string().min(1), revision: z.number().int().positive(), deletedAt: z.string().optional(),
})
const backupSchema = z.object({
  schemaVersion: z.literal(1), exportedAt: z.string().min(1), events: z.array(eventSchema), gifts: z.array(giftSchema),
  audits: z.array(z.object({ id: z.string(), eventId: z.string(), entityId: z.string(), entityType: z.enum(['event', 'gift']), action: z.enum(['create', 'update', 'delete', 'restore', 'import']), occurredAt: z.string(), before: z.string().optional(), after: z.string().optional() })),
  integrity: z.object({ algorithm: z.literal('SHA-256'), checksum: z.string().regex(/^[a-f0-9]{64}$/) }),
})

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function backupPayload(data: Omit<BackupPackage, 'integrity'>) {
  return JSON.stringify(data)
}

export function buildExportName(eventName: string) {
  const exportedAt = new Date()
  const stamp = `${exportedAt.getFullYear()}${String(exportedAt.getMonth() + 1).padStart(2, '0')}${String(exportedAt.getDate()).padStart(2, '0')}_${String(exportedAt.getHours()).padStart(2, '0')}${String(exportedAt.getMinutes()).padStart(2, '0')}${String(exportedAt.getSeconds()).padStart(2, '0')}`
  const safeName = eventName.replace(/[\\/:*?"<>|]/g, '_')
  return `${safeName}_${stamp}`
}

export async function exportBackup() {
  const data = await getFullBackupData()
  const payload = { schemaVersion: 1 as const, exportedAt: new Date().toISOString(), ...data }
  const backup: BackupPackage = { ...payload, integrity: { algorithm: 'SHA-256', checksum: await sha256(backupPayload(payload)) } }
  const date = backup.exportedAt.slice(0, 10).replaceAll('-', '')
  download(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `礼簿备份_${date}.json`)
}

export async function restoreBackup(file: File) {
  const parsed = backupSchema.parse(JSON.parse(await file.text())) as BackupPackage
  const { integrity, ...payload } = parsed
  if (await sha256(backupPayload(payload)) !== integrity.checksum) throw new Error('备份校验失败，文件可能已损坏或被修改')
  const eventIds = new Set(parsed.events.map((event) => event.id))
  if (parsed.gifts.some((gift) => !eventIds.has(gift.eventId))) throw new Error('备份中存在未关联礼簿的礼金记录')
  await replaceAllData(parsed.events, parsed.gifts, parsed.audits)
}

export async function exportEventWorkbook(event: GiftEvent, gifts: GiftRecord[]) {
  const { Workbook } = await import('exceljs')
  const rows = gifts.filter((gift) => !gift.deletedAt).map((gift, index) => ({
    '序号': index + 1,
    '姓名': gift.name,
    '金额（元）': gift.amountCents / 100,
    '支付方式': paymentLabels[gift.method],
    '关系': gift.relationship ?? '',
    '备注': gift.note,
    '录入时间': formatDateTime(gift.createdAt),
  }))
  const summary = [{ '事件名称': event.name, '日期': event.date, '记账人': event.recorder, '有效记录': rows.length, '礼金合计': formatCurrency(gifts.filter((gift) => !gift.deletedAt).reduce((sum, gift) => sum + gift.amountCents, 0)) }]
  const workbook = new Workbook()
  const details = workbook.addWorksheet('礼金明细')
  details.columns = [
    { header: '序号', key: '序号', width: 8 }, { header: '姓名', key: '姓名', width: 16 },
    { header: '金额（元）', key: '金额（元）', width: 14 }, { header: '支付方式', key: '支付方式', width: 12 },
    { header: '关系', key: '关系', width: 14 }, { header: '备注', key: '备注', width: 26 }, { header: '录入时间', key: '录入时间', width: 24 },
  ]
  details.addRows(rows)
  const overview = workbook.addWorksheet('汇总')
  overview.columns = Object.keys(summary[0]).map((header) => ({ header, key: header, width: 18 }))
  overview.addRows(summary)
  download(new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${buildExportName(event.name)}.xlsx`)
}

export async function readExcelGifts(file: File) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.getWorksheet('礼金明细') ?? workbook.worksheets[0]
  if (!sheet) throw new Error('Excel 中没有可读取的工作表')
  const headers = new Map<string, number>()
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => headers.set(String(cell.text).trim(), column))
  const readCell = (row: number, ...names: string[]) => {
    const column = names.map((name) => headers.get(name)).find((value): value is number => value !== undefined)
    return column ? sheet.getRow(row).getCell(column).value : undefined
  }
  const methodMap: Record<string, GiftRecord['method']> = { '现金': 'cash', '微信': 'wechat', '支付宝': 'alipay', '其他': 'other' }
  const gifts: Array<{ name: string; amountCents: number; method: GiftRecord['method']; relationship: string; note: string; createdAt?: string }> = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || !row.hasValues) return
    const name = String(readCell(rowNumber, '姓名', 'name') ?? '').trim()
    const amount = Number(readCell(rowNumber, '金额（元）', '金额', 'amount'))
    if (!name || !Number.isFinite(amount) || amount <= 0) throw new Error(`第 ${rowNumber} 行的姓名或金额无效`)
    const rawDate = readCell(rowNumber, '录入时间')
    const parsedDate = rawDate instanceof Date ? rawDate : rawDate ? new Date(String(rawDate)) : undefined
    gifts.push({
      name,
      amountCents: Math.round(amount * 100),
      method: methodMap[String(readCell(rowNumber, '支付方式') ?? '')] ?? 'other',
      relationship: String(readCell(rowNumber, '关系') ?? ''),
      note: String(readCell(rowNumber, '备注') ?? ''),
      createdAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined,
    })
  })
  if (!gifts.length) throw new Error('Excel 中没有有效礼金记录')
  return gifts
}

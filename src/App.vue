<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Plus, Printer, Search, Trash2, Upload, WalletCards, X } from 'lucide-vue-next'
import type { GiftDraft, GiftEvent, GiftRecord, PaymentMethod } from './types'
import { addGift, createEvent, importGifts, listEvents, listGifts, softDeleteGift, updateGift } from './lib/db'
import { buildExportName, exportEventWorkbook, readExcelGifts } from './lib/backup'
import { amountToChinese, formatBookName, formatCurrency, parseYuan, paymentLabels, toDateInput } from './lib/format'

const events = ref<GiftEvent[]>([])
const gifts = ref<GiftRecord[]>([])
const selectedEventId = ref<string>('')
const loading = ref(true)
const error = ref('')
const notice = ref('')
const query = ref('')
const methodFilter = ref<'all' | PaymentMethod>('all')
const currentPage = ref(1)
const showEventForm = ref(false)
const editingGift = ref<GiftRecord | null>(null)
const excelInput = ref<HTMLInputElement | null>(null)

const eventForm = ref({ name: '', date: toDateInput(), recorder: '', theme: 'festive' as GiftEvent['theme'] })
const giftForm = ref({ name: '', amount: '', method: 'cash' as PaymentMethod, relationship: '', note: '' })

const selectedEvent = computed(() => events.value.find((event) => event.id === selectedEventId.value))
const visibleGifts = computed(() => gifts.value.filter((gift) => {
  const text = `${gift.name} ${gift.note}`.toLowerCase()
  return (methodFilter.value === 'all' || gift.method === methodFilter.value) && text.includes(query.value.trim().toLowerCase())
}))
const totalPages = computed(() => Math.max(1, Math.ceil(visibleGifts.value.length / 12)))
const pageGifts = computed(() => visibleGifts.value.slice((currentPage.value - 1) * 12, currentPage.value * 12))
const printPages = computed(() => {
  const pages: GiftRecord[][] = []
  for (let index = 0; index < gifts.value.length; index += 12) pages.push(gifts.value.slice(index, index + 12))
  return pages.length ? pages : [[]]
})
const pageSubtotal = computed(() => pageGifts.value.reduce((sum, gift) => sum + gift.amountCents, 0))
const methodOptions = Object.entries(paymentLabels) as Array<[PaymentMethod, string]>
const quickAmounts = ['50', '100', '200', '300', '500', '600', '800', '1000', '888', '666']
const quickRelationships = ['朋友', '同学', '乡党', '亲戚', '同事', '战友', '师生', '领导', '客户', '亲家']

watch([query, methodFilter, selectedEventId], () => { currentPage.value = 1 })

function showNotice(message: string) {
  notice.value = message
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 3600)
}

function calculateSubtotal(records: GiftRecord[]) {
  return records.reduce((sum, gift) => sum + gift.amountCents, 0)
}

async function refresh() {
  loading.value = true
  try {
    events.value = await listEvents()
    if (!selectedEventId.value || !events.value.some((event) => event.id === selectedEventId.value)) selectedEventId.value = events.value[0]?.id ?? ''
    gifts.value = selectedEventId.value ? await listGifts(selectedEventId.value) : []
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法读取本地账本'
  } finally {
    loading.value = false
  }
}

async function selectEvent(id: string) {
  selectedEventId.value = id
  currentPage.value = 1
  gifts.value = await listGifts(id)
}

async function submitEvent() {
  if (!eventForm.value.name.trim()) return
  const event = await createEvent({ ...eventForm.value, name: eventForm.value.name.trim(), recorder: eventForm.value.recorder.trim() })
  eventForm.value = { name: '', date: toDateInput(), recorder: '', theme: 'festive' }
  showEventForm.value = false
  selectedEventId.value = event.id
  await refresh()
  showNotice('礼簿已创建，数据已写入本地数据库')
}

function draftFromForm(): GiftDraft | null {
  const amountCents = parseYuan(giftForm.value.amount)
  if (!giftForm.value.name.trim() || amountCents === null) {
    error.value = '请填写姓名和有效金额，金额最多保留两位小数'
    return null
  }
  return { name: giftForm.value.name.trim(), amountCents, method: giftForm.value.method, relationship: giftForm.value.relationship.trim(), note: giftForm.value.note.trim() }
}

async function submitGift() {
  if (!selectedEvent.value) return
  const draft = draftFromForm()
  if (!draft) return
  const eventId = selectedEvent.value.id
  const isNewGift = !editingGift.value
  try {
    if (editingGift.value) {
      await updateGift(editingGift.value.id, draft, editingGift.value.revision)
    } else {
      await addGift(eventId, draft)
    }
    giftForm.value = { name: '', amount: '', method: 'cash', relationship: '', note: '' }
    editingGift.value = null
    gifts.value = await listGifts(eventId)
    currentPage.value = isNewGift ? totalPages.value : Math.min(currentPage.value, totalPages.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  }
}

function beginEdit(gift: GiftRecord) {
  editingGift.value = gift
  giftForm.value = { name: gift.name, amount: (gift.amountCents / 100).toFixed(2), method: gift.method, relationship: gift.relationship ?? '', note: gift.note }
  nextTick(() => document.querySelector<HTMLInputElement>('#gift-name')?.focus())
}

async function removeGift(gift: GiftRecord) {
  if (!window.confirm(`确认撤销 ${gift.name} 的 ${formatCurrency(gift.amountCents)} 记录？记录会保留在审计日志中。`)) return
  try {
    await softDeleteGift(gift.id, gift.revision)
    await selectEvent(gift.eventId)
    showNotice('记录已撤销，可从审计备份中追溯')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '撤销失败'
  }
}

async function handleExcelImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !selectedEvent.value) return
  try {
    const imported = await readExcelGifts(file)
    if (!window.confirm(`将向“${selectedEvent.value.name}”导入 ${imported.length} 条记录，是否继续？`)) return
    await importGifts(selectedEvent.value.id, imported)
    await selectEvent(selectedEvent.value.id)
    showNotice(`已导入 ${imported.length} 条礼金记录`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '导入失败'
  } finally {
    if (excelInput.value) excelInput.value.value = ''
  }
}

async function exportExcel() {
  if (!selectedEvent.value) return
  try {
    await exportEventWorkbook(selectedEvent.value, gifts.value)
    showNotice('Excel 报表已导出')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Excel 导出失败'
  }
}

function printBook() {
  if (!selectedEvent.value) return
  const previousTitle = document.title
  const restoreTitle = () => {
    document.title = previousTitle
    window.removeEventListener('afterprint', restoreTitle)
  }
  document.title = buildExportName(selectedEvent.value.name)
  window.addEventListener('afterprint', restoreTitle)
  window.print()
}

onMounted(refresh)
</script>

<template>
  <main class="giftbook-app" :class="selectedEvent?.theme === 'solemn' ? 'theme-solemn' : 'theme-festive'">
    <section v-if="selectedEvent" class="giftbook-shell">
      <section class="print-cover">
        <h1>礼簿本</h1>
        <div><p>活动名称：{{ selectedEvent.name }}</p><p>活动时间：{{ selectedEvent.date }}</p></div>
      </section>
      <section class="print-book-pages" aria-hidden="true">
        <section v-for="(printPage, pageIndex) in printPages" :key="pageIndex" class="print-book-page">
          <header><strong>{{ selectedEvent.name }}</strong><span>第 {{ pageIndex + 1 }} 页 · {{ printPage.length }} 人 · 本页 {{ formatCurrency(calculateSubtotal(printPage)) }}</span></header>
          <div class="gift-book-columns">
            <div v-for="index in 12" :key="index" class="gift-book-column" :class="{ populated: printPage[index - 1] }">
              <span class="book-cell name-cell"><template v-if="printPage[index - 1]">{{ formatBookName(printPage[index - 1].name) }}</template></span>
              <span class="book-cell amount-cell"><template v-if="printPage[index - 1]">{{ amountToChinese(printPage[index - 1].amountCents) }}</template></span>
            </div>
          </div>
        </section>
      </section>
      <header class="book-header no-print">
        <div class="book-heading">
          <h1>{{ selectedEvent.name }}</h1>
          <p>{{ selectedEvent.date }}<span v-if="selectedEvent.recorder"> · 记账人：{{ selectedEvent.recorder }}</span></p>
          <select v-model="selectedEventId" class="event-switcher" aria-label="切换礼簿" @change="selectEvent(selectedEventId)">
            <option v-for="event in events" :key="event.id" :value="event.id">切换至：{{ event.name }}</option>
          </select>
        </div>
        <div class="header-actions">
          <button class="button danger" type="button" @click="showEventForm = true"><Plus :size="15" />新建礼簿</button>
          <button class="button primary" type="button" @click="printBook"><Printer :size="15" />打印/PDF</button>
          <button class="button outline" type="button" @click="excelInput?.click()"><Upload :size="15" />导入 Excel</button>
          <button class="button outline" type="button" @click="exportExcel"><FileSpreadsheet :size="15" />导出 Excel</button>
          <input ref="excelInput" class="sr-only" type="file" accept=".xlsx" @change="handleExcelImport" />
        </div>
      </header>

      <p v-if="notice" class="alert success">{{ notice }}</p>
      <p v-if="error" class="alert error"><span>{{ error }}</span><button type="button" title="关闭提示" @click="error = ''"><X :size="15" /></button></p>
      <div class="backup-tip no-print"><strong>数据备份提醒：</strong>当前已录入 {{ gifts.length }} 笔礼金记录，建议活动结束后导出 Excel 保存。<button type="button" @click="exportExcel">备份 Excel</button></div>

      <div class="book-layout">
        <section class="entry-card no-print">
          <h2>{{ editingGift ? '修改礼金' : '礼金录入' }}</h2>
          <form class="entry-form" @submit.prevent="submitGift">
            <label><span>姓名 <b>*</b></span><input id="gift-name" v-model="giftForm.name" required maxlength="40" placeholder="来宾姓名" /></label>
            <label><span>金额 <b>*</b></span><input v-model="giftForm.amount" required inputmode="decimal" placeholder="金额（元）" /></label>
            <div class="quick-options" aria-label="快捷金额"><button v-for="amount in quickAmounts" :key="amount" type="button" @click="giftForm.amount = amount">{{ amount }}</button></div>
            <fieldset><legend>收款类型</legend><div class="method-options"><label v-for="[value, label] in methodOptions" :key="value" :class="{ active: giftForm.method === value }"><input v-model="giftForm.method" type="radio" :value="value" />{{ label }}</label></div></fieldset>
            <label><span>关系</span><input v-model="giftForm.relationship" maxlength="30" placeholder="例如：朋友、同学、乡党" /></label>
            <div class="quick-options relationship-options" aria-label="快捷关系"><button v-for="relationship in quickRelationships" :key="relationship" type="button" :class="{ active: giftForm.relationship === relationship }" @click="giftForm.relationship = relationship">{{ relationship }}</button></div>
            <label><span>备注</span><input v-model="giftForm.note" maxlength="120" placeholder="备注内容（选填）" /></label>
            <button class="button primary confirm-button" type="submit"><Pencil v-if="editingGift" :size="16" /><Plus v-else :size="16" />{{ editingGift ? '保存修改' : '确认录入' }}</button>
            <div v-if="editingGift" class="edit-actions"><button type="button" @click="editingGift = null; giftForm = { name: '', amount: '', method: 'cash', relationship: '', note: '' }">取消编辑</button><button class="remove" type="button" @click="removeGift(editingGift)"><Trash2 :size="14" />撤销记录</button></div>
          </form>
          <div class="overall-stats"><span>总金额 <b>{{ formatCurrency(gifts.reduce((sum, gift) => sum + gift.amountCents, 0)) }}</b></span><span>总人数 <b>{{ gifts.length }}</b></span></div>
        </section>

        <section class="gift-book-frame no-print">
          <div class="filter-bar no-print"><label class="search"><Search :size="15" /><input v-model="query" placeholder="搜索姓名或备注..." /></label><select v-model="methodFilter"><option value="all">全部类型</option><option v-for="[value, label] in methodOptions" :key="value" :value="value">{{ label }}</option></select></div>
          <div class="book-pagination no-print"><span>本页：{{ formatCurrency(pageSubtotal) }} <i /> 人数：{{ pageGifts.length }}</span><div><button type="button" title="上一页" :disabled="currentPage === 1" @click="currentPage--"><ChevronLeft :size="16" /></button><b>{{ currentPage }}/{{ totalPages }}</b><button type="button" title="下一页" :disabled="currentPage === totalPages" @click="currentPage++"><ChevronRight :size="16" /></button></div></div>
          <div class="gift-book-columns">
            <button v-for="index in 12" :key="index" class="gift-book-column" :class="{ populated: pageGifts[index - 1] }" type="button" :title="pageGifts[index - 1] ? '点击编辑记录' : '空白礼单'" @click="pageGifts[index - 1] && beginEdit(pageGifts[index - 1])">
              <span class="book-cell name-cell"><template v-if="pageGifts[index - 1]">{{ formatBookName(pageGifts[index - 1].name) }}</template><template v-else>+</template></span>
              <span class="book-cell amount-cell"><template v-if="pageGifts[index - 1]">{{ amountToChinese(pageGifts[index - 1].amountCents) }}</template><template v-else>+</template></span>
            </button>
          </div>
        </section>
      </div>
    </section>

    <section v-else-if="!loading" class="welcome"><WalletCards :size="38" /><h2>电子礼簿</h2><p>创建一个礼簿，开始记录来宾礼金。</p><button class="button primary" type="button" @click="showEventForm = true"><Plus :size="17" />创建礼簿</button></section>
    <div v-else class="loading">正在打开本地礼簿...</div>

    <div v-if="showEventForm" class="modal-backdrop" @click.self="showEventForm = false">
      <form class="modal" @submit.prevent="submitEvent"><div class="modal-title"><div><p>新建礼簿</p><h2>活动信息</h2></div><button type="button" title="关闭" @click="showEventForm = false"><X :size="18" /></button></div><label><span>礼簿名称</span><input v-model="eventForm.name" required maxlength="60" autofocus placeholder="例如：张三、李四婚礼" /></label><div class="two-column"><label><span>活动日期</span><input v-model="eventForm.date" required type="date" /></label><label><span>记账人</span><input v-model="eventForm.recorder" maxlength="40" placeholder="选填" /></label></div><fieldset><legend>礼簿风格</legend><label class="radio"><input v-model="eventForm.theme" type="radio" value="festive" />喜事</label><label class="radio"><input v-model="eventForm.theme" type="radio" value="solemn" />庄重</label></fieldset><button class="button primary full" type="submit"><Plus :size="17" />创建礼簿</button></form>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { GiftEvent, GiftRecord } from '../types'
import { amountToChinese, formatBookName, formatCurrency } from '../lib/format'

const props = defineProps<{
  event: GiftEvent | undefined
  gifts: GiftRecord[]
  loading: boolean
  page: number
  pageCount: number
}>()

const emit = defineEmits<{ 'change-page': [page: number] }>()
const pageGifts = computed(() => props.gifts.slice((props.page - 1) * 12, props.page * 12))
const pageSubtotal = computed(() => pageGifts.value.reduce((sum, gift) => sum + gift.amountCents, 0))
const totalAmount = computed(() => props.gifts.reduce((sum, gift) => sum + gift.amountCents, 0))

function setPage(page: number) {
  emit('change-page', Math.max(1, Math.min(props.pageCount, page)))
}
</script>

<template>
  <section class="display-stage" :class="{ 'is-loading': loading }">
    <template v-if="event">
      <header class="display-header">
        <div class="display-event"><strong>{{ event.name }}</strong><span>{{ event.date }}</span><span>总金额：{{ formatCurrency(totalAmount) }}</span><span>总人数：{{ gifts.length }}</span></div>
        <div class="display-status"><i />副屏同步</div>
      </header>
      <div class="display-book-frame">
        <div class="display-pagination">
          <span>总金额：{{ formatCurrency(totalAmount) }} <i /> 总人数：{{ gifts.length }} <i /> 本页金额：{{ formatCurrency(pageSubtotal) }} <i /> 本页人数：{{ pageGifts.length }}</span>
          <div><button type="button" title="上一页" :disabled="page <= 1" @click="setPage(page - 1)"><ChevronLeft :size="20" /></button><b>{{ page }}/{{ pageCount }}</b><button type="button" title="下一页" :disabled="page >= pageCount" @click="setPage(page + 1)"><ChevronRight :size="20" /></button></div>
        </div>
        <div class="display-columns">
          <div v-for="index in 12" :key="index" class="display-column" :class="{ populated: pageGifts[index - 1] }">
            <span class="display-cell display-name"><template v-if="pageGifts[index - 1]">{{ formatBookName(pageGifts[index - 1].name) }}</template><template v-else>+</template></span>
            <span class="display-cell display-amount"><template v-if="pageGifts[index - 1]">{{ amountToChinese(pageGifts[index - 1].amountCents) }}</template><template v-else>+</template></span>
          </div>
        </div>
      </div>
    </template>
    <p v-else class="display-empty">{{ loading ? '正在连接礼簿...' : '未找到活动数据' }}</p>
  </section>
</template>

<style scoped>
.display-stage { min-height: 100vh; padding: 24px; color: var(--primary-dark); background: #fffafa; }.display-header { width: min(1180px, 100%); display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 0 auto 12px; padding: 0 4px 13px; border-bottom: 1px solid var(--border); }.display-event { display: flex; align-items: baseline; gap: 14px; min-width: 0; }.display-event strong { overflow: hidden; font-family: 'STKaiti', 'KaiTi', serif; font-size: clamp(19px, 2vw, 30px); text-overflow: ellipsis; white-space: nowrap; }.display-event span { color: #69767b; font-size: 13px; white-space: nowrap; }.display-status { display: inline-flex; align-items: center; gap: 7px; color: var(--primary); font-size: 12px; font-weight: 700; white-space: nowrap; }.display-status i { width: 8px; height: 8px; border-radius: 50%; background: #29945b; box-shadow: 0 0 0 3px #dff3e7; }.display-book-frame { width: min(1180px, 100%); min-height: calc(100vh - 84px); margin: 0 auto; padding: 0 0 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--light); }.display-pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 0 10px; color: var(--primary); font-size: 14px; font-weight: 750; }.display-pagination > span { min-width: 0; line-height: 1.8; }.display-pagination i { display: inline-block; width: 1px; height: 14px; margin: 0 10px; vertical-align: -2px; background: var(--border); }.display-pagination div { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; }.display-pagination b { min-width: 35px; color: var(--primary-dark); text-align: center; }.display-pagination button { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 7px; color: #fff; background: var(--primary); }.display-pagination button:disabled { background: color-mix(in srgb, var(--primary) 42%, #fff); cursor: not-allowed; }.display-columns { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 2px; min-height: calc(100vh - 155px); margin: 0 7px; padding: 4px; border: 2px solid var(--border); border-radius: 7px; background: var(--book-surface); box-shadow: inset 0 0 10px rgba(0,0,0,.04); }.display-column { display: grid; grid-template-rows: 1fr 1.55fr; min-width: 0; overflow: hidden; border: 1px solid var(--book-cell-border); border-radius: 4px; background: rgba(255,255,255,.26); color: #c3d0d4; }.display-column.populated { color: var(--primary-dark); }.display-cell { display: grid; min-width: 0; overflow: hidden; place-items: center; padding: 10px 0; writing-mode: vertical-lr; text-orientation: mixed; font-family: 'STKaiti', 'KaiTi', 'SimKai', serif; font-size: clamp(20px, 2.8vw, 38px); font-weight: 700; line-height: 1.25; letter-spacing: 5px; text-align: center; }.display-name { border-bottom: 2px solid var(--book-separator); }.display-amount { font-size: clamp(17px, 2.3vw, 32px); letter-spacing: 3px; }.display-column:not(.populated) .display-cell { font-family: Arial, sans-serif; font-size: 18px; letter-spacing: 0; }.display-empty { display: grid; min-height: 80vh; place-items: center; margin: 0; color: #718085; font-size: 20px; }
@media (max-width: 620px) { .display-stage { padding: 8px; }.display-header { margin-bottom: 7px; padding-inline: 2px; }.display-event { gap: 8px; }.display-event strong { font-size: 16px; }.display-event span { font-size: 11px; }.display-pagination { min-height: 46px; padding-inline: 5px; font-size: 11px; }.display-pagination i { margin-inline: 5px; }.display-columns { min-height: calc(100vh - 105px); margin-inline: 2px; gap: 1px; padding: 2px; }.display-cell { padding: 5px 0; font-size: 15px; letter-spacing: 2px; }.display-amount { font-size: 13px; letter-spacing: 2px; } }
</style>

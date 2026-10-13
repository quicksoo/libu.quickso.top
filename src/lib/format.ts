import type { PaymentMethod } from '../types'

export const paymentLabels: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  other: '其他',
}

export function formatCurrency(amountCents: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(amountCents / 100)
}

export function parseYuan(value: string) {
  const normalized = value.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [yuan, decimal = ''] = normalized.split('.')
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function amountToChinese(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return ''
  if (amountCents === 0) return '零元整'
  const units = '京亿万仟佰拾兆万仟佰拾亿仟佰拾万仟佰拾元角分'
  const digits = `${Math.floor(amountCents / 100)}${String(amountCents % 100).padStart(2, '0')}`
  if (digits.length > units.length) return '金额过大'
  const mapped = digits.split('').map((digit, index) => '零壹贰叁肆伍陆柒捌玖'[Number(digit)] + units[units.length - digits.length + index]).join('')
  return mapped
    .replace(/零(仟|佰|拾|角)/g, '零')
    .replace(/零+/g, '零')
    .replace(/零(兆|万|亿|元)/g, '$1')
    .replace(/(兆|亿)万/g, '$1')
    .replace(/亿万/g, '亿')
    .replace(/零元/g, '元')
    .replace(/零角/g, '零')
    .replace(/零分/g, '')
    .replace(/元$/, '元整')
    .replace(/角$/, '角整')
}

export function formatBookName(name: string) {
  return name.length === 2 ? `${name[0]}　${name[1]}` : name
}

export function toDateInput(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 10)
}

export function createId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

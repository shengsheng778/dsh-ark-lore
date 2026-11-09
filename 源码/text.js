/** Text normalisation shared by data loading and lookup. */

export function norm(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

const SKIP_BIGRAMS = new Set([
  '怎么', '什么', '后来', '之前', '之后', '发生', '剧情', '一下', '这个', '那个',
  '现在', '知道', '告诉', '说说', '讲讲', '关于', '多少', '哪里', '是谁', '的人',
  '的事', '时候', '可以', '帮我', '看看', '查查', '问一', '一个', '哪些', '如何',
  '为什么', '是不是', '有没有', '怎么样', '然后', '还有', '就是', '不是', '他们',
])

export function bigrams(text) {
  const out = new Set()
  const normalized = String(text ?? '').normalize('NFKC').toLowerCase()
  for (const segment of normalized.split(/[^\p{L}\p{N}]+/u)) {
    const chars = [...segment]
    for (let i = 0; i < chars.length - 1; i += 1) {
      const gram = chars[i] + chars[i + 1]
      if (!SKIP_BIGRAMS.has(gram)) out.add(gram)
    }
  }
  return out
}

export function asArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function oneLine(value, max = 90) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function truncate(text, max) {
  const chars = [...String(text ?? '')]
  if (chars.length <= max) return chars.join('')
  return `${chars.slice(0, Math.max(1, max - 1)).join('')}…`
}

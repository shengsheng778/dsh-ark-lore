import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED = {
  entity: new Set(['name', 'summary', 'body', 'faction', 'tags']),
  event: new Set(['title', 'summary', 'body', 'chapter', 'source']),
  meme: new Set(['term', 'meaning', 'origin', 'usage', 'avoid']),
}
const STORY_CDN = 'https://fastly.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@master/zh_CN/gamedata/story/'
const STORY_TABLE = 'https://fastly.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@master/zh_CN/gamedata/excel/story_review_table.json'
const LINE_RE = /^\[name="([^"]*)"\]\s*(.*)$/
const TAG_RE = /\[[^\]]*\]/

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function apiUrl(params) {
  const url = new URL('https://prts.wiki/api.php')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'dsh-ark-lore/0.9 (live lookup)' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function pageUrl(title) {
  return `https://prts.wiki/w/${encodeURIComponent(String(title).replaceAll(' ', '_'))}`
}

function titleFromUrl(raw) {
  try {
    const url = new URL(raw)
    if (!/(^|\.)prts\.wiki$/.test(url.hostname)) return ''
    const path = decodeURIComponent(url.pathname)
    const match = path.match(/\/w\/(.+)$/)
    return match ? match[1].replaceAll('_', ' ') : ''
  } catch {
    return ''
  }
}

function loadCorrections(dataDir) {
  const file = join(dataDir, 'corrections.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function saveCorrections(dataDir, corrections) {
  writeFileSync(join(dataDir, 'corrections.json'), `${JSON.stringify(corrections, null, 2)}\n`, 'utf8')
}

function loadDynamic(dataDir) {
  const file = join(dataDir, 'dynamic.json')
  if (!existsSync(file)) return { memes: [], stories: [] }
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    return { memes: Array.isArray(doc.memes) ? doc.memes : [], stories: Array.isArray(doc.stories) ? doc.stories : [] }
  } catch {
    return { memes: [], stories: [] }
  }
}

function saveDynamic(dataDir, dynamic) {
  writeFileSync(join(dataDir, 'dynamic.json'), `${JSON.stringify(dynamic, null, 2)}\n`, 'utf8')
}

function parseStory(text) {
  const lines = []
  for (const raw of String(text ?? '').split('\n')) {
    const match = raw.trim().match(LINE_RE)
    if (!match) continue
    const speaker = match[1].trim() || '旁白'
    const body = match[2].replace(TAG_RE, '').trim()
    if (body) lines.push({ speaker, text: body })
  }
  return lines
}

function targetKind(corpus, id) {
  if (corpus.byId.has(id)) return 'entity'
  if (corpus.eventById.has(id)) return 'event'
  if (corpus.memeById.has(id)) return 'meme'
  return ''
}

export function createLiveTools(corpus, dataDir, config = {}) {
  const maxChars = Math.max(1000, Math.min(Number(config.webMaxChars) || 6000, 12000))

  return [{
    name: 'ark_web',
    description:
      '联 PRTS 和游戏数据：search 搜页面，read 读页面，fix 写修正，learn_meme 收新梗，sync_stories 拉新活动剧情。只在库里的数据过时、出错或查不到时用；fix/learn_meme 必须带 source 或 url。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'read', 'fix', 'learn_meme', 'sync_stories'] },
        query: { type: 'string', description: 'search 的搜索词。' },
        title: { type: 'string', description: 'read 的页面标题。' },
        url: { type: 'string', description: 'read 的 PRTS 页面 URL；fix/learn_meme 时作为出处。' },
        id: { type: 'string', description: 'fix 的本地 id，例如 lee_agency；learn_meme 可指定新 id。' },
        fields: {
          type: 'object',
          description: 'fix 要改的字段，例如 { "summary": "..." }。',
          additionalProperties: { type: 'string' },
        },
        source: { type: 'string', description: 'fix/learn_meme 的来源说明。' },
        term: { type: 'string', description: 'learn_meme 的梗名。' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'learn_meme 的别名。' },
        meaning: { type: 'string', description: 'learn_meme 的意思。' },
        usage: { type: 'string', description: 'learn_meme 怎么用。' },
        avoid: { type: 'string', description: 'learn_meme 别怎么用。' },
        limit: { type: 'number', description: 'sync_stories 最多拉多少段，默认 40，最大 80。' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, render: (_a, v) => [{ type: 'text', text: String(v?.text ?? '') }] },
    timeoutMs: 120000,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const action = String(args?.action ?? '')
      try {
        if (action === 'search') {
          const query = String(args?.query ?? '').trim()
          if (!query) return { text: '给个搜索词。' }
          const data = await getJson(apiUrl({
            action: 'query',
            list: 'search',
            srsearch: query,
            srlimit: '5',
            format: 'json',
            utf8: '1',
          }))
          const rows = data?.query?.search ?? []
          if (!rows.length) return { text: `PRTS 没搜到「${query}」。` }
          const lines = [`PRTS 命中 ${rows.length} 条：`]
          rows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.title}`)
            const snippet = stripHtml(row.snippet)
            if (snippet) lines.push(`   ${snippet.slice(0, 180)}`)
            lines.push(`   ${pageUrl(row.title)}`)
          })
          return { text: lines.join('\n') }
        }

        if (action === 'read') {
          const title = String(args?.title ?? '').trim() || titleFromUrl(args?.url)
          if (!title) return { text: '给 title，或给 prts.wiki 页面 URL。' }
          const data = await getJson(apiUrl({
            action: 'parse',
            page: title,
            prop: 'wikitext',
            format: 'json',
            utf8: '1',
            redirects: '1',
          }))
          const text = data?.parse?.wikitext?.['*'] ?? ''
          if (!text) return { text: `PRTS 没有「${title}」的正文。` }
          return { text: `【${title}】\n${stripHtml(text).slice(0, maxChars)}` }
        }

        if (action === 'fix') {
          const id = String(args?.id ?? '').trim()
          const kind = targetKind(corpus, id)
          if (!kind) return { text: `本地没有「${id}」，不写。先用 ark_find 找 id。` }
          const fields = args?.fields && typeof args.fields === 'object' ? args.fields : {}
          const patch = {}
          for (const [key, value] of Object.entries(fields)) {
            if (!ALLOWED[kind].has(key)) continue
            const text = String(value ?? '').trim()
            if (text) patch[key] = text
          }
          if (!Object.keys(patch).length) {
            return { text: `没有可写字段。${kind} 允许：${[...ALLOWED[kind]].join('、')}。` }
          }
          const source = String(args?.source ?? '').trim()
          const url = String(args?.url ?? '').trim()
          if (!source && !url) return { text: 'fix 必须带 source 或 url，别凭印象改。' }
          const corrections = loadCorrections(dataDir)
          const entry = corrections[id] ?? {}
          for (const [key, value] of Object.entries(patch)) {
            entry[key] = { text: value, source, url, updatedAt: new Date().toISOString() }
          }
          corrections[id] = entry
          saveCorrections(dataDir, corrections)
          const result = corpus.applyCorrection(id, patch, { source, url })
          return { text: `${result}\n已写入 corrections.json；下次启动仍然生效。` }
        }

        if (action === 'learn_meme') {
          const term = String(args?.term ?? '').trim()
          const meaning = String(args?.meaning ?? '').trim()
          const source = String(args?.source ?? '').trim()
          const url = String(args?.url ?? '').trim()
          if (!term || !meaning) return { text: 'learn_meme 至少要 term 和 meaning。' }
          if (!source && !url) return { text: 'learn_meme 必须带 source 或 url，别凭印象收梗。' }
          const aliases = Array.isArray(args?.aliases)
            ? args.aliases.map((item) => String(item).trim()).filter(Boolean)
            : String(args?.aliases ?? '').split(/[、,，]/).map((item) => item.trim()).filter(Boolean)
          let id = String(args?.id ?? '').trim()
          if (!id) {
            const slug = term.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
            id = `meme.dynamic.${slug || Date.now()}`
          }
          let suffix = 2
          const baseId = id
          while (corpus.memeById.has(id)) id = `${baseId}-${suffix++}`
          const raw = {
            id,
            term,
            aliases,
            kind: 'community',
            meaning,
            usage: String(args?.usage ?? '').trim(),
            avoid: String(args?.avoid ?? '').trim(),
            confidence: 'medium',
            source: source || url,
          }
          const dynamic = loadDynamic(dataDir)
          dynamic.memes.push(raw)
          saveDynamic(dataDir, dynamic)
          corpus.addMeme(raw)
          return { text: `已收新梗「${term}」（${id}），写进 dynamic.json，马上能搜到。\n出处：${source || url}` }
        }

        if (action === 'sync_stories') {
          const limit = Math.max(1, Math.min(Number(args?.limit) || 40, 80))
          const table = await getJson(STORY_TABLE)
          const seen = new Set()
          const fresh = []
          for (const entry of Object.values(table ?? {})) {
            if (!entry || typeof entry !== 'object') continue
            const chapter = String(entry.name ?? '活动').trim()
            for (const item of entry.infoUnlockDatas ?? []) {
              const txt = String(item?.storyTxt ?? '').trim()
              const id = txt ? `story.${txt.replaceAll('/', '.')}` : ''
              if (!txt || !id || seen.has(id) || corpus.storyById.has(id)) continue
              seen.add(id)
              fresh.push({ chapter, item, txt, id })
            }
          }
          if (!fresh.length) return { text: '游戏数据里没有新剧情，库里已经是最新。' }
          const picked = fresh.slice(0, limit)
          const added = []
          for (const row of picked) {
            const response = await fetch(STORY_CDN + row.txt + '.txt', {
              headers: { 'user-agent': 'dsh-ark-lore/0.9 (sync)' },
              signal: AbortSignal.timeout(30000),
            })
            if (!response.ok) continue
            const lines = parseStory(await response.text())
            if (!lines.length) continue
            const code = String(row.item.storyCode ?? '').trim()
            const name = String(row.item.storyName ?? row.txt.split('/').pop()).trim()
            const tag = String(row.item.avgTag ?? '').trim()
            const raw = {
              id: row.id,
              title: `${row.chapter}${code ? ` ${code}` : ''} · ${name}${tag ? `（${tag}）` : ''}`,
              chapter: row.chapter,
              file: row.txt.split('/').pop(),
              lines,
              source: `游戏数据 ${row.txt}`,
            }
            const dynamic = loadDynamic(dataDir)
            dynamic.stories.push(raw)
            saveDynamic(dataDir, dynamic)
            corpus.addStory(raw, false)
            added.push(`${raw.title}（${lines.length} 句）`)
          }
          if (added.length) corpus.reindex()
          return {
            text: added.length
              ? `新剧情 ${added.length} 段已入库：\n${added.slice(0, 8).join('\n')}${added.length > 8 ? `\n…还有 ${added.length - 8} 段` : ''}`
              : '抓到了新条目，但正文都没取下来；过会儿再试。',
          }
        }

        return { text: 'action 只认 search / read / fix / learn_meme / sync_stories。' }
      } catch (error) {
        return { text: `联网查询失败：${error.message}。本地数据还能用；别把失败当成查到了。` }
      }
    },
  }]
}

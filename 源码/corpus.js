import { asArray, bigrams, norm, oneLine, truncate } from './text.js'

const TYPES = new Set(['nation', 'city', 'org', 'person', 'concept'])
const TYPE_LABEL = { nation: '国', city: '城', org: '组织', person: '人', concept: '概念' }
const KNOWLEDGE = new Set(['public', 'rumor', 'rhodes', 'seen'])
const KNOWLEDGE_LABEL = {
  public: '公开',
  rumor: '传闻',
  rhodes: '罗德岛档案',
  seen: '亲眼见过',
}
const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低', pending: '待核' }
const MEME_KIND_LABEL = {
  nickname: '外号',
  voice: '语音',
  story: '剧情',
  gameplay: '玩法',
  community: '社区',
}

// 用户不会记活动名，只会说“7.5 周年”“夏活”“春节”。这些是章节级别名。
const CHAPTER_ALIASES = {
  '7.5周年': ['时间啊，向前！'],
  '七点五周年': ['时间啊，向前！'],
  '7.5 周年': ['时间啊，向前！'],
  '半周年': ['时间啊，向前！'],
  '7周年': ['众生行记'],
  '七周年': ['众生行记'],
  '6周年': ['巴别塔'],
  '六周年': ['巴别塔'],
  '5周年': ['孤星'],
  '五周年': ['孤星'],
  '4周年': ['愚人号'],
  '四周年': ['愚人号'],
  '3周年': ['覆潮之下'],
  '三周年': ['覆潮之下'],
  '2.5周年': ['长夜临光'],
  '3.5周年': ['叙拉古人'],
  '4.5周年': ['崔林特尔梅之金'],
  '夏活': ['火蓝之心', '密林悍将归来', '多索雷斯假日', '理想城：长夏狂欢季', '火山旅梦', '太阳甩在身后', '无忧梦呓'],
  '夏季活动': ['火蓝之心', '密林悍将归来', '多索雷斯假日', '理想城：长夏狂欢季', '火山旅梦', '太阳甩在身后', '无忧梦呓'],
  '春节': ['洪炉示岁', '画中人', '将进酒', '登临意', '怀黍离', '相见欢', '辞岁行'],
  '春节活动': ['洪炉示岁', '画中人', '将进酒', '登临意', '怀黍离', '相见欢', '辞岁行'],
  '过年': ['洪炉示岁', '画中人', '将进酒', '登临意', '怀黍离', '相见欢', '辞岁行'],
  '今年周年': ['时间啊，向前！'],
  '去年周年': ['众生行记'],
  '周年': ['时间啊，向前！'],
  '岁家肉鸽': ['岁的界园志异', '肉鸽新期'],
  '岁肉鸽': ['岁的界园志异', '肉鸽新期'],
}

function parseTime(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    const match = raw.match(/(\d{3,4})(?:[-./](\d{1,2}))?(?:[-./](\d{1,2}))?/)
    if (!match) return null
    const out = { year: Number(match[1]) }
    if (match[2]) out.month = Number(match[2])
    if (match[3]) out.day = Number(match[3])
    out.precision = out.day ? 'day' : out.month ? 'month' : 'year'
    return out
  }
  if (typeof raw === 'object') {
    const year = Number(raw.year)
    if (!Number.isFinite(year)) return null
    const out = { year }
    if (Number(raw.month) >= 1) out.month = Number(raw.month)
    if (Number(raw.day) >= 1) out.day = Number(raw.day)
    const precision = String(raw.precision ?? '')
    out.precision = ['day', 'month', 'year', 'circa'].includes(precision)
      ? precision
      : out.day ? 'day' : out.month ? 'month' : 'year'
    return out
  }
  return null
}

function sortKey(time) {
  return time.year * 10000 + (time.month ?? 6) * 100 + (time.day ?? 15)
}

function timeLabel(time, short = false) {
  if (!time?.year) return '时间不明'
  const pre = time.precision === 'circa' ? '约' : ''
  if (short) {
    if (!time.month) return `${pre}${time.year}`
    return `${pre}${time.year}-${String(time.month).padStart(2, '0')}`
  }
  if (!time.month) return `${pre}${time.year}年`
  if (!time.day) return `${pre}${time.year}年${time.month}月`
  return `${pre}${time.year}年${time.month}月${time.day}日`
}

function parsePoint(value) {
  if (!value) return null
  const match = String(value).match(/(\d{3,4})(?:[-./](\d{1,2}))?/)
  if (!match) return null
  return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null }
}

function pointCompare(time, point, side) {
  if (!point) return true
  if (time.year !== point.year) return side === 'from' ? time.year > point.year : time.year < point.year
  if (point.month == null) return true
  return side === 'from' ? (time.month ?? 6) >= point.month : (time.month ?? 6) <= point.month
}

export class Corpus {
  constructor({ canon = '', entities = [], events = [], memes = [], records = {}, stories = [], chapters = {}, manifest = {} }) {
    this.canon = String(canon).trim()
    this.loadWarnings = []
    this.entities = []
    this.byId = new Map()
    this.aliasToId = new Map()
    this.events = []
    this.memes = []
    this.memeById = new Map()
    this.records = new Map()
    this.stories = []
    this.storyById = new Map()
    this.chapterAliases = chapters && typeof chapters === 'object' ? chapters : {}
    this.manifest = manifest && typeof manifest === 'object' ? manifest : {}
    this._aliasRows = []
    this._posting = new Map()

    const duplicateEntities = new Set()
    for (const raw of entities) {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.name) {
        this.loadWarnings.push(`跳过缺少 id/name 的实体：${JSON.stringify(raw)?.slice(0, 80)}`)
        continue
      }
      const id = String(raw.id).trim()
      if (this.byId.has(id)) {
        duplicateEntities.add(id)
        continue
      }
      const entity = {
        id,
        type: TYPES.has(raw.type) ? raw.type : 'org',
        name: String(raw.name).trim(),
        aliases: asArray(raw.aliases).filter((alias) => alias !== raw.name),
        faction: raw.faction ? String(raw.faction).trim() : '',
        summary: String(raw.summary ?? '').trim(),
        body: String(raw.body ?? '').trim(),
        tags: asArray(raw.tags),
        knowledge: KNOWLEDGE.has(raw.knowledge) ? raw.knowledge : 'public',
        confidence: ['high', 'medium', 'low', 'pending'].includes(raw.confidence)
          ? raw.confidence
          : 'high',
        source: String(raw.source ?? '').trim(),
        asOf: String(raw.asOf ?? '').trim(),
        background: raw.background === true,
        file: raw.file ?? '',
      }
      this.entities.push(entity)
      this.byId.set(id, entity)
      for (const alias of [entity.name, ...entity.aliases]) {
        const key = norm(alias)
        if (!key) continue
        if (!this.aliasToId.has(key)) this.aliasToId.set(key, id)
      }
    }
    if (duplicateEntities.size) {
      throw new Error(`[ark-lore] 实体 id 重复：${[...duplicateEntities].join(', ')}`)
    }

    const duplicateEvents = new Set()
    for (const raw of events) {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.title) {
        this.loadWarnings.push(`跳过缺少 id/title 的事件：${JSON.stringify(raw)?.slice(0, 80)}`)
        continue
      }
      const time = parseTime(raw.time)
      if (!time) {
        this.loadWarnings.push(`跳过没有合法时间的事件：${raw.id}`)
        continue
      }
      const id = String(raw.id).trim()
      if (this.events.some((event) => event.id === id)) {
        duplicateEvents.add(id)
        continue
      }
      this.events.push({
        id,
        title: String(raw.title).trim(),
        time,
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
        factions: asArray(raw.factions),
        entities: asArray(raw.entities),
        summary: String(raw.summary ?? '').trim(),
        body: String(raw.body ?? '').trim(),
        chapter: String(raw.chapter ?? '').trim(),
        confidence: ['high', 'medium', 'low', 'pending'].includes(raw.confidence)
          ? raw.confidence
          : 'high',
        source: String(raw.source ?? '').trim(),
        imported: raw.imported === true,
      })
    }
    if (duplicateEvents.size) {
      throw new Error(`[ark-lore] 事件 id 重复：${[...duplicateEvents].join(', ')}`)
    }

    const duplicateMemes = new Set()
    for (const raw of memes) {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.term) {
        this.loadWarnings.push(`跳过缺少 id/term 的梗：${JSON.stringify(raw)?.slice(0, 80)}`)
        continue
      }
      const id = String(raw.id).trim()
      if (this.memeById.has(id)) {
        duplicateMemes.add(id)
        continue
      }
      const meme = {
        id,
        term: String(raw.term).trim(),
        aliases: asArray(raw.aliases).filter((alias) => alias !== raw.term),
        kind: Object.hasOwn(MEME_KIND_LABEL, raw.kind) ? raw.kind : 'community',
        meaning: String(raw.meaning ?? '').trim(),
        origin: String(raw.origin ?? '').trim(),
        usage: String(raw.usage ?? '').trim(),
        avoid: String(raw.avoid ?? '').trim(),
        confidence: ['high', 'medium', 'low', 'pending'].includes(raw.confidence)
          ? raw.confidence
          : 'medium',
        source: String(raw.source ?? '').trim(),
        freshUntil: String(raw.freshUntil ?? '').trim(),
      }
      this.memes.push(meme)
      this.memeById.set(id, meme)
    }
    if (duplicateMemes.size) {
      throw new Error(`[ark-lore] 梗 id 重复：${[...duplicateMemes].join(', ')}`)
    }

    for (const [id, raw] of Object.entries(records)) {
      if (!this.byId.has(id)) {
        this.loadWarnings.push(`跳过没有对应实体的干员档案：${id}`)
        continue
      }
      if (!raw || typeof raw !== 'object') continue
      const sections = []
      for (const section of (Array.isArray(raw.sections) ? raw.sections : [])) {
        if (!section || typeof section !== 'object') continue
        const text = String(section.text ?? '').trim()
        if (!text) continue
        sections.push({ title: String(section.title ?? '档案').trim() || '档案', text })
      }
      if (!sections.length) continue
      this.records.set(id, {
        name: (() => {
          const rawName = String(raw.name ?? '').trim()
          return rawName && rawName.toLowerCase() !== 'unknown' ? rawName : this.byId.get(id).name
        })(),
        sections,
        source: String(raw.source ?? '').trim(),
      })
    }

    const duplicateStories = new Set()
    for (const raw of stories) {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.title) {
        this.loadWarnings.push(`跳过缺少 id/title 的剧情：${JSON.stringify(raw)?.slice(0, 80)}`)
        continue
      }
      const id = String(raw.id).trim()
      if (this.storyById.has(id)) {
        duplicateStories.add(id)
        continue
      }
      const lines = []
      for (const line of (Array.isArray(raw.lines) ? raw.lines : [])) {
        const text = String(line?.text ?? '').trim()
        if (!text) continue
        lines.push({ speaker: String(line?.speaker ?? '旁白').trim() || '旁白', text })
      }
      if (!lines.length) continue
      const story = {
        id,
        title: String(raw.title).trim(),
        chapter: String(raw.chapter ?? '').trim(),
        file: String(raw.file ?? '').trim(),
        aliases: asArray(raw.aliases),
        lines,
        source: String(raw.source ?? '').trim(),
      }
      this.stories.push(story)
      this.storyById.set(id, story)
    }
    if (duplicateStories.size) {
      throw new Error(`[ark-lore] 剧情 id 重复：${[...duplicateStories].join(', ')}`)
    }

    this.events.sort((a, b) => {
      const delta = sortKey(a.time) - sortKey(b.time)
      if (delta !== 0) return delta
      if (a.order !== b.order) return a.order - b.order
      return a.title.localeCompare(b.title, 'zh')
    })
    this.events.forEach((event, index) => { event.index = index })
    this.eventById = new Map(this.events.map((event) => [event.id, event]))

    this._buildIndex()
  }

  _buildIndex() {
    const indexText = (key, ...texts) => {
      const seen = new Set()
      for (const text of texts) {
        for (const gram of bigrams(text)) {
          if (seen.has(gram)) continue
          seen.add(gram)
          let posting = this._posting.get(gram)
          if (!posting) {
            posting = new Set()
            this._posting.set(gram, posting)
          }
          posting.add(key)
        }
      }
    }

    for (const entity of this.entities) {
      const key = `entity:${entity.id}`
      this._aliasRows.push({ key, kind: 'entity', id: entity.id, norm: norm(entity.name), label: entity.name })
      for (const alias of entity.aliases) {
        this._aliasRows.push({ key, kind: 'entity', id: entity.id, norm: norm(alias), label: alias })
      }
      indexText(
        key,
        entity.name,
        ...entity.aliases,
        entity.summary,
        ...entity.tags,
        entity.faction,
        entity.body.slice(0, 260),
      )
    }

    for (const event of this.events) {
      const key = `event:${event.id}`
      this._aliasRows.push({ key, kind: 'event', id: event.id, norm: norm(event.title), label: event.title })
      const names = event.entities.map((id) => this.byId.get(id)?.name ?? '').filter(Boolean)
      indexText(
        key,
        event.title,
        event.summary,
        ...event.factions,
        ...names,
        event.chapter,
      )
    }

    for (const meme of this.memes) {
      const key = `meme:${meme.id}`
      this._aliasRows.push({ key, kind: 'meme', id: meme.id, norm: norm(meme.term), label: meme.term })
      for (const alias of meme.aliases) {
        this._aliasRows.push({ key, kind: 'meme', id: meme.id, norm: norm(alias), label: alias })
      }
      indexText(
        key,
        meme.term,
        ...meme.aliases,
        meme.meaning,
        meme.usage,
        ...(meme.kind ? [MEME_KIND_LABEL[meme.kind]] : []),
      )
    }

    for (const story of this.stories) {
      const key = `story:${story.id}`
      this._aliasRows.push({ key, kind: 'story', id: story.id, norm: norm(story.title), label: story.title })
      if (story.chapter) {
        this._aliasRows.push({ key, kind: 'story', id: story.id, norm: norm(story.chapter), label: story.chapter })
      }
      for (const alias of story.aliases ?? []) {
        this._aliasRows.push({ key, kind: 'story', id: story.id, norm: norm(alias), label: alias })
      }
      indexText(
        key,
        story.title,
        story.chapter,
        ...(story.aliases ?? []),
        ...story.lines.slice(0, 4).map((line) => `${line.speaker}${line.text}`),
      )
    }
  }

  stats() {
    return {
      entities: this.entities.length,
      events: this.events.length,
      memes: this.memes.length,
      records: this.records.size,
      recordSections: [...this.records.values()].reduce((sum, row) => sum + row.sections.length, 0),
      stories: this.stories.length,
      storyLines: this.stories.reduce((sum, row) => sum + row.lines.length, 0),
      chars: this.canon.length + this.entities.reduce((sum, e) => sum + e.summary.length + e.body.length, 0),
      warnings: this.loadWarnings.length,
      schemaVersion: this.manifest.schemaVersion ?? 1,
      dataVersion: this.manifest.dataVersion ?? '',
    }
  }

  _describeKey(key, score) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    if (kind === 'story') {
      const story = this.storyById.get(id)
      const first = story.lines[0]
      const excerpt = first ? `${first.speaker}：${oneLine(first.text, 52)}` : ''
      return {
        kind,
        id,
        score,
        name: story.title,
        line: `[剧情] ${story.title} (${story.id}) — ${excerpt}`,
      }
    }
    if (kind === 'meme') {
      const meme = this.memeById.get(id)
      return {
        kind,
        id,
        score,
        name: meme.term,
        line: `[梗/${MEME_KIND_LABEL[meme.kind]}] ${meme.term} (${meme.id}) — ${oneLine(meme.meaning, 78)}`,
      }
    }
    if (kind === 'entity') {
      const entity = this.byId.get(id)
      return {
        kind,
        id,
        score,
        name: entity.name,
        line: `[${TYPE_LABEL[entity.type]}] ${entity.name} (${entity.id}) — ${oneLine(entity.summary, 78)}`,
      }
    }
    const event = this.eventById.get(id)
    return {
      kind,
      id,
      score,
      name: event.title,
      line: `[事件] ${timeLabel(event.time, true)} ${event.title} (${event.id}) — ${oneLine(event.summary, 70)}`,
    }
  }

  _latestActivityChapter() {
    let latest = null
    for (const story of this.stories) {
      const match = `${story.id} ${story.source ?? ''}`.match(/activities[./]act(\d+)(?:side|d0)/)
      if (!match || !story.chapter) continue
      const number = Number(match[1])
      if (!latest || number > latest.number) latest = { number, chapter: story.chapter }
    }
    return latest?.chapter ?? ''
  }

  _expandQuery(q) {
    const chapters = []
    const aliases = Object.keys(this.chapterAliases ?? {}).length ? this.chapterAliases : CHAPTER_ALIASES
    for (const [name, meta] of Object.entries(aliases)) {
      const names = Array.isArray(meta) ? meta : meta?.aliases ?? []
      const chapter = Array.isArray(meta) ? name : meta?.title ?? name
      if (names.some((alias) => q.includes(norm(alias)))) chapters.push(chapter)
    }
    if (/最新活动|当前活动|新活动/.test(q)) {
      const latest = this._latestActivityChapter()
      if (latest) chapters.push(latest)
    }
    return [...new Set(chapters)]
  }

  find(query, kind = 'any', limit = 6) {
    const q = norm(query)
    if (!q) return { text: '给个词。', rows: [] }
    const expanded = [q, ...this._expandQuery(q).map(norm)].join(' ')
    const allow = (key) => kind === 'any' || key.startsWith(`${kind}:`)
    const scores = new Map()
    const add = (key, score, evidence) => {
      if (!allow(key)) return
      const entry = scores.get(key) ?? { score: 0, alias: 0, grams: 0 }
      entry.score += score
      if (evidence === 'alias') entry.alias += score
      else entry.grams += 1
      scores.set(key, entry)
    }

    for (const row of this._aliasRows) {
      if (!allow(row.key) || !row.norm) continue
      if (q === row.norm) {
        add(row.key, 150, 'alias')
      } else if (row.norm.length >= 2 && expanded.includes(row.norm)) {
        add(row.key, 70 + Math.min(row.norm.length, 8) * 5, 'alias')
      }
    }

    for (const gram of [...bigrams(String(expanded))].slice(0, 48)) {
      const posting = this._posting.get(gram)
      if (!posting || posting.size > 60) continue
      const weight = 7 / Math.sqrt(posting.size)
      for (const key of posting) add(key, weight, 'gram')
    }

    const rows = [...scores.entries()]
      .filter(([, entry]) => entry.score >= 2.2 && (entry.alias > 0 || entry.grams >= 2 || [...q].length <= 2))
      .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0], 'zh'))
      .slice(0, limit)
      .map(([key, entry]) => this._describeKey(key, entry.score))

    if (!rows.length) {
      return {
        text: `没命中「${String(query).trim()}」。换个叫法，或直接给 id（例：longmen）。`,
        rows: [],
      }
    }

    const lines = [`命中 ${rows.length} 条：`]
    rows.forEach((row, index) => lines.push(`${index + 1}. ${row.line}`))
    lines.push('用 ark_read <id> 读正文；问前后文用 ark_timeline around=<id>。')
    return { text: truncate(lines.join('\n'), 1200), rows }
  }

  resolveId(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    if (raw === 'canon' || raw === '常识') return 'canon'
    if (this.byId.has(raw)) return raw
    if (this.eventById.has(raw)) return raw
    if (this.memeById.has(raw)) return raw
    if (this.storyById.has(raw)) return raw
    const direct = this.aliasToId.get(norm(raw))
    if (direct) return direct
    const hit = this.find(raw, 'any', 1).rows[0]
    if (hit && hit.score >= 60) return hit.id
    return null
  }

  _entityEvents(entityId) {
    return this.events.filter((event) => event.entities.includes(entityId))
  }

  _neighbors(event, count = 1) {
    const prev = []
    const next = []
    for (let i = 1; i <= count; i += 1) {
      if (event.index - i >= 0) prev.unshift(this.events[event.index - i])
      if (event.index + i < this.events.length) next.push(this.events[event.index + i])
    }
    return { prev, next }
  }

  _parallel(event) {
    return this.events.filter((other) => (
      other.id !== event.id
      && other.time.year === event.time.year
      && (other.time.month ?? 6) === (event.time.month ?? 6)
    ))
  }

  reindex() {
    this._aliasRows = []
    this._posting = new Map()
    this._buildIndex()
  }

  addMeme(raw, reindex = true) {
    if (!raw?.id || !raw?.term || this.memeById.has(raw.id)) return null
    const meme = {
      id: String(raw.id).trim(),
      term: String(raw.term).trim(),
      aliases: asArray(raw.aliases),
      kind: Object.hasOwn(MEME_KIND_LABEL, raw.kind) ? raw.kind : 'community',
      meaning: String(raw.meaning ?? '').trim(),
      origin: String(raw.origin ?? '').trim(),
      usage: String(raw.usage ?? '').trim(),
      avoid: String(raw.avoid ?? '').trim(),
      confidence: ['high', 'medium', 'low', 'pending'].includes(raw.confidence) ? raw.confidence : 'medium',
      source: String(raw.source ?? '').trim(),
      freshUntil: String(raw.freshUntil ?? '').trim(),
    }
    this.memes.push(meme)
    this.memeById.set(meme.id, meme)
    if (reindex) this.reindex()
    return meme
  }

  addStory(raw, reindex = true) {
    if (!raw?.id || !raw?.title || this.storyById.has(raw.id)) return null
    const lines = []
    for (const line of (Array.isArray(raw.lines) ? raw.lines : [])) {
      const text = String(line?.text ?? '').trim()
      if (text) lines.push({ speaker: String(line?.speaker ?? '旁白').trim() || '旁白', text })
    }
    if (!lines.length) return null
    const story = {
      id: String(raw.id).trim(),
      title: String(raw.title).trim(),
      chapter: String(raw.chapter ?? '').trim(),
      file: String(raw.file ?? '').trim(),
      aliases: asArray(raw.aliases),
      lines,
      source: String(raw.source ?? '').trim(),
    }
    this.stories.push(story)
    this.storyById.set(story.id, story)
    if (reindex) this.reindex()
    return story
  }

  applyCorrection(id, patch, meta = {}) {
    const target = this.byId.get(id) ?? this.eventById.get(id) ?? this.memeById.get(id)
    if (!target) return `没有「${id}」，修正没写。`
    const kind = this.byId.has(id) ? '实体' : this.eventById.has(id) ? '事件' : '梗'
    const changed = []
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (typeof value !== 'string' || !value.trim()) continue
      if (!(key in target)) continue
      target[key] = value.trim()
      changed.push(key)
    }
    if (!changed.length) return `「${id}」没有可改的字段。`
    const source = meta.source || meta.url ? `（来源：${meta.source || meta.url}）` : ''
    return `已修正${kind}「${target.name ?? target.title ?? target.term ?? id}」：${changed.join('、')}${source}。`
  }

  read(value, view = 'summary', maxChars = 1600) {
    const id = this.resolveId(value)
    if (!id) return `没有「${String(value).trim()}」。先用 ark_find 找 id。`
    if (id === 'canon') {
      if (!this.canon) return '常识卡是空的。'
      return truncate(this.canon, Math.min(maxChars, 2400))
    }
    if (this.memeById.has(id)) return this._readMeme(this.memeById.get(id), maxChars)
    if (this.storyById.has(id)) return this._readStory(this.storyById.get(id), view, maxChars)
    if (this.byId.has(id)) return this._readEntity(this.byId.get(id), view, maxChars)
    const event = this.eventById.get(id)
    if (event) return this._readEvent(event, view, maxChars)
    return `没有「${id}」。`
  }

  _readMeme(meme, maxChars) {
    const parts = [
      `【${meme.term}】梗/${MEME_KIND_LABEL[meme.kind]} · 置信：${CONFIDENCE_LABEL[meme.confidence]}`,
    ]
    if (meme.meaning) parts.push(meme.meaning)
    if (meme.usage) parts.push(`怎么用：${meme.usage}`)
    if (meme.avoid) parts.push(`别这么用：${meme.avoid}`)
    if (meme.origin) parts.push(`来历：${meme.origin}`)
    if (meme.aliases.length) parts.push(`别名：${meme.aliases.join('、')}`)
    if (meme.source) parts.push(`出处：${meme.source}`)
    if (meme.freshUntil) parts.push(`时效：${meme.freshUntil} 前有效`)
    return truncate(parts.join('\n'), maxChars)
  }

  _readStory(story, view, maxChars) {
    const parts = [
      `【${story.title}】剧情${story.chapter ? ` · ${story.chapter}` : ''} · ${story.lines.length} 句`,
    ]
    const limit = view === 'summary' ? Math.min(16, story.lines.length) : story.lines.length
    for (const line of story.lines.slice(0, limit)) {
      parts.push(`${line.speaker}：${line.text}`)
    }
    if (limit < story.lines.length) parts.push(`…还有 ${story.lines.length - limit} 句（view=full 读全）`)
    if (story.source) parts.push(`出处：${story.source}`)
    return truncate(parts.join('\n'), maxChars)
  }

  _readEntity(entity, view, maxChars) {
    const record = this.records.get(entity.id)
    if (view === 'records') {
      if (!record) return `「${entity.name}」没有干员档案。`
      const parts = [`【${record.name || entity.name}】干员档案 · ${record.sections.length} 段`]
      for (const section of record.sections) {
        parts.push(`\n【${section.title}】\n${section.text}`)
      }
      if (record.source) parts.push(`\n出处：${record.source}`)
      return truncate(parts.join('\n'), Math.max(maxChars, 800))
    }

    const parts = [
      `【${entity.name}】${TYPE_LABEL[entity.type]}${entity.faction ? ` · ${entity.faction}` : ''} · 认知：${KNOWLEDGE_LABEL[entity.knowledge]}`,
    ]
    if (entity.summary) parts.push(entity.summary)
    if (view !== 'summary' && entity.body) parts.push(entity.body)
    if (view === 'summary' && entity.body) parts.push(truncate(entity.body, 150))
    if (entity.aliases.length) parts.push(`别名：${entity.aliases.join('、')}`)
    if (record) parts.push(`干员档案：${record.sections.length} 段（view=records 查看）`)

    const related = this._entityEvents(entity.id).sort((a, b) => b.index - a.index)
    if (related.length) {
      parts.push('相关事件：')
      const shown = related.slice(0, view === 'summary' ? 3 : 8)
      for (const event of shown) {
        parts.push(`  ${timeLabel(event.time, true)} ${event.title}（${event.id}）`)
      }
      if (related.length > shown.length) parts.push(`  …还有 ${related.length - shown.length} 条`)
    } else {
      parts.push('相关事件：暂无（时间线上还没挂）')
    }

    if (view === 'context' && related.length) {
      const anchor = related[0]
      const start = Math.max(0, anchor.index - 2)
      const end = Math.min(this.events.length, anchor.index + 3)
      parts.push('时间线切片：')
      for (const event of this.events.slice(start, end)) {
        parts.push(`  ${event.id === anchor.id ? '→' : ' '} ${timeLabel(event.time, true)} ${event.title}`)
      }
    }

    if (entity.source) parts.push(`出处：${entity.source}`)
    if (entity.confidence !== 'high') parts.push(`置信：${CONFIDENCE_LABEL[entity.confidence]}`)
    return truncate(parts.join('\n'), maxChars)
  }

  _readEvent(event, view, maxChars) {
    const parts = [
      `【${event.title}】事件 · ${timeLabel(event.time)} · 置信：${CONFIDENCE_LABEL[event.confidence]}`,
    ]
    if (event.summary) parts.push(event.summary)
    if (view !== 'summary' && event.body) parts.push(event.body)
    if (view === 'summary' && event.body) parts.push(truncate(event.body, 130))
    if (event.factions.length) parts.push(`势力：${event.factions.join('、')}`)
    if (event.entities.length) {
      const names = event.entities.map((id) => this.byId.get(id)?.name ?? id)
      parts.push(`涉及：${names.join('、')}`)
    }
    if (event.chapter) parts.push(`篇章：${event.chapter}`)

    const { prev, next } = this._neighbors(event, view === 'summary' ? 1 : 2)
    for (const row of prev) parts.push(`← ${timeLabel(row.time, true)} ${row.title}（${row.id}）`)
    for (const row of next) parts.push(`→ ${timeLabel(row.time, true)} ${row.title}（${row.id}）`)

    const parallel = this._parallel(event)
    if (parallel.length) {
      const shown = parallel.slice(0, 3).map((row) => row.title).join('、')
      parts.push(`同期：${shown}${parallel.length > 3 ? ` 等 ${parallel.length} 条` : ''}`)
    }
    if (event.source) parts.push(`出处：${event.source}`)
    return truncate(parts.join('\n'), maxChars)
  }

  timeline({ from, to, around, faction, limit = 8 } = {}) {
    const max = Math.max(1, Math.min(Number(limit) || 8, 30))
    let rows
    let note = ''

    if (around) {
      const anchorId = this.resolveId(around)
      const anchor = this.events.find((event) => event.id === anchorId)
      if (!anchor) return `没有事件「${around}」。先用 ark_find。`
      const start = Math.max(0, anchor.index - max)
      const end = Math.min(this.events.length, anchor.index + max + 1)
      rows = this.events.slice(start, end)
      note = `以「${anchor.title}」为中心前后 ${max} 条。`
    } else {
      const fromPoint = parsePoint(from)
      const toPoint = parsePoint(to)
      let filtered = this.events
      if (fromPoint) filtered = filtered.filter((event) => pointCompare(event.time, fromPoint, 'from'))
      if (toPoint) filtered = filtered.filter((event) => pointCompare(event.time, toPoint, 'to'))
      if (faction) {
        const target = norm(faction)
        filtered = filtered.filter((event) => event.factions.some((name) => {
          const current = norm(name)
          return current.includes(target) || target.includes(current)
        }))
      }
      const total = filtered.length
      rows = filtered.slice(0, max)
      if (total > rows.length) note = `共 ${total} 条，只显示前 ${rows.length} 条；缩范围或加 limit。`
      else note = `共 ${total} 条。`
    }

    if (!rows.length) return '这个范围里没有事件。换个年份或去掉 faction。'

    const lines = []
    let lastKey = ''
    for (const event of rows) {
      const key = event.time.month ? `${event.time.year}-${event.time.month}` : ''
      const parallelMark = key && key === lastKey ? '‖ ' : ''
      if (key) lastKey = key
      const side = event.factions.length ? ` · ${event.factions.join('/')}` : ''
      lines.push(`${parallelMark}${timeLabel(event.time, true)} · ${event.title}${side} · ${event.id}`)
    }
    if (note) lines.push(note)
    return truncate(lines.join('\n'), 1600)
  }

  lint() {
    const errors = []
    const warnings = []
    const ids = new Set()
    for (const entity of this.entities) {
      if (ids.has(entity.id)) errors.push(`实体 id 重复：${entity.id}`)
      ids.add(entity.id)
      if (!entity.summary) warnings.push(`实体没有摘要：${entity.id}`)
      if (entity.summary.length > 140) warnings.push(`实体摘要过长（${entity.summary.length}）：${entity.id}`)
      if (entity.body.length > 4000) warnings.push(`实体正文过长（${entity.body.length}）：${entity.id}`)
      for (const alias of entity.aliases) {
        if ([...alias].length < 2) warnings.push(`别名太短：${entity.id} → ${alias}`)
      }
      if (!entity.background && !this._entityEvents(entity.id).length) warnings.push(`实体没挂事件：${entity.id}`)
    }

    const aliasOwner = new Map()
    for (const entity of this.entities) {
      for (const alias of [entity.name, ...entity.aliases]) {
        const key = norm(alias)
        if (!key) continue
        if (aliasOwner.has(key) && aliasOwner.get(key) !== entity.id) {
          warnings.push(`别名冲突：${alias} → ${aliasOwner.get(key)} / ${entity.id}`)
        } else {
          aliasOwner.set(key, entity.id)
        }
      }
    }

    const eventIds = new Set()
    for (const event of this.events) {
      if (eventIds.has(event.id)) errors.push(`事件 id 重复：${event.id}`)
      eventIds.add(event.id)
      if (!event.summary) warnings.push(`事件没有摘要：${event.id}`)
      if (event.summary.length > 140) warnings.push(`事件摘要过长（${event.summary.length}）：${event.id}`)
      if (event.time.month && (event.time.month < 1 || event.time.month > 12)) {
        errors.push(`事件月份非法：${event.id} → ${event.time.month}`)
      }
      if (event.time.year < 1000 || event.time.year > 1200) {
        warnings.push(`事件年份可疑：${event.id} → ${event.time.year}`)
      }
      for (const id of event.entities) {
        if (!this.byId.has(id)) errors.push(`事件引用了不存在的实体：${event.id} → ${id}`)
      }
      if (!event.entities.length && !event.imported) warnings.push(`事件没挂实体：${event.id}`)
      if (!event.factions.length) warnings.push(`事件没写势力：${event.id}`)
    }

    const memeIds = new Set()
    const memeTerms = new Map()
    for (const meme of this.memes) {
      if (memeIds.has(meme.id)) errors.push(`梗 id 重复：${meme.id}`)
      memeIds.add(meme.id)
      if (!meme.meaning) warnings.push(`梗没有解释：${meme.id}`)
      if (meme.meaning.length > 220) warnings.push(`梗解释过长（${meme.meaning.length}）：${meme.id}`)
      const termKey = norm(meme.term)
      if (memeTerms.has(termKey) && memeTerms.get(termKey) !== meme.id) {
        warnings.push(`梗词条重复：${meme.term} → ${memeTerms.get(termKey)} / ${meme.id}`)
      } else {
        memeTerms.set(termKey, meme.id)
      }
      for (const alias of meme.aliases) {
        if ([...alias].length < 2) warnings.push(`梗别名太短：${meme.id} → ${alias}`)
      }
    }

    for (const [id, record] of this.records) {
      if (!this.byId.has(id)) errors.push(`干员档案引用了不存在的实体：${id}`)
      if (!record.sections.length) warnings.push(`干员档案没有段落：${id}`)
      for (const section of record.sections) {
        if (!section.text) warnings.push(`干员档案有空段落：${id} → ${section.title}`)
      }
    }

    const storyIds = new Set()
    for (const story of this.stories) {
      if (storyIds.has(story.id)) errors.push(`剧情 id 重复：${story.id}`)
      storyIds.add(story.id)
      if (!story.title) warnings.push(`剧情没有标题：${story.id}`)
      if (!story.lines.length) warnings.push(`剧情没有台词：${story.id}`)
      for (const line of story.lines) {
        if (!line.text) warnings.push(`剧情有空台词：${story.id}`)
      }
    }
    return { errors, warnings }
  }
}

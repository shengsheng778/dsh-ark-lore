import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { Corpus } from './corpus.js'

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`[ark-lore] 数据文件不是合法 JSON：${file}\n${error.message}`)
  }
}

/**
 * Load a lore directory:
 *   canon.md
 *   factions/*.json   (array of entities, one file per faction)
 *   events.json       (array of events)
 *   imports/*.json    (optional { entities, events } patches)
 */
export function loadCorpus(dir) {
  const canon = existsSync(join(dir, 'canon.md')) ? readFileSync(join(dir, 'canon.md'), 'utf8') : ''
  const entities = []
  const events = []

  const factionDir = join(dir, 'factions')
  if (existsSync(factionDir)) {
    const files = readdirSync(factionDir).filter((name) => name.endsWith('.json')).sort()
    for (const file of files) {
      const rows = readJson(join(factionDir, file), [])
      if (!Array.isArray(rows)) throw new Error(`[ark-lore] ${file} 必须是实体数组`)
      for (const row of rows) entities.push({ ...row, file })
    }
  }

  const baseEvents = readJson(join(dir, 'events.json'), [])
  if (!Array.isArray(baseEvents)) throw new Error('[ark-lore] events.json 必须是事件数组')
  events.push(...baseEvents)

  const memes = readJson(join(dir, 'memes.json'), [])
  if (!Array.isArray(memes)) throw new Error('[ark-lore] memes.json 必须是梗数组')

  const records = readJson(join(dir, 'records.json'), {})
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new Error('[ark-lore] records.json 必须是“实体 id → 档案”的对象')
  }

  const stories = readJson(join(dir, 'stories.json'), [])
  if (!Array.isArray(stories)) throw new Error('[ark-lore] stories.json 必须是剧情数组')

  const rogue = readJson(join(dir, 'rogue.json'), [])
  if (!Array.isArray(rogue)) throw new Error('[ark-lore] rogue.json 必须是剧情数组')
  stories.push(...rogue)

  const dynamic = readJson(join(dir, 'dynamic.json'), {})
  if (dynamic && typeof dynamic === 'object') {
    if (Array.isArray(dynamic.memes)) memes.push(...dynamic.memes)
    if (Array.isArray(dynamic.stories)) stories.push(...dynamic.stories)
  }

  const chaptersDoc = readJson(join(dir, 'chapters.json'), {})
  const chapters = chaptersDoc?.chapters && typeof chaptersDoc.chapters === 'object' ? chaptersDoc.chapters : chaptersDoc
  const manifest = readJson(join(dir, 'manifest.json'), {})

  const corrections = readJson(join(dir, 'corrections.json'), {})
  if (corrections && typeof corrections === 'object' && !Array.isArray(corrections)) {
    const applyCorrections = (rows) => {
      for (const row of rows) {
        const patch = corrections[row?.id]
        if (!patch || typeof patch !== 'object') continue
        for (const [key, value] of Object.entries(patch)) {
          const text = typeof value === 'string' ? value : value?.text
          if (typeof text === 'string' && text.trim()) row[key] = text.trim()
        }
      }
    }
    applyCorrections(entities)
    applyCorrections(events)
    applyCorrections(memes)
  }

  const importsDir = join(dir, 'imports')
  if (existsSync(importsDir)) {
    const files = readdirSync(importsDir).filter((name) => name.endsWith('.json')).sort()
    for (const file of files) {
      const doc = readJson(join(importsDir, file), null)
      if (!doc) continue
      if (Array.isArray(doc)) entities.push(...doc)
      if (Array.isArray(doc.entities)) entities.push(...doc.entities)
      if (Array.isArray(doc.events)) events.push(...doc.events)
    }
  }

  return new Corpus({ canon, entities, events, memes, records, stories, chapters, manifest })
}

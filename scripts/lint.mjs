#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { loadCorpus } from '../lib/load.js'

const dir = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../data/', import.meta.url))

const corpus = loadCorpus(dir)
const stats = corpus.stats()
const { errors, warnings } = corpus.lint()

console.log(`数据目录：${dir}`)
console.log(`实体 ${stats.entities} · 事件 ${stats.events} · 梗 ${stats.memes} · 干员档案 ${stats.records}（${stats.recordSections} 段） · 剧情 ${stats.stories}（${stats.storyLines} 句） · 正文 ${stats.chars} 字`)

if (errors.length) {
  console.error(`\n错误 ${errors.length} 条：`)
  for (const line of errors) console.error(`  ✗ ${line}`)
}
if (warnings.length) {
  console.log(`\n警告 ${warnings.length} 条：`)
  for (const line of warnings) console.log(`  ! ${line}`)
}
if (!errors.length) console.log('\n结构检查通过。')
process.exit(errors.length ? 1 : 0)

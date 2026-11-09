#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { loadCorpus } from '../源码/load.js'

const corpus = loadCorpus(fileURLToPath(new URL('../数据/', import.meta.url)))
const [command, ...rest] = process.argv.slice(2)
const join = (values) => values.join(' ').trim()

if (!command || command === 'help') {
  console.log(`用法：
  node 脚本/query.mjs find <问句>
  node 脚本/query.mjs read <id> [summary|full|context]
  node 脚本/query.mjs timeline [from] [to] [faction]
  node 脚本/query.mjs around <事件id> [条数]
  node 脚本/query.mjs canon`)
  process.exit(0)
}

if (command === 'find') {
  console.log(corpus.find(join(rest), 'any').text)
} else if (command === 'read') {
  console.log(corpus.read(rest[0], rest[1] ?? 'summary'))
} else if (command === 'timeline') {
  console.log(corpus.timeline({ from: rest[0], to: rest[1], faction: rest[2] }))
} else if (command === 'around') {
  console.log(corpus.timeline({ around: rest[0], limit: Number(rest[1]) || 4 }))
} else if (command === 'canon') {
  console.log(corpus.read('canon'))
} else {
  console.error(`不认识的命令：${command}`)
  process.exit(1)
}

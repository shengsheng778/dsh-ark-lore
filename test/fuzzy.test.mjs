import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { loadCorpus } from '../lib/load.js'

const corpus = loadCorpus(fileURLToPath(new URL('../data/', import.meta.url)))

const cases = [
  ['7.5周年剧情', 'act55side'],
  ['七点五周年活动', 'act55side'],
  ['半周年活动', 'act55side'],
  ['今年周年剧情', 'act55side'],
  ['最新活动', 'act55side'],
  ['水月肉鸽三结局', 'rogue_2.endbook'],
  ['傀影肉鸽结局', 'roguelike.ro1'],
  ['萨米肉鸽结局', 'rogue_3.endbook'],
  ['岁家肉鸽', 'rogue_5'],
  ['夏活', 'act'],
  ['春节活动', 'act6d5'],
]

for (const [query, expected] of cases) {
  test(`模糊问法：${query}`, () => {
    const result = corpus.find(query, 'any', 30)
    assert.ok(result.rows.length > 0, `没有命中：${query}`)
    assert.ok(result.rows.some((row) => row.id.includes(expected)), `没落到 ${expected}：${query}`)
  })
}

test('直接问实体也能命中', () => {
  for (const [query, expected] of [
    ['深海猎人', 'abyss_hunters'],
    ['龙门鲤氏', 'lee_agency'],
    ['塔露拉', 'talulah'],
  ]) {
    const result = corpus.find(query, 'any', 10)
    assert.ok(result.rows.some((row) => row.id === expected), `没命中 ${query}`)
  }
})

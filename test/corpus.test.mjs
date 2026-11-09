import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadCorpus } from '../lib/load.js'
import { Corpus } from '../lib/corpus.js'

const corpus = loadCorpus(fileURLToPath(new URL('../data/', import.meta.url)))

test('数据能加载，实体和事件数量正常', () => {
  const stats = corpus.stats()
  assert.ok(stats.entities >= 450, `entities=${stats.entities}`)
  assert.ok(stats.events >= 500, `events=${stats.events}`)
  assert.ok(stats.memes >= 30, `memes=${stats.memes}`)
  assert.ok(stats.records >= 400, `records=${stats.records}`)
  assert.ok(stats.stories >= 2000, `stories=${stats.stories}`)
})

test('结构检查零错误', () => {
  const { errors } = corpus.lint()
  assert.deepEqual(errors, [])
})

test('龙门精确命中城市，不死板地只认全名', () => {
  const { rows } = corpus.find('龙门')
  assert.equal(rows[0].id, 'longmen')
})

test('一句话里两个实体都要出来', () => {
  const { rows } = corpus.find('整合运动进攻龙门')
  const ids = rows.map((row) => row.id)
  assert.ok(ids.includes('longmen'))
  assert.ok(ids.includes('reunion'))
})

test('别名能路由到人', () => {
  assert.equal(corpus.resolveId('陈sir'), 'chen')
  assert.equal(corpus.resolveId('刀客塔'), 'doctor')
})

test('读城市会带出相关事件和时间', () => {
  const text = corpus.read('longmen')
  assert.match(text, /龙门/)
  assert.match(text, /相关事件/)
  assert.match(text, /1097/)
})
test('事件前后关系可读', () => {
  const text = corpus.read('ev.1097-01.longmen', 'context')
  assert.match(text, /←/)
  assert.match(text, /→/)
})

test('时间线按泰拉历排，不混进下一年', () => {
  const a = corpus.events.find((event) => event.id === 'ev.1096-12.chernobog')
  const b = corpus.events.find((event) => event.id === 'ev.1097-01.longmen')
  assert.ok(a && b)
  assert.ok(a.index < b.index)
  const text = corpus.timeline({ around: 'ev.1097-01.longmen', limit: 2 })
  assert.ok(!text.includes('1098'))
})

test('around 能看到前后各几条', () => {
  const text = corpus.timeline({ around: 'ev.1097-01.longmen', limit: 2 })
  assert.match(text, /龙门危机/)
  assert.match(text, /以「龙门危机」为中心/)
})

test('查不到就明说，不硬凑', () => {
  const { text } = corpus.find('瓦坎达火锅店')
  assert.match(text, /没命中/)
})

test('常识卡可读', () => {
  assert.match(corpus.read('canon'), /泰拉/)
})

test('梗能搜到、能读，且不混进时间线', () => {
  const { rows } = corpus.find('kokodayo')
  assert.equal(rows[0].id, 'meme.kokodayo')
  assert.match(corpus.read('meme.kokodayo'), /克洛丝/)
  const memes = corpus.find('阿噗噜派', 'meme').rows
  assert.ok(memes.some((row) => row.id === 'meme.apple_pie'))
  assert.ok(!corpus.timeline({ from: 1099, to: 1099, limit: 30 }).includes('kokodayo'))
})

test('干员档案能按 records 视图读', () => {
  const text = corpus.read('op.char_500_noirc', 'records', 3000)
  assert.match(text, /干员档案/)
  assert.match(text, /基础档案/)
  assert.match(text, /代号/)
})

test('鲤氏成员名单有吽、没有年', () => {
  const text = corpus.read('lee_agency')
  assert.match(text, /吽/)
  assert.doesNotMatch(text, /老鲤、阿、年、槐琥/)
})

test('主剧情能按剧情 id 读', () => {
  const first = corpus.stories[0]
  const text = corpus.read(first.id, 'summary', 2000)
  assert.match(text, /剧情/)
  assert.ok(text.includes(first.lines[0].speaker))
})

test('干员密录也能读', () => {
  const memory = corpus.stories.find((story) => story.chapter === '干员密录')
  assert.ok(memory)
  const text = corpus.read(memory.id, 'summary', 2000)
  assert.match(text, /干员密录/)
  assert.ok(text.includes(memory.lines[0].speaker))
})

test('活动剧情能读', () => {
  const activity = corpus.stories.find((story) => story.source.includes('activities'))
  assert.ok(activity)
  const text = corpus.read(activity.id, 'summary', 1000)
  assert.match(text, /剧情/)
  assert.ok(text.includes(activity.lines[0].speaker))
})

test('补抓的活动剧情也在库里', () => {
  const story = corpus.storyById.get('story.activities.act48side.level_act48side_st02')
  assert.ok(story)
  assert.ok(story.lines.length > 20)
})

test('补抓的密录是游戏原文', () => {
  const story = corpus.storyById.get('story.obt.memory.story_asbest_1_1')
  assert.ok(story)
  assert.match(story.source, /obt\/memory/)
  assert.ok(story.lines.length > 100)
})

test('输出有长度上限', () => {
  const text = corpus.read('longmen', 'full', 300)
  assert.ok([...text].length <= 300)
})

test('数据版本能报出来', () => {
  const stats = corpus.stats()
  assert.equal(stats.schemaVersion, 1)
  assert.ok(stats.dataVersion)
})

test('实时修正能落到内存', () => {
  const tiny = new Corpus({ entities: [{ id: 'x', type: 'org', name: 'X', summary: '旧' }] })
  const message = tiny.applyCorrection('x', { summary: '新' }, { source: 'test' })
  assert.match(message, /已修正/)
  assert.equal(tiny.byId.get('x').summary, '新')
})

test('肉鸽结局和 IF 线能读', () => {
  const story = corpus.storyById.get('story.obt.rogue.rogue_2.endbook.endbook_rogue_2_1_1.txt')
  assert.ok(story)
  assert.match(story.title, /肉鸽/)
  assert.ok(story.lines.length)
})

test('水月肉鸽结局能按叫法搜到', () => {
  const result = corpus.find('水月肉鸽三结局剧情', 'story', 20)
  assert.ok(result.rows.length >= 12)
  assert.ok(result.rows.some((row) => row.id.includes('rogue_2.endbook')))
  assert.match(corpus.storyById.get('story.obt.rogue.rogue_2.endbook.endbook_rogue_2_1_1.txt').title, /水月/)
})

test('模糊叫法能落到活动章节', () => {
  const anniversary = corpus.find('7.5周年剧情', 'story', 20)
  assert.ok(anniversary.rows.some((row) => row.id.includes('act55side')))
  const latest = corpus.find('最新活动', 'story', 20)
  assert.ok(latest.rows.some((row) => row.id.includes('act55side')))
  const sui = corpus.find('岁家肉鸽', 'story', 20)
  assert.ok(sui.rows.some((row) => row.id.includes('rogue_5')))
})


import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, inject, name } from '../index.js'

function fakeContext() {
  const tools = []
  const skills = []
  const ctx = {
    tools: { register: (definition) => { tools.push(definition); return () => {} } },
    skills: { register: (skill) => { skills.push(skill); return () => {} } },
    logger: { info: () => {} },
  }
  return { ctx, tools, skills }
}

test('插件自报家门正确', () => {
  assert.equal(name, 'ark-lore')
  assert.deepEqual(inject, ['tools', 'skills'])
})

test('装载后注册四个工具和一个技能', () => {
  const { ctx, tools, skills } = fakeContext()
  const dispose = apply(ctx, {})
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['ark_find', 'ark_read', 'ark_timeline', 'ark_web'])
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'ark-lore')
  assert.match(skills[0].description, /明日方舟/)
  dispose()
})

test('工具真能查、真能读', async () => {
  const { ctx, tools } = fakeContext()
  apply(ctx, {})
  const find = tools.find((tool) => tool.name === 'ark_find')
  const read = tools.find((tool) => tool.name === 'ark_read')

  const found = await find.execute({ query: '霜星' })
  assert.match(found.text, /霜星/)

  const card = await read.execute({ id: 'longmen', view: 'summary' })
  assert.match(card.text, /龙门/)

  const rendered = read.output.render({}, card)
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /龙门/)
})

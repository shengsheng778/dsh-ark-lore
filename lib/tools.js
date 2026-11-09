const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
}

const render = (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }]

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.max(min, Math.min(max, number))
}

export function createTools(corpus, config = {}) {
  const maxChars = clamp(config.maxChars ?? 1600, 400, 6000)

  return [
    {
      name: 'ark_find',
      description:
        '查明日方舟设定库：按名字、别名或关键词找国家、城市、组织、人物、事件、社区梗和剧情段落。聊到泰拉设定、剧情、人物关系或黑话前先用它，返回候选 id。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户问句或关键词，原样传。' },
          kind: {
            type: 'string',
            enum: ['any', 'entity', 'event', 'meme', 'story'],
            description: '限定类型，默认 any。',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      output: { schema: OUTPUT_SCHEMA, render },
      timeoutMs: 5000,
      isConcurrencySafe: () => true,
      execute: async (args) => ({ text: corpus.find(args?.query, args?.kind ?? 'any').text }),
    },
    {
      name: 'ark_read',
      description:
        '按 id 读设定卡、事件卡、梗卡、干员档案或剧情段落。view=summary 只看摘要/前几句，full 看全文，context 连带前后时间线，records 看干员档案；默认 summary，别一次读太多。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ark_find 返回的 id，或 canon。' },
          view: {
            type: 'string',
            enum: ['summary', 'full', 'context', 'records'],
            description: '读多少，默认 summary；records 只读干员档案。',
          },
          maxChars: {
            type: 'number',
            description: '可选，最多返回多少字（400–8000）。',
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: { schema: OUTPUT_SCHEMA, render },
      timeoutMs: 5000,
      isConcurrencySafe: () => true,
      execute: async (args) => ({
        text: corpus.read(
          args?.id,
          args?.view ?? 'summary',
          clamp(args?.maxChars ?? maxChars, 400, 8000),
        ),
      }),
    },
    {
      name: 'ark_timeline',
      description:
        '按泰拉历查剧情时间线。from/to 传年份或年月（1096、1097-01），around 传事件 id 看前后，faction 按势力过滤。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '起始点，如 1096 或 1097-01。' },
          to: { type: 'string', description: '结束点，如 1098 或 1097-12。' },
          around: { type: 'string', description: '事件 id，看它前后各 limit 条。' },
          faction: { type: 'string', description: '势力名，如 龙门、乌萨斯、整合运动。' },
          limit: { type: 'number', description: '最多几条，默认 8，最大 30。' },
        },
        additionalProperties: false,
      },
      output: { schema: OUTPUT_SCHEMA, render },
      timeoutMs: 5000,
      isConcurrencySafe: () => true,
      execute: async (args) => ({
        text: corpus.timeline({
          from: args?.from,
          to: args?.to,
          around: args?.around,
          faction: args?.faction,
          limit: args?.limit,
        }),
      }),
    },
  ]
}

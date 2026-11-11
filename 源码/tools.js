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
        '查明日方舟设定库：按名字、别名或关键词找国家、城市、组织、人物、事件、社区梗和剧情段落。聊到泰拉设定、剧情、人物关系或黑话前先用它，返回候选 id。'
        + ' (Arknights lore lookup: find nations, cities, factions, people, events, memes and story passages by name, alias or keyword. Call it before discussing Terra lore, plot, relationships or community slang; returns candidate ids.)',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '用户问句或关键词，原样传。 (User question or keywords, pass verbatim.)',
          },
          kind: {
            type: 'string',
            enum: ['any', 'entity', 'event', 'meme', 'story'],
            description: '限定类型，默认 any。 (Restrict result type, default any.)',
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
        '按 id 读设定卡、事件卡、梗卡、干员档案或剧情段落。view=summary 只看摘要/前几句，full 看全文，context 连带前后时间线，records 看干员档案；默认 summary，别一次读太多。'
        + ' (Read a card by id: entity, event, meme, operator records or story passage. view=summary for the abstract or first lines, full for the whole text, context to include the surrounding timeline, records for operator files. Default summary; do not read too much at once.)',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'ark_find 返回的 id，或 canon。 (An id returned by ark_find, or "canon".)',
          },
          view: {
            type: 'string',
            enum: ['summary', 'full', 'context', 'records'],
            description: '读多少，默认 summary；records 只读干员档案。 (How much to read, default summary; records reads operator files only.)',
          },
          maxChars: {
            type: 'number',
            description: '可选，最多返回多少字（400–8000）。 (Optional: maximum characters to return, 400-8000.)',
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
        '按泰拉历查剧情时间线。from/to 传年份或年月（1096、1097-01），around 传事件 id 看前后，faction 按势力过滤。'
        + ' (Query the story timeline by the Terra calendar. from/to take a year or year-month (1096, 1097-01); around takes an event id to show neighbouring entries; faction filters by faction.)',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: '起始点，如 1096 或 1097-01。 (Start point, e.g. 1096 or 1097-01.)',
          },
          to: {
            type: 'string',
            description: '结束点，如 1098 或 1097-12。 (End point, e.g. 1098 or 1097-12.)',
          },
          around: {
            type: 'string',
            description: '事件 id，看它前后各 limit 条。 (Event id; shows limit entries before and after it.)',
          },
          faction: {
            type: 'string',
            description: '势力名，如 龙门、乌萨斯、整合运动。 (Faction name, e.g. Lungmen, Ursus, Reunion.)',
          },
          limit: {
            type: 'number',
            description: '最多几条，默认 8，最大 30。 (Max entries, default 8, max 30.)',
          },
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

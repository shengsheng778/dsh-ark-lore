import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SKILL_FILE = fileURLToPath(new URL('../skills/ark-lore/SKILL.md', import.meta.url))

export function loadSkill() {
  const raw = readFileSync(SKILL_FILE, 'utf8')
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const header = front?.[1] ?? ''
  const content = (front ? raw.slice(front[0].length) : raw).trim()
  const description = header.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  return {
    name: 'ark-lore',
    description: description
      || '明日方舟世界观与剧情时间线。聊到泰拉的国家、城市、组织、人物、剧情先后时，先用 ark_find 再 ark_read。',
    content,
    directory: fileURLToPath(new URL('../skills/ark-lore/', import.meta.url)),
  }
}

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadCorpus } from './源码/load.js'
import { createLiveTools } from './源码/live.js'
import { loadSkill } from './源码/skill.js'
import { createTools } from './源码/tools.js'

export const name = 'ark-lore'
export const inject = ['tools', 'skills']

export function apply(ctx, config = {}) {
  const dataDir = config.dataDir
    ? resolve(String(config.dataDir))
    : fileURLToPath(new URL('./数据/', import.meta.url))

  const corpus = loadCorpus(dataDir)
  const disposers = []

  for (const definition of [...createTools(corpus, config), ...createLiveTools(corpus, dataDir, config)]) {
    disposers.push(ctx.tools.register(definition))
  }

  const skill = loadSkill()
  disposers.push(ctx.skills.register({
    name: skill.name,
    description: skill.description,
    source: 'bundled',
    provider: 'dsh-ark-lore',
    content: skill.content,
    resourceBase: { kind: 'directory', path: skill.directory },
  }))

  const stats = corpus.stats()
  ctx.logger?.info?.(`[ark-lore] loaded ${stats.entities} entities / ${stats.events} events / ${stats.stories} stories`)

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose?.()
      } catch {
        // unloading is best-effort
      }
    }
  }
}

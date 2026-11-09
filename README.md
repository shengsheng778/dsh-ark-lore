# dsh-ark-lore · 方舟记忆库

给 DeepSeek Harness（DSH）用的《明日方舟》世界观记忆插件。不是把整本设定塞进提示词，而是拆成势力小文件，模型要用的时候按 id 取，一次只拿需要的那一段。

核心包自带：一篇《泰拉世界观总览》、502 个实体、607 个事件、70 条社区梗、423 名干员共 3658 段档案、2326 段剧情（427 主线 + 399 密录 + 1233 活动 + 267 肉鸽）共 378860 句、一张泰拉常识卡。实体覆盖国家、城市、组织、人物、概念；事件从 1002 年铺到 1099 年，全部按泰拉历排。数据是纯 JSON/Markdown，跟插件代码分家，改数据不用碰代码。

测试和反馈群：QQ `1129849036`。装测试版、报错、提数据修正都走这个群。

## 包里有什么

```
dsh-ark-lore/
├─ index.js              插件入口（注册工具和技能）
├─ cordis.patch.yml      插进 profile 的补丁
├─ 使用说明书.md         使用说明（中文）
├─ 源码/                  检索、时间线、格式
├─ 数据/
│  ├─ canon.md           常识卡（一页纸）
│  ├─ 势力/*.json    按势力分的实体文件
│  ├─ events.json        人工整理的事件卡（泰拉历）
│  ├─ memes.json         社区梗（不参与时间线）
│  ├─ records.json       干员档案（按实体 id 挂）
│  ├─ stories.json       主线/密录/活动剧情
│  ├─ rogue.json         肉鸽结局/IF 线
│  └─ 导入/           批量导入：PRTS 年表、干员档案
├─ 技能/ark-lore/      行为规则（模型按需加载）
├─ 脚本/lint.mjs      数据检查
├─ 脚本/query.mjs     命令行查询
├─ 脚本/visualize.mjs 生成时间线 HTML
└─ 测试/                 40 条测试
```

## 装到 DSH

要求：DSH 0.2.x，Node 20 以上。插件没有 npm 依赖，不用联网。

**桌面端（推荐）**

1. 打开「插件」，右上角「＋ 添加插件」。
2. 来源选「本地目录」，指向解压后的 `dsh-ark-lore` 文件夹；或者来源选「本地 .tgz」，指向 `dsh-ark-lore-0.11.1.tgz`。
3. 装完启用，重启一次 DSH（换新模块要重启）。
4. 新建会话，问一句「龙门后来怎么样了」，模型应该会先调 `ark_find`。

**命令行**

```bash
dsh plugin --profile <你的 profile> add /绝对路径/dsh-ark-lore-0.11.1.tgz
```

Web profile 可以直接加；Electron 桌面的 `desktop` profile 由应用管理，用界面装，别用命令行。

**装完怎么确认**

- 插件列表里有「方舟记忆库」。
- 会话里能看到 `ark_find` / `ark_read` / `ark_timeline` / `ark_web` 四个工具。
- 问「整合运动跟龙门什么关系」，回答里应该带出 1097 年 1 月那次进攻，而不是泛泛而谈。

## 四个工具

| 工具 | 干什么 | 一次大概多少字 |
| --- | --- | --- |
| `ark_find(query, kind?)` | 按名字、别名、关键词找实体、事件或梗，返回候选 id | 200-600 |
| `ark_read(id, view?, maxChars?)` | 读设定卡、事件卡、梗卡、干员档案或剧情；`summary` 只给摘要/前几句，`full` 给正文/全台词，`context` 连带前后时间线，`records` 只读档案 | 300-6000 |
| `ark_timeline(from?, to?, around?, faction?, limit?)` | 按泰拉历列事件；`around` 看某个事件前后 | 300-1000 |
| `ark_web(action, query?, title?, url?, id?, fields?, source?)` | 连 PRTS 搜索/读页面；核实后把修正写进 `corrections.json` | 400-6000 |

`ark_web` 是给“库里没有/过时/对不上”兜底的：`search` 搜 PRTS，`read` 读页面，`fix` 写修正，`learn_meme` 收新梗，`sync_stories` 从游戏数据拉新活动剧情。`fix`/`learn_meme` 必须带 `source` 或 `url`，只改实体、事件、梗的已知字段，不碰剧情原文。修正和新梗写到 `数据/corrections.json` / `数据/dynamic.json`，下次启动继续生效；新剧情写 `dynamic.json`，进程内立刻能读。

梗库单独放在 `数据/memes.json`，现在 70 条，和实体/事件分开。`ark_find` 的 `kind` 可以传 `meme` 只查梗；梗卡不参与时间线，也不会混进事件搜索结果。

干员档案在 `数据/records.json`，按实体 id 挂到 423 名干员上，共 3658 段，来源是游戏数据 `handbook_info_table`。`ark_read <干员id> view=records` 单独读档案，不会把整份档案塞进普通摘要。

```bash
node 脚本/query.mjs read op.char_500_noirc records
```

主线/密录/活动剧情在 `数据/stories.json`，2326 段（427 主线 + 399 密录 + 1233 活动 + 267 肉鸽）、378860 句，来源是游戏数据。`ark_read <剧情id>` 默认给前 16 句，`view=full` 给整段台词，不会把整章塞进上下文。

```bash
node 脚本/query.mjs read story.obt.main.level_main_01-01_beg summary
```

## 时间线可视化

```bash
node 脚本/visualize.mjs --out timeline.html
```

生成一个单文件 HTML，把 607 个事件按泰拉历年份分组；支持搜索标题/摘要/正文/势力，按势力筛选，点事件展开正文。文件不依赖服务器，双击就能开，适合自查和做视频素材。

还有个 `ark-lore` 技能，只在模型判断需要时加载，内容是「先 find 再 read、别背年表、按认知字段说话」。

## 数据怎么改

**加一个势力**：在 `数据/势力/` 下新建一个 JSON 数组文件，一条一个实体：

```json
[
  {
    "id": "longmen",
    "type": "city",
    "name": "龙门",
    "aliases": ["龙门市", "龙门城"],
    "faction": "炎",
    "summary": "一句话，给检索用。",
    "body": "正文，给 full 视图用。",
    "tags": ["移动城市", "感染者"],
    "knowledge": "seen",
    "confidence": "high",
    "source": "主线5-6章"
  }
]
```

`type`：`nation` / `city` / `org` / `person`。
`knowledge`：`public` / `rumor` / `rhodes` / `seen`，决定角色该不该装懂。
`confidence`：`high` / `medium` / `low` / `pending`。

**加一个事件**：往 `数据/events.json` 里追加：

```json
{
  "id": "ev.1097-01.longmen",
  "title": "龙门危机",
  "time": { "year": 1097, "month": 1, "precision": "month" },
  "order": 0,
  "factions": ["炎", "龙门", "整合运动"],
  "entities": ["longmen", "lmd_police", "chen"],
  "summary": "一句话。",
  "body": "正文。",
  "chapter": "主线5-6章",
  "confidence": "high",
  "source": "主线5-6章"
}
```

**时间线规则**：只按泰拉历排，现实上线时间不参与。`month` 可以空，只有年份就写 `"precision": "year"`；同一年里排不出先后的，用 `order` 兜底。官方没给精确日期的，别硬编月份。

**不想改自带文件**：把补丁 JSON 丢进 `数据/导入/`，格式是 `{ "entities": [...], "events": [...] }`，加载时会合并。适合从外部脚本批量导入。

## 数据来源

- 人工整理的势力卡、常识卡、关键事件：`数据/势力/`、`数据/events.json`。
- 事件时间线：PRTS Wiki《泰拉年表》，按泰拉历重新切分，保留 `confidence: medium` 和出处。原表自己标注“时间由游戏内剧情推测”，所以带“约”的条目别当铁案。
- 干员卡：Kengxxiao/ArknightsGameData 的 `character_table.json`，只取姓名、职业、所属、标签和一句简介，标 `background: true`，不参与“必须挂事件”的检查。

重新导入时不要把整份 wiki 原文塞进提示词；按 `数据/导入/` 的格式生成 JSON，再跑 `lint`。

## 检查

```bash
node 脚本/lint.mjs          # 结构检查：id 重复、引用断链、时间非法、超长
node 脚本/query.mjs find 龙门
node 脚本/query.mjs read longmen full
node 脚本/query.mjs timeline 1096 1098
node 脚本/query.mjs around ev.1097-01.longmen 3
node --test 测试/corpus.test.mjs 测试/plugin.test.mjs
```

`lint` 有错误会返回非零；警告不拦。

## 上下文开销

- 常驻的只有四个工具的定义和一句技能描述，约三百多 token。
- 真查的时候一次几百到一千多字，有硬上限。
- 不查就等于不在。对比「每次把世界观整本读一遍」，差两个数量级。

## 边界

- 自带的是世界观骨架 + 事件时间线，不是全量剧情原文。要某一章的逐句细节，按 `imports` 格式接 `Kengxxiao/ArknightsGameData` 的剧情文本。
- 时间线停在 1099 年末；再往后没写。
- 梗库是社区口传整理，不是官方设定；有争议的条目带 medium 置信。
- 数据里的年份有推定成分，标注在 `confidence` 和 `precision` 里；别把「约」当「准」。
- 干员卡是数据表生成的，只有基本档案；人物关系和剧情细节靠事件卡补。

## 许可

代码 MIT。数据是玩家向的设定摘要，不含游戏素材；《明日方舟》及其角色、名称、设定归鹰角网络 / Yostar 所有。PRTS 年表和 Kengxxiao 数据仓库各有自己的许可/使用约定，再分发前自己核对，别直接商用。

































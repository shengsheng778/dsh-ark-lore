#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadCorpus } from '../源码/load.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = resolve(process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : resolve(root, 'timeline.html'))
const corpus = loadCorpus(fileURLToPath(new URL('../数据/', import.meta.url)))

const pad = (n) => String(n).padStart(2, '0')
const label = (time) => {
  if (!time?.year) return '时间不明'
  const pre = time.precision === 'circa' ? '约' : ''
  if (!time.month) return `${pre}${time.year}`
  if (!time.day) return `${pre}${time.year}-${pad(time.month)}`
  return `${pre}${time.year}-${pad(time.month)}-${pad(time.day)}`
}

const factionCount = new Map()
for (const event of corpus.events) {
  for (const faction of event.factions) {
    factionCount.set(faction, (factionCount.get(faction) ?? 0) + 1)
  }
}
const factions = [...factionCount.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
  .map(([name, count]) => ({ name, count }))

const payload = {
  stats: corpus.stats(),
  factions,
  events: corpus.events.map((event) => ({
    id: event.id,
    title: event.title,
    date: label(event.time),
    year: event.time.year,
    month: event.time.month ?? null,
    factions: event.factions,
    entities: event.entities.map((id) => corpus.byId.get(id)?.name ?? id),
    summary: event.summary,
    body: event.body,
    chapter: event.chapter,
    confidence: event.confidence,
    source: event.source,
  })),
}

const DATA = JSON.stringify(payload).replaceAll('<', '\\u003c')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>方舟记忆库 · 泰拉时间线</title>
<style>
:root{--bg:#090c11;--panel:#121820;--line:#2a3140;--ink:#eee8db;--muted:#96a0ad;--dim:#5c6674;--amber:#d9a441;--red:#c05b4d;--teal:#4fb3a5}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#1b2330 0%,var(--bg) 55%);color:var(--ink);font:16px/1.65 "Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:54px 28px 100px}
.kicker{font:12px/1.4 Consolas,monospace;letter-spacing:.18em;color:var(--amber);text-transform:uppercase}
h1{font-size:56px;line-height:1.1;margin:12px 0 10px;letter-spacing:-.03em}
.lead{color:var(--muted);margin:0 0 30px;max-width:760px}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 30px}
.stat{border:1px solid var(--line);background:#0e141c;border-radius:12px;padding:12px 18px;min-width:120px}
.stat b{display:block;font:700 28px/1.1 Consolas,monospace;color:var(--amber)}
.stat span{font-size:12px;color:var(--muted)}
.controls{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;z-index:3;background:rgba(9,12,17,.92);backdrop-filter:blur(10px);padding:14px 0;border-bottom:1px solid var(--line);margin-bottom:26px}
input,select,button{background:#0e141c;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:14px/1.4 "Microsoft YaHei",sans-serif}
input{flex:1;min-width:240px}
button{cursor:pointer;color:var(--amber)}
#count{margin-left:auto;color:var(--dim);font:13px/1.4 Consolas,monospace;align-self:center}
.year{margin:34px 0 12px;display:flex;align-items:baseline;gap:14px}
.year h2{font:700 32px/1 Consolas,monospace;color:var(--amber);margin:0}
.year span{color:var(--dim);font-size:12px}
.ev{border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#121820,#0e141c);padding:16px 18px;margin:10px 0;cursor:pointer;transition:.15s border-color,.15s transform}
.ev:hover{border-color:#4b5563;transform:translateX(2px)}
.ev .row{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.ev time{font:12px/1.4 Consolas,monospace;color:var(--amber);min-width:74px}
.ev h3{font-size:18px;margin:0;line-height:1.45;flex:1;min-width:240px}
.ev .sum{color:var(--muted);font-size:14px;margin:8px 0 0}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.tag{font-size:11px;color:var(--muted);border:1px solid #303848;border-radius:999px;padding:2px 8px}
.tag.f{color:var(--teal);border-color:#28514c}
.body{display:none;white-space:pre-wrap;color:#c9d0d9;border-top:1px dashed #303848;margin-top:12px;padding-top:12px;font-size:14px}
.ev.open .body{display:block}
.empty{color:var(--dim);padding:40px 0;text-align:center}
footer{color:var(--dim);font-size:12px;margin-top:60px;border-top:1px solid var(--line);padding-top:16px}
@media(max-width:640px){h1{font-size:38px}.wrap{padding:32px 16px 70px}.ev h3{font-size:16px}time{min-width:64px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="kicker">DSH-ARK-LORE / TIMELINE</div>
  <h1>泰拉时间线</h1>
  <p class="lead">按剧情内时间排，不按现实活动时间。点事件展开正文；搜索标题、摘要、正文、势力。</p>
  <div class="stats">
    <div class="stat"><b>${payload.stats.entities}</b><span>实体</span></div>
    <div class="stat"><b>${payload.stats.events}</b><span>事件</span></div>
    <div class="stat"><b>${payload.stats.memes}</b><span>梗</span></div>
    <div class="stat"><b>1002–1099</b><span>泰拉历覆盖</span></div>
  </div>
  <div class="controls">
    <input id="q" type="search" placeholder="搜：特里蒙弧光 / 龙门 / 霜星 / 1097">
    <select id="faction"><option value="">全部势力</option>${factions.map((f) => `<option value="${escapeAttr(f.name)}">${escapeHtml(f.name)} · ${f.count}</option>`).join('')}</select>
    <button id="reset">重置</button>
    <span id="count"></span>
  </div>
  <main id="list"></main>
  <footer>数据来自 dsh-ark-lore · 社区年表，置信度以事件卡为准。生成时间 ${new Date().toISOString().slice(0, 10)}。</footer>
</div>
<script>const DATA=${DATA};</script>
<script>
const list = document.getElementById('list');
const q = document.getElementById('q');
const faction = document.getElementById('faction');
const count = document.getElementById('count');
const esc = (s) => String(s ?? '');

function render() {
  const term = q.value.trim().toLowerCase();
  const fac = faction.value;
  const rows = DATA.events.filter((e) => {
    if (fac && !e.factions.includes(fac)) return false;
    if (!term) return true;
    return [e.title, e.summary, e.body, e.date, ...e.factions, ...e.entities]
      .join('\\n').toLowerCase().includes(term);
  });
  count.textContent = rows.length + ' / ' + DATA.events.length + ' 条';
  list.innerHTML = '';
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '没命中。换个词，或者清掉势力筛选。';
    list.appendChild(p);
    return;
  }
  let year = null;
  for (const e of rows) {
    if (e.year !== year) {
      year = e.year;
      const head = document.createElement('div');
      head.className = 'year';
      const h = document.createElement('h2');
      h.textContent = String(year);
      const s = document.createElement('span');
      s.textContent = '泰拉历';
      head.append(h, s);
      list.appendChild(head);
    }
    const card = document.createElement('article');
    card.className = 'ev';
    const row = document.createElement('div');
    row.className = 'row';
    const time = document.createElement('time');
    time.textContent = e.date;
    const h = document.createElement('h3');
    h.textContent = e.title;
    row.append(time, h);
    const sum = document.createElement('p');
    sum.className = 'sum';
    sum.textContent = e.summary;
    const tags = document.createElement('div');
    tags.className = 'tags';
    for (const f of e.factions) {
      const t = document.createElement('span');
      t.className = 'tag f';
      t.textContent = f;
      tags.appendChild(t);
    }
    for (const id of e.entities.slice(0, 4)) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = id;
      tags.appendChild(t);
    }
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = e.body || '（这张卡只有摘要，没有正文。）';
    card.append(row, sum, tags, body);
    card.addEventListener('click', () => card.classList.toggle('open'));
    list.appendChild(card);
  }
}
q.addEventListener('input', render);
faction.addEventListener('change', render);
document.getElementById('reset').addEventListener('click', () => { q.value = ''; faction.value = ''; render(); });
render();
</script>
</body>
</html>`

writeFileSync(out, html, 'utf8')
console.log(`time line: ${out}`)
console.log(`events ${payload.stats.events} / factions ${factions.length} / ${(html.length / 1024).toFixed(1)} KB`)

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

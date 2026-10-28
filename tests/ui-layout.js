// UI 布局测试：本地服务 + headless Chrome（CDP 直连）量真实布局
// 断言：1) 无横向溢出 2) 一屏内页面不滚动 3) 金价计算器各列输入框对齐
// 用法：node tests/ui-layout.js [--chrome "路径"] [--shots]
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
const SHOTS = process.argv.includes('--shots')

function findChrome() {
  const i = process.argv.indexOf('--chrome')
  if (i > 0) return process.argv[i + 1]
  if (process.env.CHROME) return process.env.CHROME
  const cands = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ]
  const hit = cands.find(p => fs.existsSync(p))
  if (!hit) throw new Error('找不到 Chrome，用 --chrome 指定路径')
  return hit
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function demoSeed() {
  const now = Date.now()
  const types = ['find_npc', 'equip60', 'food_drug', 'flower', 'equip80', 'instrument', 'furniture1', 'equip70', 'variant_nonspecific']
  const sc = { find_npc: 1, equip60: 2, food_drug: 2, flower: 4, equip80: 5, instrument: 4, furniture1: 2, equip70: 3, variant_nonspecific: 5 }
  const rings = []
  for (let i = 0; i < 37; i++) { const t = types[i % types.length]; rings.push({ t, sc: sc[t], item: '' }) }
  for (let i = 0; i < 63; i++) rings.push({ t: null, sc: 0, item: '' })
  const mkRun = (id, days, income) => ({
    id, level: 175, startedAt: now - days * 86400000 - 7200000, doneAt: now - days * 86400000,
    rings: Array.from({ length: 100 }, () => ({ t: 'equip80', sc: 5, item: '' })),
    notes: '', done: true, totalScore: 220, totalExp: 751, totalCost: 45000000, bookLevel: 150,
    income, incomeItems: [{ kind: 'book', level: 150, name: '150级制造指南书-剑' }],
    costItems: [{ tid: 'equip80', name: '80环装', qty: 100, unitPrice: 450000, amount: 45000000 }],
    cost: 45000000, profit: income - 45000000, roi: income / 45000000,
    netRate: (income - 45000000) / 45000000, durationMin: 96, hourly: (income - 45000000) / 1.6,
    settledAt: now - days * 86400000
  })
  return {
    mhxy_users: [{ id: 'user_demo', name: '飞雪连天', createdAt: now }],
    mhxy_active: 'user_demo',
    mhxy_cfg_user_demo: { level: 175 },
    mhxy_prices_user_demo: {},
    mhxy_runs_user_demo: [
      mkRun(101, 1, 50000000),
      mkRun(102, 3, 12000000),
      { id: 104, level: 160, startedAt: now - 20 * 86400000, doneAt: now - 19 * 86400000, rings: [], done: true, totalScore: 180, totalCost: 1230000 }
    ],
    mhxy_cur_user_demo: { id: now - 5400000, level: 175, startedAt: now - 5400000, pausedMs: 900000, rings, notes: '', done: false, doneAt: null, reward: null },
    mhxy_task_usage_user_demo: { pet: { equip80: 42, flower: 31 }, chain: {} },
    mhxy_items_user_demo: ['变异宠', '金柳露', '80环装'],
    mhxy_money_cfg: { version: 2, ratioWan: 3000, ratioYuan: 202, pointCostYuanPerHour: 0.4, targetHourlyYuan: 10 },
    mhxy3_cfg_user_demo: { level: 175 },
    mhxy3_prices_user_demo: {},
    mhxy3_cur_user_demo: {
      id: now - 7200000, level: 175, startedAt: now - 7200000,
      rings: Array.from({ length: 300 }, (_, i) => i < 120 ? { t: types[i % types.length], item: '' } : { t: null, item: '' }),
      rewards: { 100: ['120级制造指南书-刀'], 200: [], 300: [] }, notes: '', done: false, doneAt: null, totalCost: 0
    },
    mhxy_view: { width: 1400, skinOpacity: 52, skinBlur: 1 },
    mhxy_welcome_seen: '1'
  }
}

function navJs(view) {
  const parts = view.split(':')
  const tool = parts[0]
  const tabName = parts[1]
  let js = ''
  if (tool === 'pet') js += `document.querySelector('.hub-card[data-nav="pet"]').click();`
  if (tool === 'chain') js += `document.querySelector('.hub-card[data-nav="chain"]').click();`
  if (tool === 'ledger') js += `document.querySelector('.hub-card[data-nav="ledger"]').click();`
  if (tabName) js += `setTimeout(function(){var t=document.querySelector('.tab[data-tab="${tabName}"]');if(t)t.click();},80);`
  return js
}

const MEASURE_JS = `
window.__measureUI = function(){
  function box(el){var r=el.getBoundingClientRect();return {l:+r.left.toFixed(1),r:+r.right.toFixed(1),t:+r.top.toFixed(1),b:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};}
  function byId(id){var el=document.getElementById(id);return el?box(el):null;}
  var de=document.documentElement;
  var out={vw:innerWidth,vh:innerHeight,sw:de.scrollWidth,sh:de.scrollHeight,maxRight:0,maxBottom:0,badX:[]};
  var all=document.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){
    var el=all[i],r=el.getBoundingClientRect();
    if(r.width===0&&r.height===0)continue;
    if(r.right>out.maxRight)out.maxRight=+r.right.toFixed(1);
    if(r.bottom>out.maxBottom)out.maxBottom=+r.bottom.toFixed(1);
    if(r.right>out.vw+1&&!el.closest('.hub-bg')&&out.badX.length<6)out.badX.push((el.tagName+'.'+(el.className||'')).slice(0,44)+'@'+r.right.toFixed(0));
  }
  var g=document.querySelector('.gold-card');
  out.gold={card:g?box(g):null,wan:byId('gold-wan'),rw:byId('gold-rw'),target:byId('gold-target'),
    yuan:byId('gold-yuan'),ry:byId('gold-ry'),save:byId('btn-gold-save')};
  var grid=document.getElementById('ring-grid');out.grid=grid?box(grid):null;
  var q=document.querySelector('.quick-bar');out.quick=q?box(q):null;
  var st=document.querySelector('.strip');out.strip=st?box(st):null;
  var hm=document.querySelector('.hub-main');out.hubMain=hm?box(hm):null;
  var appEl=document.querySelector('.app');out.app=appEl?box(appEl):null;
  out.skinLayers=document.querySelectorAll('#skin-bg,#skin-scrim').length;
  return out;
};
`

function buildHtml(view) {
  const seed = demoSeed()
  if (view === 'hub1150') { seed.mhxy_view = { width: 1150, skinOpacity: 52, skinBlur: 1 }; view = 'hub' }
  const seedJs = '<script>' + Object.entries(seed)
    .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(JSON.stringify(v))});`).join('') + '</script>\n'
  let html = INDEX.replace('<style>', seedJs + '<style>')
  const inject = `<script>
setTimeout(function(){ try{ ${navJs(view)} }catch(e){} }, 150);
${MEASURE_JS}
</script>
`
  return html.replace('</body>', inject + '</body>')
}

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const view = (req.url.match(/[?&]view=([a-z0-9:]+)/) || [])[1] || 'hub'
      if (req.url.split('?')[0] === '/index.html' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Connection': 'close', 'Cache-Control': 'no-store' })
        res.end(buildHtml(view)); return
      }
      res.writeHead(404, { 'Connection': 'close' }); res.end('nf')
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function waitTarget(port, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch (e) { /* 端口还没起 */ }
    await sleep(120)
  }
  throw new Error('等不到 Chrome 调试端口')
}

function cdp(ws) {
  let id = 0
  const pending = new Map()
  const events = []
  const waiters = []
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return }
    if (msg.method) {
      events.push(msg.method)
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) { waiters[i].resolve(msg); waiters.splice(i, 1) }
      }
    }
  })
  const send = (method, params) => new Promise((resolve, reject) => {
    id++
    pending.set(id, m => m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result))
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
  const waitEvent = (method, timeoutMs) => new Promise((resolve, reject) => {
    if (events.includes(method)) return resolve()
    waiters.push({ method, resolve })
    setTimeout(() => reject(new Error('等事件超时: ' + method)), timeoutMs || 10000)
  })
  return { send, waitEvent }
}

async function measureOnce(chrome, url, w, h, tag) {
  const port = 9300 + Math.floor(Math.random() * 500)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mhxy-ui-'))
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${w},${h}`, `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', 'about:blank'
  ], { stdio: 'ignore' })

  let ws
  try {
    const wsUrl = await waitTarget(port, 20000)
    ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const { send, waitEvent } = cdp(ws)
    await send('Page.enable')
    await send('Runtime.enable')
    const loaded = waitEvent('Page.loadEventFired', 15000)
    await send('Page.navigate', { url })
    await loaded
    await sleep(900)
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__measureUI())', returnByValue: true })
    const val = r && r.result && r.result.value
    if (!val) throw new Error('页面没有返回测量结果')
    if (SHOTS) {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const dir = path.join(ROOT, 'docs', 'screenshots')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `ui-${tag}.png`), Buffer.from(shot.data, 'base64'))
    }
    return JSON.parse(val)
  } finally {
    try { ws && ws.close() } catch (e) {}
    try { child.kill() } catch (e) {}
    await sleep(150)
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch (e) {}
  }
}

const failures = []
function ok(cond, label) {
  if (cond) { console.log('  ✔ ' + label); return }
  console.log('  ✖ ' + label); failures.push(label)
}

;(async () => {
  const chrome = findChrome()
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}/index.html?noskin=1`
  const cases = [
    ['hub', 1366, 768], ['hub', 1440, 900], ['hub', 1920, 1080], ['hub', 2560, 1440], ['hub', 3440, 1440], ['hub1150', 1920, 1080],
    ['pet', 1440, 900], ['pet', 1920, 1080], ['pet', 2560, 1440],
    ['chain', 1440, 900],
    ['ledger', 1440, 900], ['ledger', 1920, 1080],
    ['pet:history', 1440, 900], ['pet:stats', 1440, 900],
    ['pet:predict', 1440, 900], ['pet:control', 1440, 900],
    ['chain:reward', 1440, 900], ['chain:history', 1440, 900], ['chain:stats', 1440, 900]
  ]
  try {
    for (const [v, w, h] of cases) {
      console.log(`\n【${v} ${w}×${h}】`)
      const m = await measureOnce(chrome, `${base}&view=${v}`, w, h, `${v.replace(/[:]/g,'-')}-${w}x${h}`)
      console.log(`  视口 ${m.vw}×${m.vh}`)
      ok(m.sw <= m.vw + 1, `无横向溢出（scrollWidth ${m.sw} ≤ ${m.vw}）`)
      ok(m.badX.length === 0, `没有元素越过右边界${m.badX.length ? '：' + m.badX.join(' , ') : ''}`)
      ok(m.sh <= m.vh + 2, `页面本身不滚动（scrollHeight ${m.sh} ≤ ${m.vh}）`)
      if (m.app) {
        ok(m.app.w <= 1401, `内容栏不超宽（${m.app.w} ≤ 1400）`)
        if (v === 'hub1150') {
          ok(Math.abs(m.app.w - 1150) <= 2, `窄屏档位生效（${m.app.w} ≈ 1150）`)
        }
        if (m.vw > 1400 && v !== 'hub1150') {
          ok(Math.abs(m.app.l - (m.vw - m.app.r)) <= 2, `内容栏居中（左 ${m.app.l} / 右距 ${(m.vw - m.app.r).toFixed(1)}）`)
          ok(m.app.l >= 8, `左右留白（左 ${m.app.l} / 右 ${(m.vw - m.app.r).toFixed(1)}）`)
        }
      }

      const tool = v.indexOf('hub') === 0 ? 'hub' : v.split(':')[0]
      if (tool === 'hub') {
        const g = m.gold
        ok(m.skinLayers === 2, '换肤图层存在（背景 + 压暗层）')
        ok(!!g.card, '金价卡存在')
        if (g.card) {
          ok(Math.abs(g.wan.l - g.rw.l) < 0.6 && Math.abs(g.rw.l - g.target.l) < 0.6,
            `第一列输入框左对齐（${g.wan.l} / ${g.rw.l} / ${g.target.l}）`)
          ok(Math.abs(g.wan.w - g.rw.w) < 0.6 && Math.abs(g.rw.w - g.target.w) < 0.6,
            `第一列输入框等宽（${g.wan.w} / ${g.rw.w} / ${g.target.w}）`)
          ok(Math.abs(g.yuan.l - g.ry.l) < 0.6, `第二列输入框左对齐（${g.yuan.l} / ${g.ry.l}）`)
          ok(Math.abs(g.yuan.w - g.ry.w) < 0.6, `第二列输入框等宽（${g.yuan.w} / ${g.ry.w}）`)
          ok(g.card.r <= m.vw + 1, `金价卡不超出视口（右 ${g.card.r} ≤ ${m.vw}）`)
          ok(g.save && g.save.r <= g.card.r + 1, '保存按钮在金价卡内')
          ok(!!m.hubMain && m.hubMain.b <= m.vh + 1, `首页内容完整在一屏内（底 ${m.hubMain && m.hubMain.b} ≤ ${m.vh}）`)
        }
      }
      if ((tool === 'pet' || tool === 'chain') && v.indexOf(':') < 0) {
        ok(!!m.grid && m.grid.b <= m.vh + 1, `环格网格在视口内（底 ${m.grid && m.grid.b} ≤ ${m.vh}）`)
        ok(!!m.quick && m.quick.b <= m.vh + 1, `快速栏在视口内（底 ${m.quick && m.quick.b}）`)
        ok(!!m.strip && m.strip.b <= m.vh + 1, '信息条在视口内')
      }
    }
  } finally {
    server.close()
  }

  console.log('')
  if (failures.length) {
    console.log('UI 布局测试失败 ' + failures.length + ' 项：')
    failures.forEach(f => console.log('  - ' + f))
    process.exit(1)
  }
  console.log('UI 布局测试全部通过（' + cases.length + ' 个视口）' + (SHOTS ? '，截图已存 docs/screenshots' : ''))
})().catch(e => { console.error('UI 测试异常:', e.message); process.exit(1) })

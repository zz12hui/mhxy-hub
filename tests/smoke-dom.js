// 浏览器行为冒烟：用 jsdom 真加载 index.html，走完整业务流程并断言页面输出。
// node tests/smoke-dom.js
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const HTML = path.join(__dirname, '..', 'index.html')
const html = fs.readFileSync(HTML, 'utf8')

const errors = []
const failures = []

function ok(cond, label) {
  if (cond) { console.log('  ✔ ' + label); return true }
  console.log('  ✖ ' + label); failures.push(label); return false
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(window) {
    // 弹窗默认同意
    window.Element.prototype.scrollIntoView = function () {}
    window.confirm = () => true
    window.alert = () => {}
    window.prompt = () => ''
    // jsdom 没有 canvas 2D：给一个不干活的 ctx，保证交互链路可跑
    window.HTMLCanvasElement.prototype.getContext = function () {
      const canvas = this
      const noop = () => {}
      return new Proxy({}, {
        get(t, p) {
          if (p === 'canvas') return canvas
          if (p === 'measureText') return () => ({ width: 10 })
          if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: noop })
          return noop
        },
        set() { return true }
      })
    }
    window.addEventListener('error', e => errors.push(String((e.error && e.error.stack) || e.message)))
    const origError = window.console.error
    window.console.error = (...a) => { errors.push(a.join(' ')); origError.apply(window.console, a) }
  }
})

const { window } = dom
const { document } = window
const sleep = ms => new Promise(r => setTimeout(r, ms))
const app = () => document.getElementById('app').innerHTML
const q = sel => document.querySelector(sel)
const qa = sel => [...document.querySelectorAll(sel)]
const click = async (el, ms) => { el.click(); await sleep(ms || 25) }
const byText = (sel, txt) => qa(sel).find(e => e.textContent.indexOf(txt) >= 0)

;(async () => {
  await sleep(150)
  // 首访欢迎页会盖住界面，先点「开始使用」
  if (document.getElementById('wl-start')) { document.getElementById('wl-start').click(); await sleep(60) }

  console.log('1. 首页')
  ok(app().indexOf('梦幻搞钱工具箱') >= 0, '标题渲染')
  ok(app().indexOf('收益账本') >= 0, '账本卡片存在')
  ok(!!q('#gold-wan'), '金价计算器存在')
  ok(qa('.hub-card[data-nav]').length === 3, '三张工具卡')
  ok(!!document.getElementById('skin-bg') && !!document.getElementById('skin-scrim'), '换肤图层在 DOM 里')

  console.log('2. 宠环：开轮 / 环格 / 记一环')
  await click(q('.hub-card[data-nav="pet"]'))
  ok(app().indexOf('宠环助手') >= 0, '进入宠环')
  await click(q('#btn-new-run'))
  ok(qa('#ring-grid .cell').length === 100, '100 个环格')
  await click(byText('[data-action="qp"]', '80环装'))
  await click(q('#btn-qb-go'))
  const strip = q('.strip').textContent.replace(/\s+/g, ' ')
  ok(strip.indexOf('45万') >= 0, '80 环装按默认价计入费用：' + strip.slice(0, 60))
  ok(strip.indexOf('80书铁(保底)') >= 0, '80 分走保底档位')

  console.log('3. 撤销栈')
  ok(!!q('#btn-undo'), '撤销按钮出现')
  await click(q('#btn-undo'))
  ok(qa('#ring-grid .cell.d5').length === 0, '撤销后该环回到空白')

  console.log('3b. 键盘 / 物品记忆 / 环号跳转 / 暂停')
  const fire = k => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }))
  fire('2')
  await sleep(20)
  ok(!!q('.qb-t.sel'), '数字键选中任务')
  q('#qb-item').value = '金柳露'
  fire('Enter')
  await sleep(40)
  ok(qa('.chip-item').some(c => c.textContent.indexOf('金柳露') >= 0), '物品名进了常用 chips')
  const chip = qa('.chip-item').find(c => c.textContent.indexOf('金柳露') >= 0)
  await click(chip)
  ok(q('#qb-item').value === '金柳露', '点 chip 回填物品名')
  q('#jump-ring').value = '42'
  await click(q('#btn-jump'))
  ok(!!q('.cell[data-ring="42"]') && q('.cell[data-ring="42"]').className.indexOf('jump-hl') >= 0, '环号定位高亮')
  await click(q('#btn-pause'))
  ok(q('.strip').textContent.indexOf('已暂停') >= 0, '暂停后显示已暂停')
  await click(q('#btn-pause'))
  ok(q('.strip').textContent.indexOf('已暂停') < 0, '继续后恢复计时')

  console.log('4. 批量填充（Canvas 轨道）')
  await click(q('#btn-batch'))
  ok(!!q('#bf-confirm'), '批量填充弹窗打开')
  await click(q('.bf-quick[data-from="all"]'))
  await click(q('.bf-task[data-tid="equip80"]'))
  await click(q('#bf-confirm'))
  ok(qa('#ring-grid .cell').filter(c => c.className !== 'cell').length === 100, '全部 100 环被填充')

  console.log('5. 结算 → 记收入 → 账本入账')
  await click(q('#btn-complete'))
  ok(!!q('#rw-save'), '结算弹窗打开')
  ok(q('#rw-preview').textContent.indexOf('成本') >= 0, '结算弹窗有账本预览')
  const cat = q('#rw-cat'); cat.value = '制造指南书'; cat.dispatchEvent(new window.Event('change', { bubbles: true }))
  const lv = q('#rw-lv'); lv.value = '150'; lv.dispatchEvent(new window.Event('change', { bubbles: true }))
  const tp = q('#rw-type'); tp.value = '剑'; tp.dispatchEvent(new window.Event('change', { bubbles: true }))
  await click(q('#rw-add-main'))
  ok(q('#rw-main-selected').textContent.indexOf('150级制造指南书-剑') >= 0, '主奖励已选')
  ok(/5000/.test(q('#rw-preview').textContent), '收入按价目表估值：' + q('#rw-preview').textContent.replace(/\s+/g, ' ').slice(0, 80))
  await click(q('#rw-save'), 60)
  if (q('#btn-close-report')) await click(q('#btn-close-report'))

  console.log('6. 账本页 KPI')
  if (q('#btn-back')) await click(q('#btn-back'))
  await click(q('.hub-card[data-nav="ledger"]'))
  const lg = app()
  ok(lg.indexOf('收益账本') >= 0, '账本页渲染')
  ok(lg.indexOf('净收益') >= 0 && lg.indexOf('ROI') >= 0 && lg.indexOf('平均时薪') >= 0, 'KPI 卡齐全')
  ok(lg.indexOf('轮次明细') >= 0, '明细区存在')
  ok(qa('.ledger-row').length === 1, '有 1 条轮次')
  ok(lg.indexOf('成本结构') >= 0, '成本结构条存在')

  console.log('7. 周期 / 币种切换')
  await click(q('.seg-btn[data-period="today"]'))
  ok(q('.seg-btn[data-period="today"]').classList.contains('on'), '今日按钮高亮')
  await click(q('.seg-btn[data-currency="yuan"]'))
  ok(/元/.test(app()), '切到人民币口径')
  await click(q('.seg-btn[data-currency="wan"]'))

  console.log('8. 明细弹窗')
  await click(q('.ledger-row'))
  const detail = qa('.modal').find(m => m.textContent.indexOf('成本明细') >= 0)
  ok(!!detail, '明细弹窗打开')
  ok(!!detail && detail.textContent.indexOf('收入明细') >= 0, '有收入明细')
  ok(!!detail && detail.textContent.indexOf('本轮结论') >= 0, '有本轮结论')
  await click(q('.modal [data-act="close"]'))

  console.log('9. 导入 hub v1 旧格式 → 未记账 → 补录')
  window.importAccount({
    type: 'pet',
    cfg: { level: 160 },
    hist: [{ id: 9001, level: 160, startedAt: Date.now() - 86400000, doneAt: Date.now() - 80000000, rings: [], totalScore: 180, totalCost: 1230000 }],
    prices: {},
    cur: null
  })
  await sleep(60)
  ok(qa('.ledger-row').length === 2, '合并后 2 条轮次')
  ok(app().indexOf('未记账') >= 0, '旧数据标记未记账')
  const unbooked = qa('.ledger-row').find(r => r.textContent.indexOf('未记账') >= 0)
  await click(unbooked)
  await click(q('.modal [data-act="backfill"]'))
  ok(!!q('#bf-income'), '补录弹窗打开')
  q('#bf-income').value = '300'
  q('#bf-income').dispatchEvent(new window.Event('input', { bubbles: true }))
  await sleep(20)
  await click(q('#bf-save'), 50)
  ok(app().indexOf('未记账') < 0, '补录后不再标记未记账')
  ok(qa('.ledger-row').length === 2, '两轮都在账本里')

  console.log('10. 价目表弹窗')
  await click(q('#btn-reward-prices'))
  const inputs = qa('input[data-k]')
  ok(inputs.length >= 20, '价目表输入框 ' + inputs.length + ' 个')
  inputs[0].value = '777'
  await click(q('#rp-save'), 40)
  const activeId = JSON.parse(window.localStorage.getItem('mhxy_active'))
  const stored = window.localStorage.getItem('mhxy_reward_prices_' + activeId)
  ok(!!stored && stored.indexOf('7770000') >= 0, '价目表已写盘')

  console.log('11. 金价双向换算')
  await click(q('#btn-back'))
  const gw = q('#gold-wan'), gy = q('#gold-yuan')
  gw.value = '3000'; gw.dispatchEvent(new window.Event('input', { bubbles: true })); await sleep(20)
  ok(Math.abs(parseFloat(gy.value) - 202) < 0.5, '3000 万两 ≈ 202 元（' + gy.value + '）')
  gy.value = '101'; gy.dispatchEvent(new window.Event('input', { bubbles: true })); await sleep(20)
  ok(Math.abs(parseFloat(gw.value) - 1500) < 2, '101 元 ≈ 1500 万两（' + gw.value + '）')
  q('#gold-target').value = '5'
  await click(q('#btn-gold-save'), 40)
  ok(app().indexOf('1 元 ≈') >= 0, '比例保存后文案更新')
  ok(app().indexOf('目标时薪') >= 0, '首页有目标时薪入口')

  console.log('11b. 账本目标时薪提示')
  await click(q('.hub-card[data-nav="ledger"]'))
  ok(/达标|未达/.test(app()), '账本显示目标时薪达标情况')
  await click(q('#btn-back'))

  console.log('12. 人环：300 格与奖励页')
  await click(q('.hub-card[data-nav="chain"]'))
  ok(app().indexOf('人环助手') >= 0, '进入人环：' + app().slice(0, 40))
  await click(q('#btn-new-run'))
  ok(qa('#ring-grid .cell').length === 300, '300 个环格')
  await click(byText('.tab', '奖励'))
  ok(app().indexOf('奖励规则') >= 0, '奖励页渲染')
  const rewardRows = qa('.rw-table tbody tr').map(tr => tr.firstElementChild.textContent)
  ok(rewardRows.length > 0, '奖励等级表有 ' + rewardRows.length + ' 行')
  ok(rewardRows.every(t => !/^(1[0-9]9|20\d)$/.test(t.replace(/级.*$/, ''))), '等级都是整十：' + rewardRows.join('/'))

  console.log('12b. Esc 关闭弹窗')
  if (q('#btn-back')) await click(q('#btn-back'))
  await click(q('.hub-card[data-nav="ledger"]'))
  await click(q('#btn-reward-prices'))
  const beforeEsc = qa('.modal-overlay').length
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(40)
  ok(qa('.modal-overlay').length === beforeEsc - 1, 'Esc 关掉最上层弹窗')

  console.log('13. 导出文件名')
  let downloaded = null
  window.URL.createObjectURL = () => 'blob:fake'
  window.URL.revokeObjectURL = () => {}
  const origClick = window.HTMLAnchorElement.prototype.click
  window.HTMLAnchorElement.prototype.click = function () { downloaded = this.download }
  window.exportAccount()
  window.HTMLAnchorElement.prototype.click = origClick
  ok(!!downloaded && downloaded.indexOf('mhxy-getcash-box') === 0, '导出文件名 ' + downloaded)

  console.log('14. 运行期错误')
  const real = errors.filter(e => e.indexOf('Not implemented') < 0 && e.indexOf('Could not parse CSS') < 0)
  ok(real.length === 0, '无 JS 运行期错误' + (real.length ? '：' + real.slice(0, 3).join(' | ') : ''))

  console.log('')
  if (failures.length) {
    console.log('FAILED ' + failures.length + ' 项')
    failures.forEach(f => console.log('  - ' + f))
    process.exit(1)
  }
  console.log('ALL SMOKE CHECKS PASSED')
  process.exit(0)
})().catch(e => { console.error('SMOKE CRASH:', e); process.exit(1) })

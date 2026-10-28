// 公式与账本口径单测：node --test
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCore, extractScript, readHtml } = require('../scripts/extract-core')

const C = loadCore()
// vm 里造出来的对象来自另一个 realm，深比较前转成本域普通对象
const plain = v => JSON.parse(JSON.stringify(v))

test('脚本块语法可解析（不执行）', () => {
  const code = extractScript()
  assert.doesNotThrow(() => new Function(code))
})

test('EXP_TABLE 100 项、合计 751，满环经验 751', () => {
  assert.equal(C.EXP_TABLE.length, 100)
  assert.equal(C.EXP_TOTAL, 751)
  const full = Array.from({ length: 100 }, () => ({ t: 'find_npc' }))
  assert.equal(C.pExp(full), 751)
  const empty = Array.from({ length: 100 }, () => ({ t: null }))
  assert.equal(C.pExp(empty), 0)
})

test('书铁等级公式与边界', () => {
  assert.equal(C.pBookLevel(200, 175), 120)
  assert.equal(C.pBookLevel(222, 175), 150)
  assert.equal(C.pBookLevel(999, 175), 150) // 上限 150
  assert.equal(C.pBookLevel(0, 175), 80) // 保底 80
  assert.equal(C.pBookLevel(150, 155), 80)
  // 反解：lv175 拿 100 级书铁需 172 分
  assert.equal(100 + 130 - Math.floor(175 / 3), 172)
})

test('奖励档位：80 分走保底，150 走战魄档', () => {
  assert.equal(C.pGetTier(0, 175).label, '80书铁(保底)')
  assert.equal(C.pGetTier(200, 175).label, '120书铁')
  assert.equal(C.pGetTier(999, 175).label, '150书铁/战魄')
})

test('人环奖励区间一律落在 10 的倍数上', () => {
  for (let lv = 60; lv <= 175; lv++) {
    C.cBookLevels(lv).forEach(l => assert.equal(l % 10, 0, `lv=${lv} 产出非法等级 ${l}`))
  }
  assert.deepEqual(plain(C.cBookLevels(120)), [130, 120, 110])
  assert.deepEqual(plain(C.cBookLevels(95)), [100, 90])
  assert.deepEqual(plain(C.cBookLevels(156)), [150, 140, 130])
  assert.deepEqual(plain(C.cBookLevels(139)), [140, 130])
  assert.equal(C.cRewardRange(156).has150, true)
  assert.equal(C.cRewardRange(155).has150, false)
  assert.equal(C.cRewardRange(109).hasLingshi, false)
  assert.equal(C.cRewardRange(110).hasLingshi, true)
})

test('价格：显式 0 生效，缺省才回退默认价', () => {
  const defaults = { a: 100, b: 200 }
  assert.equal(C.getPrice({ a: 0 }, 'a', defaults), 0)
  assert.equal(C.getPrice({}, 'a', defaults), 100)
  assert.equal(C.getPrice({}, 'zzz', defaults), 0)
  assert.equal(C.getPrice(null, 'a', defaults), 100)
  assert.equal(C.ringCost({ t: 'a' }, { a: 7 }, defaults), 7)
  assert.equal(C.ringCost({ t: null }, {}, defaults), 0)
  assert.equal(C.totalCostOf([{ t: 'a' }, { t: 'b' }, { t: null }], { a: 1 }, defaults), 1 + 200)
})

test('宠环任务表带默认价，费用不再恒 0', () => {
  const equip80 = C.PT.find(t => t.id === 'equip80')
  assert.equal(equip80.cost, 450000)
  assert.equal(C.P_DEFAULT_PRICES.equip80, 450000)
  assert.equal(C.P_DEFAULT_PRICES.variant_specific, 6000000)
  const rings = Array.from({ length: 100 }, () => ({ t: 'equip80' }))
  assert.equal(C.totalCostOf(rings, {}, C.P_DEFAULT_PRICES), 450000 * 100)
})

test('奖励价目表估值', () => {
  const p = C.normalizeRewardPrices(null)
  assert.equal(C.rewardUnitPrice(p, { kind: 'book', level: 150 }), 50000000)
  assert.equal(C.rewardUnitPrice(p, { kind: 'iron', level: 120 }), 2400000)
  assert.equal(C.rewardUnitPrice(p, { kind: 'zhanpo' }), 80000000)
  assert.equal(C.rewardUnitPrice(p, { kind: 'lingshi_book', level: 140 }), 12000000)
  assert.equal(C.rewardUnitPrice(p, { kind: 'xiulian_guo' }), 500000)
  assert.equal(C.rewardUnitPrice(p, { kind: 'other', unitPrice: 12345 }), 12345)
  // 未配置的等级不给瞎估值
  assert.equal(C.rewardUnitPrice(p, { kind: 'book', level: 85 }), 0)
})

test('奖励文字解析', () => {
  assert.deepEqual(plain(C.parseRewardText('150级制造指南书-剑')), { kind: 'book', level: 150, subType: '剑', name: '150级制造指南书-剑' })
  assert.equal(C.parseRewardText('120级百炼精铁').kind, 'iron')
  assert.equal(C.parseRewardText('160级战魄').kind, 'zhanpo')
  assert.equal(C.parseRewardText('战魄').kind, 'zhanpo')
  assert.equal(C.parseRewardText('修炼果').kind, 'xiulian_guo')
  assert.equal(C.parseRewardText('200修炼点').kind, 'xiulian_200')
  assert.equal(C.parseRewardText('3级家具设计图').kind, 'furniture3')
  assert.equal(C.parseRewardText('120灵饰指南书').kind, 'lingshi_book')
  assert.equal(C.parseRewardText('140元灵晶石').kind, 'lingshi_stone')
  assert.equal(C.parseRewardText('随便什么').kind, 'other')
  assert.equal(C.parseRewardText(''), null)
})

test('收入估值：手改单价优先、数量默认 1', () => {
  const p = C.normalizeRewardPrices(null)
  const out = C.valueIncomeItems([{ kind: 'book', level: 150 }, { kind: 'iron', level: 120, unitPrice: 999, qty: 2 }], p)
  assert.equal(out[0].unitPrice, 50000000)
  assert.equal(out[0].qty, 1)
  assert.equal(out[1].unitPrice, 999)
  assert.equal(out[1].amount, 1998)
})

test('金币换算：默认 3000 万两 = 202 元', () => {
  const cfg = C.normalizeMoneyCfg(null)
  assert.equal(cfg.ratioWan, 3000)
  assert.equal(cfg.ratioYuan, 202)
  assert.equal(Math.round(C.wanToYuan(3000, cfg) * 100) / 100, 202)
  assert.equal(Math.round(C.yuanToWan(202, cfg)), 3000)
  assert.equal(C.formatAmount(100000000, cfg, 'wan'), '10000.0 万两')
  assert.equal(C.formatAmount(100000000, cfg, 'yuan'), '673.33 元')
  assert.equal(C.formatAmount(null, cfg, 'wan'), '—')
  // 自定义比例生效
  assert.equal(C.wanToYuan(6000, { ratioWan: 6000, ratioYuan: 100 }), 100)
})

test('有效工时：扣除暂停', () => {
  const base = { startedAt: 0, doneAt: 60 * 60 * 1000 }
  const t0 = 1000
  assert.equal(C.effectiveDurationMin({ startedAt: t0, doneAt: t0 + 60 * 60000 }), 60)
  assert.equal(C.effectiveDurationMin({ startedAt: t0, doneAt: t0 + 60 * 60000, pausedMs: 20 * 60000 }), 40)
  assert.equal(C.effectiveDurationMin({ startedAt: t0, doneAt: t0 }), null)
  // 仍在暂停中：当前暂停段也要扣
  assert.equal(C.effectiveDurationMin({ startedAt: t0, doneAt: t0 + 60 * 60000, pausedAt: t0 + 30 * 60000 }), 30)
})

test('单轮汇总：成本/收入/利润/ROI/时薪', () => {
  const start = 1700000000000
  const rings = [{ t: 'equip80' }, { t: 'food_drug' }]
  const s = C.summarizeRun({
    rings,
    prices: {},
    defaults: C.P_DEFAULT_PRICES,
    extraCost: 10000,
    incomeItems: [{ kind: 'book', level: 120 }],
    rewardPrices: C.normalizeRewardPrices(null),
    startedAt: start,
    doneAt: start + 60 * 60000,
    now: start + 60 * 60000
  })
  assert.equal(s.cost, 450000 + 20000 + 10000)
  assert.equal(s.income, 4000000)
  assert.equal(s.profit, 4000000 - 480000)
  assert.equal(Math.round(s.roi * 1000) / 1000, 8.333)
  assert.equal(s.durationMin, 60)
  assert.equal(Math.round(s.hourly), Math.round((4000000 - 480000) / 1))
})

test('单轮汇总：时长不足 5 分钟不给时薪', () => {
  const start = 1700000000000
  const s = C.summarizeRun({
    rings: [{ t: 'find_npc' }], prices: {}, defaults: C.P_DEFAULT_PRICES,
    incomeItems: [], rewardPrices: C.normalizeRewardPrices(null),
    startedAt: start, doneAt: start + 60000, now: start + 60000
  })
  assert.equal(s.durationMin, 1)
  assert.equal(s.hourly, null)
  assert.equal(s.roi, null) // 成本 0
})

test('周期过滤', () => {
  const now = new Date(2026, 9, 28, 12, 0, 0).getTime()
  const runs = [
    { doneAt: now - 3600 * 1000 }, // 今天
    { doneAt: now - 3 * 86400000 }, // 3 天前
    { doneAt: now - 20 * 86400000 }, // 20 天前
    { doneAt: now - 90 * 86400000 } // 90 天前
  ]
  assert.equal(C.filterRunsByPeriod(runs, 'today', now).length, 1)
  assert.equal(C.filterRunsByPeriod(runs, '7d', now).length, 2)
  assert.equal(C.filterRunsByPeriod(runs, '30d', now).length, 3)
  assert.equal(C.filterRunsByPeriod(runs, 'all', now).length, 4)
  assert.equal(C.filterRunsByPeriod(runs, 'month', new Date(2026, 9, 28).getTime()).length, 3)
})

test('多轮汇总：只统计已记账，未记账单独计数', () => {
  const booked = {
    income: 4000000, incomeItems: [], profit: 3000000, durationMin: 60, cost: 1000000,
    doneAt: Date.now()
  }
  const unbooked = { totalCost: 500000, doneAt: Date.now() }
  const agg = C.aggregateRuns([booked, unbooked])
  assert.equal(agg.count, 1)
  assert.equal(agg.unbooked, 1)
  assert.equal(agg.totalCost, 1000000)
  assert.equal(agg.totalIncome, 4000000)
  assert.equal(agg.totalProfit, 3000000)
  assert.equal(agg.totalHours, 1)
  assert.equal(agg.hourly, 3000000)
  assert.equal(agg.roi, 4)
  assert.equal(agg.winRate, 1)
  assert.equal(C.isBooked(booked), true)
  assert.equal(C.isBooked(unbooked), false)
})

test('成本结构聚合', () => {
  const items = C.buildCostItems([{ t: 'equip80' }, { t: 'equip80' }, { t: 'find_npc' }], {}, C.P_DEFAULT_PRICES)
  const equip = items.find(x => x.tid === 'equip80')
  assert.equal(equip.qty, 2)
  assert.equal(equip.unitPrice, 450000)
  assert.equal(equip.amount, 900000)
  assert.equal(items.find(x => x.tid === 'find_npc').amount, 0)
})

test('页面骨架自检：核心区块与入口都在', () => {
  const html = readHtml()
  ;[
    '/* @core:start */', '/* @core:end */',
    'function renderLedger', 'function renderHub', 'function showPRewardModal',
    'function showCFinalModal', 'function showRewardPricesModal', 'function showRewardPricesModal',
    'function showLedgerDetail', 'function showBackfillModal',
    'function exportAccount', 'function importAccount',
    'function undoLast', 'function pushUndo',
    'id="gold-wan"', 'id="btn-export-all"', '@media(max-width:900px)'
  ].forEach(k => assert.ok(html.indexOf(k) >= 0, '缺：' + k))
  // 只应有一份 EXP_TABLE 定义、一份公式实现
  assert.equal((html.match(/const EXP_TABLE=/g) || []).length, 1)
  ;['pBookLevel', 'pGetTier', 'pExp', 'cRewardRange', 'cBookLevels'].forEach(fn => {
    assert.equal((html.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length, 1, fn + ' 重复定义')
  })
})

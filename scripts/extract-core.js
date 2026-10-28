// 从单文件 index.html 的 @core 区间抽出纯函数，供 Node 单测直接调用。
// 用法：const { core, scriptSource } = require('./extract-core')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const HTML = path.join(__dirname, '..', 'index.html')

function readHtml() {
  return fs.readFileSync(HTML, 'utf8')
}

function extractCore(html) {
  const src = html || readHtml()
  const start = src.indexOf('/* @core:start */')
  const end = src.indexOf('/* @core:end */')
  if (start < 0 || end < 0) throw new Error('找不到 @core 标记，index.html 结构可能被改动')
  return src.slice(start + '/* @core:start */'.length, end)
}

const EXPORT_NAMES = [
  'PT', 'CT', 'BOOK_WEAPONS', 'BOOK_ARMORS', 'BOOK_LVLS', 'P_DEFAULT_PRICES', 'C_DEFAULT_PRICES',
  'REWARD_TIERS', 'EXP_TABLE', 'EXP_TOTAL', 'DEFAULT_REWARD_PRICES', 'DEFAULT_MONEY_CFG',
  'toAmount', 'getPrice', 'ringCost', 'totalCostOf',
  'pBookLevel', 'pGetTier', 'pExp', 'cRewardRange', 'cBookLevels',
  'normalizeRewardPrices', 'rewardUnitPrice', 'parseRewardText', 'valueIncomeItems',
  'normalizeMoneyCfg', 'wanToYuan', 'yuanToWan', 'ratioText', 'fmtWan', 'formatAmount', 'formatHourly',
  'buildCostItems', 'isBooked', 'effectiveDurationMin', 'summarizeRun',
  'periodStart', 'runTime', 'filterRunsByPeriod', 'runCost', 'aggregateRuns'
]

function loadCore(html) {
  const code = extractCore(html) + '\n;module.exports={' + EXPORT_NAMES.join(',') + '};'
  const sandbox = { module: { exports: {} }, console }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 'core.js' })
  return sandbox.module.exports
}

// 整段 <script> 源码（用于语法自检）
function extractScript(html) {
  const src = html || readHtml()
  const m = src.match(/<script>\s*([\s\S]*?)<\/script>/)
  if (!m) throw new Error('找不到主 <script> 块')
  return m[1]
}

module.exports = { readHtml, extractCore, extractScript, loadCore, EXPORT_NAMES, HTML }

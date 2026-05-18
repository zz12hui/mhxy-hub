# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

梦幻西游跑环大全 — 单页 Web 应用，聚合宠环助手（100 环）和跑环助手（300 环）两个工具。纯静态 HTML + CSS + Vanilla JS，零依赖。

### 功能模块

- **Hub 首页** — 工具导航入口 + 知识库入口
- **宠环助手** — 记录/预测/控分/历史/统计（5 个标签页）
- **跑环助手** — 记录/奖励/历史/统计（4 个标签页）
- **操作指南** — 分步引导弹窗（Hub/宠环/跑环各有独立内容，支持键盘 ← → 导航）
- **知识库** — 4 分类 FAQ（宠环技巧、跑环攻略、物价参考、常见问题），可折叠手风琴展开
- **首次访问欢迎页** — localStorage 标记，仅显示一次

## 运行方式

从父目录 `local/dev/` 启动服务：
```bash
cd "/Volumes/data 1/local/dev"
python3 -m http.server 8080
```
然后访问 `http://localhost:8080/mhxy-hub/`

## 设计风格

参考 DeepSeek 首页：深色背景 + 径向渐变光斑 + 玻璃卡片 + 悬停发光效果。CSS 变量管理主题色。

## 架构

单文件 `index.html`（~1145 行），结构如下：

```
<script> 内 JS 结构：
  CONSTANTS          — PT/CT 任务类型、书铁等级表、奖励档位、经验表
  DATA LAYER         — localStorage 读写、多角色数据隔离（ukey/ukey3）、旧数据迁移
  SHARED HELPERS     — toast、日期格式化、费用计算、角色 CRUD、积分公式
  PET OPERATIONS     — pSetRing/pQuickFill/pStartNew/pComplete
  CHAIN OPERATIONS   — cSetRing/cQuickFill/cStartNew/cComplete/段检查/奖励区间
  RENDERING          — renderAll → renderHub/renderPet/renderChain + 子标签页
  MODALS             — 宠环结算/链段奖励/任务链结算/统计报告
  EDIT/BATCH MODALS  — 单环编辑/批量填充（Canvas 滑块）
  USER/PRICES MODALS — 角色管理/价格设置
  KNOWLEDGE BASE     — showKnowledgeBase（4 分类 FAQ 手风琴）
  GUIDE MODAL        — showGuideModal（分步引导，Hub/宠环/跑环三套内容）
  WELCOME            — showWelcome（首次访问覆盖层）
  EVENTS             — bindEvents（全局事件代理）
  CLOCK & CHART      — 实时时钟 + Canvas 分数趋势图
  INIT               — DOMContentLoaded 入口
```

### 导航结构

- Hub 首页 → 点击卡片进入 宠环/跑环
- 宠环/跑环标题栏 ← 返回按钮回到 Hub
- 标题栏按钮：角色切换、等级设置、💰价格、📖帮助、结算/放弃
- 底部固定按钮：📚 知识库（Hub 页）

### 数据流

1. `init()` → `renderAll()` → 按 `vw` 状态渲染对应视图 → `bindEvents()`
2. 所有数据通过 `localStorage` 按角色 ID 隔离存储（key 前缀 `mhxy_` / `mhxy3_`）
3. 渲染时直接计算模板字符串（无框架），Canvas 图表需在标签页切换后延迟 draw
4. 弹窗通过 `document.createElement('div')` + `document.body.appendChild(overlay)` 动态创建
5. 关闭弹窗：点击遮罩背景（`e.target === overlay`）或关闭按钮 → `overlay.remove()`

### Storage Key 清单

| Key | 用途 |
|-----|------|
| `mhxy_users` / `mhxy_active` | 用户列表和当前活跃角色 |
| `mhxy_{cfg,cur,runs,prices}_{uid}` | 宠环数据 |
| `mhxy3_{cfg,cur,runs,prices}_{uid}` | 跑环数据 |
| `mhxy_welcome_seen` | 首次访问标记 |

### 添加新弹窗的注意事项

弹窗必须包含以下调用才能显示：
```javascript
document.body.appendChild(overlay);  // 关键！否则弹窗不显示
```

### 移动端适配

两个响应式断点：768px（平板）和 400px（小屏手机）。`pointer:coarse` 增大触摸目标。小屏下帮助按钮和时钟隐藏。

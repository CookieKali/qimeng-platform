# 企盟项目 · AI 分步开发指南（含提示词）

> 适用场景：用 Cursor / 其他 AI **分多次**完成项目，避免一次做不完或前端假数据。  
> 配套总览：[开发推进计划.md](./开发推进计划.md)

---

## 一、推荐工作方式（给人看的）

```
每一步 = 只发一条「步骤提示词」给 AI
      → AI 只改本步范围
      → 你按「验收清单」自测（接口 + 数据库 + 小程序编译）
      → 通过后再发下一条
```

| 顺序 | 做什么 | 为什么 |
|------|--------|--------|
| 1 | **数据库**（表/字段/关系） | 数据真相源，防止 AI 在页面里写死数组 |
| 2 | **后端 API**（读写真实表） | 小程序只调 API |
| 3 | **小程序页面** | 禁止 `utils/data.js` 造用户列表 |
| 4 | **联调验收** | `curl` + 两个测试账号 + 查 SQLite |

**项目路径**：仓库根目录 `qimeng-platform/`  
**后端**：`backend/`，本地库 `backend/qimeng.db`  
**小程序**：`qimeng-miniprogram/`  
**启动**：`./scripts/start_backend.sh`  
**文档索引**：[docs/README.md](./README.md)

---

## 二、每条提示词都要带的「全局约束」（可复制到每次对话开头）

把下面框 **和具体步骤提示词一起** 发给 AI：

```text
【企盟项目 - 全局约束】
1. 仓库路径：当前 qimeng-platform 根目录
2. 技术栈：FastAPI + SQLAlchemy + SQLite；微信小程序原生（非 uni-app）
3. 禁止：前端写死业务数据（禁止用 mock 用户/任务列表替代 API）；禁止新建 utils/data.js 假数据；禁止 TODO 占位却不接 API
4. 必须：改库先改 backend/app/models/；接口走 routers/；小程序只通过 qimeng-miniprogram/utils/api.js 请求
5. 必须：本步只做提示词里列出的内容，不要顺带重构无关文件
6. 必须：完成后给出「改了哪些文件」「如何验收（curl 或操作步骤）」「sqlite 查哪张表」
7. 演示账号：18800000001 / 18800000002，密码 123456；后端启动 ./scripts/start_backend.sh
8. 用中文回复
```

---

## 三、步骤总览（按顺序执行，不要跳）

| 步号 | 名称 | 类型 | 依赖 | 预估 |
|------|------|------|------|------|
| S01 | 数据库现状梳理与缺口表 | 文档/库 | - | 0.5h |
| S02 | 邀请关系库表与注册写入 | DB+API | S01 | 2h |
| S03 | 贡献积分：表规则 + 发放服务 | DB+API | S01 | 3h |
| S04 | 贡献积分：注册/报名触发埋点 | API | S03 | 2h |
| S05 | 分润：渠道表写入 + 演示记账 | API | S02 | 3h |
| S06 | 分润 API 补全（确认/筛选） | API | S05 | 2h |
| S07 | 小程序 api.js 封装新接口 | 小程序 | S04,S06 | 1h |
| S08 | 阶段0：邀请注册 + 信用/充值接 API | 小程序 | S02,S07 | 4h |
| S09 | 阶段0：活动发起 + 我的预约列表 | 小程序 | S07 | 3h |
| S10 | 新建「贡献积分」页面 | 小程序 | S04,S07 | 3h |
| S11 | 新建「分润」Tab + 看板/明细 | 小程序 | S06,S07 | 5h |
| S12 | 任务详情 + 报名列表（发布方只读） | 小程序 | S07 | 3h |
| S13 | 任务闭环：交付/验收/申诉 UI | 小程序+API | S12 | 6h |
| S14 | 空间站详情 + 股东列表页 | 小程序 | S07 | 4h |
| S15 | 股东权益页 + 结算记录 | 小程序 | S06,S14 | 3h |
| S16 | AI 推荐匹配入口 | 小程序 | S07 | 2h |
| S17 | 全链路回归 + 修 bug | 联调 | S08-S16 | 4h |
| S18 | 更新使用说明与接口文档说明 | 文档 | S17 | 1h |

> 支付/微信登录/管理后台单独开 **S19+**，等 S01-S18 完成再立项。

---

## 四、分步提示词（复制即用）

---

### S01 · 数据库现状梳理与缺口表

**发给 AI：**

```text
【S01 仅做数据库梳理，不改业务逻辑代码】

请阅读 /Users/huqihan/Desktop/qimeng-platform/backend/app/models/ 下所有模型，
对照 docs/开发推进计划.md 里 V2.1 需要的表（users, cards, friend_*, tasks, activities, spaces, stations,
station_shareholders, contribution_points, profit_sharing_records, channel_relations 等）。

输出一份 Markdown 表格写到 docs/数据库说明.md，包含：
- 表名、用途、主要字段、与谁外键关联
- 哪些能力「表已有但缺业务触发」
- 本阶段建议新增/修改的字段（如有），先只写在文档里，本步不要改表

不要改小程序。不要写假数据脚本。
```

**你验收**：打开 `docs/数据库说明.md`，表是否齐全、能看懂。

---

### S02 · 邀请关系：注册写入 inviter_id

**发给 AI：**

```text
【S02 邀请注册 - 仅后端 auth + 必要字段】

在现有注册接口上实现：
1. 注册请求可带 invite_code（可选）
2. 根据 invite_code 找到邀请人 user，写入新用户的 inviter_id
3. 在 channel_relations 表写入一条 referrer→referee 关系（relation_type=recommend）
4. 若贡献积分服务已存在则调用；否则本步在文档注明「S04 再触发 +50」

修改范围：backend/app/routers/auth.py、相关 model，必要时 seed 不动旧数据逻辑。
提供 curl 验收：先查邀请人 invite_code，再注册新手机号，再 sqlite3 查 users.inviter_id 和 channel_relations。

禁止改小程序。禁止前端假数据。
```

**你验收**：

```bash
sqlite3 backend/qimeng.db "SELECT id, phone, inviter_id, invite_code FROM users ORDER BY id DESC LIMIT 5;"
sqlite3 backend/qimeng.db "SELECT * FROM channel_relations ORDER BY id DESC LIMIT 5;"
```

---

### S03 · 贡献积分：统一发放服务

**发给 AI：**

```text
【S03 贡献积分服务层 - 仅后端】

新增 backend/app/services/contribution.py（或同等模块），提供函数：
  grant_contribution(db, user_id, source_type, amount, note, related_entity=None)
要求：
- 写入 contribution_points 流水
- 同步更新 users.contribution_balance
- 同一 (user_id, source_type, related_entity) 防重复发放（避免 AI 刷接口重复加分）

在 backend/app/routers/credit.py 的 GET /contribution 保持可用。

写 1 个仅开发环境用的内部测试路由或 pytest 二选一（不要污染生产逻辑）。

本步不要改小程序。不要写前端 mock。
验收：curl 登录后手动触发一次 grant（或跑测试），查 contribution_points 表有新行。
```

**你验收**：

```bash
sqlite3 backend/qimeng.db "SELECT * FROM contribution_points ORDER BY id DESC LIMIT 5;"
```

---

### S04 · 贡献积分：行为埋点（注册/活动报名/任务验收）

**发给 AI：**

```text
【S04 贡献积分自动触发 - 仅后端埋点】

在以下成功逻辑后调用 S03 的 grant_contribution（不要重复发放）：
1. 注册成功且存在 inviter_id → 邀请人 +50（source_type=invite_register）
2. 活动报名成功 → 报名人 +10（source_type=activity_signup）
3. 任务验收 review 成功 → 承接方 +20（source_type=task_complete）

修改 routers：auth.py、activities.py、tasks.py。
每个触发点写清 related_entity（如 activity_id / task_id）。

不要改小程序 UI。完成后给 curl 或操作步骤证明三种场景至少各能造一条流水。
```

**你验收**：走一遍注册（带邀请码）、活动报名、任务验收（若暂无 UI 用 curl 调 API）。

---

### S05 · 分润：渠道关系 + 演示记账

**发给 AI：**

```text
【S05 分润记账 - 仅后端】

新增 backend/app/services/profit.py：
- create_profit_record(db, user_id, income_source, source_amount, percentage, note)
  写入 profit_sharing_records，status=pending，计算 amount

在以下事件触发演示分润（比例按设计文档可先写死常量）：
1. 被邀请人注册：邀请人 分润 0 或 symbolic（可选）
2. 活动报名：渠道邀请人 报名费*15%（若无报名费则按固定演示分）
3. 任务验收兑付：邀请关系存在时 任务金额*5%

依赖 channel_relations 找 referrer。
不要实现微信支付。不要改小程序。

验收：sqlite3 查 profit_sharing_records；curl GET /api/v1/profit/dashboard 有数据。
```

---

### S06 · 分润 API：确认与状态筛选

**发给 AI：**

```text
【S06 分润 API 完善】

在 backend/app/routers/profit.py 增加：
- POST /api/v1/profit/records/{id}/confirm  被分润用户确认，status: pending → confirmed
- 可选 POST /reject 或 cancel
- dashboard 返回 today/week/month 简单汇总（基于 created_at）

确保列表接口支持 status、source 筛选（已有则补强）。

不要改小程序。给出完整 curl 示例。
```

---

### S07 · 小程序 api.js 统一封装

**发给 AI：**

```text
【S07 仅改 qimeng-miniprogram/utils/api.js】

为以下后端接口增加方法（命名清晰，与现有 api.auth / api.friends 风格一致）：
- credit.recharge, credit.contribution
- profit.dashboard, profit.records, profit.referrals, profit.confirm
- reputation.get（GET /api/v1/reputation/）
- activities.create（POST /api/activities/）
- spaces.myBookings（GET /api/spaces/bookings/my）
- tasks.detail(id), tasks.my 已有则检查

不要新建页面。不要写 mock 数据。不要改 pages 下 wxml。
```

---

### S08 · 阶段0小程序：邀请 + 信用 + 模拟充值

**发给 AI：**

```text
【S08 小程序阶段0 - 登录/我的】

1. 注册页增加邀请码输入，提交时传给 api.auth.register
2. 登录页邀请文案保持，无需假 API 地址
3. profile 钱包「充值」调用 api.credit.recharge（演示金额如 1000），成功后刷新余额
4. profile 信用子页调用 api.reputation.get 展示 records，禁止写死分数数组

只改：pages/login/*, pages/profile/profile.js 及对应 wxml（最小改动）。
数据必须来自 API。完成后给操作步骤验收。
```

---

### S09 · 阶段0小程序：活动发起 + 预约记录

**发给 AI：**

```text
【S09 小程序 - 活动与空间】

1. activity 页增加「发起活动」入口与表单弹窗，调用 api.activities.create
2. spaces 预约成功后，在我的或空间页增加「我的预约」列表，调用 api.spaces.myBookings

不要改后端除非接口缺字段。禁止列表写死 MOCK_ACTIVITIES。
验收：编译小程序，能发起活动且在 backend/qimeng.db 的 activities 表看到新记录。
```

---

### S10 · 新建贡献积分页面

**发给 AI：**

```text
【S10 新建贡献积分中心】

新建页面 pages/contribution/（或在 profile 内嵌入口跳转）：
- 展示 contribution_balance、流水列表（api.credit.contribution）
- 说明各 source_type 中文含义
- 在 app.json 注册页面；profile 钱包或信用区增加入口

样式复用 app.wxss，不要新造一套颜色体系。
禁止假流水。空状态提示「暂无记录」即可。
```

---

### S11 · 新建分润 Tab（第 6 个 Tab）

**发给 AI：**

```text
【S11 分润 Tab - 小程序】

1. app.json tabBar 增加「分润」页 pages/profit/profit
2. custom-tab-bar 增加第 6 项，调整 pageBottom（utils/layout.js 如有）
3. 页面三块：概览（dashboard）、明细列表（records）、引荐列表（referrals）
4. 明细 pending 项可点「确认」调 profit.confirm

数据全部 api.js。禁止写死分润数字。
验收：18800000001 登录能看到接口返回的真实 pending/总额。
```

---

### S12 · 任务详情 + 发布方报名列表

**发给 AI：**

```text
【S12 任务详情页】

tasks 页：点击任务进入详情（新建子页面或弹窗二选一，推荐独立页 pages/task-detail/）
- 展示 api.tasks.detail 字段
- 若当前用户是 host：展示报名人列表（来自 detail.participants），先只读
- 若非 host 且未报名：显示报名按钮 join

不要实现验收表单（留给 S13）。不要 mock 任务内容。
```

---

### S13 · 任务闭环 UI（交付/验收/申诉）

**发给 AI：**

```text
【S13 任务全生命周期 - 对接已有 API】

在任务详情/我的任务中接入：
- 承接方：submit（交付说明）
- 发布方：accept 录用、review 四维评分验收
- 任一方：appeal

状态展示与后端 TaskParticipant.status 一致。
验收完整故事：甲发任务→乙报名→甲录用→乙提交→甲验收→查 credit_transactions 有 task_reward。

本步可小幅改后端若接口缺字段，优先改小程序。
```

---

### S14 · 空间站详情页

**发给 AI：**

```text
【S14 空间站详情】

新建 pages/station/detail：
- 调用 GET /api/spaces/stations/{id}（若无路由则在 spaces router 暴露）
- 展示站名、地址、股东列表、旗下空间列表
- 从 spaces 列表增加入口跳转

五层收入、四类产品先用静态说明区块（文案来自设计文档），数据股东列表必须 API。
```

---

### S15 · 我的股东权益 + 结算记录

**发给 AI：**

```text
【S15 股东权益】

profile 或独立页调用：
- GET /api/v1/profit/shareholders/me
- 点击某站查看 GET /api/v1/profit/stations/{id}/settlements

展示十项权益说明（rights_mask 位图转中文，可写死映射表在 js 里仅做展示文案，权益数据仍来自 API）。
```

---

### S16 · AI 匹配推荐

**发给 AI：**

```text
【S16 通讯录智能推荐】

contacts 页增加按钮「智能推荐」，调用 POST /api/v1/ai/match，展示用户列表与 score，
可点击进已有 showMember 流程。

禁止本地生成推荐列表。空结果要有提示。
```

---

### S17 · 全链路回归

**发给 AI：**

```text
【S17 仅修 bug，不加新功能】

按 docs/开发推进计划.md 阶段0验收标准 + 甲乙好友流程跑一遍。
修复发现的问题，范围尽量小。
输出回归检查表（打勾项）。
不要加支付、不要加上链、不要重构目录结构。
```

---

### S18 · 文档同步

**发给 AI：**

```text
【S18 仅更新文档】

更新 qimeng-miniprogram/使用说明.md 和 docs/开发推进计划.md 的 checkbox，
补充：测试账号、分润 Tab、贡献积分入口、验收路径。
不要改代码逻辑。
```

---

## 五、你如何防止 AI「造假」（检查清单）

每步完成后 **你自己** 做这 5 件事（不用信 AI 口头说「已完成」）：

| # | 检查 |
|---|------|
| 1 | `git diff` 看是否出现大段 `const MOCK_`、`utils/data.js`、写死 15 人数组 |
| 2 | 后端改动是否对应 `models` / `routers`，小程序是否只改 `api.js` + 页面 |
| 3 | `sqlite3 backend/qimeng.db "SELECT ..."` 是否有新行 |
| 4 | `curl` 带 token 调接口，返回是否 `code:0` 且 `data` 合理 |
| 5 | 微信开发者工具 **编译** 后手动点一遍 |

**两个铁律**：

- 列表页为空 → 先查后端有没有数据，不要让 AI 在前端 `if (!x) x = [假数据]`
- AI 说「演示用先 mock」→ 要求改成调 API 或明确拒绝该步合并

---

## 六、单步对话模板（你每次开新对话可粘贴）

```text
我正在做企盟项目分步开发，当前步骤：【填 S0X 名称】。

请先阅读：
- docs/AI分步开发指南.md 中 S0X 的提示词
- docs/开发推进计划.md 相关章节

然后严格执行 S0X，遵守文内「全局约束」。

上一步已完成：【简述，如 S03 贡献积分服务已存在】
本步不要做：【如不要改小程序 / 不要加支付】

完成后按格式回复：
1. 改动文件列表
2. 验收命令或操作步骤
3. 需要我确认的决策（如有）
```

---

## 七、与「开发推进计划」的关系

| 文档 | 用途 |
|------|------|
| [开发推进计划.md](./开发推进计划.md) | 给老板/客服看的阶段目标与周期 |
| **本文件** | 给你每天发给 AI 的操作手册与提示词 |

建议：**对外讲计划用前者，对内干活用后者（S01→S18）**。

---

## 八、下一步你该做什么

1. **今天**：把「全局约束」+ **S01** 发给 AI，生成 `docs/数据库说明.md`  
2. **通过后**：按表从 **S02** 开始，一天 1～2 步，不要跳步  
3. **每步通过再开新对话**，避免上下文过长导致 AI 遗忘约束  

若某步 AI 改乱了，新开对话发：

```text
回滚思路：只保留【文件列表】相关改动，其余恢复；然后仅重做 S0X，遵守全局约束。
```

---

*文档版本：2026-05-20 · 与仓库代码同步维护*

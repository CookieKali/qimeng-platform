# 企盟 Qimeng Platform

企盟资源变现平台：**FastAPI 后端** + **微信小程序**。业务数据来自 SQLite/PostgreSQL 与后端 API，非前端假数据。

## 功能概览

| Tab / 模块 | 能力 |
|------------|------|
| 通讯录 | 成员筛选、好友申请、私信、搜索、**活动圈**、名片分享 |
| 任务&活动 | 任务广场/承接/发布、交付验收申诉；活动报名签到；发布入口 |
| 分润 | 看板、分润流水确认、引荐追踪、贡献积分入口 |
| 我的 | 档案/信用/钱包/记录详情；空间站预约；合伙人升级 |
| 子页 | 贡献积分、收件箱、空间站枢纽、超管预约审核等 |

## 项目结构

```
qimeng-platform/
├── backend/              FastAPI、模型、路由、种子数据
├── qimeng-miniprogram/   微信小程序
├── scripts/              启动/停止/同步真机 API 地址
├── docs/                 推进计划、上线指南、AI 分步开发
├── .env.example          后端环境变量模板 → 复制为 backend/.env
└── README.md
```

## 演示账号

| 用途 | 手机号 | 密码 |
|------|--------|------|
| 超级管理员 | `19900000000` | `123456` |
| 好友联调甲 | `18800000001` | `123456` |
| 好友联调乙 | `18800000002` | `123456` |

注册可用邀请码 `QM-2026-001` 或 `QM-DEMO-001`（以种子数据为准）。  
甲/乙 **默认不是好友**，适合测好友申请与活动圈。

## 快速启动

```bash
cd qimeng-platform
./scripts/start_backend.sh
```

- API：http://127.0.0.1:8000  
- 文档：http://127.0.0.1:8000/docs  

微信小程序：用开发者工具打开 **`qimeng-miniprogram/`**（不要打开仓库根目录），详情 → 本地设置 → 勾选 **不校验合法域名**，点击 **编译**。  
更细说明见 [qimeng-miniprogram/使用说明.md](qimeng-miniprogram/使用说明.md)。

停止后端：`./scripts/stop_all.sh`

## 脚本

| 脚本 | 说明 |
|------|------|
| `start_backend.sh` | venv、依赖、启动 FastAPI |
| `start_all.sh` | 启动后端并打印小程序指引 |
| `stop_all.sh` / `stop_backend.sh` | 停止进程 |
| `sync_api_host.sh` | 真机调试时写入 Mac 局域网 IP 到 `config.local.js` |
| `backend/scripts/smoke_features.py` | 接口冒烟（活动圈、搜索、站内信等） |

## 配置

- 本地库：`backend/qimeng.db`（首次启动自动种子）
- 小程序 API：`qimeng-miniprogram/config.js`（模拟器 localhost；真机见 `config.local.js`）
- 生产/支付：复制 `.env.example` → `backend/.env`，参阅 [docs/上线与微信支付指南.md](docs/上线与微信支付指南.md)、[backend/DEPLOY.md](backend/DEPLOY.md)

## 文档索引

| 文档 | 说明 |
|------|------|
| **[docs/迭代交付说明-2026-06.md](docs/迭代交付说明-2026-06.md)** | **交付汇报**：体验改动思路、进度、给老板的 3 分钟话术 |
| [qimeng-miniprogram/使用说明.md](qimeng-miniprogram/使用说明.md) | 开发者工具、真机、联调步骤 |
| [docs/开发推进计划.md](docs/开发推进计划.md) | 阶段规划与验收 |
| [docs/上线与微信支付指南.md](docs/上线与微信支付指南.md) | 生产部署、微信商户、支付流程 |
| [docs/AI分步开发指南.md](docs/AI分步开发指南.md) | 分步提示词（给 AI 协作用） |
| [backend/DEPLOY.md](backend/DEPLOY.md) | 后端生产环境变量摘要 |

## 测试

```bash
cd backend && ../.venv/bin/pytest tests/ -q
../.venv/bin/python scripts/smoke_features.py
```

## 版本说明

当前为 **V2.1 演示/预上线** 基线：主业务闭环可演示；**微信真实支付 V3** 为骨架（需配置商户号后补全），生产请使用 PostgreSQL 并关闭 mock 支付。

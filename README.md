# 企盟 Qimeng Platform

企盟资源变现演示平台：**FastAPI 后端** + **微信小程序**客户端，含演示数据种子与本地启动脚本。

## 项目结构

- `backend/`：FastAPI 后端，13 个业务模块、SQLite、种子数据
- `qimeng-miniprogram/`：微信小程序（通讯录、任务、活动、空间、我的）
- `scripts/`：启动 / 停止脚本
- `docs/`：项目文档（[开发推进计划](docs/开发推进计划.md)、[AI分步开发指南](docs/AI分步开发指南.md)）

## 演示账号

- 手机号：`123456`
- 密码：`123456`

（数据来自后端 API / SQLite，非本地假数据。注册可用邀请码 `QM-2026-001` 或 `QM-DEMO-001`。）

## 本地启动

### 1. 启动后端

```bash
cd /Users/huqihan/Desktop/qimeng-platform
./scripts/start_all.sh
```

或仅启动后端：

```bash
./scripts/start_backend.sh
```

访问：

- 后端：http://127.0.0.1:8000
- 接口文档：http://127.0.0.1:8000/docs

### 2. 运行微信小程序

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目目录：`qimeng-miniprogram/`
3. 详情 → 本地设置 → 勾选 **不校验合法域名**
4. 使用演示账号登录

停止后端：

```bash
./scripts/stop_all.sh
```

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `start_backend.sh` | 创建 venv、安装依赖、启动 FastAPI |
| `start_all.sh` | 启动后端并打印小程序指引 |
| `stop_all.sh` | 停止后台进程 |

## 手动启动后端

```bash
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 说明

- 数据库默认：`backend/qimeng.db`（首次启动自动种子数据）
- 小程序 API 地址：`qimeng-miniprogram/utils/api.js` 中的 `BASE_URL`
- 适合本地演示、原型验收与后续迭代

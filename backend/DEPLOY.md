# 企盟后端生产部署环境变量

生产环境请通过进程管理器、systemd、Docker 或云平台注入以下变量，**不要**依赖代码内默认值。

## 必填

| 变量 | 说明 | 示例 |
|------|------|------|
| `APP_ENV` | 运行环境，生产必须为 `prod` | `prod` |
| `SECRET_KEY` | JWT 签名密钥，须足够随机且保密；`APP_ENV=prod` 时未配置将拒绝启动 | 使用 `openssl rand -hex 32` 生成 |
| `DATABASE_URL` | 数据库连接串 | `postgresql://user:pass@host:5432/qimeng` |

SQLite 仅建议本地开发：

```bash
DATABASE_URL=sqlite:///./qimeng.db
```

## 强烈建议

| 变量 | 说明 | 示例 |
|------|------|------|
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔；生产勿使用 `*` | `https://your-domain.com,https://www.your-domain.com` |

## 可选

| 变量 | 说明 | 默认 |
|------|------|------|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 访问令牌有效期（分钟） | `10080`（7 天） |

## 启动前检查

1. `APP_ENV=prod` 且已设置独立 `SECRET_KEY`
2. `CORS_ORIGINS` 仅包含实际小程序/H5 域名
3. 生产使用 PostgreSQL/MySQL 等持久化数据库，勿用开发用 SQLite 文件
4. 关闭或限制 `/docs`、`/redoc` 公网暴露（可在反向代理层拦截）

## 示例（systemd / shell）

```bash
export APP_ENV=prod
export SECRET_KEY='your-long-random-secret'
export DATABASE_URL='postgresql://qimeng:password@127.0.0.1:5432/qimeng'
export CORS_ORIGINS='https://your-domain.com'
```

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

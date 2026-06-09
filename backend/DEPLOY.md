# 企盟后端 · 生产部署

完整上线步骤（微信支付、小程序域名、检查清单）见：**[docs/上线与微信支付指南.md](../docs/上线与微信支付指南.md)**。

环境变量模板：**[../.env.example](../.env.example)** → 复制为 `backend/.env`。

## 必填

| 变量 | 说明 |
|------|------|
| `APP_ENV` | 生产为 `prod` |
| `SECRET_KEY` | JWT 密钥，`openssl rand -hex 32`；`prod` 未配置将拒绝启动 |
| `DATABASE_URL` | 推荐 `postgresql://...`，勿用 SQLite |

## 支付（上线会费）

| 变量 | 说明 |
|------|------|
| `PAYMENT_MODE` | 生产：`wechat` |
| `ENABLE_MOCK_PAY` | 生产：`false` |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 小程序与 openid |
| `WECHAT_MCH_ID` / `WECHAT_API_V3_KEY` / `WECHAT_MCH_PRIVATE_KEY_PATH` | 商户支付 |
| `WECHAT_NOTIFY_URL` | 公网 HTTPS 回调 |

## 建议

| 变量 | 说明 |
|------|------|
| `CORS_ORIGINS` | 逗号分隔，勿用 `*` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 默认 10080 |

## 启动示例

```bash
export APP_ENV=prod
export SECRET_KEY='…'
export DATABASE_URL='postgresql://…'
export CORS_ORIGINS='https://your-api.example.com'
export PAYMENT_MODE=wechat
export ENABLE_MOCK_PAY=false

cd backend
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

生产建议在反向代理层限制公网访问 `/docs`、`/redoc`。

#!/bin/bash
# 企盟平台 - 一键上传到 Gitee
# 使用方法：在终端运行 bash upload_to_gitee.sh

TOKEN="10b8e7c1d4ca3c83df4af5d46018ba57"
USERNAME="Cookie"
REPO="qimeng-platform"

echo "========================================"
echo "  企盟平台 → Gitee 上传脚本"
echo "========================================"

# 1. 先通过 API 创建 Gitee 仓库
echo ""
echo "📦 第一步：在 Gitee 创建仓库..."
RESP=$(curl -s -X POST "https://gitee.com/api/v5/user/repos" \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\": \"$TOKEN\",
    \"name\": \"$REPO\",
    \"description\": \"企盟平台 - 微信小程序 + FastAPI 后端\",
    \"private\": false,
    \"auto_init\": false
  }")

if echo "$RESP" | grep -q '"full_name"'; then
  echo "✅ 仓库创建成功！"
elif echo "$RESP" | grep -q 'already exists\|已存在\|422'; then
  echo "ℹ️  仓库已存在，继续推送..."
else
  echo "⚠️  仓库创建响应：$RESP"
  echo "如果仓库已存在会继续推送，不影响流程。"
fi

# 2. 初始化 Git 仓库
echo ""
echo "🔧 第二步：初始化 Git..."
cd "$(dirname "$0")"
git init
git config user.name "Cookie"
git config user.email "xiaoxingxing153@gmail.com"

# 3. 添加所有文件
echo ""
echo "📁 第三步：添加文件..."
git add .
git status --short | head -20
echo "..."

# 4. 首次提交
echo ""
echo "💾 第四步：提交代码..."
git commit -m "🚀 企盟平台首次提交

- 微信小程序前端（6个主页面 + 登录页 + 自定义TabBar）
- FastAPI 后端（16个功能模块）
- 用户认证、通讯录、任务、活动、空间、分润、我的主页
- 贡献积分、会员、AI智能匹配等模块"

# 5. 设置远端并推送
echo ""
echo "🚀 第五步：推送到 Gitee..."
REMOTE_URL="https://${USERNAME}:${TOKEN}@gitee.com/${USERNAME}/${REPO}.git"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"
git branch -M main
git push -u origin main

echo ""
echo "========================================"
echo "✅ 完成！访问仓库："
echo "   https://gitee.com/${USERNAME}/${REPO}"
echo "========================================"

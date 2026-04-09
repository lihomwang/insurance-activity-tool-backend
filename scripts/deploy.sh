#!/bin/bash
# 飞书云函数部署打包脚本
# 支持 H5 API 统一入口

set -e

PROJECT_DIR="/Users/boo/.openclaw/workspace/insurance-activity-tool-backend"
DEPLOY_DIR="/tmp/feishu-deploy-$$"

echo "======================================"
echo "飞书云函数部署打包"
echo "======================================"
echo ""

# 1. 创建临时部署目录
echo "1. 创建部署目录..."
mkdir -p "$DEPLOY_DIR"

# 2. 复制必要文件
echo "2. 复制文件..."
cp -r "$PROJECT_DIR/functions" "$DEPLOY_DIR/"
cp -r "$PROJECT_DIR/services" "$DEPLOY_DIR/"
cp -r "$PROJECT_DIR/config" "$DEPLOY_DIR/"
cp "$PROJECT_DIR/package.json" "$DEPLOY_DIR/"
cp "$PROJECT_DIR/.env.production" "$DEPLOY_DIR/.env"
cp "$PROJECT_DIR/feishu-config.yaml" "$DEPLOY_DIR/"

# 3. 安装生产依赖
echo "3. 安装生产依赖..."
cd "$DEPLOY_DIR"
npm install --production

# 4. 创建部署说明
echo "4. 创建部署说明..."
cat > "$DEPLOY_DIR/DEPLOY_README.txt" << 'EOF'
飞书云函数部署包

部署方法 1 - 使用飞书开发者工具:
1. 打开飞书开发者工具
2. 创建云函数项目
3. 将此目录所有文件上传

部署方法 2 - 使用飞书 CLI:
1. lark login
2. lark function deploy --config feishu-config.yaml

环境变量配置:
见 .env 文件

函数列表:
- functions/api/index.js -> h5-api (H5 应用统一 API)
- functions/activity/index.js -> activity-api
- functions/ai-chat/index.js -> ai-chat-api
- functions/admin/index.js -> admin-api
- functions/scheduler/index.js -> scheduler-api

定时任务:
- 每天 21:00 - 每日锁定
- 每天 21:05 - AI 教练
- 每天 23:00 - 每日分析
- 每周四 22:00 - 周报
EOF

# 5. 压缩
echo "5. 创建压缩包..."
cd /tmp
zip -r "feishu-deploy-$(date +%Y%m%d-%H%M%S).zip" "feishu-deploy-$$"

# 6. 清理
echo "6. 清理临时文件..."
rm -rf "$DEPLOY_DIR"

echo ""
echo "======================================"
echo "部署包创建成功!"
echo "位置：/tmp/feishu-deploy-*.zip"
echo "======================================"
echo ""
echo "下一步:"
echo "1. 打开飞书开发者工具"
echo "2. 创建云函数项目"
echo "3. 上传部署包"
echo "4. 配置触发器和环境变量"
echo "5. 发布上线"
echo ""
echo "或自动部署:"
echo "  lark function deploy --config feishu-config.yaml"

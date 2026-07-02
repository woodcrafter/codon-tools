#!/bin/bash

##############################################
# 数据库初始化脚本
##############################################

set -e

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查环境变量
if [ ! -f ".env" ]; then
    log_error ".env 文件不存在"
    exit 1
fi

# 加载环境变量
source .env

log_info "开始初始化数据库..."

# 运行数据库迁移
log_info "运行数据库迁移..."
pnpm db:push

# 运行种子数据脚本
log_info "导入种子数据..."
if [ -f "scripts/seed-data.mjs" ]; then
    node scripts/seed-data.mjs
    log_info "种子数据导入成功"
else
    log_error "种子数据脚本不存在: scripts/seed-data.mjs"
fi

log_info "数据库初始化完成！"

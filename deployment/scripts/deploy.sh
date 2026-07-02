#!/bin/bash

##############################################
# 基因合成平台 - 自动化部署脚本
# 适用于: Ubuntu 20.04/22.04
# 域名: dreamstudios.work
##############################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用root权限运行此脚本: sudo bash deploy.sh"
    exit 1
fi

# 配置变量
DOMAIN="dreamstudios.work"
APP_NAME="protein-production-platform"
APP_DIR="/var/www/$APP_NAME"
DB_NAME="gene_synthesis_db"
DB_USER="gene_app_user"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
NODE_VERSION="20"

log_info "开始部署基因合成平台..."
log_info "域名: $DOMAIN"
log_info "应用目录: $APP_DIR"

# 1. 更新系统
log_info "步骤 1/10: 更新系统包..."
apt-get update -y
apt-get upgrade -y

# 2. 安装基础依赖
log_info "步骤 2/10: 安装基础依赖..."
apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# 3. 安装Node.js
log_info "步骤 3/10: 安装Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
    apt-get install -y nodejs
fi

# 验证Node.js安装
NODE_VER=$(node -v)
NPM_VER=$(npm -v)
log_info "Node.js版本: $NODE_VER"
log_info "npm版本: $NPM_VER"

# 安装pnpm
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi

# 安装PM2
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# 4. 安装PostgreSQL
log_info "步骤 4/10: 安装PostgreSQL..."
if ! command -v psql &> /dev/null; then
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
fi

# 5. 创建数据库和用户
log_info "步骤 5/10: 创建数据库..."
sudo -u postgres psql <<EOF
DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME') THEN
        CREATE DATABASE $DB_NAME;
    END IF;
END \$\$;

DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';
    END IF;
END \$\$;

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

log_info "数据库创建成功: $DB_NAME (PostgreSQL)"

# 6. 创建应用目录
log_info "步骤 6/10: 创建应用目录..."
mkdir -p $APP_DIR
cd $APP_DIR

# 7. 复制应用文件（假设当前目录有项目文件）
log_info "步骤 7/10: 复制应用文件..."
log_warn "请手动将项目文件上传到 $APP_DIR"
log_warn "或使用 git clone 命令克隆代码仓库"

# 8. 配置环境变量
log_info "步骤 8/10: 配置环境变量..."
cat > $APP_DIR/.env <<EOF
# 数据库配置
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# JWT密钥
JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')

# 应用配置
NODE_ENV=production
PORT=3000

# 域名配置
VITE_APP_TITLE=基因合成平台
VITE_APP_LOGO=https://dreamstudios.work/logo.png

# 钉钉配置（需要手动填写）
# DINGTALK_APP_KEY=your_dingtalk_app_key
# DINGTALK_APP_SECRET=your_dingtalk_app_secret
# VITE_DINGTALK_APP_KEY=your_dingtalk_app_key
# DINGTALK_WEBHOOK_URL=your_webhook_url
# DINGTALK_WEBHOOK_SECRET=your_webhook_secret

# Manus OAuth配置（如果不使用Manus OAuth，需要实现独立认证）
# OAUTH_SERVER_URL=https://api.manus.im
# VITE_OAUTH_PORTAL_URL=https://portal.manus.im
# VITE_APP_ID=your_app_id
EOF

chmod 600 $APP_DIR/.env
log_info "环境变量配置完成: $APP_DIR/.env"

# 9. 配置Nginx
log_info "步骤 9/10: 配置Nginx..."
cat > /etc/nginx/sites-available/$APP_NAME <<'NGINX_EOF'
server {
    listen 80;
    server_name dreamstudios.work www.dreamstudios.work;
    
    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dreamstudios.work www.dreamstudios.work;
    
    # SSL证书路径（Let's Encrypt自动配置）
    ssl_certificate /etc/letsencrypt/live/dreamstudios.work/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dreamstudios.work/privkey.pem;
    
    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 日志
    access_log /var/log/nginx/gene-platform-access.log;
    error_log /var/log/nginx/gene-platform-error.log;
    
    # 客户端上传大小限制
    client_max_body_size 50M;
    
    # 反向代理到Node.js应用
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态文件缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

# 启用站点
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试Nginx配置
nginx -t

# 10. 配置SSL证书
log_info "步骤 10/10: 配置SSL证书..."
log_warn "请确保域名 $DOMAIN 已正确解析到此服务器IP"
read -p "域名是否已解析？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
    
    # 设置自动续期
    systemctl enable certbot.timer
    systemctl start certbot.timer
    
    log_info "SSL证书配置成功"
else
    log_warn "跳过SSL证书配置"
    log_warn "请在域名解析后手动运行: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# 重启Nginx
systemctl restart nginx
log_info "Nginx配置完成并已重启"

# 保存数据库凭证
cat > /root/db_credentials.txt <<EOF
数据库配置信息
================
数据库名: $DB_NAME
用户名: $DB_USER
密码: $DB_PASSWORD

请妥善保管此文件！
EOF

chmod 600 /root/db_credentials.txt

# 输出部署信息
echo ""
echo "========================================="
log_info "部署完成！"
echo "========================================="
echo ""
echo "应用目录: $APP_DIR"
echo "数据库名: $DB_NAME"
echo "数据库凭证已保存到: /root/db_credentials.txt"
echo ""
echo "下一步操作:"
echo "1. 将项目文件上传到 $APP_DIR"
echo "2. 运行: cd $APP_DIR && pnpm install"
echo "3. 运行: pnpm db:push (初始化数据库)"
echo "4. 运行: pnpm build"
echo "5. 运行: pm2 start ecosystem.config.js"
echo "6. 运行: pm2 save && pm2 startup"
echo ""
echo "访问地址: https://$DOMAIN"
echo "========================================="

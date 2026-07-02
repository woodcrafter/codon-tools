#!/bin/bash

##############################################
# SSL证书配置脚本（Let's Encrypt）
##############################################

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查root权限
if [ "$EUID" -ne 0 ]; then 
    log_error "请使用root权限运行此脚本: sudo bash setup-ssl.sh"
    exit 1
fi

DOMAIN="dreamstudios.work"
EMAIL="admin@dreamstudios.work"

log_info "开始配置SSL证书..."
log_info "域名: $DOMAIN"
log_info "邮箱: $EMAIL"

# 检查域名解析
log_info "检查域名解析..."
DOMAIN_IP=$(dig +short $DOMAIN | tail -n1)
SERVER_IP=$(curl -s ifconfig.me)

if [ -z "$DOMAIN_IP" ]; then
    log_error "域名 $DOMAIN 无法解析"
    log_error "请先配置DNS记录，将域名指向服务器IP: $SERVER_IP"
    exit 1
fi

log_info "域名解析IP: $DOMAIN_IP"
log_info "服务器IP: $SERVER_IP"

if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    log_warn "域名解析IP与服务器IP不匹配"
    log_warn "这可能导致SSL证书申请失败"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 安装certbot（如果未安装）
if ! command -v certbot &> /dev/null; then
    log_info "安装certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# 创建webroot目录
mkdir -p /var/www/certbot

# 停止Nginx（避免端口冲突）
log_info "停止Nginx服务..."
systemctl stop nginx || true

# 申请证书（standalone模式）
log_info "申请SSL证书..."
certbot certonly \
    --standalone \
    --preferred-challenges http \
    -d $DOMAIN \
    -d www.$DOMAIN \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --keep-until-expiring

if [ $? -eq 0 ]; then
    log_info "SSL证书申请成功！"
else
    log_error "SSL证书申请失败"
    exit 1
fi

# 配置自动续期
log_info "配置证书自动续期..."

# 创建续期钩子脚本
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF

chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# 启用certbot定时器
systemctl enable certbot.timer
systemctl start certbot.timer

# 测试续期（dry-run）
log_info "测试证书续期..."
certbot renew --dry-run

# 启动Nginx
log_info "启动Nginx服务..."
systemctl start nginx

# 验证SSL配置
log_info "验证SSL配置..."
sleep 2
curl -I https://$DOMAIN 2>&1 | grep "HTTP/2 200" && log_info "SSL配置成功！" || log_warn "SSL验证失败，请检查配置"

echo ""
echo "========================================="
log_info "SSL证书配置完成！"
echo "========================================="
echo ""
echo "证书路径:"
echo "  - 证书: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  - 私钥: /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo "证书有效期: 90天"
echo "自动续期: 已启用（certbot.timer）"
echo ""
echo "访问地址: https://$DOMAIN"
echo "========================================="

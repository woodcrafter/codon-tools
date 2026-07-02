# 快速部署指南

本文档提供基因合成平台的快速部署步骤，适合有Linux服务器管理经验的用户。

## 前置条件

- ✅ Ubuntu 20.04/22.04 服务器（2核4GB以上）
- ✅ Root权限
- ✅ 域名 dreamstudios.work 已解析到服务器IP

## 一键部署

### 1. 上传项目文件

```bash
# 方式一：Git克隆
git clone https://github.com/your-username/protein-production-platform.git /var/www/protein-production-platform

# 方式二：SCP上传
scp -r /path/to/protein-production-platform root@your_server_ip:/var/www/
```

### 2. 运行自动化脚本

```bash
cd /var/www/protein-production-platform/deployment/scripts
chmod +x *.sh
sudo bash deploy.sh
```

脚本会自动安装：
- Node.js 20 + pnpm + PM2
- PostgreSQL 16
- Nginx
- Let's Encrypt SSL证书

**重要**: 数据库密码会保存在 `/root/db_credentials.txt`

### 3. 配置环境变量（可选）

如果需要钉钉集成，编辑 `.env` 文件：

```bash
cd /var/www/protein-production-platform
nano .env
```

添加钉钉配置：

```bash
DINGTALK_APP_KEY=your_app_key
DINGTALK_APP_SECRET=your_app_secret
VITE_DINGTALK_APP_KEY=your_app_key
DINGTALK_WEBHOOK_URL=your_webhook_url
DINGTALK_WEBHOOK_SECRET=your_webhook_secret
```

### 4. 安装依赖并构建

```bash
cd /var/www/protein-production-platform
pnpm install
pnpm db:push
bash deployment/scripts/init-database.sh
pnpm build
```

### 5. 启动应用

```bash
cp deployment/configs/ecosystem.config.js .
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

按照提示执行生成的命令以配置开机自启动。

### 6. 验证部署

访问 https://dreamstudios.work

检查服务状态：

```bash
pm2 status
systemctl status nginx
systemctl status postgresql
```

## 常用命令

### 应用管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs gene-synthesis-platform

# 重启应用
pm2 restart gene-synthesis-platform

# 停止应用
pm2 stop gene-synthesis-platform
```

### 数据库管理

```bash
# 连接数据库
psql "postgresql://gene_app_user@localhost:5432/gene_synthesis_db"

# 备份数据库
pg_dump "postgresql://gene_app_user@localhost:5432/gene_synthesis_db" > backup.sql

# 恢复数据库
psql "postgresql://gene_app_user@localhost:5432/gene_synthesis_db" < backup.sql
```

### Nginx管理

```bash
# 测试配置
nginx -t

# 重启Nginx
systemctl restart nginx

# 查看错误日志
tail -f /var/log/nginx/gene-platform-error.log
```

## 故障排查

### 应用无法访问

```bash
# 检查PM2进程
pm2 status

# 检查端口监听
netstat -tuln | grep 3000

# 查看应用日志
pm2 logs gene-synthesis-platform --err
```

### 502 Bad Gateway

```bash
# 检查应用是否运行
pm2 status

# 重启应用
pm2 restart gene-synthesis-platform

# 检查Nginx配置
nginx -t
```

### 数据库连接失败

```bash
# 检查PostgreSQL状态
systemctl status postgresql

# 测试连接
psql "postgresql://gene_app_user@localhost:5432/postgres" -c "SELECT 1"

# 查看数据库连接字符串
grep DATABASE_URL /var/www/protein-production-platform/.env
```

## 更新应用

```bash
cd /var/www/protein-production-platform
git pull origin main
pnpm install
pnpm db:push
pnpm build
pm2 reload gene-synthesis-platform
```

## 获取帮助

- � [部署说明](../README.md)
- 💬 联系技术支持

---

**提示**: 首次部署请按本文顺序逐步执行。

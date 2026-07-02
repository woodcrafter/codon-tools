# 部署文件说明

本目录包含基因合成平台在Ubuntu VPS服务器上部署所需的所有脚本、配置文件和文档。

## 目录结构

```
deployment/
├── scripts/              # 自动化部署脚本
│   ├── deploy.sh        # 主部署脚本（一键安装环境）
│   ├── init-database.sh # 数据库初始化脚本
│   └── setup-ssl.sh     # SSL证书配置脚本
├── configs/              # 配置文件
│   ├── nginx.conf       # Nginx反向代理配置
│   └── ecosystem.config.js  # PM2进程管理配置
├── docs/                 # 部署文档
│   └── QUICK_START.md       # 快速部署指南
└── README.md            # 本文件
```

## 快速开始

### 1. 选择部署方式

#### 方式一：自动化部署（推荐）

适合新服务器，一键安装所有依赖：

```bash
cd deployment/scripts
chmod +x deploy.sh
sudo bash deploy.sh
```

#### 方式二：手动部署

适合已有环境的服务器，参考 [快速部署指南](./docs/QUICK_START.md)。

### 2. 阅读文档

- **首次部署**: 阅读 [快速部署指南](./docs/QUICK_START.md)
- **问题排查**: 参考本文档“常见问题”章节

## 脚本说明

### deploy.sh

**主部署脚本**，自动完成以下任务：

1. 更新系统包
2. 安装Node.js 20、pnpm、PM2
3. 安装PostgreSQL并配置基础设置
4. 创建数据库和用户
5. 生成环境变量配置文件
6. 配置Nginx反向代理
7. 申请Let's Encrypt SSL证书

**使用方法**:

```bash
sudo bash deploy.sh
```

**注意事项**:
- 需要root权限
- 执行时间约5-10分钟
- 数据库密码会保存到 `/root/db_credentials.txt`

### init-database.sh

**数据库初始化脚本**，导入种子数据：

- 宿主物种（E. coli、Yeast、CHO等）
- 限制性内切酶（EcoRI、BamHI等）
- 载体库（pET-28a、pcDNA3.1等）

**使用方法**:

```bash
bash init-database.sh
```

**前置条件**:
- 已运行 `pnpm db:push`
- `.env` 文件已配置

### setup-ssl.sh

**SSL证书配置脚本**，申请和配置Let's Encrypt证书。

**使用方法**:

```bash
sudo bash setup-ssl.sh
```

**前置条件**:
- 域名已解析到服务器IP
- Nginx已安装

## 配置文件说明

### nginx.conf

Nginx反向代理配置文件，包含：

- HTTP到HTTPS重定向
- SSL/TLS配置（TLS 1.2/1.3）
- 反向代理到Node.js应用（端口3000）
- Gzip压缩
- 静态文件缓存
- 安全头配置

**安装位置**: `/etc/nginx/sites-available/gene-synthesis-platform`

### ecosystem.config.js

PM2进程管理配置文件，包含：

- 集群模式配置
- 自动重启策略
- 日志配置
- 内存限制

**使用位置**: 项目根目录

## 部署流程

完整的部署流程如下：

```
1. 准备服务器环境
   ↓
2. 上传项目文件
   ↓
3. 运行 deploy.sh（自动安装环境）
   ↓
4. 配置环境变量（.env）
   ↓
5. 安装依赖（pnpm install）
   ↓
6. 初始化数据库（pnpm db:push + init-database.sh）
   ↓
7. 构建项目（pnpm build）
   ↓
8. 启动应用（pm2 start）
   ↓
9. 配置SSL证书（setup-ssl.sh）
   ↓
10. 验证部署
```

## 环境要求

### 服务器配置

| 配置项 | 最低要求 | 推荐配置 |
|-------|---------|---------|
| 操作系统 | Ubuntu 20.04 | Ubuntu 22.04 |
| CPU | 2核心 | 4核心 |
| 内存 | 4GB | 8GB |
| 存储 | 40GB SSD | 80GB SSD |
| 网络 | 公网IP | 公网IP + 域名 |

### 软件版本

| 软件 | 版本 |
|-----|------|
| Node.js | ^20.0.0 |
| PostgreSQL | ^16 |
| Nginx | ^1.18.0 |
| PM2 | ^5.0.0 |

## 常见问题

### Q: 部署脚本执行失败怎么办？

A: 检查以下几点：
1. 是否使用root权限
2. 服务器是否联网
3. 查看错误日志定位问题

### Q: 域名未解析可以部署吗？

A: 可以，但需要跳过SSL配置步骤，稍后手动运行 `setup-ssl.sh`。

### Q: 如何更新应用？

A: 执行以下命令：

```bash
cd /var/www/protein-production-platform
git pull origin main
pnpm install
pnpm db:push
pnpm build
pm2 reload gene-synthesis-platform
```

### Q: 如何备份数据库？

A: 执行以下命令：

```bash
pg_dump "postgresql://gene_app_user@localhost:5432/gene_synthesis_db" > backup.sql
```

## 获取帮助

- 📝 [快速部署指南](./docs/QUICK_START.md)
- 💬 联系技术支持

## 版本历史

- **v1.0** (2026-02-06): 初始版本，支持Ubuntu 20.04/22.04自动化部署

---

**维护者**: 开发团队  
**最后更新**: 2026-02-06

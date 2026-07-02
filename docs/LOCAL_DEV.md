# 本地开发（PostgreSQL）

## 1. 启动本地 Postgres（推荐：Docker）

```bash
pnpm db:up
```

默认会启动一个 PostgreSQL 16：
- DB: `gene_synthesis_db`
- User: `gene_app_user`
- Password: `gene_app_password`
- Port: `5433`（避免与本机已安装的 PostgreSQL 冲突）

## 2. 配置环境变量

将 `.env.example` 复制为 `.env`，并按需修改：

```bash
cp .env.example .env
```

## 3. 创建表结构 + 导入常见数据

```bash
pnpm db:push
pnpm db:seed
```

## 4. 启动项目

```bash
pnpm dev
```

## 5. 关闭并清理数据库（会删除数据卷）

```bash
pnpm db:down
```

## 6. 全量容器化运行

如果你希望应用与数据库都在 Docker 中运行，请参考 [DOCKER.md](file:///Users/apple/Downloads/protein-production-platform/docs/DOCKER.md)。

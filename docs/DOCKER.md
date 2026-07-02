# Docker 运行指南（OrbStack）

本项目可以直接在 OrbStack 的 Docker 环境中运行。

## 1. 前置条件

- 已安装并启动 OrbStack
- 终端中可用 `docker` 与 `docker compose`

## 2. 一键启动

```bash
pnpm docker:up
```

启动后会创建两个服务：
- `app`：应用服务（对外 `3000`）
- `db`：PostgreSQL（对外 `5433`，容器内 `5432`）

## 3. 初始化数据库

首次启动后执行：

```bash
docker compose exec app pnpm db:push
docker compose exec app pnpm db:seed
```

说明：初始化请优先使用 `db:push`，避免历史迁移文件重复创建枚举类型导致失败。

## 4. 访问系统

- 应用地址：`http://localhost:3000`

## 5. 常用命令

```bash
pnpm docker:logs
pnpm docker:down
```

## 6. 常见问题

如果提示 `pnpm: command not found`，先执行：

```bash
corepack enable
corepack prepare pnpm@10.4.1 --activate
pnpm -v
```

如果你暂时不想装 pnpm，也可以直接运行：

```bash
docker compose up -d --build
docker compose logs -f app
docker compose down -v
```

如果提示 `Docker is not installed. This is a mock script.`，说明命中了错误的 `docker` 可执行文件。先检查：

```bash
which -a docker
```

如果第一项是 `~/.local/bin/docker`，请优先使用 OrbStack 的 docker：

```bash
export PATH="/usr/local/bin:$PATH"
hash -r
docker --version
```

如需永久生效，把这一行写入 `~/.zshrc`：

```bash
export PATH="/usr/local/bin:$PATH"
```

项目内 `pnpm docker:*` 与 `pnpm db:up/down` 已内置 OrbStack Docker 自动探测逻辑，优先使用 `/usr/local/bin/docker` 与 `~/.orbstack/bin/docker`，不依赖当前 PATH 顺序。

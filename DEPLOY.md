# Handicraft API 部署文档

基于 new-api `v1.0.0-rc.33` 的自定义版本，通过 Docker Compose 部署。

> **这是修改版，不是原项目。** 原项目为 [new-api](https://github.com/QuantumNous/new-api)
> （AGPLv3）。本版本保留了许可证要求的署名与原始项目链接，详见 `NOTICE`。

---

## 一、前置条件

镜像由 GitHub Actions **在云端构建**并推送到 GHCR，服务器**只负责拉取，不需要编译**。

| 项目 | 要求 | 检查命令 |
| --- | --- | --- |
| Docker | 20.10+ | `docker --version` |
| Docker Compose | v2（用 `docker compose`，非 `docker-compose`） | `docker compose version` |
| 内存 | ≥ 1 GB | `free -h` |
| 磁盘 | ≥ 5 GB 可用 | `df -h /` |
| 网络 | 能访问 `ghcr.io` 和 Docker Hub | — |

内存和磁盘要求都不高，因为服务器不再承担构建工作。

> 仅当你选择"从源码构建"（见第 4.2 节）时，才需要 ≥ 2 GB 内存和 10–20 分钟编译时间。

---

## 二、获取部署文件

默认流程**不需要源码树**，只需要 compose 文件和 `.env.example`。两种方式任选。

### 方式一：克隆仓库（推荐，便于后续更新）

```bash
git clone https://github.com/xuehaozhi/Handicraft-NewAPI.git handicraft
cd handicraft
```

仓库只有 `custom/rc33` 一个分支，它同时是默认分支，所以 `git clone` 后已在该分支上。

### 方式二：只取三个文件

```bash
mkdir handicraft && cd handicraft
BASE=https://raw.githubusercontent.com/xuehaozhi/Handicraft-NewAPI/custom/rc33
curl -O $BASE/docker-compose.yml
curl -O $BASE/docker-compose.build.yml
curl -O $BASE/.env.example
```

`docker-compose.build.yml` 只有在你需要本地构建时才用得到，可以不下。

---

## 三、配置密钥

所有密码集中在 `.env`，不再硬编码在 compose 文件里。

```bash
cp .env.example .env
chmod 600 .env
```

生成两个强密码（**分两次执行，得到两个不同的值**）：

```bash
openssl rand -base64 32
```

编辑 `.env`，填入两个必填项：

```ini
POSTGRES_PASSWORD=<第一个随机值>
REDIS_PASSWORD=<第二个随机值>
```

其余两项有默认值，可不动：

```ini
REDIS_POOL_SIZE=10
REDIS_MAXMEMORY=512mb
```

**不要重复使用同一个密码。** Redis 里存的是真实状态（登录会话、预扣费额度、限流计数），
而 Postgres 存的是业务数据，两者隔离更安全。

> `.env` 已被 `.gitignore` 和 `.dockerignore` 排除，不会被提交，也不会进入镜像。
> 若必填项留空或缺失，`docker compose up` 会直接报错中止并指出变量名——这是刻意的设计，
> 避免带着已知默认密码静默启动。

---

## 四、启动

### 4.1 默认：拉取云端镜像（无需编译）

```bash
docker compose pull
docker compose up -d
```

几十秒内即可启动，服务器不参与任何编译。

首次拉取前，先确认镜像包是公开的，否则需要先登录：

```bash
# 若 ghcr.io/xuehaozhi/handicraft-newapi 是公开包，直接跳过这步
docker login ghcr.io -u xuehaozhi
```

**建议把镜像包设为公开**（一次性操作，之后服务器无需任何凭据）：

> GitHub → 你的头像 → Your packages → `handicraft-newapi` → Package settings →
> Change visibility → Public

镜像由 `.github/workflows/docker-ghcr.yml` 在每次推送到 `custom/rc33` 时自动构建。
在 GitHub 仓库的 **Actions** 标签页可以看到构建进度；构建完成前，GHCR 上还没有镜像，
此时 `docker compose pull` 会失败。

### 4.2 可选：从源码本地构建

只有在测试尚未推送的本地改动时才需要：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

需要 ≥ 2 GB 内存，耗时 10–20 分钟。

### 4.3 确认服务状态

```bash
docker compose ps
```

三个服务都应为 `running`，其中 `redis` 和 `postgres` 应显示 `(healthy)`。

---

## 五、首次初始化（管理员账号）

浏览器打开：

```
http://<服务器IP>:3000
```

会进入**初始化向导**。管理员账号**没有默认值**，由你在向导中现场设定：

- **用户名**：最多 12 个字符
- **密码**：至少 8 个字符，需两次一致
- 向导中还有两个开关：**自用模式**、**演示站点**，按需勾选

> 代码中不存在任何自动创建的管理员账号。原上游曾有一个创建 `root` / `123456` 的函数，
> 但从未被调用；本版本已将其删除，避免日后合并上游时被重新启用。

完成后登录，进入仪表盘。

---

## 六、必做：添加上游渠道

新装的数据库里**没有任何渠道**，此时所有 API 调用都会返回：

```
503 No available channel for model xxx
```

登录后台 → **渠道** → 添加你的上游供应商配置（类型、密钥、模型列表）。

> 配置会缓存在内存中，按 `SYNC_FREQUENCY`（默认 60 秒）周期同步。刚加完渠道若没立刻生效，
> 等一个同步周期即可。

---

## 七、验证清单

### 7.1 服务状态

```bash
docker compose ps
docker compose logs new-api | tail -30
```

启动日志中应出现：

```
Redis is enabled
Handicraft API Handicraft Bate 1.0.1  ready in ... ms
```

若出现 `REDIS_CONN_STRING not set, Redis is not enabled`，说明 `.env` 没被读到，
检查 `.env` 是否与 `docker-compose.yml` 在同一目录。

### 7.2 版本与站点名

```bash
curl -s http://localhost:3000/api/status | grep -o '"version":"[^"]*"'
curl -s http://localhost:3000/api/status | grep -o '"system_name":"[^"]*"'
```

期望输出：

```
"version":"Handicraft Bate 1.0.1"
"system_name":"Handicraft API"
```

**如果显示的是 `v1.0.0-rc.33` 或 `New API`，说明跑的不是本版本的镜像。** 检查：

```bash
docker compose images    # 应为 ghcr.io/xuehaozhi/handicraft-newapi，而非 calciumion/new-api
docker inspect new-api --format '{{.Config.Image}}'
```

若镜像名不对，说明 `docker-compose.yml` 被改过或用的不是本仓库的文件。
若镜像名正确但版本仍不对，说明 GitHub Actions 那次构建失败或尚未完成，去仓库 Actions 页查看。

### 7.3 界面

| 检查项 | 期望 |
| --- | --- |
| 浏览器标签页标题 | `Handicraft API` |
| 侧边栏品牌名 | `Handicraft API` |
| 仪表盘顶部 | 欢迎横幅（`Handicraft · 手工API`） |
| 顶部导航 | 有「状态监控」入口 |
| 系统设置 → 运维 | **没有**「检查更新」按钮 |

### 7.4 图片输入已被禁用

用你的 API Key 发一个带图片的请求，应返回 **HTTP 400**：

```bash
curl -s -o - -w '\nHTTP %{http_code}\n' http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-你的key" \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":[
        {"type":"text","text":"这是什么"},
        {"type":"image_url","image_url":{"url":"data:image/png;base64,iVBORw0KGgo="}}]}]}'
```

期望：

```
HTTP 400
{"error":{"message":"image input is not supported on this deployment: ..."}}
```

纯文本请求则应正常通过校验（若渠道配置正确则会真正得到回复）。

### 7.5 状态监控

访问 `/status-monitor`：

- **未登录**：显示登录提示，且不发起数据请求
- **已登录**：显示 CPU、内存、磁盘、网络上下行速率，以及全站 token 总量、调用次数、消耗额度

---

## 八、开放端口

```bash
sudo ufw allow 3000/tcp
```

**注意**：Postgres 和 Redis 的端口在 compose 中是注释掉的，只在 Docker 内网可达，不对外暴露。
不要取消注释。

---

## 九、日常运维

### 查看日志

```bash
docker compose logs -f new-api      # 实时
docker compose logs --tail=100 redis
```

### 重启 / 停止

```bash
docker compose restart              # 重启全部
docker compose stop                 # 停止但保留容器
docker compose down                 # 移除容器（数据卷保留）
```

### 更新到新版本

代码推送后 GitHub Actions 会自动构建新镜像（在仓库 Actions 页可看进度）。构建完成后：

```bash
docker compose pull
docker compose up -d
```

`pull_policy: always` 已配置，所以 `docker compose up -d` 本身也会先拉取最新镜像。

若要回退到某个特定构建，用提交哈希标签：

```bash
docker pull ghcr.io/xuehaozhi/handicraft-newapi:sha-<commit>
docker tag ghcr.io/xuehaozhi/handicraft-newapi:sha-<commit> ghcr.io/xuehaozhi/handicraft-newapi:latest
docker compose up -d
```

若你是从源码本地构建的，则重新执行 4.2 节的命令即可。

### 备份

数据库（业务数据，最重要）：

```bash
docker compose exec postgres pg_dump -U root new-api > backup-$(date +%F).sql
```

恢复：

```bash
cat backup-2026-09-11.sql | docker compose exec -T postgres psql -U root -d new-api
```

Redis 数据存放在 `redis_data` 卷中（已启用 AOF 持久化）。会话过期后可从数据库重建缓存，
但备份数据库即可覆盖主要风险。

数据卷位置：

```bash
docker volume ls | grep handicraft
```

---

## 十、故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `docker compose up` 报 `POSTGRES_PASSWORD must be set` | `.env` 不存在或必填项为空 | 按第三节填写 `.env` |
| new-api 容器反复重启 | Redis/Postgres 未就绪或密码不匹配 | `docker compose logs redis postgres`，核对 `.env` 密码 |
| 日志出现 `Redis ping test failed` | Redis 密码与 `REDIS_CONN_STRING` 不一致 | 两处都取自 `${REDIS_PASSWORD}`，确认 `.env` 已生效 |
| 所有 API 返回 503 `no available channel` | 未添加上游渠道 | 后台「渠道」中添加 |
| 改了 `POSTGRES_PASSWORD` 后连不上数据库 | **Postgres 密码只在数据卷首次初始化时生效** | 见下方说明 |
| 构建时前端 OOM | 内存不足 | 加内存或加 swap |
| Redis 内存写满报错 | 达到 `REDIS_MAXMEMORY` | 调高该值；策略为 `noeviction`，不会静默淘汰数据 |

### 关于修改 Postgres 密码

`POSTGRES_PASSWORD` **仅在数据卷为空时**（首次初始化）用于创建账号。之后修改 `.env`
不会改变数据库里已有的密码，容器会因认证失败而无法启动。

两种处理方式：

```bash
# 方式一：进数据库改密码（保留数据）
docker compose exec postgres psql -U root -d new-api -c "ALTER USER root WITH PASSWORD '新密码';"
# 然后同步修改 .env 并重启

# 方式二：清空数据卷重建（会丢失所有数据）
docker compose down
docker volume rm handicraft_pg_data
docker compose up -d
```

### 关于 Redis 内存策略

`--maxmemory-policy noeviction` 是**刻意选择**：Redis 中混有登录会话和预扣费额度，
用 LRU 淘汰会导致用户无故掉线、计费数据丢失。`noeviction` 让写入显式报错而不是静默丢数据。
如果你更愿意"保服务、丢状态"，可改为 `volatile-lru`。

---

## 十一、安全建议

当前部署通过 **3000 端口明文 HTTP** 直接暴露，管理员登录凭据会明文传输。生产环境建议：

1. **前置反向代理 + TLS**（Caddy 最省事，自动申请证书）

   ```
   # Caddyfile 示例
   api.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   配置后把 3000 端口改为只监听本机：`"127.0.0.1:3000:3000"`

2. **保持 2FA 开启**，定期轮换 API Key
3. **不要提交 `.env`**（已在 `.gitignore` 中）
4. 定期更新基础镜像，修补 Redis / Postgres 漏洞

---

## 附录：时区

`docker-compose.yml` 中 `TZ=Asia/Shanghai` 影响日志时间戳和数据看板统计。
若服务器在海外而用户在国内，保持该值通常更符合使用习惯；如需改为服务器本地时区，
修改为对应值（如 `America/New_York`）后 `docker compose up -d` 重建容器。

---

## 附录：本版本相对上游的改动

详见仓库提交信息 `478bef8`。简要列出：

- 版本号强制固定为 `Handicraft Bate 1.0.1`，不可被环境变量或构建参数覆盖
- 站点名改为 `Handicraft API`
- 移除「检查更新」功能
- 仪表盘新增欢迎横幅
- 新增状态监控页（`/status-monitor`，需登录）
- **全局禁止图片输入**，所有模型生效
- 删除硬编码 `root`/`123456` 管理员的死代码
- 镜像不再使用上游的 `calciumion/new-api`（那个镜像不含以上任何改动），
  改为由 `.github/workflows/docker-ghcr.yml` 从本仓库源码构建并发布到 GHCR，
  部署端只拉取、不编译
- Redis 增加持久化与数据卷；依赖改为健康检查门控
- 密钥集中到 `.env`

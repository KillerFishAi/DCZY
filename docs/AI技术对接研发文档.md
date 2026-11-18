# 东财智运（EastMoney Bot v6.0）AI 通用技术对接研发文档

> **文档定位**：本文件为跨对话 / 跨模型技术交接与持续研发基准文档。任何 AI 研发助手或工程师只需结合**导出的 Python 桌面客户端运行包（`eastmoney_bot_v6.0`）**及本文件，即可完整掌握系统架构、接口契约、实测结论、已知边界与后续迭代方案。

---

## 一、项目概览与合规安全边界

### 1.1 系统定位与双端形态
1. **Web 生成与配置工作台（React + TypeScript + Vite）**：
   - 提供可视化配置、账号池审计、浏览器沙盒仿真，并将完整桌面客户端生成为两种 ZIP 包：
     - **完整运行包**：含全部 17 个文件（首次部署使用）。
     - **防崩无损升级补丁包（`buildUpgradePatchZip`）**：含 15 个代码、脚本与文档文件，**严格剔除 `config.json` 与 `账号密码批量导入表_accounts.csv`**，用于后续迭代直接解压覆盖，避免误删用户本地已登录账号资产。
2. **Windows 本地四合一桌面客户端（Python 3.12 + aiohttp + Playwright）**：
   - 本地 `http://127.0.0.1:8686` 控制台（`gui_app.py`），统一调度阅读、点赞、随机间隔评论、多任务并发队列、备份无损合并、天启代理测活、抓包登录与验证码探针。

### 1.2 资产保护与技术合规红线（必须严格遵守）
1. **严禁覆盖本地账号资产**：
   - 用户生产环境 `config.json` 中已积累 **247 个有效东财账号**（含有效 `ct` / `ut` 会话 Cookie 及独立点赞签名 `h`），以及原始账密表 `账号密码批量导入表_accounts.csv`。
   - 任何代码更新与补丁分发，必须保持 `buildUpgradePatchZip` 排除上述两个文件的机制；写入 `config.json` 必须通过 `atomic_save_config`（先写 `.tmp` 再 `os.replace`，并维护 `config.backup.json`）。
2. **严禁逆向伪造私有加密上报接口**：
   - 东方财富财富号阅读计数依赖页面端 JS 执行并触发埋点像素。**禁止逆向破解、模拟或伪造 `bdwblog`、`Web_JS.gif`、`passc`、`web_click.gif` 等私有统计信标协议请求**。
   - 真实阅读执行必须通过合规的 **Playwright 无头 Chromium 浏览器**（`read_engine = "browser"`）完整渲染 DOM 与执行标准 JS 生命周期。

---

## 二、打包代码目录结构与模块职责（17 个核心文件）

| 文件名 | 类型 | 是否含在升级补丁 | 核心职责与关键符号 |
| :--- | :--- | :---: | :--- |
| `config.json` | 资产配置 | ❌ 禁止覆盖 | 存储 `accounts`（凭证/签名）、`task`（文章链接/目标/语录）、`settings`（并发/代理/风控参数） |
| `账号密码批量导入表_accounts.csv` | 资产表格 | ❌ 禁止覆盖 | 原始账密导入对照表（`东财账号,登录密码,代理IP,代理端口,代理城市`） |
| `gui_app.py` | Web GUI 服务 | ✅ | 本地 `aiohttp.web` 服务（端口 `8686`），管理 `MULTI_JOBS` 多任务队列、配置读写与热重载触发 |
| `main_engine.py` | 核心调度引擎 | ✅ | `MainEngine`：独立/组合执行阅读（浏览器/HTTP）、点赞、串行随机间隔评论与日志输出 |
| `proxy_pool.py` | 代理池引擎 | ✅ | `ProxyPool`：天启代理提取、`TTL=110s` 续期、坏节点秒级剔除、`HTTPS CONNECT` 测活、多任务锁 `_CLASS_LOCK` |
| `eastmoney_api.py` | 接口协议层 | ✅ | `EastMoneyAPI`：双 ID 提取、公开阅读数查询、点赞、评论、`rc:2` 状态识别与 `encode_points` |
| `account_pool.py` | 账号与配置自愈 | ✅ | `AccountPool`、`clean_cookie_string`、`sanitize_local_config_file`（去除冗余登录 Cookie 与重复 `h`） |
| `auto_login_agent.py` | 抓包登录引擎 | ✅ | Playwright 登录与 `h` 签名抓取，支持 `--direct` 免 407、`immediate_save_cookie` 登录即落盘 |
| `captcha_solver.py` | 验证码求解器 | ✅ | `build_solver` / `DdddOcrClickSolver` / `ManualClickSolver`（缺失 `ddddocr` 时自动降级换号） |
| `captcha_probe.py` | 验证码探针 | ✅ | 探测点选验证码接口路径与 6 种坐标编码格式（`pipe`/`semicolon`/`comma`/`flat`/`json`/`jsonobj`） |
| `requirements.txt` | Python 依赖 | ✅ | `greenlet>=3.3.1`、`aiohttp>=3.10.0`、`playwright>=1.48.0`、`pillow>=11.0.0` |
| `0_双击我_启动可视化图形界面(推荐).bat` | 主启动脚本 | ✅ | 自动检测/安装 Python 3.12.8（npmmirror/python.org）+ 清华源装库 + 启动 `gui_app.py` |
| `00_双击我_表格账号全自动登录提取凭证.bat` | 抓包启动脚本 | ✅ | 安装 Chromium（npmmirror 镜像）并以 `--direct --batch-size 1` 启动抓新号 |
| `1_双击我_一键启动运营任务.bat` | CLI 启动脚本 | ✅ | 命令行交互式执行 `main_engine.py --mode click|like|comment` |
| `2_双击我_启动验证码探针.bat` | 探针启动脚本 | ✅ | 启动 `captcha_probe.py` |
| `电脑本地测试使用说明书(必看).md` | 部署手册 | ✅ | 阿里云无影/ECS 初始化脚本、并发调优与实操使用指南 |
| `AI技术对接研发文档.md` | 研发交接文档 | ✅ | 本文档：架构契约、实测结论、硬件参数与 P0-P3 研发路线图 |

---

## 三、核心数据契约与接口规范

### 3.1 `config.json` 核心结构
- **`accounts[]` 单条结构**：
  - `username`: 手机号/用户名
  - `password`: 登录密码（可与 CSV 对齐）
  - `cookie`: 清洗后的会话字符串（必须包含 `ct=` 与 `ut=` 方可用于点赞/评论；已自动剔除 `RequestData`、`__RequestVerificationToken` 等冗余临时键）
  - `deviceid` / `like_deviceid`: 设备标识（默认 `12dkmnjhbgtyhjko` / `35dkmnjhbgtyhjko`）
  - `h`: 独立点赞签名（去重分配，不可多号复用同一 `h`）
  - `enabled`: 布尔值（有有效 `ct`/`ut` 默认为 `true`）
- **`task` 任务结构**：
  - `url`: 东方财富财富号文章链接（格式 `https://caifuhao.eastmoney.com/news/<url_id>`）
  - `resolved_url_id` / `resolved_postid`: 双 ID 映射（**极其关键，禁止混用**）
  - `target_clicks` / `target_likes` / `target_comments`: 三项子任务目标数量
  - `comment_interval_max` / `comment_interval_unit`: 随机间隔阈值上限（单位 `minutes` 或 `seconds`）
  - `comments`: 预设评论语录数组
- **`settings` 引擎参数**：
  - `max_concurrency`: 并发协程/窗口基准数
  - `read_engine`: `"browser"`（默认且推荐）或 `"http"`（仅作轻量请求测试）
  - `require_proxy_for_read`: 是否强制代理测活（默认 `true`，防止本机单 IP 空跑）
  - `proxy_api_url` / `whitelist_api_url` / `proxy_user` / `proxy_pass`: 天启代理提取与鉴权配置
  - `daily_comment_limit`: 单号日评上限配置项（默认 `5`；详见第五节现状说明）

### 3.2 东方财富双 ID 与业务接口边界
1. **双 ID 严格区分（`eastmoney_api.py`）**：
   - `url_id`（从文章 URL `/news/(\d+)` 提取）：用于 `LikeArticle` 点赞与 `GetArticleReadCount` 公开阅读数查询。
   - `postid`（从文章 HTML 中的 `post_id` / `postId` / `data-postid` / `window.articleId` 提取）：用于 `ArticleAndReplyLikeInfo` 查询点赞状态与 `WebReplyArticle` 发评论。
2. **公开阅读数核验接口**：
   - `GET https://caifuhaoapi.eastmoney.com/api/v1/webchannel/Article/GetArticleReadCount?callback=cb855&artcode=<url_id>...`
   - 返回 JSONP 中 `Result.ReadCount`，用于任务前后对比真实公开涨量（直连查询 `proxy=None`）。

### 3.3 本地桌面端 HTTP API（`gui_app.py` 监听 `127.0.0.1:8686`）
- `GET /api/config` / `POST /api/config`：读取/保存 `config.json`（保存后立即遍历 `MULTI_JOBS` 调用 `_reload_proxy_settings_from_disk()` 热更新代理配置）。
- `POST /api/test_proxy`：扫描本机多出口公网 IP + 提取节点 + 并发 `HTTPS CONNECT passport2.eastmoney.com:443` 隧道测活（精准识别 `HTTP 407` 与死节点）。
- `POST /api/jobs/create`：按当前表单创建独立 `MainEngine` 异步任务加入 `MULTI_JOBS`。
- `POST /api/jobs/action`：支持 `pause` / `resume`（先自动保存配置并触发代理热重载） / `stop` / `remove` / `stop_all` / `clear_completed`。
- `POST /api/merge_config` / `POST /api/import_accounts` / `GET /api/pending_accounts`：无损合并备份 `config.json`、批量追加账密、提取尚未抓 Cookie 的待抓新号。
- `POST /api/run`：触发子进程工具（`install_env`、`harvest_direct`、`harvest_new`、`harvest_h`、`harvest`、`probe`）。

---

## 四、关键执行机制与已验证的工程结论

### 4.1 真实浏览器阅读机制（`main_engine.py -> _click_worker_browser`）
1. **资源拦截白名单（实测根因）**：
   - 早期全量拦截 `resource_type == "image"` 导致 162 次访问仅涨 2 阅读。抓包证实东财核心阅读统计像素（`web_click.gif`、`Web_JS.gif`、`web_other.gif`、`CommonRecommend.png`）全部归类为 `image`。
   - 当前 `_abort_heavy` 仅拦截 `media`、`font` 与非埋点的 `.jpg/.jpeg/.webp/.bmp`，**100% 放行 `.gif` 及 `gbapi.eastmoney` / `bdwblog` / `bddtlog` / `huaxiang` / `anonflow` / `articleclick` / `commonrecommend` / `click` / `beacon`**。
2. **生命周期与埋点观测**：
   - 注入隐藏 `navigator.webdriver`、`window.chrome` 与桌面视口 `1366x768`。
   - 等待 `domcontentloaded`（15s）→ `wait_for_load_state("load", 8.5s)` → 平滑滚动 `window.scrollTo({top: 380})` → 被动监听 `page.on("response")` 命中至少 2 个统计回包（`wait_for` 最多 4.5s）→ 再驻留 `1200ms`。若 `beacon_hits == 0` 则判为代理慢/丢包并失效该节点重试。
3. **单篇单 IP 限用 1 次（`max_uses_per_ip = 1`）**：
   - 实测证实东财按访客 IP 对单篇文章去重（同 IP 短时第 2 次访问不计新增）。冷门帖实测开启上述机制后有效转化率由 ~1–3% 提升至 **92%–98.9%**。
4. **`browser` vs `http` 阅读模式差异**：
   - `http` 模式（`EastMoneyAPI.click_article`）仅发起 `GET` 获取 HTML 并校验长度 `>= 1500`，**不执行 JS 埋点**，实测无法稳定推动东财公开 `ReadCount` 增长；仅建议用于极轻量连通测试，正式涨量必须使用 `browser` 模式。

### 4.2 代理池并发与天启策略（`proxy_pool.py -> ProxyPool`）
1. **跨任务锁与接口冷却**：
   - 类级可重入锁 `_CLASS_LOCK = threading.RLock()`，且全进程共享 `_LAST_API_CALL_TS`，强制两次天启 API 调用间隔 **`>= 1.35 秒`**，避免多任务并发启动时撞天启 QPS 限制。
2. **110 秒提前续期与热加载**：
   - 天启短效 IP 标称 180 秒，为防止临界点 407 与超时，代码在 **`TTL_RENEW_SECONDS = 110` 秒**强制整批换新；修改 `proxy_api_url` 后调用 `_reload_proxy_settings_from_disk()` 立即清空旧批次按新链接提取。
3. **不同任务场景的最佳 `num=` 提取数**：
   - **浏览器单帖（4 并发）**：110 秒约跑 35~40 次，设 **`num=30`** 最省不浪费；
   - **浏览器双帖并行（各 4 并发）**：共享同一批 IP 且各计单篇 1 次，设 **`num=30~50`**；
   - **纯串行慢速评论（间隔 1~3 分钟/条）**：110 秒仅发 1~2 条，设 **`num=3~5`** 即可（若组合任务中与阅读同时跑，则按阅读配 `30~40` 共享无浪费）。
4. **白名单与 CGNAT 踩坑结论**：
   - 严禁填写 `ipconfig` 内网虚拟 IP（如 `192.168.x.x`、`198.18.x.x`、`10.0.x.x`），需用 `curl 4.ipw.cn` / `curl ip.sb` 获取公网 IPv4（纯 IPv4 即可，无需转 IPv6）；国内移动宽带 CGNAT 或云电脑重启换 IP 时，强烈推荐填写天启**账密认证（`proxy_user` / `proxy_pass`）**彻底绕开白名单限制。

### 4.3 评论、点赞与验证码接力策略
1. **随机洗牌防固定号风控**：每次启动阅读、点赞、评论及阅读补齐轮次前，均在内存中对可用账号列表执行 `random.shuffle(...)`（不改变 `config.json` 顺序）。
2. **评论随机间隔与 `rc:2` 接力（`_run_standalone_comments`）**：
   - 顺序串行发射，每成功 1 条后抽取 `random.uniform(max(1, 0.15*max_sec), max_sec)` 休眠；**醒来后才调用 `get_proxy_for_account`**，保证长休眠后拿到全新未过期 IP。
   - 若遇 `rc: 2`（点选验证码）：立即将语录塞回队首（`insert(0, base_comment)`），跳过分钟级长等待，仅等 `1.5s` 切换下一个账号继续发射。
3. **登录 5 位字母验证码抓号**：使用 `auto_login_agent.py --direct --batch-size 1` 本机直连绕过 407，人工输入 5 位字母登录后一旦捕获 `ct`/`ut` 立即调用 `immediate_save_cookie` 原子写盘。

---

## 五、生产实测诊断与已知待优化项（下一阶段开发清单）

基于最新无影云电脑（白金款 Plus：**16 核 vCPU / 32 GiB RAM / 10Mbps 默认带宽可升 40Mbps**）真实运行日志与任务看板截图，系统现状如下：
- **已验证表现**：在 2 任务并发（各 4 窗口）下稳定完成 `1000/1000` 真阅读（公开阅读分别推进 `+1549`、`+1618`，含自然流量共振）。
- **已暴露瓶颈与后续开发任务优先级（P0 -> P3）**：

### P0：多任务共享代理池“起始游标撞车”修复（高优先）
- **问题现象（真实日志证据）**：5 个任务同时运行于共享批次 `_SHARED_NODES`（共 20 个 IP）时，每个任务的 `self._cursor` 均从 `0` 开始按完全一致顺序取节点，导致同一秒 5 个无头浏览器同时压死第 0 号天启家宽 IP（触发集体 `Timeout 15000ms`）。
- **改动位置**：`proxy_pool.py`（`ProxyPool.__init__` 与 `get_proxy_for_account` 复制 `_SHARED_NODES` 分支）。
- **建议实现**：当从 `_SHARED_NODES` 同步节点到本地 `self._dynamic_nodes` 时，按实例随机数对节点副本做 `random.shuffle` 或随机偏移 `self._cursor = random.randrange(len(self._dynamic_nodes))`，使多任务错峰分散消耗不同节点。

### P1：高配云主机浏览器并发上限放宽与带宽自适应（高优先）
- **问题现象**：
  1. 当前 `main_engine.py -> _run_standalone_clicks` 硬限制 `browser_conc = max(1, min(max_conc, 6))`（早期为保护 8GB DDR3 老机而设），限制了 16 核 32G + 40Mbps 云主机的单帖吞吐速度。
  2. 在 `10Mbps` 带宽下同时开 5 帖 × 4 并发 = 20 窗口会拉爆出口带宽引发大面积 `15000ms` 超时。
- **改动位置**：`main_engine.py`（`_run_standalone_clicks` 与 `_click_worker_browser`）。
- **建议实现**：
  1. 将单任务浏览器并发上限由 `6` 放宽至 `25 ~ 30`（或改为界面可配置的上限保护），同时在手册/UI 明确标注：`10Mbps` 总窗口建议 `8~12`、`40Mbps` 总窗口建议 `24~36`。
  2. 页面 `goto` 超时从 `15000ms` 适度放宽至 `20000ms ~ 22000ms`，减少天启慢速家宽节点误杀；进一步优化同任务多窗口的 Context 生命周期开销。

### P2：按“东财公开阅读数实际涨量”精准闭环停机（商业级准确度）
- **需求来源**：目前阅读任务按“本地浏览器成功触发埋点次数 == `target_clicks`”即停机，若用户希望精确控制公开数字涨够目标，需要闭环核验。
- **建议实现**：增加可选开关（如 `stop_on_public_read_target`），在 `_run_standalone_clicks` 补齐循环内定时拉取 `GetArticleReadCount`，按 `live_rc - read_count_start >= target_clicks` 判定完成（需注意：若文章自带高自然流量，需提供“按实际涨量停”与“按请求完成停”双选项让用户自选）。

### P3：前后端一致性与日评计数落地（体验完善）
- **文案对齐**：Web 工作台卡片中（如 `App.tsx` 与 `TaskConsoleView.tsx`）仍残留历史文案 `"每IP限用2次自动换新"`，实际 Python 引擎已升级为 `单篇每IP限1次`（`get_proxy_for_account(account, 1)`），后续修改 UI 时需同步更正。
- **日评上限持久化**：`settings.daily_comment_limit`（默认 `5`）目前在桌面端仅作 `config.json` 存储字段与前端模拟器限制，Python 引擎尚依赖随机洗牌 + `rc:2` 换号；如需严格跨重启按日计数，可在 `config.json` 或独立状态文件记录 `{date, username: count}` 并在 `_run_standalone_comments` 中过滤超限账号。

---

## 六、开发与构建验证流水线（新模型接手自检标准）

若在 **Web 工作台源码仓库** 修改 `/src/engine/pythonExporter.ts` 或前端组件，交付前必须完成以下全部校验：
1. **逻辑与导出模板单测**：执行 `npx --yes tsx --test src/engine/eastmoneyEngine.test.ts`（确保全部用例通过）。
2. **TypeScript 与生产构建**：执行 `npm run lint`（`tsc --noEmit`）与 `npm run build`（Vite 构建）。
3. **Python 语法与运行时校验**：将 `generateRepairedPythonFiles(...)` 导出到临时目录，运行 `python3 -m py_compile *.py` 验证无语法错误，并对 `ProxyPool` / `MainEngine` 核心改动执行单元验证后清理临时目录。
4. **交付提醒**：始终指引用户通过 Web 端下载 **「防崩升级补丁 (.zip · 不覆盖 config.json)」** 解压覆盖原运行目录，严禁让用户误覆 `config.json`。

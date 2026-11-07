# 滨江大桥数字孪生智控平台

> 英文简称 **Binjiang Bridge Digital Twin (BDT)**。工程目录、npm 包名与 Docker 工程名沿用 `bridge-digital-twin`，避免影响既有部署卷与脚本。

按 `docs/需求文档/智慧桥梁数字孪生系统_需求架构与数据库设计（合订本）.md` 实现的可运行工程。
一个页面、五幕动画：**骨架生长 → 桥面合龙 → 车辆加载 → 结构透视 → 稳态巡检**；
左栏讲「这座桥是什么」，右栏讲「这座桥现在怎么样」，中间讲「这座桥长什么样、里面是什么样」。

> 完整设计图与分类文档见 [第七节 · 文档索引](#七文档索引)；原始需求合订本保留在 `docs/需求文档/`。

## 一、架构与目录

```
bridge-digital-twin/
├── docker-compose.yml            # 6.5 部署拓扑：PG/Redis/TDengine/MinIO/EMQX/Nginx/2 服务/仿真/监控
├── .env.example                  # 全部端口与账号
├── deploy/
│   ├── postgres/init/            # 01_schema.sql（17 张表）+ 02_seed.sql（与效果图 1:1）
│   ├── tdengine/init/01_taos.sql # shm_metric 超级表 + 子表
│   ├── emqx/acl.conf
│   ├── nginx/nginx.conf          # 静态资源 + /api/v1 分流 + MQTT WebSocket 代理
│   ├── prometheus/  grafana/
├── backend/
│   ├── svc-bridge/               # Quarkus 3.8 · 8081：档案/构件/拉索/节段/车道/视点/剖切/五幕/仿真
│   └── svc-shm/                  # Quarkus 3.8 · 8082：MQTT 清洗/聚合/阈值告警/历史查询
├── simulator/                    # Python 3.11 + SimPy：车流 + SHM 联合仿真
│   ├── main.py  traffic_sim.py  shm_sim.py  bridge_model.py  mqtt_client.py
├── frontend/                     # Vite 5 + TypeScript + Three.js r168
│   └── src/
│       ├── main.ts               # 应用层编排（Store + Actions + 数据源）
│       ├── config/  types/       # 桥梁参数、文案、全链路数据契约
│       ├── three/                # SceneManager / BridgeBuilder / Timeline / acts /
│       │                         # CameraDirector / TrafficEngine / SensorLayer /
│       │                         # ClippingController / HeatMapper / Picker / Viewport
│       ├── panels/               # 三种面板样式、顶栏、HUD、构件树、缩略图、弹窗
│       ├── store/  api/  mqtt/  data/  styles/
└── docs/
    ├── 需求文档/                 # 原始合订本 + SQL 副本
    ├── 01-架构与设计图/          # 9 张 SVG：架构 / 功能 / 效果 / 数据库 / 部署 / 链路 / 告警 / 仿真 / 路线
    ├── 02-开发文档/              # 功能说明 · 接口 · 数据字典 · 开发路线图
    ├── 03-部署与运维/            # 启动指南 · 中间件 · 运维手册 · FAQ
    └── 04-测试与规范/            # 测试与验收清单 · 术语表
```

数据流（文档 6.4）：

- **链路 A** `SimPy → sensor/raw/bridge/{code} → svc-shm 清洗 → 实时值/时序/阈值判定 → realtime/bridge/{code} → 前端热力着色与面板`
- **链路 B** `traffic/vehicle/{code}（每秒稀疏状态 t + speed）→ 前端 CatmullRom 补帧 → InstancedMesh`
- **链路 C** `GET /api/v1/history/series → 前端 24h 迷你图 / 回放`

## 二、快速开始

### 方式 1：零中间件演示（推荐，5 秒可看效果）

```bash
cd frontend
npm install
npm run dev
# 打开 http://localhost:5173
```

默认 `VITE_DATA_MODE=mock`，内置数据源完整驱动：五幕动画、72 台车、150 测点、
热力着色、告警防抖与自动恢复、面板数值滚动。不需要 Docker、数据库或 MQTT。

### 方式 2：本机全链路联调（无 Docker）

```bash
# 终端 1：档案服务
cd backend/svc-bridge && mvn quarkus:dev
# 终端 2：监测清洗服务（EMQX 不可达时自动降级为本地快照）
cd backend/svc-shm && mvn quarkus:dev
# 终端 3：仿真器（--dry-run 可不装依赖、不连 broker，仅打印报文）
cd simulator && pip install -r requirements.txt && python main.py --dry-run --duration 10
# 终端 4：前端 live 模式
cd frontend && cp .env.example .env   # 把 VITE_DATA_MODE 改为 live
npm run dev                          # Vite 已配置 /api/v1 与 /mqtt 代理
```

`live` 模式下若后端或 MQTT 不可达，会自动回退到本地数据源并在顶栏提示，不会白屏。

### 方式 3：Docker Compose 全栈

```bash
cp .env.example .env
docker compose up -d
# 前端 http://localhost  | EMQX Dashboard :18083 | Grafana :3000 | MinIO :9001
```

首次启动会自动执行 `01_schema.sql`、`02_seed.sql`、`01_taos.sql`。

## 三、接口示例

```bash
curl http://localhost:8081/api/v1/bridges/BR-DEMO-01/bootstrap   # 首屏整包
curl http://localhost:8081/api/v1/bridges/BR-DEMO-01/cables       # 72 根拉索
curl http://localhost:8081/api/v1/bridges/BR-DEMO-01/anim-stages  # 五幕配置
curl -X PUT "http://localhost:8081/api/v1/sim/plans/SIM-BRIDGE-01/density?density=80"

curl http://localhost:8082/api/v1/bridges/BR-DEMO-01/metrics
curl http://localhost:8082/api/v1/points?groupCode=TOWER
curl "http://localhost:8082/api/v1/history/series?points=PTS-C-01,PTS-C-02&interval=1m"
curl http://localhost:8082/q/health                                # 各中间件连通性
```

## 四、已实现功能（按文档 5 章模块）

| 模块 | 实现 |
|---|---|
| BRG | 档案/构件树三级/三套模型绑定/72 拉索/42 节段/12 车道曲线/6 视点/2 剖切方案/五幕配置/模型资源登记 |
| VIS | 骨架按施工顺序生长（`setDrawRange`）、线框转实体、42 节段从两侧合龙、白闪 + Bloom、车辆渐入、桥底剖切（`ClippingPlane` 只切外壳 + 青色描边）、四室箱梁内部、线框/实体切换、构件树显隐、热力着色、射线拾取 + OutlinePass、关键帧运镜 + 用户接管 8s、传感器三态、Bloom/ACES、生长缩略图 |
| TRA | SimPy 泊松到达、85%/15% 车型、12 车道 `InstancedMesh`（车辆总 DrawCall ≤ 4）、密度滑块、车辆信息卡、拖尾、车道占用统计、稀疏报文本地补帧 |
| SHM | 9 类字典、150 测点、原始报文校验清洗（脏数据丢弃计数）、实时值、时序历史、整桥快照、指标聚合、物理规律仿真数据 |
| ALM | 连续 3 次触发 / 连续 3 次恢复、告警推送与弹窗、确认/忽略、健康评分、疲劳指数、缺陷台账 |
| WEB | 三栏 320/flex/340 + 88px HUD、三种面板组件、0.6s 数值滚动、加载进度、轨道 + WASD、四幕时间轴、5 项图例、车流控件、全屏与截图、响应式降级 |
| RPT | 降采样时序查询、区间统计（max/min/avg/P95/超限）、24h 迷你图、历史快照 |
| SYS | `/q/health` 聚合连通性、`/q/metrics`、系统配置、操作日志 |

## 五、与文档的两处工程取舍（可平滑替换）

1. **桥梁几何由 `BridgeBuilder.ts` 程序化生成**，而非 Blender 导出的 9 个 GLB。
   文档 6.7 的 `.blend` 资产不在仓库中；程序化建模仍严格按 1.2 参数分层（塔/墩/承台/桩基/
   42 节段外壳/内部四室/72 拉索/支座/护栏），并保留 `modelSkeletonCode / modelSolidCode /
   modelInnerCode` 契约，后续把 GLB 放进 MinIO 后只需替换几何来源。
2. **后端默认内存仓储**（`RuntimeStore` / `RuntimeState`），使 P0 阶段无需任何中间件即可
   `mvn quarkus:dev` 联调。DDL、Redis Key 设计、TDengine 超级表均已落地；
   设 `bdt.storage=cluster` 后可把仓储实现换成 JDBC/Redis/TDengine/ MinIO，REST 契约不变。

> 其余（有限元求解、真实硬件、多桥集群、视频流）按文档 1.4 明确不做。

## 六、验收对照

- 视觉 V-01~V-12：三栏/色板/文案/四幕时间轴/图例/内部透视热力色带与测点表/黄色支座/橙色传感器与虚线/剖切四室箱梁均已按文档实现。
- 功能 F-01~F-11：12.5s 自动播放、重播/暂停/0.5x~2x、跳幕、72 台车 12 车道、密度滑块 1s 生效、2.2s 剖切、构件拾取联动、2s 内热力刷新、连续 3 次告警弹窗、24h 趋势查询、帧率 <20 时自动关闭后处理。
- 顶栏「模拟告警」按钮可现场演示完整告警生命周期（触发 → 确认/忽略 → 自动恢复）。

## 七、文档索引

`docs/` 按「设计图 / 开发文档 / 部署与运维 / 测试与规范」四类归档，原始需求合订本保留不动。

### 7.1 设计图（9 张 SVG · `docs/01-架构与设计图/`）

| 图 | 内容 | 建议阅读时机 |
|---|---|---|
| [01-系统架构图](docs/01-架构与设计图/01-系统架构图.svg) | 用户/接入/前端/服务/消息仿真/数据/监控六层 + 三条链路 | 首次了解系统 |
| [02-全功能结构图](docs/01-架构与设计图/02-全功能结构图.svg) | BRG/VIS/TRA/SHM/ALM/WEB/RPT/SYS 八大模块与需求编号 | 需求对照 |
| [03-运行效果示意图](docs/01-架构与设计图/03-运行效果示意图.svg) | 三栏 HUD 线框、三种面板样式、五幕时间轴、图例与尺寸 | 前端改版 |
| [04-数据库关系图](docs/01-架构与设计图/04-数据库关系图.svg) | 17 张表分组、字段与外键主线 | 建表/改字段 |
| [05-部署拓扑图](docs/01-架构与设计图/05-部署拓扑图.svg) | 11 容器、端口、卷、healthcheck 依赖 | 部署前 |
| [06-数据链路流程图](docs/01-架构与设计图/06-数据链路流程图.svg) | 链路 A 监测 / B 车流 / C 回放与各自降级 | 联调排障 |
| [07-告警生命周期图](docs/01-架构与设计图/07-告警生命周期图.svg) | 3 次防抖状态机、前端联动、时序示例 | 告警功能开发 |
| [08-仿真时序图](docs/01-架构与设计图/08-仿真时序图.svg) | 5 个参与者之间的 1s / 2s / 按需消息序列 | 时序排查 |
| [09-版本路线图](docs/01-架构与设计图/09-版本路线图.svg) | P0 已交付 / P1 生产化 / P2 扩展 | 规划迭代 |

### 7.2 开发文档（`docs/02-开发文档/`）

| 文档 | 内容 |
|---|---|
| [01-项目功能详细说明](docs/02-开发文档/01-项目功能详细说明.md) | 三视图、五幕动画、八大模块逐项、交互清单、数据源降级、视觉规范 |
| [04-接口文档](docs/02-开发文档/04-接口文档.md) | 41 个 REST 端点、Nginx 分流、7 类 MQTT 主题、响应示例、数据契约 |
| [05-数据库设计与数据字典](docs/02-开发文档/05-数据库设计与数据字典.md) | 17 张表字段字典、枚举、Redis Key、TDengine 模型、种子数值、索引 |
| [10-开发路线图](docs/02-开发文档/10-开发路线图.md) | P0/P1/P2 任务、风险、几何与仓储替换指引、明确不做的范围 |

### 7.3 部署与运维（`docs/03-部署与运维/`）

| 文档 | 内容 |
|---|---|
| [02-项目启动运行指南](docs/03-部署与运维/02-项目启动运行指南.md) | 三种启动方式、端口速查、配置说明、10 条启动自检 |
| [03-中间件配置与安装](docs/03-部署与运维/03-中间件配置与安装.md) | PG/Redis/TDengine/MinIO/EMQX/Nginx/Prometheus/Grafana 配置与验证命令 |
| [07-运维手册](docs/03-部署与运维/07-运维手册.md) | 巡检、日志、备份恢复、监控规则、故障矩阵、升级回滚 |
| [08-常见问题解答](docs/03-部署与运维/08-常见问题解答.md) | 启动构建、前端 3D、后端数据、部署运维、范围规划共 30+ 问答 |

### 7.4 测试与规范（`docs/04-测试与规范/`）

| 文档 | 内容 |
|---|---|
| [06-测试与验收清单](docs/04-测试与规范/06-测试与验收清单.md) | 构建实测、视觉 V-01~12、功能 F-01~11、性能/降级/接口验收、已知限制 |
| [09-术语表](docs/04-测试与规范/09-术语表.md) | 业务/3D/后端术语、缩写、项目编码规则与状态枚举 |

### 7.5 原始需求（`docs/需求文档/`）

`智慧桥梁数字孪生系统_需求架构与数据库设计（合订本）.md`，以及 `01_schema.sql`、`02_seed.sql`、`03_taos_schema.sql` 副本。

### 7.6 推荐阅读路径

- **新人上手**：[启动运行指南](docs/03-部署与运维/02-项目启动运行指南.md) → [功能详细说明](docs/02-开发文档/01-项目功能详细说明.md) → [系统架构图](docs/01-架构与设计图/01-系统架构图.svg) → [验收清单](docs/04-测试与规范/06-测试与验收清单.md)。
- **二次开发**：[接口文档](docs/02-开发文档/04-接口文档.md) → [数据字典](docs/02-开发文档/05-数据库设计与数据字典.md) → [开发路线图](docs/02-开发文档/10-开发路线图.md) → [术语表](docs/04-测试与规范/09-术语表.md)。
- **部署排障**：[部署拓扑图](docs/01-架构与设计图/05-部署拓扑图.svg) → [中间件配置](docs/03-部署与运维/03-中间件配置与安装.md) → [运维手册](docs/03-部署与运维/07-运维手册.md) → [FAQ](docs/03-部署与运维/08-常见问题解答.md)。

## 八、三维资产绑定

来源：`docs/需求文档/桥梁数字孪生资产可用性核查清单.docx`。原计划 13 个 GLB 逐一核查后，只有**车辆（V01–V05）与通用件（G01–G04）可免费商用（CC0）下载**；桥梁主体（桥塔/箱梁/拉索/桥墩）无现成资产，由 `BridgeBuilder.ts` 按工程参数程序化生成。

### 8.1 资产可用性核查结论（13 个 GLB）

| 编号 | 资源号 | 类型 | 体量 | 可用性 | 项目去向 |
|---|---|---|---|---|---|
| V01 | 32487 | 城市轿车 | 998KB / 31,000 面 | 可下载 CC0 | **已接入**：`cityCar`（桥头单台近景特写，不进车流实例） |
| V02 | 13964 | 厢式货车 | 184KB / 6,816 面 | 可下载 CC0 | 已登记，保留为回退资产（默认车流改用本地 3 款车型） |
| V03 | 13967 | 平板救援车 | 171KB / 6,536 面 | 可下载 CC0 | **已接入**：`rescueTruck`（桥头近景特种车） |
| V04 | 13969 | 后装垃圾车 | 186KB / 6,840 面 | 可下载 CC0 | **已接入**：`garbageTruck`（桥头近景特种车） |
| V05 | 25138 | 小型厢式货车 | 20KB / 604 面 | 可下载 CC0 | 已登记，保留为回退资产（默认车流改用本地 3 款车型） |
| G01 | 15210 | 直段双波形护栏 | 4KB / 60 面 | 可下载 CC0 | **已接入**：`railing`（主梁两侧按 21m 阵列） |
| G02 | 15211 | 转角双波形护栏 | 24KB / 480 面 | 可下载 CC0 | **已接入**：`cornerRailing`（桥端 4 个转角） |
| G03 | 32550 | 升降臂道闸 | 18KB / 404 面 | 可下载 CC0 | **已接入**：`gate`（桥头限流，两端各一处） |
| G04 | 27843 | 厂房钢柱 | 7KB / 96 面 | 可下载 CC0 | **已接入**：`steelColumn`（桥侧检修支架） |
| B01 | — | 桥塔 | ~6,500 面 | 无现成资产 | 程序化生成（参数化骨架） |
| B02 | — | 箱梁外壳 | ~5,200 面 | 无现成资产 | 程序化生成 |
| B03 | — | 箱梁内部 | ~3,800 面 | 无现成资产 | 程序化生成（结构透视） |
| B04 | — | 拉索 | ~1,200 面 | 无现成资产 | 程序化生成（伞形/竖琴形） |
| B05 | — | 桥墩 | ~2,400 面 | 无现成资产 | 程序化生成 |

> 直链格式：`https://cdn.3dassets.dev/assets/{资源号}/v1/model.glb`。9 个 CC0 GLB 已通过 `scripts/download_assets.*` 下载到 `frontend/public/assets/models/`（约 1.6 MB，glTF 2.0、无 Draco，构建时自动拷入 `dist`）。

### 8.2 已接入绑定

`frontend/src/three/AssetLoader.ts` 启动预载 `config/index.ts` 的 `ASSETS`（9 个 CC0 + 5 个本地轻资产共 14 个 GLB），3 个重资产由 `HERO_ASSETS` 在 `AssetProps.ts` 后台异步加载；成功则替换程序化几何，缺失/失败时回退到程序化兜底（控制台提示 `[assets] GLB 加载失败，使用程序化兜底`）：

- 车流 ← 本地 `carSkyline` / `carSupra` / `carSilvia`（`toVehicleModel()` 合并整车几何、长轴对齐 X、落地；按 `vid` 分配车型，3 个 `InstancedMesh`）
- `railing` 护栏 ← G01 `15210.glb`（最长边 21m，主梁两侧按 21m 一段阵列）
- `gate` 道闸 ← G03 `32550.glb`（最长边 8m，桥头两端各一处）
- `cityCar` / `rescueTruck` / `garbageTruck` / `showroomWhite` / `flatbed` ← 桥头展示区，由 `AssetProps.ts` 摆放
- `cornerRailing` / `steelColumn` ← G02/G04（桥端转角与桥侧检修支架）
- `moskvich` / `redSedan` / `titan` ← 异步加载完成后追加到桥头展示区

> 车辆 DrawCall = 3 车型 + 1 拖尾 = 4，符合 WEB-004；车流几何来自整车合并，不再出现「只取首个网格变成轮子/车门」的问题。

### 8.3 下载与许可

- **下载**：`scripts/download_assets.ps1`（PowerShell）/ `scripts/download_assets.sh`（Bash）覆盖全部 9 个资源号（含 G02 `15211`），文件落入 `frontend/public/assets/models/`，重启前端即生效；已存在跳过、失败自动清理便于重试。
- **本地资产**：`docs/glb/` 下 8 款车已落地到 `frontend/public/assets/models/cars/`（约 39.3 MB，自包含 glTF 2.0、无 Draco），清单、面数与归一化见 `ASSETS.md`；不经过下载脚本。其中 3 个重资产（约 36.6 MB）由 `HERO_ASSETS` 后台异步加载，不阻塞首屏。
- **清单与许可**：9 个 CDN 资产为 CC0 1.0，可商用、可修改、无需署名；**本地 8 款车文件内无 `copyright` / `license` 元数据，授权待确认，仅用于内部演示，商用交付前须逐件确认**。
- **未接入**：桥梁主体（B01–B05）、拉索与传感器按清单第 4/5 章程序化生成；文档 2.3 的整桥参考模型为 CC BY 4.0 且需署名，未纳入项目。

# 三维资产清单与绑定说明

来源：`docs/需求文档/桥梁数字孪生资产可用性核查清单.docx`（第 2 章表 2 / 表 3、第 7 章许可与署名）。

**核查结论**：原计划 13 个 GLB 中，仅车辆 V01–V05 与通用件 G01–G04 共 **9 个**为 CC0 1.0 可直接下载（可商用、可修改、无需署名）；桥塔、箱梁、拉索、桥墩与传感器无可用现成资产，由前端按工程参数程序化生成。

9 个 GLB 已下载至本目录（约 1.6 MB），均为 glTF 2.0，仅使用 `KHR_mesh_quantization`（V01 另有 `KHR_materials_transmission`），无 Draco 压缩，`GLTFLoader` 可直接加载。

## 已接入资产台账（9 个）

| 放入本目录的文件 | 编号 / 资源号 | 资产名称 | 体量 / 三角面 | 绑定位置 | 归一化 |
|---|---|---|---|---|---|
| `25138.glb` | V05 / 25138 | 小型厢式货车 | 20 KB / 604 | `carA` → 轿车类车流 `InstancedMesh` | 最长边 4.8m |
| `13964.glb` | V02 / 13964 | 厢式货车 | 184 KB / 6,816 | `carB` → 货车类车流 `InstancedMesh`（建议减面至 ~1,500 面） | 最长边 9.5m |
| `32487.glb` | V01 / 32487 | 城市轿车（三厢三门） | 998 KB / 31,000 | `cityCar` → 桥头单台近景特写 | 最长边 4.8m |
| `13967.glb` | V03 / 13967 | 平板救援车 | 171 KB / 6,536 | `rescueTruck` → 桥头近景车 | 最长边 7.6m |
| `13969.glb` | V04 / 13969 | 后装垃圾车 | 186 KB / 6,840 | `garbageTruck` → 桥头近景车 | 最长边 7.6m |
| `15210.glb` | G01 / 15210 | 直段双波形护栏 | 4 KB / 60 | `railing` → 主梁两侧，按 21m 一段阵列 | 最长边 21m |
| `15211.glb` | G02 / 15211 | 转角双波形护栏 | 24 KB / 480 | `cornerRailing` → 桥端 4 个转角 | 最长边 6m |
| `32550.glb` | G03 / 32550 | 升降臂道闸 | 18 KB / 404 | `gate` → 桥头两端各一处 | 最长边 8m |
| `27843.glb` | G04 / 27843 | 厂房钢柱 | 7 KB / 96 | `steelColumn` → 桥侧检修支架 4 根 | 最长边 8m |

许可：以上 9 个均为 **CC0 1.0**，直链 `https://cdn.3dassets.dev/assets/{资源号}/v1/model.glb`。文档第 2.3 节的整桥参考模型为 CC BY 4.0、需登录或署名，**未纳入本项目**。

## 接入方式

- 登记入口：`frontend/src/config/index.ts` 的 `ASSETS`（同步预载）与 `HERO_ASSETS`（异步懒加载）。
- 车流实例：`Viewport.ts` 用 `toVehicleModel()` 把本地 3 款车型（Skyline / Supra / Silvia）**合并整车全部网格**后注入 `TrafficEngine`，按 `vid` 稳定分配车型；每种车型 1 个 `InstancedMesh`，车辆 DrawCall = 3 + 拖尾 1。
- 桥体静态件：G01 / G03 在 `BridgeBuilder.ts` 用 `toStaticProp()` 阵列 / 双端摆放，成功时隐藏程序化护栏占位。
- 静态展示：`AssetProps.ts` 用 `toGroundedProp()` 落地、把长轴旋到 X 后挂到桥梁根节点；重资产由 `preloadAsset()` 后台加载完成后追加，不阻塞首屏。
- 缺失/失败时逐件跳过并回退到程序化几何，控制台输出 `[assets] GLB 加载失败，使用程序化兜底：...`。

## 本地导入车辆（docs/glb → frontend/public/assets/models/cars/）

| 文件 | 三角面 | 体量 | 用途 | 归一化 |
|---|---|---|---|---|
| `low_poly_nissan_skyline_gt-r_viii_r32.glb` | 4,756 | 0.35 MB | 车流车型 1 | 4.6m |
| `low_poly_toyota_supra_jza80_mark4_1994.glb` | 11,381 | 0.98 MB | 车流车型 2 | 4.8m |
| `nissan_silvia_s13.glb` | 11,618 | 0.49 MB | 车流车型 3（保留原贴图） | 4.5m |
| `glbxz_com.glb` | 17,633 | 0.75 MB | 桥头展示车 | 4.8m |
| `modelNew.glb` | 272 | 0.12 MB | 桥头车斗道具（不完整车体） | 4.2m |
| `moskvich_407.glb` | 31,993 | 5.78 MB | 桥头展示车（异步） | 4.8m |
| `glbxz_com_glbxz_com.glb` | 260,583 | 9.97 MB | 桥头展示车（异步） | 4.8m |
| `nissan_titan.glb` | 305,444 | 20.86 MB | 桥头展示车（异步） | 5.6m |

全部为自包含 glTF 2.0（贴图内嵌、无 Draco、无必需扩展、无动画），实测 8 个均可由 `GLTFLoader` 加载。原始单位尺度差异极大（1.3～3738 单位），故统一按最长边归一化、把长轴从 Z 旋到 X、底面落到 `y=0`。`nissan_silvia_s13` 为单材质带贴图，合并几何时保留 UV 与贴图；其余车流车型按材质基础色生成顶点色。

> **授权提示**：这 8 个文件内均无 `copyright` / `license` 元数据，来源为 Sketchfab 导出与 glbxz.com，与上面 9 个 CC0 资产不同。**仅用于内部演示，商用交付前须逐件确认授权**。3 个重资产合计约 36.6 MB，采用异步加载；如需生产使用，建议先减面/压缩贴图。

## 下载 / 更新

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download_assets.ps1
```

```bash
bash scripts/download_assets.sh
```

两个脚本都覆盖全部 9 个资源号（含 G02 的 `15211`）：`25138 13964 13967 13969 32487 15210 15211 32550 27843`；已存在的文件会跳过，下载失败会删除空文件并在下次运行时重试。本地 8 款车为手工导入，不经过下载脚本。Docker 全栈需在**构建 frontend 镜像前**放好这些文件。

## 说明

- 资产文件缺失或加载失败时，前端自动回退到程序化几何，功能不受影响。
- 若真实模型轴向 / 尺寸与场景不符，在 `frontend/src/three/AssetLoader.ts` 的 `toVehicleModel` / `toStaticProp` / `toGroundedProp` 中调整缩放与平移。
- 若后续引入 Draco 压缩资产，需在 `AssetLoader` 配置 `DRACOLoader` 解码器路径。
- GLB 内嵌的车门、车轮等动画当前未播放（静态道具与 `InstancedMesh` 均不驱动骨骼/节点动画）。

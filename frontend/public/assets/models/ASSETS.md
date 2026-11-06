# 三维资产清单与绑定说明

来源：`docs/需求文档/桥梁数字孪生资产可用性核查清单.docx`。

**核查结论**：原计划 13 个 GLB 中，只有通用件（车辆 V01–V05、护栏/道闸/钢柱 G01–G04）可免费商用（CC0）下载；
桥梁主体（桥塔、箱梁、拉索、桥墩）无现成资产，由前端按 1.2 参数程序化生成。

## 已接入绑定的资产

| 放入本目录的文件 | 资源编号 | 类型 | 绑定位置 | 归一化 |
|---|---|---|---|---|
| `25138.glb` | V05 小型厢式货车（604 面） | 车辆 car_a | 车流 InstancedMesh（轿车类） | 最长边缩放到 4.8m |
| `13964.glb` | V02 厢式货车（6,816 面） | 车辆 car_b | 车流 InstancedMesh（货车类） | 最长边缩放到 9.5m（建议先减面至 ~1,500 面） |
| `15210.glb` | G01 直段双波形护栏（60 面） | 通用件 | 主梁两侧护栏，按 21m 一段阵列 | 最长边缩放到 21m |
| `32550.glb` | G03 升降臂道闸（404 面） | 通用件 | 桥头限流（两端各一处） | 最长边缩放到 8m |

## 参考候选（未默认接入）

`32487.glb`（V01 城市轿车，31k 面，仅单台特写）、`13967.glb`（V03 平板救援车）、
`13969.glb`（V04 后装垃圾车）、`27843.glb`（G04 厂房钢柱）。如需使用，下载到此目录后，
在 `frontend/src/config/index.ts` 的 `ASSETS` 中补登记，并在 `BridgeBuilder` / `TrafficEngine` 接入。

## 下载

联网环境下运行仓库根目录的下载脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/download_assets.ps1
```

```bash
bash scripts/download_assets.sh
```

直链格式：`https://cdn.3dassets.dev/assets/{编号}/v1/model.glb`。

## 说明

- 资产文件缺失（本环境无外网）时，前端自动回退到程序化几何，功能不受影响。
- GLB 加载失败会在控制台输出 `[assets] GLB 加载失败，使用程序化兜底：...`。
- 若真实模型轴向 / 尺寸与场景不符，在 `frontend/src/three/AssetLoader.ts` 的
  `toInstancedGeometry` / `toStaticProp` 中调整缩放与平移即可。
- 若 GLB 为 Draco 压缩，需在 `AssetLoader` 配置 `DRACOLoader` 解码器路径。

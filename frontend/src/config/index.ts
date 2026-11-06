import type {
  ActDef, AnimStage, Bootstrap, Bridge, BridgeComponent, BridgeMetrics, Cable, ClipPlan,
  GirderSegment, Inspection, Lane, ModelResource, PointType, ShmPoint, Viewpoint, Vec3,
} from '../types';

export const BRIDGE_CODE = 'BR-DEMO-01';

/** 文档 2.1.1 色板（Three.js 侧使用，CSS 侧见 tokens.css） */
export const COLORS = {
  bgDeep: 0x050a18,
  bgMid: 0x0a162e,
  bgGlow: 0x10203f,
  cyan: 0x00e5ff,
  blue: 0x2c7be5,
  blueLight: 0x4da3ff,
  orange: 0xff8a1e,
  orangeLight: 0xffb444,
  supportYellow: 0xf2c14e,
  green: 0x2ed47a,
  warnYellow: 0xffc53d,
  red: 0xff4d4f,
  purple: 0x7b8cff,
  blueprint: 0x5aa0ff,
  concrete: 0xb9c4d2,
  girder: 0x8e9aab,
  asphalt: 0x2a3038,
  inner: 0xc8d3e0,
  pier: 0x8b97a6,
  pile: 0x6e7a88,
  railing: 0x6a7686,
  skyLine: 0x0e1b33,
} as const;

/** 文档 1.2 桥梁对象参数 / 建模坐标约定：X 沿桥轴、Y 高度、Z 横向，跨中为原点 */
export const GEO = {
  length: 840,
  halfLength: 420,
  deckY: 58,
  girderH: 4,
  girderTopY: 58,
  girderBottomY: 54,
  deckW: 24,
  halfDeck: 12,
  towerX: 240,
  towerH: 216,
  towerLegZ: 11,
  towerLegW: 8,
  segmentCount: 42,
  segmentLen: 20,
  cableCount: 72,
  cablesPerFace: 18,
  waterY: -2,
  laneOffsets: [-8.75, -5.25, -1.75, 1.75, 5.25, 8.75] as const,
} as const;

/** 文档 3.1 总时间轴：12.5s，之后进入稳态巡检循环 */
export const ACTS: ActDef[] = [
  { code: 'ACT-1', name: '骨架生成', startMs: 0, endMs: 4500 },
  { code: 'ACT-2', name: '桥面合龙', startMs: 4500, endMs: 7500 },
  { code: 'ACT-3', name: '车辆加载', startMs: 7500, endMs: 9500 },
  { code: 'ACT-4', name: '结构透视', startMs: 9500, endMs: 12500 },
  { code: 'ACT-5', name: '稳态巡检', startMs: 12500, endMs: 0 },
];

export const HUD_ACTS = ACTS.slice(0, 4).map(a => ({ code: a.code, name: a.name, endMs: a.endMs }));

/** 文档 10.4 文案资产表 */
export const COPY = {
  title: '智慧桥梁数字孪生平台',
  online: 'BRIDGE-2026 ｜ 在线',
  leftV1Title: '桥梁健康监测',
  leftV2Title: '结构信息',
  leftV3Title: '桥梁档案',
  rightV1Title: '车流与运维',
  rightV2Title: '实时状态',
  rightV3Title: '检测与预警',
  innerViewTitle: '内部透视',
  growthTitle: '结构生长',
  trafficSim: '车流模拟',
  maintenanceAdvice: '检查箱梁 B-03',
} as const;

/** 文档 2.6.2 图例 */
export const LEGEND = [
  { label: '拉索', color: '#00E5FF', shape: 'line' },
  { label: '箱梁', color: '#F2C14E', shape: 'rect' },
  { label: '支座', color: '#F2C14E', shape: 'block' },
  { label: '传感器', color: '#FF8A1E', shape: 'dot' },
  { label: '车辆轨迹', color: '#FF8A1E', shape: 'dash' },
] as const;

/** 与三张效果图完全一致的初始指标（文档 2.4 / 2.5 / 7.9） */
export const INITIAL_METRICS: BridgeMetrics = {
  stress: 42,
  cableForce: 1280,
  deflection: 0.86,
  temperature: 21.4,
  windSpeed: 3.2,
  frequency: 0.48,
  damping: 2.1,
  trafficPerHour: 1286,
  fatigueIndex: 38,
  healthGrade: 'A',
  healthScore: 96,
  vehicleCount: 36,
  avgSpeed: 58,
  occupancy: 0.62,
  eventCount: 1,
  scanProgress: 94,
  defectCount: 2,
  keyArea: '箱梁 B-03',
  riskLevel: '低',
  nextInspectDate: '2026-11-12',
  maintenanceAdvice: '检查箱梁 B-03',
  ts: Date.now(),
};

/** 文档 2.5.4 内部透视测点表（单位 MN） */
export const CABLE_TABLE: { pointCode: string; compCode: string; value: number; threshold: number }[] = [
  { pointCode: 'PTS-C-01', compCode: 'C-01', value: 1.290, threshold: 1.350 },
  { pointCode: 'PTS-C-02', compCode: 'C-02', value: 1.286, threshold: 1.350 },
  { pointCode: 'PTS-C-03', compCode: 'C-03', value: 1.302, threshold: 1.360 },
  { pointCode: 'PTS-C-04', compCode: 'C-04', value: 1.278, threshold: 1.350 },
  { pointCode: 'PTS-C-05', compCode: 'C-05', value: 1.294, threshold: 1.350 },
  { pointCode: 'PTS-C-06', compCode: 'C-06', value: 1.288, threshold: 1.350 },
];

/** 文档 2.5.4 热力图色带刻度 */
export const HEAT_SCALE = ['#2B1B7A', '#4C2BD0', '#D63AA8', '#FF6B3D', '#FFD400'] as const;

export const POINT_TYPES: PointType[] = [
  { ptypeCode: 'STRESS', ptypeName: '结构应力', unit: 'MPa', decimals: 1, color: '#00E5FF', sortNo: 1 },
  { ptypeCode: 'CABLE_FORCE', ptypeName: '索力', unit: 'kN', decimals: 0, color: '#2C7BE5', sortNo: 2 },
  { ptypeCode: 'DEFLECTION', ptypeName: '挠度', unit: 'm', decimals: 2, color: '#2ED47A', sortNo: 3 },
  { ptypeCode: 'FREQUENCY', ptypeName: '振动频率', unit: 'Hz', decimals: 2, color: '#FFB444', sortNo: 4 },
  { ptypeCode: 'DAMPING', ptypeName: '阻尼比', unit: '%', decimals: 1, color: '#7B8CFF', sortNo: 5 },
  { ptypeCode: 'TEMPERATURE', ptypeName: '温度', unit: '℃', decimals: 1, color: '#FF8A1E', sortNo: 6 },
  { ptypeCode: 'WIND_SPEED', ptypeName: '风速', unit: 'm/s', decimals: 1, color: '#4DA3FF', sortNo: 7 },
  { ptypeCode: 'BEARING_DISP', ptypeName: '支座位移', unit: 'mm', decimals: 2, color: '#F2C14E', sortNo: 8 },
  { ptypeCode: 'CRACK', ptypeName: '裂缝宽度', unit: 'mm', decimals: 2, color: '#FF4D4F', sortNo: 9 },
];

export const INSPECTION: Inspection = {
  inspectCode: 'INS-2026-01',
  scanProgress: 94,
  defectCount: 2,
  keyArea: '箱梁 B-03',
  riskLevel: '低',
  nextInspectDate: '2026-11-12',
};

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const pad = (n: number) => String(n).padStart(2, '0');

export const BRIDGE: Bridge = {
  bridgeCode: BRIDGE_CODE,
  bridgeName: '滨江大桥',
  projectNo: 'BR-2026',
  bridgeType: '斜拉桥（双塔双索面）',
  towerHeight: 216,
  mainSpan: 480,
  sideSpan: 180,
  totalLength: 840,
  deckWidth: 24,
  cableCount: 72,
  designLoadT: 55,
  buildYear: 2031,
  designLife: 100,
  maintainLevel: '一级',
  location: '示范市·滨江新区跨江段',
  manageUnit: '市桥梁养护中心',
};

export const CABLES: Cable[] = Array.from({ length: GEO.cableCount }, (_, i) => {
  const g = i + 1;
  const no = ((g - 1) % GEO.cablesPerFace) + 1;
  const leftTower = g <= 36;
  const leftFace = (g - 1) % 36 < 18;
  const towerX = leftTower ? -GEO.towerX : GEO.towerX;
  const sign = leftTower ? 1 : -1;
  const z = leftFace ? -GEO.towerLegZ : GEO.towerLegZ;
  return {
    cableCode: `C-${pad(g)}`,
    cableNo: no,
    towerSide: leftTower ? 'L' : 'R',
    face: leftFace ? 'LEFT' : 'RIGHT',
    anchorTop: vec(towerX, 150 - (no - 1) * 4.2, z),
    anchorBottom: vec(towerX + sign * no * 12, GEO.deckY + 2, z),
    designForceMn: 1.280 + (no - 9) * 0.004,
    warnForceMn: 1.350,
    alarmForceMn: 1.400,
  };
});

export const SEGMENTS: GirderSegment[] = Array.from({ length: GEO.segmentCount }, (_, i) => ({
  segmentCode: `B-${pad(i + 1)}`,
  chainage: -GEO.halfLength + i * GEO.segmentLen + GEO.segmentLen / 2,
  lengthM: GEO.segmentLen,
  cellCount: 4,
  weightT: 320 + (i % 5) * 8,
  isClosure: i === 20 || i === 21,
  sortNo: i + 1,
}));

export const LANES: Lane[] = GEO.laneOffsets.map((offset, i) => {
  const up = i < 3;
  const xs = up ? [-420, -200, 0, 200, 420] : [420, 200, 0, -200, -420];
  return {
    laneCode: up ? `LN-UP-${i + 1}` : `LN-DN-${i - 2}`,
    laneName: `${up ? '上行' : '下行'}${up ? i + 1 : i - 2}车道`,
    direction: up ? 'UP' : 'DOWN',
    laneIndex: up ? i + 1 : i - 2,
    offsetM: offset,
    curvePoints: xs.map(x => [x, GEO.deckY, offset] as [number, number, number]),
    speedLimit: 80,
  };
});

export const VIEWPOINTS: Viewpoint[] = [
  { vpCode: 'VP-OVERVIEW', vpName: '全景鸟瞰', camPos: vec(420, 180, 520), camTarget: vec(0, 58, 0), fov: 40 },
  { vpCode: 'VP-DECK', vpName: '桥面平视', camPos: vec(-380, 62, 2), camTarget: vec(300, 60, 0), fov: 45 },
  { vpCode: 'VP-UNDER', vpName: '桥底剖切', camPos: vec(60, 8, 120), camTarget: vec(0, 52, 0), fov: 40 },
  { vpCode: 'VP-TOWER', vpName: '塔柱特写', camPos: vec(180, 140, 160), camTarget: vec(0, 110, 0), fov: 35 },
  { vpCode: 'VP-ISO', vpName: '等轴测', camPos: vec(520, 300, 520), camTarget: vec(0, 50, 0), fov: 40 },
  { vpCode: 'VP-SIDE', vpName: '桥侧远景', camPos: vec(600, 120, 600), camTarget: vec(0, 70, 0), fov: 40 },
];

export const CLIP_PLANS: ClipPlan[] = [
  {
    planCode: 'CLIP-AXIAL', planName: '沿桥轴剖切', normal: vec(-1, 0, 0), clipDistance: 0,
    showRebar: true, showDiaphragm: true, showStiffener: true, edgeColor: '#00E5FF', isDefault: true,
  },
  {
    planCode: 'CLIP-CROSS', planName: '横向剖切', normal: vec(0, 0, -1), clipDistance: 0,
    showRebar: true, showDiaphragm: true, showStiffener: true, edgeColor: '#00E5FF', isDefault: false,
  },
];

export const ANIM_STAGES: AnimStage[] = [
  {
    stageCode: 'ACT-1', stageName: '骨架生成', stageOrder: 1, startMs: 0, endMs: 4500,
    camKeyframes: [
      { t: 0, pos: [600, 120, 600], target: [0, 70, 0], fov: 40 },
      { t: 4500, pos: [420, 180, 520], target: [0, 70, 0], fov: 40 },
    ], targetComps: ['FOOTING-L', 'TOWER-L', 'GIRDER', 'CABLES'], autoPlay: true,
  },
  {
    stageCode: 'ACT-2', stageName: '桥面合龙', stageOrder: 2, startMs: 4500, endMs: 7500,
    camKeyframes: [
      { t: 0, pos: [420, 180, 520], target: [0, 70, 0], fov: 40 },
      { t: 3000, pos: [260, 110, 360], target: [0, 58, 0], fov: 42 },
    ], targetComps: ['GIRDER', 'PAVEMENT', 'CABLES'], autoPlay: true,
  },
  {
    stageCode: 'ACT-3', stageName: '车辆加载', stageOrder: 3, startMs: 7500, endMs: 9500,
    camKeyframes: [
      { t: 0, pos: [260, 110, 360], target: [0, 58, 0], fov: 42 },
      { t: 2000, pos: [-380, 62, 2], target: [300, 60, 0], fov: 45 },
    ], targetComps: ['PAVEMENT', 'VEHICLES'], autoPlay: true,
  },
  {
    stageCode: 'ACT-4', stageName: '结构透视', stageOrder: 4, startMs: 9500, endMs: 12500,
    camKeyframes: [
      { t: 0, pos: [-380, 62, 2], target: [300, 60, 0], fov: 45 },
      { t: 1300, pos: [-160, 24, 180], target: [0, 52, 0], fov: 42 },
      { t: 3000, pos: [60, 8, 120], target: [0, 52, 0], fov: 40 },
    ], targetComps: ['GIRDER', 'INNER', 'SENSORS'], autoPlay: true,
  },
  {
    stageCode: 'ACT-5', stageName: '稳态巡检', stageOrder: 5, startMs: 12500, endMs: 0,
    camKeyframes: [{ t: 0, pos: [60, 8, 120], target: [0, 52, 0], fov: 40 }],
    targetComps: ['SENSORS'], autoPlay: true,
  },
];

export const MODELS: ModelResource[] = [
  { modelCode: 'MDL-TOWER', modelName: 'tower_lod0.glb', modelType: 'TOWER', publicUrl: '/models/tower_lod0.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-GIRDER', modelName: 'girder_shell.glb', modelType: 'GIRDER', publicUrl: '/models/girder_shell.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-GIRDER-IN', modelName: 'girder_inner.glb', modelType: 'INNER', publicUrl: '/models/girder_inner.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-SECTION', modelName: 'girder_section.glb', modelType: 'INNER', publicUrl: '/models/girder_section.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-CABLES', modelName: 'cables.glb', modelType: 'CABLE', publicUrl: '/models/cables.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-PIER', modelName: 'piers_supports.glb', modelType: 'PIER', publicUrl: '/models/piers_supports.glb', lodLevel: 0, isDraco: true },
  { modelCode: 'MDL-CAR-A', modelName: 'car_a.glb', modelType: 'VEHICLE', publicUrl: '/models/car_a.glb', lodLevel: 0, isDraco: false },
  { modelCode: 'MDL-CAR-B', modelName: 'car_b.glb', modelType: 'VEHICLE', publicUrl: '/models/car_b.glb', lodLevel: 0, isDraco: false },
];

/** 资产落地清单（来源：桥梁数字孪生资产可用性核查清单）。
 *  核查结论：13 个 GLB 中仅车辆（V01-V05）与通用件（G01-G04）可免费商用下载，桥梁主体须代码生成。
 *  将对应 GLB 放入 frontend/public/assets/models/ 后，前端自动用真实模型替换程序化几何；无文件时回退。
 *  直链格式：https://cdn.3dassets.dev/assets/{编号}/v1/model.glb （下载脚本见 scripts/download_assets.*） */
export const ASSETS = {
  carA: '/assets/models/25138.glb',    // V05 小型厢式货车（604 面）→ car_a（轿车类）
  carB: '/assets/models/13964.glb',    // V02 厢式货车（6,816 面）→ car_b（货车类，建议减面至 ~1,500）
  railing: '/assets/models/15210.glb', // G01 直段双波形护栏（60 面），按 21m 一段阵列
  gate: '/assets/models/32550.glb',    // G03 升降臂道闸（404 面），桥头限流
} as const;

/** 构件树（三级）：桥梁 → 塔/梁 → 节段/拉索 */
export const COMPONENTS: BridgeComponent[] = (() => {
  const base = (
    compCode: string, compName: string, compType: BridgeComponent['compType'],
    parentCode: string | null, sortNo: number, pos: Vec3, clipExempt = true,
  ): BridgeComponent => ({
    compCode, compName, compType, parentCode, sortNo, material: 'C50 混凝土', clipExempt, visible: true,
    modelSkeletonCode: `MDL-${compCode}-SK`, modelSolidCode: `MDL-${compCode}`, modelInnerCode: null, pos,
  });
  const list: BridgeComponent[] = [
    base('TOWER-L', '1# 桥塔（左）', 'TOWER', null, 1, vec(-GEO.towerX, 0, 0)),
    base('TOWER-R', '2# 桥塔（右）', 'TOWER', null, 2, vec(GEO.towerX, 0, 0)),
    base('PIER-L', '左塔桥墩', 'PIER', 'TOWER-L', 1, vec(-GEO.towerX, 0, 0)),
    base('PIER-R', '右塔桥墩', 'PIER', 'TOWER-R', 2, vec(GEO.towerX, 0, 0)),
    base('FOOTING-L', '左承台', 'FOOTING', 'PIER-L', 1, vec(-GEO.towerX, 0, 0)),
    base('FOOTING-R', '右承台', 'FOOTING', 'PIER-R', 2, vec(GEO.towerX, 0, 0)),
    base('GIRDER', '主梁（42 节段）', 'GIRDER_SEGMENT', null, 3, vec(0, GEO.deckY, 0), false),
    base('INNER', '箱梁内部结构', 'DIAPHRAGM', 'GIRDER', 1, vec(0, GEO.girderBottomY, 0)),
    base('PAVEMENT', '桥面铺装', 'PAVEMENT', 'GIRDER', 2, vec(0, GEO.deckY, 0)),
    base('RAILING', '护栏', 'RAILING', 'GIRDER', 3, vec(0, GEO.deckY, 0)),
    base('BEARINGS', '支座组', 'BEARING', 'GIRDER', 4, vec(0, GEO.girderBottomY, 0)),
    base('SENSORS', '传感器组', 'OTHER', 'GIRDER', 5, vec(0, GEO.girderBottomY, 0)),
  ];
  SEGMENTS.forEach((s, i) => {
    const c = base(s.segmentCode, `箱梁节段 ${s.segmentCode}`, 'GIRDER_SEGMENT', 'GIRDER', 10 + i,
      vec(s.chainage, GEO.deckY, 0), false);
    c.modelInnerCode = 'MDL-GIRDER-IN';
    list.push(c);
  });
  CABLES.forEach((cab, i) => {
    const c = base(cab.cableCode, `拉索 ${cab.cableCode}`, 'CABLE',
      cab.towerSide === 'L' ? 'TOWER-L' : 'TOWER-R', 100 + i, cab.anchorBottom);
    c.material = '镀锌钢丝';
    list.push(c);
  });
  return list;
})();

/** 150 个测点：72 索力 + 42 应变 + 36 环境/变形/支座/裂缝 */
export const POINTS: ShmPoint[] = (() => {
  const mk = (
    pointCode: string, pointName: string, compCode: string, ptypeCode: string, unit: string,
    decimals: number, warnMax: number, alarmMax: number,
    groupCode: ShmPoint['groupCode'], pos: Vec3, sortNo: number,
  ): ShmPoint => ({ pointCode, pointName, compCode, ptypeCode, unit, decimals, warnMax, alarmMax, groupCode, sortNo, pos, showIn3d: true });

  const list: ShmPoint[] = [];
  CABLES.forEach((c, i) => list.push(mk(
    `PTS-C-${pad(i + 1)}`, `${c.cableCode} 索力`, c.cableCode, 'CABLE_FORCE', 'MN', 3,
    i === 2 ? 1.360 : 1.350, 1.400, 'TOWER', c.anchorBottom, i + 1,
  )));
  SEGMENTS.forEach((s, i) => list.push(mk(
    `PTS-STR-${pad(i + 1)}`, `${s.segmentCode} 应变`, s.segmentCode, 'STRESS', 'MPa', 1,
    55, 70, 'GIRDER', vec(s.chainage, GEO.girderBottomY - 0.5, 8), 100 + i,
  )));
  const extra: [string, string, number, number, ShmPoint['groupCode'], number, number][] = [
    ['PTS-DEF', 'DEFLECTION', 1.2, 1.5, 'GIRDER', 8, 2],
    ['PTS-TMP', 'TEMPERATURE', 40, 50, 'ENV', 6, 1],
    ['PTS-WND', 'WIND_SPEED', 18, 25, 'ENV', 4, 1],
    ['PTS-FRQ', 'FREQUENCY', 0.9, 1.2, 'GIRDER', 4, 2],
    ['PTS-DMP', 'DAMPING', 4, 5, 'GIRDER', 4, 1],
    ['PTS-BRG', 'BEARING_DISP', 25, 40, 'BEARING', 6, 2],
    ['PTS-CRK', 'CRACK', 0.2, 0.3, 'GIRDER', 4, 2],
  ];
  let sort = 200;
  extra.forEach(([prefix, ptype, warn, alarm, group, count, dec]) => {
    const pt = POINT_TYPES.find(p => p.ptypeCode === ptype)!;
    for (let i = 1; i <= count; i++) {
      const x = -GEO.halfLength + (i * GEO.length) / (count + 1);
      list.push(mk(`${prefix}-${pad(i)}`, `${pt.ptypeName} ${pad(i)}`, prefix === 'PTS-BRG' ? 'BEARINGS' : 'GIRDER',
        ptype, pt.unit, dec, warn, alarm, group, vec(x, GEO.girderBottomY - 0.5, i % 2 ? 8 : -8), sort++));
    }
  });
  return list;
})();

export function buildMockBootstrap(): Bootstrap {
  return {
    bridge: BRIDGE,
    components: COMPONENTS,
    cables: CABLES,
    segments: SEGMENTS,
    lanes: LANES,
    viewpoints: VIEWPOINTS,
    clipPlans: CLIP_PLANS,
    animStages: ANIM_STAGES,
    models: MODELS,
    pointTypes: POINT_TYPES,
    points: POINTS,
    inspection: INSPECTION,
    simPlans: [{
      planCode: 'SIM-BRIDGE-01', planName: '桥梁车流与监测联合仿真', simType: 'COUPLED',
      densityPct: 62, avgSpeed: 58, vehicleMax: 36, status: 'RUNNING',
    }],
    metrics: { ...INITIAL_METRICS },
  };
}

export const DATA_MODE: 'mock' | 'live' =
  (import.meta.env.VITE_DATA_MODE as string) === 'live' ? 'live' : 'mock';

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api/v1';
export const MQTT_WS_URL = (import.meta.env.VITE_MQTT_WS_URL as string) || '/mqtt';

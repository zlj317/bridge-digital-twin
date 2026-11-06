/** 全系统共享的数据契约：对应文档第 7 章表结构、7.9 报文、8 章接口 */

export type CompType =
  | 'PILE' | 'FOOTING' | 'PIER' | 'TOWER' | 'GIRDER_SEGMENT' | 'DIAPHRAGM'
  | 'CABLE' | 'BEARING' | 'JOINT' | 'RAILING' | 'PAVEMENT' | 'OTHER';

export type PointLevel = 'NORMAL' | 'WARN' | 'ALARM';
export type AlarmLevel = 'WARN' | 'ALARM' | 'SERIOUS';
export type AlarmStatus = 'ACTIVE' | 'CONFIRMED' | 'IGNORED' | 'RECOVERED';
export type GroupCode = 'TOWER' | 'GIRDER' | 'BEARING' | 'ENV';
export type VehicleType = 'CAR' | 'TRUCK';
export type ActCode = 'ACT-1' | 'ACT-2' | 'ACT-3' | 'ACT-4' | 'ACT-5';
export type ViewKey = 'V1' | 'V2' | 'V3';

export interface Vec3 { x: number; y: number; z: number }

export interface Bridge {
  bridgeCode: string;
  bridgeName: string;
  projectNo: string;
  bridgeType: string;
  towerHeight: number;
  mainSpan: number;
  sideSpan: number;
  totalLength: number;
  deckWidth: number;
  cableCount: number;
  designLoadT: number;
  buildYear: number;
  designLife: number;
  maintainLevel: string;
  location: string;
  manageUnit: string;
}

export interface BridgeComponent {
  compCode: string;
  compName: string;
  compType: CompType;
  parentCode: string | null;
  sortNo: number;
  material: string;
  clipExempt: boolean;
  visible: boolean;
  modelSkeletonCode: string | null;
  modelSolidCode: string | null;
  modelInnerCode: string | null;
  pos: Vec3;
}

export interface Cable {
  cableCode: string;
  cableNo: number;
  towerSide: 'L' | 'R';
  face: 'LEFT' | 'RIGHT';
  anchorTop: Vec3;
  anchorBottom: Vec3;
  designForceMn: number;
  warnForceMn: number;
  alarmForceMn: number;
}

export interface GirderSegment {
  segmentCode: string;
  chainage: number;
  lengthM: number;
  cellCount: number;
  weightT: number;
  isClosure: boolean;
  sortNo: number;
}

export interface Lane {
  laneCode: string;
  laneName: string;
  direction: 'UP' | 'DOWN';
  laneIndex: number;
  offsetM: number;
  curvePoints: [number, number, number][];
  speedLimit: number;
}

export interface Viewpoint {
  vpCode: string;
  vpName: string;
  camPos: Vec3;
  camTarget: Vec3;
  fov: number;
}

export interface ClipPlan {
  planCode: string;
  planName: string;
  normal: Vec3;
  clipDistance: number;
  showRebar: boolean;
  showDiaphragm: boolean;
  showStiffener: boolean;
  edgeColor: string;
  isDefault: boolean;
}

export interface CamKeyframe { t: number; pos: [number, number, number]; target: [number, number, number]; fov: number }

export interface AnimStage {
  stageCode: ActCode;
  stageName: string;
  stageOrder: number;
  startMs: number;
  endMs: number;
  camKeyframes: CamKeyframe[];
  targetComps: string[];
  autoPlay: boolean;
}

export interface ModelResource {
  modelCode: string;
  modelName: string;
  modelType: string;
  publicUrl: string | null;
  lodLevel: number;
  isDraco: boolean;
}

export interface PointType {
  ptypeCode: string;
  ptypeName: string;
  unit: string;
  decimals: number;
  color: string;
  sortNo: number;
}

export interface ShmPoint {
  pointCode: string;
  pointName: string;
  compCode: string;
  ptypeCode: string;
  unit: string;
  decimals: number;
  warnMax: number;
  alarmMax: number;
  groupCode: GroupCode;
  sortNo: number;
  pos: Vec3;
  showIn3d: boolean;
}

export interface RealtimePoint {
  pointCode: string;
  compCode: string;
  value: number;
  unit: string;
  ts: number;
  level: PointLevel;
}

/** 文档 7.9 整桥快照 + 车流统计 + 巡检（左右面板统一数据源） */
export interface BridgeMetrics {
  stress: number;
  cableForce: number;
  deflection: number;
  temperature: number;
  windSpeed: number;
  frequency: number;
  damping: number;
  trafficPerHour: number;
  fatigueIndex: number;
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'E';
  healthScore: number;
  vehicleCount: number;
  avgSpeed: number;
  occupancy: number;
  eventCount: number;
  scanProgress: number;
  defectCount: number;
  keyArea: string;
  riskLevel: string;
  nextInspectDate: string;
  maintenanceAdvice: string;
  ts: number;
}

export interface Alarm {
  alarmCode: string;
  bridgeCode: string;
  compCode: string;
  pointCode: string;
  alarmLevel: AlarmLevel;
  title: string;
  content: string;
  alarmValue: number;
  thresholdValue: number;
  unit: string;
  status: AlarmStatus;
  triggerTime: string;
}

export interface Inspection {
  inspectCode: string;
  scanProgress: number;
  defectCount: number;
  keyArea: string;
  riskLevel: string;
  nextInspectDate: string;
}

export interface SimPlan {
  planCode: string;
  planName: string;
  simType: 'TRAFFIC' | 'SHM' | 'COUPLED';
  densityPct: number;
  avgSpeed: number;
  vehicleMax: number;
  status: 'IDLE' | 'RUNNING' | 'STOPPED' | 'FINISHED';
}

export interface VehicleState {
  vid: string;
  lane: string;
  t: number;
  speed: number;
  type: VehicleType;
  plate: string;
  weightT: number;
  enterAt: number;
}

export interface TrafficStat {
  vehicleCount: number;
  avgSpeed: number;
  occupancy: number;
  eventCount: number;
}

export interface Bootstrap {
  bridge: Bridge;
  components: BridgeComponent[];
  cables: Cable[];
  segments: GirderSegment[];
  lanes: Lane[];
  viewpoints: Viewpoint[];
  clipPlans: ClipPlan[];
  animStages: AnimStage[];
  models: ModelResource[];
  pointTypes: PointType[];
  points: ShmPoint[];
  inspection: Inspection;
  simPlans: SimPlan[];
  metrics: BridgeMetrics;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
  traceId: string;
}

/** 文档 4 章联动数据契约：所有面板共享，禁止互相直接调用 */
export interface SelectedContext {
  bridgeCode: string;
  compCode: string | null;
  pointCodes: string[];
  act: ActCode;
  timeCursor: number;
}

export interface HistorySeries {
  pointCode: string;
  unit: string;
  points: [number, number][];
}

export interface HistoryStatistics {
  pointCode: string;
  count: number;
  max: number;
  min: number;
  avg: number;
  p95: number;
  exceedCount: number;
}

export interface ActDef {
  code: ActCode;
  name: string;
  startMs: number;
  endMs: number;
}

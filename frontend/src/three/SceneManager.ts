import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { COLORS, GEO } from '../config';
import { WaterSurface } from './WaterSurface';
import { Cityscape } from './Cityscape';

type UpdateFn = (dt: number, elapsed: number) => void;

const NIGHT_SKY = {
  fog: new THREE.Color(0x061020),
  hemiSky: new THREE.Color(0x8fb8ff),
  hemiGround: new THREE.Color(0x061020),
  ambient: new THREE.Color(0x5a7ba8),
  sun: new THREE.Color(0xbcd8ff),
  city: new THREE.Color(COLORS.skyLine),
};
const DAY_SKY = {
  fog: new THREE.Color(0xa9c8df),
  hemiSky: new THREE.Color(0xdcecff),
  hemiGround: new THREE.Color(0x697b86),
  ambient: new THREE.Color(0xffffff),
  sun: new THREE.Color(0xfff2d5),
  city: new THREE.Color(0x5d6d7e),
};

/** 天空渐变按昼夜系数生成；量化到 0.05 避免过渡时每帧重建贴图 */
function radialBackground(day: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const blend = (a: number, b: number) =>
    `#${new THREE.Color(a).lerp(new THREE.Color(b), day).getHexString()}`;
  const g = ctx.createRadialGradient(256, 240, 20, 256, 256, 380);
  g.addColorStop(0, blend(0x10203f, 0xd6ebfb));
  g.addColorStop(0.45, blend(0x0a162e, 0x93bde1));
  g.addColorStop(1, blend(0x050a18, 0x517fab));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  // 稀薄云带：白天偏白、夜间偏冷蓝，让天空不再是一整块纯色渐变
  for (let i = 0; i < 5; i++) {
    const cx = 60 + (i * 137) % 420;
    const cy = 168 + i * 54;
    const cg = ctx.createRadialGradient(cx, cy, 4, cx, cy, 140 + i * 20);
    const a = (0.045 + 0.06 * day) * (i % 2 ? 0.7 : 1);
    cg.addColorStop(0, `rgba(${day > 0.5 ? '255,255,255' : '150,180,220'},${a})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, 512, 512);
  }
  // 夜景月亮与月晕
  const moon = 1 - day;
  if (moon > 0.02) {
    const mg = ctx.createRadialGradient(118, 96, 2, 118, 96, 78);
    mg.addColorStop(0, `rgba(226,240,255,${0.85 * moon})`);
    mg.addColorStop(0.12, `rgba(190,218,255,${0.42 * moon})`);
    mg.addColorStop(1, 'rgba(150,195,255,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, 512, 512);
    ctx.beginPath();
    ctx.arc(118, 96, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240,248,255,${0.92 * moon})`;
    ctx.fill();
  }

  if (day > 0.01) {
    const sun = ctx.createRadialGradient(348, 132, 4, 348, 132, 210);
    sun.addColorStop(0, `rgba(255,248,222,${0.95 * day})`);
    sun.addColorStop(0.22, `rgba(255,230,175,${0.38 * day})`);
    sun.addColorStop(1, 'rgba(255,225,165,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 512, 512);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 烘焙极简天空穹顶为 IBL 环境贴图：车漆、拉索、钢护栏获得真实的环境反射与间接光。
 *  生成失败时返回 null，页面自动回退到纯灯光照明，不影响其它渲染。 */
function bakeEnvironment(renderer: THREE.WebGLRenderer, day: number): THREE.Texture | null {
  try {
    const envScene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(60, 24, 16);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(day ? 0xdcefff : 0x2a4a78);
    const horizon = new THREE.Color(day ? 0xa9cbea : 0x14294a);
    const bottom = new THREE.Color(day ? 0x5c7183 : 0x050a14);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 60;
      if (y >= 0) c.copy(horizon).lerp(top, Math.min(1, y * 1.4));
      else c.copy(horizon).lerp(bottom, Math.min(1, -y * 1.4));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(envScene, 0, 0.1, 200);
    pmrem.dispose();
    geo.dispose();
    mat.dispose();
    return target.texture;
  } catch (err) {
    console.warn('[scene] IBL 烘焙失败，回退到纯灯光照明', err);
    return null;
  }
}

/** 场景、相机、渲染器、环境、后处理链（文档 2.7 / 6.3 SceneManager） */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly outline: OutlinePass;
  readonly clock = new THREE.Clock();

  private updates: UpdateFn[] = [];
  private raf = 0;
  private frames = 0;
  private fpsTimer = 0;
  private lowFpsTime = 0;
  private midFpsTime = 0;
  private qualityReduced = false;
  private beacons: THREE.Mesh[] = [];
  private envNight: THREE.Texture | null = null;
  private envDay: THREE.Texture | null = null;
  private fxaa!: ShaderPass;
  private starfield: THREE.Points;
  private waterSurface!: WaterSurface;
  private gridMat!: THREE.Material;
  private cityscape!: Cityscape;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private sun!: THREE.DirectionalLight;
  private towerLights: THREE.PointLight[] = [];
  private day = 0;
  private dayTarget = 0;
  private bgQuant = -1;
  private onFps?: (fps: number) => void;
  private onDegrade?: () => void;
  private degraded = false;
  // 实时阴影：由 Viewport 登记投射/接收对象，统一受昼夜、蒙皮进度与降级策略控制
  private shadowCasters: THREE.Object3D[] = [];
  private shadowReceivers: THREE.Object3D[] = [];
  private shadowSolid = 0;
  private shadowMapSize = 3072;
  private bloomScale = 1;

  constructor(private readonly container: HTMLElement) {
    this.scene.background = null;
    // 0.0008 为按 840m 桥长场景尺度校准后的雾浓度（文档 0.0022 在 1000+ 单位远景会全黑）
    this.scene.fog = new THREE.FogExp2(0x061020, 0.0008);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
    this.camera.position.set(600, 120, 600);
    this.camera.lookAt(0, 70, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.localClippingEnabled = true;
    // 单张 2048² 正交阴影图覆盖主桥 ±560m；不引入 SSAO / 额外深度 pass，
    // 避免 Bloom + Outline + FXAA 之后帧率被后处理与多重几何绘制拖垮。
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 昼夜各烘焙一张 PMREM：只在切换时替换，environmentIntensity 逐帧插值
    this.envNight = bakeEnvironment(this.renderer, 0);
    this.envDay = bakeEnvironment(this.renderer, 1);
    this.scene.environment = this.envNight;
    this.scene.environmentIntensity = 0.35;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = 1.45;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 1200;
    this.controls.target.set(0, GEO.deckY, 0);
    this.controls.zoomToCursor = true;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;

    // 合成管线默认 RT 不带多重采样，renderer 的 antialias:true 在此不生效，
    // 拉索 / 塔 / 车体边缘会出现阶梯锯齿（显「假」的常见来源）。
    // 传入 samples:4 的 RT，让几何边缘真正 MSAA；resize 时 EffectComposer 会保留 samples。
    const dbSize = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const composerRT = new THREE.WebGLRenderTarget(dbSize.x, dbSize.y, { samples: 4 });
    this.composer = new EffectComposer(this.renderer, composerRT);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.42, 0.85);
    this.composer.addPass(this.bloom);
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera);
    this.outline.edgeStrength = 3;
    this.outline.edgeGlow = 0.6;
    this.outline.edgeThickness = 1.5;
    this.outline.pulsePeriod = 2.5;
    this.outline.visibleEdgeColor.set('#00e5ff');
    this.outline.hiddenEdgeColor.set('#0a2a5e');
    this.outline.enabled = false;
    this.composer.addPass(this.outline);
    this.composer.addPass(new OutputPass());
    // FXAA 放在色调映射之后，消除拉索 / 护栏 / 灯杆的阶梯锯齿。
    // 官方 shader 用 -100.0 的采样 bias 禁用 mipmap，ANGLE/D3D 会刷 X4713 警告；
    // composer 的 RT 本就没有 mipmap，去掉 bias 参数即可等价且无警告。
    this.fxaa = new ShaderPass({
      ...FXAAShader,
      fragmentShader: FXAAShader.fragmentShader.replace(/,\s*-100\.0\)/g, ')'),
    });
    this.composer.addPass(this.fxaa);

    this.starfield = this.buildStarfield();
    this.buildEnvironment();
    this.buildLights();
    this.updateDayVisuals();

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private buildStarfield(): THREE.Points {
    const n = 800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 700 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.65 + 0.05;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9fd8ff, size: 1.3, sizeAttenuation: false,
      transparent: true, opacity: 0.55, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -1;
    this.scene.add(pts);
    return pts;
  }

  private buildEnvironment(): void {
    // 程序化水面：细分网格 + 波纹顶点位移 + 菲涅尔反射，昼夜共用一套几何
    this.waterSurface = new WaterSurface(GEO.waterY);
    this.scene.add(this.waterSurface.mesh);

    // 地面蓝图线稿（图 2 左下）：放到水面之下，避免网格线盖住波纹
    const grid = new THREE.GridHelper(1600, 40, 0x2c7be5, 0x1b4577);
    grid.position.y = GEO.waterY - 1.2;
    this.gridMat = grid.material as THREE.Material;
    this.gridMat.transparent = true;
    this.gridMat.opacity = 0.18;
    this.scene.add(grid);

    // 两岸城市 + 引道 / 桥台 / 岸地：桥的两端不再是悬在水上的断头
    this.cityscape = new Cityscape();
    this.scene.add(this.cityscape.root);
    // 江面船只每帧漂移
    this.addUpdate((dt: number) => this.cityscape.update(dt));
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0x8fb8ff, 0x061020, 1.0);
    this.ambient = new THREE.AmbientLight(0x5a7ba8, 0.55);
    this.sun = new THREE.DirectionalLight(0xbcd8ff, 1.35);
    this.sun.position.set(300, 420, 260);
    // 阴影相机对准桥面中心而非世界原点，否则 216m 塔顶会落出阴影视锥
    this.sun.target.position.set(0, GEO.deckY, 0);
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(3072, 3072);
    sh.camera.left = -560;
    sh.camera.right = 560;
    sh.camera.top = 360;
    sh.camera.bottom = -360;
    sh.camera.near = 1;
    sh.camera.far = 1500;
    sh.camera.updateProjectionMatrix();
    // 场景尺度是米级，bias / normalBias 按 840m 桥长校准，抑制大面积斜面自阴影条纹
    sh.bias = -0.00035;
    sh.normalBias = 1.1;
    sh.radius = 2;
    sh.intensity = 0.9;
    this.scene.add(this.hemi, this.ambient, this.sun, this.sun.target);
    [-GEO.towerX, GEO.towerX].forEach(x => {
      const p = new THREE.PointLight(COLORS.cyan, 1.6, 420, 2);
      p.position.set(x, 180, 0);
      this.towerLights.push(p);
      this.scene.add(p);
      // 塔顶航空障碍灯：夜间红色慢闪，白天熄灭
      [-GEO.towerLegZ, GEO.towerLegZ].forEach(z => {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9, depthWrite: false }),
        );
        beacon.position.set(x, GEO.towerH + 3, z);
        this.beacons.push(beacon);
        this.scene.add(beacon);
      });
    });
    // 城市与接岸结构由 SceneManager 自己创建，直接登记其阴影白名单
    this.registerShadows(this.cityscape.shadowCasters, this.cityscape.shadowReceivers);
  }

  private pixelRatio(): number {
    return this.degraded || this.qualityReduced ? 1 : Math.min(window.devicePixelRatio, 1.5);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(this.pixelRatio());
    this.resize();
  }

  private updateBeacons(elapsed: number): void {
    const pulse = 0.3 + 0.7 * Math.max(0, Math.sin(elapsed * 2.1));
    const strength = (1 - this.day) * pulse;
    this.beacons.forEach((b, i) => {
      b.visible = this.day < 0.92;
      (b.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.85 * strength;
      b.scale.setScalar(0.85 + 0.4 * strength + (i % 2) * 0.04);
    });
  }

  addUpdate(fn: UpdateFn): void { this.updates.push(fn); }

  /** 由 Viewport 一次性登记阴影对象：显式白名单，避免把发光贴片 / 线框 / 点精灵送进阴影 pass */
  registerShadows(casters: THREE.Object3D[], receivers: THREE.Object3D[] = []): void {
    this.shadowCasters.push(...casters);
    this.shadowReceivers.push(...receivers);
    receivers.forEach(o => { o.receiveShadow = true; });
    this.applyShadowFlags();
  }

  /** 幕二实体蒙皮完成后才让阴影显形，避免线框阶段投出一块完整的实心影 */
  setShadowSolid(p: number): void {
    const v = Math.max(0, Math.min(1, p));
    if (Math.abs(v - this.shadowSolid) < 0.008) return;
    this.shadowSolid = v;
    this.applyShadowIntensity();
  }

  private applyShadowIntensity(): void {
    // 夜间只保留月光级别的淡影，白天增强；两者都随实体蒙皮进度淡入
    this.sun.shadow.intensity = (0.22 + 0.78 * this.day) * this.shadowSolid;
  }

  private applyShadowFlags(): void {
    const on = !this.degraded;
    this.sun.castShadow = on;
    this.shadowCasters.forEach(o => { o.castShadow = on; });
    this.shadowReceivers.forEach(o => { o.receiveShadow = on; });
  }

  /** 中间档 / 降级时缩小阴影图；dispose 掉旧 RT 让 WebGLShadowMap 按新尺寸重建 */
  private setShadowMapSize(size: number): void {
    if (this.shadowMapSize === size) return;
    this.shadowMapSize = size;
    const sh = this.sun.shadow;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
  }

  /** Viewport 每帧传入基础强度（含合龙白闪），白天 / 中间档自动压低辉光 */
  setBloomStrength(v: number): void {
    this.bloom.strength = v * (1 - 0.68 * this.day) * this.bloomScale;
  }

  /** 0 = 夜景，1 = 白天；内部按 ~0.5s 时间常数平滑过渡 */
  setDayFactor(v: number): void { this.dayTarget = Math.max(0, Math.min(1, v)); }

  get dayFactor(): number { return this.day; }

  private applyDay(dt: number): void {
    if (Math.abs(this.dayTarget - this.day) < 0.001) return;
    this.day += (this.dayTarget - this.day) * Math.min(1, dt * 2.4);
    if (Math.abs(this.dayTarget - this.day) < 0.002) this.day = this.dayTarget;
    this.updateDayVisuals();
  }

  private updateDayVisuals(): void {
    const d = this.day;
    const quant = Math.round(d * 20);
    if (quant !== this.bgQuant) {
      this.bgQuant = quant;
      const old = this.scene.background as THREE.Texture | null;
      old?.dispose();
      this.scene.background = radialBackground(d);
    }

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(NIGHT_SKY.fog).lerp(DAY_SKY.fog, d);
    // 白天雾稍淡，远景城市/江岸更通透，避免整体发灰
    fog.density = 0.0008 + (0.00034 - 0.0008) * d;

    this.hemi.color.copy(NIGHT_SKY.hemiSky).lerp(DAY_SKY.hemiSky, d);
    this.hemi.groundColor.copy(NIGHT_SKY.hemiGround).lerp(DAY_SKY.hemiGround, d);
    this.hemi.intensity = 0.7 + 0.7 * d;
    this.ambient.color.copy(NIGHT_SKY.ambient).lerp(DAY_SKY.ambient, d);
    this.ambient.intensity = 0.4 + 0.35 * d;
    this.sun.color.copy(NIGHT_SKY.sun).lerp(DAY_SKY.sun, d);
    this.sun.intensity = 1.1 + 1.2 * d;
    this.sun.position.set(300, 300 + 180 * d, 260);
    this.applyShadowIntensity();
    // 水面解析投影与高光共用同一太阳方向，桥影随昼夜太阳高度角同步偏移
    this.waterSurface.setSunDirection(
      this.sun.position.clone().sub(this.sun.target.position).normalize(),
    );
    // 塔顶青色点光夜间增强，给桥体轮廓打上体积感辉光
    this.towerLights.forEach(p => { p.intensity = 2.2 * (1 - 0.86 * d); });

    (this.starfield.material as THREE.PointsMaterial).opacity = 0.55 * (1 - d);
    this.gridMat.opacity = 0.18 * (1 - 0.6 * d);
    this.cityscape.setDayFactor(d);
    this.renderer.toneMappingExposure = 1.12 - 0.14 * d;
    // 夜景辉光增强（城市灯光 / 车灯 / 拉索轮廓向外晕开），白天收紧只留太阳高光，制造体积感
    this.bloom.strength = 0.5 + 0.45 * (1 - d);
    this.bloom.threshold = 0.92 - 0.5 * (1 - d);
    this.bloom.radius = 0.42 + 0.12 * (1 - d);
    this.waterSurface.setDayFactor(d);
    const wantEnv = d > 0.5 ? this.envDay : this.envNight;
    if (wantEnv && this.scene.environment !== wantEnv) this.scene.environment = wantEnv;
    this.scene.environmentIntensity = 0.35 + 0.45 * d;
  }

  setCallbacks(onFps: (fps: number) => void, onDegrade: () => void): void {
    this.onFps = onFps;
    this.onDegrade = onDegrade;
  }

  /** 3.8 降级策略：帧率 < 20 持续 3s 关闭后处理/星点/实时阴影；水面始终保留（仅一个 draw call） */
  setDegraded(v: boolean): void {
    if (this.degraded === v) return;
    this.degraded = v;
    this.bloom.enabled = !v;
    this.fxaa.enabled = !v;
    this.starfield.visible = !v;
    this.applyShadowFlags();
    if (v) {
      // 阴影 pass 关闭后释放 RT；恢复时由 WebGLShadowMap 按需重建
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.applyPixelRatio();
  }

  readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    (this.fxaa.material.uniforms['resolution'].value as THREE.Vector2).set(1 / (w * pr), 1 / (h * pr));
  };

  start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;
      this.applyDay(dt);
      this.updateBeacons(elapsed);
      this.waterSurface.update(elapsed, this.camera);
      this.updates.forEach(fn => fn(dt, elapsed));
      this.controls.update();
      // 交互细节：禁止相机与注视点钻到水面以下，避免穿帮看到水面背面
      const minY = GEO.waterY + 2.5;
      if (this.camera.position.y < minY) this.camera.position.y = minY;
      if (this.controls.target.y < GEO.waterY + 1) this.controls.target.y = GEO.waterY + 1;
      this.composer.render();

      this.frames++;
      this.fpsTimer += dt;
      if (this.fpsTimer >= 1) {
        const fps = Math.round(this.frames / this.fpsTimer);
        this.onFps?.(fps);
        this.lowFpsTime = fps < 20 ? this.lowFpsTime + this.fpsTimer : 0;
        if (this.lowFpsTime >= 3 && !this.degraded) {
          this.setDegraded(true);
          this.onDegrade?.();
        }
        // 中间档自适应：42 FPS 以下先降渲染分辨率，避免直接掉到降级模式
        this.midFpsTime = fps < 42 && fps >= 20 ? this.midFpsTime + this.fpsTimer : 0;
        if (this.midFpsTime >= 3 && !this.degraded && !this.qualityReduced) {
          this.qualityReduced = true;
          // 中间档先降阴影分辨率与辉光强度，保留 FXAA，避免直接掉进 20 FPS 降级档
          this.setShadowMapSize(1024);
          this.bloomScale = 0.78;
          this.applyPixelRatio();
        }
        this.frames = 0;
        this.fpsTimer = 0;
      }
    };
    loop();
  }

  /** WEB-008 截图（含渲染层） */
  screenshot(): string { return this.renderer.domElement.toDataURL('image/png'); }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.waterSurface.dispose();
    (this.scene.background as THREE.Texture | null)?.dispose();
    this.envNight?.dispose();
    this.envDay?.dispose();
    this.renderer.dispose();
  }
}

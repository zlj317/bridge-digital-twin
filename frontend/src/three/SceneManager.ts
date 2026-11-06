import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { COLORS, GEO } from '../config';

type UpdateFn = (dt: number, elapsed: number) => void;

function radialBackground(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 240, 20, 256, 256, 380);
  g.addColorStop(0, '#10203f');
  g.addColorStop(0.45, '#0a162e');
  g.addColorStop(1, '#050a18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  private starfield: THREE.Points;
  private water: THREE.Mesh | null = null;
  private onFps?: (fps: number) => void;
  private onDegrade?: () => void;
  private degraded = false;

  constructor(private readonly container: HTMLElement) {
    this.scene.background = radialBackground();
    // 0.0008 为按 840m 桥长场景尺度校准后的雾浓度（文档 0.0022 在 1000+ 单位远景会全黑）
    this.scene.fog = new THREE.FogExp2(0x061020, 0.0008);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
    this.camera.position.set(600, 120, 600);
    this.camera.lookAt(0, 70, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.localClippingEnabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.45;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 1200;
    this.controls.target.set(0, GEO.deckY, 0);

    this.composer = new EffectComposer(this.renderer);
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
    this.composer.addPass(this.outline);
    this.composer.addPass(new OutputPass());

    this.starfield = this.buildStarfield();
    this.buildEnvironment();
    this.buildLights();

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
    // 水面
    const waterGeo = new THREE.PlaneGeometry(2000, 2000);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x061224, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.94,
    });
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = GEO.waterY;
    this.scene.add(this.water);

    // 地面蓝图线稿（图 2 左下）
    const grid = new THREE.GridHelper(1600, 40, 0x2c7be5, 0x1b4577);
    grid.position.y = GEO.waterY + 0.2;
    const gm = grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.18;
    this.scene.add(grid);

    // 城市天际线剪影（图 3）
    const city = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.skyLine, roughness: 1, metalness: 0 });
    const inst = new THREE.InstancedMesh(box, mat, 34);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 34; i++) {
      const w = 20 + Math.random() * 45;
      const h = 25 + Math.random() * 130;
      const x = -900 + (i / 33) * 1800 + (Math.random() - 0.5) * 30;
      m.compose(
        new THREE.Vector3(x, h / 2 - 4, -780 - Math.random() * 220),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, w * 0.8),
      );
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    city.add(inst);
    this.scene.add(city);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x061020, 1.0));
    this.scene.add(new THREE.AmbientLight(0x5a7ba8, 0.55));
    const sun = new THREE.DirectionalLight(0xbcd8ff, 1.35);
    sun.position.set(300, 420, 260);
    this.scene.add(sun);
    [-GEO.towerX, GEO.towerX].forEach(x => {
      const p = new THREE.PointLight(COLORS.cyan, 1.6, 420, 2);
      p.position.set(x, 180, 0);
      this.scene.add(p);
    });
  }

  addUpdate(fn: UpdateFn): void { this.updates.push(fn); }

  setBloomStrength(v: number): void { this.bloom.strength = v; }

  setCallbacks(onFps: (fps: number) => void, onDegrade: () => void): void {
    this.onFps = onFps;
    this.onDegrade = onDegrade;
  }

  /** 3.8 降级策略：帧率 < 20 持续 3s 关闭后处理/星点/水面 */
  setDegraded(v: boolean): void {
    if (this.degraded === v) return;
    this.degraded = v;
    this.bloom.enabled = !v;
    this.starfield.visible = !v;
    if (this.water) this.water.visible = !v;
    this.renderer.setPixelRatio(v ? 1 : Math.min(window.devicePixelRatio, 2));
    this.resize();
  }

  readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  };

  start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;
      this.updates.forEach(fn => fn(dt, elapsed));
      this.controls.update();
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
    this.renderer.dispose();
  }
}

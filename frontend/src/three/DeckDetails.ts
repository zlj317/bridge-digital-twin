import * as THREE from 'three';
import { GEO } from '../config';
import { asphaltTextures, cloneRepeat, concreteTextures, jerseyBarrierGeometry } from './BridgeGeometry';

/** 路面标线贴图：白箭头与限速数字，用 alpha 通道保留边缘磨损，避免纯色矩形贴片 */
function markingTexture(kind: 'arrow' | 'speed'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f7fa';
  if (kind === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(28, 48);
    ctx.lineTo(146, 48);
    ctx.lineTo(146, 22);
    ctx.lineTo(234, 64);
    ctx.lineTo(146, 106);
    ctx.lineTo(146, 80);
    ctx.lineTo(28, 80);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = 'bold 96px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('80', 128, 66);
  }
  // 轮胎磨耗：随机擦掉少量像素，让标线不像刚施工完的塑料贴纸
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.45;
    ctx.fillRect(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 7, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 桥面细节：沥青 PBR 三贴图 + 分段新泽西护栏 + 轮廓标 + 路缘线 + 节段伸缩缝 + 导向/限速标线。
 *  所有材质交给 ClippingController 同步剖切，避免桥面裁掉后附属物悬空。 */
export class DeckDetails {
  readonly root = new THREE.Group();
  readonly materials: THREE.Material[] = [];

  private reflector: THREE.MeshBasicMaterial;
  private markMats: THREE.MeshBasicMaterial[] = [];

  constructor(deckMat: THREE.MeshStandardMaterial) {
    const asphalt = asphaltTextures();
    deckMat.map = asphalt.map;
    deckMat.normalMap = asphalt.normalMap;
    deckMat.roughnessMap = asphalt.roughnessMap;
    deckMat.normalScale.set(0.42, 0.42);
    deckMat.needsUpdate = true;

    const ct = concreteTextures();
    const concrete = new THREE.MeshStandardMaterial({
      color: 0xa8b2bd,
      map: cloneRepeat(ct.map, 1, 2),
      normalMap: cloneRepeat(ct.normalMap, 1, 2),
      roughnessMap: cloneRepeat(ct.roughnessMap, 1, 2),
      metalness: 0.03, roughness: 0.9,
    });
    this.reflector = new THREE.MeshBasicMaterial({
      color: 0xd9b45a, transparent: true, opacity: 0.9, depthWrite: false,
    });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xdde6ee, transparent: true, opacity: 0.85, depthWrite: false });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x3d4650, metalness: 0.55, roughness: 0.62 });
    this.materials.push(concrete, this.reflector, edgeMat, jointMat);

    // 分段预制混凝土护栏：8m 一节，截面为下部斜坡导轮 + 上部直立的 New Jersey 型
    const segLen = 8;
    const segCount = Math.round(GEO.length / segLen);
    const barrier = new THREE.InstancedMesh(jerseyBarrierGeometry(), concrete, segCount);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(segLen, 1.0, 0.72);
    for (let i = 0; i < segCount; i++) {
      p.set(-GEO.halfLength + (i + 0.5) * segLen, GEO.deckY + 0.7, 0);
      barrier.setMatrixAt(i, m.compose(p, q, s));
    }
    barrier.instanceMatrix.needsUpdate = true;
    barrier.frustumCulled = false;
    barrier.userData.pickCode = 'PAVEMENT';
    this.root.add(barrier);

    // 护栏顶部反光轮廓标
    const markCount = Math.floor(GEO.length / 8) + 1;
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 0.35), this.reflector, markCount);
    for (let i = 0; i < markCount; i++) {
      m.makeTranslation(-GEO.halfLength + i * 8, GEO.deckY + 1.26, 0);
      marks.setMatrixAt(i, m);
    }
    marks.instanceMatrix.needsUpdate = true;
    marks.frustumCulled = false;
    this.root.add(marks);

    // 两侧路缘实线
    [-1, 1].forEach(side => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(GEO.length, 0.04, 0.16), edgeMat);
      edge.position.set(0, GEO.deckY + 0.24, side * (GEO.halfDeck - 1.0));
      edge.userData.pickCode = 'PAVEMENT';
      this.root.add(edge);
    });

    // 每 20m 一道模数式伸缩缝，与箱梁节段边界对齐
    const jointCount = GEO.segmentCount + 1;
    const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.05, GEO.deckW - 0.6), jointMat, jointCount);
    const js = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < jointCount; i++) {
      p.set(-GEO.halfLength + i * GEO.segmentLen, GEO.deckY + 0.235, 0);
      joints.setMatrixAt(i, m.compose(p, q, js));
    }
    joints.instanceMatrix.needsUpdate = true;
    joints.frustumCulled = false;
    this.root.add(joints);

    // 车道导向箭头与限速标记：每 120m 一组，上下行按各自行驶方向旋转 180°
    const mkMat = (tex: THREE.CanvasTexture) => new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.8, depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const arrowMat = mkMat(markingTexture('arrow'));
    const speedMat = mkMat(markingTexture('speed'));
    this.markMats.push(arrowMat, speedMat);
    this.materials.push(arrowMat, speedMat);
    const markGeo = new THREE.PlaneGeometry(7.5, 2.4);
    markGeo.rotateX(-Math.PI / 2);
    const xs: number[] = [];
    for (let x = -360; x <= 360; x += 120) xs.push(x);
    const laneZs = GEO.laneOffsets as readonly number[];
    const place = (mat: THREE.MeshBasicMaterial, subset: number[]) => {
      const mesh = new THREE.InstancedMesh(markGeo, mat, subset.length * laneZs.length);
      const mm = new THREE.Matrix4();
      const mp = new THREE.Vector3();
      const mq = new THREE.Quaternion();
      const ms = new THREE.Vector3(1, 1, 1);
      const yAxis = new THREE.Vector3(0, 1, 0);
      let k = 0;
      subset.forEach(x => laneZs.forEach(z => {
        mq.setFromAxisAngle(yAxis, z > 0 ? Math.PI : 0);
        mp.set(x, GEO.deckY + 0.27, z);
        mesh.setMatrixAt(k++, mm.compose(mp, mq, ms));
      }));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.root.add(mesh);
    };
    place(arrowMat, xs.filter((_, i) => i % 2 === 0));
    place(speedMat, xs.filter((_, i) => i % 2 === 1));
  }

  setReveal(p: number): void { this.root.visible = p > 0.35; }

  setDayFactor(f: number): void {
    const d = Math.max(0, Math.min(1, f));
    this.reflector.opacity = 0.28 + 0.62 * (1 - d);
    this.markMats.forEach(m => { m.opacity = 0.62 + 0.2 * d; });
  }
}

import * as THREE from 'three';
import { GEO } from '../config';

/** 昼夜两套水色 / 天空色（线性空间，由 OutputPass 统一做色调映射） */
const NIGHT = {
  deep: new THREE.Color(0x04101f),
  shallow: new THREE.Color(0x0b2a44),
  sky: new THREE.Color(0x162b50),
  shore: new THREE.Color(0x16202c),
  sun: new THREE.Color(0x9fc6ff),
  fog: new THREE.Color(0x061020),
  density: 0.0008,
};
const DAY = {
  deep: new THREE.Color(0x0c2c46),
  shallow: new THREE.Color(0x1f5e78),
  sky: new THREE.Color(0xa9cbea),
  // 远水取冷灰蓝而非土黄：土黄浅滩会在远处连成一大块「平板陆地」，把楼群衬得像泡在水里
  shore: new THREE.Color(0x5b7787),
  sun: new THREE.Color(0xfff0cf),
  fog: new THREE.Color(0xa9c8df),
  density: 0.00045,
};

const VERTEX = /* glsl */`
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;

  // 波场：返回 (高度, dH/dx, dH/dz)。解析导数让片元法线与顶点位移严格同源，
  // 不再经过 96x96 网格插值 —— 任何距离下都不会出现规则菱形网纹。
  vec3 waveField(vec2 p, float t) {
    float wa = p.x * 0.006 + p.y * 0.009 + t * 0.21;
    float wb = p.x * -0.011 + p.y * 0.004 - t * 0.33;
    float warp = 6.0 * sin(wa) + 3.0 * sin(wb);
    vec2 wg = 6.0 * cos(wa) * vec2(0.006, 0.009)
            + 3.0 * cos(wb) * vec2(-0.011, 0.004);

    float h = 0.0;
    vec2 g = vec2(0.0);
    vec2 k;
    float a;
    float arg;

    k = vec2(0.019, 0.017); a = 0.58;
    arg = k.x * p.x + k.y * p.y + warp * 0.35 + t * 1.06;
    h += a * sin(arg); g += a * cos(arg) * (k + 0.35 * wg);

    k = vec2(-0.013, 0.029); a = 0.42;
    arg = k.x * p.x + k.y * p.y + warp * 0.22 + t * 1.5;
    h += a * sin(arg); g += a * cos(arg) * (k + 0.22 * wg);

    k = vec2(0.057, -0.043); a = 0.16;
    arg = k.x * p.x + k.y * p.y + t * 2.6;
    h += a * sin(arg); g += a * cos(arg) * k;

    k = vec2(0.121, 0.097); a = 0.08;
    arg = k.x * p.x + k.y * p.y + t * 3.8;
    h += a * sin(arg); g += a * cos(arg) * k;

    return vec3(h, g);
  }

  void main() {
    vec3 p = position;
    vec2 q = p.xz;
    // 远水 / 浅滩的波纹衰减拉长，避免突然变成一整块静止的平板
    float shore = smoothstep(240.0, 520.0, abs(q.y));
    float amp = mix(1.0, 0.18, shore);
    vec3 w = waveField(q, uTime);
    p.y += w.x * amp;
    vHeight = w.x * amp;
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform float uDay;
  uniform vec3 uCamera;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uShoreColor;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uHalfDeck;
  uniform float uTowerX;
  uniform float uDeckHeight;
  varying vec3 vWorld;
  varying float vHeight;

  void main() {
    vec3 V = normalize(uCamera - vWorld);
    float dist = length(uCamera - vWorld);
    // 细碎的二次波纹，打破大尺度正弦的规则感；整体提速让水面有明显流动感
    float ripple = sin(vWorld.x * 0.34 + uTime * 3.2) * sin(vWorld.z * 0.29 - uTime * 2.3);
    // 逐像素解析法线：与顶点同一波场求导，没有网格插值，远近都是连续水面
    float shore = smoothstep(240.0, 520.0, abs(vWorld.z));
    float amp = mix(1.0, 0.18, shore);
    vec3 w = waveField(vWorld.xz, uTime);
    vec2 grad = w.yz * amp;
    float detAmp = 1.0 - shore * 0.7;
    vec3 N = normalize(vec3(
      -grad.x * 0.42 + (sin(vWorld.x * 0.11 + uTime * 1.4) * 0.05 + ripple * 0.016) * detAmp,
      1.0,
      -grad.y * 0.42 + (sin(vWorld.z * 0.13 - uTime * 1.2) * 0.05 + ripple * 0.014) * detAmp
    ));
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 H = normalize(uSunDir + V);
    // 太阳高光压低并放宽，避免白天水面上出现刺眼的镜面亮斑（「太亮/太镜面」主因）
    float spec = pow(max(dot(N, H), 0.0), 80.0) * (0.14 + 0.42 * uDay);
    float glint = pow(max(dot(N, H), 0.0), 42.0) * (1.0 - uDay) * 0.10;

    vec3 base = mix(uDeep, uShallow, clamp(vHeight * 0.32 + 0.5, 0.0, 1.0));
    base = mix(base, uShoreColor, shore * 0.6);
    // 天空反射系数下调：水面以水深色为主、反射为辅，不再像一面镜子
    vec3 color = mix(base, uSky * 0.92, fresnel * (0.20 + 0.20 * uDay));
    color += uSunColor * (spec + glint);
    // 风成白沫：波峰 + 近岸拍岸碎浪 + 细节碎沫，让水面像"水"而非平整镜面
    float crest = smoothstep(0.55, 0.95, vHeight);
    float spindrift = smoothstep(0.62, 0.98, 0.5 + 0.5 * sin(vWorld.x * 0.6 + uTime * 3.1) * sin(vWorld.z * 0.5 - uTime * 2.6));
    spindrift *= 1.0 - smoothstep(500.0, 1300.0, dist);   // 远处避免高频闪烁走样
    float shoreFoam = smoothstep(0.55, 0.95, shore) * 0.7; // 近岸拍岸碎浪
    float foam = (crest * (1.0 - shore * 0.5) + spindrift * 0.5 + shoreFoam) * (0.14 + 0.22 * uDay);
    color = mix(color, vec3(0.84, 0.89, 0.92), clamp(foam, 0.0, 0.45));

    // 桥面 / 桥塔的模糊倒影：用连续波纹扰动采样点，避免插值法线造成方块状破碎
    vec2 warp = vec2(
      sin(vWorld.x * 0.018 + uTime * 0.62) + 0.6 * sin(vWorld.z * 0.033 - uTime * 0.85),
      sin(vWorld.z * 0.021 - uTime * 0.55) + 0.6 * sin(vWorld.x * 0.029 + uTime * 0.74)
    );
    vec2 rp = vWorld.xz + warp * 5.0;
    float deckRef = (1.0 - smoothstep(uHalfDeck * 0.6, uHalfDeck * 2.0, abs(rp.y)))
                  * (1.0 - smoothstep(370.0, 440.0, abs(rp.x)));
    float towerDx = min(abs(rp.x - uTowerX), abs(rp.x + uTowerX));
    float towerRef = (1.0 - smoothstep(6.0, 34.0, towerDx))
                   * (1.0 - smoothstep(8.0, 38.0, abs(rp.y)));
    float reflection = clamp(deckRef * 0.22 + towerRef * 0.30, 0.0, 0.5);
    color *= 1.0 - reflection * (0.34 + 0.58 * uDay);

    // 等效贴地阴影：把主梁与塔身轮廓沿太阳方向解析投影到水面。
    // 水面是自定义 ShaderMaterial，无法接收 shadowMap；这里在片元里解析求解，
    // 零额外 draw call / 零额外深度 pass，比 SSAO 更适合已叠加 Bloom+Outline+FXAA 的链路。
    vec2 sunSlope = uSunDir.xz / max(0.25, uSunDir.y);
    vec2 deckXZ = vWorld.xz + uDeckHeight * sunSlope;
    float deckShadow = (1.0 - smoothstep(uHalfDeck * 0.74, uHalfDeck * 1.42, abs(deckXZ.y)))
                     * (1.0 - smoothstep(380.0, 452.0, abs(deckXZ.x)));
    float towerDxSh = min(abs(deckXZ.x - uTowerX), abs(deckXZ.x + uTowerX));
    float towerShadow = (1.0 - smoothstep(5.0, 28.0, towerDxSh))
                      * (1.0 - smoothstep(10.0, 44.0, abs(deckXZ.y)));
    float contact = clamp(deckShadow * 0.28 + towerShadow * 0.20, 0.0, 0.34);
    color *= 1.0 - contact * (0.3 + 0.7 * uDay) * (1.0 - shore * 0.7);

    // 与 THREE.FogExp2 同式的距离雾，保证远景与天空衔接
    float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
    color = mix(color, uFogColor, clamp(fog, 0.0, 0.9));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 程序化水面：细分网格顶点位移 + 解析法线 + 菲涅尔天空反射 + 太阳/月光高光 + 岸边浅滩。
 *  自带昼夜色板，不依赖 envMap，降级时也不隐藏，保证桥下始终能看到水与波纹。 */
export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(y = GEO.waterY) {
    const geo = new THREE.PlaneGeometry(3600, 3600, 96, 96);
    geo.rotateX(-Math.PI / 2);
    this.uniforms = {
      uTime: { value: 0 },
      uDay: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uDeep: { value: NIGHT.deep.clone() },
      uShallow: { value: NIGHT.shallow.clone() },
      uSky: { value: NIGHT.sky.clone() },
      uShoreColor: { value: NIGHT.shore.clone() },
      uSunColor: { value: NIGHT.sun.clone() },
      uFogColor: { value: NIGHT.fog.clone() },
      uFogDensity: { value: NIGHT.density },
      uHalfDeck: { value: GEO.halfDeck },
      uTowerX: { value: GEO.towerX },
      uDeckHeight: { value: GEO.deckY - y },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = y;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  /** 0 = 夜景，1 = 正午；颜色与雾浓度同步插值 */
  setDayFactor(f: number): void {
    const d = Math.max(0, Math.min(1, f));
    this.uniforms.uDay.value = d;
    (this.uniforms.uDeep.value as THREE.Color).copy(NIGHT.deep).lerp(DAY.deep, d);
    (this.uniforms.uShallow.value as THREE.Color).copy(NIGHT.shallow).lerp(DAY.shallow, d);
    (this.uniforms.uSky.value as THREE.Color).copy(NIGHT.sky).lerp(DAY.sky, d);
    (this.uniforms.uShoreColor.value as THREE.Color).copy(NIGHT.shore).lerp(DAY.shore, d);
    (this.uniforms.uSunColor.value as THREE.Color).copy(NIGHT.sun).lerp(DAY.sun, d);
    (this.uniforms.uFogColor.value as THREE.Color).copy(NIGHT.fog).lerp(DAY.fog, d);
    this.uniforms.uFogDensity.value = NIGHT.density + (DAY.density - NIGHT.density) * d;
  }

  /** 与 SceneManager 的定向光保持同一方向：桥影与水面高光随昼夜太阳高度角同步 */
  setSunDirection(v: THREE.Vector3): void {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(v);
  }

  update(elapsed: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value = elapsed;
    (this.uniforms.uCamera.value as THREE.Vector3).copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

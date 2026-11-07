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
  deep: new THREE.Color(0x0f3552),
  shallow: new THREE.Color(0x246a86),
  sky: new THREE.Color(0xa9cbea),
  shore: new THREE.Color(0x8b8770),
  sun: new THREE.Color(0xfff0cf),
  fog: new THREE.Color(0xa9c8df),
  density: 0.00045,
};

const VERTEX = /* glsl */`
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vWaveNormal;
  varying float vHeight;

  float waveField(vec2 p, float t) {
    // 低频相位扰动打散多层正弦的干涉，避免水面出现规则棋盘格
    float warp = 6.0 * sin(p.x * 0.006 + p.y * 0.009 + t * 0.21)
               + 3.0 * sin(p.x * -0.011 + p.y * 0.004 - t * 0.33);
    float w = 0.0;
    w += 0.58 * sin(p.x * 0.019 + p.y * 0.017 + warp * 0.35 + t * 0.85);
    w += 0.34 * sin(p.x * -0.013 + p.y * 0.029 + warp * 0.22 + t * 1.15);
    w += 0.15 * sin(p.x * 0.057 + p.y * -0.043 + t * 2.05);
    w += 0.07 * sin(p.x * 0.121 + p.y * 0.097 + t * 3.10);
    return w;
  }

  void main() {
    vec3 p = position;
    vec2 q = p.xz;
    // |z| > 210 起逐渐进入浅滩 / 河岸，波纹随之衰减
    float shore = smoothstep(190.0, 330.0, abs(q.y));
    float amp = mix(1.0, 0.18, shore);
    float h = waveField(q, uTime) * amp;
    p.y += h;
    float e = 1.5;
    float hx = waveField(q + vec2(e, 0.0), uTime) - waveField(q - vec2(e, 0.0), uTime);
    float hz = waveField(q + vec2(0.0, e), uTime) - waveField(q - vec2(0.0, e), uTime);
    vWaveNormal = normalize(vec3(-hx * amp / (2.0 * e), 1.0, -hz * amp / (2.0 * e)));
    vHeight = h;
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
  varying vec3 vWaveNormal;
  varying float vHeight;

  void main() {
    vec3 V = normalize(uCamera - vWorld);
    float dist = length(uCamera - vWorld);
    // 细碎的二次波纹，打破大尺度正弦的规则感
    float ripple = sin(vWorld.x * 0.34 + uTime * 2.4) * sin(vWorld.z * 0.29 - uTime * 1.7);
    // vWaveNormal 是 37.5m 网格上的插值量，直接用于高光会显出菱形面片；
    // 压低其低频倾斜，叠加逐像素连续波纹，远近水面都保持平滑
    vec3 N = normalize(vec3(
      vWaveNormal.x * 0.30 + sin(vWorld.x * 0.11 + uTime * 1.05) * 0.055 + ripple * 0.018,
      1.0,
      vWaveNormal.z * 0.30 + sin(vWorld.z * 0.13 - uTime * 0.92) * 0.055 + ripple * 0.016
    ));
    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 110.0) * (0.30 + 0.70 * uDay);
    float glint = pow(max(dot(N, H), 0.0), 42.0) * (1.0 - uDay) * 0.14;

    vec3 base = mix(uDeep, uShallow, clamp(vHeight * 0.32 + 0.5, 0.0, 1.0));
    float shore = smoothstep(210.0, 350.0, abs(vWorld.z));
    base = mix(base, uShoreColor, shore * 0.8);
    vec3 color = mix(base, uSky, fresnel * (0.32 + 0.45 * uDay));
    color += uSunColor * (spec + glint);
    float foam = smoothstep(0.62, 0.92, vHeight + ripple * 0.05) * (1.0 - shore);
    color += vec3(0.26, 0.32, 0.36) * foam * (0.07 + 0.14 * uDay);

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
    float reflection = clamp(deckRef * 0.22 + towerRef * 0.30, 0.0, 0.42);
    color *= 1.0 - reflection * (0.4 + 0.6 * uDay);

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

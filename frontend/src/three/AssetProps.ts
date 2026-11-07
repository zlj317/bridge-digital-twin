import * as THREE from 'three';
import { GEO, HERO_ASSETS } from '../config';
import { preloadAsset, toGroundedProp, type AssetBundle } from './AssetLoader';

/** 静态资产：CC0 桥面构件 + docs/glb 本地车辆展示区。
 *  轻量车随 ASSETS 同步预载；3 个重模型后台异步加载完成后追加，不阻塞首屏。
 *  资产缺失时逐件跳过，不影响程序化桥体与车流。 */
export function buildAssetProps(assets: AssetBundle): THREE.Group {
  const root = new THREE.Group();
  root.name = 'asset-props';
  const deckY = GEO.deckY + 0.35;
  const edge = GEO.halfDeck - 1.5;

  const place = (obj: THREE.Object3D | null | undefined, targetLen: number,
                 x: number, z: number, alignLongAxisToX = true): void => {
    const prop = toGroundedProp(obj ?? null, targetLen, alignLongAxisToX);
    if (!prop) return;
    prop.position.x += x;
    prop.position.y += deckY;
    prop.position.z += z;
    root.add(prop);
  };

  // 桥头展示区：原有 CC0 近景车 + 本地导入的展示车/车斗
  place(assets.cityCar, 4.8, -GEO.halfLength + 30, -edge);
  place(assets.rescueTruck, 7.6, -GEO.halfLength + 62, edge);
  place(assets.garbageTruck, 7.6, -GEO.halfLength + 94, -edge);
  place(assets.showroomWhite, 4.8, -GEO.halfLength + 126, edge);
  place(assets.flatbed, 4.2, -GEO.halfLength + 158, -edge, false);

  for (const x of [-GEO.halfLength - 6, GEO.halfLength + 6]) {
    for (const z of [-GEO.halfDeck, GEO.halfDeck]) {
      place(assets.cornerRailing, 6, x, z, false);
    }
  }

  for (const x of [-GEO.halfLength + 120, GEO.halfLength - 120]) {
    for (const z of [-edge, edge]) {
      place(assets.steelColumn, 8, x, z, false);
    }
  }

  // 重资产（约 36.6 MB）后台加载，完成后追加到展示区，避免首屏等待
  const heroes: Array<[string, number, number, number]> = [
    [HERO_ASSETS.moskvich, -GEO.halfLength + 190, edge, 4.8],
    [HERO_ASSETS.redSedan, -GEO.halfLength + 222, -edge, 4.8],
    [HERO_ASSETS.titan, -GEO.halfLength + 254, edge, 5.6],
  ];
  heroes.forEach(([url, x, z, len]) => {
    void preloadAsset(url).then(obj => {
      const prop = toGroundedProp(obj, len, true);
      if (!prop) return;
      prop.position.x += x;
      prop.position.y += deckY;
      prop.position.z += z;
      root.add(prop);
    });
  });

  return root;
}

import * as THREE from 'three';
import type { QualityLevel, QualityPreset, Tuning } from '@escape/shared';
import { LIGHT } from './look';

/** Near clip plane for the chase and cockpit cams (m). */
export const CAMERA_NEAR = 0.1;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  quality: QualityPreset;
  dispose(): void;
}

/** Quality from `?quality=low|medium|high`, else your saved setting (P8.2), else the config default. */
export function pickQuality(search: string, tuning: Tuning, saved: QualityLevel | 'auto' = 'auto'): { level: QualityLevel; preset: QualityPreset } {
  const asked = new URLSearchParams(search).get('quality');
  const level: QualityLevel =
    asked === 'low' || asked === 'medium' || asked === 'high' ? asked : saved !== 'auto' ? saved : tuning.quality.default;
  return { level, preset: tuning.quality.presets[level] };
}

/** Renderer, scene, camera and lights (ART_STYLE §2: hemisphere + warm sun + light fog). */
export function createStage(container: HTMLElement, tuning: Tuning, quality: QualityPreset): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: quality.pixelRatioCap > 1 });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Game.renderFrame resets the stats once per frame, so they include the mirror pass.
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = quality.shadows === 'map';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LIGHT.sky);
  scene.fog = new THREE.Fog(LIGHT.sky, LIGHT.fogNear, LIGHT.fogFar);

  scene.add(new THREE.HemisphereLight(LIGHT.skyColor, LIGHT.groundColor, LIGHT.hemiIntensity));
  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
  const [dx, dy, dz] = LIGHT.sunDir;
  sun.position.set(-dx, -dy, -dz).multiplyScalar(100);
  if (quality.shadows === 'map') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  }
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, container.clientWidth / container.clientHeight, CAMERA_NEAR, LIGHT.fogFar * 2);

  const onResize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    renderer,
    scene,
    camera,
    sun,
    quality,
    dispose: () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// Ocean and lake surfaces with a lightweight animated shader.
import * as THREE from 'three';
import { LAKES, SEA_LEVEL } from './terrain.js';

const vert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.05 + uTime * 0.9) * 0.18 + cos(wp.z * 0.07 + uTime * 0.7) * 0.14;
  wp.y += w;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uLight;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.6;
  float t = uTime;
  float n1 = vnoise(p * 0.18 + vec2(t * 0.35, t * 0.2)) + vnoise(p * 0.45 - vec2(t * 0.25, t * 0.4)) * 0.5;
  float nx = vnoise((p + vec2(e, 0.0)) * 0.18 + vec2(t * 0.35, t * 0.2)) + vnoise((p + vec2(e, 0.0)) * 0.45 - vec2(t * 0.25, t * 0.4)) * 0.5;
  float nz = vnoise((p + vec2(0.0, e)) * 0.18 + vec2(t * 0.35, t * 0.2)) + vnoise((p + vec2(0.0, e)) * 0.45 - vec2(t * 0.25, t * 0.4)) * 0.5;
  float dist = length(cameraPosition - vWorld);
  float strength = 1.4 * (1.0 - smoothstep(30.0, 350.0, dist)) + 0.15;
  vec3 n = normalize(vec3((n1 - nx) * strength, 1.0, (n1 - nz) * strength));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  if (viewDir.y < 0.0) n = -n; // seen from below
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
  vec3 base = mix(uShallow, uDeep, clamp(0.6 + n1 * 0.2, 0.0, 1.0)) * uLight;
  vec3 col = mix(base, uSkyColor * 0.8, fres * 0.6);
  vec3 h = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 220.0) * step(0.0, uSunDir.y);
  col += uSunColor * spec * 2.5;
  gl_FragColor = vec4(col, mix(0.78, 0.96, fres));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  constructor(scene, sky) {
    this.sky = sky;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3() },
        uSunColor: { value: new THREE.Color() },
        uSkyColor: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color(0.01, 0.07, 0.12) },
        uShallow: { value: new THREE.Color(0.02, 0.18, 0.2) },
        uLight: { value: 1 },
      },
    ]);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      fog: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // Ocean: dense grid near the centre, coarse far away
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000, 120, 120), this.material);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = SEA_LEVEL;
    ocean.renderOrder = 1;
    ocean.frustumCulled = false;
    scene.add(ocean);
    this.meshes = [ocean];
    for (const lake of LAKES) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(lake.r * 1.3, 48), this.material);
      m.rotation.x = -Math.PI / 2;
      m.position.set(lake.x, lake.level, lake.z);
      m.renderOrder = 1;
      scene.add(m);
      this.meshes.push(m);
    }
  }

  update(dt) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uSunDir.value.copy(this.sky.uniforms.uSunDir.value);
    u.uSunColor.value.copy(this.sky.uniforms.uSunColor.value);
    u.uSkyColor.value.copy(this.sky.uniforms.uHorizon.value);
    u.uLight.value = 0.25 + 0.75 * Math.max(0, Math.min(1, this.sky.sunElevation * 3 + 0.3));
  }
}

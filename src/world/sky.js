// Day/night cycle, sky dome with clouds and stars, sun/moon lighting, fog and rain.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uSunColor;
uniform float uStars;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudLight;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uTop, t);
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-y * 4.0, 0.0, 1.0));
  // sun
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 18.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12) * step(-0.05, uSunDir.y);
  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.9993, 0.9996, md) * 0.9 + pow(md, 60.0) * 0.08) * uStars;
  // stars
  if (uStars > 0.01 && y > 0.0) {
    vec3 sp = d * 220.0;
    float st = hash(floor(sp.xy) + floor(sp.z) * 13.1);
    float star = smoothstep(0.9975, 1.0, st) * (0.6 + 0.4 * sin(uTime * 3.0 + st * 100.0));
    col += vec3(star) * uStars * clamp(y * 4.0, 0.0, 1.0);
  }
  // clouds (projected plane)
  if (y > 0.02) {
    vec2 uv = d.xz / (y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv);
    float cover = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.35, c);
    vec3 ccol = mix(uHorizon * 0.9, vec3(1.0), 0.6) * uCloudLight;
    ccol += uSunColor * pow(sd, 6.0) * 0.4;
    col = mix(col, ccol, cover * smoothstep(0.02, 0.18, y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const C = (r, g, b) => new THREE.Color(r, g, b);
const PALETTE = {
  dayTop: C(0.18, 0.42, 0.82),
  dayHorizon: C(0.68, 0.8, 0.93),
  duskTop: C(0.2, 0.25, 0.48),
  duskHorizon: C(0.98, 0.56, 0.32),
  nightTop: C(0.012, 0.02, 0.05),
  nightHorizon: C(0.05, 0.07, 0.13),
};

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 7.5; // hours
    this.day = 1;
    this.rain = 0;
    this.rainTarget = 0;
    this.weatherTimer = 240;
    this.fogBoost = 0;
    this.elapsed = 0;

    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uCloudCover: { value: 0.45 },
      uCloudLight: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(5000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a30, 0.9);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(this.ambient);

    scene.fog = new THREE.Fog(0xaabbcc, 60, 1400);
    this.fogColor = new THREE.Color();
    this.horizonColor = new THREE.Color();

    this.buildRain();
  }

  buildRain() {
    const count = 2500;
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 40, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.35, fog: false }));
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
  }

  get isNight() {
    return this.time < 5.5 || this.time > 19.5;
  }

  get sunElevation() {
    return this.uniforms.uSunDir.value.y;
  }

  timeString() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return `Day ${this.day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Base outside air temperature in °C before altitude/biome modifiers.
  baseTemperature() {
    const t = this.time;
    const daily = Math.sin(((t - 9) / 24) * Math.PI * 2); // peaks ~15:00
    return 22 + daily * 8 - this.rain * 6;
  }

  update(dt, camPos, speedMult = 1, underwater = false) {
    this.elapsed += dt;
    // 14 daylight hours take 45 real minutes, 10 night hours take 15 minutes (≈1h per day).
    const daytime = this.time >= 5.5 && this.time < 19.5;
    const rate = daytime ? 14 / 2700 : 10 / 900;
    this.time += dt * rate * speedMult;
    if (this.time >= 24) { this.time -= 24; this.day++; }

    // weather
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 180 + Math.random() * 420;
      this.rainTarget = Math.random() < 0.28 ? 0.5 + Math.random() * 0.5 : 0;
    }
    this.rain = lerp(this.rain, this.rainTarget, clamp(dt * 0.05, 0, 1));
    const morningFog = smoothstep(4.5, 6.5, this.time) * (1 - smoothstep(7.5, 9.5, this.time));

    // sun rises at 05:30 and sets at 19:30; the night arc is compressed
    const theta = daytime
      ? ((this.time - 5.5) / 14) * Math.PI
      : Math.PI + (((this.time < 5.5 ? this.time + 24 : this.time) - 19.5) / 10) * Math.PI;
    const sunDir = this.uniforms.uSunDir.value.set(Math.cos(theta), Math.sin(theta), 0.35).normalize();
    this.uniforms.uMoonDir.value.set(-sunDir.x, -sunDir.y, -0.2).normalize();
    const elev = sunDir.y;

    const dayF = smoothstep(-0.08, 0.25, elev);
    const duskF = (1 - smoothstep(0.0, 0.35, Math.abs(elev))) * 0.9;
    const top = this.uniforms.uTop.value;
    const hor = this.uniforms.uHorizon.value;
    top.copy(PALETTE.nightTop).lerp(PALETTE.dayTop, dayF).lerp(PALETTE.duskTop, duskF * 0.5);
    hor.copy(PALETTE.nightHorizon).lerp(PALETTE.dayHorizon, dayF).lerp(PALETTE.duskHorizon, duskF * smoothstep(-0.15, 0.05, elev));
    const grey = new THREE.Color(0.2, 0.22, 0.25).multiplyScalar(0.15 + 0.85 * dayF);
    top.lerp(grey, this.rain * 0.85);
    hor.lerp(grey.clone().multiplyScalar(1.25), this.rain * 0.8);
    this.uniforms.uStars.value = (1 - smoothstep(-0.2, 0.05, elev)) * (1 - this.rain);
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uCloudCover.value = 0.42 + this.rain * 0.5;
    this.uniforms.uCloudLight.value = (0.15 + 0.85 * dayF) * (1 - this.rain * 0.55);
    this.uniforms.uSunColor.value.setRGB(1, lerp(0.55, 0.92, smoothstep(0, 0.4, elev)), lerp(0.3, 0.8, smoothstep(0, 0.4, elev)));

    // lights: the directional light follows the sun by day and the moon by night
    const moonUp = elev < -0.02;
    const lightDir = moonUp ? this.uniforms.uMoonDir.value : sunDir;
    this.sun.position.set(camPos.x + lightDir.x * 300, camPos.y + Math.max(lightDir.y, 0.15) * 300, camPos.z + lightDir.z * 300);
    this.sun.target.position.set(camPos.x, camPos.y, camPos.z);
    // snap shadow camera to texels to avoid shimmering
    const sunI = moonUp ? 0.28 * (1 - this.rain * 0.6) : (0.2 + 2.3 * smoothstep(-0.02, 0.3, elev)) * (1 - this.rain * 0.7);
    this.sun.intensity = sunI;
    this.sun.color.copy(moonUp ? new THREE.Color(0.6, 0.7, 1.0) : new THREE.Color(1, lerp(0.62, 0.95, smoothstep(0, 0.3, elev)), lerp(0.4, 0.86, smoothstep(0, 0.3, elev))));
    this.hemi.intensity = (0.25 + 0.75 * dayF) * (1 - this.rain * 0.3);
    this.hemi.color.copy(hor).lerp(new THREE.Color(0.75, 0.85, 1), 0.5);
    this.hemi.groundColor.setRGB(0.25 * (0.3 + dayF), 0.3 * (0.3 + dayF), 0.18 * (0.3 + dayF));
    this.ambient.intensity = 0.12 + 0.05 * dayF;

    // fog
    const fog = this.scene.fog;
    this.horizonColor.copy(hor);
    if (underwater) {
      fog.color.setRGB(0.05, 0.22, 0.3).multiplyScalar(0.3 + 0.7 * dayF);
      fog.near = 0;
      fog.far = 45;
    } else {
      fog.color.copy(hor);
      const density = Math.max(this.rain * 0.7, morningFog * 0.55, this.fogBoost);
      fog.near = lerp(80, 10, density);
      fog.far = lerp(1500, 260, density);
    }

    this.dome.position.copy(camPos);

    // rain
    this.rainMesh.visible = this.rain > 0.08 && !underwater;
    if (this.rainMesh.visible) {
      this.rainMesh.material.opacity = 0.35 * this.rain;
      const p = this.rainMesh.geometry.attributes.position.array;
      const fall = dt * 22;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall;
        if (p[i + 1] < -5) {
          const x = (Math.random() - 0.5) * 60, y = 35 + Math.random() * 5, z = (Math.random() - 0.5) * 60;
          p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = x + 0.05; p[i + 4] = y - 0.7; p[i + 5] = z;
        }
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
      this.rainMesh.position.set(camPos.x, camPos.y - 15, camPos.z);
    }
  }
}

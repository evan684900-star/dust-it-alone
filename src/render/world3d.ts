import * as THREE from 'three';
import type { RoomDef } from '../data/rooms';
import { DIRT_TYPES } from '../data/dirtTypes';
import type { RoomSim } from '../sim/roomSim';
import { PAL } from './palette';
import { fabric, mat, metal, solid } from './materials';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dustBunnyGeometry, grainGeometry, roundedBox, starGeometry } from './geometry';
import { blobShadow, drawPlanks, softDot } from './canvasTextures';
import { buildBroom, buildDustpan, buildProp } from './props';
import { Floaters } from './floaters';
import { QUALITY_PRESETS, type QualityLevel } from './quality';

/** Hauteur des murs bas et du faîte du toit (cm). */
export const KNEE = 140;
export const RIDGE = 520;

export interface ViewState {
  x: number;
  z: number;
  eye: number;
  yaw: number;
  pitch: number;
}

export interface BroomView {
  visible: boolean;
  x: number;
  z: number;
  pressed: boolean;
}

interface Pan { obj: THREE.Group; bounce: number; pending: number; timer: number; textX: number; textZ: number }
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; vr: number; life: number }

function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const DUST_COLORS = [0x9e95a6, 0xaea197, 0x938c9f, 0xb7adb9, 0xa69ca8];

/**
 * Tout l'affichage 3D (Three.js) : le grenier, les particules, le balai, les effets.
 * Lit l'état de la simulation sans jamais le modifier.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 3, 6000);
  readonly floaters: Floaters;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  quality: QualityLevel = 'medium';
  private sun!: THREE.DirectionalLight;
  private extraLights: THREE.Light[] = [];
  private ambience: THREE.Object3D[] = [];
  private particleMats: { rich: THREE.Material; cheap: THREE.Material; mesh: THREE.InstancedMesh; big: boolean }[] = [];
  private useComposer = true;
  private dustGeoHigh = grainGeometry();
  private dustGeoLow = (() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(1, 0.55, 0.85);
    return g;
  })();
  private room!: RoomDef;
  private dust!: THREE.InstancedMesh;
  private bunnies!: THREE.InstancedMesh;
  private stars!: THREE.InstancedMesh;
  private pans: Pan[] = [];
  private broom = buildBroom();
  private ring = new THREE.Group();
  private ringFill!: THREE.Mesh;
  private confetti!: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private motes!: THREE.Points;
  private moteSeeds: Float32Array = new Float32Array(0);
  private time = 0;
  private shake = 0;
  private headLean = 0;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(PAL.ink);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.id = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.camera.rotation.order = 'YXZ';
    this.floaters = new Floaters(this.camera);

    // Éclairage d'environnement : reflets doux sur toutes les surfaces.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    // Post-traitement : occlusion ambiante (les coins s'assombrissent), halo lumineux, couleurs finales.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.updateGtaoMaterial({ radius: 40, distanceExponent: 1.5, thickness: 8, scale: 1.2, samples: 12 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  build(sim: RoomSim): void {
    this.room = sim.room;
    this.buildRoom();
    this.buildParticles(sim);
    for (const p of this.room.obstacles) {
      const obj = buildProp(p);
      obj.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) this.extraLights.push(o as THREE.Light);
      });
      this.scene.add(obj);
      this.addShadow(p.rect.x + p.rect.w / 2, p.rect.y + p.rect.h / 2, Math.max(p.rect.w, p.rect.h) * 0.75);
    }
    for (const c of this.room.collectors) {
      const obj = buildDustpan(c);
      this.scene.add(obj);
      const dir = c.facing === 'right' ? 1 : -1;
      this.pans.push({ obj, bounce: 0, pending: 0, timer: 0, textX: c.mouth.x + dir * 70, textZ: c.mouth.y });
    }
    this.scene.add(this.broom.root);
    this.buildRing();
    this.buildFx();
  }

  // ───────────────────────────── Décor ─────────────────────────────

  private buildRoom(): void {
    const { width: W, height: H } = this.room;
    const s = this.scene;
    s.background = new THREE.Color(PAL.ink);
    s.fog = new THREE.FogExp2(0x2a1a30, 0.00028);

    // Lumières : ciel chaud + soleil qui entre par la lucarne.
    s.add(new THREE.HemisphereLight(0xffe9c8, 0x6a4a5a, 1.6));
    // Le soleil entre par la lucarne : c'est lui qui projette les grandes ombres.
    const sun = new THREE.DirectionalLight(0xffd59a, 4.2);
    this.sun = sun;
    sun.position.set(W + 500, 900, H / 2 - 120);
    sun.target.position.set(W / 2 - 150, 0, H / 2 + 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -1100; sc.right = 1100; sc.top = 800; sc.bottom = -800; sc.near = 100; sc.far = 3200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
    sun.shadow.radius = 4;
    s.add(sun, sun.target);
    // Lumière d'appoint froide côté ombre, pour garder du relief.
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.5);
    fill.position.set(-400, 500, H / 2 + 300);
    s.add(fill);

    // Sol en planches.
    const floorCanvas = drawPlanks(W, H, { px: 1.6, woods: ['#b8743c', '#a8652f', '#c4824a'], grain: 'rgba(90,45,20,0.35)', ink: '#3a2018' });
    const floorBump = new THREE.CanvasTexture(floorCanvas);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      mat(0xffffff, { map: canvasTex(floorCanvas), bumpMap: floorBump, bumpScale: 2.5, roughness: 0.62 }),
    );
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    s.add(floor);

    // Murs bas (le long de z = 0 et z = H).
    const wallTex = canvasTex(drawPlanks(W, KNEE, { px: 1, plank: 46, woods: ['#7a4a86', '#6b3d7a', '#83528f'], grain: 'rgba(43,26,46,0.3)' }));
    for (const z of [0, H]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, KNEE), mat(0xffffff, { map: wallTex, bumpMap: wallTex, bumpScale: 1.5, roughness: 0.8 }));
      wall.receiveShadow = true;
      wall.position.set(W / 2, KNEE / 2, z);
      wall.rotation.y = z === 0 ? 0 : Math.PI;
      s.add(wall);
      // Plinthe épaisse.
      const base = solid(roundedBox(W, 14, 8, 3), mat(0x4a2a3a, { roughness: 0.5 }));
      base.position.set(W / 2, 7, z === 0 ? 4 : H - 4);
      s.add(base);
    }

    // Pans du toit.
    const slope = Math.hypot(H / 2, RIDGE - KNEE);
    const roofAngle = Math.atan2(RIDGE - KNEE, H / 2);
    const roofTex = canvasTex(drawPlanks(W, slope, { px: 0.8, plank: 60, woods: ['#7a5038', '#6a4430', '#86583e'], grain: 'rgba(20,10,20,0.35)', nails: false }));
    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, slope), mat(0xd8c8c0, { map: roofTex, bumpMap: roofTex, bumpScale: 2, roughness: 0.85, side: THREE.DoubleSide }));
      roof.receiveShadow = true;
      roof.position.set(W / 2, (KNEE + RIDGE) / 2, H / 2 + (side * H) / 4);
      roof.rotation.x = side < 0 ? Math.PI / 2 - roofAngle : -(Math.PI / 2 - roofAngle);
      roof.rotation.order = 'XYZ';
      s.add(roof);
    }

    // Pignons (murs en forme de maison aux deux bouts).
    const gableTex = canvasTex(drawPlanks(H, RIDGE, { px: 0.9, plank: 55, woods: ['#7a4a86', '#6b3d7a', '#83528f'], grain: 'rgba(43,26,46,0.3)', vertical: true }));
    for (const x of [0, W]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(H, 0);
      shape.lineTo(H, KNEE);
      shape.lineTo(H / 2, RIDGE);
      shape.lineTo(0, KNEE);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / H, pos.getY(i) / RIDGE);
      const gable = new THREE.Mesh(geo, mat(0xffffff, { map: gableTex, bumpMap: gableTex, bumpScale: 1.5, roughness: 0.8, side: THREE.DoubleSide }));
      gable.receiveShadow = true;
      // Forme dessinée dans le plan XY : on la tourne pour qu'elle suive l'axe Z.
      gable.rotation.y = -Math.PI / 2;
      gable.position.set(x, 0, 0);
      s.add(gable);
    }

    // Charpente : poutre faîtière, chevrons et entraits.
    const beamMat = mat(0x6e3a1f, { roughness: 0.75 });
    const ridge = solid(roundedBox(W, 30, 34, 6), beamMat);
    ridge.position.set(W / 2, RIDGE - 22, H / 2);
    s.add(ridge);
    for (let x = 130; x < W; x += 270) {
      for (const side of [-1, 1]) {
        const rafter = solid(roundedBox(22, 26, slope, 5), beamMat);
        rafter.position.set(x, (KNEE + RIDGE) / 2 - 16, H / 2 + (side * H) / 4);
        rafter.rotation.x = side * roofAngle;
        s.add(rafter);
      }
      const tie = solid(roundedBox(20, 22, H * 0.62, 5), beamMat);
      tie.position.set(x, 380, H / 2);
      s.add(tie);
    }

    // Lucarne ronde sur le pignon de droite.
    const winY = 360;
    const frame = solid(new THREE.TorusGeometry(62, 11, 16, 48), metal(0xc9a24a, 0.4));
    frame.rotation.y = Math.PI / 2;
    frame.position.set(W - 4, winY, H / 2);
    s.add(frame);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4c8).multiplyScalar(3) }));
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(W - 2, winY, H / 2);
    s.add(glass);
    for (const rot of [0, Math.PI / 2]) {
      const bar = solid(roundedBox(6, 120, 8, 2), metal(0xc9a24a, 0.4));
      bar.rotation.x = rot;
      bar.position.set(W - 6, winY, H / 2);
      s.add(bar);
    }

    // Rayon de lumière (cône transparent additif) et flaque de lumière au sol.
    const beamTarget = new THREE.Vector3(W - 560, 0, H / 2 + 80);
    const beamStart = new THREE.Vector3(W - 4, winY, H / 2);
    const beamLen = beamStart.distanceTo(beamTarget);
    for (const [rTop, rBot, op] of [[55, 150, 0.07], [40, 110, 0.06]] as const) {
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, beamLen, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.copy(beamStart).lerp(beamTarget, 0.5);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamTarget.clone().sub(beamStart).normalize());
      s.add(cone);
      this.ambience.push(cone);
    }
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ map: canvasTex(softDot()), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(320, 200, 1);
    pool.position.set(beamTarget.x, 1, beamTarget.z);
    s.add(pool);

    // Grains de lumière qui flottent dans le rayon.
    const n = 160;
    const pos = new Float32Array(n * 3);
    this.moteSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const p = beamStart.clone().lerp(beamTarget, t);
      this.moteSeeds[i * 3] = p.x + (Math.random() - 0.5) * 160;
      this.moteSeeds[i * 3 + 1] = Math.max(15, p.y + (Math.random() - 0.5) * 120);
      this.moteSeeds[i * 3 + 2] = p.z + (Math.random() - 0.5) * 160;
      pos.set([this.moteSeeds[i * 3], this.moteSeeds[i * 3 + 1], this.moteSeeds[i * 3 + 2]], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      mg,
      new THREE.PointsMaterial({ size: 7, map: canvasTex(softDot()), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    s.add(this.motes);
    this.ambience.push(this.motes);
  }

  private shadowTex: THREE.Texture | null = null;
  private addShadow(x: number, z: number, size: number): void {
    this.shadowTex ??= canvasTex(blobShadow());
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.6, z);
    this.scene.add(m);
  }

  // ───────────────────────────── Particules ─────────────────────────────

  private buildParticles(sim: RoomSim): void {
    const r = sim.pool.ranges;
    const make = (geo: THREE.BufferGeometry, material: THREE.Material, count: number) => {
      const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const reg = (mesh: THREE.InstancedMesh, cheap: THREE.Material, big: boolean) => {
      this.particleMats.push({ rich: mesh.material as THREE.Material, cheap, mesh, big });
      return mesh;
    };
    this.dust = reg(make(this.dustGeoHigh, fabric(0xffffff, { sheen: 0.6 }), r.dust.count), mat(0xffffff, { roughness: 0.95 }), false);
    const c = new THREE.Color();
    for (let i = 0; i < r.dust.count; i++) this.dust.setColorAt(i, c.set(DUST_COLORS[(i * 7) % DUST_COLORS.length]));
    this.bunnies = reg(make(dustBunnyGeometry(), fabric(0xffffff, { vertexColors: true }), r.bunny.count), mat(0xffffff, { vertexColors: true, roughness: 0.95 }), true);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.25 });
    this.stars = reg(make(starGeometry(), starMat, r.star.count), starMat, true);
  }

  /** Applique un niveau de qualité (à tout moment, sans recharger). */
  setQuality(level: QualityLevel): void {
    this.quality = level;
    const q = QUALITY_PRESETS[level];
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));

    const shadowsOn = q.shadowMap > 0;
    r.shadowMap.enabled = shadowsOn;
    this.sun.castShadow = shadowsOn;
    if (shadowsOn && this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }

    this.dust.geometry = q.lowPolyDust ? this.dustGeoLow : this.dustGeoHigh;
    for (const p of this.particleMats) {
      p.mesh.material = q.richParticles ? p.rich : p.cheap;
      p.mesh.castShadow = p.big ? q.bigParticleShadows : q.dustShadows;
    }
    for (const l of this.extraLights) l.visible = q.extraLights;
    for (const o of this.ambience) o.visible = q.ambienceFx;

    this.gtao.enabled = q.gtao;
    this.bloom.enabled = q.bloom;
    this.useComposer = q.gtao || q.bloom || q.msaa > 0;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== q.msaa) {
        rt.samples = q.msaa;
        rt.dispose();
      }
    }

    // Les matériaux doivent être recompilés quand on active/désactive les ombres ou des lumières.
    {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
    this.resize();
  }

  /** Nom de la carte graphique utilisée par le navigateur (pour repérer un rendu logiciel). */
  gpuName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  private buildRing(): void {
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const edgeInk = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.06, 48),
      new THREE.MeshBasicMaterial({ color: PAL.ink, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.ringFill = new THREE.Mesh(
      new THREE.CircleGeometry(0.93, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    for (const m of [edge, edgeInk, this.ringFill]) m.rotation.x = -Math.PI / 2;
    this.ring.add(this.ringFill, edge, edgeInk);
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
  }

  private buildFx(): void {
    const max = 500;
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(9, 5),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      max,
    );
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    const c = new THREE.Color();
    const colors = [PAL.tomato, PAL.mustard, PAL.apple, PAL.sky, 0xffffff, PAL.plum];
    for (let i = 0; i < max; i++) this.confetti.setColorAt(i, c.set(colors[i % colors.length]));
    this.scene.add(this.confetti);
  }

  // ───────────────────────────── Événements ─────────────────────────────

  onCollect(collector: number, coins: number, isStar: boolean): void {
    const pan = this.pans[collector];
    pan.pending += coins;
    pan.bounce = Math.min(1, pan.bounce + (isStar ? 0.9 : 0.05));
    if (isStar) {
      this.shake = Math.max(this.shake, 3);
      this.burst(pan.textX, 40, pan.textZ, 30);
    }
  }

  celebrate(): void {
    const { width: W, height: H } = this.room;
    for (let k = 0; k < 6; k++) this.burst(W * (0.15 + k * 0.14), 300, H / 2 + (k % 2 ? 150 : -150), 60);
    this.shake = 6;
  }

  private burst(x: number, y: number, z: number, n: number): void {
    for (let k = 0; k < n && this.bits.length < 500; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 150 + Math.random() * 350;
      this.bits.push({ x, y, z, vx: Math.cos(a) * sp, vy: 300 + Math.random() * 400, vz: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 16, life: 1.8 + Math.random() });
    }
  }

  // ───────────────────────────── Rendu ─────────────────────────────

  render(sim: RoomSim, dt: number, view: ViewState, broom: BroomView): void {
    this.time += dt;
    const cam = this.camera;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 15);
    cam.position.set(view.x + sx, view.eye + sy, view.z);
    cam.rotation.set(view.pitch, view.yaw, 0);
    cam.updateMatrixWorld();

    this.updateParticles(sim);
    this.updatePans(dt);
    this.updateBroom(sim, dt, broom);
    this.updateFx(dt);
    this.floaters.update(dt);
    this.renderer.info.reset();
    if (this.useComposer) this.composer.render(dt);
    else this.renderer.render(this.scene, cam);
  }

  private updateParticles(sim: RoomSim): void {
    const pool = sim.pool;
    const { x, y, rot, age, alive } = pool;
    const camX = this.camera.position.x;
    const camZ = this.camera.position.z;
    const t = this.time;

    const write = (mesh: THREE.InstancedMesh, start: number, count: number, kind: 'dust' | 'bunny' | 'star') => {
      const arr = mesh.instanceMatrix.array as Float32Array;
      const radius = DIRT_TYPES[kind].radius;
      for (let k = 0; k < count; k++) {
        const i = start + k;
        const o = k * 16;
        if (!alive[i]) {
          if (arr[o + 15] !== 0) arr.fill(0, o, o + 16);
          continue;
        }
        let s = radius;
        const a = age[i];
        if (a < 0.35) s *= popEase(a / 0.35);
        let yaw = rot[i];
        let py = 0;
        if (kind === 'dust') {
          s *= 0.8 + ((i * 13) % 10) / 20;
          py = s * 0.4;
        } else if (kind === 'bunny') {
          // Les moutons te regardent toujours. Toujours.
          yaw = Math.atan2(camX - x[i], camZ - y[i]);
          s *= 0.9 + ((i * 7) % 5) / 20;
          py = s * 0.8 + Math.abs(Math.sin(rot[i] * 0.5)) * s * 0.35;
        } else {
          yaw = t * 2.5 + i;
          s *= 1.1 + Math.sin(t * 6 + i) * 0.15;
          py = 18 + Math.sin(t * 3 + i) * 5;
        }
        const c = Math.cos(yaw) * s;
        const sn = Math.sin(yaw) * s;
        arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
        arr[o + 12] = x[i]; arr[o + 13] = py; arr[o + 14] = y[i]; arr[o + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    const r = pool.ranges;
    write(this.dust, r.dust.start, r.dust.count, 'dust');
    write(this.bunnies, r.bunny.start, r.bunny.count, 'bunny');
    write(this.stars, r.star.start, r.star.count, 'star');
  }

  private updatePans(dt: number): void {
    for (const pan of this.pans) {
      pan.timer += dt;
      if (pan.pending > 0 && pan.timer > 0.22) {
        this.floaters.spawn(pan.textX, 70 + Math.random() * 30, pan.textZ + (Math.random() - 0.5) * 60, pan.pending);
        pan.pending = 0;
        pan.timer = 0;
      }
      pan.bounce = Math.max(0, pan.bounce - dt * 2.5);
      const b = Math.sin(this.time * 30) * pan.bounce;
      const sx = Math.sign(pan.obj.scale.x) || 1;
      pan.obj.scale.set(sx * (1 + b * 0.1 + pan.bounce * 0.06), 1 - b * 0.12 + pan.bounce * 0.1, 1 + b * 0.08);
    }
  }

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  private updateBroom(sim: RoomSim, dt: number, broom: BroomView): void {
    const { root, head, handle } = this.broom;
    root.visible = broom.visible;
    this.ring.visible = broom.visible;
    if (!broom.visible) return;
    const cam = this.camera;
    const yaw = cam.rotation.y;

    // La brosse est au sol, au point visé, perpendiculaire au regard.
    head.position.set(broom.x, 0, broom.z);
    head.rotation.set(0, yaw, 0);
    // Elle se penche dans le sens du mouvement.
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const v = sim.broomVel;
    const lateral = (v.x * rightX + v.y * rightZ) / 2500;
    const along = (v.x * fwdX + v.y * fwdZ) / 2500;
    this.headLean += (THREE.MathUtils.clamp(-lateral, -0.35, 0.35) - this.headLean) * Math.min(1, dt * 12);
    head.rotation.z = this.headLean;
    head.rotation.x = THREE.MathUtils.clamp(along, -0.3, 0.3);
    const speed = Math.hypot(v.x, v.y);
    const squash = Math.min(0.22, speed / 7000) + (broom.pressed ? 0.12 : 0);
    head.scale.set(1 + squash, 1 - squash, 1);

    // Le manche relie la brosse aux mains (en bas à droite de l'écran).
    const grip = this.tmpA.set(24, -42, -36).applyMatrix4(cam.matrixWorld);
    const base = this.tmpB.set(0, 34 * (1 - squash), 0);
    head.localToWorld(base);
    handle.position.copy(base);
    const dir = grip.clone().sub(base).normalize();
    handle.quaternion.setFromUnitVectors(this.up, dir);

    const R = sim.broom.radius * (broom.pressed ? 1.12 : 1);
    this.ring.position.set(broom.x, 1.2, broom.z);
    this.ring.scale.setScalar(R);
    (this.ringFill.material as THREE.MeshBasicMaterial).opacity = broom.pressed ? 0.18 : 0.08;
  }

  private dummy = new THREE.Object3D();
  private updateFx(dt: number): void {
    // Grains de lumière.
    const p = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const sd = this.moteSeeds;
      p.setXYZ(
        i,
        sd[i * 3] + Math.sin(this.time * 0.3 + i) * 25,
        sd[i * 3 + 1] + Math.sin(this.time * 0.5 + i * 1.7) * 18,
        sd[i * 3 + 2] + Math.cos(this.time * 0.4 + i * 0.7) * 25,
      );
    }
    p.needsUpdate = true;

    // Confettis.
    let n = 0;
    for (let k = this.bits.length - 1; k >= 0; k--) {
      const b = this.bits[k];
      b.life -= dt;
      if (b.life <= 0 || b.y < 0) {
        this.bits.splice(k, 1);
        continue;
      }
      b.vy -= 700 * dt;
      b.vx *= Math.exp(-1.2 * dt);
      b.vz *= Math.exp(-1.2 * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.r += b.vr * dt;
      this.dummy.position.set(b.x, b.y, b.z);
      this.dummy.rotation.set(b.r, b.r * 0.7, b.r * 0.3);
      this.dummy.scale.setScalar(Math.min(1, b.life * 2));
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(n++, this.dummy.matrix);
    }
    this.confetti.count = n;
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}

function popEase(t: number): number {
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

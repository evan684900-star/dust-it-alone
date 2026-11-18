import * as THREE from 'three';
import type { DoorDef, RoomDef, StairDef } from '../data/rooms';
import { DIRT_TYPES } from '../data/dirtTypes';
import type { RoomSim } from '../sim/roomSim';
import { PAL } from './palette';
import { fabric, mat } from './materials';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dustBunnyGeometry, grainGeometry, starGeometry } from './geometry';
import { buildBroom, buildDustpan, buildProp } from './props';
import { buildDoor, buildRoomShell, buildStair, type DoorView } from './castle';
import { Floaters } from './floaters';
import { mergeStatic } from './merge';
import { QUALITY_PRESETS, type QualityLevel } from './quality';

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
  /** Altitude du sol sous la brosse. */
  y: number;
  pressed: boolean;
}

interface Pan { obj: THREE.Group; bounce: number; pending: number; timer: number; textX: number; textZ: number }
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; vr: number; life: number }

/** Tout ce qui s'affiche pour une pièce du château. */
interface RoomView {
  def: RoomDef;
  sim: RoomSim;
  group: THREE.Group;
  dust: THREE.InstancedMesh;
  bunnies: THREE.InstancedMesh;
  stars: THREE.InstancedMesh;
  pans: Pan[];
  ambience: THREE.Object3D[];
  /** Positions monde des flammes (pour les lumières dynamiques). */
  torches: THREE.Vector3[];
  flames: THREE.Object3D[];
  motes?: { points: THREE.Points; seeds: Float32Array };
  visible: boolean;
}

const DUST_COLORS = [0x9e95a6, 0xaea197, 0x938c9f, 0xb7adb9, 0xa69ca8];
/** Nombre de lumières dynamiques (torches, lampes) : fixe pour éviter de recompiler les matériaux. */
const LIGHT_POOL = 4;

/**
 * Tout l'affichage 3D (Three.js) du château : pièces, escaliers, portes,
 * particules, balai et effets. Lit l'état de la simulation sans jamais le modifier.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 3, 9000);
  readonly floaters: Floaters;
  quality: QualityLevel = 'medium';
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private sun!: THREE.DirectionalLight;
  private lights: THREE.PointLight[] = [];
  private particleMats: { rich: THREE.Material; mid: THREE.Material; low: THREE.Material; mesh: THREE.InstancedMesh; big: boolean }[] = [];
  private lambertCache = new Map<THREE.Material, THREE.Material>();
  private useComposer = true;
  private envMap!: THREE.Texture;
  private dustGeoHigh = grainGeometry();
  private dustGeoLow = (() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(1, 0.55, 0.85);
    return g;
  })();
  private bunnyGeo = dustBunnyGeometry();
  private starGeo = starGeometry();
  private sharedMats!: { dust: [THREE.Material, THREE.Material]; bunny: [THREE.Material, THREE.Material]; star: THREE.Material };
  private views: RoomView[] = [];
  private doors: DoorView[] = [];
  private stairFlames: THREE.Object3D[] = [];
  private stairTorches: THREE.Vector3[] = [];
  private broom = buildBroom();
  private ring = new THREE.Group();
  private ringFill!: THREE.Mesh;
  private confetti!: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private time = 0;
  private shake = 0;
  private headLean = 0;
  private activeRoom: RoomDef | null = null;
  private lightTimer = 0;
  private ambienceOn = true;

  constructor(host: HTMLElement) {
    // Pas d'anticrénelage sur l'image de base (coûteux sur les puces intégrées) : les niveaux élevés ont le leur.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(PAL.ink);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.id = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.camera.rotation.order = 'YXZ';
    this.floaters = new Floaters(this.camera);

    // Éclairage d'environnement : reflets doux sur toutes les surfaces.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.55;

    // Post-traitement : occlusion ambiante, halo lumineux, couleurs finales.
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
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ───────────────────────────── Construction ─────────────────────────────

  build(rooms: { def: RoomDef; sim: RoomSim }[], doors: DoorDef[], stairs: StairDef[]): void {
    const s = this.scene;
    s.background = new THREE.Color(0x1c1220);
    s.fog = new THREE.FogExp2(0x2a1a30, 0.00022);

    s.add(new THREE.HemisphereLight(0xffe9c8, 0x6a4a5a, 1.4));
    const sun = new THREE.DirectionalLight(0xffd59a, 4.2);
    this.sun = sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.5);
    fill.position.set(-1, 1, 0.5);
    s.add(fill);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 900, 2);
      this.lights.push(l);
      s.add(l);
    }

    this.sharedMats = {
      dust: [fabric(0xffffff, { sheen: 0.6 }), mat(0xffffff, { roughness: 0.95 })],
      bunny: [fabric(0xffffff, { vertexColors: true }), mat(0xffffff, { vertexColors: true, roughness: 0.95 })],
      star: new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.25 }),
    };

    for (const r of rooms) this.views.push(this.buildRoomView(r.def, r.sim, doors));
    for (const st of stairs) {
      const b = buildStair(st);
      mergeStatic(b.group, new Set<THREE.Object3D>(b.flames));
      s.add(b.group);
      this.stairFlames.push(...b.flames);
      this.stairTorches.push(...b.torches);
    }
    for (const d of doors) {
      if (d.room === null) continue;
      const v = buildDoor(d);
      s.add(v.group);
      this.doors.push(v);
    }
    s.add(this.broom.root);
    this.buildRing();
    this.buildFx();
  }

  private buildRoomView(def: RoomDef, sim: RoomSim, doors: DoorDef[]): RoomView {
    const shell = buildRoomShell(def, doors);
    const group = shell.group;
    group.position.set(def.origin.x, def.floorY, def.origin.z);
    for (const p of def.obstacles) {
      const obj = buildProp(p);
      // Lampes posées sur les meubles : position dans le repère de la pièce.
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (o.userData.torch) shell.torches.push(o.getWorldPosition(new THREE.Vector3()));
      });
      group.add(obj);
    }
    const pans: Pan[] = [];
    for (const c of def.collectors) {
      const obj = buildDustpan(c);
      group.add(obj);
      const dx = c.facing === 'right' ? 70 : c.facing === 'left' ? -70 : 0;
      const dz = c.facing === 'down' ? 70 : c.facing === 'up' ? -70 : 0;
      pans.push({ obj, bounce: 0, pending: 0, timer: 0, textX: def.origin.x + c.mouth.x + dx, textZ: def.origin.z + c.mouth.y + dz });
    }

    // Tout ce qui ne bouge pas est fusionné (les pelles rebondissent et les flammes vacillent : on les garde à part).
    mergeStatic(group, new Set<THREE.Object3D>([...pans.map((p) => p.obj), ...shell.flames]));

    const r = sim.pool.ranges;
    const make = (geo: THREE.BufferGeometry, rich: THREE.Material, mid: THREE.Material, count: number, big: boolean) => {
      const mesh = new THREE.InstancedMesh(geo, rich, Math.max(1, count));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Sphère englobante = toute la pièce : la carte graphique saute les pièces hors du champ.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.width / 2, 50, def.height / 2), Math.hypot(def.width, def.height) / 2 + 100);
      group.add(mesh);
      this.particleMats.push({ rich, mid, low: this.lambert(mid), mesh, big });
      return mesh;
    };
    const dust = make(this.dustGeoHigh, this.sharedMats.dust[0], this.sharedMats.dust[1], r.dust.count, false);
    const c = new THREE.Color();
    for (let i = 0; i < r.dust.count; i++) dust.setColorAt(i, c.set(DUST_COLORS[(i * 7) % DUST_COLORS.length]));
    const bunnies = make(this.bunnyGeo, this.sharedMats.bunny[0], this.sharedMats.bunny[1], r.bunny.count, true);
    const stars = make(this.starGeo, this.sharedMats.star, this.sharedMats.star, r.star.count, true);

    this.scene.add(group);
    group.updateMatrixWorld(true);
    // Torches : coordonnées locales → monde.
    const torches = shell.torches.map((t) => t.clone().add(new THREE.Vector3(def.origin.x, def.floorY, def.origin.z)));
    return { def, sim, group, dust, bunnies, stars, pans, ambience: shell.ambience, torches, flames: shell.flames, motes: shell.motes, visible: true };
  }

  /** Empreinte de la brosse au sol : un rectangle arrondi qui suit exactement la zone qui pousse. */
  private buildRing(): void {
    const rounded = (w: number, h: number, r: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2);
      sh.lineTo(w / 2 - r, -h / 2);
      sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      sh.lineTo(w / 2, h / 2 - r);
      sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      sh.lineTo(-w / 2 + r, h / 2);
      sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      sh.lineTo(-w / 2, -h / 2 + r);
      sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return sh;
    };
    // Dimensions unitaires : on met à l'échelle selon la taille réelle de la brosse.
    const outer = rounded(1, 1, 0.12);
    const inner = rounded(0.9, 0.7, 0.1);
    const border = new THREE.Shape(outer.getPoints(6));
    border.holes.push(new THREE.Path(inner.getPoints(6).reverse()));
    const edge = new THREE.Mesh(new THREE.ShapeGeometry(border), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ringFill = new THREE.Mesh(new THREE.ShapeGeometry(inner), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
    // Petite flèche vers l'avant : le sens dans lequel la brosse pousse.
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-0.07, 0.62);
    arrowShape.lineTo(0.07, 0.62);
    arrowShape.lineTo(0, 0.85);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    for (const m of [edge, this.ringFill, arrow]) m.rotation.x = -Math.PI / 2;
    this.ring.add(this.ringFill, edge, arrow);
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
  }

  private buildFx(): void {
    const max = 500;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), max);
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    const c = new THREE.Color();
    const colors = [PAL.tomato, PAL.mustard, PAL.apple, PAL.sky, 0xffffff, PAL.plum];
    for (let i = 0; i < max; i++) this.confetti.setColorAt(i, c.set(colors[i % colors.length]));
    this.scene.add(this.confetti);
  }

  // ───────────────────────────── Pièces visibles, portes, lumière ─────────────────────────────

  /** N'affiche que les pièces utiles (celle du joueur et ses voisines ouvertes). */
  setVisibleRooms(ids: Set<string>): void {
    for (const v of this.views) {
      v.visible = ids.has(v.def.id);
      v.group.visible = v.visible;
    }
  }

  /** Le soleil (et ses ombres) suit la pièce où l'on se trouve. */
  setActiveRoom(def: RoomDef | null): void {
    if (!def || def === this.activeRoom) return;
    this.activeRoom = def;
    const cx = def.origin.x + def.width / 2;
    const cz = def.origin.z + def.height / 2;
    const [dx, dy, dz] = def.light.dir;
    const len = Math.hypot(dx, dy, dz);
    const dist = 2000;
    this.sun.position.set(cx - (dx / len) * dist, def.floorY - (dy / len) * dist, cz - (dz / len) * dist);
    this.sun.target.position.set(cx, def.floorY, cz);
    this.sun.color.set(def.light.color);
    this.sun.intensity = def.light.intensity;
    const half = Math.max(def.width, def.height) / 2 + 300;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 100; sc.far = dist * 2 + def.ceiling;
    sc.updateProjectionMatrix();
  }

  /** Ouvre (avec animation) les portes des pièces débloquées. */
  setDoorState(isOpen: (d: DoorDef) => boolean, instant = false): void {
    for (const d of this.doors) {
      d.target = isOpen(d.def) ? 1 : 0;
      if (instant) d.open = d.target;
      d.lock.visible = d.target === 0;
      d.pivot.children.forEach((c) => { if (c !== d.pivot.children[0]) c.visible = d.target === 0; });
    }
  }

  // ───────────────────────────── Qualité ─────────────────────────────

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

    for (const v of this.views) v.dust.geometry = q.lowPolyDust ? this.dustGeoLow : this.dustGeoHigh;
    for (const p of this.particleMats) {
      p.mesh.material = q.cheapMaterials ? p.low : q.richParticles ? p.rich : p.mid;
      p.mesh.castShadow = p.big ? q.bigParticleShadows : q.dustShadows;
    }
    this.swapMaterials(q.cheapMaterials);
    this.scene.environment = q.cheapMaterials ? null : this.envMap;
    for (const l of this.lights) l.visible = q.extraLights;
    this.ambienceOn = q.ambienceFx;
    for (const v of this.views) for (const o of v.ambience) o.visible = q.ambienceFx;

    this.gtao.enabled = q.gtao;
    this.bloom.enabled = q.bloom;
    this.useComposer = q.gtao || q.bloom || q.msaa > 0;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== q.msaa) {
        rt.samples = q.msaa;
        rt.dispose();
      }
    }
    // Les matériaux doivent être recompilés (ombres, lumières, environnement ont changé).
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
    this.resize();
  }

  private lambert(m: THREE.Material): THREE.Material {
    let c = this.lambertCache.get(m);
    if (!c) {
      c = toLambert(m);
      this.lambertCache.set(m, c);
    }
    return c;
  }

  /** Remplace les matériaux physiques par des matériaux simples (et inversement). */
  private swapMaterials(cheap: boolean): void {
    const particles = new Set<THREE.Object3D>(this.particleMats.map((p) => p.mesh));
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || particles.has(mesh)) return;
      const ud = mesh.userData as { richMat?: THREE.Material | THREE.Material[] };
      ud.richMat ??= mesh.material;
      if (!cheap) mesh.material = ud.richMat;
      else mesh.material = Array.isArray(ud.richMat) ? ud.richMat.map((m) => this.lambert(m)) : this.lambert(ud.richMat);
    });
  }

  /** Nom de la carte graphique utilisée par le navigateur (pour repérer un rendu logiciel). */
  gpuName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  // ───────────────────────────── Événements ─────────────────────────────

  onCollect(roomIndex: number, collector: number, coins: number, isStar: boolean): void {
    const pan = this.views[roomIndex].pans[collector];
    pan.pending += coins;
    pan.bounce = Math.min(1, pan.bounce + (isStar ? 0.9 : 0.05));
    if (isStar) {
      this.shake = Math.max(this.shake, 3);
      this.burst(pan.textX, this.views[roomIndex].def.floorY + 40, pan.textZ, 30);
    }
  }

  celebrate(roomIndex: number): void {
    const d = this.views[roomIndex].def;
    for (let k = 0; k < 6; k++) {
      this.burst(d.origin.x + d.width * (0.15 + k * 0.14), d.floorY + Math.min(300, d.ceiling - 60), d.origin.z + d.height / 2 + (k % 2 ? 150 : -150), 60);
    }
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

  render(dt: number, view: ViewState, broom: BroomView, broomSim: RoomSim | null): void {
    this.time += dt;
    const cam = this.camera;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 15);
    cam.position.set(view.x + sx, view.eye + sy, view.z);
    cam.rotation.set(view.pitch, view.yaw, 0);
    cam.updateMatrixWorld();

    for (const v of this.views) {
      if (!v.visible) continue;
      this.updateParticles(v);
      this.updatePans(v, dt);
      if (v.motes && this.ambienceOn) this.updateMotes(v.motes);
    }
    this.updateDoors(dt);
    this.updateLights(dt);
    this.updateBroom(broomSim, dt, broom);
    this.updateFx(dt);
    this.floaters.update(dt);
    this.renderer.info.reset();
    if (this.useComposer) this.composer.render(dt);
    else this.renderer.render(this.scene, cam);
  }

  private updateParticles(v: RoomView): void {
    const pool = v.sim.pool;
    const { x, y, rot, age, alive } = pool;
    // Position de la caméra dans le repère de la pièce (les moutons la regardent).
    const camX = this.camera.position.x - v.def.origin.x;
    const camZ = this.camera.position.z - v.def.origin.z;
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
    write(v.dust, r.dust.start, r.dust.count, 'dust');
    write(v.bunnies, r.bunny.start, r.bunny.count, 'bunny');
    write(v.stars, r.star.start, r.star.count, 'star');
  }

  private updatePans(v: RoomView, dt: number): void {
    for (const pan of v.pans) {
      pan.timer += dt;
      if (pan.pending > 0 && pan.timer > 0.22) {
        this.floaters.spawn(pan.textX, v.def.floorY + 70 + Math.random() * 30, pan.textZ + (Math.random() - 0.5) * 60, pan.pending);
        pan.pending = 0;
        pan.timer = 0;
      }
      pan.bounce = Math.max(0, pan.bounce - dt * 2.5);
      const b = Math.sin(this.time * 30) * pan.bounce;
      const sx = Math.sign(pan.obj.scale.x) || 1;
      pan.obj.scale.set(sx * (1 + b * 0.1 + pan.bounce * 0.06), 1 - b * 0.12 + pan.bounce * 0.1, 1 + b * 0.08);
    }
  }

  private updateMotes(m: { points: THREE.Points; seeds: Float32Array }): void {
    const p = m.points.geometry.attributes.position as THREE.BufferAttribute;
    const sd = m.seeds;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, sd[i * 3] + Math.sin(this.time * 0.3 + i) * 25, sd[i * 3 + 1] + Math.sin(this.time * 0.5 + i * 1.7) * 18, sd[i * 3 + 2] + Math.cos(this.time * 0.4 + i * 0.7) * 25);
    }
    p.needsUpdate = true;
  }

  private updateDoors(dt: number): void {
    for (const d of this.doors) {
      if (d.open === d.target) continue;
      d.open += Math.sign(d.target - d.open) * dt * 0.9;
      d.open = Math.max(0, Math.min(1, d.open));
      // Ouverture avec un petit rebond en fin de course.
      const e = d.open < 1 ? 1 - Math.pow(1 - d.open, 3) : 1;
      d.pivot.rotation.y = -e * 1.75;
    }
  }

  /** Les lumières dynamiques se placent sur les flammes les plus proches du joueur, et vacillent. */
  private updateLights(dt: number): void {
    const t = this.time;
    for (const v of this.views) {
      if (!v.visible) continue;
      for (let k = 0; k < v.flames.length; k++) {
        const f = v.flames[k];
        f.scale.set(1 + Math.sin(t * 13 + k) * 0.08, 1 + Math.sin(t * 17 + k * 2) * 0.18, 1);
      }
    }
    for (let k = 0; k < this.stairFlames.length; k++) this.stairFlames[k].scale.y = 1 + Math.sin(t * 15 + k) * 0.18;

    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.4;
      const cam = this.camera.position;
      const candidates: THREE.Vector3[] = [...this.stairTorches];
      for (const v of this.views) if (v.visible) candidates.push(...v.torches);
      candidates.sort((a, b) => a.distanceToSquared(cam) - b.distanceToSquared(cam));
      for (let i = 0; i < this.lights.length; i++) {
        const c = candidates[i];
        if (c) this.lights[i].position.copy(c);
        this.lights[i].userData.on = !!c;
      }
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      l.intensity = l.userData.on ? 28000 * (0.88 + Math.sin(t * 11 + i * 3) * 0.06 + Math.sin(t * 23 + i) * 0.04) : 0;
    }
  }

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  private updateBroom(sim: RoomSim | null, dt: number, broom: BroomView): void {
    const { root, head, handle } = this.broom;
    root.visible = broom.visible;
    this.ring.visible = broom.visible && sim !== null;
    if (!broom.visible) return;
    const cam = this.camera;
    const yaw = cam.rotation.y;

    head.position.set(broom.x, broom.y, broom.z);
    head.rotation.set(0, yaw, 0);
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const v = sim ? sim.broomVel : { x: 0, y: 0 };
    const lateral = (v.x * rightX + v.y * rightZ) / 2500;
    const along = (v.x * fwdX + v.y * fwdZ) / 2500;
    this.headLean += (THREE.MathUtils.clamp(-lateral, -0.35, 0.35) - this.headLean) * Math.min(1, dt * 12);
    head.rotation.z = this.headLean;
    head.rotation.x = THREE.MathUtils.clamp(along, -0.3, 0.3);
    const speed = Math.hypot(v.x, v.y);
    const squash = Math.min(0.22, speed / 7000) + (broom.pressed ? 0.12 : 0);
    head.scale.set(1 + squash, 1 - squash, 1);

    const grip = this.tmpA.set(24, -42, -36).applyMatrix4(cam.matrixWorld);
    const base = this.tmpB.set(0, 34 * (1 - squash), 0);
    head.localToWorld(base);
    handle.position.copy(base);
    const dir = grip.clone().sub(base).normalize();
    handle.quaternion.setFromUnitVectors(this.up, dir);

    if (sim) {
      // L'empreinte suit la brosse : même position, même orientation, même taille que la zone qui pousse.
      const hw = sim.broom.width * (broom.pressed ? 1.06 : 1);
      this.ring.position.set(broom.x, broom.y + 1.2, broom.z);
      this.ring.rotation.set(0, yaw, 0);
      // Le rectangle unitaire est dans le plan XY puis couché : X = largeur, Y (→ -Z) = épaisseur vers l'avant.
      this.ring.scale.set(hw + 6, 1, sim.broom.depth + 6);
      (this.ringFill.material as THREE.MeshBasicMaterial).opacity = broom.pressed ? 0.16 : 0.07;
    }  }

  private dummy = new THREE.Object3D();
  private updateFx(dt: number): void {
    let n = 0;
    for (let k = this.bits.length - 1; k >= 0; k--) {
      const b = this.bits[k];
      b.life -= dt;
      if (b.life <= 0) {
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

/** Version « éclairage simple » d'un matériau physique (bien plus légère pour les puces intégrées). */
function toLambert(m: THREE.Material): THREE.Material {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial) return m;
  return new THREE.MeshLambertMaterial({
    color: sm.color,
    map: sm.map,
    emissive: sm.emissive,
    emissiveIntensity: sm.emissiveIntensity,
    vertexColors: sm.vertexColors,
    side: sm.side,
    transparent: sm.transparent,
    opacity: sm.opacity,
  });
}

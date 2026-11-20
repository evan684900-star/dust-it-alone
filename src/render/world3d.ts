import * as THREE from 'three';
import { REALISTIC, REAL_DUST_COLORS, filmPass, sanitizePass, naturalize, realBunnyTuftGeometry, realDustGeometry, realDustTexture } from './realistic';
import type { DoorDef, RoomDef, StairDef } from '../data/rooms';
import { DIRT_ORDER, DIRT_TYPES, type DirtId } from '../data/dirtTypes';
import { drawDustMessage, drawEmoji, drawStain, drawWeb, softDot } from './canvasTextures';
import type { RoomSim } from '../sim/roomSim';
import { PAL } from './palette';
import { fabric, mat, plastic as plasticLike } from './materials';
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
import type { Helper, HelperKind } from '../sim/helpers';
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

interface Pan { obj: THREE.Group; bounce: number; pending: number; timer: number; textX: number; textZ: number; base: number }
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; vr: number; life: number }

/** Tout ce qui s'affiche pour une pièce du château. */
interface RoomView {
  def: RoomDef;
  sim: RoomSim;
  group: THREE.Group;
  dust: THREE.InstancedMesh | null;
  /** Un InstancedMesh par type de saleté présent dans la pièce. */
  meshes: { kind: DirtId; mesh: THREE.InstancedMesh; start: number; count: number }[];
  pans: Pan[];
  ambience: THREE.Object3D[];
  /** Positions monde des flammes (pour les lumières dynamiques). */
  torches: THREE.Vector3[];
  flames: THREE.Object3D[];
  motes?: { points: THREE.Points; seeds: Float32Array };
  visible: boolean;
  /** Modèles 3D des assistants présents. */
  helperViews: Map<Helper, THREE.Object3D>;
  /** Message de Mouton Ier écrit dans la poussière. */
  dustMessage?: THREE.Mesh;
}

/** Un autre joueur (multijoueur). */
interface Avatar {
  g: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group;
  hand: THREE.Object3D;
  legL: THREE.Group;
  legR: THREE.Group;
  eyes: THREE.Object3D[];
  broom: THREE.Group;
  stick: THREE.Mesh;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  bx: number;
  by: number;
  bz: number;
  walk: number;
}

const DUST_COLORS = REALISTIC ? REAL_DUST_COLORS : [0x9e95a6, 0xaea197, 0x938c9f, 0xb7adb9, 0xa69ca8];
/** Nombre de lumières dynamiques (torches, lampes) : fixe pour éviter de recompiler les matériaux. */
const LIGHT_POOL = 4;

/**
 * Tout l'affichage 3D (Three.js) du château : pièces, escaliers, portes,
 * particules, balai et effets. Lit l'état de la simulation sans jamais le modifier.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 3, 90000);
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
  private dustGeoHigh = REALISTIC ? realDustGeometry() : grainGeometry();
  private dustGeoLow = REALISTIC ? this.dustGeoHigh : (() => {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(1, 0.55, 0.85);
    return g;
  })();
  private bunnyGeo = REALISTIC ? realBunnyTuftGeometry() : dustBunnyGeometry();
  /** Forme pleine du mouton (silhouettes dorées des échos du passé). */
  private plushGeo = REALISTIC ? dustBunnyGeometry() : this.bunnyGeo;
  private starGeo = starGeometry();
  /** Pour chaque type : géométrie, matériau riche, matériau simple, projette une ombre, couleurs. */
  private kinds!: Record<DirtId, { geo: THREE.BufferGeometry; rich: THREE.Material; mid: THREE.Material; big: boolean; colors?: number[] }>;
  private views: RoomView[] = [];
  private doors: DoorView[] = [];
  private stairFlames: THREE.Object3D[] = [];
  private stairTorches: THREE.Vector3[] = [];
  private broom = buildBroom();
  private ring = new THREE.Group();
  private ringFill!: THREE.Mesh;
  private ringEdge!: THREE.Mesh;
  /** Hauteur de la brosse au-dessus du sol (levée quand on ne clique pas). */
  private lift = 10;
  private confetti!: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private time = 0;
  private shake = 0;
  private headLean = 0;
  private activeRoom: RoomDef | null = null;
  private lightTimer = 0;
  private film: ReturnType<typeof filmPass> | null = null;
  private ambienceOn = true;

  constructor(host: HTMLElement) {
    // Pas d'anticrénelage sur l'image de base (coûteux sur les puces intégrées) : les niveaux élevés ont le leur.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(PAL.ink);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = REALISTIC ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = REALISTIC ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
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
    // Garde-fou : un pixel invalide ne doit jamais devenir un gros halo blanc (dans les deux styles).
    this.composer.addPass(sanitizePass());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    if (REALISTIC) {
      this.film = filmPass();
      this.composer.addPass(this.film);
    }
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
    s.background = new THREE.Color(REALISTIC ? 0x14110e : 0x1c1220);
    s.fog = new THREE.FogExp2(REALISTIC ? 0x3a3128 : 0x2a1a30, REALISTIC ? 0.00028 : 0.00022);

    s.add(REALISTIC ? new THREE.HemisphereLight(0xe8dccb, 0x3a3027, 0.6) : new THREE.HemisphereLight(0xffe9c8, 0x6a4a5a, 1.4));
    // Ciel autour du château (on le voit depuis la cour et le chemin de ronde) : dégradé de fin d'après-midi.
    const skyGeo = new THREE.SphereGeometry(40000, 32, 16);
    const sc = new Float32Array(skyGeo.attributes.position.count * 3);
    const top = new THREE.Color(0x4a6ab8);
    const horizon = new THREE.Color(0xffc89a);
    const c = new THREE.Color();
    for (let i = 0; i < skyGeo.attributes.position.count; i++) {
      const y = skyGeo.attributes.position.getY(i) / 40000;
      c.copy(horizon).lerp(top, Math.min(1, Math.max(0, y * 1.6 + 0.1)));
      sc.set([c.r, c.g, c.b], i * 3);
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    s.add(sky);
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

    const canvasTex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, -1);
    leafShape.quadraticCurveTo(0.9, -0.3, 0, 1);
    leafShape.quadraticCurveTo(-0.9, -0.3, 0, -1);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 6).rotateX(-Math.PI / 2);
    const crumbGeo = new THREE.BoxGeometry(1.4, 0.8, 1.1);
    const rubbleGeo = new THREE.DodecahedronGeometry(1, 0).scale(1, 0.75, 0.9);
    const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const decal = (map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, vertexColors: false });
    const webMat = decal(canvasTex(drawWeb()));
    const stainMat = new THREE.MeshStandardMaterial({ map: canvasTex(drawStain()), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.25 });
    this.kinds = {
      dust: REALISTIC
        ? (() => {
            const m = mat(0xffffff, { map: realDustTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
            return { geo: this.dustGeoHigh, rich: m, mid: m, big: false, colors: DUST_COLORS };
          })()
        : { geo: this.dustGeoHigh, rich: fabric(0xffffff, { sheen: 0.6 }), mid: mat(0xffffff, { roughness: 0.95 }), big: false, colors: DUST_COLORS },
      bunny: REALISTIC
        ? (() => {
            const m = mat(0xffffff, { map: realDustTexture(), alphaTest: 0.18, side: THREE.DoubleSide, roughness: 1 });
            return { geo: this.bunnyGeo, rich: m, mid: m, big: true, colors: [0xc8c0b4, 0xb8b0a4, 0xd2cabc, 0xaaa296] };
          })()
        : { geo: this.bunnyGeo, rich: REALISTIC ? fabric(0xffffff, { vertexColors: true, sheen: 0.7, sheenRoughness: 0.9, sheenColor: 0x6a645e, roughness: 1 }) : fabric(0xffffff, { vertexColors: true }), mid: mat(0xffffff, { vertexColors: true, roughness: 0.95 }), big: true },
      star: { geo: this.starGeo, rich: starMat, mid: starMat, big: true },
      crumb: { geo: crumbGeo, rich: mat(0xffffff, { roughness: 0.8 }), mid: mat(0xffffff, { roughness: 0.9 }), big: false, colors: REALISTIC ? [0xa08868, 0x907a5c, 0xb09a7a, 0x7e6a50] : [0xd9a35b, 0xc8914c, 0xe8c08a, 0xb87a3a] },
      leaf: { geo: leafGeo, rich: mat(0xffffff, { roughness: 0.7, side: THREE.DoubleSide }), mid: mat(0xffffff, { roughness: 0.8, side: THREE.DoubleSide }), big: true, colors: REALISTIC ? [0x9a6a3a, 0x8a4a2a, 0xa88a4a, 0x7a5a32, 0x6a6a3a] : [0xe07a2a, 0xc8462a, 0xe8b030, 0xa8582a, 0x8a9a30] },
      rubble: { geo: rubbleGeo, rich: mat(0xffffff, { roughness: 0.95 }), mid: mat(0xffffff, { roughness: 0.95 }), big: true, colors: [0x8a8078, 0x9a8f84, 0x6f665e, 0xa89c8e] },
      soot: REALISTIC
        ? (() => {
            // Suie : traces noires et floues, comme la poussière mais en sombre.
            const m = mat(0xffffff, { map: realDustTexture(), transparent: true, opacity: 0.85, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
            return { geo: this.dustGeoHigh, rich: m, mid: m, big: false, colors: [0x2a2624, 0x3a3430, 0x1f1c1a] };
          })()
        : { geo: this.dustGeoHigh, rich: mat(0xffffff, { roughness: 1 }), mid: mat(0xffffff, { roughness: 1 }), big: false, colors: [0x2a2624, 0x3a3430, 0x1f1c1a] },
      web: { geo: flat, rich: webMat, mid: webMat, big: false },
      stain: { geo: flat, rich: stainMat, mid: stainMat, big: false },
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
    if (REALISTIC) naturalize(s);
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
      pans.push({ obj, bounce: 0, pending: 0, timer: 0, textX: def.origin.x + c.mouth.x + dx, textZ: def.origin.z + c.mouth.y + dz, base: 1 });
    }

    // Tout ce qui ne bouge pas est fusionné (les pelles rebondissent et les flammes vacillent : on les garde à part).
    mergeStatic(group, new Set<THREE.Object3D>([...pans.map((p) => p.obj), ...shell.flames]));

    const r = sim.pool.ranges;
    // Teinte des taches selon la pièce (vin, graisse, cire…).
    const stainTint: Record<string, number> = { bedroom: 0x6a1a2a, kitchen: 0x5a4a1a, banquet: 0x5a1a2a, chapel: 0x8a7a50, throne: 0x4a1a3a };
    const meshes: RoomView['meshes'] = [];
    let dust: THREE.InstancedMesh | null = null;
    for (const kind of DIRT_ORDER) {
      const count = r[kind].count;
      if (count <= 0) continue;
      const k = this.kinds[kind];
      const mesh = new THREE.InstancedMesh(k.geo, k.rich, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = k.big;
      mesh.receiveShadow = !DIRT_TYPES[kind].fixed;
      if (DIRT_TYPES[kind].fixed) mesh.renderOrder = 1;
      // Sphère englobante = toute la pièce : la carte graphique saute les pièces hors du champ.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.width / 2, 50, def.height / 2), Math.hypot(def.width, def.height) / 2 + 100);
      const c = new THREE.Color();
      if (k.colors) for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(k.colors[(i * 7) % k.colors.length]));
      if (kind === 'stain') for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(stainTint[def.id] ?? 0x4a3a2a));
      group.add(mesh);
      this.particleMats.push({ rich: k.rich, mid: k.mid, low: DIRT_TYPES[kind].fixed ? k.mid : this.lambert(k.mid), mesh, big: k.big });
      meshes.push({ kind, mesh, start: r[kind].start, count });
      if (kind === 'dust') dust = mesh;
    }

    this.scene.add(group);
    group.updateMatrixWorld(true);
    // Torches : coordonnées locales → monde.
    const torches = shell.torches.map((t) => t.clone().add(new THREE.Vector3(def.origin.x, def.floorY, def.origin.z)));
    return { def, sim, group, dust, meshes, helperViews: new Map(), pans, ambience: shell.ambience, torches, flames: shell.flames, motes: shell.motes, visible: true };
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
    const edge = new THREE.Mesh(new THREE.ShapeGeometry(border), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: REALISTIC ? 0.14 : 0.5, depthWrite: false }));
    this.ringFill = new THREE.Mesh(new THREE.ShapeGeometry(inner), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
    // Petite flèche vers l'avant : le sens dans lequel la brosse pousse.
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-0.07, 0.62);
    arrowShape.lineTo(0.07, 0.62);
    arrowShape.lineTo(0, 0.85);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ringEdge = edge;
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
      d.lintel.visible = d.target === 0;
      d.pivot.children.forEach((c) => { if (c !== d.pivot.children[0]) c.visible = d.target === 0; });
    }
  }

  /** Taille des pelles d'une pièce (amélioration « Pelles géantes »), avec un petit rebond. */
  setPanScale(roomIndex: number, scale: number): void {
    const v = this.views[roomIndex];
    if (!v) return;
    for (const p of v.pans) {
      if (Math.abs(p.base - scale) > 0.001) p.bounce = Math.max(p.bounce, 0.8);
      p.base = scale;
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

    for (const v of this.views) if (v.dust) v.dust.geometry = q.lowPolyDust ? this.dustGeoLow : this.dustGeoHigh;
    for (const p of this.particleMats) {
      p.mesh.material = q.cheapMaterials ? p.low : q.richParticles ? p.rich : p.mid;
      p.mesh.castShadow = p.big ? q.bigParticleShadows : q.dustShadows;
    }
    this.swapMaterials(q.cheapMaterials);
    this.scene.environment = q.cheapMaterials ? null : this.envMap;
    for (const l of this.lights) l.visible = q.extraLights;
    this.ambienceOn = q.ambienceFx;
    for (const v of this.views) for (const o of v.ambience) o.visible = q.ambienceFx;

    // Les matériaux physiques et le halo lumineux éclairent plus : on compense pour ne pas éblouir.
    r.toneMappingExposure = REALISTIC ? (q.cheapMaterials ? 1.25 : 1.05) : q.cheapMaterials ? 1.1 : 0.82;
    this.scene.environmentIntensity = REALISTIC ? 0.22 : 0.35;
    this.bloom.strength = 0.22;
    this.bloom.threshold = 0.95;
    this.bloom.radius = 0.4;
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

  onCollect(roomIndex: number, collector: number, coins: number, isStar: boolean, at?: { x: number; y: number; byHelper?: boolean }): void {
    const view = this.views[roomIndex];
    if (collector < 0) {
      // Ramassé directement (outil, aspirateur) : le « +N » sort de la saleté elle-même.
      if (at && !at.byHelper && coins >= 5) this.floaters.spawn(view.def.origin.x + at.x, view.def.floorY + 40, view.def.origin.z + at.y, coins);
      return;
    }
    const pan = view.pans[collector];
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
    if (this.film) this.film.uniforms.time.value = this.time % 10;
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
      this.updateHelpers(v);
      this.updatePans(v, dt);
      if (v.motes && this.ambienceOn) this.updateMotes(v.motes);
    }
    this.updateDoors(dt);
    this.updateStory(dt);
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
    const { x, y, rot, age, alive, hp, vx, vy } = pool;
    // Position de la caméra dans le repère de la pièce (les moutons la regardent).
    const camX = this.camera.position.x - v.def.origin.x;
    const camZ = this.camera.position.z - v.def.origin.z;
    const t = this.time;

    for (const { kind, mesh, start, count } of v.meshes) {
      const arr = mesh.instanceMatrix.array as Float32Array;
      const def = DIRT_TYPES[kind];
      const radius = def.radius;
      const maxHp = def.fixed?.hp ?? 1;
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
        let sy = s;
        switch (kind) {
          case 'bunny':
            // Les moutons te regardent toujours. Toujours.
            yaw = Math.atan2(camX - x[i], camZ - y[i]);
            s *= 0.9 + ((i * 7) % 5) / 20;
            sy = s;
            py = s * 0.8 + Math.abs(Math.sin(rot[i] * 0.5)) * s * 0.35;
            break;
          case 'star':
            yaw = t * 2.5 + i;
            s *= 1.1 + Math.sin(t * 6 + i) * 0.15;
            sy = s;
            py = 18 + Math.sin(t * 3 + i) * 5;
            break;
          case 'leaf': {
            // Une feuille qui file au vent se soulève un peu.
            const speed = Math.hypot(vx[i], vy[i]);
            s *= 0.8 + ((i * 13) % 10) / 25;
            sy = s;
            py = 1 + Math.min(25, speed * 0.04) * (0.6 + 0.4 * Math.sin(t * 9 + i));
            break;
          }
          case 'web':
          case 'stain': {
            // Plus on travaille dessus, plus elle rétrécit.
            const f = Math.max(0, hp[i] / maxHp);
            s *= (0.9 + ((i * 7) % 5) / 20) * (0.35 + 0.65 * f);
            sy = 1;
            py = kind === 'web' ? 1.2 : 0.9;
            break;
          }
          default:
            s *= 0.8 + ((i * 13) % 10) / 20;
            sy = s;
            py = s * 0.4;
            // Prototype réaliste : la poussière est un voile posé à plat sur le sol.
            if (REALISTIC && (kind === 'dust' || kind === 'soot')) {
              sy = 1;
              py = 0.4 + (k % 9) * 0.03;
            }
        }
        const c = Math.cos(yaw) * s;
        const sn = Math.sin(yaw) * s;
        arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
        arr[o + 12] = x[i]; arr[o + 13] = py; arr[o + 14] = y[i]; arr[o + 15] = 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Les assistants suivent leur position dans la simulation. */
  private updateHelpers(v: RoomView): void {
    const alive = new Set(v.sim.helpers);
    for (const [h, obj] of v.helperViews) {
      if (!alive.has(h)) {
        v.group.remove(obj);
        v.helperViews.delete(h);
      }
    }
    for (const h of v.sim.helpers) {
      let obj = v.helperViews.get(h);
      if (!obj) {
        obj = this.buildHelper(h.kind);
        v.helperViews.set(h, obj);
        v.group.add(obj);
      }
      const bob = Math.sin(h.phase * (h.kind === 'plumette' ? 3 : 9));
      const y = h.kind === 'plumette' ? 80 + bob * 12 : h.kind === 'moutonnet' ? Math.abs(bob) * 6 : 0;
      obj.position.set(h.x, y, h.y);
      obj.rotation.y = h.yaw;
      if (h.kind === 'biscotte') obj.visible = true;
    }
  }

  private helperCache = new Map<HelperKind, THREE.Object3D>();
  private buildHelper(kind: HelperKind): THREE.Object3D {
    const cached = this.helperCache.get(kind);
    if (cached) return cached.clone();
    const g = new THREE.Group();
    if (kind === 'moutonnet') {
      // Un mouton de poussière doré, apprivoisé, avec un petit nœud rouge.
      // Mode réaliste : une touffe de fibres dorées (texture découpée), comme les vrais moutons de poussière.
      const body = new THREE.Mesh(
        this.bunnyGeo,
        REALISTIC
          ? mat(0xe2c890, { map: realDustTexture(), alphaTest: 0.18, side: THREE.DoubleSide, roughness: 1 })
          : fabric(0xffffff, { vertexColors: true, color: 0xffe6a8 }),
      );
      body.scale.setScalar(24);
      body.position.y = 22;
      body.rotation.y = Math.PI;
      body.castShadow = true;
      const bow = new THREE.Mesh(new THREE.TorusGeometry(6, 2.5, 6, 12), mat(0xd8323a));
      bow.position.set(0, 44, 6);
      g.add(body, bow);
    } else if (kind === 'plumette') {
      const colors = [0xff8a6e, 0xffc93c, 0x5ec8f2, 0xc38bff];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const f = new THREE.Mesh(new THREE.ConeGeometry(4, 26, 6), fabric(colors[k % colors.length]));
        f.position.set(Math.cos(a) * 7, 0, Math.sin(a) * 7);
        f.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        g.add(f);
      }
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2b1a2e }));
      const eyeR = eyeL.clone();
      eyeL.position.set(-4, 4, -9);
      eyeR.position.set(4, 4, -9);
      g.add(eyeL, eyeR);
    } else if (kind === 'roulio') {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 12, 24), plasticLike(0xe8e4dc));
      shell.position.y = 8;
      shell.castShadow = true;
      const top = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plasticLike(0x5ec8f2));
      top.position.y = 14;
      const led = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7bff7b).multiplyScalar(2) }));
      led.position.set(0, 12, -24);
      g.add(shell, top, led);
    } else {
      // Biscotte : un chat roux un peu transparent (un petit fantôme).
      const fur = new THREE.MeshStandardMaterial({ color: 0xe8904a, roughness: 0.9, transparent: true, opacity: 0.85 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(12, 34, 4, 10).rotateX(Math.PI / 2), fur);
      body.position.y = 20;
      const head = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 10), fur);
      head.position.set(0, 30, -26);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 6), fur);
        ear.position.set(sx * 6, 42, -27);
        g.add(ear);
      }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 34, 6).rotateX(-0.9), fur);
      tail.position.set(0, 32, 26);
      g.add(body, head, tail);
    }
    this.helperCache.set(kind, g);
    return g.clone();
  }

  // ───────────────────────────── Histoire ─────────────────────────────

  /** Écrit le message de Mouton Ier dans la poussière d'une pièce. */
  setDustMessage(roomIndex: number, text: string): void {
    const v = this.views[roomIndex];
    const t = new THREE.CanvasTexture(drawDustMessage(text));
    t.colorSpace = THREE.SRGBColorSpace;
    const w = Math.min(v.def.width, v.def.height * 2) * 0.55;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: REALISTIC ? 0x8a8279 : 0xffffff }),
    );
    m.position.set(v.def.width / 2, 1.5, v.def.height / 2);
    // Le message se lit depuis l'entrée la plus probable : on le tourne vers le grand côté.
    if (v.def.height > v.def.width) m.rotation.y = Math.PI / 2;
    m.renderOrder = 2;
    v.group.add(m);
    v.dustMessage = m;
  }

  private souvenirViews = new Map<string, THREE.Group>();
  private emojiTex = new Map<string, THREE.Texture>();
  private glowTex: THREE.Texture | null = null;

  /** Affiche les souvenirs apparus (et retire ceux qui ont été ramassés). */
  /** Champ de vision (degrés). */
  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setSouvenirs(list: { id: string; roomIndex: number; x: number; y: number; icon: string }[]): void {
    const keep = new Set(list.map((s) => s.id));
    for (const [id, g] of this.souvenirViews) {
      if (!keep.has(id)) {
        g.parent?.remove(g);
        this.souvenirViews.delete(id);
      }
    }
    for (const s of list) {
      if (this.souvenirViews.has(s.id)) continue;
      const g = this.makePickup(s.icon, 0xffd86a);
      g.position.set(s.x, 45, s.y);
      this.views[s.roomIndex].group.add(g);
      this.souvenirViews.set(s.id, g);
    }
  }

  /** Un objet à ramasser : une icône qui flotte dans un halo. */
  private makePickup(icon: string, glowColor: number): THREE.Group {
    let tex = this.emojiTex.get(icon);
    if (!tex) {
      tex = new THREE.CanvasTexture(drawEmoji(icon));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.emojiTex.set(icon, tex);
    }
    this.glowTex ??= new THREE.CanvasTexture(softDot());
    const g = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: glowColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(130, 130, 1);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(46, 46, 1);
    g.add(glow, sprite);
    g.userData.base = 45;
    return g;
  }

  private bonusView: THREE.Group | null = null;

  /** La pièce brillante (événement aléatoire), ou rien. */
  setBonus(b: { roomIndex: number; x: number; y: number; icon: string } | null): void {
    if (this.bonusView) {
      this.bonusView.parent?.remove(this.bonusView);
      this.bonusView = null;
    }
    if (!b) return;
    const g = this.makePickup(b.icon, 0xfff0a0);
    g.position.set(b.x, 30, b.y);
    g.userData.base = 30;
    this.views[b.roomIndex].group.add(g);
    this.bonusView = g;
  }

  private ghosts: { obj: THREE.Group; life: number; total: number; mats: THREE.MeshBasicMaterial[] }[] = [];

  /** Écho du passé : des silhouettes dorées apparaissent quelques secondes dans la pièce. */
  playEcho(roomIndex: number, figures: ('adult' | 'child' | 'plush')[], seconds: number): void {
    const v = this.views[roomIndex];
    const cx = v.def.width / 2;
    const cz = v.def.height / 2;
    figures.forEach((kind, k) => {
      const mats: THREE.MeshBasicMaterial[] = [];
      const m = () => {
        const mm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        mats.push(mm);
        return mm;
      };
      const g = new THREE.Group();
      if (kind === 'plush') {
        const body = new THREE.Mesh(this.plushGeo, m());
        body.scale.setScalar(14);
        body.position.y = 12;
        g.add(body);
      } else {
        const h = kind === 'adult' ? 1 : 0.62;
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(20 * h, 80 * h, 4, 10), m());
        body.position.y = 60 * h;
        const head = new THREE.Mesh(new THREE.SphereGeometry(16 * h, 14, 10), m());
        head.position.y = 130 * h;
        g.add(body, head);
      }
      const a = (k / Math.max(1, figures.length)) * Math.PI * 2;
      g.position.set(cx + Math.cos(a) * 120, 0, cz + Math.sin(a) * 120);
      g.lookAt(cx, 0, cz);
      v.group.add(g);
      this.ghosts.push({ obj: g, life: 0, total: seconds, mats });
    });
  }

  private updateStory(dt: number): void {
    for (const v of this.views) {
      if (!v.visible || !v.dustMessage) continue;
      // Le message s'efface à mesure que la pièce est propre.
      const c = v.sim.cleanliness;
      (v.dustMessage.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - c / 0.55);
    }
    for (const g of this.souvenirViews.values()) {
      g.position.y = g.userData.base + Math.sin(this.time * 2 + g.id) * 8;
      g.rotation.y += dt;
    }
    if (this.bonusView) this.bonusView.position.y = this.bonusView.userData.base + Math.abs(Math.sin(this.time * 4)) * 14;
    for (let k = this.ghosts.length - 1; k >= 0; k--) {
      const gh = this.ghosts[k];
      gh.life += dt;
      const t = gh.life / gh.total;
      const a = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
      for (const m of gh.mats) m.opacity = 0.45 * Math.max(0, a);
      gh.obj.position.y = Math.sin(this.time * 1.5 + k) * 4;
      if (gh.life >= gh.total) {
        gh.obj.parent?.remove(gh.obj);
        this.ghosts.splice(k, 1);
      }
    }
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
      const k = pan.base;
      pan.obj.scale.set(sx * k * (1 + b * 0.1 + pan.bounce * 0.06), k * (1 - b * 0.12 + pan.bounce * 0.1), k * (1 + b * 0.08));
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

  /** Outil affiché dans les mains. */
  setTool(tool: string): void {
    for (const [id, h] of Object.entries(this.broom.heads)) h.visible = id === tool;
    this.tool = tool;
  }
  private tool = 'broom';

  private updateBroom(sim: RoomSim | null, dt: number, broom: BroomView): void {
    const { root, head, handle } = this.broom;
    root.visible = broom.visible;
    this.ring.visible = broom.visible && sim !== null && (this.tool === 'broom' || this.tool === 'widebroom');
    if (!broom.visible) return;
    const cam = this.camera;
    const yaw = cam.rotation.y;

    // Sans clic, la brosse est levée (elle ne balaie pas) ; avec le clic, elle se pose au sol.
    this.lift += ((broom.pressed ? 0 : 10) - this.lift) * Math.min(1, dt * 14);
    head.position.set(broom.x, broom.y + this.lift, broom.z);
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
    // La brosse grandit en vrai avec l'arbre (Brosse large, Brosse géante).
    const widthScale = sim && (this.tool === 'broom' || this.tool === 'widebroom') ? sim.broom.width / 74 : 1;
    head.scale.set((1 + squash) * widthScale, 1 - squash, 1);
    // Pelle à main : petit mouvement de « hop ! » à chaque coup de pelle.
    if (this.tool === 'handpan' && sim) {
      const t = this.time - sim.scoopFlash;
      head.rotation.x += t < 0.35 ? -Math.sin((t / 0.35) * Math.PI) * 0.6 : 0;
    }
    this.updateWhirl(sim, broom, dt);

    const grip = this.tmpA.set(24, -42, -36).applyMatrix4(cam.matrixWorld);
    const base = this.tmpB.set(0, 34 * (1 - squash), 0);
    head.localToWorld(base);
    handle.position.copy(base);
    const dir = grip.clone().sub(base).normalize();
    handle.quaternion.setFromUnitVectors(this.up, dir);

    if (sim) {
      // L'empreinte suit la brosse : même position, même orientation, même taille que la zone qui pousse.
      const hw = sim.toolWidth(this.tool === 'widebroom' ? 'widebroom' : 'broom');
      this.ring.position.set(broom.x, broom.y + 1.2, broom.z);
      this.ring.rotation.set(0, yaw, 0);
      // Le rectangle unitaire est dans le plan XY puis couché : X = largeur, Y (→ -Z) = épaisseur vers l'avant.
      this.ring.scale.set(hw + 6, 1, sim.broom.depth + 6);
      (this.ringFill.material as THREE.MeshBasicMaterial).opacity = broom.pressed ? 0.14 : 0.03;
      (this.ringEdge.material as THREE.MeshBasicMaterial).opacity = broom.pressed ? 0.6 : 0.2;
    }  }

  // ───────────────────────────── Multijoueur : les autres joueurs ─────────────────────────────

  private avatars = new Map<number, Avatar>();

  /** Affiche et anime les autres joueurs (positions lissées entre deux messages). */
  setRemotePlayers(list: { slot: number; name: string; color: string; pose: { x: number; y: number; z: number; yaw: number; bx: number; by: number; bz: number; pressed: boolean } | null }[], dt: number): void {
    const keep = new Set<number>();
    for (const p of list) {
      if (!p.pose) continue;
      keep.add(p.slot);
      let a = this.avatars.get(p.slot);
      if (!a || a.name !== p.name || a.color !== p.color) {
        if (a) this.scene.remove(a.g, a.broom);
        a = this.buildAvatar(p.name, p.color, p.pose);
        this.avatars.set(p.slot, a);
      }
      const k = Math.min(1, dt * 12);
      const q = p.pose;
      const ox = a.x;
      const oz = a.z;
      a.x += (q.x - a.x) * k;
      a.y += (q.y - a.y) * k;
      a.z += (q.z - a.z) * k;
      let dy = q.yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.yaw += dy * k;
      a.bx += (q.bx - a.bx) * k;
      a.by += (q.by - a.by) * k;
      a.bz += (q.bz - a.bz) * k;
      // Marche : les jambes et les bras se balancent selon la vitesse.
      const speed = dt > 0 ? Math.hypot(a.x - ox, a.z - oz) / dt : 0;
      a.walk += dt * Math.min(14, speed * 0.05);
      const swing = Math.min(1, speed / 200) * 0.6;
      a.legL.rotation.x = Math.sin(a.walk) * swing;
      a.legR.rotation.x = -Math.sin(a.walk) * swing;
      const bob = Math.abs(Math.sin(a.walk)) * swing * 5;
      a.body.position.y = bob;
      a.g.position.set(a.x, a.y, a.z);
      a.g.rotation.y = a.yaw;
      // Le balai : des mains jusqu'au point visé ; la brosse se pose au sol quand le joueur balaie.
      const lift = q.pressed ? 0 : 10;
      const scrub = q.pressed ? Math.sin(this.time * 9 + p.slot) * 0.12 : 0;
      a.arms.rotation.x = 0.95 + scrub;
      a.hand.updateWorldMatrix(true, false);
      const hand = a.hand.getWorldPosition(new THREE.Vector3());
      const foot = new THREE.Vector3(a.bx, a.by + 10 + lift, a.bz);
      const len = Math.max(30, hand.distanceTo(foot));
      a.broom.position.copy(foot);
      a.broom.quaternion.setFromUnitVectors(this.up, hand.clone().sub(foot).normalize());
      a.stick.scale.y = len + 30;
      a.head.rotation.z = Math.sin(this.time * 1.7 + p.slot) * 0.05;
      // Clignement des yeux de temps en temps.
      const blink = (this.time + p.slot * 1.3) % 4 < 0.12 ? 0.15 : 1;
      for (const e of a.eyes) e.scale.y = blink;
    }
    for (const [slot, a] of this.avatars) {
      if (keep.has(slot)) continue;
      this.scene.remove(a.g, a.broom);
      this.avatars.delete(slot);
    }
  }

  private buildAvatar(name: string, color: string, pose: { x: number; y: number; z: number; yaw: number; bx: number; by: number; bz: number }): Avatar {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const tint = new THREE.Color(color);
    const dark = tint.clone().multiplyScalar(0.6);
    const skin = mat(0xf2c9a0, { roughness: 0.65 });
    const cloth = mat(tint, { roughness: 0.85 });
    const trousers = mat(0x4a3a5a, { roughness: 0.9 });
    const white = mat(0xf6efe2, { roughness: 0.9 });
    const shoe = mat(0x3a2a22, { roughness: 0.6 });
    const ink = new THREE.MeshBasicMaterial({ color: 0x2b1a2e });
    const cap = (r: number, len: number, m: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m);

    // Jambes (pivot à la hanche) et chaussures.
    const legs: THREE.Group[] = [];
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 9, 52, 0);
      const l = cap(7, 30, trousers);
      l.position.y = -22;
      const s = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8).scale(1, 0.6, 1.5), shoe);
      s.position.set(0, -44, -4);
      leg.add(l, s);
      body.add(leg);
      legs.push(leg);
    }
    // Corps : tunique à la couleur du joueur, ceinture, tablier avec une poche.
    const torso = cap(21, 34, cloth);
    torso.position.y = 82;
    torso.scale.set(1, 1, 0.85);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(20, 27, 26, 18), cloth);
    skirt.position.y = 58;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(19.5, 2.2, 8, 24).rotateX(Math.PI / 2), mat(0x6a4a2a, { roughness: 0.6 }));
    belt.position.y = 72;
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(21.6, 27.8, 52, 18, 1, true, -0.85, 1.7), white);
    (apron.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    apron.position.y = 68;
    apron.rotation.y = Math.PI;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 1.5), mat(0xe4dccb, { roughness: 0.9 }));
    pocket.position.set(0, 60, -24.5);
    body.add(torso, skirt, belt, apron, pocket);

    // Bras (tous les deux tendus vers le manche du balai) ; la main droite tient le manche.
    const arms = new THREE.Group();
    arms.position.y = 104;
    const hand = new THREE.Object3D();
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 21, 0, 0);
      arm.rotation.z = sx * 0.12;
      const sleeve = cap(6.5, 20, cloth);
      sleeve.position.y = -14;
      const forearm = cap(5.5, 14, skin);
      forearm.position.y = -33;
      const fist = new THREE.Mesh(new THREE.SphereGeometry(6.5, 10, 8), skin);
      fist.position.y = -44;
      arm.add(sleeve, forearm, fist);
      arms.add(arm);
    }
    hand.position.set(0, -44, 0);
    arms.add(hand);
    body.add(arms);

    // Tête : visage, yeux qui clignent, joues roses, sourire, cheveux et foulard noué.
    const head = new THREE.Group();
    head.position.y = 140;
    const face = new THREE.Mesh(new THREE.SphereGeometry(19, 20, 16), skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(19.8, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(0x5a3a22, { roughness: 0.8 }));
    hair.rotation.x = 0.35;
    const scarf = new THREE.Mesh(new THREE.SphereGeometry(20.6, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), cloth);
    scarf.rotation.x = -0.15;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), mat(dark, { roughness: 0.85 }));
    knot.position.set(0, 4, 19);
    head.add(face, hair, scarf, knot);
    for (const sx of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 8), mat(dark, { roughness: 0.85 }));
      tail.position.set(sx * 4, -4, 22);
      tail.rotation.set(0.5, 0, sx * 0.5);
      head.add(tail);
    }
    const eyes: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(4.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), ink);
      pupil.position.z = -2.6;
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(0.8, 0.9, -4.6);
      eye.add(ball, pupil, shine);
      eye.position.set(sx * 7, 1, -16);
      head.add(eye);
      eyes.push(eye);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(3.5, 10, 8).scale(1, 0.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xff9a8a, transparent: true, opacity: 0.7 }));
      cheek.position.set(sx * 11, -5, -14.8);
      head.add(cheek);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1.1, 6, 12, Math.PI), ink);
    smile.rotation.set(0, Math.PI, Math.PI);
    smile.position.set(0, -6, -18.2);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), mat(0xeab08a, { roughness: 0.6 }));
    nose.position.set(0, -1.5, -19);
    head.add(smile, nose);
    body.add(head);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial)) o.castShadow = true;
    });

    // Nom (et petite pastille de couleur) au-dessus de la tête.
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 72;
    const ctx = cv.getContext('2d')!;
    ctx.font = '900 32px Nunito, sans-serif';
    ctx.textBaseline = 'middle';
    const tw = Math.min(260, ctx.measureText(name).width);
    const w = tw + 60;
    const x0 = 160 - w / 2;
    ctx.fillStyle = 'rgba(255,247,230,0.95)';
    ctx.strokeStyle = '#2b1a2e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(x0, 8, w, 54, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + 26, 35, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b1a2e';
    ctx.fillText(name, x0 + 44, 36, 260);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    tag.scale.set(110, 25, 1);
    tag.position.y = 190;
    tag.renderOrder = 10;
    g.add(tag);

    // Son balai : brosse en paille + ligature + manche (orienté du sol vers les mains).
    const broom = new THREE.Group();
    const straw = mat(0xe2b553, { roughness: 0.85 });
    const bristles = new THREE.Mesh(new THREE.BoxGeometry(62, 22, 18), straw);
    bristles.position.y = 0;
    const band = new THREE.Mesh(new THREE.BoxGeometry(54, 8, 20), mat(tint, { roughness: 0.5 }));
    band.position.y = 13;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 1, 8).translate(0, 0.5, 0), mat(0xb8692a, { roughness: 0.45 }));
    stick.position.y = 14;
    broom.add(bristles, band, stick);
    broom.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null));
    this.scene.add(g, broom);
    return {
      g, body, head, arms, hand, legL: legs[0], legR: legs[1], eyes, broom, stick, name, color,
      x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, bx: pose.bx, by: pose.by, bz: pose.bz, walk: 0,
    };
  }

  /** Tourbillon du balai magique : des grains de lumière qui tournent en spirale. */
  private whirlFx: THREE.Points | null = null;
  private updateWhirl(sim: RoomSim | null, broom: BroomView, dt: number): void {
    const on = this.tool === 'whirl' && broom.pressed && sim !== null;
    if (!this.whirlFx) {
      if (!on) return;
      const n = 90;
      const pos = new Float32Array(n * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.glowTex ??= new THREE.CanvasTexture(softDot());
      this.whirlFx = new THREE.Points(g, new THREE.PointsMaterial({ size: 9, map: this.glowTex, color: 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(this.whirlFx);
    }
    const fx = this.whirlFx;
    fx.visible = on;
    if (!on || !sim) return;
    const R = 220 * sim.mods.whirl;
    const pos = fx.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const f = ((k * 0.618) + this.time * 0.35) % 1;
      const r = R * (1 - f);
      const a = k * 2.4 + this.time * (3 + 6 * f);
      pos.setXYZ(k, broom.x + Math.cos(a) * r, broom.y + 6 + f * 70, broom.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    void dt;
  }

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
    // Sans ça, les parties transparentes (touffes, voiles de poussière) apparaissent en noir.
    alphaTest: sm.alphaTest,
    depthWrite: sm.depthWrite,
    polygonOffset: sm.polygonOffset,
    polygonOffsetFactor: sm.polygonOffsetFactor,
  });
}

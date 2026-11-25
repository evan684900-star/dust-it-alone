import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REALISTIC, REAL_DUST_COLORS, filmPass, sanitizePass, naturalize, realFuzzballGeometry, realDustGeometry, realDustTexture } from './realistic';
import { panFit, type DoorDef, type RoomDef, type StairDef } from '../data/rooms';
import { DIRT_ORDER, DIRT_TYPES, type DirtId } from '../data/dirtTypes';
import { drawDustMessage, drawEmoji, drawStain, drawWeb, softDot } from './canvasTextures';
import { BELT, type RoomSim } from '../sim/roomSim';
import { PAL } from './palette';
import { fabric, mat, plastic as plasticLike } from './materials';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { dustBunnyGeometry, grainGeometry, roundedBox, starGeometry } from './geometry';
import { buildBroom, buildDustpan, buildProp } from './props';
import { buildDoor, buildRoomShell, buildStair, type DoorView } from './castle';
import { Floaters } from './floaters';
import { mergeStatic } from './merge';
import type { Helper, HelperKind } from '../sim/helpers';
import { QUALITY_PRESETS, type QualityLevel } from './quality';
import { buildFigure, crown, setFigureOpacity, type Figure, type Role } from './figures';
import { Sparkles } from './sparkles';

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

interface Pan { obj: THREE.Group; bounce: number; pending: number; timer: number; textX: number; textZ: number; base: number; fit: number; home: THREE.Vector3; back: THREE.Vector3 }
interface EchoActor {
  fig: Figure;
  speaker: string;
  home: THREE.Vector3;
  from: THREE.Vector3;
  mode: 'stand' | 'run' | 'sweep' | 'arrive' | 'plush';
  phase: number;
  glow: number;
  runA: number;
  /** Marche d'arrivée (−1 = pas encore partie). */
  walkT: number;
  /** Visibilité propre (0 = pas encore arrivé). */
  gate: number;
}
interface EchoScene {
  view: RoomView;
  group: THREE.Group;
  actors: EchoActor[];
  alpha: number;
  target: number;
  t: number;
  center: THREE.Vector3;
  king: THREE.Group | null;
  kingK: number;
  shrinking: boolean;
  dawn: number;
  dawnTarget: number;
  real: boolean;
}
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
  belts: THREE.Group[];
  /** Message de Mouton Ier écrit dans la poussière. */
  dustMessage?: THREE.Mesh;
  /** Voile de poussière sur le sol et toiles d'araignée des coins : ils s'effacent quand la pièce est propre. */
  grime?: THREE.Mesh;
  webs?: THREE.Mesh[];
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
  private bunnyGeo = REALISTIC ? realFuzzballGeometry() : dustBunnyGeometry();
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
  /** Étincelles, poussières dorées, souffles (un seul nuage de points). */
  sparkles!: Sparkles;
  private baseExposure = 1;
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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
    this.buildSkyExtras(rooms.map((r) => r.def));
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
            // Boule de duvet (couleur par sommet × teinte par mouton), sans transparence.
            const m = mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
            return { geo: this.bunnyGeo, rich: m, mid: m, big: true, colors: [0xa8a198, 0x9a948b, 0xb4ada2, 0x8e8880] };
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
      const b = buildStair(st, doors);
      mergeStatic(b.group, new Set<THREE.Object3D>(b.flames));
      s.add(b.group);
      this.stairFlames.push(...b.flames);
      this.stairTorches.push(...b.torches);
    }
    for (const d of doors) {
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
      // Direction du mur derrière la pelle : elle grandit en restant collée au mur.
      const back = new THREE.Vector3(-Math.sign(dx), 0, -Math.sign(dz));
      pans.push({ obj, bounce: 0, pending: 0, timer: 0, textX: def.origin.x + c.mouth.x + dx, textZ: def.origin.z + c.mouth.y + dz, base: 1, fit: panFit(def, c, doors), home: obj.position.clone(), back });
    }

    // Tout ce qui ne bouge pas est fusionné (les pelles rebondissent et les flammes vacillent : on les garde à part).
    mergeStatic(group, new Set<THREE.Object3D>([...pans.map((p) => p.obj), ...shell.flames]));
    const neglect = this.buildNeglect(def, group);

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
    return { def, sim, group, dust, meshes, helperViews: new Map(), belts: [], pans, ...neglect, ambience: shell.ambience, torches, flames: shell.flames, motes: shell.motes, visible: true };
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
    this.sparkles = new Sparkles(new THREE.CanvasTexture(softDot()));
    this.scene.add(this.sparkles.points);
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
      if (instant) {
        d.open = d.target;
        // Sans ça, une porte déjà ouverte au chargement restait dessinée fermée.
        d.pivot.rotation.y = -d.open * 1.75;
      }
      d.lock.visible = d.target === 0;
      d.pivot.children.forEach((c) => { if (c !== d.pivot.children[0]) c.visible = d.target === 0; });
    }
  }

  /** Taille des pelles d'une pièce (amélioration « Pelles géantes »), avec un petit rebond. */
  // ───────────────────────────── Ciel : soleil, nuages, collines ─────────────────────────────

  private clouds: THREE.Mesh | null = null;

  /** Autour du château : un soleil de fin d'après-midi, des nuages qui passent, des collines au loin. */
  private buildSkyExtras(defs: RoomDef[]): void {
    const xs = defs.flatMap((d) => [d.origin.x, d.origin.x + d.width]);
    const zs = defs.flatMap((d) => [d.origin.z, d.origin.z + d.height]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const root = new THREE.Group();
    root.position.set(cx, 0, cz);
    this.scene.add(root);
    const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, transparent: true, ...o });

    // Le soleil : un disque chaud et un grand halo.
    const sunDir = new THREE.Vector3(-0.55, 0.28, -0.79).normalize();
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(softDot()), color: new THREE.Color(0xfff0c0).multiplyScalar(2), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.scale.set(3600, 3600, 1);
    disc.position.copy(sunDir).multiplyScalar(30000);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(softDot()), color: 0xffb070, opacity: 0.55, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(16000, 16000, 1);
    halo.position.copy(disc.position);
    root.add(halo, disc);

    // Collines : deux bandes de relief tout autour (les plus loin, bleutées ; les plus proches, vertes).
    const hills = (h: number, color: string, top: string, seed: number) => {
      const c = document.createElement('canvas');
      c.width = 2048;
      c.height = 128;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, top);
      grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 128);
      for (let x = 0; x <= 2048; x += 8) {
        const t = (x / 2048) * Math.PI * 2;
        const y = 70 - 26 * Math.sin(t * 3 + seed) - 14 * Math.sin(t * 7 + seed * 2) - 6 * Math.sin(t * 17 + seed);
        g.lineTo(x, y);
      }
      g.lineTo(2048, 128);
      g.fill();
      // De petits arbres sur la crête la plus proche.
      if (seed > 1) {
        g.fillStyle = top;
        for (let x = 10; x < 2048; x += 14 + ((x * 7) % 23)) {
          const t = (x / 2048) * Math.PI * 2;
          const y = 70 - 26 * Math.sin(t * 3 + seed) - 14 * Math.sin(t * 7 + seed * 2) - 6 * Math.sin(t * 17 + seed);
          g.beginPath();
          g.arc(x, y - 3, 5 + ((x * 13) % 5), 0, Math.PI * 2);
          g.fill();
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(h, h, h * 0.16, 64, 1, true), basic({ map: t, side: THREE.BackSide, alphaTest: 0.02 }));
      m.position.y = -900 + h * 0.07;
      m.renderOrder = -1;
      return m;
    };
    root.add(hills(34000, '#8a9ab8', '#a8b4cc', 1), hills(26000, '#4a6a3a', '#6a8a4a', 4));

    // Nuages : des grappes de boules douces, qui dérivent lentement.
    const cloudTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const g = c.getContext('2d')!;
      for (let k = 0; k < 9; k++) {
        const x = 50 + k * 19 + Math.sin(k * 2.1) * 10;
        const y = 78 - Math.sin((k / 8) * Math.PI) * 26;
        const r = 26 + Math.sin(k * 1.7) * 10 + Math.sin((k / 8) * Math.PI) * 14;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,250,244,0.95)');
        grad.addColorStop(0.7, 'rgba(255,240,230,0.7)');
        grad.addColorStop(1, 'rgba(255,236,220,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    // Tous les nuages en un seul dessin : des rectangles tournés vers le château.
    const quads: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.sin(k * 3.7) * 0.2;
      const r = 17000 + ((k * 3779) % 9000);
      const w = 5000 + ((k * 1931) % 4000);
      dummy.position.set(Math.cos(a) * r, 5500 + ((k * 2711) % 4000), Math.sin(a) * r);
      dummy.lookAt(0, dummy.position.y * 0.6, 0);
      dummy.updateMatrix();
      quads.push(new THREE.PlaneGeometry(w, w / 2).applyMatrix4(dummy.matrix));
    }
    const clouds = new THREE.Mesh(mergeGeometries(quads)!, basic({ map: cloudTex, color: 0xfff4ec, opacity: 0.85 }));
    root.add(clouds);
    this.clouds = clouds;
  }

  // ───────────────────────────── L'abandon : voile de poussière et toiles d'araignée ─────────────────────────────

  private grimeTex: THREE.Texture | null = null;
  private cornerWebTex: THREE.Texture | null = null;

  /** Un voile gris sur le sol et des toiles dans les coins du plafond (pas dehors). */
  private buildNeglect(def: RoomDef, group: THREE.Group): { grime?: THREE.Mesh; webs?: THREE.Mesh[] } {
    if (def.style === 'courtyard' || def.style === 'ramparts') return {};
    if (!this.grimeTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      // Des nappes de poussière irrégulières, plus épaisses par endroits, et de fines traînées.
      for (let k = 0; k < 140; k++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 10 + Math.random() * 50;
        for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
          const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          grad.addColorStop(0, `rgba(150,138,124,${0.12 + Math.random() * 0.18})`);
          grad.addColorStop(1, 'rgba(150,138,124,0)');
          g.fillStyle = grad;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
      g.strokeStyle = 'rgba(120,110,100,0.18)';
      for (let k = 0; k < 60; k++) {
        g.lineWidth = 0.5 + Math.random();
        g.beginPath();
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
        g.stroke();
      }
      this.grimeTex = new THREE.CanvasTexture(c);
      this.grimeTex.wrapS = this.grimeTex.wrapT = THREE.RepeatWrapping;
      this.cornerWebTex = new THREE.CanvasTexture(drawWeb());
    }
    const tex = this.grimeTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(def.width / 520, def.height / 520);
    const grime = new THREE.Mesh(
      new THREE.PlaneGeometry(def.width, def.height).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: REALISTIC ? 0x9a9088 : 0xb0a49a }),
    );
    grime.position.set(def.width / 2, 1, def.height / 2);
    grime.renderOrder = 1;
    group.add(grime);
    // Toiles d'araignée dans les quatre coins du plafond (le grenier a ses propres recoins).
    const webs: THREE.Mesh[] = [];
    if (def.style !== 'attic') {
      const C = def.ceiling;
      // Les quatre toiles en un seul dessin.
      const parts: THREE.BufferGeometry[] = [];
      const dummy = new THREE.Object3D();
      for (const [cx, cz] of [[0, 0], [def.width, 0], [0, def.height], [def.width, def.height]]) {
        // Tendue en travers du coin, un peu en avant (ses bords disparaissent dans les murs et le plafond).
        const ix = cx === 0 ? 1 : -1;
        const iz = cz === 0 ? 1 : -1;
        dummy.position.set(cx + ix * 62, C - 70, cz + iz * 62);
        dummy.lookAt(cx + ix * 400, C - 330, cz + iz * 400);
        dummy.updateMatrix();
        parts.push(new THREE.PlaneGeometry(260, 260).applyMatrix4(dummy.matrix));
      }
      const web = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ map: this.cornerWebTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: REALISTIC ? 0xc8c4bc : 0xffffff }));
      group.add(web);
      webs.push(web);
    }
    return { grime, webs };
  }

  // ───────────────────────────── Tapis roulants ─────────────────────────────

  private beltTex: THREE.CanvasTexture | null = null;
  private beltSpeed = 1;
  private beltRun = false;
  private beltProto: THREE.Group | null = null;

  /** Un tapis : longueur le long de −Z (sens de la marche), posé au sol. */
  private buildBelt(): THREE.Group {
    if (this.beltProto) return this.beltProto.clone();
    const L = BELT.len;
    const W = BELT.width;
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 64;
    const g2 = c.getContext('2d')!;
    g2.fillStyle = REALISTIC ? '#2a2826' : '#3a3440';
    g2.fillRect(0, 0, 32, 64);
    // Chevrons qui montrent le sens.
    g2.strokeStyle = REALISTIC ? '#4a4642' : '#ffd35a';
    g2.lineWidth = 6;
    g2.beginPath();
    g2.moveTo(2, 46);
    g2.lineTo(16, 26);
    g2.lineTo(30, 46);
    g2.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, L / 40);
    this.beltTex = tex;
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.PlaneGeometry(W - 16, L - 10).rotateX(-Math.PI / 2), mat(0xffffff, { map: tex, roughness: 0.85 }));
    band.position.y = 6.5;
    band.receiveShadow = true;
    // On veut que la bande avance vers −Z : on retourne la texture (v croît vers −Z).
    const wood = mat(REALISTIC ? 0x6a4a30 : 0xa0663a, { roughness: 0.7 });
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(roundedBox(8, 12, L, 2), wood);
      side.position.set((sx * (W - 8)) / 2, 6, 0);
      side.castShadow = true;
      g.add(side);
    }
    const metal = mat(REALISTIC ? 0x8a8a86 : 0xc8ccd4, { metalness: 0.6, roughness: 0.35 });
    for (const sz of [-1, 1]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, W - 12, 12).rotateZ(Math.PI / 2), metal);
      roller.position.set(0, 5, (sz * (L - 10)) / 2);
      g.add(roller);
    }
    g.add(band);
    this.beltProto = g;
    return g.clone();
  }

  /** Les tapis posés dans une pièce (coordonnées locales). */
  setBelts(roomIndex: number, list: { x: number; y: number; yaw: number }[], speed: number): void {
    const v = this.views[roomIndex];
    if (!v) return;
    this.beltSpeed = speed;
    for (const b of v.belts) v.group.remove(b);
    v.belts = list.map((b) => {
      const obj = this.buildBelt();
      obj.position.set(b.x, 0, b.y);
      obj.rotation.y = b.yaw;
      v.group.add(obj);
      return obj;
    });
  }

  setPanScale(roomIndex: number, scale: number): void {
    const v = this.views[roomIndex];
    if (!v) return;
    for (const p of v.pans) {
      const s = Math.min(scale, p.fit);
      if (Math.abs(p.base - s) > 0.001) p.bounce = Math.max(p.bounce, 0.8);
      p.base = s;
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
    this.baseExposure = r.toneMappingExposure;
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
      this.sparkles.burst(pan.textX, view.def.floorY + 50, pan.textZ, 45, { speed: 300, color: 0xffe070, size: 1.2 });
    } else if (view.visible && Math.random() < 0.25) {
      // Un petit nuage de poussière qui s'échappe de la pelle.
      const p = pan.obj.position;
      this.sparkles.spawn({ x: view.def.origin.x + p.x + (Math.random() - 0.5) * 50, y: view.def.floorY + 20, z: view.def.origin.z + p.z + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 50, vz: (Math.random() - 0.5) * 60, life: 0.9, gravity: -10, drag: 1.5, size: 1.6, color: REALISTIC ? 0x6a645e : 0x8a8090 });
    }
  }

  celebrate(roomIndex: number): void {
    const d = this.views[roomIndex].def;
    for (let k = 0; k < 6; k++) {
      this.burst(d.origin.x + d.width * (0.15 + k * 0.14), d.floorY + Math.min(300, d.ceiling - 60), d.origin.z + d.height / 2 + (k % 2 ? 150 : -150), 60);
    }
    this.shake = 6;
    // Une pluie d'étincelles dorées qui monte de tout le plancher.
    for (let k = 0; k < 220; k++) {
      this.sparkles.spawn({ x: d.origin.x + Math.random() * d.width, y: d.floorY + 5 + Math.random() * 20, z: d.origin.z + Math.random() * d.height, vy: 80 + Math.random() * 160, life: 2 + Math.random() * 2.5, gravity: -15, drag: 0.4, twinkle: true, size: 0.8 + Math.random() * 0.6, color: Math.random() < 0.3 ? 0xffffff : 0xffd86a });
    }
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
      if (v.belts.length) this.beltRun = true;
      if (v.motes && this.ambienceOn) this.updateMotes(v.motes);
    }
    // La bande des tapis défile (une seule texture pour tous).
    if (this.beltRun && this.beltTex) this.beltTex.offset.y = (this.beltTex.offset.y - (dt * BELT.speed * this.beltSpeed) / 40) % 1;
    this.beltRun = false;
    if (this.clouds) this.clouds.rotation.y += dt * 0.004;
    this.updateDoors(dt);
    this.updateStory(dt);
    this.updateLights(dt);
    this.updateBroom(broomSim, dt, broom);
    this.updateFx(dt);
    this.sparkles.update(dt);
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
          ? mat(0xd8b878, { vertexColors: true, side: THREE.DoubleSide, roughness: 1 })
          : fabric(0xffffff, { vertexColors: true, color: 0xffe6a8 }),
      );
      body.scale.setScalar(24);
      body.position.y = 22;
      body.rotation.y = Math.PI;
      body.castShadow = true;
      const bow = new THREE.Mesh(new THREE.TorusGeometry(6, 2.5, 6, 12), mat(0xd8323a));
      bow.position.set(0, REALISTIC ? 38 : 44, 6);
      g.add(body, bow);
      if (REALISTIC) {
        // Deux petits yeux brillants qui dépassent du duvet : c'est un assistant, pas un simple mouton.
        for (const sx of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), mat(0x1a1410, { roughness: 0.15 }));
          eye.position.set(sx * 7, 27, -19);
          g.add(eye);
        }
      }
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
      const g = this.makeSouvenir(s.icon);
      g.position.set(s.x, 0, s.y);
      g.userData.room = s.roomIndex;
      this.views[s.roomIndex].group.add(g);
      this.souvenirViews.set(s.id, g);
      // Il apparaît dans une petite gerbe d'étincelles.
      const v = this.views[s.roomIndex];
      if (v.visible) this.sparkles.burst(v.def.origin.x + s.x, v.def.floorY + 50, v.def.origin.z + s.y, 40, { speed: 220 });
    }
  }

  private pillarTex: THREE.Texture | null = null;
  private ringTex: THREE.Texture | null = null;

  /**
   * Un souvenir posé au sol : une colonne de lumière dorée (visible de loin), un cercle
   * lumineux qui pulse au sol, et l'objet qui flotte en tournant dans son halo.
   */
  private makeSouvenir(icon: string): THREE.Group {
    if (!this.pillarTex) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 128;
      const g2 = c.getContext('2d')!;
      const grad = g2.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(255,220,140,0)');
      grad.addColorStop(0.55, 'rgba(255,220,140,0.35)');
      grad.addColorStop(1, 'rgba(255,236,190,1)');
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 4, 128);
      this.pillarTex = new THREE.CanvasTexture(c);
      const r = document.createElement('canvas');
      r.width = r.height = 128;
      const g3 = r.getContext('2d')!;
      const rg = g3.createRadialGradient(64, 64, 20, 64, 64, 62);
      rg.addColorStop(0, 'rgba(255,220,140,0)');
      rg.addColorStop(0.72, 'rgba(255,228,160,0.9)');
      rg.addColorStop(0.82, 'rgba(255,240,200,1)');
      rg.addColorStop(1, 'rgba(255,220,140,0)');
      g3.fillStyle = rg;
      g3.fillRect(0, 0, 128, 128);
      this.ringTex = new THREE.CanvasTexture(r);
    }
    const g = new THREE.Group();
    const add = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ map: this.pillarTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // Deux cylindres ouverts (un large et pâle, un fin et vif) : un vrai rayon de lumière.
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(34, 52, 420, 20, 1, true).translate(0, 210, 0), add(0xffc860, 0.16));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(12, 22, 380, 14, 1, true).translate(0, 190, 0), add(0xffe8b0, 0.24));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(150, 150).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.ringTex, color: 0xffd890, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.y = 2;
    ring.renderOrder = 3;
    const float = this.makePickup(icon, 0xffd86a);
    float.position.y = 55;
    float.userData.base = 55;
    g.add(outer, inner, ring, float);
    g.userData = { float, ring, outer, inner };
    return g;
  }

  /** Le joueur ramasse un souvenir : gerbe d'étincelles et onde de lumière. */
  collectSouvenir(id: string): void {
    const g = this.souvenirViews.get(id);
    if (!g) return;
    const v = this.views[g.userData.room as number];
    const x = v.def.origin.x + g.position.x;
    const z = v.def.origin.z + g.position.z;
    const y = v.def.floorY;
    this.sparkles.burst(x, y + 60, z, 140, { speed: 520, color: 0xffd86a, size: 1.3 });
    this.sparkles.burst(x, y + 60, z, 60, { speed: 260, color: 0xffffff });
    // Une colonne d'étincelles qui monte vers le plafond.
    for (let k = 0; k < 60; k++) this.sparkles.spawn({ x: x + (Math.random() - 0.5) * 40, y: y + Math.random() * 60, z: z + (Math.random() - 0.5) * 40, vy: 250 + Math.random() * 350, life: 1.2 + Math.random(), gravity: -60, drag: 0.6, twinkle: true, color: 0xfff0c0 });
    g.parent?.remove(g);
    this.souvenirViews.delete(id);
    this.shake = Math.max(this.shake, 3);
  }

  /** Un objet à ramasser : une icône qui flotte dans un halo. */
  private makePickup(icon: string, glowColor: number): THREE.Group {
    let tex = this.emojiTex.get(icon);
    if (!tex) {
      const t: THREE.CanvasTexture = new THREE.CanvasTexture(drawEmoji(icon, () => (t.needsUpdate = true)));
      t.colorSpace = THREE.SRGBColorSpace;
      tex = t;
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

  // ───────────────────────────── Échos du passé et fin ─────────────────────────────

  private echo: EchoScene | null = null;
  private echoSpeaker: string | null = null;

  /**
   * Un écho du passé : les personnages apparaissent en lumière dorée au milieu de la pièce
   * (ou « en vrai » pour la fin), et jouent la scène. Renvoie le centre de la scène (monde).
   */
  startEcho(roomIndex: number, cast: { role: Role; speaker: string }[], opts: { real?: boolean; king?: boolean; face?: { x: number; z: number } } = {}): { x: number; y: number; z: number } {
    if (this.echo) this.removeEcho();
    const view = this.views[roomIndex];
    const d = view.def;
    const group = new THREE.Group();
    view.group.add(group);
    const center = new THREE.Vector3(d.width / 2, 0, d.height / 2);
    // Écho : on évite le centre s'il est encombré (meubles) en cherchant une place libre près du milieu.
    const free = (x: number, z: number) => !d.obstacles.some((o) => x > o.rect.x - 160 && x < o.rect.x + o.rect.w + 160 && z > o.rect.y - 160 && z < o.rect.y + o.rect.h + 160);
    if (!free(center.x, center.z)) {
      for (let r = 100; r < Math.min(d.width, d.height) / 2 - 150; r += 80) {
        let found = false;
        for (let k = 0; k < 12 && !found; k++) {
          const x = d.width / 2 + Math.cos((k / 12) * Math.PI * 2) * r;
          const z = d.height / 2 + Math.sin((k / 12) * Math.PI * 2) * r;
          if (free(x, z)) {
            center.set(x, 0, z);
            found = true;
          }
        }
        if (found) break;
      }
    }
    const style = opts.real ? 'real' : 'ghost';
    const actors: EchoActor[] = [];
    const n = cast.length;
    const R = n <= 1 ? 0 : 55 + 16 * n;
    cast.forEach((c, k) => {
      const fig = buildFigure(c.role, style, d.floorY, this.plushGeo);
      const a = (k / Math.max(1, n)) * Math.PI * 2 + 0.6;
      const home = new THREE.Vector3(center.x + Math.cos(a) * R, 0, center.z + Math.sin(a) * R);
      let mode: EchoActor['mode'] = 'stand';
      if (!opts.real && (c.role === 'elise' || c.role === 'lou') && n > 1) mode = 'run';
      if (c.role === 'gustave') mode = 'sweep';
      if (opts.real && (c.role === 'eliseAdult' || c.role === 'lou')) mode = 'arrive';
      if (opts.real && c.role === 'mouton') {
        // Le doudou retrouvé : au centre, là où était Mouton Ier.
        home.copy(center);
        mode = 'plush';
      }
      if (mode === 'arrive') {
        // Elles arrivent du bout de la salle, puis viennent se placer près du doudou.
        const side = c.role === 'lou' ? -1 : 1;
        home.set(center.x + side * 85, 0, center.z + 70);
      }
      fig.root.position.copy(home);
      fig.root.lookAt(center.x, 0, center.z);
      fig.root.rotateY(Math.PI);
      group.add(fig.root);
      setFigureOpacity(fig, 0);
      actors.push({
        fig,
        speaker: c.speaker,
        home,
        from: new THREE.Vector3(center.x + (c.role === 'lou' ? -60 : 60), 0, Math.min(d.height - 120, center.z + 520)),
        mode,
        phase: k * 1.9,
        glow: 0,
        runA: a,
        walkT: -1,
        gate: mode === 'arrive' || mode === 'plush' ? 0 : 1,
      });
    });
    let king: THREE.Group | null = null;
    if (opts.king) {
      // Mouton Ier : une énorme boule de poussière grise, une couronne de travers et deux yeux noirs.
      king = new THREE.Group();
      const fuzz = new THREE.Mesh(this.kingGeo(), mat(0xffffff, { vertexColors: true, roughness: 1 }));
      fuzz.scale.set(86, 70, 86);
      fuzz.position.y = 70;
      fuzz.castShadow = true;
      // Une couronne dorée, de travers.
      const crownMesh = new THREE.Mesh(crown(30), mat(0xffd35a, { metalness: 0.8, roughness: 0.3, emissive: 0x5a3a08, side: THREE.DoubleSide }));
      crownMesh.position.set(16, 136, -8);
      crownMesh.rotation.z = -0.28;
      // De gros yeux ronds (blanc + pupille), un peu tristes.
      for (const sx of [-1, 1]) {
        const white = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 12), mat(0xffffff, { roughness: 0.25 }));
        white.scale.z = 0.6;
        white.position.set(sx * 28, 96, -78);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(6.5, 12, 8), mat(0x14101a, { roughness: 0.1 }));
        pupil.position.set(sx * 26, 92, -86);
        const brow = new THREE.Mesh(new THREE.CapsuleGeometry(2.5, 16, 4, 6), mat(0x4a4450));
        brow.rotation.z = Math.PI / 2 + sx * 0.35;
        brow.position.set(sx * 28, 115, -80);
        king.add(white, pupil, brow);
      }
      king.add(fuzz, crownMesh);
      king.position.copy(center);
      // Il regarde le joueur (d'où part la caméra).
      const fx = opts.face ? opts.face.x - d.origin.x : center.x;
      const fz = opts.face ? opts.face.z - d.origin.z : center.z + 500;
      king.lookAt(fx, 0, fz);
      king.rotateY(Math.PI);
      group.add(king);
    }
    this.echo = { view, group, actors, alpha: 0, target: 1, t: 0, center, king, kingK: 0, shrinking: false, dawn: 0, dawnTarget: 0, real: !!opts.real };
    // Une pluie d'étincelles dorées pour l'apparition.
    const wx = d.origin.x + center.x;
    const wz = d.origin.z + center.z;
    if (!opts.real) for (const a of actors) this.sparkles.burst(d.origin.x + a.home.x, d.floorY + 90, d.origin.z + a.home.z, 50, { speed: 180, gravity: -30 });
    return { x: wx, y: d.floorY, z: wz };
  }

  private kingGeoCache: THREE.BufferGeometry | null = null;

  /** Mouton Ier : une grosse boule de poussière bien duveteuse (couleurs par sommet). */
  private kingGeo(): THREE.BufferGeometry {
    if (this.kingGeoCache) return this.kingGeoCache;
    const g = new THREE.IcosahedronGeometry(1, 5);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      // Grosses touffes + petites mèches.
      const tuft = Math.sin(v.x * 9 + v.y * 4) * Math.sin(v.z * 8 - v.y * 5) * 0.07 + Math.sin(v.x * 31 + v.z * 27) * Math.sin(v.y * 29) * 0.035;
      v.multiplyScalar(1 + tuft);
      if (v.y < -0.6) v.y = -0.6 - (v.y + 0.6) * 0.2;
      p.setXYZ(i, v.x, v.y, v.z);
      const shade = 0.5 + tuft * 3 + v.y * 0.12;
      col.set([shade, shade * 0.97, shade * 1.02], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.kingGeoCache = g;
    return g;
  }

  /** Celui qui parle (nom affiché dans la bulle) : il s'illumine et fait des gestes. */
  setEchoSpeaker(name: string | null): void {
    this.echoSpeaker = name;
  }

  /** Moments clés de la fin. */
  echoCue(cue: 'shrink' | 'arrive' | 'dawn'): void {
    const e = this.echo;
    if (!e) return;
    if (cue === 'shrink') e.shrinking = true;
    if (cue === 'arrive') for (const a of e.actors) if (a.mode === 'arrive' && a.walkT < 0) a.walkT = 0;
    if (cue === 'dawn') e.dawnTarget = 1;
  }

  /** Fin de l'écho : les personnages s'effacent doucement. */
  endEcho(): void {
    if (this.echo) this.echo.target = 0;
  }

  private removeEcho(): void {
    const e = this.echo;
    if (!e) return;
    e.group.parent?.remove(e.group);
    e.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry !== this.plushGeo && m.geometry !== this.kingGeoCache && m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      }
    });
    this.renderer.toneMappingExposure = this.baseExposure;
    this.echo = null;
  }

  private updateEcho(dt: number): void {
    const e = this.echo;
    if (!e) return;
    e.t += dt;
    const t = e.t;
    e.alpha += Math.sign(e.target - e.alpha) * Math.min(Math.abs(e.target - e.alpha), dt / 1.3);
    if (e.target === 0 && e.alpha <= 0.001) {
      this.removeEcho();
      return;
    }
    const d = e.view.def;
    const ox = d.origin.x;
    const oz = d.origin.z;
    const fy = d.floorY;

    // Mouton Ier rétrécit, en perdant sa poussière en nuages.
    let plushGate = 0;
    if (e.king) {
      if (e.shrinking) e.kingK = Math.min(1, e.kingK + dt / 6);
      const k = e.kingK;
      const sc = 1 - 0.985 * (k * k * (3 - 2 * k));
      e.king.scale.setScalar(Math.max(0.001, sc));
      e.king.position.x = e.center.x + (e.shrinking && k < 1 ? Math.sin(t * 40) * 4 * (1 - k) : 0);
      e.king.visible = k < 1;
      if (e.shrinking && k < 1) {
        for (let q = 0; q < 3; q++) {
          const a = Math.random() * Math.PI * 2;
          const r = 70 * sc;
          this.sparkles.spawn({ x: ox + e.center.x + Math.cos(a) * r, y: fy + 20 + Math.random() * 120 * sc, z: oz + e.center.z + Math.sin(a) * r, vx: Math.cos(a) * 120, vy: 80 + Math.random() * 140, vz: Math.sin(a) * 120, life: 1.6, gravity: -20, drag: 1.2, color: 0xb8b0a8, size: 2.2 });
        }
      }
      plushGate = Math.max(0, (k - 0.75) / 0.25);
    }

    // Le lever du jour (fin) : la lumière monte doucement.
    e.dawn += (e.dawnTarget - e.dawn) * Math.min(1, dt * 0.5);
    this.renderer.toneMappingExposure = this.baseExposure * (1 + 0.55 * e.dawn * e.alpha);

    for (const a of e.actors) {
      const f = a.fig;
      const speaking = this.echoSpeaker !== null && a.speaker === this.echoSpeaker;
      a.glow += ((speaking ? 1 : 0) - a.glow) * Math.min(1, dt * 4);
      const root = f.root;
      let bob = Math.sin(t * 2 + a.phase) * 1.2;
      let armR = Math.sin(t * 1.3 + a.phase) * 0.08;
      let armL = -armR;
      let face: THREE.Vector3 | null = e.center;
      if (a.mode === 'run') {
        // L'enfant court autour des grands… et s'arrête pour parler.
        if (!speaking) a.runA += dt * 0.75;
        const rr = 150;
        const px = e.center.x + Math.cos(a.runA) * rr;
        const pz = e.center.z + Math.sin(a.runA) * rr;
        root.position.set(px, 0, pz);
        if (!speaking) {
          face = new THREE.Vector3(px - Math.sin(a.runA) * 100, 0, pz + Math.cos(a.runA) * 100);
          bob = Math.abs(Math.sin(t * 9 + a.phase)) * 7;
          armR = Math.sin(t * 9) * 0.7;
          armL = -armR;
        }
      } else if (a.mode === 'sweep' && !speaking) {
        // Gustave balaie, encore et toujours.
        root.position.set(a.home.x + Math.sin(t * 0.6) * 35, 0, a.home.z);
        armR = -0.45 + Math.sin(t * 3.2) * 0.4;
        armL = armR * 0.8;
        f.body.rotation.x = -0.12;
      } else if (a.mode === 'arrive') {
        if (a.walkT >= 0) {
          a.walkT += dt;
          const k = Math.min(1, a.walkT / 5.5);
          const ease = k * k * (3 - 2 * k);
          root.position.lerpVectors(a.from, a.home, ease);
          a.gate = Math.min(1, a.walkT / 1.2);
          if (k < 1) {
            face = a.home.clone();
            face.sub(a.from).add(root.position);
            bob = Math.abs(Math.sin(t * 6 + a.phase)) * 4;
            armR = Math.sin(t * 6 + a.phase) * 0.45;
            armL = -armR;
          }
        }
      } else if (a.mode === 'plush') {
        a.gate = plushGate;
        bob = 0;
        armR = armL = 0;
      } else {
        root.position.copy(a.home);
      }
      if (a.mode !== 'sweep' || speaking) f.body.rotation.x *= 0.9;
      if (speaking) {
        const gesture = -0.85 + Math.sin(t * 5 + a.phase) * 0.35;
        if (f.hasProp) armL = gesture;
        else armR = gesture;
        f.head.rotation.x = Math.sin(t * 7) * 0.07;
        bob += Math.abs(Math.sin(t * 5)) * 1.5;
        // Le personnage qui parle répand quelques étincelles.
        if (Math.random() < dt * 8) this.sparkles.spawn({ x: ox + root.position.x + (Math.random() - 0.5) * 50, y: fy + f.height * (0.5 + Math.random() * 0.5), z: oz + root.position.z + (Math.random() - 0.5) * 50, vy: 40, life: 1.5, gravity: -20, twinkle: true, size: 0.8, color: e.real ? 0xfff4d0 : 0xffd890 });
      } else f.head.rotation.x *= 0.9;
      f.body.position.y = bob;
      f.armR.rotation.x += (armR - f.armR.rotation.x) * Math.min(1, dt * 8);
      f.armL.rotation.x += (armL - f.armL.rotation.x) * Math.min(1, dt * 8);
      if (face) {
        const want = Math.atan2(-(face.x - root.position.x), -(face.z - root.position.z));
        let diff = want - root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        root.rotation.set(0, root.rotation.y + diff * Math.min(1, dt * 5), 0);
      }
      setFigureOpacity(f, e.alpha * a.gate, a.glow, t);
    }

    // Des poussières dorées montent tout autour de la scène.
    if (e.alpha > 0.05 && Math.random() < dt * (e.real ? 10 : 22)) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 260;
      this.sparkles.spawn({ x: ox + e.center.x + Math.cos(a) * r, y: fy + Math.random() * 40, z: oz + e.center.z + Math.sin(a) * r, vy: 30 + Math.random() * 50, vx: (Math.random() - 0.5) * 20, life: 3 + Math.random() * 2, gravity: -8, drag: 0.1, twinkle: true, size: 0.75, color: e.real ? 0xfff0c8 : 0xffd078 });
    }
  }

  private updateStory(dt: number): void {
    for (const v of this.views) {
      if (!v.visible || !v.dustMessage) continue;
      // Le message s'efface à mesure que la pièce est propre.
      const c = v.sim.cleanliness;
      (v.dustMessage.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - c / 0.55);
    }
    for (const v of this.views) {
      if (!v.visible) continue;
      const c = v.sim.cleanliness;
      // Le voile gris s'en va avec la poussière ; les toiles tombent à mi-chemin.
      if (v.grime) {
        const a = Math.pow(Math.max(0, 1 - c / 0.92), 1.3);
        (v.grime.material as THREE.MeshBasicMaterial).opacity = a;
        v.grime.visible = a > 0.01;
      }
      if (v.webs) {
        const a = Math.max(0, 1 - c / 0.7) * 0.85;
        for (const w of v.webs) {
          (w.material as THREE.MeshBasicMaterial).opacity = a;
          w.visible = a > 0.01;
        }
      }
    }
    for (const g of this.souvenirViews.values()) {
      const u = g.userData as { float: THREE.Group; ring: THREE.Mesh; outer: THREE.Mesh; inner: THREE.Mesh; room: number };
      u.float.position.y = u.float.userData.base + Math.sin(this.time * 2 + g.id) * 9;
      u.float.rotation.y += dt;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + g.id);
      u.ring.scale.setScalar(0.85 + pulse * 0.3);
      (u.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * (1 - pulse);
      u.outer.rotation.y += dt * 0.4;
      (u.outer.material as THREE.MeshBasicMaterial).opacity = 0.13 + 0.05 * Math.sin(this.time * 1.7 + g.id);
      // Des grains de lumière montent le long du rayon.
      const v = this.views[u.room];
      if (v?.visible && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 30;
        this.sparkles.spawn({ x: v.def.origin.x + g.position.x + Math.cos(a) * r, y: v.def.floorY + 10, z: v.def.origin.z + g.position.z + Math.sin(a) * r, vy: 60 + Math.random() * 80, life: 2.5 + Math.random() * 1.5, gravity: -10, drag: 0.1, twinkle: true, size: 0.7 });
      }
    }
    if (this.bonusView) this.bonusView.position.y = this.bonusView.userData.base + Math.abs(Math.sin(this.time * 4)) * 14;
    this.updateEcho(dt);
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
      // Plus large et plus profonde, mais pas trop haute (sinon le manche crève le plafond).
      const ky = 1 + (k - 1) * 0.5;
      pan.obj.scale.set(sx * k * (1 + b * 0.1 + pan.bounce * 0.06), ky * (1 - b * 0.12 + pan.bounce * 0.1), k * (1 + b * 0.08));
      // Le dos de la pelle reste contre le mur (l'origine est la bouche, 18 cm devant le dos).
      pan.obj.position.copy(pan.home).addScaledVector(pan.back, -(k - 1) * 18);
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
    // La brosse qui pousse beaucoup de poussière soulève un petit nuage.
    if (sim && broom.pressed && (this.tool === 'broom' || this.tool === 'widebroom')) {
      const pushed = sim.broomPushed;
      if (pushed > 3 && Math.random() < Math.min(0.9, pushed / 40) * dt * 30) {
        const w = sim.toolWidth(this.tool === 'widebroom' ? 'widebroom' : 'broom');
        const side = (Math.random() - 0.5) * w;
        this.sparkles.spawn({ x: broom.x + Math.cos(yaw) * side, y: broom.y + 8, z: broom.z - Math.sin(yaw) * side, vx: -Math.sin(yaw) * 40 + (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 45, vz: -Math.cos(yaw) * 40 + (Math.random() - 0.5) * 30, life: 0.8 + Math.random() * 0.5, gravity: -8, drag: 1.8, size: 1.4 + Math.random(), color: REALISTIC ? 0x5a5650 : 0x7a7080 });
      }
    }

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

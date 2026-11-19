import React, { useEffect, useImperativeHandle, useRef } from 'react';
import {
  ASSET_PATHS,
  CHEST_TIER_META,
  DUNGEONS,
  ELEMENT_META,
  MANTLES,
  MAPS,
  MOUNTS,
  MOUNT_ILLUSIONS,
  QUALITY_META,
  SECTS,
  TITLES,
  WORLD_BOSSES,
} from '../game/data';
import { generateEquipment, getCharacterRealm, getElementMultiplier } from '../game/engine';
import { CombatEffectPools } from '../game/effectPool';
import {
  createHeroAtlasWarmup,
  createMonsterAtlasWarmup,
  createMountAtlasWarmup,
  drawDynamicLightPool,
  drawDynamicShadow,
  drawFiveElementSkillVfx,
  drawPixelHero,
  drawPixelMonster,
  drawPixelMount,
  preloadBattleSpriteAtlases,
} from '../game/pixelRenderer';
import { soundEngine } from '../game/sound';
import {
  BattleSpriteAtlasHub,
  MonsterArchetype,
  SpriteAnimMachine,
  createAnimMachine,
  inferWeaponKind,
  resolveMonsterArchetype,
  spriteAtlas,
} from '../game/spriteAtlas';
import {
  BattleContext,
  BattleResultSummary,
  ChestTier,
  ComputedStats,
  ElementType,
  EquipSlot,
  EquipmentItem,
  GuildInfo,
  ItemQuality,
  MountDef,
  MountIllusionDef,
  PkMode,
  PlayerState,
  ResourceTerritory,
  SectId,
  SiegeCity,
  SimulatedMaster,
  SkillDef,
  WeatherType,
} from '../game/types';

export interface RadarDot {
  x: number; // 0..1
  y: number; // 0..1
  kind: 'mob' | 'boss' | 'rival' | 'ally' | 'chest';
}

export interface HudTargetSnapshot {
  name: string;
  title?: string;
  hp: number;
  maxHp: number;
  element: ElementType;
  kind: 'mob' | 'elite' | 'boss' | 'rival' | 'ally_npc' | 'enemy_npc' | 'gate' | 'pillar' | 'banner' | 'wanderer';
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  shield: number;
  cooldowns: number[]; // remaining seconds for skills 0..3
  dashCooldown: number;
  objectiveLabel: string;
  objectiveProgress: number; // 0..1
  timerSec: number | null;
  playerCoord?: { x: number; y: number };
  playerNorm?: { x: number; y: number };
  radarDots?: RadarDot[];
  target?: HudTargetSnapshot | null;
}

export interface BattleCanvasHandle {
  castSkill: (skillIndex: number) => void;
  useDash: () => void;
  usePotion: () => boolean;
}

interface BattleCanvasProps {
  player: PlayerState;
  stats: ComputedStats;
  guild: GuildInfo | null;
  battle: BattleContext;
  cities: SiegeCity[];
  territories: ResourceTerritory[];
  masters: SimulatedMaster[];
  weather: WeatherType;
  autoBattle: boolean;
  paused: boolean;
  onHudUpdate: (snap: HudSnapshot) => void;
  onWildKill: (payload: {
    exp: number;
    silver: number;
    stones: number;
    item?: EquipmentItem;
    mobName: string;
  }) => void;
  onPkKill: (payload: {
    victimName: string;
    victimSect: SectId;
    silver: number;
    merit: number;
    stones: number;
    item?: EquipmentItem;
  }) => void;
  onWildPlayerDefeated: (payload: { killerName: string; byPlayer: boolean }) => void;
  onBattleComplete: (result: BattleResultSummary) => void;
  onPotionConsumed: () => void;
  onCollectChest: (tier: ChestTier, mobName: string, openImmediately: boolean) => void;
}

interface Unit {
  id: string;
  name: string;
  title?: string;
  guildTag?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  element: ElementType;
  color: string;
  accentColor: string;
  team: 'ally' | 'enemy' | 'neutral';
  kind: 'mob' | 'elite' | 'boss' | 'rival' | 'ally_npc' | 'enemy_npc' | 'gate' | 'pillar' | 'banner' | 'wanderer';
  speed: number;
  attackCd: number;
  attackRange: number;
  hitFlash: number;
  slowTimer: number;
  stunTimer: number;
  poisonTimer: number;
  poisonDps: number;
  mantleId?: number;
  masterSect?: SectId;
  aggro?: boolean;
  patrolX?: number;
  patrolY?: number;
  // Telegraphing for bosses/rivals
  telegraphTimer: number;
  telegraphMax: number;
  telegraphX: number;
  telegraphY: number;
  telegraphRadius: number;
  expReward?: number;
  silverReward?: number;
  facing: number;
  // Pixel Art HD Animation & Visual Behavior (#5, #6, #7)
  archetype?: MonsterArchetype;
  attackTimer?: number;
  attackMax?: number;
  alertTimer?: number;
  roarTimer?: number;
  enraged?: boolean;
  knockbackX?: number;
  knockbackY?: number;
  isMoving?: boolean;
  spottedPlayer?: boolean;
  patrolWait?: number;
  anim?: SpriteAnimMachine;
}

interface DyingUnit {
  dyingId: string;
  unit: Unit;
  progress: number;
  maxDuration: number;
}

interface LootOrb {
  x: number;
  y: number;
  color: string;
  label: string;
  life: number;
  quality?: ItemQuality;
  slot?: EquipSlot | 'stone';
  itemName?: string;
  sectId?: SectId;
  age?: number;
}

interface FieldChest {
  id: string;
  x: number;
  y: number;
  tier: ChestTier;
  sourceName: string;
  age: number;
  bounce: number;
}

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface SnowFlake {
  x: number;
  y: number;
  r: number;
  vy: number;
  driftAmp: number;
  driftPhase: number;
  alpha: number;
}

interface MistBank {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  alpha: number;
}

interface WindStreak {
  x: number;
  y: number;
  len: number;
  speed: number;
  color: string;
  alpha: number;
}

type ComboMultiplier = 1 | 2 | 3 | 5;

interface ComboTierSpec {
  mult: ComboMultiplier;
  damageBonus: number;
  label: string;
  bonusText: string;
  primary: string;
  accent: string;
  glow: string;
  windowSec: number;
}

interface ComboState {
  count: number;
  tier: ComboMultiplier;
  bestCount: number;
  totalDamage: number;
  timer: number;
  maxTimer: number;
  popScale: number;
  tierFlash: number;
  breakTimer: number;
  brokenCount: number;
  brokenTier: ComboMultiplier;
  brokenByHit: boolean;
}

function resolveComboTier(hits: number): ComboTierSpec {
  if (hits >= 25) {
    return {
      mult: 5,
      damageBonus: 2.15,
      label: 'VÔ SONG BÁ CHỦ',
      bonusText: '+115% ST',
      primary: '#EF4444',
      accent: '#FEF08A',
      glow: 'rgba(239, 68, 68, 0.92)',
      windowSec: 3.3,
    };
  }
  if (hits >= 12) {
    return {
      mult: 3,
      damageBonus: 1.62,
      label: 'PHÁ QUÂN LIÊN KÍCH',
      bonusText: '+62% ST',
      primary: '#FB923C',
      accent: '#FDE047',
      glow: 'rgba(249, 115, 22, 0.85)',
      windowSec: 3.6,
    };
  }
  if (hits >= 5) {
    return {
      mult: 2,
      damageBonus: 1.28,
      label: 'LIÊN HOÀN TRẢM',
      bonusText: '+28% ST',
      primary: '#F5D061',
      accent: '#FFFBEB',
      glow: 'rgba(245, 208, 97, 0.78)',
      windowSec: 3.9,
    };
  }
  return {
    mult: 1,
    damageBonus: 1.0,
    label: 'LIÊN KÍCH',
    bonusText: 'TÍCH LŨY',
    primary: '#DCE7EE',
    accent: '#94A3B8',
    glow: 'rgba(186, 212, 228, 0.5)',
    windowSec: 4.1,
  };
}

export const BattleCanvas = React.forwardRef<BattleCanvasHandle, BattleCanvasProps>(
  function BattleCanvas(props, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;

    // Imperative queue for React UI buttons -> 60fps loop
    const pendingActionsRef = useRef<{
      castIndex: number | null;
      dash: boolean;
      potion: boolean;
    }>({ castIndex: null, dash: false, potion: false });

    const playerRuntimeRef = useRef({
      x: 340,
      y: 300,
      hp: props.stats.maxHp,
      mp: props.stats.maxMp,
      shield: 0,
      facing: 0,
      cooldowns: [0, 0, 0, 0],
      dashCd: 0,
      dashTimer: 0,
      hitFlash: 0,
      animPhase: 0,
      attackTimer: 0,
      attackMax: 0.34,
      castTimer: 0,
      castMax: 0.45,
      isMoving: false,
      isRunning: false,
      deathTimer: 0,
      moveTarget: null as { x: number; y: number } | null,
      targetUnitId: null as string | null,
      anim: createAnimMachine(0, 'idle'),
    });

    useImperativeHandle(ref, () => ({
      castSkill(idx: number) {
        pendingActionsRef.current.castIndex = idx;
      },
      useDash() {
        pendingActionsRef.current.dash = true;
      },
      usePotion() {
        if (propsRef.current.player.potions <= 0) return false;
        pendingActionsRef.current.potion = true;
        return true;
      },
    }));

    // Reset arena entities whenever battle context or map changes
    const battleKey = `${props.battle.mode}_${props.battle.bossId ?? ''}_${props.battle.dungeonId ?? ''}_${props.battle.dungeonFloor ?? ''}_${props.battle.arenaOpponent?.id ?? ''}_${props.battle.siegeCityId ?? ''}_${props.battle.guildWarTerritoryId ?? ''}_${props.player.currentMapId}`;

    // Warm up updated hero/mount 8-dir Sprite Atlas sheets whenever gear or mount changes
    const heroVisualKey = `${props.player.sect}_${props.player.mantleId}_${props.player.level}_${props.player.isMounted ? 1 : 0}_${props.player.activeMountId ?? ''}_${props.player.activeMountIllusionId ?? ''}_${props.player.equipment.weapon?.id ?? ''}_${props.player.equipment.weapon?.enhance ?? 0}_${props.player.equipment.armor?.id ?? ''}_${props.player.equipment.boots?.id ?? ''}_${props.player.equipment.bracer?.id ?? ''}_${props.player.equipment.jade?.id ?? ''}`;
    useEffect(() => {
      const p = propsRef.current.player;
      const realm = getCharacterRealm(p);
      const mantle = MANTLES.find((m) => m.id === p.mantleId) || MANTLES[0];
      const mount =
        p.isMounted && p.activeMountId
          ? MOUNTS.find((m) => m.id === p.activeMountId) || null
          : null;
      const illusion =
        mount && p.activeMountIllusionId
          ? MOUNT_ILLUSIONS.find((x) => x.id === p.activeMountIllusionId) || null
          : null;
      const illusionStars = illusion ? p.mountIllusions?.[illusion.id] || 1 : 0;

      preloadBattleSpriteAtlases({
        heroParams: {
          sectId: p.sect,
          equipment: p.equipment,
          realmTier: realm.tier,
          mantleId: mantle.id,
          mantleColor: mantle.color,
          isMounted: Boolean(mount),
        },
        mount,
        illusion,
        illusionStars,
        monsters: [],
      });
    }, [heroVisualKey]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Load backdrop images once
      const wildImg = new Image();
      wildImg.src = ASSET_PATHS.arenaWild;
      const siegeImg = new Image();
      siegeImg.src = ASSET_PATHS.arenaSiege;

      let width = canvas.clientWidth || 1000;
      let height = canvas.clientHeight || 560;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        width = Math.max(480, Math.floor(rect.width));
        height = Math.max(320, Math.floor(rect.height));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      resize();
      window.addEventListener('resize', resize);

      // Preload Sprite Atlas assets for current map (#15)
      spriteAtlas.preloadMapAssets(propsRef.current.player.currentMapId);

      // Initialize runtime state for this battle
      const pr = playerRuntimeRef.current;
      const initStats = propsRef.current.stats;
      pr.x =
        propsRef.current.battle.mode === 'SIEGE' || propsRef.current.battle.mode === 'GUILD_WAR'
          ? Math.round(width * 0.22)
          : Math.round(width * 0.34);
      pr.y = Math.round(height * 0.56);
      pr.hp = initStats.maxHp;
      pr.mp = initStats.maxMp;
      pr.shield = 0;
      pr.cooldowns = [0, 0, 0, 0];
      pr.dashCd = 0;
      pr.dashTimer = 0;
      pr.attackTimer = 0;
      pr.castTimer = 0;
      pr.isMoving = false;
      pr.isRunning = false;
      pr.deathTimer = 0;
      pr.moveTarget = null;
      pr.targetUnitId = null;

      // Centralized Sprite Atlas & 8-Direction Animation Hub + Zero-GC Combat Object Pools
      const PLAYER_ENTITY_ID = '__player__';
      const atlasHub = new BattleSpriteAtlasHub();
      const effectPools = new CombatEffectPools<Unit>();
      pr.anim = atlasHub.register(PLAYER_ENTITY_ID, pr.facing, 'idle');

      const registerUnitInAtlasHub = (u: Unit): SpriteAnimMachine => {
        if (u.anim) return u.anim;
        let warmup: { signature: string; tasks: Array<() => void> } | undefined;
        if ((u.kind === 'wanderer' || u.kind === 'rival') && u.masterSect) {
          const mantleDef = MANTLES.find((m) => m.id === (u.mantleId || 0)) || MANTLES[0];
          warmup = createHeroAtlasWarmup({
            sectId: u.masterSect,
            realmTier: u.kind === 'rival' ? Math.max(2, u.mantleId || 2) : Math.max(1, u.mantleId || 1),
            mantleId: u.mantleId || 0,
            mantleColor: mantleDef.color,
            isMounted: false,
          });
        } else {
          const archetype = u.archetype || resolveMonsterArchetype(u.name, u.kind);
          warmup =
            createMonsterAtlasWarmup({
              archetype,
              color: u.color,
              accentColor: u.accentColor,
              isElite: u.kind === 'elite',
              enraged: Boolean(u.enraged),
            }) || undefined;
        }
        const machine = atlasHub.register(u.id, u.facing, 'idle', warmup);
        u.anim = machine;
        return machine;
      };

      let units: Unit[] = [];
      const dyingUnits: DyingUnit[] = [];
      const lootOrbs: LootOrb[] = [];
      const fieldChests: FieldChest[] = [];
      const ambientMotes: AmbientMote[] = [];

      for (let i = 0; i < 36; i++) {
        ambientMotes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: -14 + Math.random() * 28,
          vy: 10 + Math.random() * 24,
          size: 1.5 + Math.random() * 2.6,
          alpha: 0.25 + Math.random() * 0.45,
        });
      }

      // Dynamic Weather Particle Pools
      const rainDrops: RainDrop[] = Array.from({ length: 95 }, () => ({
        x: Math.random() * (width + 180),
        y: Math.random() * height,
        len: 14 + Math.random() * 14,
        speed: 520 + Math.random() * 220,
        alpha: 0.22 + Math.random() * 0.34,
      }));
      const snowFlakes: SnowFlake[] = Array.from({ length: 80 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1.4 + Math.random() * 3.1,
        vy: 34 + Math.random() * 44,
        driftAmp: 18 + Math.random() * 26,
        driftPhase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.52,
      }));
      const mistBanks: MistBank[] = Array.from({ length: 9 }, (_, idx) => ({
        x: (idx / 9) * (width + 360) - 180,
        y: height * (0.14 + (idx % 3) * 0.32) + (-25 + Math.random() * 50),
        rx: 170 + Math.random() * 140,
        ry: 58 + Math.random() * 42,
        vx: 14 + Math.random() * 18,
        alpha: 0.14 + Math.random() * 0.12,
      }));
      const windStreaks: WindStreak[] = Array.from({ length: 58 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        len: 26 + Math.random() * 48,
        speed: 260 + Math.random() * 220,
        color: Math.random() < 0.38 ? '#FB923C' : '#D6B896',
        alpha: 0.18 + Math.random() * 0.32,
      }));
      let lastWeather: WeatherType = propsRef.current.weather;
      let weatherFade = 1;
      let weatherClock = 0;
      let lightningFlash = 0;

      let hitstopTimer = 0;
      let shakeIntensity = 0;
      let battleFinished = false;
      let dungeonWave = 1;
      let battleTimer: number | null = null;
      let respawnTicker = 0;
      let hudSyncTimer = 0;
      let objectiveLabel = '';
      let objectiveProgress = 0;

      // Uninterrupted Combo Damage System (x2, x3, x5)
      const combo: ComboState = {
        count: 0,
        tier: 1,
        bestCount: 0,
        totalDamage: 0,
        timer: 0,
        maxTimer: 4.1,
        popScale: 1,
        tierFlash: 0,
        breakTimer: 0,
        brokenCount: 0,
        brokenTier: 1,
        brokenByHit: false,
      };

      const resetCombo = (interruptedByHit: boolean) => {
        if (combo.count >= 5) {
          combo.breakTimer = 0.95;
          combo.brokenCount = combo.count;
          combo.brokenTier = combo.tier;
          combo.brokenByHit = interruptedByHit;
          if (interruptedByHit) {
            addFloatText(pr.x, pr.y - 44, `BỊ NGẮT COMBO (${combo.count}x)!`, '#F87171', 1.08);
          }
        }
        combo.count = 0;
        combo.tier = 1;
        combo.totalDamage = 0;
        combo.timer = 0;
        combo.popScale = 1;
        combo.tierFlash = 0;
      };

      const addParticles = (x: number, y: number, color: string, count: number, speed = 130) => {
        effectPools.spawnBurst(x, y, color, count, speed);
      };

      const addFloatText = (x: number, y: number, text: string, color: string, scale = 1) => {
        const safeX = Math.max(85, Math.min(width - 135, x + (-14 + Math.random() * 28)));
        const safeY = Math.max(108, Math.min(height - 112, y));
        effectPools.spawnFloatText(safeX, safeY, text, color, scale, 0.95);
      };

      const addCritFloatText = (
        x: number,
        y: number,
        damageText: string,
        headerText = 'CHÍ MẠNG!',
        scale = 1.58,
        critTint: 'gold' | 'crimson_gold' = 'gold'
      ) => {
        const safeX = Math.max(105, Math.min(width - 145, x + (-10 + Math.random() * 20)));
        const safeY = Math.max(118, Math.min(height - 125, y));
        effectPools.spawnCritFloatText(safeX, safeY, damageText, headerText, scale, critTint, 1.24);
      };

      const clampArena = (x: number, y: number, pad = 54) => ({
        x: Math.max(pad, Math.min(width - Math.max(pad, 108), x)),
        y: Math.max(114, Math.min(height - 114, y)),
      });

      const spawnWildMob = () => {
        const map =
          MAPS.find((m) => m.id === propsRef.current.player.currentMapId) || MAPS[0];
        const mobPool = map.mobs;
        const pick =
          Math.random() < 0.18
            ? mobPool[mobPool.length - 1]
            : mobPool[Math.floor(Math.random() * (mobPool.length - 1))];
        const side = Math.random() < 0.5 ? 1 : -1;
        const pos = clampArena(
          width * 0.46 + side * (90 + Math.random() * (width * 0.25)),
          135 + Math.random() * Math.max(80, height - 270)
        );
        units.push({
          id: `mob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: pick.name,
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          radius: pick.isElite ? 22 : 17,
          hp: pick.hp,
          maxHp: pick.hp,
          atk: pick.atk,
          def: pick.def,
          element: map.element,
          color: pick.color,
          accentColor: '#FDE68A',
          team: 'enemy',
          kind: pick.isElite ? 'elite' : 'mob',
          speed: pick.isElite ? 68 : 76,
          attackCd: 0.6 + Math.random() * 0.6,
          attackRange: 52,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          expReward: pick.exp,
          silverReward: pick.silver,
          facing: Math.PI,
          archetype: resolveMonsterArchetype(pick.name, pick.isElite ? 'elite' : 'mob'),
          patrolX: pos.x + (-75 + Math.random() * 150),
          patrolY: pos.y + (-55 + Math.random() * 110),
          patrolWait: 0.4 + Math.random() * 1.2,
          spottedPlayer: false,
        });
      };

      const spawnWildWanderer = () => {
        const map = MAPS.find((m) => m.id === propsRef.current.player.currentMapId) || MAPS[0];
        if (map.isSafeZone) return;
        const activeNames = new Set(units.filter((u) => u.kind === 'wanderer').map((u) => u.name));
        const pool = propsRef.current.masters.filter((m) => !activeNames.has(m.name));
        if (pool.length === 0) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const mSect = SECTS[pick.sect];
        const refMob = map.mobs[map.mobs.length - 1] || map.mobs[0];
        const hp = Math.round(refMob.hp * 1.65);
        const atk = Math.round(refMob.atk * 1.28);
        const def = Math.round(refMob.def * 1.12);
        const pos = clampArena(
          150 + Math.random() * Math.max(120, width - 380),
          140 + Math.random() * Math.max(80, height - 280)
        );
        units.push({
          id: `wanderer_${pick.id}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: pick.name,
          title: `${mSect.name} · ${pick.guildName}`,
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          radius: 19,
          hp,
          maxHp: hp,
          atk,
          def,
          element: mSect.element,
          color: mSect.color,
          accentColor: '#FDE68A',
          team: 'neutral',
          kind: 'wanderer',
          speed: 78,
          attackCd: 0.9,
          attackRange: pick.sect === 'duong_mon' || pick.sect === 'nga_mi' ? 165 : 74,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          mantleId: pick.mantleId,
          masterSect: pick.sect,
          aggro: false,
          patrolX: 150 + Math.random() * Math.max(120, width - 380),
          patrolY: 140 + Math.random() * Math.max(80, height - 280),
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          silverReward: Math.round(refMob.silver * 3.2),
          facing: Math.PI,
        });
      };

      const isUnitHostileToPlayer = (u: Unit): boolean => {
        if (u.hp <= 0) return false;
        if (u.team === 'enemy') return true;
        if (u.kind === 'wanderer') {
          if (u.aggro) return true;
          if (propsRef.current.battle.mode === 'WILD') {
            const curMap =
              MAPS.find((m) => m.id === propsRef.current.player.currentMapId) || MAPS[0];
            if (!curMap.isSafeZone && propsRef.current.player.pkMode === 'slaughter') {
              return true;
            }
          }
        }
        return false;
      };

      const setupDungeonWave = (waveNum: number) => {
        const dId = propsRef.current.battle.dungeonId || 'tang_kiem';
        const floor = propsRef.current.battle.dungeonFloor || 1;
        const dungeon = DUNGEONS.find((d) => d.id === dId) || DUNGEONS[0];
        const scale = Math.pow(1.24, floor - 1);
        const baseHp = Math.round(dungeon.basePower * 0.55 * scale);
        const baseAtk = Math.round(dungeon.basePower * 0.068 * scale);
        const baseDef = Math.round(dungeon.basePower * 0.025 * scale);

        if (waveNum <= 2) {
          objectiveLabel = `${dungeon.name} · Tầng ${floor} (Đợt ${waveNum}/3)`;
          for (let i = 0; i < 4; i++) {
            const pos = clampArena(width * 0.64 + (i % 2) * 95, height * 0.34 + Math.floor(i / 2) * 140);
            units.push({
              id: `d_mob_${waveNum}_${i}`,
              name: `${dungeon.name.split(' ')[0]} Hộ Vệ`,
              x: pos.x,
              y: pos.y,
              vx: 0,
              vy: 0,
              radius: 18,
              hp: baseHp,
              maxHp: baseHp,
              atk: baseAtk,
              def: baseDef,
              element: dungeon.element,
              color: ELEMENT_META[dungeon.element].color,
              accentColor: '#FDE68A',
              team: 'enemy',
              kind: 'mob',
              speed: 80,
              attackCd: 0.9,
              attackRange: 54,
              hitFlash: 0,
              slowTimer: 0,
              stunTimer: 0,
              poisonTimer: 0,
              poisonDps: 0,
              telegraphTimer: 0,
              telegraphMax: 0,
              telegraphX: 0,
              telegraphY: 0,
              telegraphRadius: 0,
              facing: Math.PI,
            });
          }
        } else {
          const bossName = dungeon.bossNames[Math.min(dungeon.bossNames.length - 1, Math.floor((floor - 1) / 2))];
          objectiveLabel = `${dungeon.name} · Thủ Lĩnh Tầng ${floor}: ${bossName}`;
          soundEngine.playWarDrum();
          units.push({
            id: `d_boss_${floor}`,
            name: bossName,
            title: `Thủ Lĩnh Tầng ${floor}`,
            x: width * 0.72,
            y: height * 0.54,
            vx: 0,
            vy: 0,
            radius: 28,
            hp: Math.round(baseHp * 3.1),
            maxHp: Math.round(baseHp * 3.1),
            atk: Math.round(baseAtk * 1.45),
            def: Math.round(baseDef * 1.2),
            element: dungeon.element,
            color: '#F59E0B',
            accentColor: '#DC2626',
            team: 'enemy',
            kind: 'boss',
            speed: 74,
            attackCd: 1.2,
            attackRange: 72,
            hitFlash: 0,
            slowTimer: 0,
            stunTimer: 0,
            poisonTimer: 0,
            poisonDps: 0,
            telegraphTimer: 0,
            telegraphMax: 0,
            telegraphX: 0,
            telegraphY: 0,
            telegraphRadius: 0,
            facing: Math.PI,
            archetype: resolveMonsterArchetype(bossName, 'boss'),
            roarTimer: 0.85,
            enraged: false,
            spottedPlayer: true,
          });
        }
      };

      const spawnSiegeNpc = (team: 'ally' | 'enemy', city: SiegeCity) => {
        const isAlly = team === 'ally';
        const pStats = propsRef.current.stats;
        const hp = isAlly
          ? Math.round(pStats.maxHp * 0.65)
          : Math.round(city.enemyWavePower * 0.42);
        const atk = isAlly
          ? Math.round(pStats.atk * 0.55)
          : Math.round(city.enemyWavePower * 0.048);
        const def = isAlly
          ? Math.round(pStats.def * 0.55)
          : Math.round(city.enemyWavePower * 0.02);
        const allyNames = ['Hộ Pháp Bang Ta', 'Tiên Phong Kiếm Sĩ', 'Đệ Tử Tinh Nhuệ', 'Chưởng Pháp Đường'];
        const enemyNames = ['Thủ Thành Thiết Kỵ', 'Cấm Vệ Thành Chủ', 'Huyết Sát Thủ Vệ', 'Cung Thủ Thành Lầu'];
        const nameList = isAlly ? allyNames : enemyNames;
        units.push({
          id: `siege_${team}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: nameList[Math.floor(Math.random() * nameList.length)],
          x: isAlly ? 95 + Math.random() * 80 : width - 190 - Math.random() * 80,
          y: 120 + Math.random() * (height - 220),
          vx: 0,
          vy: 0,
          radius: 15,
          hp,
          maxHp: hp,
          atk,
          def,
          element: isAlly ? 'kim' : 'hoa',
          color: isAlly ? '#60A5FA' : '#EF4444',
          accentColor: isAlly ? '#FDE68A' : '#FCA5A5',
          team,
          kind: isAlly ? 'ally_npc' : 'enemy_npc',
          speed: 86,
          attackCd: 0.7 + Math.random() * 0.5,
          attackRange: 50,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: isAlly ? 0 : Math.PI,
        });
      };

      const spawnGuildWarNpc = (team: 'ally' | 'enemy', territory: ResourceTerritory) => {
        const isAlly = team === 'ally';
        const pStats = propsRef.current.stats;
        const hp = isAlly
          ? Math.round(pStats.maxHp * 0.62)
          : Math.round(territory.enemyWavePower * 0.44);
        const atk = isAlly
          ? Math.round(pStats.atk * 0.54)
          : Math.round(territory.enemyWavePower * 0.046);
        const def = isAlly
          ? Math.round(pStats.def * 0.52)
          : Math.round(territory.enemyWavePower * 0.02);
        const allyNames = ['Tinh Anh Bang Ta', 'Đường Chủ Tiên Phong', 'Kiếm Khách Hộ Kỳ', 'Đệ Tử Xung Kích'];
        const enemyNames = ['Đệ Tử Hộ Mỏ', 'Tinh Anh Thủ Kỳ', 'Trưởng Lão Bang Địch', 'Du Kỵ Bang Địch'];
        const nameList = isAlly ? allyNames : enemyNames;
        units.push({
          id: `gw_${team}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: nameList[Math.floor(Math.random() * nameList.length)],
          x: isAlly ? 95 + Math.random() * 75 : width - 175 - Math.random() * 85,
          y: 120 + Math.random() * (height - 220),
          vx: 0,
          vy: 0,
          radius: 15,
          hp,
          maxHp: hp,
          atk,
          def,
          element: isAlly ? SECTS[propsRef.current.player.sect].element : territory.element,
          color: isAlly ? '#60A5FA' : ELEMENT_META[territory.element].color,
          accentColor: isAlly ? '#FDE68A' : '#FCA5A5',
          team,
          kind: isAlly ? 'ally_npc' : 'enemy_npc',
          speed: 88,
          attackCd: 0.7 + Math.random() * 0.5,
          attackRange: 52,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: isAlly ? 0 : Math.PI,
        });
      };

      // Populate initial arena based on mode
      const mode = propsRef.current.battle.mode;
      if (mode === 'WILD') {
        const map = MAPS.find((m) => m.id === propsRef.current.player.currentMapId) || MAPS[0];
        objectiveLabel = map.isSafeZone
          ? `Luyện Công · ${map.name} (Khu An Toàn)`
          : `Luyện Công · ${map.name} (Ngoài Thành · PK)`;
        for (let i = 0; i < 6; i++) spawnWildMob();
        if (!map.isSafeZone) {
          spawnWildWanderer();
          spawnWildWanderer();
        }
      } else if (mode === 'BOSS') {
        const boss =
          WORLD_BOSSES.find((b) => b.id === propsRef.current.battle.bossId) || WORLD_BOSSES[0];
        objectiveLabel = `Boss Hoàng Kim · ${boss.name} (${boss.title})`;
        battleTimer = 120;
        soundEngine.playWarDrum();
        units.push({
          id: `boss_${boss.id}`,
          name: boss.name,
          title: `Boss Hoàng Kim · Lv.${boss.level}`,
          x: width * 0.7,
          y: height * 0.54,
          vx: 0,
          vy: 0,
          radius: 32,
          hp: boss.hp,
          maxHp: boss.hp,
          atk: boss.atk,
          def: boss.def,
          element: boss.element,
          color: boss.color,
          accentColor: '#DC2626',
          team: 'enemy',
          kind: 'boss',
          speed: 78,
          attackCd: 1.0,
          attackRange: 76,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: Math.PI,
          archetype: resolveMonsterArchetype(boss.name, 'boss'),
          roarTimer: 0.95,
          enraged: false,
          spottedPlayer: true,
        });
      } else if (mode === 'DUNGEON') {
        battleTimer = 110;
        setupDungeonWave(1);
      } else if (mode === 'ARENA') {
        const rival = propsRef.current.battle.arenaOpponent;
        if (rival) {
          const rivalSect = SECTS[rival.sect];
          objectiveLabel = `Lôi Đài 1v1 · Đấu với ${rival.name} (Hạng ${rival.rank})`;
          battleTimer = 90;
          soundEngine.playWarDrum();
          const rivalHp = Math.round(rival.power * 0.85 + 650);
          const rivalAtk = Math.round(rival.power * 0.088 + 55);
          const rivalDef = Math.round(rival.power * 0.04 + 25);
          units.push({
            id: `rival_${rival.id}`,
            name: rival.name,
            title: rival.titleName,
            guildTag: rival.guildName,
            x: width * 0.72,
            y: height * 0.56,
            vx: 0,
            vy: 0,
            radius: 21,
            hp: rivalHp,
            maxHp: rivalHp,
            atk: rivalAtk,
            def: rivalDef,
            element: rivalSect.element,
            color: rivalSect.color,
            accentColor: '#FDE68A',
            team: 'enemy',
            kind: 'rival',
            speed: 105,
            attackCd: 0.9,
            attackRange: rivalSect.id === 'duong_mon' || rivalSect.id === 'nga_mi' ? 210 : 95,
            hitFlash: 0,
            slowTimer: 0,
            stunTimer: 0,
            poisonTimer: 0,
            poisonDps: 0,
            mantleId: rival.mantleId,
            masterSect: rival.sect,
            telegraphTimer: 0,
            telegraphMax: 0,
            telegraphX: 0,
            telegraphY: 0,
            telegraphRadius: 0,
            facing: Math.PI,
            spottedPlayer: true,
          });
        }
      } else if (mode === 'SIEGE') {
        const city =
          propsRef.current.cities.find((c) => c.id === propsRef.current.battle.siegeCityId) ||
          propsRef.current.cities[0];
        battleTimer = 95;
        objectiveLabel = `Công Thành Chiến ${city.name} · Giai đoạn 1: Phá Cổng Thành`;
        soundEngine.playWarDrum();

        // City Gate (Phase 1 objective)
        units.push({
          id: 'siege_gate',
          name: `Cổng Thành ${city.name}`,
          title: city.defenderGuild,
          x: width - 195,
          y: height * 0.54,
          vx: 0,
          vy: 0,
          radius: 36,
          hp: city.gateHp,
          maxHp: city.gateHp,
          atk: 0,
          def: 90,
          element: 'tho',
          color: '#B45309',
          accentColor: '#F5D061',
          team: 'enemy',
          kind: 'gate',
          speed: 0,
          attackCd: 999,
          attackRange: 0,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: Math.PI,
        });

        // Dragon Pillar (Phase 2 objective, guarded behind gate)
        units.push({
          id: 'siege_pillar',
          name: 'Long Trụ Hoàng Thành',
          title: 'Đập vỡ cổng để chiếm',
          x: width - 85,
          y: height * 0.54,
          vx: 0,
          vy: 0,
          radius: 32,
          hp: city.pillarHp,
          maxHp: city.pillarHp,
          atk: 0,
          def: 110,
          element: 'kim',
          color: '#F5D061',
          accentColor: '#DC2626',
          team: 'enemy',
          kind: 'pillar',
          speed: 0,
          attackCd: 999,
          attackRange: 0,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: Math.PI,
        });

        for (let i = 0; i < 5; i++) spawnSiegeNpc('ally', city);
        for (let i = 0; i < 5; i++) spawnSiegeNpc('enemy', city);
      } else if (mode === 'GUILD_WAR') {
        const territory =
          propsRef.current.territories.find(
            (t) => t.id === propsRef.current.battle.guildWarTerritoryId
          ) || propsRef.current.territories[0];
        battleTimer = 80;
        objectiveLabel = `Bang Hội Chiến · ${territory.name} (Hạ Chiến Kỳ ${territory.defenderGuildName})`;
        soundEngine.playWarDrum();

        // Enemy Guild War Banner (Main Objective)
        units.push({
          id: 'gw_banner',
          name: `Chiến Kỳ ${territory.defenderGuildName}`,
          title: territory.name,
          x: width - 110,
          y: height * 0.54,
          vx: 0,
          vy: 0,
          radius: 30,
          hp: territory.bannerHp,
          maxHp: territory.bannerHp,
          atk: 0,
          def: 85,
          element: territory.element,
          color: '#DC2626',
          accentColor: '#F5D061',
          team: 'enemy',
          kind: 'banner',
          speed: 0,
          attackCd: 999,
          attackRange: 0,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: Math.PI,
        });

        // Defending Guild Leader
        units.push({
          id: 'gw_leader',
          name: territory.defenderLeader,
          title: `Bang Chủ ${territory.defenderGuildName}`,
          x: width - 210,
          y: height * 0.54,
          vx: 0,
          vy: 0,
          radius: 23,
          hp: Math.round(territory.enemyWavePower * 1.45),
          maxHp: Math.round(territory.enemyWavePower * 1.45),
          atk: Math.round(territory.enemyWavePower * 0.075),
          def: Math.round(territory.enemyWavePower * 0.032),
          element: territory.element,
          color: ELEMENT_META[territory.element].color,
          accentColor: '#F5D061',
          team: 'enemy',
          kind: 'rival',
          speed: 82,
          attackCd: 1.0,
          attackRange: 76,
          hitFlash: 0,
          slowTimer: 0,
          stunTimer: 0,
          poisonTimer: 0,
          poisonDps: 0,
          mantleId: 3,
          masterSect:
            territory.element === 'kim'
              ? 'thieu_lam'
              : territory.element === 'moc'
              ? 'duong_mon'
              : territory.element === 'thuy'
              ? 'nga_mi'
              : territory.element === 'hoa'
              ? 'cai_bang'
              : 'vo_dang',
          telegraphTimer: 0,
          telegraphMax: 0,
          telegraphX: 0,
          telegraphY: 0,
          telegraphRadius: 0,
          facing: Math.PI,
          spottedPlayer: true,
        });

        for (let i = 0; i < 4; i++) spawnGuildWarNpc('ally', territory);
        for (let i = 0; i < 4; i++) spawnGuildWarNpc('enemy', territory);
      }

      // Register all initial units into centralized BattleSpriteAtlasHub & trigger boss intro roars
      for (const u of units) {
        registerUnitInAtlasHub(u);
        if (u.roarTimer && u.roarTimer > 0) {
          atlasHub.trigger(u.id, 'roar', { durationSec: u.roarTimer, force: true });
        }
      }

      // Warm up player, active mount & all map mob pools through centralized BattleSpriteAtlasHub
      {
        const curPlayer = propsRef.current.player;
        const initRealm = getCharacterRealm(curPlayer);
        const initMantle = MANTLES.find((m) => m.id === curPlayer.mantleId) || MANTLES[0];
        const initMount =
          curPlayer.isMounted && curPlayer.activeMountId
            ? MOUNTS.find((m) => m.id === curPlayer.activeMountId) || null
            : null;
        const initIllusion =
          initMount && curPlayer.activeMountIllusionId
            ? MOUNT_ILLUSIONS.find((x) => x.id === curPlayer.activeMountIllusionId) || null
            : null;
        const initIllStars = initIllusion ? curPlayer.mountIllusions?.[initIllusion.id] || 1 : 0;

        const playerWarmup = createHeroAtlasWarmup({
          sectId: curPlayer.sect,
          equipment: curPlayer.equipment,
          realmTier: initRealm.tier,
          mantleId: initMantle.id,
          mantleColor: initMantle.color,
          isMounted: Boolean(initMount),
        });
        atlasHub.ensureWarmedUp(playerWarmup.signature, playerWarmup.tasks);

        if (initMount) {
          const mWarmup = createMountAtlasWarmup(initMount, initIllusion, initIllStars);
          atlasHub.ensureWarmedUp(mWarmup.signature, mWarmup.tasks);
        }

        if (mode === 'WILD') {
          const curMap = MAPS.find((m) => m.id === curPlayer.currentMapId) || MAPS[0];
          for (const mDef of curMap.mobs) {
            const mobWarmup = createMonsterAtlasWarmup({
              archetype: resolveMonsterArchetype(mDef.name, mDef.isElite ? 'elite' : 'mob'),
              color: mDef.color,
              accentColor: '#FDE68A',
              isElite: Boolean(mDef.isElite),
            });
            if (mobWarmup) atlasHub.ensureWarmedUp(mobWarmup.signature, mobWarmup.tasks);
          }
        }
      }

      // Keyboard & mouse listeners (held vs edge-triggered)
      const heldKeys = new Set<string>();
      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
          heldKeys.add(k);
        }
        if (k === '1') pendingActionsRef.current.castIndex = 0;
        if (k === '2') pendingActionsRef.current.castIndex = 1;
        if (k === '3') pendingActionsRef.current.castIndex = 2;
        if (k === '4') pendingActionsRef.current.castIndex = 3;
        if (e.code === 'Space') {
          e.preventDefault();
          pendingActionsRef.current.dash = true;
        }
        if (k === 'q') {
          pendingActionsRef.current.potion = true;
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        heldKeys.delete(e.key.toLowerCase());
      };
      const onBlur = () => {
        heldKeys.clear();
      };
      let lastAttackerName = 'Quái Vật Giang Hồ';
      let lastAttackerIsPlayer = false;
      let wandererRespawnTicker = 0;

      const onCanvasPointerDown = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // Check if clicking a dropped Treasure Chest on the battlefield
        const chestIdx = fieldChests.findIndex(
          (fc) => Math.hypot(fc.x - cx, fc.y - cy) <= 30
        );
        if (chestIdx >= 0) {
          const fc = fieldChests.splice(chestIdx, 1)[0];
          const meta = CHEST_TIER_META[fc.tier];
          addParticles(fc.x, fc.y, meta.color, 26, 210);
          addFloatText(fc.x, fc.y - 24, `Mở ${meta.shortName} Rương!`, meta.accentColor, 1.2);
          propsRef.current.onCollectChest(fc.tier, fc.sourceName, true);
          return;
        }

        // Check if clicking an enemy or PK-targetable unit
        const clickedEnemy = units.find(
          (u) => isUnitHostileToPlayer(u) && Math.hypot(u.x - cx, u.y - cy) <= u.radius + 16
        );
        if (clickedEnemy) {
          pr.targetUnitId = clickedEnemy.id;
          addParticles(clickedEnemy.x, clickedEnemy.y, '#F5D061', 6, 60);
        } else {
          pr.moveTarget = clampArena(cx, cy);
        }
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      canvas.addEventListener('pointerdown', onCanvasPointerDown);

      const damageUnit = (
        target: Unit,
        rawDamage: number,
        isCrit: boolean,
        attackerElement: ElementType,
        fromPlayer: boolean
      ) => {
        // In Siege, Long Trụ is protected until Cổng Thành falls
        if (target.kind === 'pillar' && units.some((u) => u.kind === 'gate' && u.hp > 0)) {
          if (fromPlayer) {
            addFloatText(target.x, target.y - 26, 'Phá Cổng Trước!', '#F5D061', 0.9);
          }
          return;
        }

        const elemMult = getElementMultiplier(attackerElement, target.element);
        const mitigated = Math.max(12, rawDamage * elemMult - target.def * 0.42);
        const variance = 0.93 + Math.random() * 0.14;
        const critMult = fromPlayer ? (propsRef.current.stats.critDamagePct || 172) / 100 : 1.72;

        // Advance uninterrupted player combo streak and resolve x2 / x3 / x5 damage amplification
        let activeComboTier: ComboTierSpec | null = null;
        if (fromPlayer) {
          const prevTier = combo.tier;
          combo.count += 1;
          if (combo.count > combo.bestCount) combo.bestCount = combo.count;
          activeComboTier = resolveComboTier(combo.count);
          combo.tier = activeComboTier.mult;
          combo.timer = activeComboTier.windowSec;
          combo.maxTimer = activeComboTier.windowSec;
          combo.breakTimer = 0;

          if (activeComboTier.mult > prevTier && activeComboTier.mult !== 1) {
            combo.popScale = 1.88;
            combo.tierFlash = 1.0;
            soundEngine.playComboTier(activeComboTier.mult);
            shakeIntensity = Math.max(
              shakeIntensity,
              activeComboTier.mult === 5 ? 8.5 : activeComboTier.mult === 3 ? 5.5 : 3.5
            );
            addFloatText(
              pr.x,
              pr.y - 50,
              `${activeComboTier.label} x${activeComboTier.mult}!`,
              activeComboTier.primary,
              activeComboTier.mult === 5 ? 1.4 : 1.24
            );
            effectPools.spawnRing({
              x: pr.x,
              y: pr.y,
              radius: 16,
              maxRadius: activeComboTier.mult === 5 ? 128 : activeComboTier.mult === 3 ? 98 : 76,
              color: activeComboTier.primary,
              accent: activeComboTier.accent,
              life: 0.45,
              maxLife: 0.45,
              kind: activeComboTier.mult === 5 ? 'dragon' : 'lotus',
              element: attackerElement,
            });
          } else {
            combo.popScale = Math.max(combo.popScale, 1.32);
          }
        }

        const comboDmgBonus = activeComboTier ? activeComboTier.damageBonus : 1.0;
        const finalDmg = Math.round(mitigated * variance * (isCrit ? critMult : 1) * comboDmgBonus);
        if (fromPlayer) {
          combo.totalDamage += finalDmg;
        }

        target.hp = Math.max(0, target.hp - finalDmg);
        target.hitFlash = 0.14;
        target.spottedPlayer = true;
        registerUnitInAtlasHub(target);
        atlasHub.trigger(target.id, 'hit', {
          durationSec: 0.22,
          hitFlashSec: 0.14,
        });

        // Visual Behavior: Knockback reaction on non-structures (#7)
        if (
          target.kind !== 'gate' &&
          target.kind !== 'pillar' &&
          target.kind !== 'banner'
        ) {
          const kbAngle = Math.atan2(target.y - pr.y, target.x - pr.x);
          const kbStrength = target.kind === 'boss' ? 42 : isCrit ? 155 : 95;
          target.knockbackX = Math.cos(kbAngle) * kbStrength;
          target.knockbackY = Math.sin(kbAngle) * kbStrength;
        }

        // Boss Enraged Phase Transition (< 50% HP) (#6)
        if (
          target.kind === 'boss' &&
          !target.enraged &&
          target.hp > 0 &&
          target.hp <= target.maxHp * 0.5
        ) {
          target.enraged = true;
          target.roarTimer = 0.9;
          const enragedWarmup = createMonsterAtlasWarmup({
            archetype: target.archetype || resolveMonsterArchetype(target.name, target.kind),
            color: target.color,
            accentColor: target.accentColor,
            isElite: false,
            enraged: true,
          });
          if (enragedWarmup) {
            atlasHub.ensureWarmedUp(enragedWarmup.signature, enragedWarmup.tasks);
          }
          atlasHub.trigger(target.id, 'roar', {
            durationSec: 0.72,
            force: true,
          });
          shakeIntensity = Math.max(shakeIntensity, 10);
          soundEngine.playWarDrum();
          addFloatText(target.x, target.y - target.radius - 26, 'BOSS CUỒNG BẠO!', '#EF4444', 1.35);
          effectPools.spawnRing({
            x: target.x,
            y: target.y,
            radius: 18,
            maxRadius: 120,
            color: '#DC2626',
            accent: '#FEF08A',
            life: 0.55,
            maxLife: 0.55,
            kind: 'dragon',
            element: target.element,
          });
        }

        // Provoke wandering player on PK hit
        if (target.kind === 'wanderer' && fromPlayer && !target.aggro) {
          target.aggro = true;
          target.team = 'enemy';
          addFloatText(target.x, target.y - target.radius - 26, 'Dám Đồ Sát Ta?!', '#F87171', 1.1);
        }

        if (fromPlayer) {
          const elemTag = elemMult > 1.05 ? ' · KHẮC HỆ' : '';
          const comboMult = activeComboTier ? activeComboTier.mult : 1;
          const comboTag = comboMult >= 2 ? ` x${comboMult}` : '';
          if (isCrit) {
            const critScale =
              1.62 + (comboMult === 5 ? 0.24 : comboMult === 3 ? 0.14 : comboMult === 2 ? 0.08 : 0);
            addCritFloatText(
              target.x,
              target.y - target.radius - 12,
              `-${finalDmg.toLocaleString('vi-VN')}${comboTag}`,
              `★ CHÍ MẠNG${elemTag}! ★`,
              critScale,
              'gold'
            );
            effectPools.spawnCritSplatter(target.x, target.y - 4, false);
            effectPools.spawnRing({
              x: target.x,
              y: target.y,
              radius: 8,
              maxRadius: 48 + (comboMult >= 3 ? 16 : 0),
              color: '#F5D061',
              accent: '#FFFFFF',
              life: 0.24,
              maxLife: 0.24,
              kind: 'ring',
              element: attackerElement,
            });
            hitstopTimer = Math.max(hitstopTimer, 0.048);
            shakeIntensity = Math.max(shakeIntensity, comboMult === 5 ? 7.5 : 6.0);
            soundEngine.playCrit();
          } else {
            const dmgColor =
              comboMult === 5
                ? '#FDBA74'
                : comboMult === 3
                ? '#FDE047'
                : elemMult > 1.05
                ? '#FDE047'
                : '#F8FAFC';
            const dmgScale =
              0.98 + (comboMult === 5 ? 0.16 : comboMult === 3 ? 0.09 : comboMult === 2 ? 0.04 : 0);
            addFloatText(
              target.x,
              target.y - target.radius - 6,
              `-${finalDmg.toLocaleString('vi-VN')}${comboTag}`,
              dmgColor,
              dmgScale
            );
            shakeIntensity = Math.max(shakeIntensity, comboMult >= 3 ? 2.8 : 2.0);
            addParticles(target.x, target.y, '#EF4444', 6, 110);
          }
        } else if (isCrit) {
          addCritFloatText(
            target.x,
            target.y - target.radius - 10,
            `-${finalDmg.toLocaleString('vi-VN')}`,
            'CHÍ MẠNG!',
            1.42,
            'gold'
          );
          effectPools.spawnCritSplatter(target.x, target.y - 4, false);
        } else {
          addParticles(target.x, target.y, '#EF4444', 5, 100);
        }
      };

      const damagePlayer = (
        rawDmg: number,
        attackerElement: ElementType,
        heavy = false,
        attackerName?: string,
        attackerIsPlayer = false,
        isCrit = false
      ) => {
        const pStats = propsRef.current.stats;
        const pSect = SECTS[propsRef.current.player.sect];
        if (attackerName) {
          lastAttackerName = attackerName;
          lastAttackerIsPlayer = attackerIsPlayer;
        }
        if (pr.dashTimer > 0) {
          addFloatText(pr.x, pr.y - 28, 'Né Tránh!', '#67E8F9', 0.95);
          return;
        }
        if (Math.random() * 100 < pStats.dodge) {
          addFloatText(pr.x, pr.y - 28, 'Thân Pháp Né!', '#93C5FD', 0.95);
          return;
        }
        const elemMult = getElementMultiplier(attackerElement, pSect.element);
        const resistFactor = 1 - Math.min(0.55, pStats.allResist / 100);
        const enemyCritMult = isCrit ? 1.58 : 1;
        let dmg = Math.max(
          8,
          Math.round(
            (rawDmg * elemMult * resistFactor - pStats.def * 0.45) *
              (0.92 + Math.random() * 0.16) *
              enemyCritMult
          )
        );

        if (pr.shield > 0) {
          const absorbed = Math.min(pr.shield, dmg);
          pr.shield -= absorbed;
          dmg -= absorbed;
          if (absorbed > 0) {
            addFloatText(pr.x, pr.y - 34, `Khiên -${absorbed}`, '#67E8F9', 0.85);
          }
        }
        if (dmg > 0) {
          pr.hp = Math.max(0, pr.hp - dmg);
          pr.hitFlash = isCrit ? 0.22 : 0.16;
          atlasHub.trigger(PLAYER_ENTITY_ID, 'hit', {
            durationSec: 0.24,
            hitFlashSec: isCrit ? 0.22 : 0.16,
          });
          if (isCrit) {
            addCritFloatText(
              pr.x,
              pr.y - 30,
              `-${dmg.toLocaleString('vi-VN')}`,
              '★ CHÍ MẠNG! ★',
              heavy ? 1.66 : 1.52,
              'crimson_gold'
            );
            effectPools.spawnCritSplatter(pr.x, pr.y - 6, true);
            effectPools.spawnRing({
              x: pr.x,
              y: pr.y,
              radius: 8,
              maxRadius: 46,
              color: '#F5D061',
              accent: '#FEF08A',
              life: 0.24,
              maxLife: 0.24,
              kind: 'ring',
              element: attackerElement,
            });
            soundEngine.playCrit();
            shakeIntensity = Math.max(shakeIntensity, heavy ? 8.5 : 6.2);
            hitstopTimer = Math.max(hitstopTimer, 0.045);
          } else {
            addFloatText(pr.x, pr.y - 24, `-${dmg.toLocaleString('vi-VN')}`, '#F87171', heavy ? 1.15 : 0.95);
          }
          if (heavy) {
            shakeIntensity = Math.max(shakeIntensity, 7);
            hitstopTimer = Math.max(hitstopTimer, 0.05);
            // Heavy unblocked blows interrupt active combo streak
            if (combo.count > 0) {
              resetCombo(true);
            }
          } else if (combo.count > 0) {
            if (dmg >= pStats.maxHp * 0.16) {
              resetCombo(true);
            } else {
              // Minor chip hits pressure the combo window without instantly deleting farm streaks
              combo.timer = Math.max(0.35, combo.timer - 0.35);
            }
          }
        }
      };

      const performSkill = (skillIdx: number) => {
        const p = propsRef.current.player;
        const pStats = propsRef.current.stats;
        const sect = SECTS[p.sect];
        const skill: SkillDef | undefined = sect.skills[skillIdx];
        if (!skill) return;

        const skLevel = p.skillLevels[skill.id] || 0;
        if (skLevel <= 0) return;
        if (pr.cooldowns[skillIdx] > 0) return;
        if (pr.mp < skill.mpCost) return;

        pr.mp = Math.max(0, pr.mp - skill.mpCost);
        pr.cooldowns[skillIdx] = skill.cooldown;

        const skillMult = skill.multiplier * (1 + (skLevel - 1) * 0.12);
        const baseDmg = pStats.atk * skillMult;
        const isCrit = Math.random() * 100 < pStats.crit + (p.sect === 'duong_mon' ? 8 : 0);

        // Pick best target (includes hostile wandering players in PK slaughter mode)
        const enemies = units.filter((u) => isUnitHostileToPlayer(u));
        const gateAlive = enemies.some((u) => u.kind === 'gate');
        const validEnemies = gateAlive ? enemies.filter((u) => u.kind !== 'pillar') : enemies;
        let target = validEnemies.find((u) => u.id === pr.targetUnitId);
        if (!target && validEnemies.length > 0) {
          target = validEnemies.reduce((best, cur) =>
            Math.hypot(cur.x - pr.x, cur.y - pr.y) < Math.hypot(best.x - pr.x, best.y - pr.y) ? cur : best
          );
          pr.targetUnitId = target.id;
        }

        const angle = target ? Math.atan2(target.y - pr.y, target.x - pr.x) : pr.facing;
        pr.facing = angle;

        // Trigger state-driven 8-dir Attack or Cast animation clip via centralized hub
        if (skill.type === 'melee' || skill.type === 'projectile') {
          pr.attackMax = 0.34;
          pr.attackTimer = 0.34;
          atlasHub.trigger(PLAYER_ENTITY_ID, 'attack', { durationSec: 0.34, force: true });
        } else {
          pr.castMax = 0.45;
          pr.castTimer = 0.45;
          atlasHub.trigger(PLAYER_ENTITY_ID, 'cast', { durationSec: 0.45, force: true });
        }

        // Audio pitch per skill slot
        soundEngine.playSkill(240 + skillIdx * 95);

        // Visual & combat effect by skill type (Zero-GC Object Pools)
        if (skill.type === 'heal') {
          const healAmt = Math.round(pStats.maxHp * (0.3 + skLevel * 0.02));
          pr.hp = Math.min(pStats.maxHp, pr.hp + healAmt);
          addFloatText(pr.x, pr.y - 34, `+${healAmt} Sinh Lực`, '#4ADE80', 1.15);
          effectPools.spawnRing({
            x: pr.x,
            y: pr.y,
            radius: 18,
            maxRadius: skill.radius,
            color: skill.color,
            accent: skill.accentColor,
            life: 0.5,
            maxLife: 0.5,
            kind: 'lotus',
            element: sect.element,
          });
          for (const e of validEnemies) {
            if (Math.hypot(e.x - pr.x, e.y - pr.y) <= skill.radius + e.radius) {
              damageUnit(e, baseDmg, isCrit, sect.element, true);
              e.slowTimer = Math.max(e.slowTimer, 2.5);
            }
          }
          return;
        }

        if (skill.type === 'shield') {
          const shieldAmt = Math.round(pStats.maxHp * (0.32 + skLevel * 0.02));
          pr.shield = Math.max(pr.shield, shieldAmt);
          addFloatText(pr.x, pr.y - 36, `Hộ Thể +${shieldAmt}`, '#F5D061', 1.1);
          effectPools.spawnRing({
            x: pr.x,
            y: pr.y,
            radius: 18,
            maxRadius: skill.radius,
            color: skill.color,
            accent: skill.accentColor,
            life: 0.55,
            maxLife: 0.55,
            kind: 'shield',
            element: sect.element,
          });
          for (const e of validEnemies) {
            if (Math.hypot(e.x - pr.x, e.y - pr.y) <= skill.radius + e.radius) {
              damageUnit(e, baseDmg, isCrit, sect.element, true);
            }
          }
          return;
        }

        if (skill.type === 'projectile') {
          const count = skillIdx === 0 && p.sect === 'duong_mon' ? 2 : 1;
          for (let i = 0; i < count; i++) {
            const spread = count === 2 ? (i === 0 ? -0.1 : 0.1) : 0;
            const a = angle + spread;
            effectPools.spawnProjectile({
              x: pr.x + Math.cos(a) * 20,
              y: pr.y + Math.sin(a) * 20,
              vx: Math.cos(a) * 480,
              vy: Math.sin(a) * 480,
              radius: p.sect === 'cai_bang' ? 14 : 9,
              color: skill.color,
              accent: skill.accentColor,
              team: 'ally',
              damage: baseDmg / (count === 2 ? 1.55 : 1),
              crit: isCrit,
              element: sect.element,
              life: 0.75,
              pierce: p.sect === 'cai_bang',
              slow: p.sect === 'nga_mi',
            });
          }
          effectPools.spawnRing({
            x: pr.x + Math.cos(angle) * 28,
            y: pr.y + Math.sin(angle) * 28,
            radius: 14,
            maxRadius: 56,
            color: skill.color,
            accent: skill.accentColor,
            life: 0.24,
            maxLife: 0.24,
            kind: 'slash',
            angle,
            element: sect.element,
          });
          return;
        }

        if (skill.type === 'melee') {
          soundEngine.playSlash();
          effectPools.spawnRing({
            x: pr.x + Math.cos(angle) * 32,
            y: pr.y + Math.sin(angle) * 32,
            radius: 20,
            maxRadius: skill.radius,
            color: skill.color,
            accent: skill.accentColor,
            life: 0.28,
            maxLife: 0.28,
            kind: 'slash',
            angle,
            element: sect.element,
          });
          for (const e of validEnemies) {
            const d = Math.hypot(e.x - pr.x, e.y - pr.y);
            if (d <= skill.radius + e.radius + 25) {
              damageUnit(e, baseDmg, isCrit, sect.element, true);
            }
          }
          return;
        }

        // AoE or Poison centered on target or self
        const cx = target && Math.hypot(target.x - pr.x, target.y - pr.y) <= skill.range + 40 ? target.x : pr.x + Math.cos(angle) * 90;
        const cy = target && Math.hypot(target.x - pr.x, target.y - pr.y) <= skill.range + 40 ? target.y : pr.y + Math.sin(angle) * 90;

        effectPools.spawnRing({
          x: cx,
          y: cy,
          radius: 16,
          maxRadius: skill.radius,
          color: skill.color,
          accent: skill.accentColor,
          life: 0.58,
          maxLife: 0.58,
          kind: p.sect === 'cai_bang' ? 'dragon' : p.sect === 'vo_dang' ? 'swords' : p.sect === 'nga_mi' ? 'lotus' : 'ring',
          element: sect.element,
        });
        addParticles(cx, cy, skill.color, 22, 195);
        if (skillIdx === 3) {
          shakeIntensity = Math.max(shakeIntensity, 8.5);
          addFloatText(pr.x, pr.y - 46, skill.name, '#F5D061', 1.15);
        }

        for (const e of validEnemies) {
          if (Math.hypot(e.x - cx, e.y - cy) <= skill.radius + e.radius) {
            damageUnit(e, baseDmg, isCrit, sect.element, true);
            if (skill.type === 'poison') {
              e.poisonTimer = 4.0;
              e.poisonDps = Math.round(pStats.atk * 0.42);
            }
            if (p.sect === 'thieu_lam' && skillIdx === 2) {
              e.stunTimer = Math.max(e.stunTimer, 1.4);
            }
            if (p.sect === 'nga_mi') {
              e.slowTimer = Math.max(e.slowTimer, 3.0);
            }
          }
        }
      };

      const handleUnitDeath = (u: Unit) => {
        // Transfer 8-dir state seamlessly into dying slot inside centralized BattleSpriteAtlasHub
        const deathDur = u.kind === 'boss' ? 1.15 : 0.65;
        const dyingId = `dying_${u.id}_${Date.now()}`;
        const deadAnim = atlasHub.transferToDying(u.id, dyingId, deathDur);
        dyingUnits.push({
          dyingId,
          unit: { ...u, anim: deadAnim },
          progress: 0,
          maxDuration: deathDur,
        });

        addParticles(u.x, u.y, u.color, u.kind === 'boss' || u.kind === 'pillar' ? 42 : 16, 200);
        const curMode = propsRef.current.battle.mode;
        const p = propsRef.current.player;

        if (curMode === 'WILD' && (u.kind === 'mob' || u.kind === 'elite')) {
          const dropChance = u.kind === 'elite' ? 0.52 : 0.2;
          let item: EquipmentItem | undefined;
          if (Math.random() < dropChance) {
            const map = MAPS.find((m) => m.id === p.currentMapId) || MAPS[0];
            item = generateEquipment(Math.max(p.level, map.minLevel));
          }
          const stones = u.kind === 'elite' || Math.random() < 0.25 ? 1 : 0;
          const isHighDrop =
            item && (item.quality === 'mythic' || item.quality === 'gold' || item.quality === 'purple');
          lootOrbs.push({
            x: u.x,
            y: u.y,
            color: item ? QUALITY_META[item.quality].color : '#F5D061',
            label: item ? `[${item.name}]` : `+${u.silverReward ?? 80} Bạc`,
            life: item ? (isHighDrop ? 2.5 : 1.75) : 1.15,
            quality: item?.quality,
            slot: item ? item.slot : stones > 0 ? 'stone' : undefined,
            itemName: item?.name,
            sectId: p.sect,
            age: 0,
          });

          // Drop interactive pulsing Treasure Chest on WILD battlefield
          const chestChance = u.kind === 'elite' ? 0.68 : 0.24;
          if (fieldChests.length < 6 && Math.random() < chestChance) {
            const roll = Math.random();
            let tier: ChestTier = 'iron';
            if (u.kind === 'elite') {
              if (roll < 0.2) tier = 'imperial_gold';
              else if (roll < 0.65) tier = 'purple_gold';
            } else {
              if (roll < 0.08) tier = 'imperial_gold';
              else if (roll < 0.32) tier = 'purple_gold';
            }
            const dropPos = clampArena(
              u.x + (-22 + Math.random() * 44),
              u.y + (-16 + Math.random() * 32)
            );
            fieldChests.push({
              id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              x: dropPos.x,
              y: dropPos.y,
              tier,
              sourceName: u.name,
              age: 0,
              bounce: 1,
            });
            const meta = CHEST_TIER_META[tier];
            addParticles(dropPos.x, dropPos.y, meta.color, 18, 140);
            addFloatText(dropPos.x, dropPos.y - 28, `Rơi ${meta.shortName} Rương!`, meta.color, 1.15);
            soundEngine.playChestDrop();
          } else {
            soundEngine.playLoot();
          }

          propsRef.current.onWildKill({
            exp: u.expReward ?? 60,
            silver: u.silverReward ?? 80,
            stones,
            item,
            mobName: u.name,
          });
        } else if (curMode === 'WILD' && u.kind === 'wanderer') {
          const dropChance = 0.55;
          const item =
            Math.random() < dropChance
              ? generateEquipment(Math.max(1, p.level + 1), Math.random() < 0.28 ? 'purple' : 'blue')
              : undefined;
          const silver = u.silverReward || 450 + p.level * 40;
          const stones = 1 + (Math.random() < 0.45 ? 1 : 0);
          soundEngine.playCrit();
          shakeIntensity = Math.max(shakeIntensity, 8);
          addFloatText(u.x, u.y - 26, 'ĐỒ SÁT THÀNH CÔNG! (+1 Sát Khí)', '#EF4444', 1.25);
          lootOrbs.push({
            x: u.x,
            y: u.y,
            color: item ? QUALITY_META[item.quality].color : '#EF4444',
            label: item ? `[${item.name}]` : `+${silver} Bạc (PK)`,
            life: 2.3,
            quality: item?.quality,
            slot: item ? item.slot : 'stone',
            itemName: item?.name,
            sectId: p.sect,
            age: 0,
          });
          propsRef.current.onPkKill({
            victimName: u.name,
            victimSect: u.masterSect || 'vo_dang',
            silver,
            merit: 45,
            stones,
            item,
          });
        } else if (curMode === 'BOSS' && u.kind === 'boss' && !battleFinished) {
          battleFinished = true;
          const boss =
            WORLD_BOSSES.find((b) => b.id === propsRef.current.battle.bossId) || WORLD_BOSSES[0];
          const quality: ItemQuality =
            boss.level >= 60 && Math.random() < 0.24
              ? 'mythic'
              : boss.level >= 50 || Math.random() < 0.45
              ? 'gold'
              : 'purple';
          const dropItem = generateEquipment(Math.max(p.level, boss.level), quality);
          soundEngine.playLevelUp();
          propsRef.current.onBattleComplete({
            victory: true,
            mode: 'BOSS',
            title: `Hạ Gục Boss Hoàng Kim ${boss.name}!`,
            subtitle: 'Kỳ trân dị bảo rơi rải khắp chiến trường, giang hồ chấn động.',
            rewards: {
              exp: boss.expReward,
              silver: boss.silverReward,
              goldIngots: boss.goldIngotReward,
              enhanceStones: boss.stoneReward,
              merit: boss.meritReward,
              reputation: Math.round(boss.meritReward * 0.8),
              item: dropItem,
            },
          });
        } else if (curMode === 'ARENA' && u.kind === 'rival' && !battleFinished) {
          battleFinished = true;
          const rival = propsRef.current.battle.arenaOpponent!;
          soundEngine.playLevelUp();
          propsRef.current.onBattleComplete({
            victory: true,
            mode: 'ARENA',
            title: `Chiến Thắng Lôi Đài!`,
            subtitle: `Bạn đã đánh bại ${rival.name} (${SECTS[rival.sect].name}) và đoạt lấy thứ hạng mới.`,
            rewards: {
              exp: Math.round(450 + rival.level * 95),
              silver: Math.round(1400 + rival.level * 140),
              reputation: 180 + (20 - rival.rank) * 15,
              merit: 150 + (20 - rival.rank) * 12,
              enhanceStones: 3,
              extraText: rival.rank < p.arenaRank ? `Thăng lên Hạng #${rival.rank} Lôi Đài!` : 'Giữ vững vị trí trên bảng xếp hạng.',
            },
          });
        } else if (curMode === 'SIEGE') {
          const city =
            propsRef.current.cities.find((c) => c.id === propsRef.current.battle.siegeCityId) ||
            propsRef.current.cities[0];
          if (u.kind === 'gate') {
            soundEngine.playWarDrum();
            shakeIntensity = 12;
            objectiveLabel = `Công Thành Chiến ${city.name} · Giai đoạn 2: Chiếm Long Trụ!`;
            addFloatText(u.x, u.y - 30, 'CỔNG THÀNH ĐÃ VỠ!', '#F5D061', 1.4);
          } else if (u.kind === 'pillar' && !battleFinished) {
            battleFinished = true;
            soundEngine.playLevelUp();
            const drop = generateEquipment(p.level + 3, 'gold');
            propsRef.current.onBattleComplete({
              victory: true,
              mode: 'SIEGE',
              title: `Chiếm Thành ${city.name} Thành Công!`,
              subtitle: `Long Trụ đã thuộc về Bang Ta! Toàn giang hồ truyền tụng uy danh Thành Chủ mới.`,
              rewards: {
                exp: 5500 + p.level * 300,
                silver: city.dailySilver,
                goldIngots: city.dailyIngots,
                enhanceStones: city.dailyStones,
                merit: 950,
                reputation: 850,
                item: drop,
                extraText: `Danh hiệu Uy Chấn Thành Chủ đã mở khóa · Nhận bổng lộc ${city.name} hằng ngày!`,
              },
            });
          }
        } else if (curMode === 'GUILD_WAR' && u.kind === 'banner' && !battleFinished) {
          battleFinished = true;
          const territory =
            propsRef.current.territories.find(
              (t) => t.id === propsRef.current.battle.guildWarTerritoryId
            ) || propsRef.current.territories[0];
          soundEngine.playLevelUp();
          const dropQuality = territory.recommendedPower >= 15000 ? 'gold' : 'purple';
          const drop = generateEquipment(p.level + 2, dropQuality);
          propsRef.current.onBattleComplete({
            victory: true,
            mode: 'GUILD_WAR',
            title: `Chiếm Đoạt ${territory.name} Thành Công!`,
            subtitle: `Chiến Kỳ của ${territory.defenderGuildName} đã gãy đổ! Lãnh địa tài nguyên tại ${territory.region} nay thuộc quyền kiểm soát của Bang Ta.`,
            rewards: {
              exp: 2600 + p.level * 180,
              silver: territory.claimSilver,
              goldIngots: territory.claimIngots,
              enhanceStones: territory.claimStones,
              merit: 420,
              reputation: 380,
              item: drop,
              extraText: `Hiệu ứng lãnh địa: ${territory.bonusLabel} · Thu hoạch tài nguyên định kỳ mỗi 2 phút!`,
            },
          });
        }
      };

      // Main 60fps loop
      let rafId = 0;
      let lastTs = performance.now();

      const step = (now: number) => {
        rafId = requestAnimationFrame(step);
        const rawDt = (now - lastTs) / 1000;
        lastTs = now;
        const dt = Math.min(rawDt, 0.05);

        if (propsRef.current.paused || battleFinished) {
          renderScene();
          return;
        }

        if (hitstopTimer > 0) {
          hitstopTimer = Math.max(0, hitstopTimer - dt);
          renderScene();
          return;
        }

        shakeIntensity = Math.max(0, shakeIntensity - dt * 22);

        const p = propsRef.current.player;
        const pStats = propsRef.current.stats;
        const sect = SECTS[p.sect];
        const curMode = propsRef.current.battle.mode;

        // Keep maxHp/maxMp synced
        if (pr.hp > pStats.maxHp) pr.hp = pStats.maxHp;
        pr.mp = Math.min(pStats.maxMp, pr.mp + pStats.maxMp * 0.085 * dt);
        if (curMode === 'WILD') {
          pr.hp = Math.min(pStats.maxHp, pr.hp + pStats.maxHp * 0.025 * dt);
        }

        for (let i = 0; i < 4; i++) {
          pr.cooldowns[i] = Math.max(0, pr.cooldowns[i] - dt);
        }
        pr.dashCd = Math.max(0, pr.dashCd - dt);
        pr.dashTimer = Math.max(0, pr.dashTimer - dt);
        pr.hitFlash = Math.max(0, pr.hitFlash - dt);
        pr.attackTimer = Math.max(0, pr.attackTimer - dt);
        pr.castTimer = Math.max(0, pr.castTimer - dt);
        pr.deathTimer = Math.max(0, pr.deathTimer - dt);
        // Combo continuity decay & spring punch interpolation
        if (combo.count > 0) {
          combo.timer = Math.max(0, combo.timer - dt);
          if (combo.timer <= 0) {
            resetCombo(false);
          }
        }
        combo.popScale = Math.max(1, combo.popScale - (combo.popScale - 1) * Math.min(1, dt * 13));
        combo.tierFlash = Math.max(0, combo.tierFlash - dt * 2.1);
        combo.breakTimer = Math.max(0, combo.breakTimer - dt);
        atlasHub.advanceClock(dt);
        pr.animPhase = atlasHub.globalPhase;
        const prevPlayerX = pr.x;
        const prevPlayerY = pr.y;

        // Process pending UI actions
        if (pendingActionsRef.current.potion) {
          pendingActionsRef.current.potion = false;
          if (p.potions > 0 && pr.hp < pStats.maxHp) {
            const heal = Math.round(pStats.maxHp * 0.45);
            pr.hp = Math.min(pStats.maxHp, pr.hp + heal);
            addFloatText(pr.x, pr.y - 30, `Kim Sang Dược +${heal}`, '#4ADE80', 1.1);
            soundEngine.playLoot();
            propsRef.current.onPotionConsumed();
          }
        }
        if (pendingActionsRef.current.dash) {
          pendingActionsRef.current.dash = false;
          if (pr.dashCd <= 0) {
            pr.dashCd = 3.2;
            pr.dashTimer = 0.24;
            const dashDist = 115;
            const dest = clampArena(
              pr.x + Math.cos(pr.facing) * dashDist,
              pr.y + Math.sin(pr.facing) * dashDist
            );
            addParticles(pr.x, pr.y, sect.color, 12, 120);
            pr.x = dest.x;
            pr.y = dest.y;
            addFloatText(pr.x, pr.y - 28, 'Khinh Công!', '#E0F2FE', 0.9);
            soundEngine.playSlash();
          }
        }
        if (pendingActionsRef.current.castIndex !== null) {
          const idx = pendingActionsRef.current.castIndex;
          pendingActionsRef.current.castIndex = null;
          performSkill(idx);
        }

        // Player Movement: Keyboard overrides click/auto
        let moveX = 0;
        let moveY = 0;
        if (heldKeys.has('w') || heldKeys.has('arrowup')) moveY -= 1;
        if (heldKeys.has('s') || heldKeys.has('arrowdown')) moveY += 1;
        if (heldKeys.has('a') || heldKeys.has('arrowleft')) moveX -= 1;
        if (heldKeys.has('d') || heldKeys.has('arrowright')) moveX += 1;

        const playerSpeed = Math.round(165 * (1 + pStats.moveSpeedPct / 100));
        if (moveX !== 0 || moveY !== 0) {
          const len = Math.hypot(moveX, moveY);
          pr.facing = Math.atan2(moveY, moveX);
          const next = clampArena(pr.x + (moveX / len) * playerSpeed * dt, pr.y + (moveY / len) * playerSpeed * dt);
          pr.x = next.x;
          pr.y = next.y;
          pr.moveTarget = null;
        } else if (pr.moveTarget) {
          const dx = pr.moveTarget.x - pr.x;
          const dy = pr.moveTarget.y - pr.y;
          const d = Math.hypot(dx, dy);
          if (d < 8) {
            pr.moveTarget = null;
          } else {
            pr.facing = Math.atan2(dy, dx);
            pr.x += (dx / d) * playerSpeed * dt;
            pr.y += (dy / d) * playerSpeed * dt;
          }
        } else if (propsRef.current.autoBattle) {
          // Smart Auto-Combat AI
          const enemies = units.filter((u) => isUnitHostileToPlayer(u));
          const gateAlive = enemies.some((u) => u.kind === 'gate');
          const validEnemies = gateAlive ? enemies.filter((u) => u.kind !== 'pillar') : enemies;

          // Auto heal potion if low HP
          if (pr.hp < pStats.maxHp * 0.35 && p.potions > 0) {
            pendingActionsRef.current.potion = true;
          }

          if (validEnemies.length > 0) {
            // Prefer siege gate/pillar when in siege, else nearest
            let target = validEnemies.find((u) => u.id === pr.targetUnitId);
            if (!target) {
              target = validEnemies.reduce((best, cur) =>
                Math.hypot(cur.x - pr.x, cur.y - pr.y) < Math.hypot(best.x - pr.x, best.y - pr.y) ? cur : best
              );
              pr.targetUnitId = target.id;
            }
            const dist = Math.hypot(target.x - pr.x, target.y - pr.y);
            const preferredRange = sect.skills[0].range * 0.78;
            if (dist > preferredRange + target.radius) {
              const a = Math.atan2(target.y - pr.y, target.x - pr.x);
              pr.facing = a;
              const next = clampArena(pr.x + Math.cos(a) * playerSpeed * dt, pr.y + Math.sin(a) * playerSpeed * dt);
              pr.x = next.x;
              pr.y = next.y;
            } else {
              // Cast highest priority available skill
              const castOrder = [3, 2, 1, 0];
              for (const idx of castOrder) {
                const sk = sect.skills[idx];
                if ((p.skillLevels[sk.id] || 0) <= 0) continue;
                if (pr.cooldowns[idx] > 0 || pr.mp < sk.mpCost) continue;
                if ((sk.type === 'heal' || sk.type === 'shield') && pr.hp > pStats.maxHp * 0.78) continue;
                performSkill(idx);
                break;
              }
            }
          }
        }

        // Track player movement velocity & advance centralized 8-direction BattleSpriteAtlasHub
        const movedDist = Math.hypot(pr.x - prevPlayerX, pr.y - prevPlayerY);
        pr.isMoving = movedDist > 0.35;
        pr.isRunning = movedDist > 0.35 && (playerSpeed >= 185 || pr.dashTimer > 0);
        pr.anim = atlasHub.stepEntity(PLAYER_ENTITY_ID, {
          dt,
          desiredFacing: pr.facing,
          isMoving: pr.isMoving,
          isRunning: pr.isRunning,
          isMounted: Boolean(p.isMounted && p.activeMountId),
          isDead: pr.hp <= 0,
          turnSpeed: 20,
        });

        // Emit mythical mount illusion or evolved mount hoof & aura trail particles via Object Pool
        if (p.isMounted && (p.activeMountIllusionId || p.activeMountId)) {
          const ill = p.activeMountIllusionId
            ? MOUNT_ILLUSIONS.find((x) => x.id === p.activeMountIllusionId)
            : null;
          const mnt = MOUNTS.find((m) => m.id === p.activeMountId);
          const emitRate = ill ? (pr.isMoving ? 18 : 7) : mnt && mnt.tier >= 3 && pr.isMoving ? 10 : 0;
          if (emitRate > 0 && Math.random() < dt * emitRate) {
            const trailAngle = pr.facing + Math.PI + (-0.6 + Math.random() * 1.2);
            const sp = 28 + Math.random() * 44;
            effectPools.spawnParticle(
              pr.x + (-14 + Math.random() * 28),
              pr.y + 8 + (-4 + Math.random() * 10),
              Math.cos(trailAngle) * sp,
              Math.sin(trailAngle) * sp - 12,
              1.8 + Math.random() * 2.6,
              ill
                ? Math.random() < 0.6
                  ? ill.auraColor
                  : ill.accentColor
                : mnt?.accentColor || '#F5D061',
              0.35 + Math.random() * 0.3,
              0.65
            );
          }
        }

        // Update Units (AI, Visual Behavior, poison, knockback, telegraph, attacks)
        for (const u of units) {
          if (u.hp <= 0) continue;
          u.hitFlash = Math.max(0, u.hitFlash - dt);
          u.slowTimer = Math.max(0, u.slowTimer - dt);
          u.stunTimer = Math.max(0, u.stunTimer - dt);
          u.attackCd = Math.max(0, u.attackCd - dt);
          u.attackTimer = Math.max(0, (u.attackTimer || 0) - dt);
          u.alertTimer = Math.max(0, (u.alertTimer || 0) - dt);
          u.roarTimer = Math.max(0, (u.roarTimer || 0) - dt);
          u.isMoving = false;

          // Smooth knockback decay (#7)
          if (u.knockbackX || u.knockbackY) {
            const kx = u.knockbackX || 0;
            const ky = u.knockbackY || 0;
            if (Math.hypot(kx, ky) > 4) {
              const nextKb = clampArena(u.x + kx * dt, u.y + ky * dt);
              u.x = nextKb.x;
              u.y = nextKb.y;
              const damp = Math.pow(0.06, dt);
              u.knockbackX = kx * damp;
              u.knockbackY = ky * damp;
            } else {
              u.knockbackX = 0;
              u.knockbackY = 0;
            }
          }

          if (u.poisonTimer > 0) {
            u.poisonTimer -= dt;
            if (Math.random() < dt * 2.2) {
              const pdmg = Math.max(10, Math.round(u.poisonDps * 0.5));
              u.hp = Math.max(0, u.hp - pdmg);
              addFloatText(u.x, u.y - u.radius, `Độc -${pdmg}`, '#4ADE80', 0.85);
            }
          }

          if (u.kind === 'gate' || u.kind === 'pillar' || u.kind === 'banner' || u.stunTimer > 0) continue;

          // Boss/Rival telegraph resolution
          if (u.telegraphTimer > 0) {
            u.telegraphTimer -= dt;
            if (u.telegraphTimer <= 0) {
              u.attackMax = 0.4;
              u.attackTimer = 0.4;
              registerUnitInAtlasHub(u);
              atlasHub.trigger(u.id, 'attack', { durationSec: 0.4, force: true });
              effectPools.spawnRing({
                x: u.telegraphX,
                y: u.telegraphY,
                radius: 20,
                maxRadius: u.telegraphRadius,
                color: '#EF4444',
                accent: '#F5D061',
                life: 0.45,
                maxLife: 0.45,
                kind: u.kind === 'boss' ? 'dragon' : 'ring',
                element: u.element,
              });
              addParticles(u.telegraphX, u.telegraphY, '#EF4444', 22, 180);
              if (Math.hypot(pr.x - u.telegraphX, pr.y - u.telegraphY) <= u.telegraphRadius + 18) {
                const telegraphCrit = Math.random() < (u.enraged ? 0.34 : 0.24);
                damagePlayer(
                  u.atk * 1.65,
                  u.element,
                  true,
                  u.name,
                  u.kind === 'wanderer' || u.kind === 'rival',
                  telegraphCrit
                );
              }
            }
            continue;
          }

          // Wild Monster Patrol / Look-Around / Alert Behavior (#7)
          if (curMode === 'WILD' && (u.kind === 'mob' || u.kind === 'elite') && !u.spottedPlayer) {
            const distToPlayer = Math.hypot(pr.x - u.x, pr.y - u.y);
            if (distToPlayer <= 255) {
              u.spottedPlayer = true;
              u.alertTimer = 0.85;
              u.facing = Math.atan2(pr.y - u.y, pr.x - u.x);
            } else {
              if ((u.patrolWait || 0) > 0) {
                u.patrolWait = Math.max(0, (u.patrolWait || 0) - dt);
                // Look around subtly while pausing on patrol
                if (Math.random() < dt * 0.8) {
                  u.facing += (Math.random() < 0.5 ? -1 : 1) * 0.9;
                }
              } else {
                const px = u.patrolX ?? u.x;
                const py = u.patrolY ?? u.y;
                const pd = Math.hypot(px - u.x, py - u.y);
                if (pd < 16) {
                  u.patrolWait = 1.0 + Math.random() * 1.4;
                  const nextPatrol = clampArena(
                    u.x + (-110 + Math.random() * 220),
                    u.y + (-80 + Math.random() * 160)
                  );
                  u.patrolX = nextPatrol.x;
                  u.patrolY = nextPatrol.y;
                } else {
                  const pa = Math.atan2(py - u.y, px - u.x);
                  u.facing = pa;
                  const next = clampArena(
                    u.x + Math.cos(pa) * u.speed * 0.46 * dt,
                    u.y + Math.sin(pa) * u.speed * 0.46 * dt
                  );
                  u.x = next.x;
                  u.y = next.y;
                  u.isMoving = true;
                }
              }
              continue;
            }
          }

          // Wandering other players outside safe zones
          if (u.kind === 'wanderer' && !u.aggro) {
            const distToPlayer = Math.hypot(pr.x - u.x, pr.y - u.y);
            const curMap = MAPS.find((m) => m.id === p.currentMapId) || MAPS[0];
            if (
              curMode === 'WILD' &&
              !curMap.isSafeZone &&
              ((p.pkMode === 'slaughter' && distToPlayer <= 165) ||
                (p.pkPoints >= 4 && distToPlayer <= 145))
            ) {
              u.aggro = true;
              u.team = 'enemy';
              u.alertTimer = 0.85;
              addFloatText(
                u.x,
                u.y - u.radius - 20,
                p.pkPoints >= 4 ? 'Huyết Ma Hiện Thân!' : 'Tự Vệ Phản Công!',
                '#F87171',
                1.05
              );
            } else {
              const px = u.patrolX ?? width * 0.6;
              const py = u.patrolY ?? height * 0.5;
              const pd = Math.hypot(px - u.x, py - u.y);
              if (pd < 18) {
                u.patrolX = 130 + Math.random() * (width - 260);
                u.patrolY = 120 + Math.random() * (height - 220);
              } else {
                const pa = Math.atan2(py - u.y, px - u.x);
                u.facing = pa;
                const next = clampArena(u.x + Math.cos(pa) * u.speed * 0.52 * dt, u.y + Math.sin(pa) * u.speed * 0.52 * dt);
                u.x = next.x;
                u.y = next.y;
                u.isMoving = true;
              }
              continue;
            }
          }

          // Determine target for this unit
          let targetX = pr.x;
          let targetY = pr.y;
          let targetUnit: Unit | null = null;

          if (u.team === 'ally') {
            const enemies = units.filter((e) => e.team === 'enemy' && e.hp > 0);
            const gateAlive = enemies.some((e) => e.kind === 'gate');
            const pool = gateAlive ? enemies.filter((e) => e.kind !== 'pillar') : enemies;
            if (pool.length > 0) {
              targetUnit = pool.reduce((best, cur) =>
                Math.hypot(cur.x - u.x, cur.y - u.y) < Math.hypot(best.x - u.x, best.y - u.y) ? cur : best
              );
              targetX = targetUnit.x;
              targetY = targetUnit.y;
            }
          } else {
            // Enemy targets nearest ally (player or ally NPC)
            const allies = units.filter((a) => a.team === 'ally' && a.hp > 0);
            let minD = Math.hypot(pr.x - u.x, pr.y - u.y);
            for (const a of allies) {
              const d = Math.hypot(a.x - u.x, a.y - u.y);
              if (d < minD) {
                minD = d;
                targetUnit = a;
                targetX = a.x;
                targetY = a.y;
              }
            }
          }

          const dist = Math.hypot(targetX - u.x, targetY - u.y);
          const angle = Math.atan2(targetY - u.y, targetX - u.x);
          u.facing = angle;
          const effSpeed = u.speed * (u.slowTimer > 0 ? 0.5 : 1) * (u.enraged ? 1.18 : 1);

          if (dist > u.attackRange + (targetUnit ? targetUnit.radius : 18)) {
            const next = clampArena(u.x + Math.cos(angle) * effSpeed * dt, u.y + Math.sin(angle) * effSpeed * dt);
            u.x = next.x;
            u.y = next.y;
            u.isMoving = true;
          } else if (u.attackCd <= 0) {
            u.attackMax = 0.36;
            u.attackTimer = 0.36;
            registerUnitInAtlasHub(u);
            if (u.team === 'ally' && targetUnit) {
              u.attackCd = 1.05;
              atlasHub.trigger(u.id, 'attack', { durationSec: 0.36, force: true });
              damageUnit(targetUnit, u.atk, Math.random() < 0.16, u.element, false);
              effectPools.spawnRing({
                x: targetUnit.x,
                y: targetUnit.y,
                radius: 8,
                maxRadius: 34,
                color: '#60A5FA',
                accent: '#FDE68A',
                life: 0.22,
                maxLife: 0.22,
                kind: 'slash',
                angle,
                element: u.element,
              });
            } else {
              // Boss / Rival / Hostile Wanderer telegraph special attack
              if ((u.kind === 'boss' || u.kind === 'rival' || u.kind === 'wanderer') && Math.random() < (u.enraged ? 0.42 : 0.3)) {
                u.attackCd = u.enraged ? 2.0 : 2.4;
                u.telegraphMax = 1.05;
                u.telegraphTimer = 1.05;
                u.telegraphX = pr.x;
                u.telegraphY = pr.y;
                u.telegraphRadius = u.kind === 'boss' ? 96 : 72;
                atlasHub.trigger(u.id, 'cast', { durationSec: 1.05, force: true });
                addFloatText(u.x, u.y - u.radius - 12, 'Tụ Khí Tuyệt Kỹ!', '#F87171', 1.0);
              } else if ((u.kind === 'rival' || u.kind === 'wanderer') && u.attackRange > 130) {
                u.attackCd = 1.15;
                atlasHub.trigger(u.id, 'attack', { durationSec: 0.36, force: true });
                effectPools.spawnProjectile({
                  x: u.x,
                  y: u.y,
                  vx: Math.cos(angle) * 390,
                  vy: Math.sin(angle) * 390,
                  radius: 9,
                  color: u.color,
                  accent: '#FDE68A',
                  team: 'enemy',
                  damage: u.atk,
                  crit: Math.random() < 0.2,
                  element: u.element,
                  life: 0.9,
                  pierce: false,
                });
              } else {
                u.attackCd = u.kind === 'boss' ? (u.enraged ? 1.05 : 1.35) : 1.2;
                atlasHub.trigger(u.id, 'attack', { durationSec: 0.36, force: true });
                const enemyCritChance =
                  u.kind === 'boss'
                    ? u.enraged
                      ? 0.3
                      : 0.22
                    : u.kind === 'rival' || u.kind === 'wanderer'
                    ? 0.2
                    : u.kind === 'elite'
                    ? 0.16
                    : 0.12;
                const enemyCrit = Math.random() < enemyCritChance;
                if (targetUnit) {
                  damageUnit(targetUnit, u.atk, enemyCrit, u.element, false);
                } else {
                  damagePlayer(
                    u.atk * (u.enraged ? 1.18 : 1),
                    u.element,
                    u.kind === 'boss' || u.kind === 'wanderer',
                    u.name,
                    u.kind === 'wanderer' || u.kind === 'rival',
                    enemyCrit
                  );
                }
              }
            }
          }
        }

        // Advance synchronized 8-direction animations for all living units via centralized hub
        for (const u of units) {
          if (u.hp <= 0) continue;
          registerUnitInAtlasHub(u);
          u.anim = atlasHub.stepEntity(u.id, {
            dt,
            desiredFacing: u.facing,
            isMoving: Boolean(u.isMoving),
            isRunning: Boolean(u.isMoving && (u.kind === 'rival' || u.kind === 'wanderer' || u.enraged)),
            isDead: false,
            turnSpeed: u.kind === 'boss' ? 12 : 16,
          });
        }

        // Update Pooled Projectiles (O(1) swap-and-pop release, zero Set allocations)
        const projPool = effectPools.projectiles;
        for (let i = projPool.activeCount - 1; i >= 0; i--) {
          const proj = projPool.items[i];
          proj.x += proj.vx * dt;
          proj.y += proj.vy * dt;
          proj.life -= dt;
          if (proj.life <= 0) {
            projPool.releaseAt(i);
            continue;
          }
          if (proj.team === 'ally') {
            let hit = false;
            for (const u of units) {
              if (!isUnitHostileToPlayer(u) || proj.hitIds.has(u.id)) continue;
              if (Math.hypot(u.x - proj.x, u.y - proj.y) <= u.radius + proj.radius) {
                proj.hitIds.add(u.id);
                damageUnit(u, proj.damage, proj.crit, proj.element, true);
                if (proj.slow) u.slowTimer = Math.max(u.slowTimer, 2.2);
                if (!proj.pierce) {
                  hit = true;
                  break;
                }
              }
            }
            if (hit) projPool.releaseAt(i);
          } else {
            if (Math.hypot(pr.x - proj.x, pr.y - proj.y) <= 22 + proj.radius) {
              damagePlayer(proj.damage, proj.element, false, 'Cao Thủ Giang Hồ', true, proj.crit);
              projPool.releaseAt(i);
            }
          }
        }

        // Process dead units
        for (let i = units.length - 1; i >= 0; i--) {
          if (units[i].hp <= 0) {
            const dead = units[i];
            units.splice(i, 1);
            handleUnitDeath(dead);
          }
        }

        // Mode-specific wave & respawn logic
        respawnTicker += dt;
        if (curMode === 'WILD') {
          const curMap = MAPS.find((m) => m.id === p.currentMapId) || MAPS[0];
          if (respawnTicker >= 1.5 && units.filter((u) => u.kind === 'mob' || u.kind === 'elite').length < 6) {
            respawnTicker = 0;
            spawnWildMob();
          }
          if (!curMap.isSafeZone) {
            wandererRespawnTicker += dt;
            if (wandererRespawnTicker >= 7.5 && units.filter((u) => u.kind === 'wanderer').length < 2) {
              wandererRespawnTicker = 0;
              spawnWildWanderer();
            }
          }
          objectiveProgress = Math.min(1, p.exp / Math.max(1, p.maxExp));
        } else if (curMode === 'DUNGEON' && !battleFinished) {
          const remaining = units.filter((u) => u.team === 'enemy').length;
          if (remaining === 0) {
            if (dungeonWave < 3) {
              dungeonWave += 1;
              setupDungeonWave(dungeonWave);
            } else {
              battleFinished = true;
              const dId = propsRef.current.battle.dungeonId || 'tang_kiem';
              const floor = propsRef.current.battle.dungeonFloor || 1;
              const dungeon = DUNGEONS.find((d) => d.id === dId) || DUNGEONS[0];
              const quality = floor >= 7 ? 'gold' : floor >= 4 ? 'purple' : 'blue';
              const drop = generateEquipment(Math.max(p.level, dungeon.unlockLevel + floor * 2), quality);
              soundEngine.playLevelUp();
              propsRef.current.onBattleComplete({
                victory: true,
                mode: 'DUNGEON',
                title: `Vượt Ải ${dungeon.name} Tầng ${floor}!`,
                subtitle: 'Đánh bại thủ lĩnh ải, thu hoạch Đá Cường Hóa và Danh Vọng.',
                rewards: {
                  exp: Math.round(750 * Math.pow(1.22, floor - 1)),
                  silver: Math.round(1600 * Math.pow(1.2, floor - 1)),
                  enhanceStones: 3 + floor,
                  reputation: 120 + floor * 45,
                  merit: 90 + floor * 30,
                  item: drop,
                },
              });
            }
          }
          objectiveProgress = (dungeonWave - 1) / 3 + (remaining === 0 ? 0.33 : 0.15);
        } else if (curMode === 'BOSS') {
          const b = units.find((u) => u.kind === 'boss');
          objectiveProgress = b ? b.hp / b.maxHp : 0;
        } else if (curMode === 'ARENA') {
          const r = units.find((u) => u.kind === 'rival');
          objectiveProgress = r ? r.hp / r.maxHp : 0;
        } else if (curMode === 'SIEGE') {
          const city =
            propsRef.current.cities.find((c) => c.id === propsRef.current.battle.siegeCityId) ||
            propsRef.current.cities[0];
          const gate = units.find((u) => u.kind === 'gate');
          const pillar = units.find((u) => u.kind === 'pillar');
          if (gate) {
            objectiveProgress = gate.hp / gate.maxHp;
          } else if (pillar) {
            objectiveProgress = pillar.hp / pillar.maxHp;
          }
          if (respawnTicker >= 5.5) {
            respawnTicker = 0;
            if (units.filter((u) => u.kind === 'ally_npc').length < 5) spawnSiegeNpc('ally', city);
            if (units.filter((u) => u.kind === 'enemy_npc').length < 5) spawnSiegeNpc('enemy', city);
          }
        } else if (curMode === 'GUILD_WAR') {
          const territory =
            propsRef.current.territories.find(
              (t) => t.id === propsRef.current.battle.guildWarTerritoryId
            ) || propsRef.current.territories[0];
          const banner = units.find((u) => u.kind === 'banner');
          objectiveProgress = banner ? banner.hp / banner.maxHp : 0;
          if (respawnTicker >= 6.0) {
            respawnTicker = 0;
            if (units.filter((u) => u.kind === 'ally_npc').length < 4) {
              spawnGuildWarNpc('ally', territory);
            }
            if (units.filter((u) => u.kind === 'enemy_npc').length < 4) {
              spawnGuildWarNpc('enemy', territory);
            }
          }
        }

        // Countdown timer for timed modes
        if (battleTimer !== null && !battleFinished) {
          battleTimer = Math.max(0, battleTimer - dt);
          if (battleTimer <= 0) {
            battleFinished = true;
            soundEngine.playFail();
            propsRef.current.onBattleComplete({
              victory: false,
              mode: curMode,
              title: 'Hết Thời Gian Khiêu Chiến!',
              subtitle: 'Hãy cường hóa trang bị, nâng cấp võ học hoặc thăng Phi Phong rồi tái chiến.',
              rewards: { silver: 300 },
            });
          }
        }

        // Check player defeat
        if (pr.hp <= 0 && !battleFinished) {
          if (combo.count > 0) {
            resetCombo(true);
          }
          if (curMode === 'WILD') {
            // Reset wanderer hostility upon respawn and notify Sát Khí penalty handler
            for (const u of units) {
              if (u.kind === 'wanderer') {
                u.aggro = false;
                u.team = 'neutral';
              }
            }
            pr.targetUnitId = null;
            pr.hp = pStats.maxHp;
            pr.mp = pStats.maxMp;
            pr.x = Math.round(width * 0.25);
            pr.y = Math.round(height * 0.56);
            propsRef.current.onWildPlayerDefeated({
              killerName: lastAttackerName,
              byPlayer: lastAttackerIsPlayer,
            });
            if (p.pkPoints > 0) {
              soundEngine.playFail();
              shakeIntensity = 12;
              addFloatText(pr.x, pr.y - 42, 'SÁT KHÍ PHẢN PHỆ · GIẢM CHỈ SỐ!', '#EF4444', 1.3);
            } else {
              addFloatText(pr.x, pr.y - 36, 'Hồi Sinh Tại Bản Đồ!', '#F5D061', 1.15);
            }
          } else {
            battleFinished = true;
            soundEngine.playFail();
            propsRef.current.onBattleComplete({
              victory: false,
              mode: curMode,
              title: 'Trọng Thương Bại Trận!',
              subtitle:
                p.pkPoints > 0
                  ? 'Bị tiêu diệt khi đang mang Điểm Sát Khí! Nhân vật chịu trừng phạt Sát Khí Phản Phệ làm giảm chỉ số tạm thời.'
                  : 'Hiệp khách tạm lui về dưỡng thương. Đừng quên nâng trang bị và mang Kim Sang Dược.',
              rewards: { exp: 180, silver: 400 },
            });
          }
        }

        // Update dying monster/boss collapse animations via centralized BattleSpriteAtlasHub
        for (let i = dyingUnits.length - 1; i >= 0; i--) {
          const du = dyingUnits[i];
          du.progress += dt / du.maxDuration;
          du.unit.anim = atlasHub.stepEntity(du.dyingId, {
            dt,
            desiredFacing: du.unit.facing,
            isMoving: false,
            isDead: true,
          });
          if (du.progress >= 1) {
            atlasHub.unregister(du.dyingId);
            dyingUnits.splice(i, 1);
          }
        }

        // Update Pooled VFX (Rings, Particles, Floating Combat Numbers — O(1) swap-and-pop)
        const ringPool = effectPools.rings;
        for (let i = ringPool.activeCount - 1; i >= 0; i--) {
          const r = ringPool.items[i];
          r.life -= dt;
          if (r.life <= 0) ringPool.releaseAt(i);
        }
        const particlePool = effectPools.particles;
        for (let i = particlePool.activeCount - 1; i >= 0; i--) {
          const pt = particlePool.items[i];
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          if (pt.gravity !== 0) {
            pt.vy += pt.gravity * dt;
          }
          pt.vx *= pt.drag;
          pt.vy *= pt.drag;
          if (pt.vRot !== 0) {
            pt.rotation += pt.vRot * dt;
          }
          pt.life -= dt;
          if (pt.life <= 0) particlePool.releaseAt(i);
        }
        const textPool = effectPools.floatTexts;
        for (let i = textPool.activeCount - 1; i >= 0; i--) {
          const ft = textPool.items[i];
          ft.x += ft.vx * dt;
          ft.y += ft.vy * dt;
          if (ft.gravity !== 0) {
            ft.vy += ft.gravity * dt;
            ft.vx *= 0.94;
          } else {
            ft.vy *= 0.96;
          }
          ft.life -= dt;
          if (ft.life <= 0) textPool.releaseAt(i);
        }
        for (let i = lootOrbs.length - 1; i >= 0; i--) {
          const lb = lootOrbs[i];
          lb.age = (lb.age || 0) + dt;
          // Showcase rarity equipment drop on ground briefly before magnetizing into player (#12)
          const holdTime = lb.slot ? 0.72 : 0.25;
          if (lb.age > holdTime) {
            lb.x += (pr.x - lb.x) * Math.min(1, dt * 6.5);
            lb.y += (pr.y - lb.y) * Math.min(1, dt * 6.5);
          }
          lb.life -= dt;
          if (lb.life <= 0 || (lb.age > holdTime && Math.hypot(pr.x - lb.x, pr.y - lb.y) < 18)) {
            lootOrbs.splice(i, 1);
          }
        }
        // Update dropped Treasure Chests on the battlefield
        for (let i = fieldChests.length - 1; i >= 0; i--) {
          const fc = fieldChests[i];
          fc.age += dt;
          fc.bounce = Math.max(0, fc.bounce - dt * 2.4);
          const distToPlayer = Math.hypot(pr.x - fc.x, pr.y - fc.y);
          const shouldMagnet = propsRef.current.autoBattle && fc.age > 3.2;
          if (shouldMagnet) {
            fc.x += (pr.x - fc.x) * Math.min(1, dt * 4.5);
            fc.y += (pr.y - fc.y) * Math.min(1, dt * 4.5);
          }
          if (distToPlayer < 42 || fc.age > 9) {
            const meta = CHEST_TIER_META[fc.tier];
            fieldChests.splice(i, 1);
            addParticles(fc.x, fc.y, meta.color, 16, 150);
            addFloatText(fc.x, fc.y - 22, `+1 ${meta.shortName} Rương`, meta.accentColor, 1.1);
            soundEngine.playChestDrop();
            propsRef.current.onCollectChest(fc.tier, fc.sourceName, false);
          }
        }
        for (const m of ambientMotes) {
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.y > height) {
            m.y = -6;
            m.x = Math.random() * width;
          }
          if (m.x < 0) m.x = width;
          if (m.x > width) m.x = 0;
        }

        // Update Dynamic Weather Simulation
        const activeWeather = propsRef.current.weather;
        if (activeWeather !== lastWeather) {
          lastWeather = activeWeather;
          weatherFade = 0.08;
        }
        weatherFade = Math.min(1, weatherFade + dt * 0.85);
        weatherClock += dt;
        lightningFlash = Math.max(0, lightningFlash - dt * 2.6);

        if (activeWeather === 'rain') {
          for (const d of rainDrops) {
            d.x -= d.speed * 0.24 * dt;
            d.y += d.speed * dt;
            if (d.y > height + 10) {
              d.y = -15 - Math.random() * 40;
              d.x = Math.random() * (width + 180);
              if (effectPools.rainRipples.activeCount < 24 && Math.random() < 0.35) {
                effectPools.spawnRainRipple(
                  30 + Math.random() * (width - 60),
                  90 + Math.random() * (height - 130),
                  1.5,
                  9 + Math.random() * 8,
                  0.42
                );
              }
            }
          }
          const ripplePool = effectPools.rainRipples;
          for (let i = ripplePool.activeCount - 1; i >= 0; i--) {
            const rp = ripplePool.items[i];
            rp.r += dt * 26;
            rp.alpha -= dt * 0.95;
            if (rp.alpha <= 0 || rp.r >= rp.maxR) ripplePool.releaseAt(i);
          }
          if (Math.random() < dt * 0.09) {
            lightningFlash = 0.24;
          }
        } else if (activeWeather === 'snow') {
          for (const f of snowFlakes) {
            f.y += f.vy * dt;
            f.x += Math.sin(weatherClock * 1.15 + f.driftPhase) * f.driftAmp * dt - 14 * dt;
            if (f.y > height + 8) {
              f.y = -8;
              f.x = Math.random() * (width + 40);
            }
            if (f.x < -12) f.x = width + 10;
            if (f.x > width + 12) f.x = -10;
          }
        } else if (activeWeather === 'mist') {
          for (const mb of mistBanks) {
            mb.x += mb.vx * dt;
            if (mb.x - mb.rx > width + 40) {
              mb.x = -mb.rx - 40;
              mb.y = height * (0.12 + Math.random() * 0.78);
            }
          }
        } else if (activeWeather === 'ash_wind') {
          for (const ws of windStreaks) {
            ws.x -= ws.speed * dt;
            ws.y += ws.speed * 0.16 * dt;
            if (ws.x + ws.len < -10 || ws.y > height + 10) {
              ws.x = width + 20 + Math.random() * 140;
              ws.y = Math.random() * height;
            }
          }
        }

        // Throttled HUD sync (~12Hz)
        hudSyncTimer += dt;
        if (hudSyncTimer >= 0.085) {
          hudSyncTimer = 0;
          const safeW = Math.max(1, width);
          const safeH = Math.max(1, height);
          const pNormX = Math.max(0.03, Math.min(0.97, pr.x / safeW));
          const pNormY = Math.max(0.03, Math.min(0.97, pr.y / safeH));
          // Classic Kiếm Thế 2009 map coordinate range (e.g. 160..240)
          const coordX = Math.round(160 + pNormX * 80);
          const coordY = Math.round(170 + pNormY * 70);

          const radarDots: RadarDot[] = [];
          let activeTarget: Unit | null = null;
          let bestTargetDist = Infinity;

          for (const u of units) {
            if (u.hp <= 0) continue;
            const nx = Math.max(0.03, Math.min(0.97, u.x / safeW));
            const ny = Math.max(0.03, Math.min(0.97, u.y / safeH));
            let dotKind: RadarDot['kind'] = 'mob';
            if (u.team === 'ally') dotKind = 'ally';
            else if (u.kind === 'boss' || u.kind === 'pillar' || u.kind === 'gate' || u.kind === 'banner') dotKind = 'boss';
            else if (u.kind === 'rival' || u.kind === 'wanderer') dotKind = 'rival';
            radarDots.push({ x: nx, y: ny, kind: dotKind });

            if (u.team === 'enemy' || (u.team === 'neutral' && u.aggro)) {
              if (pr.targetUnitId && u.id === pr.targetUnitId) {
                activeTarget = u;
                bestTargetDist = -1;
              } else if (bestTargetDist >= 0) {
                // Prioritize boss / rival, otherwise nearest enemy
                const isPriority = u.kind === 'boss' || u.kind === 'rival' || u.kind === 'pillar' || u.kind === 'gate';
                const d = Math.hypot(u.x - pr.x, u.y - pr.y) - (isPriority ? 1000 : 0);
                if (d < bestTargetDist) {
                  bestTargetDist = d;
                  activeTarget = u;
                }
              }
            }
          }

          for (const fc of fieldChests) {
            radarDots.push({
              x: Math.max(0.03, Math.min(0.97, fc.x / safeW)),
              y: Math.max(0.03, Math.min(0.97, fc.y / safeH)),
              kind: 'chest',
            });
          }

          propsRef.current.onHudUpdate({
            hp: Math.round(pr.hp),
            maxHp: pStats.maxHp,
            mp: Math.round(pr.mp),
            maxMp: pStats.maxMp,
            shield: Math.round(pr.shield),
            cooldowns: [...pr.cooldowns],
            dashCooldown: pr.dashCd,
            objectiveLabel,
            objectiveProgress,
            timerSec: battleTimer !== null ? Math.ceil(battleTimer) : null,
            playerCoord: { x: coordX, y: coordY },
            playerNorm: { x: pNormX, y: pNormY },
            radarDots,
            target: activeTarget
              ? {
                  name: activeTarget.name,
                  title: activeTarget.title,
                  hp: Math.max(0, Math.round(activeTarget.hp)),
                  maxHp: Math.max(1, Math.round(activeTarget.maxHp)),
                  element: activeTarget.element,
                  kind: activeTarget.kind,
                }
              : null,
          });
        }

        renderScene();
      };

      const renderScene = () => {
        const p = propsRef.current.player;
        const pStats = propsRef.current.stats;
        const sect = SECTS[p.sect];
        const mantle = MANTLES.find((m) => m.id === p.mantleId) || MANTLES[0];
        const title = TITLES.find((t) => t.id === p.activeTitleId);
        const curMode = propsRef.current.battle.mode;
        const map = MAPS.find((m) => m.id === p.currentMapId) || MAPS[0];

        ctx.save();
        if (shakeIntensity > 0.2) {
          ctx.translate(
            (Math.random() - 0.5) * shakeIntensity * 2,
            (Math.random() - 0.5) * shakeIntensity * 2
          );
        }

        // 1. Arena Background Art
        ctx.fillStyle = '#0D0A09';
        ctx.fillRect(0, 0, width, height);

        const bg = curMode === 'SIEGE' ? siegeImg : wildImg;
        if (bg.complete && bg.naturalWidth > 0) {
          const imgRatio = bg.naturalWidth / bg.naturalHeight;
          const canvasRatio = width / height;
          let dw = width;
          let dh = height;
          let dx = 0;
          let dy = 0;
          if (canvasRatio > imgRatio) {
            dh = width / imgRatio;
            dy = (height - dh) / 2;
          } else {
            dw = height * imgRatio;
            dx = (width - dw) / 2;
          }
          ctx.globalAlpha = 0.72;
          ctx.drawImage(bg, dx, dy, dw, dh);
          ctx.globalAlpha = 1;
        }

        // Map atmospheric tint & weather atmosphere veil
        const activeWeather = propsRef.current.weather;
        ctx.fillStyle = curMode === 'SIEGE' ? 'rgba(32, 10, 10, 0.28)' : map.tintColor;
        ctx.fillRect(0, 0, width, height);

        if (activeWeather === 'rain') {
          ctx.fillStyle = `rgba(12, 26, 46, ${(0.24 * weatherFade).toFixed(3)})`;
          ctx.fillRect(0, 0, width, height);
        } else if (activeWeather === 'snow') {
          ctx.fillStyle = `rgba(186, 230, 253, ${(0.08 * weatherFade).toFixed(3)})`;
          ctx.fillRect(0, 0, width, height);
        } else if (activeWeather === 'mist') {
          ctx.fillStyle = `rgba(148, 163, 184, ${(0.12 * weatherFade).toFixed(3)})`;
          ctx.fillRect(0, 0, width, height);
        } else if (activeWeather === 'ash_wind') {
          ctx.fillStyle = `rgba(92, 34, 14, ${(0.16 * weatherFade).toFixed(3)})`;
          ctx.fillRect(0, 0, width, height);
        } else if (activeWeather === 'clear') {
          // Subtle warm sunlight beams from upper-left
          ctx.save();
          ctx.globalAlpha = 0.08 * weatherFade;
          const sunGrad = ctx.createLinearGradient(0, 0, width * 0.65, height * 0.75);
          sunGrad.addColorStop(0, '#FDE68A');
          sunGrad.addColorStop(1, 'rgba(253, 230, 138, 0)');
          ctx.fillStyle = sunGrad;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        const vig = ctx.createRadialGradient(
          width * 0.5,
          height * 0.52,
          Math.min(width, height) * 0.28,
          width * 0.5,
          height * 0.52,
          Math.max(width, height) * 0.72
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(8,6,5,0.72)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, width, height);

        // Ground Rain Splash Ripples (drawn on battlefield floor from Object Pool)
        if (activeWeather === 'rain' && effectPools.rainRipples.activeCount > 0) {
          ctx.save();
          ctx.lineWidth = 1.2;
          const rpItems = effectPools.rainRipples.items;
          for (let i = 0; i < effectPools.rainRipples.activeCount; i++) {
            const rp = rpItems[i];
            ctx.strokeStyle = `rgba(186, 230, 253, ${(rp.alpha * weatherFade).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.4, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Ambient petals / snow / embers
        const moteColor =
          curMode === 'SIEGE' || curMode === 'BOSS'
            ? '#F97316'
            : map.ambientTheme === 'snow'
            ? '#E0F2FE'
            : map.ambientTheme === 'petals'
            ? '#FDA4AF'
            : '#F5D061';
        for (const m of ambientMotes) {
          ctx.globalAlpha = m.alpha;
          ctx.fillStyle = moteColor;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 2. Boss/Rival Danger Telegraphs (drawn on floor)
        for (const u of units) {
          if (u.telegraphTimer > 0 && u.telegraphMax > 0) {
            const pct = 1 - u.telegraphTimer / u.telegraphMax;
            ctx.save();
            ctx.beginPath();
            ctx.arc(u.telegraphX, u.telegraphY, u.telegraphRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(u.telegraphX, u.telegraphY, u.telegraphRadius * pct, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(220, 38, 38, 0.26)';
            ctx.fill();
            ctx.restore();
          }
        }

        // 3. Five-Element Skill VFX (from Zero-GC SkillRing Object Pool)
        const ringItems = effectPools.rings.items;
        for (let i = 0; i < effectPools.rings.activeCount; i++) {
          const r = ringItems[i];
          const progress = Math.max(0, Math.min(1, 1 - r.life / r.maxLife));
          const curRad = r.radius + (r.maxRadius - r.radius) * Math.min(1, progress * 1.15);
          drawFiveElementSkillVfx(
            ctx,
            r.x,
            r.y,
            curRad,
            progress,
            r.element || sect.element,
            r.color,
            r.accent,
            r.kind,
            r.angle
          );
        }

        // 4. Rarity Ground Loot Drops with Pixel Icons & Light Beams (#10, #12, #14)
        for (const lb of lootOrbs) {
          ctx.save();
          const age = lb.age || 0;
          const bob = Math.sin(age * 7) * 2.5;
          const q = lb.quality || 'white';
          const isHigh = q === 'purple' || q === 'gold' || q === 'mythic';

          // Dynamic ground light pool & vertical rarity beam
          drawDynamicLightPool(ctx, lb.x, lb.y + 4, isHigh ? 34 : 18, lb.color, isHigh ? 0.34 : 0.2);
          if (lb.slot) {
            const beamH = q === 'mythic' ? 88 : q === 'gold' ? 72 : q === 'purple' ? 54 : 36;
            const beamW = q === 'mythic' ? 18 : q === 'gold' ? 14 : 10;
            const bGrad = ctx.createLinearGradient(lb.x, lb.y + 4, lb.x, lb.y - beamH);
            bGrad.addColorStop(0, `${lb.color}BB`);
            bGrad.addColorStop(0.6, `${lb.color}44`);
            bGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = bGrad;
            ctx.fillRect(lb.x - beamW / 2, lb.y - beamH, beamW, beamH);

            // Crisp 16x16 Pixel Item Icon on ground
            const wKind = lb.slot === 'weapon' ? inferWeaponKind(lb.itemName, lb.sectId) : 'sword';
            const iconCanvas = spriteAtlas.getItemIconCanvas(lb.slot, q, wKind);
            ctx.fillStyle = 'rgba(14, 10, 8, 0.88)';
            ctx.strokeStyle = lb.color;
            ctx.lineWidth = isHigh ? 2 : 1.4;
            ctx.fillRect(Math.round(lb.x - 11), Math.round(lb.y - 11 + bob), 22, 22);
            ctx.strokeRect(Math.round(lb.x - 11), Math.round(lb.y - 11 + bob), 22, 22);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(iconCanvas, Math.round(lb.x - 9), Math.round(lb.y - 9 + bob), 18, 18);
          } else {
            ctx.fillStyle = lb.color;
            ctx.shadowColor = lb.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(lb.x, lb.y + bob, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }

          ctx.font = isHigh ? '700 11px "Be Vietnam Pro", sans-serif' : '600 10px "Be Vietnam Pro", sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(8, 6, 5, 0.92)';
          ctx.strokeText(lb.label, lb.x, lb.y - 16 + bob);
          ctx.fillStyle = lb.color;
          ctx.fillText(lb.label, lb.x, lb.y - 16 + bob);
          ctx.restore();
        }

        // 4b. Dropped Pulsing Treasure Chests on WILD battlefield
        for (const fc of fieldChests) {
          const meta = CHEST_TIER_META[fc.tier];
          const pulse = 0.5 + 0.5 * Math.sin(fc.age * 9.5);
          const jumpY = Math.sin(fc.bounce * Math.PI) * 26;
          const cy = fc.y - jumpY;

          ctx.save();
          // Pulsing vertical sky beam
          const beamH = fc.tier === 'imperial_gold' ? 112 : fc.tier === 'purple_gold' ? 88 : 68;
          const beamGrad = ctx.createLinearGradient(fc.x, cy, fc.x, cy - beamH);
          beamGrad.addColorStop(0, `${meta.color}${pulse > 0.5 ? 'AA' : '66'}`);
          beamGrad.addColorStop(0.5, `${meta.accentColor}33`);
          beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(fc.x - 13, cy - beamH, 26, beamH);

          // Ground pulsing aura ring
          ctx.strokeStyle = meta.color;
          ctx.globalAlpha = 0.4 + pulse * 0.5;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(fc.x, fc.y + 8, 22 + pulse * 4, 9 + pulse * 2, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Chest shadow
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.ellipse(fc.x, fc.y + 8, 16, 6, 0, 0, Math.PI * 2);
          ctx.fill();

          // Ornate chest body
          ctx.globalAlpha = 1;
          ctx.shadowColor = meta.color;
          ctx.shadowBlur = 10 + pulse * 12;
          ctx.fillStyle =
            fc.tier === 'imperial_gold'
              ? '#5C1912'
              : fc.tier === 'purple_gold'
              ? '#311442'
              : '#192B3D';
          ctx.strokeStyle = pulse > 0.65 ? '#FFFFFF' : meta.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(fc.x - 15, cy - 11, 30, 20, 4);
          ctx.fill();
          ctx.stroke();

          // Chest lid top highlight
          ctx.fillStyle = meta.color;
          ctx.fillRect(fc.x - 14, cy - 3, 28, 3);
          ctx.fillRect(fc.x - 10, cy - 11, 4, 20);
          ctx.fillRect(fc.x + 6, cy - 11, 4, 20);

          // Blinking gemstone clasp
          ctx.fillStyle = pulse > 0.5 ? '#FFFFFF' : meta.accentColor;
          ctx.beginPath();
          ctx.arc(fc.x, cy - 1, 3.8, 0, Math.PI * 2);
          ctx.fill();

          // Orbiting twinkling sparkles
          for (let s = 0; s < 3; s++) {
            const ang = fc.age * 3.8 + (s * Math.PI * 2) / 3;
            const sx = fc.x + Math.cos(ang) * 20;
            const sy = cy - 4 + Math.sin(ang) * 10;
            ctx.fillStyle = s % 2 === 0 ? '#FEF9C3' : meta.color;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.8 + pulse * 1.1, 0, Math.PI * 2);
            ctx.fill();
          }

          // Chest Label
          ctx.shadowBlur = 0;
          ctx.font = '700 11px "Be Vietnam Pro", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = pulse > 0.6 ? '#FEF9C3' : meta.color;
          ctx.fillText(`✦ ${meta.shortName} Rương (Nhấn Mở)`, fc.x, cy - 18);
          ctx.restore();
        }

        // 5. Units + Dying Units + Player (Zero-Allocation Y-Depth Queue Sort)
        effectPools.beginDrawOrder();
        for (let i = 0; i < dyingUnits.length; i++) {
          const du = dyingUnits[i];
          effectPools.pushDrawOrder(du.unit.y, false, du.unit, du.progress);
        }
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          effectPools.pushDrawOrder(u.y, false, u, 0);
        }
        effectPools.pushDrawOrder(pr.y, true, null, 0);
        effectPools.sortDrawOrder();

        const activeMount =
          p.isMounted && p.activeMountId
            ? MOUNTS.find((m) => m.id === p.activeMountId) || null
            : null;
        const activeIllusion =
          activeMount && p.activeMountIllusionId
            ? MOUNT_ILLUSIONS.find((x) => x.id === p.activeMountIllusionId) || null
            : null;
        const illusionStars = activeIllusion ? p.mountIllusions?.[activeIllusion.id] || 1 : 0;
        const playerRealm = getCharacterRealm(p);

        const pkSlaughterActive =
          curMode === 'WILD' && !map.isSafeZone && p.pkMode === 'slaughter';

        const playerAnim = atlasHub.getAnim(PLAYER_ENTITY_ID, pr.facing);
        for (let i = 0; i < effectPools.drawOrderCount; i++) {
          const item = effectPools.drawOrder[i];
          if (item.isPlayer) {
            drawPlayerEntity(
              ctx,
              pr.x,
              pr.y,
              sect.color,
              mantle.color,
              mantle.id,
              title?.name,
              title?.color,
              p.name,
              propsRef.current.guild?.name,
              pr.hp,
              pStats.maxHp,
              pr.shield,
              playerAnim,
              atlasHub.globalPhase,
              p.sect,
              activeMount,
              activeIllusion,
              illusionStars,
              p.pkPoints,
              pkSlaughterActive ? 'slaughter' : 'peace',
              pStats.pkPenaltyPct,
              p.equipment,
              playerRealm.tier,
              pr.isMoving
            );
          } else if (item.unit) {
            drawNpcOrEnemy(
              ctx,
              item.unit,
              item.deathProgress === 0 && pr.targetUnitId === item.unit.id,
              atlasHub.globalPhase,
              pkSlaughterActive,
              item.deathProgress
            );
          }
        }

        // 6. Projectiles (from Zero-GC Projectile Object Pool)
        const projItems = effectPools.projectiles.items;
        for (let i = 0; i < effectPools.projectiles.activeCount; i++) {
          const proj = projItems[i];
          ctx.save();
          ctx.fillStyle = proj.color;
          ctx.shadowColor = proj.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = proj.accent;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 7. Particles (from Zero-GC Particle Object Pool: dots, crit sparks, shards, 4-point stars)
        const ptItems = effectPools.particles.items;
        for (let i = 0; i < effectPools.particles.activeCount; i++) {
          const pt = ptItems[i];
          const alpha = Math.max(0, Math.min(1, pt.life / Math.max(0.01, pt.maxLife)));
          if (pt.kind === 'dot') {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (pt.kind === 'spark') {
            ctx.save();
            ctx.globalAlpha = alpha;
            const tailX = pt.x - pt.vx * 0.036;
            const tailY = pt.y - pt.vy * 0.036;
            ctx.strokeStyle = pt.color;
            ctx.lineWidth = Math.max(1.2, pt.size * alpha);
            ctx.lineCap = 'round';
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 9;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
            // White-hot leading tip
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, Math.max(1, pt.size * 0.52 * alpha), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (pt.kind === 'shard') {
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.rotation);
            ctx.globalAlpha = alpha;
            const s = pt.size * (0.55 + alpha * 0.45);
            ctx.fillStyle = pt.color;
            ctx.shadowColor = '#F5D061';
            ctx.shadowBlur = 7;
            ctx.beginPath();
            ctx.moveTo(0, -s * 1.35);
            ctx.lineTo(s * 0.65, 0);
            ctx.lineTo(0, s * 1.35);
            ctx.lineTo(-s * 0.65, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else if (pt.kind === 'star') {
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.rotation);
            ctx.globalAlpha = alpha;
            const rOuter = pt.size * (0.65 + alpha * 0.55);
            const rInner = rOuter * 0.24;
            ctx.fillStyle = pt.color;
            ctx.shadowColor = '#FEF08A';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
              const rad = k % 2 === 0 ? rOuter : rInner;
              const ang = (k * Math.PI) / 4;
              const px = Math.cos(ang) * rad;
              const py = Math.sin(ang) * rad;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;

        // 7.5 Dynamic Weather Foreground Layer (Rain / Snow / Mist / Ash Wind)
        ctx.save();
        if (activeWeather === 'rain') {
          ctx.lineWidth = 1.25;
          for (const d of rainDrops) {
            ctx.strokeStyle = `rgba(191, 219, 254, ${(d.alpha * weatherFade).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.len * 0.24, d.y + d.len);
            ctx.stroke();
          }
          if (lightningFlash > 0.01) {
            ctx.fillStyle = `rgba(224, 242, 254, ${(lightningFlash * weatherFade).toFixed(3)})`;
            ctx.fillRect(0, 0, width, height);
          }
        } else if (activeWeather === 'snow') {
          for (const f of snowFlakes) {
            ctx.globalAlpha = f.alpha * weatherFade;
            ctx.fillStyle = '#F0F9FF';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (activeWeather === 'mist') {
          for (const mb of mistBanks) {
            const g = ctx.createRadialGradient(mb.x, mb.y, mb.ry * 0.1, mb.x, mb.y, mb.rx);
            g.addColorStop(0, `rgba(216, 226, 236, ${(mb.alpha * weatherFade).toFixed(3)})`);
            g.addColorStop(0.55, `rgba(186, 200, 216, ${(mb.alpha * 0.45 * weatherFade).toFixed(3)})`);
            g.addColorStop(1, 'rgba(186, 200, 216, 0)');
            ctx.save();
            ctx.translate(mb.x, mb.y);
            ctx.scale(1, mb.ry / mb.rx);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, mb.rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else if (activeWeather === 'ash_wind') {
          ctx.lineWidth = 1.6;
          for (const ws of windStreaks) {
            ctx.globalAlpha = ws.alpha * weatherFade;
            ctx.strokeStyle = ws.color;
            ctx.beginPath();
            ctx.moveTo(ws.x, ws.y);
            ctx.lineTo(ws.x + ws.len, ws.y - ws.len * 0.16);
            ctx.stroke();
          }
        }
        ctx.restore();

        // 8. Floating Combat Numbers (Zero-GC Pool with Radiant Golden Critical Hit Pop Animation)
        const ftItems = effectPools.floatTexts.items;
        for (let i = 0; i < effectPools.floatTexts.activeCount; i++) {
          const ft = ftItems[i];
          ctx.save();
          if (ft.isCrit) {
            const elapsed = 1 - ft.life / Math.max(0.01, ft.maxLife);
            // Elastic martial impact pop: 0.42 -> 1.48 (punch) -> 1.06 (settle)
            let pop = 1.06;
            if (elapsed < 0.11) {
              const t = elapsed / 0.11;
              pop = 0.42 + t * 1.06;
            } else if (elapsed < 0.24) {
              const t = (elapsed - 0.11) / 0.13;
              pop = 1.48 - t * 0.42;
            }
            const alpha = elapsed > 0.7 ? Math.max(0, (1 - elapsed) / 0.3) : 1;

            ctx.translate(ft.x, ft.y);
            ctx.scale(pop, pop);
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const mainSize = Math.round(16 * ft.scale);
            const subSize = Math.max(10, Math.round(mainSize * 0.44));

            // Radiant golden flare halo right on impact pop
            if (elapsed < 0.26) {
              const flareAlpha = (1 - elapsed / 0.26) * 0.65;
              const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, mainSize * 1.65);
              halo.addColorStop(0, `rgba(255, 251, 235, ${flareAlpha.toFixed(3)})`);
              halo.addColorStop(0.45, `rgba(245, 208, 97, ${(flareAlpha * 0.72).toFixed(3)})`);
              halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(0, 0, mainSize * 1.65, 0, Math.PI * 2);
              ctx.fill();
            }

            // Top Callout Header ("★ CHÍ MẠNG! ★")
            if (ft.subText) {
              ctx.font = `800 ${subSize}px "Be Vietnam Pro", sans-serif`;
              ctx.lineWidth = 3.6;
              ctx.strokeStyle = 'rgba(24, 12, 4, 0.96)';
              ctx.shadowColor = ft.critTint === 'crimson_gold' ? '#EF4444' : '#F59E0B';
              ctx.shadowBlur = 10;
              ctx.strokeText(ft.subText, 0, -mainSize * 0.76);
              ctx.fillStyle = ft.critTint === 'crimson_gold' ? '#FDE68A' : '#FFFBEB';
              ctx.fillText(ft.subText, 0, -mainSize * 0.76);
            }

            // Giant Radiant Imperial-Gold Damage Number
            ctx.font = `900 ${mainSize}px "JetBrains Mono", monospace`;
            const goldGrad = ctx.createLinearGradient(0, -mainSize * 0.55, 0, mainSize * 0.55);
            goldGrad.addColorStop(0, '#FFFFFF');
            goldGrad.addColorStop(0.32, '#FEF08A');
            goldGrad.addColorStop(0.68, '#F5D061');
            goldGrad.addColorStop(1, ft.critTint === 'crimson_gold' ? '#EA580C' : '#D97706');

            ctx.lineWidth = 5.2;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(28, 13, 3, 0.96)';
            ctx.shadowColor = ft.critTint === 'crimson_gold' ? '#F97316' : '#F59E0B';
            ctx.shadowBlur = 16;
            ctx.strokeText(ft.text, 0, 0);

            ctx.fillStyle = goldGrad;
            ctx.fillText(ft.text, 0, 0);
          } else {
            ctx.globalAlpha = Math.min(1, ft.life / 0.35);
            const fontSize = Math.round(13 * ft.scale);
            ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(10, 8, 7, 0.9)';
            ctx.strokeText(ft.text, ft.x, ft.y);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
          }
          ctx.restore();
        }

        ctx.restore();

        // 9. Screen-Space Wuxia Damage Combo Overlay (x2, x3, x5)
        if (combo.count >= 2 || combo.breakTimer > 0) {
          drawComboHud(ctx, width, height, combo, pr.animPhase);
        }
      };

      rafId = requestAnimationFrame(step);

      return () => {
        cancelAnimationFrame(rafId);
        effectPools.resetAll();
        atlasHub.clear();
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      };
    }, [battleKey]);

    return (
      <div className="relative h-full w-full overflow-hidden bg-[#0B0908]">
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-crosshair"
        />
      </div>
    );
  }
);

function drawPlayerEntity(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sectColor: string,
  mantleColor: string,
  mantleId: number,
  titleName: string | undefined,
  titleColor: string | undefined,
  name: string,
  guildName: string | undefined,
  hp: number,
  maxHp: number,
  shield: number,
  anim: SpriteAnimMachine,
  animPhase: number,
  sectId: SectId,
  mount: MountDef | null,
  illusion: MountIllusionDef | null,
  illusionStars: number,
  pkPoints: number,
  pkMode: PkMode,
  pkPenaltyPct: number,
  equipment: Record<EquipSlot, EquipmentItem | null>,
  realmTier: number,
  isMoving: boolean
) {
  ctx.save();
  const isMounted = !!mount;
  const dir8 = anim.dir8;

  // 1. Dynamic Ground Shadow (#14)
  drawDynamicShadow(
    ctx,
    x,
    y + 18,
    isMounted ? (illusion ? 35 : 30) : 21,
    isMounted ? 11 : 8,
    0
  );

  // 2. Đồ Sát (PK) & Sát Khí Animated Crimson Aura Rings (Vòng Tròn Hào Quang Đỏ)
  if (pkMode === 'slaughter') {
    const baseR = isMounted ? 50 : 40;
    const breathe = 1 + Math.sin(animPhase * 1.4) * 0.065;
    const waveProgress = (animPhase * 0.22) % 1;

    ctx.save();
    ctx.translate(x, y + 17);
    ctx.scale(1, 0.46);

    // Pulsing crimson ground radiance
    const floorGrad = ctx.createRadialGradient(0, 0, baseR * 0.15, 0, 0, baseR * 1.25);
    floorGrad.addColorStop(0, 'rgba(220, 38, 38, 0.36)');
    floorGrad.addColorStop(0.65, 'rgba(185, 28, 28, 0.18)');
    floorGrad.addColorStop(1, 'rgba(185, 28, 28, 0)');
    ctx.fillStyle = floorGrad;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // Expanding crimson shockwave ring
    ctx.strokeStyle = '#F87171';
    ctx.lineWidth = 2.2 * (1 - waveProgress * 0.5);
    ctx.globalAlpha = (1 - waveProgress) * 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * (0.72 + waveProgress * 0.62), 0, Math.PI * 2);
    ctx.stroke();

    // Primary glowing crimson full circle
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = '#EF4444';
    ctx.shadowColor = '#DC2626';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, baseR * breathe, 0, Math.PI * 2);
    ctx.stroke();

    // Counter-rotating segmented crimson battle-ring arcs
    ctx.strokeStyle = '#FCA5A5';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 3; k++) {
      const startA = -animPhase * 0.55 + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, (baseR + 7) * breathe, startA, startA + Math.PI * 0.42);
      ctx.stroke();
    }

    // Rotating crimson spikes / ticks around ring perimeter
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    for (let k = 0; k < 8; k++) {
      const a = animPhase * 0.4 + (k * Math.PI) / 4;
      const rIn = baseR * breathe - 3;
      const rOut = baseR * breathe + 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.stroke();
    }

    ctx.restore();
  } else if (pkPoints > 0) {
    // Passive Hồng Danh (Sát Khí) warning ring
    ctx.save();
    ctx.translate(x, y + 17);
    ctx.scale(1, 0.44);
    const pulse = 1 + Math.sin(animPhase * 1.4) * 0.06;
    ctx.strokeStyle = '#EF4444';
    ctx.shadowColor = '#DC2626';
    ctx.shadowBlur = 12;
    ctx.lineWidth = pkPoints >= 4 ? 2.8 : 2;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, (isMounted ? 38 : 30) * pulse, -animPhase * 0.5, -animPhase * 0.5 + Math.PI * 1.55);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Phi Phong (Mantle) Rotating Aura Ring
  if (mantleId >= 1) {
    ctx.save();
    ctx.translate(x, y + 15);
    ctx.scale(1, 0.45);
    ctx.strokeStyle = mantleColor;
    ctx.lineWidth = mantleId >= 4 ? 3 : 2;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(0, 0, (isMounted ? 32 : 26) + mantleId * 2, animPhase * 0.5, animPhase * 0.5 + Math.PI * 1.45);
    ctx.stroke();
    if (mantleId >= 3) {
      ctx.beginPath();
      ctx.arc(0, 0, (isMounted ? 38 : 32) + mantleId * 2, -animPhase * 0.4, -animPhase * 0.4 + Math.PI * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4. HD Pixel Art Mount + Mount Evolution (Pre-baked 8-Dir Atlas Blit)
  let riderY = y;
  let riderX = x;
  if (mount) {
    const mountCols = isMoving ? 6 : 4;
    const mountRes = drawPixelMount(ctx, {
      x,
      y: y + 3,
      dir8,
      animPhase,
      frameIndex: Math.floor(anim.mountPhase) % mountCols,
      isMoving,
      mount,
      illusion,
      illusionStars,
    });
    riderY = y + 3 + mountRes.riderOffsetY;
    riderX = x + mountRes.riderOffsetX;
  }

  // 5. Protective Shield Bubble
  if (shield > 0) {
    ctx.strokeStyle = '#67E8F9';
    ctx.fillStyle = 'rgba(103, 232, 249, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(riderX, riderY - 4, isMounted ? 36 : 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 6. State-Driven 8-Dir Pixel Hero (O(1) Pre-baked Sprite Atlas Blit)
  drawPixelHero(ctx, {
    x: riderX,
    y: riderY,
    sectId,
    dir8,
    animState: anim.state,
    animPhase,
    frameIndex: anim.frameIndex,
    normalizedTime: anim.normalizedTime,
    attackProgress: anim.state === 'attack' ? anim.normalizedTime : 0,
    castProgress: anim.state === 'cast' ? anim.normalizedTime : 0,
    hitFlash: anim.hitFlashTimer,
    equipment,
    realmTier,
    mantleId,
    mantleColor,
    isMounted,
    scale: isMounted ? 1.02 : 1.08,
  });

  // 7. Circular Upright Crimson Aura Halo & Rising Embers when Đồ Sát (PK) is active
  if (pkMode === 'slaughter') {
    const haloY = riderY - 6;
    const haloR = (isMounted ? 38 : 31) + Math.sin(animPhase * 1.5) * 2.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.68)';
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, haloY, haloR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#FCA5A5';
    ctx.lineWidth = 2.4;
    for (let c = 0; c < 2; c++) {
      const a = animPhase * 0.7 + c * Math.PI;
      ctx.beginPath();
      ctx.arc(x, haloY, haloR, a, a + 0.72);
      ctx.stroke();
    }

    ctx.shadowBlur = 8;
    for (let e = 0; e < 6; e++) {
      const t = ((animPhase * 0.28) + e * 0.167) % 1;
      const ex = x + Math.cos(e * 2.1 + animPhase * 0.45) * (haloR * 0.78);
      const ey = y + 16 - t * (isMounted ? 66 : 54);
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.92;
      ctx.fillStyle = e % 2 === 0 ? '#EF4444' : '#FCA5A5';
      ctx.beginPath();
      ctx.arc(ex, ey, 2.4 * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 8. Overhead HP bar
  const barW = 54;
  const barY = riderY - 38;
  ctx.fillStyle = 'rgba(10, 8, 7, 0.85)';
  ctx.fillRect(x - barW / 2, barY, barW, 5);
  ctx.fillStyle = '#22C55E';
  ctx.fillRect(x - barW / 2, barY, barW * Math.max(0, hp / Math.max(1, maxHp)), 5);

  // 9. Name + Guild + Title + Hồng Danh Sát Khí
  ctx.textAlign = 'center';
  ctx.font = '700 12px "Be Vietnam Pro", sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8,6,5,0.92)';
  const baseLabel = guildName ? `[${guildName}] ${name}` : name;
  const label = pkPoints > 0 ? `${baseLabel} [PK ${pkPoints}]` : baseLabel;
  ctx.strokeText(label, x, barY - 5);
  ctx.fillStyle = pkPoints > 0 || pkMode === 'slaughter' ? '#F87171' : '#FEF3C7';
  ctx.fillText(label, x, barY - 5);

  let extraLineY = barY - 19;
  if (titleName) {
    ctx.font = '600 11px "Cormorant Garamond", serif';
    ctx.strokeText(`« ${titleName} »`, x, extraLineY);
    ctx.fillStyle = titleColor || sectColor || '#F5D061';
    ctx.fillText(`« ${titleName} »`, x, extraLineY);
    extraLineY -= 13;
  }
  if (pkMode === 'slaughter') {
    const blink = 0.72 + 0.28 * Math.sin(animPhase * 2.2);
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.font = '700 10px "Be Vietnam Pro", sans-serif';
    ctx.strokeText('⚔ ĐỒ SÁT (PK)', x, extraLineY);
    ctx.fillStyle = '#EF4444';
    ctx.fillText('⚔ ĐỒ SÁT (PK)', x, extraLineY);
    ctx.restore();
    extraLineY -= 13;
  }
  if (pkPenaltyPct > 0) {
    ctx.font = '700 10px "Be Vietnam Pro", sans-serif';
    ctx.strokeText(`Sát Khí Phản Phệ -${pkPenaltyPct}%`, x, extraLineY);
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText(`Sát Khí Phản Phệ -${pkPenaltyPct}%`, x, extraLineY);
  }
  ctx.restore();
}

function drawNpcOrEnemy(
  ctx: CanvasRenderingContext2D,
  u: Unit,
  isSelected: boolean,
  animPhase: number,
  pkSlaughterActive = false,
  deathProgress = 0
) {
  ctx.save();
  const anim = u.anim || createAnimMachine(u.facing, deathProgress > 0 ? 'death' : 'idle');
  const dir8 = anim.dir8;

  // Target lock ring (only for living units)
  if (isSelected && deathProgress === 0) {
    ctx.strokeStyle = '#F5D061';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + u.radius * 0.78, u.radius + 8, (u.radius + 8) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Martial artist rivals & wandering PK heroes render with state-driven 8-dir Hero Atlas
  if ((u.kind === 'wanderer' || u.kind === 'rival') && u.masterSect) {
    const isHostile = u.kind === 'rival' || Boolean(u.aggro || pkSlaughterActive);
    drawDynamicShadow(ctx, u.x, u.y + 18, 20, 7.5, 0);

    if (deathProgress === 0) {
      ctx.strokeStyle = isHostile ? '#EF4444' : '#34D399';
      ctx.lineWidth = isHostile ? 2.2 : 1.5;
      ctx.globalAlpha = isHostile ? 0.78 : 0.45;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 16, 24, 9.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    if (deathProgress > 0) {
      ctx.globalAlpha = Math.max(0, 1 - deathProgress);
    }
    const mantleDef = MANTLES.find((m) => m.id === (u.mantleId || 0)) || MANTLES[0];
    drawPixelHero(ctx, {
      x: u.x,
      y: u.y,
      sectId: u.masterSect,
      dir8,
      animState: anim.state,
      animPhase: animPhase + u.x * 0.04,
      frameIndex: anim.frameIndex,
      normalizedTime: anim.normalizedTime,
      attackProgress: anim.state === 'attack' ? anim.normalizedTime : 0,
      castProgress: anim.state === 'cast' ? anim.normalizedTime : 0,
      hitFlash: anim.hitFlashTimer,
      realmTier: u.kind === 'rival' ? Math.max(2, u.mantleId || 2) : Math.max(1, u.mantleId || 1),
      mantleId: u.mantleId || 0,
      mantleColor: mantleDef.color,
      isMounted: false,
      scale: u.kind === 'rival' ? 1.08 : 1.0,
    });
    ctx.restore();
  } else {
    // Distinct HD Pixel Art Monsters, Elites, Bosses, Siege NPCs & Structures (State-Driven Atlas Blit)
    const archetype = u.archetype || resolveMonsterArchetype(u.name, u.kind);
    const shadowRx =
      u.kind === 'boss'
        ? 36
        : u.kind === 'gate' || u.kind === 'pillar' || u.kind === 'banner'
        ? 32
        : u.kind === 'elite'
        ? 25
        : 19;
    drawDynamicShadow(ctx, u.x, u.y + (u.kind === 'boss' ? 24 : 17), shadowRx, shadowRx * 0.36, 0);

    drawPixelMonster(ctx, {
      x: u.x,
      y: u.y,
      archetype,
      color: u.color,
      accentColor: u.accentColor,
      dir8,
      animState: anim.state,
      animPhase: animPhase + u.x * 0.03,
      frameIndex: anim.frameIndex,
      attackProgress: anim.state === 'attack' ? anim.normalizedTime : 0,
      hitFlash: anim.hitFlashTimer,
      deathProgress,
      alertTimer: u.alertTimer || 0,
      enraged: Boolean(u.enraged),
      roarTimer: u.roarTimer || 0,
      isElite: u.kind === 'elite',
    });
  }

  // Skip overhead bars & labels during collapse/death dissolve
  if (deathProgress > 0) {
    ctx.restore();
    return;
  }

  // Status effect indicators (Poison / Stun)
  if (u.poisonTimer > 0) {
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + 12, u.radius + 5, (u.radius + 5) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (u.stunTimer > 0) {
    ctx.fillStyle = '#FDE047';
    ctx.font = '700 11px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ CHOÁNG', u.x, u.y - u.radius - 32);
  }

  // Overhead HP bar
  const isHostileWanderer = u.kind === 'wanderer' && (u.aggro || pkSlaughterActive);
  const barW =
    u.kind === 'boss' || u.kind === 'gate' || u.kind === 'pillar' || u.kind === 'banner' ? 88 : 52;
  const barY =
    u.y -
    (u.kind === 'gate' || u.kind === 'pillar' || u.kind === 'banner'
      ? 58
      : u.kind === 'boss'
      ? 52
      : u.kind === 'wanderer' || u.kind === 'rival'
      ? 38
      : u.radius + 20);
  ctx.fillStyle = 'rgba(10, 8, 7, 0.88)';
  ctx.fillRect(u.x - barW / 2, barY, barW, 5);
  ctx.fillStyle =
    u.team === 'ally'
      ? '#38BDF8'
      : u.kind === 'wanderer' && !isHostileWanderer
      ? '#34D399'
      : u.kind === 'boss'
      ? u.enraged
        ? '#EF4444'
        : '#F59E0B'
      : '#DC2626';
  ctx.fillRect(u.x - barW / 2, barY, barW * Math.max(0, u.hp / Math.max(1, u.maxHp)), 5);

  // Name
  ctx.textAlign = 'center';
  ctx.font = u.kind === 'boss' ? '700 13px "Be Vietnam Pro", sans-serif' : '600 11px "Be Vietnam Pro", sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8, 6, 5, 0.92)';
  const displayName =
    u.kind === 'wanderer'
      ? `${isHostileWanderer ? '[PK] ' : ''}${u.name}`
      : u.kind === 'boss' && u.enraged
      ? `🔥 ${u.name}`
      : u.name;
  ctx.strokeText(displayName, u.x, barY - 4);
  ctx.fillStyle =
    u.team === 'ally'
      ? '#93C5FD'
      : u.kind === 'wanderer'
      ? isHostileWanderer
        ? '#FCA5A5'
        : '#A7F3D0'
      : u.kind === 'boss'
      ? u.enraged
        ? '#FCA5A5'
        : '#F5D061'
      : '#F3EAD8';
  ctx.fillText(displayName, u.x, barY - 4);

  if (u.title) {
    ctx.font = '600 10px "Be Vietnam Pro", sans-serif';
    ctx.strokeText(u.title, u.x, barY - 17);
    ctx.fillStyle = u.kind === 'wanderer' ? '#C7B89E' : '#FDE68A';
    ctx.fillText(u.title, u.x, barY - 17);
  }
  ctx.restore();
}

/**
 * Renders the authentic Kiếm Thế 2009 Wuxia Damage Combo HUD (x2, x3, x5)
 * directly in BattleCanvas screen space with spring recoil, sculpted multiplier seal,
 * depleting continuity bar, and cumulative streak damage.
 */
function drawComboHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  combo: ComboState,
  animPhase: number
) {
  const isCompact = width < 760 || height < 540;
  const x = isCompact ? 14 : 22;
  const y = Math.max(150, Math.min(206, Math.round(height * 0.29)));

  ctx.save();

  // Brief fading epilogue banner when a high combo streak (>= 5) ends or is interrupted
  if (combo.count < 2 && combo.breakTimer > 0) {
    const alpha = Math.min(1, combo.breakTimer / 0.55);
    ctx.globalAlpha = alpha;
    const panelW = 196;
    const panelH = 44;

    ctx.beginPath();
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + panelW, y);
    ctx.lineTo(x + panelW - 10, y + panelH);
    ctx.lineTo(x, y + panelH);
    ctx.closePath();
    ctx.fillStyle = combo.brokenByHit ? 'rgba(52, 14, 16, 0.86)' : 'rgba(18, 22, 26, 0.82)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = combo.brokenByHit ? '#F87171' : '#8596A1';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '700 11px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = combo.brokenByHit ? '#FCA5A5' : '#CBD5E1';
    ctx.fillText(
      combo.brokenByHit ? 'BỊ NGẮT LIÊN TRẢM' : 'KẾT THÚC LIÊN TRẢM',
      x + 14,
      y + 18
    );

    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#F5D061';
    ctx.fillText(
      `${combo.brokenCount} Đòn · Cấp x${combo.brokenTier}`,
      x + 14,
      y + 34
    );

    ctx.restore();
    return;
  }

  const spec = resolveComboTier(combo.count);
  const ratio = Math.max(0, Math.min(1, combo.timer / Math.max(0.01, combo.maxTimer)));
  const urgentPulse = ratio < 0.28 ? 0.58 + 0.42 * Math.sin(animPhase * 22) : 1;
  const panelW = isCompact ? 196 : 222;
  const panelH = isCompact ? 80 : 88;

  // 1. Skewed Wuxia Ink-Steel Banner Backdrop
  ctx.save();
  ctx.globalAlpha = 0.94 * (ratio < 0.16 ? 0.65 + ratio * 2 : 1);

  const bgGrad = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
  if (spec.mult === 5) {
    bgGrad.addColorStop(0, 'rgba(66, 12, 14, 0.92)');
    bgGrad.addColorStop(0.58, 'rgba(28, 10, 12, 0.88)');
    bgGrad.addColorStop(1, 'rgba(12, 14, 18, 0.45)');
  } else if (spec.mult === 3) {
    bgGrad.addColorStop(0, 'rgba(56, 24, 10, 0.9)');
    bgGrad.addColorStop(0.62, 'rgba(22, 16, 14, 0.86)');
    bgGrad.addColorStop(1, 'rgba(12, 14, 18, 0.42)');
  } else if (spec.mult === 2) {
    bgGrad.addColorStop(0, 'rgba(42, 34, 14, 0.88)');
    bgGrad.addColorStop(0.65, 'rgba(16, 20, 24, 0.84)');
    bgGrad.addColorStop(1, 'rgba(12, 15, 19, 0.4)');
  } else {
    bgGrad.addColorStop(0, 'rgba(22, 29, 35, 0.86)');
    bgGrad.addColorStop(0.7, 'rgba(12, 16, 20, 0.78)');
    bgGrad.addColorStop(1, 'rgba(12, 15, 19, 0.3)');
  }

  ctx.beginPath();
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + panelW, y);
  ctx.lineTo(x + panelW - 14, y + panelH);
  ctx.lineTo(x, y + panelH);
  ctx.closePath();
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Metallic top & left bevel rail (Kiếm Thế 2009 steel-gold border)
  ctx.lineWidth = spec.mult >= 3 ? 1.8 : 1.3;
  ctx.strokeStyle = spec.mult >= 2 ? spec.primary : '#899AA5';
  ctx.stroke();

  // Left vertical glowing accent bar
  ctx.fillStyle = spec.primary;
  ctx.shadowColor = spec.glow;
  ctx.shadowBlur = spec.mult >= 3 ? 12 : 6;
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 2);
  ctx.lineTo(x + 13, y + 2);
  ctx.lineTo(x + 5, y + panelH - 2);
  ctx.lineTo(x + 1, y + panelH - 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Tier-up bright flash sheen sweeping across banner
  if (combo.tierFlash > 0.02) {
    ctx.save();
    ctx.globalAlpha = combo.tierFlash * 0.55;
    ctx.fillStyle = spec.accent;
    ctx.beginPath();
    ctx.moveTo(x + 10, y);
    ctx.lineTo(x + panelW, y);
    ctx.lineTo(x + panelW - 14, y + panelH);
    ctx.lineTo(x, y + panelH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Animated embers inside x3 / x5 banner
  if (spec.mult >= 3) {
    const emberCount = spec.mult === 5 ? 6 : 3;
    for (let i = 0; i < emberCount; i++) {
      const t = (animPhase * (1.2 + i * 0.25) + i * 0.37) % 1;
      const ex = x + 16 + t * (panelW - 36);
      const ey = y + panelH - 14 - Math.sin(t * Math.PI * 2 + i) * 14 - t * 24;
      ctx.globalAlpha = (1 - t) * 0.78;
      ctx.fillStyle = i % 2 === 0 ? spec.accent : spec.primary;
      ctx.beginPath();
      ctx.arc(ex, ey, spec.mult === 5 ? 2.1 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 2. Giant Spring-Punched Combo Counter
  const numX = x + 22;
  const numY = y + (isCompact ? 38 : 42);
  ctx.save();
  ctx.translate(numX, numY);
  ctx.scale(combo.popScale, combo.popScale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const countFontSize = isCompact ? 29 : 34;
  ctx.font = `900 ${countFontSize}px "JetBrains Mono", monospace`;

  const numGrad = ctx.createLinearGradient(0, -countFontSize, 0, 4);
  numGrad.addColorStop(0, '#FFFFFF');
  numGrad.addColorStop(0.45, spec.accent);
  numGrad.addColorStop(1, spec.primary);

  ctx.lineWidth = 4.5;
  ctx.strokeStyle = 'rgba(8, 7, 6, 0.96)';
  ctx.shadowColor = spec.glow;
  ctx.shadowBlur = spec.mult >= 3 ? 16 : 8;
  ctx.strokeText(`${combo.count}`, 0, 0);
  ctx.fillStyle = numGrad;
  ctx.fillText(`${combo.count}`, 0, 0);
  ctx.restore();

  // "HITS" micro label next to count
  const countDigits = String(combo.count).length;
  const afterNumX = numX + countDigits * (isCompact ? 18 : 21) + 6;
  ctx.textAlign = 'left';
  ctx.font = '800 9px "JetBrains Mono", monospace';
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('LIÊN', afterNumX, numY - 14);
  ctx.fillText('KÍCH', afterNumX, numY - 4);

  // 3. Sculpted Multiplier Seal Stamp (x2, x3, x5)
  const sealCx = x + panelW - (isCompact ? 36 : 40);
  const sealCy = y + (isCompact ? 27 : 29);
  const sealR = isCompact ? 19 : 22;

  ctx.save();
  ctx.translate(sealCx, sealCy);
  const sealScale =
    spec.mult >= 2
      ? 1 + (combo.popScale - 1) * 0.65 + (spec.mult === 5 ? Math.sin(animPhase * 9) * 0.045 : 0)
      : 0.92;
  ctx.scale(sealScale, sealScale);

  // Expanding shockwave ring on tier upgrade
  if (combo.tierFlash > 0.05) {
    ctx.save();
    ctx.globalAlpha = combo.tierFlash * 0.85;
    ctx.strokeStyle = spec.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, sealR + (1 - combo.tierFlash) * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Octagonal martial seal badge
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const px = Math.cos(a) * sealR;
    const py = Math.sin(a) * sealR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const sealBg = ctx.createRadialGradient(-4, -5, 2, 0, 0, sealR);
  if (spec.mult === 5) {
    sealBg.addColorStop(0, '#DC2626');
    sealBg.addColorStop(0.65, '#7F1D1D');
    sealBg.addColorStop(1, '#2D0707');
  } else if (spec.mult === 3) {
    sealBg.addColorStop(0, '#EA580C');
    sealBg.addColorStop(0.65, '#9A3412');
    sealBg.addColorStop(1, '#3B1306');
  } else if (spec.mult === 2) {
    sealBg.addColorStop(0, '#D97706');
    sealBg.addColorStop(0.65, '#78350F');
    sealBg.addColorStop(1, '#291505');
  } else {
    sealBg.addColorStop(0, '#3B4852');
    sealBg.addColorStop(1, '#14191E');
  }
  ctx.fillStyle = sealBg;
  ctx.shadowColor = spec.glow;
  ctx.shadowBlur = spec.mult >= 2 ? 12 : 4;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = spec.mult >= 2 ? 2 : 1.3;
  ctx.strokeStyle = spec.mult >= 2 ? spec.accent : '#94A3B8';
  ctx.stroke();

  // Bold x2 / x3 / x5 multiplier text inside seal
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${isCompact ? 15 : 17}px "JetBrains Mono", monospace`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  const sealLabel = `x${spec.mult}`;
  ctx.strokeText(sealLabel, 0, 1);
  ctx.fillStyle = spec.mult >= 2 ? '#FFFBEB' : '#CBD5E1';
  ctx.fillText(sealLabel, 0, 1);
  ctx.restore();

  // 4. Rank Subtitle & Bonus Readout
  const subY = y + (isCompact ? 54 : 58);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${isCompact ? 10 : 10.5}px "Be Vietnam Pro", sans-serif`;
  ctx.fillStyle = spec.primary;
  ctx.fillText(spec.label, x + 20, subY);

  ctx.textAlign = 'right';
  ctx.font = '700 9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = spec.mult >= 2 ? spec.accent : '#94A3B8';
  const nextHint =
    spec.mult === 1
      ? `${5 - combo.count} đòn → x2`
      : spec.mult === 2
      ? `${spec.bonusText} · ${12 - combo.count}→x3`
      : spec.mult === 3
      ? `${spec.bonusText} · ${25 - combo.count}→x5`
      : `${spec.bonusText} · MAX`;
  ctx.fillText(nextHint, x + panelW - 18, subY);

  // 5. Depleting Combo Continuity Bar with Glowing Tip Spark
  const barX = x + 18;
  const barY = y + (isCompact ? 60 : 65);
  const barW = panelW - 38;
  const barH = 5;

  ctx.fillStyle = 'rgba(7, 9, 12, 0.92)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(barX, barY, barW, barH);

  const fillW = Math.max(0, barW * ratio);
  if (fillW > 0) {
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, spec.primary);
    barGrad.addColorStop(1, spec.accent);
    ctx.globalAlpha = urgentPulse;
    ctx.fillStyle = barGrad;
    ctx.fillRect(barX, barY, fillW, barH);

    // Bright ember spark at depleting bar tip
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = spec.glow;
    ctx.shadowBlur = 8;
    ctx.fillRect(barX + fillW - 2.5, barY - 1, 3, barH + 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // 6. Cumulative Streak Damage Footer
  ctx.textAlign = 'left';
  ctx.font = '600 9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = '#D5E0E8';
  ctx.fillText(`Tổng ST: ${combo.totalDamage.toLocaleString('vi-VN')}`, barX, barY + 14);

  if (combo.bestCount >= 5) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(`Kỷ lục: ${combo.bestCount}`, barX + barW, barY + 14);
  }

  ctx.restore();
  ctx.restore();
}


import { ELEMENT_META, QUALITY_META } from './data';
import {
  ANIM_CLIPS,
  ATLAS_ROW_TO_VIEW,
  AnimState,
  AtlasOrientationRow,
  Direction8,
  MonsterArchetype,
  OrientationView,
  SpriteSheetEntry,
  WeaponVisualKind,
  getDir8Meta,
  inferWeaponKind,
  pxRect,
  resolveMountSpecies,
  spriteAtlas,
} from './spriteAtlas';
import {
  ElementType,
  EquipSlot,
  EquipmentItem,
  ItemQuality,
  MountDef,
  MountIllusionDef,
  MountSpecies,
  MountSkinStyle,
  SectId,
} from './types';

// Helper to draw pixel rectangles in local grid coordinates (each unit = ps pixels)
function p(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  color: string,
  ps = 2
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(gx * ps), Math.round(gy * ps), Math.round(gw * ps), Math.round(gh * ps));
}

// ---------------------------------------------------------------------------
// 1. DYNAMIC SHADOW & ADDITIVE PIXEL-CRISP LIGHTING
// ---------------------------------------------------------------------------
export function drawDynamicShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  elevation = 0
) {
  const scale = Math.max(0.55, 1 - elevation * 0.012);
  ctx.save();
  ctx.fillStyle = 'rgba(4, 3, 2, 0.52)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx * scale, ry * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(
    Math.round(x),
    Math.round(y),
    rx * scale * 1.25,
    ry * scale * 1.25,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

export function drawDynamicLightPool(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 0.24
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 2. PRE-BAKED 8-DIRECTION MOUNT SPRITE ATLAS & RENDERER
// ---------------------------------------------------------------------------
export interface PixelMountDrawParams {
  x: number;
  y: number;
  dir8: Direction8;
  animPhase: number;
  frameIndex?: number;
  isMoving: boolean;
  mount: MountDef;
  illusion: MountIllusionDef | null;
  illusionStars: number;
}

const MOUNT_LEG_CYCLE_RUN = [3, 2, -1, -3, -2, 1];
const MOUNT_BOB_CYCLE_RUN = [-2, -3, -1, 0, -2, -1];
const MOUNT_BOB_CYCLE_IDLE = [0, -1, -1, 0];

function bakeMountFrame(
  ctx: CanvasRenderingContext2D,
  view: OrientationView,
  frameIdx: number,
  isMoving: boolean,
  species: MountSpecies,
  evolutionLevel: number,
  bodyColor: string,
  accentColor: string,
  auraColor: string,
  illusionStyle?: MountSkinStyle
) {
  const ps = 2;
  const outline = '#120D0A';
  const legSwing = isMoving
    ? MOUNT_LEG_CYCLE_RUN[frameIdx % MOUNT_LEG_CYCLE_RUN.length]
    : frameIdx === 1 || frameIdx === 2
    ? 1
    : 0;
  const bodyBob = isMoving
    ? MOUNT_BOB_CYCLE_RUN[frameIdx % MOUNT_BOB_CYCLE_RUN.length]
    : MOUNT_BOB_CYCLE_IDLE[frameIdx % MOUNT_BOB_CYCLE_IDLE.length];
  const tailWave = frameIdx % 2 === 0 ? 1 : -1;

  ctx.save();
  ctx.translate(0, bodyBob * ps);

  // Cardinal North/South views compress horizontal torso width for authentic 8-dir perspective
  if (view === 'front' || view === 'back') {
    const isBack = view === 'back';
    // 4 legs positioned left/right symmetrically
    p(ctx, -6, 3 + legSwing * 0.6, 3, 7, '#1C1917', ps);
    p(ctx, 3, 3 - legSwing * 0.6, 3, 7, '#1C1917', ps);

    // Torso (narrower front/back silhouette)
    p(ctx, -7, -6, 14, 11, outline, ps);
    p(ctx, -6, -5, 12, 9, bodyColor, ps);

    // Armor chest/rear barding
    if (evolutionLevel >= 2) {
      p(ctx, -5, -4, 10, 5, '#7F1D1D', ps);
      p(ctx, -5, -4, 10, 1, '#F5D061', ps);
    }

    if (isBack) {
      // Prominent flowing tail on back view
      if (species === 'spirit_fox') {
        for (let t = -2; t <= 2; t++) {
          p(ctx, -2 + t * 3, -5 + Math.abs(t) + tailWave, 4, 8, bodyColor, ps);
          p(ctx, -1 + t * 3, -6 + Math.abs(t) + tailWave, 2, 3, accentColor, ps);
        }
      } else {
        p(ctx, -2 + tailWave, -2, 4, 9, accentColor, ps);
        p(ctx, -1 + tailWave, 4, 2, 4, auraColor, ps);
      }
      // Ears / horns peeking above saddle
      p(ctx, -4, -15, 2, 4, bodyColor, ps);
      p(ctx, 2, -15, 2, 4, bodyColor, ps);
      if (species === 'qilin' || species === 'divine_beast') {
        p(ctx, -5, -19, 2, 5, '#FEF08A', ps);
        p(ctx, 3, -19, 2, 5, '#FEF08A', ps);
      }
    } else {
      // Front view: chest, neck, head & glowing eyes facing camera
      p(ctx, -5, -15, 10, 9, outline, ps);
      p(ctx, -4, -14, 8, 7, bodyColor, ps);
      p(ctx, -5, -17, 2, 3, bodyColor, ps);
      p(ctx, 3, -17, 2, 3, bodyColor, ps);
      if (species === 'qilin' || species === 'divine_beast') {
        p(ctx, -6, -21, 2, 5, '#FEF08A', ps);
        p(ctx, 4, -21, 2, 5, '#FEF08A', ps);
      }
      p(ctx, -3, -12, 2, 2, '#FEF08A', ps);
      p(ctx, 1, -12, 2, 2, '#FEF08A', ps);
      p(ctx, -2, -9, 4, 2, accentColor, ps);
    }

    // Saddle centered
    p(ctx, -5, -7, 10, 3, '#991B1B', ps);
    p(ctx, -5, -6, 10, 1, '#F5D061', ps);
    ctx.restore();
    return;
  }

  // Diagonal views apply subtle foreshortening & head angle shift
  const isDiag = view === 'front_diag' || view === 'back_diag';
  const isBackDiag = view === 'back_diag';
  if (isDiag) {
    ctx.scale(0.92, 1);
  }

  if (species === 'white_tiger') {
    p(ctx, -11 - legSwing, 4, 4, 7, '#CBD5E1', ps);
    p(ctx, 5 + legSwing, 4, 4, 7, '#CBD5E1', ps);
    p(ctx, -16, -2 + tailWave, 5, 2, bodyColor, ps);
    p(ctx, -19, -5 + tailWave, 4, 3, bodyColor, ps);
    p(ctx, -17, -4, 1, 2, '#1E293B', ps);
    p(ctx, -12, -5, 23, 10, outline, ps);
    p(ctx, -11, -4, 21, 8, bodyColor, ps);
    p(ctx, -7, -4, 2, 5, '#1E293B', ps);
    p(ctx, -2, -4, 2, 6, '#1E293B', ps);
    p(ctx, 3, -4, 2, 5, '#1E293B', ps);
    if (evolutionLevel >= 3) {
      p(ctx, -5, -4, 11, 5, '#7F1D1D', ps);
      p(ctx, -6, -4, 13, 1, '#F5D061', ps);
      p(ctx, 7, -3, 3, 5, '#F5D061', ps);
    }
    p(ctx, 8, -11, 10, 9, outline, ps);
    p(ctx, 9, -10, 8, 7, bodyColor, ps);
    p(ctx, 9, -12, 2, 2, bodyColor, ps);
    p(ctx, 14, -12, 2, 2, bodyColor, ps);
    p(ctx, 11, -9, 3, 1, '#1E293B', ps);
    if (!isBackDiag) {
      p(ctx, 14, -7, 2, 2, accentColor, ps);
      p(ctx, 16, -5, 2, 2, '#FDA4AF', ps);
    }
    p(ctx, -9 + legSwing, 4, 4, 7, bodyColor, ps);
    p(ctx, 7 - legSwing, 4, 4, 7, bodyColor, ps);
    p(ctx, -9 + legSwing, 9, 4, 2, accentColor, ps);
    p(ctx, 7 - legSwing, 9, 4, 2, accentColor, ps);
  } else if (species === 'snow_wolf') {
    p(ctx, -10 - legSwing, 4, 3, 7, '#64748B', ps);
    p(ctx, 5 + legSwing, 4, 3, 7, '#64748B', ps);
    p(ctx, -18, -3 + tailWave, 7, 4, bodyColor, ps);
    p(ctx, -19, -2, 3, 2, '#E0F2FE', ps);
    p(ctx, -12, -4, 22, 9, outline, ps);
    p(ctx, -11, -3, 20, 7, bodyColor, ps);
    p(ctx, 4, -7, 7, 8, '#E0F2FE', ps);
    p(ctx, 5, -6, 5, 6, accentColor, ps);
    p(ctx, 9, -12, 9, 7, outline, ps);
    p(ctx, 10, -11, 7, 5, bodyColor, ps);
    p(ctx, 10, -14, 2, 3, bodyColor, ps);
    p(ctx, 13, -14, 2, 3, '#E0F2FE', ps);
    if (!isBackDiag) {
      p(ctx, 16, -9, 3, 3, '#E2E8F0', ps);
      p(ctx, 14, -10, 2, 1, '#38BDF8', ps);
    }
    p(ctx, -8 + legSwing, 4, 3, 7, bodyColor, ps);
    p(ctx, 7 - legSwing, 4, 3, 7, bodyColor, ps);
    p(ctx, 7 - legSwing, 9, 3, 2, '#7DD3FC', ps);
  } else if (species === 'spirit_fox') {
    for (let t = -2; t <= 2; t++) {
      p(
        ctx,
        -20 + Math.abs(t) * 2,
        -9 + t * 3 + tailWave * (t === 0 ? 1 : -1),
        9,
        3,
        bodyColor,
        ps
      );
      p(
        ctx,
        -21 + Math.abs(t) * 2,
        -9 + t * 3 + tailWave * (t === 0 ? 1 : -1),
        3,
        2,
        accentColor,
        ps
      );
    }
    p(ctx, -9 - legSwing, 4, 3, 7, bodyColor, ps);
    p(ctx, 5 + legSwing, 4, 3, 7, bodyColor, ps);
    p(ctx, -11, -4, 21, 8, outline, ps);
    p(ctx, -10, -3, 19, 6, bodyColor, ps);
    p(ctx, -6, -3, 12, 2, accentColor, ps);
    p(ctx, 8, -11, 9, 7, outline, ps);
    p(ctx, 9, -10, 7, 5, bodyColor, ps);
    p(ctx, 9, -15, 2, 5, bodyColor, ps);
    p(ctx, 12, -15, 2, 5, accentColor, ps);
    if (!isBackDiag) {
      p(ctx, 15, -8, 3, 2, '#FFF1F2', ps);
      p(ctx, 13, -9, 2, 1, '#FDE047', ps);
    }
    p(ctx, -7 + legSwing, 4, 3, 7, bodyColor, ps);
    p(ctx, 6 - legSwing, 4, 3, 7, bodyColor, ps);
  } else if (species === 'qilin' || species === 'divine_beast') {
    const isDragon = species === 'divine_beast';
    p(ctx, -11 - legSwing, 4, 4, 8, '#1C1917', ps);
    p(ctx, 6 + legSwing, 4, 4, 8, '#1C1917', ps);
    p(ctx, -19, -5 + tailWave, 8, 4, accentColor, ps);
    p(ctx, -21, -7 + tailWave, 5, 3, auraColor, ps);
    p(ctx, -13, -6, 25, 11, outline, ps);
    p(ctx, -12, -5, 23, 9, bodyColor, ps);
    p(ctx, -8, -5, 16, 6, isDragon ? '#292524' : '#7F1D1D', ps);
    p(ctx, -9, -5, 18, 2, '#F5D061', ps);
    p(ctx, 6, -4, 5, 6, '#F5D061', ps);
    p(ctx, 7, -14, 7, 10, bodyColor, ps);
    p(ctx, 5, -13, 3, 9, accentColor, ps);
    p(ctx, 10, -16, 10, 7, outline, ps);
    p(ctx, 11, -15, 8, 5, bodyColor, ps);
    p(ctx, 10, -21, 2, 6, '#FEF08A', ps);
    p(ctx, 12, -20, 2, 4, '#F5D061', ps);
    if (!isBackDiag) {
      p(ctx, 16, -14, 2, 2, '#FEF08A', ps);
      p(ctx, 18, -11, 2, 2, accentColor, ps);
    }
    p(ctx, -9 + legSwing, 4, 4, 8, bodyColor, ps);
    p(ctx, 8 - legSwing, 4, 4, 8, bodyColor, ps);
    p(ctx, -9 + legSwing, 10, 4, 2, '#FDE047', ps);
    p(ctx, 8 - legSwing, 10, 4, 2, '#FDE047', ps);
  } else {
    p(ctx, -10 - legSwing, 4, 3, 8, '#1C1917', ps);
    p(ctx, 5 + legSwing, 4, 3, 8, '#1C1917', ps);
    p(ctx, -17, -3 + tailWave, 6, 6, accentColor, ps);
    if (illusionStyle === 'celestial_pegasus') {
      const flap = frameIdx % 3 === 0 ? 3 : frameIdx % 3 === 1 ? 0 : -2;
      p(ctx, -8, -14 - flap, 12, 6, '#E0F2FE', ps);
      p(ctx, -11, -16 - flap, 8, 4, '#67E8F9', ps);
    }
    p(ctx, -12, -5, 23, 10, outline, ps);
    p(ctx, -11, -4, 21, 8, bodyColor, ps);
    if (evolutionLevel >= 2) {
      p(ctx, -6, -4, 13, 5, '#7F1D1D', ps);
      p(ctx, -7, -4, 15, 1, '#F5D061', ps);
    }
    if (evolutionLevel >= 4) {
      p(ctx, 7, -4, 4, 6, '#F5D061', ps);
    }
    p(ctx, 7, -13, 6, 10, bodyColor, ps);
    p(ctx, 6, -12, 2, 8, accentColor, ps);
    p(ctx, 9, -16, 9, 6, outline, ps);
    p(ctx, 10, -15, 7, 4, bodyColor, ps);
    p(ctx, 10, -18, 2, 3, bodyColor, ps);
    if (!isBackDiag) {
      p(ctx, 14, -14, 2, 1, '#FEF08A', ps);
    }
    p(ctx, -8 + legSwing, 4, 3, 8, bodyColor, ps);
    p(ctx, 7 - legSwing, 4, 3, 8, bodyColor, ps);
    p(ctx, -8 + legSwing, 10, 3, 2, '#D6B896', ps);
    p(ctx, 7 - legSwing, 10, 3, 2, '#D6B896', ps);
  }

  p(ctx, -4, -6, 9, 3, '#991B1B', ps);
  p(ctx, -5, -5, 11, 1, '#F5D061', ps);
  ctx.restore();
}

function getMountAtlasSheet(
  mount: MountDef,
  illusion: MountIllusionDef | null,
  illusionStars: number,
  isMoving: boolean
): SpriteSheetEntry {
  const species = resolveMountSpecies(mount.species, illusion?.style);
  const evolutionLevel = illusion ? Math.max(2, illusionStars + 1) : mount.tier;
  const bodyColor = illusion ? illusion.color : mount.color;
  const accentColor = illusion ? illusion.accentColor : mount.accentColor;
  const auraColor = illusion ? illusion.auraColor : accentColor;
  const cols = isMoving ? 6 : 4;
  const key = `mount_${species}_${evolutionLevel}_${bodyColor}_${accentColor}_${illusion?.style || 'base'}_${isMoving ? 'run' : 'idle'}`;

  return spriteAtlas.getOrBakeSheet(
    key,
    {
      cellW: 96,
      cellH: 80,
      cols,
      rows: 5,
      anchorX: 48,
      anchorY: 50,
    },
    (ctx, row: AtlasOrientationRow, frameIdx: number) => {
      bakeMountFrame(
        ctx,
        ATLAS_ROW_TO_VIEW[row],
        frameIdx,
        isMoving,
        species,
        evolutionLevel,
        bodyColor,
        accentColor,
        auraColor,
        illusion?.style
      );
    }
  );
}

export function drawPixelMount(
  ctx: CanvasRenderingContext2D,
  params: PixelMountDrawParams
): { riderOffsetY: number; riderOffsetX: number } {
  const { x, y, dir8, animPhase, frameIndex, isMoving, mount, illusion, illusionStars } = params;
  const evolutionLevel = illusion ? Math.max(2, illusionStars + 1) : mount.tier;
  const accentColor = illusion ? illusion.accentColor : mount.accentColor;
  const auraColor = illusion ? illusion.auraColor : accentColor;

  const cols = isMoving ? 6 : 4;
  const resolvedFrame =
    frameIndex !== undefined
      ? frameIndex % cols
      : Math.floor(Math.abs(animPhase) * (isMoving ? 1.8 : 0.75)) % cols;

  const bob = isMoving
    ? MOUNT_BOB_CYCLE_RUN[resolvedFrame % MOUNT_BOB_CYCLE_RUN.length] * 1.4
    : MOUNT_BOB_CYCLE_IDLE[resolvedFrame % MOUNT_BOB_CYCLE_IDLE.length];

  // Dynamic Light Pool & Evolving Ground Aura Rune (lightweight runtime overlay)
  if (evolutionLevel >= 3 || illusion) {
    drawDynamicLightPool(ctx, x, y + 10, 40 + evolutionLevel * 4, auraColor, 0.22);
    const pulse = 1 + Math.sin(animPhase * 1.4) * 0.06;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + 16));
    ctx.scale(1, 0.44);
    ctx.strokeStyle = auraColor;
    ctx.shadowColor = auraColor;
    ctx.shadowBlur = 10 + evolutionLevel * 2;
    ctx.lineWidth = evolutionLevel >= 5 ? 2.6 : 1.8;
    ctx.globalAlpha = 0.68;
    ctx.beginPath();
    ctx.arc(0, 0, (34 + evolutionLevel * 2) * pulse, 0, Math.PI * 2);
    ctx.stroke();

    if (evolutionLevel >= 4) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = animPhase * 0.65 + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, 41 + evolutionLevel * 1.5, a, a + 0.55);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // O(1) Sprite Sheet Blit for the 8-dir mount body
  const sheet = getMountAtlasSheet(mount, illusion, illusionStars, isMoving);
  spriteAtlas.blitSheetFrame(ctx, sheet, dir8, resolvedFrame, x, y, 1, 1);

  return { riderOffsetY: -15 + bob, riderOffsetX: 0 };
}

// ---------------------------------------------------------------------------
// 3. PRE-BAKED 8-DIRECTION HERO SPRITE ATLAS & LAYERED EQUIPMENT RENDERER
// ---------------------------------------------------------------------------
export interface PixelHeroDrawParams {
  x: number;
  y: number;
  sectId: SectId;
  dir8: Direction8;
  animState: AnimState;
  animPhase: number;
  frameIndex?: number;
  normalizedTime?: number;
  attackProgress: number; // 0..1 during attack swing
  castProgress: number; // 0..1 during skill cast
  hitFlash: number;
  equipment?: Partial<Record<EquipSlot, EquipmentItem | null>>;
  realmTier: number;
  mantleId: number;
  mantleColor: string;
  isMounted: boolean;
  scale?: number;
}

const SECT_PALETTES: Record<
  SectId,
  {
    robeMain: string;
    robeDark: string;
    sash: string;
    hair: string;
    headgear: string;
    accent: string;
    element: ElementType;
  }
> = {
  thieu_lam: {
    robeMain: '#D97706',
    robeDark: '#92400E',
    sash: '#B91C1C',
    hair: '#F3D0B1',
    headgear: '#FDE047',
    accent: '#F5D061',
    element: 'kim',
  },
  duong_mon: {
    robeMain: '#115E59',
    robeDark: '#0F2928',
    sash: '#4ADE80',
    hair: '#18181B',
    headgear: '#134E4A',
    accent: '#4ADE80',
    element: 'moc',
  },
  nga_mi: {
    robeMain: '#E0F2FE',
    robeDark: '#0284C7',
    sash: '#38BDF8',
    hair: '#1C1917',
    headgear: '#F472B6',
    accent: '#38BDF8',
    element: 'thuy',
  },
  cai_bang: {
    robeMain: '#7C2D12',
    robeDark: '#431407',
    sash: '#EF4444',
    hair: '#292524',
    headgear: '#DC2626',
    accent: '#FB923C',
    element: 'hoa',
  },
  vo_dang: {
    robeMain: '#1E3A8A',
    robeDark: '#172554',
    sash: '#F8FAFC',
    hair: '#18181B',
    headgear: '#F5D061',
    accent: '#FACC15',
    element: 'tho',
  },
};

interface HeroPoseKeyframe {
  bobY: number;
  stride: number;
  leanX: number;
  armRaise: number;
  weapRot: number;
  capeFlutter: number;
  deathAngle: number;
}

function getHeroPoseKeyframe(
  state: AnimState,
  frameIdx: number,
  totalFrames: number,
  isMounted: boolean
): HeroPoseKeyframe {
  const t = totalFrames > 1 ? frameIdx / (totalFrames - 1) : 0;

  if (state === 'death') {
    const angles = [0.22, 0.68, 1.25, Math.PI / 2];
    const bobs = [0, 3, 6, 8];
    return {
      bobY: bobs[frameIdx % bobs.length],
      stride: 0,
      leanX: -frameIdx,
      armRaise: 2,
      weapRot: 0.4 + frameIdx * 0.35,
      capeFlutter: 0,
      deathAngle: angles[frameIdx % angles.length],
    };
  }

  if (state === 'hit') {
    const leans = [-4, -2, -1];
    const bobs = [-1, 0, 0];
    return {
      bobY: bobs[frameIdx % bobs.length],
      stride: -1,
      leanX: leans[frameIdx % leans.length],
      armRaise: -2,
      weapRot: -0.75 + frameIdx * 0.15,
      capeFlutter: -2,
      deathAngle: 0,
    };
  }

  if (state === 'attack') {
    // 5-frame martial arts strike: windup -> coil -> lunge slash -> follow-through -> recover
    const leans = [-2, -1, 5, 3, 1];
    const bobs = [0, -1, -2, -1, 0];
    const strides = [-1, 0, 2, 1, 0];
    const arms = [-5, -6, 3, 2, -1];
    const rots = [-1.75, -1.95, 1.05, 1.35, -0.15];
    const i = Math.min(4, frameIdx);
    return {
      bobY: bobs[i],
      stride: isMounted ? 0 : strides[i],
      leanX: leans[i],
      armRaise: arms[i],
      weapRot: rots[i],
      capeFlutter: i >= 2 ? 2 : -1,
      deathAngle: 0,
    };
  }

  if (state === 'cast') {
    const bobs = [-1, -3, -4, -2];
    const rots = [-1.15, -1.35, -1.5, -1.2];
    const i = frameIdx % 4;
    return {
      bobY: bobs[i],
      stride: 0,
      leanX: 0,
      armRaise: -5 - (i === 2 ? 1 : 0),
      weapRot: rots[i],
      capeFlutter: i % 2 === 0 ? 2 : 1,
      deathAngle: 0,
    };
  }

  if (state === 'run') {
    const strides = [3, 2, 0, -3, -2, 0];
    const bobs = [-2, -1, 0, -2, -1, 0];
    const flutters = [3, 2, 3, 1, 2, 3];
    const i = frameIdx % 6;
    return {
      bobY: bobs[i],
      stride: isMounted ? 0 : strides[i],
      leanX: 1,
      armRaise: strides[i] > 0 ? 1 : -1,
      weapRot: -0.35 + (strides[i] * 0.08),
      capeFlutter: flutters[i],
      deathAngle: 0,
    };
  }

  if (state === 'walk') {
    const strides = [2, 1, 0, -2, -1, 0];
    const bobs = [-1, 0, 0, -1, 0, 0];
    const flutters = [1, 2, 1, 0, 1, 0];
    const i = frameIdx % 6;
    return {
      bobY: bobs[i],
      stride: isMounted ? 0 : strides[i],
      leanX: 0,
      armRaise: strides[i] > 0 ? 1 : 0,
      weapRot: -0.35 + strides[i] * 0.06,
      capeFlutter: flutters[i],
      deathAngle: 0,
    };
  }

  if (state === 'mount') {
    const bobs = [0, -1, 0, 1];
    const flutters = [1, 2, 1, 2];
    const i = frameIdx % 4;
    return {
      bobY: bobs[i],
      stride: 0,
      leanX: 0,
      armRaise: 0,
      weapRot: -0.4 + t * 0.08,
      capeFlutter: flutters[i],
      deathAngle: 0,
    };
  }

  // Idle (4-frame rhythmic martial breathing)
  const bobs = [0, -1, -1, 0];
  const flutters = [0, 1, 1, 0];
  const i = frameIdx % 4;
  return {
    bobY: bobs[i],
    stride: 0,
    leanX: 0,
    armRaise: i === 1 || i === 2 ? -1 : 0,
    weapRot: -0.35 + (i === 1 || i === 2 ? -0.06 : 0),
    capeFlutter: flutters[i],
    deathAngle: 0,
  };
}

interface HeroSheetFingerprint {
  sectId: SectId;
  animState: AnimState;
  weaponKind: WeaponVisualKind;
  weaponQuality: ItemQuality;
  weaponEnh: number;
  hasWeapon: boolean;
  armorQuality: ItemQuality;
  hasArmor: boolean;
  bootQuality: ItemQuality | 'none';
  bracerQuality: ItemQuality | 'none';
  jadeQuality: ItemQuality | 'none';
  realmTier: number;
  mantleId: number;
  mantleColor: string;
  isMounted: boolean;
  isFlash: boolean;
}

function buildHeroFingerprint(params: PixelHeroDrawParams): HeroSheetFingerprint {
  const weapon = params.equipment?.weapon || null;
  const armor = params.equipment?.armor || null;
  const boots = params.equipment?.boots || null;
  const bracer = params.equipment?.bracer || null;
  const jade = params.equipment?.jade || null;

  // Bucket weapon enhance tiers to keep atlas count compact (0, 5, 8, 10, 12)
  const rawEnh = weapon?.enhance ?? 0;
  const enhBucket = rawEnh >= 12 ? 12 : rawEnh >= 10 ? 10 : rawEnh >= 8 ? 8 : rawEnh >= 5 ? 5 : 0;

  return {
    sectId: params.sectId,
    animState: params.animState,
    weaponKind: inferWeaponKind(weapon?.name, params.sectId),
    weaponQuality: weapon?.quality ?? 'white',
    weaponEnh: enhBucket,
    hasWeapon: !!weapon,
    armorQuality: armor?.quality ?? 'white',
    hasArmor: !!armor,
    bootQuality: boots ? boots.quality : 'none',
    bracerQuality: bracer ? bracer.quality : 'none',
    jadeQuality: jade ? jade.quality : 'none',
    realmTier: Math.min(5, Math.max(0, params.realmTier)),
    mantleId: params.mantleId,
    mantleColor: params.mantleColor,
    isMounted: params.isMounted,
    isFlash: params.hitFlash > 0.04,
  };
}

function heroFingerprintKey(fp: HeroSheetFingerprint): string {
  return `hero_${fp.sectId}_${fp.animState}_${fp.weaponKind}_${fp.weaponQuality}_${fp.weaponEnh}_${fp.armorQuality}_${fp.hasArmor ? 1 : 0}_${fp.bootQuality}_${fp.bracerQuality}_${fp.jadeQuality}_${fp.realmTier}_${fp.mantleId}_${fp.isMounted ? 1 : 0}_${fp.isFlash ? 'f' : 'n'}`;
}

function bakeHeroFrame(
  ctx: CanvasRenderingContext2D,
  view: OrientationView,
  frameIdx: number,
  totalFrames: number,
  fp: HeroSheetFingerprint
) {
  const pal = SECT_PALETTES[fp.sectId];
  const ps = 2;
  const outline = '#120D0B';
  const pose = getHeroPoseKeyframe(fp.animState, frameIdx, totalFrames, fp.isMounted);

  const isBackView = view === 'back' || view === 'back_diag';
  const isSideView = view === 'side';
  const isFrontDiag = view === 'front_diag';
  const isBackDiag = view === 'back_diag';

  const armorTrim =
    fp.hasArmor && fp.armorQuality !== 'white'
      ? QUALITY_META[fp.armorQuality].color
      : fp.realmTier >= 2
      ? '#F5D061'
      : pal.accent;
  const bootColor =
    fp.bootQuality !== 'none' ? QUALITY_META[fp.bootQuality].color : '#3F2E21';
  const bracerColor =
    fp.bracerQuality !== 'none' ? QUALITY_META[fp.bracerQuality].color : pal.sash;

  const flash = fp.isFlash && (fp.animState !== 'hit' || frameIdx === 0);
  const robeCol = flash ? '#FFFFFF' : pal.robeMain;
  const robeDark = flash ? '#FDE68A' : pal.robeDark;
  const skinCol = flash ? '#FFFFFF' : '#F6D8BE';

  ctx.save();
  ctx.translate(Math.round(pose.leanX * ps), Math.round(pose.bobY * ps));
  if (pose.deathAngle !== 0) {
    ctx.rotate(pose.deathAngle);
  }

  const showCape = fp.mantleId >= 1 || fp.realmTier >= 2;

  // --- LAYER 1: Cape behind torso for front / front_diag / side ---
  if (showCape && !isBackView) {
    const capeX = isSideView ? -9 - pose.capeFlutter : -7 - pose.capeFlutter;
    const capeW = isSideView ? 10 : 13;
    p(ctx, capeX, -9, capeW, 13, outline, ps);
    p(
      ctx,
      capeX + 1,
      -8,
      capeW - 2,
      11,
      fp.mantleId >= 1 ? fp.mantleColor : pal.robeDark,
      ps
    );
    p(ctx, capeX + 1, 1, capeW - 2, 2, '#F5D061', ps);
  }

  // --- LAYER 2: Legs & Layered Boots (orientation-aware stance) ---
  if (fp.isMounted) {
    p(ctx, -4, 3, 3, 5, robeDark, ps);
    p(ctx, 1, 3, 3, 5, robeDark, ps);
    p(ctx, -4, 7, 3, 2, bootColor, ps);
    p(ctx, 1, 7, 3, 2, bootColor, ps);
  } else if (isSideView) {
    // True side-profile scissor stride
    p(ctx, -3 - pose.stride, 3, 3, 5, robeDark, ps);
    p(ctx, -3 - pose.stride, 7, 3, 2, bootColor, ps);
    p(ctx, 0 + pose.stride, 3, 3, 5, robeCol, ps);
    p(ctx, 0 + pose.stride, 7, 3, 2, bootColor, ps);
  } else if (view === 'front' || view === 'back') {
    // Cardinal N/S vertical stepping stride
    const leftLift = pose.stride > 0 ? -1 : 0;
    const rightLift = pose.stride < 0 ? -1 : 0;
    p(ctx, -4, 3 + leftLift, 3, 5, robeDark, ps);
    p(ctx, 1, 3 + rightLift, 3, 5, robeDark, ps);
    p(ctx, -4, 7 + leftLift, 3, 2, bootColor, ps);
    p(ctx, 1, 7 + rightLift, 3, 2, bootColor, ps);
  } else {
    // 3/4 Diagonal stride (SE/SW/NE/NW)
    p(ctx, -4 - pose.stride, 3, 3, 5, robeDark, ps);
    p(ctx, 1 + pose.stride, 3, 3, 5, robeDark, ps);
    p(ctx, -4 - pose.stride, 7, 3, 2, bootColor, ps);
    p(ctx, 1 + pose.stride, 7, 3, 2, bootColor, ps);
  }

  // --- LAYER 3: Torso & Sect Robe + Layered Armor ---
  const torsoX = isSideView ? -5 : -6;
  const torsoW = isSideView ? 10 : 12;
  p(ctx, torsoX, -9, torsoW, 13, outline, ps);
  p(ctx, torsoX + 1, -8, torsoW - 2, 11, robeCol, ps);
  p(ctx, torsoX + 1, -1, torsoW - 2, 4, robeDark, ps);
  p(ctx, torsoX + 1, -2, torsoW - 2, 2, pal.sash, ps);
  p(ctx, isSideView ? 0 : -1, -2, 2, 2, '#F5D061', ps);

  if (fp.jadeQuality !== 'none' && !isBackView) {
    p(ctx, isSideView ? 2 : 3, -1, 2, 3, QUALITY_META[fp.jadeQuality].color, ps);
  }

  // Sect chest emblem for front / front_diag / side
  if (!isBackView) {
    const emblemShift = isSideView ? 2 : isFrontDiag ? 1 : 0;
    if (fp.sectId === 'vo_dang') {
      p(ctx, -2 + emblemShift, -7, 4, 4, '#F8FAFC', ps);
      p(ctx, -1 + emblemShift, -6, 2, 2, '#1E293B', ps);
    } else if (fp.sectId === 'thieu_lam') {
      p(ctx, -3 + emblemShift, -8, 1, 2, '#78350F', ps);
      p(ctx, -1 + emblemShift, -7, 2, 1, '#92400E', ps);
      p(ctx, 2 + emblemShift, -8, 1, 2, '#78350F', ps);
    } else if (fp.sectId === 'cai_bang') {
      p(ctx, -4 + emblemShift, -8, 2, 6, '#B45309', ps);
      p(ctx, -5, -1, 3, 3, '#D97706', ps);
    } else if (fp.sectId === 'nga_mi') {
      p(ctx, -4 + emblemShift, -7, 7, 2, '#BAE6FD', ps);
      p(ctx, -6, -6, 2, 8, '#7DD3FC', ps);
    } else if (fp.sectId === 'duong_mon') {
      p(ctx, -3 + emblemShift, -8, 2, 5, '#064E3B', ps);
      p(ctx, 2 + emblemShift, -8, 2, 5, '#064E3B', ps);
      p(ctx, emblemShift, -6, 1, 2, '#4ADE80', ps);
    }
  }

  // Layered Armor Pauldrons
  if (fp.hasArmor || fp.realmTier >= 1) {
    const pLeft = isSideView ? -5 : -7;
    const pRight = isSideView ? 3 : 4;
    p(ctx, pLeft, -9, 3, 4, outline, ps);
    p(ctx, pRight, -9, 3, 4, outline, ps);
    p(ctx, pLeft + 1, -8, 2, 3, armorTrim, ps);
    p(ctx, pRight, -8, 2, 3, armorTrim, ps);
    if (fp.realmTier >= 3 || fp.armorQuality === 'gold' || fp.armorQuality === 'mythic') {
      p(ctx, pLeft, -9, 2, 1, '#FEF08A', ps);
      p(ctx, pRight + 1, -9, 2, 1, '#FEF08A', ps);
    }
  }

  // --- LAYER 4: Head, Hair, Face & Sect Headgear (True 5-Orientation Detail) ---
  p(ctx, -5, -18, 10, 9, outline, ps);
  p(ctx, -4, -17, 8, 7, isBackView ? pal.hair : skinCol, ps);

  if (isBackView) {
    if (fp.sectId === 'thieu_lam') {
      p(ctx, -4, -17, 8, 7, skinCol, ps);
    } else {
      p(ctx, -4, -17, 8, 8, pal.hair, ps);
      if (isBackDiag) {
        // Cheek silhouette hint on 3/4 rear angle
        p(ctx, 3, -15, 1, 4, skinCol, ps);
      }
      if (fp.sectId === 'vo_dang') {
        p(ctx, -2, -21, 4, 4, pal.hair, ps);
        p(ctx, -2, -19, 4, 1, '#F5D061', ps);
      } else if (fp.sectId === 'nga_mi') {
        p(ctx, -6, -18, 2, 4, pal.hair, ps);
        p(ctx, 4, -18, 2, 4, pal.hair, ps);
        p(ctx, -5, -18, 1, 2, pal.headgear, ps);
      } else if (fp.sectId === 'cai_bang') {
        p(ctx, -5, -16, 10, 2, '#DC2626', ps);
        p(ctx, -6 - pose.capeFlutter * 0.4, -15, 2, 4, '#DC2626', ps);
      } else if (fp.sectId === 'duong_mon') {
        p(ctx, -5, -19, 10, 5, pal.headgear, ps);
      }
    }
    if (showCape) {
      p(
        ctx,
        -6,
        -9,
        12,
        12 + pose.capeFlutter * 0.5,
        fp.mantleId >= 1 ? fp.mantleColor : pal.robeDark,
        ps
      );
      p(ctx, -6, 1, 12, 2, '#F5D061', ps);
    }
  } else {
    if (fp.sectId === 'thieu_lam') {
      p(ctx, -2, -16, 1, 1, '#F59E0B', ps);
      p(ctx, 0, -16, 1, 1, '#F59E0B', ps);
      p(ctx, 2, -16, 1, 1, '#F59E0B', ps);
    } else if (fp.sectId === 'vo_dang') {
      p(ctx, -4, -18, 8, 3, pal.hair, ps);
      p(ctx, -2, -21, 4, 3, pal.hair, ps);
      p(ctx, -2, -19, 4, 1, '#F5D061', ps);
    } else if (fp.sectId === 'nga_mi') {
      p(ctx, -4, -18, 8, 3, pal.hair, ps);
      p(ctx, -6, -18, 2, 4, pal.hair, ps);
      p(ctx, 4, -18, 2, 4, pal.hair, ps);
      p(ctx, 4, -18, 2, 1, '#F472B6', ps);
    } else if (fp.sectId === 'duong_mon') {
      p(ctx, -5, -19, 10, 4, pal.headgear, ps);
      p(ctx, -4, -13, 8, 3, '#0F2928', ps);
    } else {
      p(ctx, -5, -19, 10, 3, pal.hair, ps);
      p(ctx, -5, -16, 10, 2, '#DC2626', ps);
      p(ctx, -7, -15, 2, 3, '#DC2626', ps);
    }

    if (isSideView) {
      // Crisp single side-profile eye + back hair lock
      p(ctx, -4, -16, 2, 5, pal.hair, ps);
      p(ctx, 2, -14, 1, 2, '#1C1917', ps);
    } else {
      const eyeShift = isFrontDiag ? 1 : 0;
      p(ctx, -2 + eyeShift, -14, 1, 2, '#1C1917', ps);
      p(ctx, 2 + eyeShift, -14, 1, 2, '#1C1917', ps);
    }
  }

  // --- LAYER 5: Arms, Bracers & Equipped Weapon ---
  if (!isSideView) {
    p(ctx, -7, -6 - pose.armRaise * 0.35, 2, 5, robeCol, ps);
    p(ctx, -7, -2 - pose.armRaise * 0.35, 2, 2, bracerColor, ps);
  }

  ctx.save();
  const handX = (isSideView ? 4 : isBackView ? 6 : 5) * ps;
  const handY = (-4 + pose.armRaise * 0.55) * ps;
  ctx.translate(Math.round(handX), Math.round(handY));
  ctx.rotate(pose.weapRot);

  const wColor = fp.hasWeapon ? QUALITY_META[fp.weaponQuality].color : '#E2E8F0';
  const wEdge = fp.weaponEnh >= 8 ? '#FFFFFF' : wColor;

  if (fp.weaponEnh >= 5) {
    ctx.shadowColor = fp.weaponEnh >= 12 ? '#FDE047' : wColor;
    ctx.shadowBlur =
      fp.weaponEnh >= 12 ? 12 : fp.weaponEnh >= 10 ? 9 : fp.weaponEnh >= 8 ? 7 : 4;
  }

  if (fp.weaponKind === 'staff') {
    p(ctx, -1, -13, 2, 22, '#92400E', ps);
    p(ctx, -1, -14, 2, 4, '#F5D061', ps);
    p(ctx, -1, 7, 2, 3, '#F5D061', ps);
    if (fp.weaponEnh >= 8) p(ctx, 0, -13, 1, 18, wEdge, ps);
  } else if (fp.weaponKind === 'blade') {
    p(ctx, -1, 1, 2, 4, '#7F1D1D', ps);
    p(ctx, -2, 0, 4, 1, '#F5D061', ps);
    p(ctx, -1, -12, 3, 12, wColor, ps);
    p(ctx, 1, -11, 1, 10, wEdge, ps);
  } else if (fp.weaponKind === 'dart') {
    p(ctx, -2, -5, 5, 5, '#0F2928', ps);
    p(ctx, -1, -4, 3, 3, wColor, ps);
    p(ctx, 0, -7, 1, 2, '#4ADE80', ps);
  } else {
    p(ctx, -1, 1, 2, 4, '#7F1D1D', ps);
    p(ctx, -3, 0, 6, 1, '#F5D061', ps);
    p(ctx, -1, -13, 2, 13, wColor, ps);
    p(ctx, 0, -13, 1, 12, wEdge, ps);
  }

  // Baked slash luminous smear on impact frames (2 & 3) of the Attack clip
  if (fp.animState === 'attack' && (frameIdx === 2 || frameIdx === 3)) {
    ctx.strokeStyle =
      fp.weaponEnh >= 12 ? '#FEF08A' : ELEMENT_META[pal.element].color;
    ctx.globalAlpha = frameIdx === 2 ? 0.85 : 0.45;
    ctx.lineWidth = fp.weaponEnh >= 12 ? 4.5 : 3;
    ctx.beginPath();
    ctx.arc(0, 0, 14 * ps, -Math.PI * 0.95, -Math.PI * 0.1);
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

function getHeroAtlasSheet(params: PixelHeroDrawParams): SpriteSheetEntry {
  const fp = buildHeroFingerprint(params);
  const key = heroFingerprintKey(fp);
  const clip = ANIM_CLIPS[fp.animState] || ANIM_CLIPS.idle;

  return spriteAtlas.getOrBakeSheet(
    key,
    {
      cellW: 96,
      cellH: 96,
      cols: clip.frames,
      rows: 5,
      anchorX: 48,
      anchorY: 60,
    },
    (ctx, row: AtlasOrientationRow, frameIdx: number, totalFrames: number) => {
      bakeHeroFrame(ctx, ATLAS_ROW_TO_VIEW[row], frameIdx, totalFrames, fp);
    }
  );
}

export function drawPixelHero(ctx: CanvasRenderingContext2D, params: PixelHeroDrawParams) {
  const {
    x,
    y,
    sectId,
    dir8,
    animState,
    animPhase,
    frameIndex,
    attackProgress,
    castProgress,
    equipment,
    realmTier,
    scale = 1,
  } = params;

  const pal = SECT_PALETTES[sectId];
  const weapon = equipment?.weapon || null;
  const weaponEnh = weapon?.enhance ?? 0;
  const weaponQuality: ItemQuality = weapon?.quality ?? 'white';

  // Dynamic Light Pool for high-enhance weapons (+8+) or Mythic Realm
  if (weaponEnh >= 8 || realmTier >= 4) {
    drawDynamicLightPool(
      ctx,
      x,
      y - 6 * scale,
      28 + weaponEnh * 2.2,
      weaponEnh >= 12 ? '#FDE047' : QUALITY_META[weaponQuality].color,
      weaponEnh >= 12 ? 0.3 : 0.2
    );
  }

  // Orbiting Elemental Wisps for Realm Tier >= 3
  if (realmTier >= 3 && animState !== 'death') {
    const elemColor = ELEMENT_META[pal.element].color;
    ctx.save();
    const wispCount = realmTier >= 5 ? 4 : 2;
    for (let i = 0; i < wispCount; i++) {
      const a = animPhase * 0.85 + (i * Math.PI * 2) / wispCount;
      const wx = x + Math.cos(a) * 26 * scale;
      const wy = y - 10 * scale + Math.sin(a) * 9 * scale;
      ctx.fillStyle = i % 2 === 0 ? elemColor : '#FEF08A';
      ctx.shadowColor = elemColor;
      ctx.shadowBlur = 8;
      ctx.fillRect(Math.round(wx - 2), Math.round(wy - 2), 4, 4);
    }
    ctx.restore();
  }

  // Resolve exact state-driven frame index (or fallback for standalone previews)
  const clip = ANIM_CLIPS[animState] || ANIM_CLIPS.idle;
  let resolvedFrame = frameIndex;
  if (resolvedFrame === undefined) {
    if (animState === 'attack') {
      resolvedFrame = Math.min(clip.frames - 1, Math.floor(attackProgress * clip.frames));
    } else if (animState === 'cast') {
      resolvedFrame = Math.min(clip.frames - 1, Math.floor(castProgress * clip.frames));
    } else {
      resolvedFrame = Math.floor(Math.abs(animPhase) * (clip.fps / 5)) % clip.frames;
    }
  }

  // O(1) GPU Blit from pre-baked 8-direction Sprite Sheet!
  const sheet = getHeroAtlasSheet(params);
  spriteAtlas.blitSheetFrame(ctx, sheet, dir8, resolvedFrame, x, y, scale, 1);

  // Runtime continuous +10/+12 weapon energy sparks & cast Qi orb overlays
  if (weaponEnh >= 10 && animState !== 'death') {
    const dirMeta = getDir8Meta(dir8);
    const side = dirMeta.flipX ? -1 : 1;
    const ox = x + side * 12 * scale;
    const oy = y - 18 * scale;
    ctx.save();
    ctx.strokeStyle = weaponEnh >= 12 ? '#FEF08A' : QUALITY_META[weaponQuality].color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(ox, oy, 6 * scale, animPhase, animPhase + Math.PI * 1.4);
    ctx.stroke();
    if (weaponEnh >= 12) {
      for (let m = 0; m < 3; m++) {
        const ma = animPhase * 2.2 + (m * Math.PI * 2) / 3;
        ctx.fillStyle = m % 2 === 0 ? '#FFFFFF' : ELEMENT_META[pal.element].color;
        ctx.fillRect(
          Math.round(ox + Math.cos(ma) * 9 * scale),
          Math.round(oy + Math.sin(ma) * 9 * scale),
          3,
          3
        );
      }
    }
    ctx.restore();
  }

  if (animState === 'cast') {
    const dirMeta = getDir8Meta(dir8);
    const side = dirMeta.flipX ? -1 : 1;
    const elemColor = ELEMENT_META[pal.element].color;
    ctx.save();
    ctx.fillStyle = elemColor;
    ctx.shadowColor = elemColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(
      x + side * 8 * scale,
      y - 16 * scale,
      (4 + Math.sin(animPhase * 4) * 1.5) * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 4. PRE-BAKED 8-DIRECTION MONSTER & BOSS SPRITE ATLAS & RENDERER
// ---------------------------------------------------------------------------
export interface PixelMonsterDrawParams {
  x: number;
  y: number;
  archetype: MonsterArchetype;
  color: string;
  accentColor: string;
  dir8: Direction8;
  animState: AnimState;
  animPhase: number;
  frameIndex?: number;
  attackProgress: number;
  hitFlash: number;
  deathProgress: number;
  alertTimer: number;
  enraged: boolean;
  roarTimer: number;
  isElite: boolean;
}

function isBossArchetype(archetype: MonsterArchetype): boolean {
  return (
    archetype === 'boss_co_bach' ||
    archetype === 'boss_dieu_nhu' ||
    archetype === 'boss_thien_phong' ||
    archetype === 'boss_huyet_ma' ||
    archetype === 'dungeon_boss'
  );
}

function bakeMonsterFrame(
  ctx: CanvasRenderingContext2D,
  view: OrientationView,
  frameIdx: number,
  totalFrames: number,
  archetype: MonsterArchetype,
  color: string,
  accentColor: string,
  animState: AnimState,
  enraged: boolean,
  isElite: boolean,
  isFlash: boolean
) {
  const isBoss = isBossArchetype(archetype);
  const ps = isBoss ? 2.5 : isElite ? 2.15 : 2;
  const outline = '#120D0A';

  const isBackView = view === 'back' || view === 'back_diag';
  const isSideView = view === 'side';
  const isFront = view === 'front';

  // Keyframed kinematics by AnimState
  let stride = 0;
  let bob = 0;
  let lunge = 0;
  let weapRot = -0.32;
  let deathAngle = 0;

  if (animState === 'death') {
    const angles = [0.25, 0.72, 1.25, Math.PI / 2];
    const bobs = [0, 3, 6, 8];
    deathAngle = angles[frameIdx % angles.length];
    bob = bobs[frameIdx % bobs.length];
  } else if (animState === 'hit') {
    const recoils = [-4, -2, -1];
    lunge = recoils[frameIdx % recoils.length];
    bob = frameIdx === 0 ? -1 : 0;
  } else if (animState === 'attack') {
    const lunges = [-2, 0, 6, 3, 1];
    const rots = [-1.55, -1.75, 1.05, 1.25, -0.15];
    const i = Math.min(4, frameIdx);
    lunge = lunges[i];
    weapRot = rots[i];
    bob = i === 2 ? -2 : 0;
  } else if (animState === 'cast' || animState === 'roar') {
    const i = frameIdx % Math.max(1, totalFrames);
    bob = i === 1 || i === 2 ? -3 : -1;
    weapRot = -1.2 - (i === 2 ? 0.25 : 0);
  } else if (animState === 'walk' || animState === 'run') {
    const strides = [2, 1, 0, -2, -1, 0];
    const bobs = [-2, -1, 0, -2, -1, 0];
    stride = strides[frameIdx % strides.length];
    bob = bobs[frameIdx % bobs.length];
    weapRot = -0.32 + stride * 0.08;
  } else {
    const bobs = [0, -1, -1, 0];
    bob = bobs[frameIdx % bobs.length];
  }

  const f = isFlash && (animState !== 'hit' || frameIdx === 0);
  const mainCol = f ? '#FFFFFF' : color;
  const subCol = f ? '#FEF3C7' : accentColor;

  ctx.save();
  ctx.translate(Math.round(lunge * ps), Math.round(bob * ps));
  if (deathAngle !== 0) {
    ctx.rotate(deathAngle);
  }

  if (archetype === 'boar') {
    if (isFront || view === 'back') {
      p(ctx, -6, -4, 12, 10, outline, ps);
      p(ctx, -5, -3, 10, 8, mainCol, ps);
      p(ctx, -1, -5, 2, 7, '#475569', ps);
      if (isFront) {
        p(ctx, -3, 0, 6, 4, '#CBD5E1', ps);
        p(ctx, -5, 1, 2, 2, '#FFFBEB', ps);
        p(ctx, 3, 1, 2, 2, '#FFFBEB', ps);
        p(ctx, -3, -2, 2, 2, '#EF4444', ps);
        p(ctx, 1, -2, 2, 2, '#EF4444', ps);
      }
      p(ctx, -5, 5 + (stride > 0 ? -1 : 0), 3, 4, '#334155', ps);
      p(ctx, 2, 5 + (stride < 0 ? -1 : 0), 3, 4, '#334155', ps);
    } else {
      p(ctx, -10, -4, 20, 10, outline, ps);
      p(ctx, -9, -3, 18, 8, mainCol, ps);
      p(ctx, -8, -5, 14, 2, '#475569', ps);
      p(ctx, 8, -2, 4, 6, '#CBD5E1', ps);
      p(ctx, 10, 0, 3, 2, '#FFFBEB', ps);
      if (!isBackView) p(ctx, 6, -2, 2, 2, '#EF4444', ps);
      p(ctx, -8 - stride, 5, 3, 4, '#334155', ps);
      p(ctx, 5 + stride, 5, 3, 4, '#334155', ps);
    }
  } else if (archetype === 'frost_wolf') {
    if (isFront || view === 'back') {
      p(ctx, -6, -5, 12, 9, outline, ps);
      p(ctx, -5, -4, 10, 7, mainCol, ps);
      p(ctx, -4, -7, 8, 4, '#E0F2FE', ps);
      if (isFront) {
        p(ctx, -3, -10, 6, 5, mainCol, ps);
        p(ctx, -4, -13, 2, 3, '#E0F2FE', ps);
        p(ctx, 2, -13, 2, 3, '#E0F2FE', ps);
        p(ctx, -2, -8, 1, 1, '#FEF08A', ps);
        p(ctx, 1, -8, 1, 1, '#FEF08A', ps);
      } else {
        p(ctx, -2, -2, 4, 7, '#BAE6FD', ps);
      }
      p(ctx, -4, 3 + (stride > 0 ? -1 : 0), 3, 5, '#475569', ps);
      p(ctx, 1, 3 + (stride < 0 ? -1 : 0), 3, 5, '#475569', ps);
    } else {
      p(ctx, -15, -3 + (frameIdx % 2 === 0 ? 1 : 0), 6, 3, '#BAE6FD', ps);
      p(ctx, -10, -4, 19, 8, outline, ps);
      p(ctx, -9, -3, 17, 6, mainCol, ps);
      p(ctx, 3, -6, 6, 6, '#E0F2FE', ps);
      p(ctx, 8, -9, 7, 5, mainCol, ps);
      p(ctx, 9, -12, 2, 3, '#E0F2FE', ps);
      if (!isBackView) {
        p(ctx, 13, -7, 3, 2, '#7DD3FC', ps);
        p(ctx, 12, -8, 1, 1, '#FEF08A', ps);
      }
      p(ctx, -7 - stride, 3, 3, 5, '#475569', ps);
      p(ctx, 5 + stride, 3, 3, 5, '#475569', ps);
    }
  } else if (archetype === 'sword_golem' || archetype === 'sword_wraith') {
    const hover = frameIdx % 2 === 0 ? -2 : 1;
    p(ctx, -7, -14 + hover, 14, 18, outline, ps);
    p(ctx, -6, -13 + hover, 12, 16, mainCol, ps);
    p(ctx, -4, -19 + hover, 8, 6, archetype === 'sword_wraith' ? '#1E1B4B' : '#78350F', ps);
    if (!isBackView) {
      p(ctx, -2, -17 + hover, 2, 2, '#FEF08A', ps);
      p(ctx, 2, -17 + hover, 2, 2, '#FEF08A', ps);
    }
    p(ctx, -11, -12 - hover, 2, 12, '#FDE047', ps);
    p(ctx, 10, -10 + hover, 2, 12, '#FDE047', ps);
  } else if (isBoss) {
    const capeCol = enraged
      ? '#991B1B'
      : archetype === 'boss_dieu_nhu'
      ? '#0369A1'
      : archetype === 'boss_huyet_ma'
      ? '#581C87'
      : '#451A03';
    const cw = frameIdx % 2 === 0 ? 2 : 0;

    if (!isBackView) {
      p(ctx, -10 - cw, -12, 19, 19, outline, ps);
      p(ctx, -9 - cw, -11, 17, 17, capeCol, ps);
      p(ctx, -9 - cw, 4, 17, 2, '#F5D061', ps);
    }

    p(ctx, -5 - stride, 4, 4, 6, '#1C1917', ps);
    p(ctx, 1 + stride, 4, 4, 6, '#1C1917', ps);
    p(ctx, -5 - stride, 8, 4, 2, '#F5D061', ps);
    p(ctx, 1 + stride, 8, 4, 2, '#F5D061', ps);

    p(ctx, -8, -11, 16, 16, outline, ps);
    p(ctx, -7, -10, 14, 14, mainCol, ps);
    p(ctx, -10, -12, 4, 5, '#F5D061', ps);
    p(ctx, 6, -12, 4, 5, '#F5D061', ps);
    p(ctx, -6, -3, 12, 3, '#1C1917', ps);
    p(ctx, -2, -3, 4, 3, enraged ? '#EF4444' : '#FDE047', ps);

    p(ctx, -5, -21, 10, 10, outline, ps);
    p(
      ctx,
      -4,
      -20,
      8,
      8,
      isBackView ? '#292524' : archetype === 'boss_dieu_nhu' ? '#FCE7F3' : '#E7C6A5',
      ps
    );
    if (archetype === 'boss_dieu_nhu') {
      p(ctx, -6, -22, 12, 4, '#E0F2FE', ps);
      p(ctx, -3, -25, 6, 3, '#38BDF8', ps);
      p(ctx, -1, -26, 2, 2, '#FFFFFF', ps);
    } else if (archetype === 'boss_huyet_ma' || archetype === 'boss_thien_phong') {
      p(ctx, -6, -22, 12, 3, '#1C1917', ps);
      p(ctx, -8, -26, 3, 5, enraged ? '#EF4444' : '#F5D061', ps);
      p(ctx, 5, -26, 3, 5, enraged ? '#EF4444' : '#F5D061', ps);
    } else {
      p(ctx, -5, -23, 10, 4, '#292524', ps);
      p(ctx, -3, -26, 6, 3, '#F5D061', ps);
    }

    if (isBackView) {
      p(ctx, -9, -11, 18, 17 + cw, capeCol, ps);
      p(ctx, -9, 4 + cw, 18, 2, '#F5D061', ps);
    } else {
      const eyeShift = isSideView ? 1 : 0;
      p(ctx, -2 + eyeShift, -17, 2, 2, enraged ? '#EF4444' : '#FEF08A', ps);
      p(ctx, 2 + eyeShift, -17, 2, 2, enraged ? '#EF4444' : '#FEF08A', ps);
    }

    ctx.save();
    ctx.translate(Math.round(8 * ps), Math.round(-4 * ps));
    ctx.rotate(weapRot);
    ctx.shadowColor = enraged ? '#EF4444' : subCol;
    ctx.shadowBlur = 10;
    p(ctx, -1, 1, 3, 5, '#7F1D1D', ps);
    p(ctx, -4, 0, 8, 2, '#F5D061', ps);
    p(ctx, -2, -18, 4, 18, enraged ? '#EF4444' : subCol, ps);
    p(ctx, 0, -18, 1, 17, '#FFFFFF', ps);
    ctx.restore();
  } else {
    // Distinct Humanoid Monsters (8-dir torso, helmet, eyes & weapon)
    const torsoX = isSideView ? -5 : -6;
    const torsoW = isSideView ? 10 : 12;
    p(ctx, -4 - stride, 3, 3, 5, '#1C1917', ps);
    p(ctx, 1 + stride, 3, 3, 5, '#1C1917', ps);
    p(ctx, torsoX, -9, torsoW, 13, outline, ps);
    p(ctx, torsoX + 1, -8, torsoW - 2, 11, mainCol, ps);
    p(ctx, torsoX + 1, -2, torsoW - 2, 2, '#1C1917', ps);

    p(ctx, -4, -17, 8, 8, outline, ps);
    p(ctx, -3, -16, 6, 6, isBackView ? '#292524' : '#E8C5A5', ps);
    if (archetype === 'assassin' || archetype === 'blood_assassin') {
      p(ctx, -4, -18, 8, 4, '#18181B', ps);
      if (!isBackView) {
        p(ctx, -4, -13, 8, 3, '#18181B', ps);
        p(ctx, -2, -14, 1, 1, '#EF4444', ps);
        p(ctx, 2, -14, 1, 1, '#EF4444', ps);
      }
    } else if (
      archetype === 'armored_cavalry' ||
      archetype === 'vanguard_knight' ||
      archetype === 'war_general' ||
      archetype === 'siege_enemy'
    ) {
      p(ctx, -5, -19, 10, 5, '#475569', ps);
      p(ctx, -1, -22, 2, 4, '#DC2626', ps);
      p(ctx, -6, -8, 2, 3, '#94A3B8', ps);
      p(ctx, 4, -8, 2, 3, '#94A3B8', ps);
    } else if (archetype === 'siege_ally') {
      p(ctx, -5, -19, 10, 5, '#1D4ED8', ps);
      p(ctx, -1, -22, 2, 4, '#F5D061', ps);
    } else if (archetype === 'snow_monk' || archetype === 'dark_demon') {
      p(ctx, -4, -17, 8, 3, '#312E81', ps);
      if (!isBackView) {
        p(ctx, -2, -14, 2, 2, '#C084FC', ps);
        p(ctx, 1, -14, 2, 2, '#C084FC', ps);
      }
    } else if (archetype === 'bandit_chief' || archetype === 'elder_blade') {
      p(ctx, -6, -18, 12, 3, '#78350F', ps);
      p(ctx, -3, -20, 6, 2, '#92400E', ps);
    } else {
      p(ctx, -4, -17, 8, 2, '#991B1B', ps);
      if (!isBackView) {
        const es = isSideView ? 1 : 0;
        p(ctx, -2 + es, -14, 1, 1, '#1C1917', ps);
        if (!isSideView) p(ctx, 2, -14, 1, 1, '#1C1917', ps);
      }
    }

    ctx.save();
    ctx.translate(Math.round(5 * ps), Math.round(-4 * ps));
    ctx.rotate(weapRot);
    if (archetype === 'bandit' || archetype === 'bandit_chief') {
      p(ctx, -1, -9, 3, 10, '#CBD5E1', ps);
    } else if (
      archetype === 'vanguard_knight' ||
      archetype === 'armored_cavalry' ||
      archetype === 'war_general'
    ) {
      p(ctx, -1, -14, 2, 20, '#78350F', ps);
      p(ctx, -2, -15, 4, 5, '#E2E8F0', ps);
    } else if (archetype === 'assassin' || archetype === 'blood_assassin') {
      p(ctx, -1, -7, 2, 8, '#F87171', ps);
    } else {
      p(ctx, -1, -11, 2, 12, subCol, ps);
    }
    ctx.restore();
  }

  ctx.restore();
}

function getMonsterAtlasSheet(
  archetype: MonsterArchetype,
  color: string,
  accentColor: string,
  animState: AnimState,
  enraged: boolean,
  isElite: boolean,
  isFlash: boolean
): SpriteSheetEntry {
  const isBoss = isBossArchetype(archetype);
  const clip = ANIM_CLIPS[animState] || ANIM_CLIPS.idle;
  const key = `mob_${archetype}_${color}_${accentColor}_${animState}_${enraged ? 1 : 0}_${isElite ? 1 : 0}_${isFlash ? 'f' : 'n'}`;

  return spriteAtlas.getOrBakeSheet(
    key,
    {
      cellW: isBoss ? 140 : 88,
      cellH: isBoss ? 140 : 88,
      cols: clip.frames,
      rows: 5,
      anchorX: isBoss ? 70 : 44,
      anchorY: isBoss ? 92 : 56,
    },
    (ctx, row: AtlasOrientationRow, frameIdx: number, totalFrames: number) => {
      bakeMonsterFrame(
        ctx,
        ATLAS_ROW_TO_VIEW[row],
        frameIdx,
        totalFrames,
        archetype,
        color,
        accentColor,
        animState,
        enraged,
        isElite,
        isFlash
      );
    }
  );
}

export function drawPixelMonster(ctx: CanvasRenderingContext2D, params: PixelMonsterDrawParams) {
  const {
    x,
    y,
    archetype,
    color,
    accentColor,
    dir8,
    animState,
    animPhase,
    frameIndex,
    attackProgress,
    hitFlash,
    deathProgress,
    alertTimer,
    enraged,
    roarTimer,
    isElite,
  } = params;

  const isBoss = isBossArchetype(archetype);
  const outline = '#120D0A';

  // Static/Structural Siege & Guild War Objectives (Gate, Pillar, Banner)
  if (archetype === 'gate' || archetype === 'pillar' || archetype === 'banner') {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (archetype === 'gate') {
      p(ctx, -18, -24, 36, 48, outline, 2);
      p(ctx, -16, -22, 32, 44, hitFlash > 0 ? '#FFFFFF' : '#4A3222', 2);
      p(ctx, -16, -12, 32, 3, '#F59E0B', 2);
      p(ctx, -16, 8, 32, 3, '#F59E0B', 2);
      for (let gx = -12; gx <= 10; gx += 7) {
        p(ctx, gx, -18, 2, 2, '#FDE047', 2);
        p(ctx, gx, 0, 2, 2, '#FDE047', 2);
      }
    } else if (archetype === 'pillar') {
      drawDynamicLightPool(ctx, 0, 0, 62, '#F5D061', 0.28);
      p(ctx, -12, -26, 24, 50, outline, 2);
      p(ctx, -10, -24, 20, 46, hitFlash > 0 ? '#FFFFFF' : '#78350F', 2);
      p(ctx, -12, -24, 24, 4, '#F5D061', 2);
      p(ctx, -12, 18, 24, 5, '#F5D061', 2);
      p(ctx, -7, -14, 14, 4, '#FDE047', 2);
      p(ctx, -5, -4, 12, 4, '#F5D061', 2);
      p(ctx, -8, 6, 15, 4, '#FDE047', 2);
    } else {
      drawDynamicLightPool(ctx, 0, 0, 52, color, 0.25);
      p(ctx, -2, -28, 4, 50, '#F5D061', 2);
      const wave = Math.round(Math.sin(animPhase * 1.4) * 2);
      p(ctx, 2, -24, 16, 18, outline, 2);
      p(ctx, 3, -23, 14 + wave * 0.4, 16, hitFlash > 0 ? '#FFFFFF' : color, 2);
      p(ctx, 6, -18, 8, 6, '#F5D061', 2);
    }
    ctx.restore();
    return;
  }

  // Boss Enrage / Roar / Ground Aura (dynamic runtime layer)
  if (isBoss && deathProgress <= 0) {
    const bossAuraColor = enraged ? '#EF4444' : color;
    drawDynamicLightPool(ctx, x, y + 6, enraged ? 72 : 54, bossAuraColor, enraged ? 0.34 : 0.24);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + 22));
    ctx.scale(1, 0.44);
    ctx.strokeStyle = bossAuraColor;
    ctx.shadowColor = bossAuraColor;
    ctx.shadowBlur = enraged ? 20 : 14;
    ctx.lineWidth = enraged ? 3.5 : 2.5;
    ctx.globalAlpha = 0.8;
    const rad = (enraged ? 46 : 38) + Math.sin(animPhase * 1.6) * 3;
    ctx.beginPath();
    ctx.arc(0, 0, rad, animPhase * 0.5, animPhase * 0.5 + Math.PI * 1.65);
    ctx.stroke();
    if (roarTimer > 0) {
      const rp = 1 - Math.min(1, roarTimer / 0.8);
      ctx.strokeStyle = '#FEF08A';
      ctx.globalAlpha = 1 - rp;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 26 + rp * 85, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  const clip = ANIM_CLIPS[animState] || ANIM_CLIPS.idle;
  let resolvedFrame = frameIndex;
  if (resolvedFrame === undefined) {
    if (animState === 'death') {
      resolvedFrame = Math.min(clip.frames - 1, Math.floor(deathProgress * clip.frames));
    } else if (animState === 'attack') {
      resolvedFrame = Math.min(clip.frames - 1, Math.floor(attackProgress * clip.frames));
    } else {
      resolvedFrame = Math.floor(Math.abs(animPhase) * (clip.fps / 5)) % clip.frames;
    }
  }

  const alpha = deathProgress > 0 ? Math.max(0, 1 - deathProgress) : 1;
  const sheet = getMonsterAtlasSheet(
    archetype,
    color,
    accentColor,
    animState,
    enraged,
    isElite,
    hitFlash > 0.04
  );
  spriteAtlas.blitSheetFrame(ctx, sheet, dir8, resolvedFrame, x, y, 1, alpha);

  // Alert '!' visual behavior indicator
  if (alertTimer > 0 && deathProgress <= 0) {
    ctx.save();
    ctx.font = '900 16px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FEF08A';
    ctx.strokeStyle = '#991B1B';
    ctx.lineWidth = 3;
    const ay = y - (isBoss ? 68 : 44) - Math.sin(alertTimer * 10) * 3;
    ctx.strokeText('!', x, ay);
    ctx.fillText('!', x, ay);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 5. NON-BLOCKING BATTLE SPRITE ATLAS PRELOADER & WARMUP DESCRIPTORS
// ---------------------------------------------------------------------------
export type HeroWarmupParams = Omit<
  PixelHeroDrawParams,
  'x' | 'y' | 'dir8' | 'animState' | 'animPhase' | 'attackProgress' | 'castProgress' | 'hitFlash'
>;

export function createHeroAtlasWarmup(heroParams: HeroWarmupParams): {
  signature: string;
  tasks: Array<() => void>;
} {
  const fp = buildHeroFingerprint({
    ...heroParams,
    x: 0,
    y: 0,
    dir8: 2,
    animState: 'idle',
    animPhase: 0,
    attackProgress: 0,
    castProgress: 0,
    hitFlash: 0,
  });
  const signature = `warmup_hero_${heroFingerprintKey(fp)}`;
  const states: AnimState[] = heroParams.isMounted
    ? ['mount', 'attack', 'cast', 'hit']
    : ['idle', 'walk', 'run', 'attack', 'cast', 'hit'];
  const tasks = states.map((state) => () => {
    getHeroAtlasSheet({
      ...heroParams,
      x: 0,
      y: 0,
      dir8: 2,
      animState: state,
      animPhase: 0,
      attackProgress: 0,
      castProgress: 0,
      hitFlash: state === 'hit' ? 0.14 : 0,
    });
  });
  return { signature, tasks };
}

export function createMountAtlasWarmup(
  mount: MountDef,
  illusion: MountIllusionDef | null,
  illusionStars: number
): { signature: string; tasks: Array<() => void> } {
  const signature = `warmup_mount_${mount.id}_${illusion?.id || 'none'}_${illusionStars}`;
  return {
    signature,
    tasks: [
      () => getMountAtlasSheet(mount, illusion, illusionStars, false),
      () => getMountAtlasSheet(mount, illusion, illusionStars, true),
    ],
  };
}

export function createMonsterAtlasWarmup(mob: {
  archetype: MonsterArchetype;
  color: string;
  accentColor: string;
  isElite: boolean;
  enraged?: boolean;
}): { signature: string; tasks: Array<() => void> } | null {
  if (mob.archetype === 'gate' || mob.archetype === 'pillar' || mob.archetype === 'banner') {
    return null;
  }
  const enraged = Boolean(mob.enraged);
  const signature = `warmup_mob_${mob.archetype}_${mob.color}_${mob.isElite ? 1 : 0}_${enraged ? 1 : 0}`;
  const states: AnimState[] = isBossArchetype(mob.archetype)
    ? ['idle', 'walk', 'attack', 'cast', 'roar', 'hit', 'death']
    : ['idle', 'walk', 'attack', 'hit', 'death'];
  const tasks = states.map((st) => () => {
    getMonsterAtlasSheet(
      mob.archetype,
      mob.color,
      mob.accentColor,
      st,
      enraged,
      mob.isElite,
      st === 'hit'
    );
  });
  return { signature, tasks };
}

export function preloadBattleSpriteAtlases(opts: {
  heroParams: HeroWarmupParams;
  mount?: MountDef | null;
  illusion?: MountIllusionDef | null;
  illusionStars?: number;
  monsters: Array<{
    archetype: MonsterArchetype;
    color: string;
    accentColor: string;
    isElite: boolean;
  }>;
}) {
  const heroWarmup = createHeroAtlasWarmup(opts.heroParams);
  for (const task of heroWarmup.tasks) {
    spriteAtlas.enqueuePreload(task);
  }

  if (opts.mount) {
    const mountWarmup = createMountAtlasWarmup(
      opts.mount,
      opts.illusion || null,
      opts.illusionStars || 0
    );
    for (const task of mountWarmup.tasks) {
      spriteAtlas.enqueuePreload(task);
    }
  }

  const seenMob = new Set<string>();
  for (const mob of opts.monsters) {
    const mobWarmup = createMonsterAtlasWarmup(mob);
    if (!mobWarmup || seenMob.has(mobWarmup.signature)) continue;
    seenMob.add(mobWarmup.signature);
    for (const task of mobWarmup.tasks) {
      spriteAtlas.enqueuePreload(task);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. FIVE-ELEMENT MARTIAL ARTS VFX (KIM – MỘC – THỦY – HỎA – THỔ)
// ---------------------------------------------------------------------------
export function drawFiveElementSkillVfx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  curRad: number,
  progress: number,
  element: ElementType,
  color: string,
  accent: string,
  kind: 'ring' | 'slash' | 'lotus' | 'swords' | 'dragon' | 'shield',
  angle = 0
) {
  const alpha = Math.max(0, 1 - progress);
  ctx.save();

  drawDynamicLightPool(ctx, x, y, curRad * 1.15, color, alpha * 0.34);

  if (kind === 'slash') {
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 6 * alpha;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0, 0, curRad, -1.05, 1.05);
    ctx.stroke();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5 * alpha;
    ctx.beginPath();
    ctx.arc(0, 0, curRad * 0.9, -0.85, 0.85);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, curRad, 0, Math.PI * 2);
  ctx.stroke();

  if (element === 'kim') {
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + progress * 1.8;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * curRad * 0.35, y + Math.sin(a) * curRad * 0.35);
      ctx.lineTo(x + Math.cos(a) * curRad * 1.05, y + Math.sin(a) * curRad * 1.05);
      ctx.stroke();
    }
  } else if (element === 'moc') {
    ctx.fillStyle = '#4ADE80';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - progress * 2.6;
      const vx = x + Math.cos(a) * curRad * 0.78;
      const vy = y + Math.sin(a) * curRad * 0.78;
      pxRect(ctx, vx - 4, vy - 4, 8, 8, i % 2 === 0 ? '#4ADE80' : '#BBF7D0');
    }
  } else if (element === 'thuy') {
    ctx.strokeStyle = '#BAE6FD';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 3 + progress * 1.2;
      const px = x + Math.cos(a) * curRad * 0.85;
      const py = y + Math.sin(a) * curRad * 0.85;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (element === 'hoa') {
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 4 * alpha;
    ctx.beginPath();
    ctx.arc(x, y, curRad * 0.72, progress * 3, progress * 3 + Math.PI * 1.4);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + progress * 2.4;
      pxRect(
        ctx,
        x + Math.cos(a) * curRad * 0.9 - 3,
        y + Math.sin(a) * curRad * 0.9 - 3,
        6,
        6,
        i % 2 === 0 ? '#FDE047' : '#EF4444'
      );
    }
  } else {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i * Math.PI) / 4 - progress * 1.1;
      const px = x + Math.cos(a) * curRad * 0.92;
      const py = y + Math.sin(a) * curRad * 0.92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.restore();
}

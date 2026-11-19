export type ElementType = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho';

export type SectId = 'thieu_lam' | 'duong_mon' | 'nga_mi' | 'cai_bang' | 'vo_dang';

export type ItemQuality = 'white' | 'green' | 'blue' | 'purple' | 'gold' | 'mythic';

export type EquipSlot = 'weapon' | 'armor' | 'bracer' | 'ring' | 'jade' | 'boots';

export type GameScreen = 'TITLE_MENU' | 'CHARACTER_CREATE' | 'PLAYING';

export type BattleMode = 'WILD' | 'BOSS' | 'DUNGEON' | 'ARENA' | 'SIEGE' | 'GUILD_WAR';

export type ResourceType = 'ore' | 'herbs' | 'gold_mine' | 'spirit_vein';

export type PkMode = 'peace' | 'slaughter';

export type WeatherType = 'clear' | 'rain' | 'snow' | 'mist' | 'ash_wind';

export type ChestTier = 'iron' | 'purple_gold' | 'imperial_gold';

export type TreasureChestStock = Record<ChestTier, number>;

export interface ChestTierMeta {
  id: ChestTier;
  name: string;
  shortName: string;
  color: string;
  accentColor: string;
  glowColor: string;
  bgClass: string;
  description: string;
  stoneRange: [number, number];
  silverBase: number;
  ingotRange: [number, number];
  guaranteedMinQuality: ItemQuality;
}

export interface ChestOpenResult {
  tier: ChestTier;
  enhanceStones: number;
  silver: number;
  goldIngots: number;
  equipment: EquipmentItem;
  bonusEquipment?: EquipmentItem;
}

export interface WeatherDef {
  id: WeatherType;
  name: string;
  allResistDelta: number; // temporary % shift to allResist
  color: string;
  description: string;
}

export type ChatChannel = 'world' | 'guild' | 'whisper' | 'system';

export type ActiveModal =
  | null
  | 'CHARACTER'
  | 'MAP_BOSS'
  | 'GOOGLE_MAPS'
  | 'DUNGEON_ARENA'
  | 'TITLE_MANTLE'
  | 'SOCIAL_GUILD'
  | 'SIEGE'
  | 'SAGE_STUDIO'
  | 'PAUSE';

export interface SkillDef {
  id: string;
  name: string;
  keyBind: '1' | '2' | '3' | '4';
  unlockLevel: number;
  cooldown: number; // seconds
  mpCost: number;
  multiplier: number; // % of ATK
  radius: number; // pixels in arena
  range: number; // cast range
  type: 'melee' | 'projectile' | 'aoe' | 'heal' | 'shield' | 'poison';
  color: string;
  accentColor: string;
  description: string;
  effectText: string;
}

export interface PassiveSkillDef {
  id: string;
  name: string;
  unlockLevel: number;
  bonusAtk?: number;
  bonusAtkPct?: number;
  bonusDef?: number;
  bonusDefPct?: number;
  bonusDodge?: number;
  bonusHp?: number;
  bonusCrit?: number;
  description: string;
}

export interface SectDef {
  id: SectId;
  name: string;
  element: ElementType;
  elementName: string;
  role: string;
  weaponType: string;
  color: string;
  glowColor: string;
  summary: string;
  baseStats: {
    hp: number;
    mp: number;
    atk: number;
    def: number;
    crit: number; // %
    dodge: number; // %
  };
  growthPerLevel: {
    hp: number;
    mp: number;
    atk: number;
    def: number;
  };
  skills: SkillDef[];
  passives: PassiveSkillDef[];
}

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipSlot;
  quality: ItemQuality;
  levelReq: number;
  enhance: number;
  atk: number;
  def: number;
  hp: number;
  crit: number;
  power: number;
}

export interface MapDef {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  element: ElementType;
  description: string;
  ambientTheme: 'petals' | 'autumn' | 'snow' | 'dust' | 'mist';
  weatherPool: WeatherType[];
  tintColor: string;
  isSafeZone?: boolean;
  mobs: {
    name: string;
    hp: number;
    atk: number;
    def: number;
    exp: number;
    silver: number;
    color: string;
    isElite?: boolean;
  }[];
}

export interface WorldBossDef {
  id: string;
  name: string;
  title: string;
  level: number;
  element: ElementType;
  hp: number;
  atk: number;
  def: number;
  color: string;
  respawnSec: number;
  silverReward: number;
  goldIngotReward: number;
  expReward: number;
  stoneReward: number;
  meritReward: number;
  description: string;
}

export interface DungeonDef {
  id: string;
  name: string;
  subtitle: string;
  unlockLevel: number;
  maxFloors: number;
  element: ElementType;
  basePower: number;
  bossNames: string[];
  description: string;
}

export interface MantleDef {
  id: number;
  name: string;
  color: string;
  glowColor: string;
  requiredWealth: number;
  requiredMerit: number;
  silverCost: number;
  bonusAtk: number;
  bonusDef: number;
  bonusHp: number;
  bonusCrit: number;
  auraStyle: string;
}

export interface TitleDef {
  id: string;
  name: string;
  color: string;
  requirementText: string;
  bonusAtk: number;
  bonusDef: number;
  bonusHp: number;
  bonusCrit: number;
}

export type MountSpecies =
  | 'horse'
  | 'white_tiger'
  | 'snow_wolf'
  | 'qilin'
  | 'spirit_fox'
  | 'divine_beast';

export interface MountDef {
  id: string;
  tier: number;
  species: MountSpecies;
  name: string;
  subtitle: string;
  quality: ItemQuality;
  color: string;
  accentColor: string;
  levelReq: number;
  silverCost: number;
  ingotCost: number;
  moveSpeedPct: number; // % movement speed bonus
  allResist: number; // % all-element resistance
  bonusHp: number;
  bonusDef: number;
  description: string;
}

export type MountSkinStyle =
  | 'celestial_pegasus'
  | 'white_tiger'
  | 'snow_wolf'
  | 'spirit_fox'
  | 'qilin_flame'
  | 'frost_qilin'
  | 'imperial_dragon_steed';

export interface MountIllusionDef {
  id: string;
  name: string;
  subtitle: string;
  quality: ItemQuality;
  style: MountSkinStyle;
  color: string;
  accentColor: string;
  auraColor: string;
  auraLabel: string;
  unlockSilver: number;
  unlockIngots: number;
  unlockStones: number;
  baseMoveSpeedPct: number;
  baseAllResist: number;
  baseBonusHp: number;
  baseBonusAtk: number;
  description: string;
}

export interface SimulatedMaster {
  id: string;
  name: string;
  sect: SectId;
  level: number;
  power: number;
  rank: number;
  mantleId: number;
  titleName: string;
  guildName: string;
  isFriend?: boolean;
  intimacy?: number;
}

export interface GuildInfo {
  id: string;
  name: string;
  leader: string;
  level: number;
  members: number;
  maxMembers: number;
  contribution: number;
  power: number;
  motto: string;
  buffAtkPct: number;
  buffDefPct: number;
  buffHpPct: number;
}

export interface GuildTechDef {
  id: string;
  name: string;
  statLabel: string;
  description: string;
  maxLevel: number;
  baseContributionCost: number;
  allResistPerLevel?: number; // % Kháng Ngũ Hành mỗi cấp
  critDamagePerLevel?: number; // % Sát Thương Chí Mạng mỗi cấp
  dodgePerLevel?: number; // % Tỉ Lệ Né Tránh mỗi cấp
  atkPerLevel?: number; // Công Kích mỗi cấp
  hpPerLevel?: number; // Sinh Lực mỗi cấp
  defPerLevel?: number; // Phòng Thủ mỗi cấp
  color: string;
  iconKey: 'resist' | 'crit_dmg' | 'dodge' | 'atk' | 'vitality';
}

export interface SiegeCity {
  id: 'bien_kinh' | 'tuong_duong' | 'lam_an';
  name: string;
  defenderGuild: string;
  defenderLeader: string;
  recommendedPower: number;
  gateHp: number;
  pillarHp: number;
  enemyWavePower: number;
  dailySilver: number;
  dailyIngots: number;
  dailyStones: number;
  lastClaimDate: string | null;
  controlledByPlayerGuild: boolean;
}

export interface ResourceTerritory {
  id: string;
  name: string;
  region: string;
  resourceType: ResourceType;
  resourceLabel: string;
  element: ElementType;
  defenderGuildId: string;
  defenderGuildName: string;
  defenderLeader: string;
  recommendedPower: number;
  bannerHp: number;
  enemyWavePower: number;
  claimSilver: number;
  claimIngots: number;
  claimStones: number;
  claimPotions: number;
  bonusLabel: string;
  bonusAtkPct: number;
  bonusDefPct: number;
  bonusAllResist: number;
  lastClaimAt: number | null;
  controlledByPlayerGuild: boolean;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  sender: string;
  senderId?: string;
  senderSect?: SectId;
  senderMantle?: number;
  content: string;
  timestamp: string;
}

export interface ComputedStats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  crit: number;
  critDamagePct: number; // % sát thương chí mạng (mặc định 172%)
  dodge: number;
  moveSpeedPct: number;
  allResist: number;
  pkPenaltyPct: number;
  power: number;
}

export interface PlayerState {
  name: string;
  sect: SectId;
  avatarUrl: string | null;
  level: number;
  exp: number;
  maxExp: number;
  hp: number;
  mp: number;
  silver: number;
  goldIngots: number;
  enhanceStones: number;
  reputation: number; // Danh vọng
  merit: number; // Công trạng
  wealth: number; // Tài phú
  skillLevels: Record<string, number>;
  equipment: Record<EquipSlot, EquipmentItem | null>;
  inventory: EquipmentItem[];
  currentMapId: string;
  mantleId: number;
  unlockedTitles: string[];
  activeTitleId: string;
  dungeonProgress: Record<string, number>; // highest cleared floor
  arenaRank: number;
  arenaWins: number;
  monstersKilled: number;
  bossesKilled: number;
  guildId: string | null;
  guildContribution: number;
  guildTechLevels: Record<string, number>;
  friends: { masterId: string; intimacy: number }[];
  potions: number;
  ownedMounts: string[];
  activeMountId: string | null;
  isMounted: boolean;
  mountIllusions: Record<string, number>; // illusionId -> star level (1..5)
  activeMountIllusionId: string | null;
  pkMode: PkMode;
  pkPoints: number; // Điểm Sát Khí (0..10)
  pkKills: number; // Số cao thủ đã đồ sát
  pkPenaltyUntil: number; // Timestamp (ms) kết thúc suy yếu do chết khi mang sát khí
  pkPenaltyPct: number; // % giảm Công/Thủ/HP khi bị tiêu diệt lúc có sát khí
  pkWashCounter: number; // Số quái đã diệt để rửa 1 điểm sát khí (mỗi 8 quái giảm 1)
  treasureChests: TreasureChestStock; // Kho Rương Báu nhặt được khi luyện công
  chestsOpened: number; // Tổng số Rương Báu đã mở
}

export interface BattleContext {
  mode: BattleMode;
  bossId?: string;
  dungeonId?: string;
  dungeonFloor?: number;
  arenaOpponent?: SimulatedMaster;
  siegeCityId?: SiegeCity['id'];
  guildWarTerritoryId?: string;
}

export interface BattleResultSummary {
  victory: boolean;
  mode: BattleMode;
  title: string;
  subtitle: string;
  rewards: {
    exp?: number;
    silver?: number;
    goldIngots?: number;
    enhanceStones?: number;
    reputation?: number;
    merit?: number;
    item?: EquipmentItem;
    extraText?: string;
  };
}

export interface SavePayload {
  version: number;
  savedAt: number;
  player: PlayerState;
  guilds: GuildInfo[];
  cities: SiegeCity[];
  territories?: ResourceTerritory[];
  masters: SimulatedMaster[];
}

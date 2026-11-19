import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpCircle,
  Backpack,
  Check,
  Coins,
  Flame,
  Hammer,
  Shield,
  Skull,
  Sparkles,
  Star,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import {
  ELEMENT_META,
  MANTLES,
  MOUNTS,
  MOUNT_ILLUSIONS,
  QUALITY_META,
  SECTS,
  SLOT_LABELS,
  TITLES,
} from '../../game/data';
import {
  formatNumber,
  formatPassiveBonusText,
  getCharacterRealm,
  getEffectiveItemStats,
  getEnhanceCost,
  getIllusionStats,
  getIllusionUpgradeCost,
} from '../../game/engine';
import {
  ComputedStats,
  EquipSlot,
  EquipmentItem,
  PassiveSkillDef,
  PlayerState,
  SkillDef,
  WeatherDef,
} from '../../game/types';
import { PixelHeroPreview, PixelItemIcon, PixelMountPreview } from '../PixelItemIcon';
import { SkillIcon } from '../SkillIcon';

export type CharacterModalTab = 'equip' | 'bag' | 'skills' | 'enhance' | 'mounts';

interface CharacterModalProps {
  player: PlayerState;
  stats: ComputedStats;
  weatherMeta: WeatherDef;
  initialTab?: CharacterModalTab;
  guildName?: string | null;
  onClose: () => void;
  onEquipItem: (item: EquipmentItem) => void;
  onSellItem: (itemId: string) => void;
  onSellJunk: () => void;
  onEnhanceSlot: (slot: EquipSlot) => void;
  onUpgradeSkill: (skillId: string) => void;
  onBuyPotion: () => void;
  onBuyStones: () => void;
  onBuyMount: (mountId: string) => void;
  onSelectMount: (mountId: string) => void;
  onToggleMount: () => void;
  onUnlockOrUpgradeIllusion: (illusionId: string) => void;
  onEquipIllusion: (illusionId: string | null) => void;
  onOpenTitleMantle?: () => void;
  pkPenaltyRemainSec: number;
  onCleansePk: () => void;
}

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'bracer', 'ring', 'jade', 'boots'];
const BAG_CAPACITY = 30;

const QUALITY_RANK: Record<EquipmentItem['quality'], number> = {
  mythic: 6,
  gold: 5,
  purple: 4,
  blue: 3,
  green: 2,
  white: 1,
};

function getEnhanceTierLabel(enhance: number): string {
  if (enhance >= 12) return 'Thần Quang (+12+)';
  if (enhance >= 10) return 'Hào Quang (+10)';
  if (enhance >= 8) return 'Quang Mang (+8)';
  if (enhance >= 5) return 'Linh Quang (+5)';
  return 'Chưa kích hoạt';
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  player,
  stats,
  weatherMeta,
  initialTab = 'equip',
  guildName = null,
  onClose,
  onEquipItem,
  onSellItem,
  onSellJunk,
  onEnhanceSlot,
  onUpgradeSkill,
  onBuyPotion,
  onBuyStones,
  onBuyMount,
  onSelectMount,
  onToggleMount,
  onUnlockOrUpgradeIllusion,
  onEquipIllusion,
  onOpenTitleMantle,
  pkPenaltyRemainSec,
  onCleansePk,
}) => {
  const [tab, setTab] = useState<CharacterModalTab>(initialTab);
  const [mountView, setMountView] = useState<'mounts' | 'illusions'>('mounts');
  const [selectedSlot, setSelectedSlot] = useState<EquipSlot>('weapon');
  const [inspectedEquipSlot, setInspectedEquipSlot] = useState<EquipSlot | null>('weapon');
  const [selectedBagItemId, setSelectedBagItemId] = useState<string | null>(
    player.inventory[0]?.id ?? null
  );
  const [bagFilter, setBagFilter] = useState<'all' | 'weapon' | 'armor' | 'accessory' | 'rare'>(
    'all'
  );
  const [bagSorted, setBagSorted] = useState(false);

  // Draggable vertical floating PC window offset (like Kiếm Thế 2009)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const sect = SECTS[player.sect];
  const elem = ELEMENT_META[sect.element];
  const realm = getCharacterRealm(player);
  const mantle = MANTLES.find((m) => m.id === player.mantleId) || MANTLES[0];
  const titleObj = TITLES.find((t) => t.id === player.activeTitleId) || null;
  const activeEnhanceItem = player.equipment[selectedSlot];
  const activeMount = MOUNTS.find((m) => m.id === player.activeMountId) || null;
  const activeIllusion = player.activeMountIllusionId
    ? MOUNT_ILLUSIONS.find((x) => x.id === player.activeMountIllusionId) || null
    : null;
  const unlockedIllusionCount = Object.values(player.mountIllusions || {}).filter((s) => s > 0).length;

  const [selectedSkillKey, setSelectedSkillKey] = useState<string>(sect.skills[0]?.id ?? '');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragStateRef.current.dragging) return;
      const dx = e.clientX - dragStateRef.current.startX;
      const dy = e.clientY - dragStateRef.current.startY;
      setDragOffset({
        x: Math.max(-520, Math.min(280, dragStateRef.current.originX + dx)),
        y: Math.max(-44, Math.min(240, dragStateRef.current.originY + dy)),
      });
    };
    const onPointerUp = () => {
      dragStateRef.current.dragging = false;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handleTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
  };

  // Filtered & optionally sorted bag inventory
  const displayedInventory = useMemo(() => {
    const filtered = player.inventory.filter((it) => {
      if (bagFilter === 'weapon') return it.slot === 'weapon';
      if (bagFilter === 'armor')
        return it.slot === 'armor' || it.slot === 'bracer' || it.slot === 'boots';
      if (bagFilter === 'accessory') return it.slot === 'ring' || it.slot === 'jade';
      if (bagFilter === 'rare')
        return it.quality === 'purple' || it.quality === 'gold' || it.quality === 'mythic';
      return true;
    });
    if (!bagSorted) return filtered;
    return [...filtered].sort((a, b) => {
      const qDiff = QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality];
      if (qDiff !== 0) return qDiff;
      return b.power - a.power;
    });
  }, [player.inventory, bagFilter, bagSorted]);

  const selectedBagItem = useMemo(() => {
    if (selectedBagItemId) {
      const found = player.inventory.find((x) => x.id === selectedBagItemId);
      if (found) return found;
    }
    return displayedInventory[0] ?? null;
  }, [selectedBagItemId, player.inventory, displayedInventory]);

  // Resolve selected skill (active or passive)
  const selectedActiveSkill: SkillDef | null =
    sect.skills.find((s) => s.id === selectedSkillKey) || null;
  const selectedPassiveSkill: PassiveSkillDef | null =
    sect.passives.find((p) => p.id === selectedSkillKey) || null;
  const effectiveActiveSkill = selectedActiveSkill || (!selectedPassiveSkill ? sect.skills[0] : null);

  const totalSkillTiers = sect.skills.reduce((sum, s) => sum + (player.skillLevels[s.id] || 0), 0);

  const modalTitle =
    tab === 'bag'
      ? 'Hành Trang'
      : tab === 'skills'
      ? 'Kỹ Năng'
      : tab === 'enhance'
      ? 'Cường Hóa'
      : tab === 'mounts'
      ? 'Thú Cưỡi'
      : 'Nhân Vật';

  return (
    /* Non-blocking floating PC overlay — battlefield stays 100% live & visible beside the vertical window! */
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        style={{
          transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
        }}
        className="pointer-events-auto kt-window absolute top-[54px] right-2.5 flex max-h-[calc(100vh-118px)] w-[308px] flex-col overflow-hidden text-[#ECE8DD] shadow-[0_12px_34px_rgba(0,0,0,0.88)] sm:right-3.5 sm:w-[328px]"
      >
        {/* ================= COMPACT KIẾM THẾ 2009 EMERALD-JADE DRAGGABLE TITLE BAR ================= */}
        <div
          onPointerDown={handleTitlePointerDown}
          title="Giữ và kéo thanh tiêu đề để di chuyển bảng"
          className="kt-titlebar relative flex cursor-grab items-center justify-between px-2.5 py-1 active:cursor-grabbing select-none"
        >
          <span className="text-[10px] font-semibold" style={{ color: elem.color }}>
            {elem.name} · {sect.name.split(' ')[0]}
          </span>

          <h2 className="font-wuxia text-[15px] font-bold tracking-wide text-[#F3E5B8] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            {modalTitle}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="kt-btn-bronze flex h-5 w-5 items-center justify-center cursor-pointer"
            aria-label="Đóng"
            title="Đóng cửa sổ (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ================= COMPACT 5-TAB KIẾM THẾ 2009 TOP STRIP ================= */}
        <div className="grid grid-cols-5 gap-0.5 border-b border-[#465159] bg-[#151A1E] px-1.5 py-1">
          {[
            { id: 'equip', label: 'Nhân vật', icon: Shield },
            { id: 'bag', label: `Túi (${player.inventory.length})`, icon: Backpack },
            { id: 'skills', label: 'Kỹ năng', icon: Flame },
            { id: 'enhance', label: 'C.Hóa', icon: Hammer },
            { id: 'mounts', label: 'Ngựa', icon: Wind },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as CharacterModalTab)}
                className={`flex items-center justify-center gap-0.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  tab === t.id ? 'kt-tab-active' : 'kt-tab'
                }`}
              >
                <Icon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ================= COMPACT VERTICAL SCROLLABLE BODY ================= */}
        <div className="flex-1 overflow-y-auto p-2.5">
          {/* ========================================================================
              TAB 1: NHÂN VẬT (F1) — COMPACT VERTICAL PAPER-DOLL LIKE KIẾM THẾ PC 2009
             ======================================================================== */}
          {tab === 'equip' && (
            <div className="flex flex-col gap-2">
              {/* Compact Portrait + Hero Identity Block (exact 2009 top layout) */}
              <div className="flex items-center gap-2 rounded border border-[#444F57] bg-[#12161A] p-2">
                <div className="kt-slot relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                  {player.avatarUrl ? (
                    <img
                      src={player.avatarUrl}
                      alt={player.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="font-wuxia text-sm font-bold"
                      style={{ color: sect.color }}
                    >
                      {sect.name.split(' ')[0]}
                    </span>
                  )}
                  <span className="absolute right-0 bottom-0 bg-black/85 px-0.5 font-mono text-[8.5px] font-bold text-[#FDE047] tabular-nums">
                    {player.level}
                  </span>
                </div>
                <div className="min-w-0 flex-1 space-y-0.5 text-[10.5px] leading-tight">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-bold text-[#FEF3C7]">{player.name}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-[#F5D061] tabular-nums">
                      LC {formatNumber(stats.power)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[#B6C3CB]">
                    <span className="truncate">
                      Phái: <strong style={{ color: sect.color }}>{sect.name}</strong>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      PK:{' '}
                      <strong className={player.pkPoints > 0 ? 'text-[#F87171]' : 'text-[#4ADE80]'}>
                        {player.pkPoints}
                      </strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-[#95A4AD]">
                    <span className="truncate">
                      Bang: <strong className="text-[#86EFAC]">{guildName || 'Chưa có'}</strong>
                    </span>
                    <span className="shrink-0 font-mono text-[#E5D5B5] tabular-nums">
                      TP {formatNumber(player.wealth)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Authentic Kiếm Thế 2009 Vertical U-Shaped Paper-Doll Frame */}
              <div className="rounded border border-[#434E56] bg-[linear-gradient(180deg,#101417_0%,#0A0D0F_100%)] p-2">
                {/* Top Row (5 compact square slots): Áo | Danh · Phi · Cảnh | Vũ Khí */}
                <div className="mb-1.5 grid grid-cols-5 items-center gap-1">
                  {/* Top-Left: Armor */}
                  {(() => {
                    const item = player.equipment.armor;
                    const q = item ? QUALITY_META[item.quality] : null;
                    return (
                      <button
                        type="button"
                        onClick={() => setInspectedEquipSlot('armor')}
                        title={item ? `${SLOT_LABELS.armor}: ${item.name}` : 'Chưa mặc Áo Giáp'}
                        className={`kt-slot flex aspect-square w-full items-center justify-center p-0.5 cursor-pointer ${
                          inspectedEquipSlot === 'armor' ? 'ring-2 ring-[#FDE047]' : ''
                        }`}
                        style={{ borderColor: q ? q.border : undefined }}
                      >
                        {item ? (
                          <PixelItemIcon
                            slot="armor"
                            quality={item.quality}
                            itemName={item.name}
                            sectId={player.sect}
                            enhance={item.enhance}
                            size="sm"
                          />
                        ) : (
                          <span className="text-[9px] text-[#6B7780]">Áo</span>
                        )}
                      </button>
                    );
                  })()}

                  {/* 3 Classic Center-Top Slots (Danh | Phi | Cảnh — matches Mặt | Ngoại | Khoác in 2009!) */}
                  <button
                    type="button"
                    onClick={() => onOpenTitleMantle?.()}
                    title={titleObj ? `Danh Hiệu: « ${titleObj.name} »` : 'Danh Hiệu Võ Lâm'}
                    className="kt-slot flex aspect-square w-full flex-col items-center justify-center px-0.5 text-center cursor-pointer"
                  >
                    <span className="text-[8px] text-[#8B98A1] leading-none">Danh</span>
                    <span
                      className="mt-0.5 max-w-full truncate text-[8.5px] font-bold leading-tight"
                      style={{ color: titleObj?.color || '#C8D3DA' }}
                    >
                      {titleObj ? titleObj.name.split(' ')[0] : 'Trống'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenTitleMantle?.()}
                    title={`Phi Phong: ${mantle.name}`}
                    className="kt-slot flex aspect-square w-full flex-col items-center justify-center px-0.5 text-center cursor-pointer"
                    style={{ borderColor: mantle.color }}
                  >
                    <span className="text-[8px] text-[#8B98A1] leading-none">Phi</span>
                    <span
                      className="mt-0.5 max-w-full truncate text-[8.5px] font-bold leading-tight"
                      style={{ color: mantle.color }}
                    >
                      {mantle.name}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMountView('illusions');
                      setTab('mounts');
                    }}
                    title={`Cảnh giới: ${realm.name}`}
                    className="kt-slot flex aspect-square w-full flex-col items-center justify-center px-0.5 text-center cursor-pointer"
                    style={{ borderColor: realm.auraColor }}
                  >
                    <span className="text-[8px] text-[#8B98A1] leading-none">Cảnh</span>
                    <span
                      className="mt-0.5 max-w-full truncate text-[8.5px] font-bold leading-tight"
                      style={{ color: realm.auraColor }}
                    >
                      Bậc {realm.tier}
                    </span>
                  </button>

                  {/* Top-Right: Weapon */}
                  {(() => {
                    const item = player.equipment.weapon;
                    const q = item ? QUALITY_META[item.quality] : null;
                    return (
                      <button
                        type="button"
                        onClick={() => setInspectedEquipSlot('weapon')}
                        title={item ? `${SLOT_LABELS.weapon}: ${item.name}` : 'Chưa trang bị Vũ Khí'}
                        className={`kt-slot flex aspect-square w-full items-center justify-center p-0.5 cursor-pointer ${
                          inspectedEquipSlot === 'weapon' ? 'ring-2 ring-[#FDE047]' : ''
                        }`}
                        style={{ borderColor: q ? q.border : undefined }}
                      >
                        {item ? (
                          <PixelItemIcon
                            slot="weapon"
                            quality={item.quality}
                            itemName={item.name}
                            sectId={player.sect}
                            enhance={item.enhance}
                            size="sm"
                          />
                        ) : (
                          <span className="text-[9px] text-[#6B7780]">Vũ khí</span>
                        )}
                      </button>
                    );
                  })()}
                </div>

                {/* Middle Section: Left 3 Slots | Live Hero Showcase | Right 3 Slots */}
                <div className="grid grid-cols-5 items-stretch gap-1">
                  {/* Left Column */}
                  <div className="flex flex-col justify-between gap-1">
                    {(['bracer', 'boots'] as EquipSlot[]).map((slot) => {
                      const item = player.equipment[slot];
                      const q = item ? QUALITY_META[item.quality] : null;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setInspectedEquipSlot(slot)}
                          title={item ? `${SLOT_LABELS[slot]}: ${item.name}` : SLOT_LABELS[slot]}
                          className={`kt-slot flex aspect-square w-full items-center justify-center p-0.5 cursor-pointer ${
                            inspectedEquipSlot === slot ? 'ring-2 ring-[#FDE047]' : ''
                          }`}
                          style={{ borderColor: q ? q.border : undefined }}
                        >
                          {item ? (
                            <PixelItemIcon
                              slot={slot}
                              quality={item.quality}
                              itemName={item.name}
                              sectId={player.sect}
                              enhance={item.enhance}
                              size="sm"
                            />
                          ) : (
                            <span className="text-[8.5px] text-[#6B7780]">{SLOT_LABELS[slot].slice(0, 4)}</span>
                          )}
                        </button>
                      );
                    })}
                    {/* Mount Shortcut Slot */}
                    <button
                      type="button"
                      onClick={() => {
                        setMountView('mounts');
                        setTab('mounts');
                      }}
                      title={
                        activeMount
                          ? `Thú Cưỡi: ${activeIllusion ? activeIllusion.name : activeMount.name} (+${stats.moveSpeedPct}% Tốc)`
                          : 'Mở Chuồng Ngựa'
                      }
                      className="kt-slot flex aspect-square w-full items-center justify-center p-0.5 cursor-pointer"
                      style={{
                        borderColor: activeIllusion
                          ? activeIllusion.auraColor
                          : activeMount
                          ? QUALITY_META[activeMount.quality].border
                          : undefined,
                      }}
                    >
                      <SkillIcon
                        skillType="mount"
                        color={
                          activeIllusion
                            ? activeIllusion.auraColor
                            : activeMount
                            ? QUALITY_META[activeMount.quality].color
                            : '#8A969E'
                        }
                        accentColor="#FEF08A"
                        size={30}
                      />
                    </button>
                  </div>

                  {/* Center Character Showcase */}
                  <div className="col-span-3 flex flex-col items-center justify-center rounded border border-[#445058] bg-[radial-gradient(circle_at_50%_62%,#1C252B_0%,#0A0E11_80%)] p-1 shadow-[inset_0_3px_10px_rgba(0,0,0,0.95)]">
                    <PixelHeroPreview
                      sectId={player.sect}
                      player={player}
                      width={132}
                      height={126}
                      interactive
                    />
                  </div>

                  {/* Right Column */}
                  <div className="flex flex-col justify-between gap-1">
                    {(['ring', 'jade'] as EquipSlot[]).map((slot) => {
                      const item = player.equipment[slot];
                      const q = item ? QUALITY_META[item.quality] : null;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setInspectedEquipSlot(slot)}
                          title={item ? `${SLOT_LABELS[slot]}: ${item.name}` : SLOT_LABELS[slot]}
                          className={`kt-slot flex aspect-square w-full items-center justify-center p-0.5 cursor-pointer ${
                            inspectedEquipSlot === slot ? 'ring-2 ring-[#FDE047]' : ''
                          }`}
                          style={{ borderColor: q ? q.border : undefined }}
                        >
                          {item ? (
                            <PixelItemIcon
                              slot={slot}
                              quality={item.quality}
                              itemName={item.name}
                              sectId={player.sect}
                              enhance={item.enhance}
                              size="sm"
                            />
                          ) : (
                            <span className="text-[8.5px] text-[#6B7780]">{SLOT_LABELS[slot].slice(0, 4)}</span>
                          )}
                        </button>
                      );
                    })}
                    {/* Enhance Shortcut Slot */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlot(inspectedEquipSlot || 'weapon');
                        setTab('enhance');
                      }}
                      title={`Cường Hóa · Đá CH: ${formatNumber(player.enhanceStones)}`}
                      className="kt-slot flex aspect-square w-full flex-col items-center justify-center cursor-pointer"
                    >
                      <Hammer className="h-3.5 w-3.5 text-[#F5D061]" />
                      <span className="mt-0.5 font-mono text-[8px] font-bold text-[#C084FC] tabular-nums">
                        {formatNumber(player.enhanceStones)}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Compact Selected Equipped Item Strip */}
              {inspectedEquipSlot && (
                <div className="rounded border border-[#445058] bg-[#101418] px-2.5 py-1.5 text-[10.5px]">
                  {(() => {
                    const eq = player.equipment[inspectedEquipSlot];
                    if (!eq) {
                      return (
                        <div className="flex items-center justify-between text-[#85939C]">
                          <span>Ô {SLOT_LABELS[inspectedEquipSlot]} trống</span>
                          <button
                            type="button"
                            onClick={() => setTab('bag')}
                            className="kt-btn-jade px-2 py-0.5 text-[10px] font-semibold cursor-pointer"
                          >
                            Mở Túi
                          </button>
                        </div>
                      );
                    }
                    const q = QUALITY_META[eq.quality];
                    const eff = getEffectiveItemStats(eq);
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-bold" style={{ color: q.color }}>
                              {eq.name}
                              {eq.enhance > 0 ? ` +${eq.enhance}` : ''}
                            </span>
                            <span className="shrink-0 font-mono text-[9.5px] text-[#F5D061] tabular-nums">
                              LC {formatNumber(eff.power)}
                            </span>
                          </div>
                          <div className="font-mono text-[9.5px] text-[#B0BEC7] tabular-nums">
                            Công {eff.atk} · Thủ {eff.def} · HP {eff.hp} · CM {eq.crit}%
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSlot(inspectedEquipSlot);
                            setTab('enhance');
                          }}
                          className="kt-btn-crimson shrink-0 px-2 py-1 text-[9.5px] font-semibold cursor-pointer"
                        >
                          C.Hóa
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Compact 2-Column Combat Attributes Block */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded border border-[#3E4850] bg-[#101417] px-2.5 py-1.5 font-mono text-[10.5px] tabular-nums">
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Sinh Lực</span>
                  <span className="font-bold text-[#4ADE80]">{formatNumber(stats.maxHp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Nội Lực</span>
                  <span className="font-bold text-[#60A5FA]">{formatNumber(stats.maxMp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Công Kích</span>
                  <span className="font-bold text-[#F87171]">{formatNumber(stats.atk)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Phòng Thủ</span>
                  <span className="font-bold text-[#F5D061]">{formatNumber(stats.def)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Chí Mạng</span>
                  <span className="font-bold text-[#FBBF24]">{stats.crit}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Thân Pháp</span>
                  <span className="font-bold text-[#93C5FD]">{stats.dodge}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Tốc Chạy</span>
                  <span className="font-bold text-[#67E8F9]">+{stats.moveSpeedPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-[#93A1AA]">Kháng Tất</span>
                  <span className="font-bold text-[#C084FC]">
                    +{stats.allResist}%
                    {weatherMeta.allResistDelta !== 0
                      ? `(${weatherMeta.allResistDelta > 0 ? '+' : ''}${weatherMeta.allResistDelta})`
                      : ''}
                  </span>
                </div>
              </div>

              {/* PK / Điểm Sát Khí Strip */}
              {(player.pkPoints > 0 || stats.pkPenaltyPct > 0) && (
                <div className="flex items-center justify-between gap-1.5 rounded border border-[#7F1D1D] bg-[#221113] px-2 py-1.5 text-[10px]">
                  <div className="flex min-w-0 items-center gap-1 text-[#FCA5A5]">
                    <Skull className="h-3 w-3 shrink-0 text-[#EF4444]" />
                    <span className="truncate">
                      Sát Khí <strong>{player.pkPoints}/10</strong>
                      {stats.pkPenaltyPct > 0
                        ? ` · -${stats.pkPenaltyPct}% (${pkPenaltyRemainSec}s)`
                        : ` · Rửa ${player.pkWashCounter}/8`}
                    </span>
                  </div>
                  {(() => {
                    const cleanseCost =
                      player.pkPoints * 500 + (stats.pkPenaltyPct > 0 ? 400 : 0);
                    return (
                      <button
                        type="button"
                        onClick={onCleansePk}
                        disabled={player.silver < cleanseCost}
                        className="kt-btn-crimson shrink-0 px-2 py-0.5 text-[9.5px] font-semibold disabled:opacity-45 cursor-pointer"
                      >
                        Rửa ({formatNumber(cleanseCost)})
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================
              TAB 2: TÚI ĐỒ (F2) — COMPACT VERTICAL 6×5 GRID BAG LIKE KIẾM THẾ PC
             ======================================================================== */}
          {tab === 'bag' && (() => {
            const slotsArray = Array.from(
              { length: BAG_CAPACITY },
              (_, idx) => displayedInventory[idx] ?? null
            );
            const compareEquipped = selectedBagItem ? player.equipment[selectedBagItem.slot] : null;
            const compareEff = compareEquipped ? getEffectiveItemStats(compareEquipped) : null;
            const powerDelta = selectedBagItem
              ? selectedBagItem.power - (compareEff?.power ?? compareEquipped?.power ?? 0)
              : 0;

            return (
              <div className="flex flex-col gap-2">
                {/* Compact 1-row Filter + Sort/Sell Strip */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-0.5">
                    {[
                      { id: 'all', label: 'Tất cả' },
                      { id: 'weapon', label: 'VK' },
                      { id: 'armor', label: 'Giáp' },
                      { id: 'accessory', label: 'Sức' },
                      { id: 'rare', label: 'Hiếm' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setBagFilter(f.id as 'all' | 'weapon' | 'armor' | 'accessory' | 'rare')
                        }
                        className={`px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          bagFilter === f.id ? 'kt-tab-active' : 'kt-tab'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBagSorted((v) => !v)}
                      title="Sắp xếp theo phẩm chất & Lực Chiến"
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[9.5px] font-semibold cursor-pointer ${
                        bagSorted ? 'kt-btn-jade' : 'kt-btn-bronze'
                      }`}
                    >
                      <ArrowDownWideNarrow className="h-2.5 w-2.5" />
                      <span>Xếp</span>
                    </button>
                    <button
                      type="button"
                      onClick={onSellJunk}
                      title="Bán toàn bộ trang bị Trắng & Lục"
                      className="kt-btn-bronze flex items-center gap-0.5 px-1.5 py-0.5 text-[9.5px] font-semibold cursor-pointer"
                    >
                      <Coins className="h-2.5 w-2.5 text-[#F5D061]" />
                      <span>Rác</span>
                    </button>
                  </div>
                </div>

                {/* Classic Compact 6×5 Recessed Obsidian Grid (30 authentic ~44px square slots) */}
                <div className="rounded border border-[#4E5960] bg-[#090C0E] p-1.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.92)]">
                  <div className="grid grid-cols-6 gap-1">
                    {slotsArray.map((item, idx) => {
                      if (!item) {
                        return (
                          <div
                            key={`empty_${idx}`}
                            className="kt-grid-slot flex aspect-square items-center justify-center opacity-60"
                          >
                            <span className="h-1 w-1 rounded-full bg-[#242C31]" />
                          </div>
                        );
                      }
                      const q = QUALITY_META[item.quality];
                      const eq = player.equipment[item.slot];
                      const eqPower = eq ? getEffectiveItemStats(eq).power : 0;
                      const isUpgrade = item.power > eqPower;
                      const isSelected = selectedBagItem?.id === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedBagItemId(item.id)}
                          onDoubleClick={() => onEquipItem(item)}
                          title={`${item.name} (${q.name}) · LC ${formatNumber(item.power)} · Nhấp đúp để mặc`}
                          className={`kt-grid-slot relative flex aspect-square items-center justify-center p-[2px] cursor-pointer ${
                            isSelected ? 'ring-2 ring-[#FDE047]' : ''
                          }`}
                          style={{ borderColor: isSelected ? '#FDE047' : q.border }}
                        >
                          <PixelItemIcon
                            slot={item.slot}
                            quality={item.quality}
                            itemName={item.name}
                            sectId={player.sect}
                            enhance={item.enhance}
                            size="sm"
                          />
                          {isUpgrade && (
                            <span
                              className="pointer-events-none absolute top-0 left-0 z-20 rounded-br bg-[#062916]/90 px-0.5 text-[8px] font-bold leading-none text-[#4ADE80]"
                              title="Mạnh hơn trang bị đang mặc"
                            >
                              ▲
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Compact Selected Item Inspector & Direct Equip/Compare Card */}
                <div className="rounded border border-[#525E66] bg-[#101418] p-2">
                  {selectedBagItem ? (
                    (() => {
                      const q = QUALITY_META[selectedBagItem.quality];
                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2">
                            <PixelItemIcon
                              slot={selectedBagItem.slot}
                              quality={selectedBagItem.quality}
                              itemName={selectedBagItem.name}
                              sectId={player.sect}
                              enhance={selectedBagItem.enhance}
                              size="md"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className="truncate font-wuxia text-sm font-bold leading-tight"
                                  style={{ color: q.color }}
                                >
                                  {selectedBagItem.name}
                                  {selectedBagItem.enhance > 0 ? ` +${selectedBagItem.enhance}` : ''}
                                </span>
                                <span className="shrink-0 font-mono text-[10px] font-bold text-[#F5D061] tabular-nums">
                                  LC {formatNumber(selectedBagItem.power)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 text-[9.5px] text-[#9AA7B0]">
                                <span>{SLOT_LABELS[selectedBagItem.slot]}</span>
                                <span>·</span>
                                <span style={{ color: q.color }}>{q.name}</span>
                                <span>·</span>
                                <span className="font-mono">Lv.{selectedBagItem.levelReq}</span>
                                {powerDelta !== 0 && (
                                  <span
                                    className={`font-mono font-bold tabular-nums ${
                                      powerDelta > 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                                    }`}
                                  >
                                    ({powerDelta > 0 ? `+${formatNumber(powerDelta)}` : formatNumber(powerDelta)})
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[10px] text-[#D8E1E6] tabular-nums">
                                <span>
                                  Công <strong className="text-[#FCA5A5]">+{selectedBagItem.atk}</strong>
                                </span>
                                <span>
                                  Thủ <strong className="text-[#F5D061]">+{selectedBagItem.def}</strong>
                                </span>
                                <span>
                                  HP <strong className="text-[#86EFAC]">+{selectedBagItem.hp}</strong>
                                </span>
                                <span>
                                  CM <strong className="text-[#FBBF24]">+{selectedBagItem.crit}%</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 border-t border-[#242D33] pt-1.5">
                            <button
                              type="button"
                              onClick={() => onEquipItem(selectedBagItem)}
                              className="kt-btn-crimson flex-1 py-1 text-[10.5px] font-semibold cursor-pointer"
                            >
                              Trang Bị Ngay
                            </button>
                            <button
                              type="button"
                              onClick={() => onSellItem(selectedBagItem.id)}
                              className="kt-btn-bronze flex items-center gap-1 px-2 py-1 text-[10.5px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <Trash2 className="h-3 w-3 text-[#F87171]" />
                              <span>+{formatNumber(q.sellSilver)}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="py-3 text-center text-[10.5px] text-[#808E96]">
                      {player.inventory.length === 0
                        ? 'Hành trang trống. Đánh quái hoặc mở Rương Báu để nhặt trang bị.'
                        : 'Chọn ô vật phẩm trong Túi Đồ để xem chỉ số.'}
                    </div>
                  )}
                </div>

                {/* Classic Kiếm Thế Bottom Silver/Gold Purse & Quick Buy */}
                <div className="rounded border border-[#49545C] bg-[#14191D] px-2 py-1.5 text-[10px]">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono tabular-nums">
                    <span className="text-[#C7D2D9]">
                      Bạc: <strong className="text-[#F5D061]">{formatNumber(player.silver)}</strong>
                    </span>
                    <span className="text-[#C7D2D9]">
                      Đồng: <strong className="text-[#FBBF24]">{formatNumber(player.goldIngots)}</strong>
                    </span>
                    <span className="text-[#C7D2D9]">
                      Đá CH: <strong className="text-[#C084FC]">{formatNumber(player.enhanceStones)}</strong>
                    </span>
                    <span className="text-[#C7D2D9]">
                      Dược: <strong className="text-[#4ADE80]">{player.potions}</strong>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 border-t border-[#293238] pt-1.5">
                    <button
                      type="button"
                      onClick={onBuyPotion}
                      className="kt-btn-jade flex-1 py-1 text-[10px] font-semibold cursor-pointer"
                    >
                      +5 Dược (400 Bạc)
                    </button>
                    <button
                      type="button"
                      onClick={onBuyStones}
                      className="kt-btn-bronze flex-1 py-1 text-[10px] font-semibold text-[#D8B4FE] cursor-pointer"
                    >
                      +5 Đá CH (50 Đồng)
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ========================================================================
              TAB 3: KỸ NĂNG (F3) — COMPACT VERTICAL SKILL BOOK
             ======================================================================== */}
          {tab === 'skills' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between rounded border border-[#445058] bg-[#12161A] px-2.5 py-1.5 text-[10.5px]">
                <span className="font-wuxia text-sm font-bold" style={{ color: sect.color }}>
                  {sect.name} · Võ Học
                </span>
                <span className="font-mono text-[#F5D061] tabular-nums">
                  {totalSkillTiers}/80 Tầng
                </span>
              </div>

              {/* 4 Active Skills Row */}
              <div className="rounded border border-[#445058] bg-[#111519] p-2">
                <div className="mb-1.5 text-[9.5px] font-semibold text-[#A5B4BD]">
                  Chiêu Thức Chủ Động (Phím 1–4)
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {sect.skills.map((sk, idx) => {
                    const lvl = player.skillLevels[sk.id] || 0;
                    const unlocked = player.level >= sk.unlockLevel;
                    const cost = Math.round(450 * Math.pow(Math.max(1, lvl + 1), 1.45));
                    const canUpgrade = unlocked && player.silver >= cost && lvl < 20;
                    const isSelected = effectiveActiveSkill?.id === sk.id;
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => setSelectedSkillKey(sk.id)}
                        className={`relative flex flex-col items-center rounded border p-1 text-center cursor-pointer ${
                          isSelected
                            ? 'border-[#F5D061] bg-[#1E262B]'
                            : 'border-[#3B454D] bg-[#0D1013] hover:border-[#6E7E88]'
                        }`}
                      >
                        <div className="kt-slot relative p-0.5">
                          <SkillIcon
                            sectId={player.sect}
                            skillType={sk.type}
                            skillIndex={idx}
                            color={sk.color}
                            accentColor={sk.accentColor}
                            size={34}
                            locked={!unlocked}
                          />
                          <span className="absolute top-0 left-0.5 font-mono text-[8px] font-bold text-[#FDE047]">
                            {sk.keyBind}
                          </span>
                          {canUpgrade && (
                            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#FDE047] bg-[#15803D] font-mono text-[8.5px] font-bold text-white">
                              +
                            </span>
                          )}
                        </div>
                        <span className="mt-1 font-mono text-[9px] text-[#F5D061] tabular-nums">
                          {unlocked ? `T.${lvl}` : `Lv.${sk.unlockLevel}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 4 Passive Tâm Pháp Row */}
                <div className="mt-2 border-t border-[#2A333A] pt-1.5">
                  <div className="mb-1.5 text-[9.5px] font-semibold text-[#F5D061]">
                    Tâm Pháp Bị Động
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {sect.passives.map((ps, idx) => {
                      const active = player.level >= ps.unlockLevel;
                      const isSelected = selectedPassiveSkill?.id === ps.id;
                      return (
                        <button
                          key={ps.id}
                          type="button"
                          onClick={() => setSelectedSkillKey(ps.id)}
                          className={`flex flex-col items-center rounded border p-1 text-center cursor-pointer ${
                            isSelected
                              ? 'border-[#88C29B] bg-[#18271F]'
                              : active
                              ? 'border-[#3E4F46] bg-[#101814]'
                              : 'border-[#2E353A] bg-[#0C0F11] opacity-65'
                          }`}
                        >
                          <SkillIcon
                            sectId={player.sect}
                            skillType="passive"
                            skillIndex={idx}
                            color={active ? sect.color : '#6B7280'}
                            accentColor="#F5D061"
                            size={30}
                            locked={!active}
                          />
                          <span
                            className={`mt-1 font-mono text-[8.5px] tabular-nums ${
                              active ? 'text-[#4ADE80]' : 'text-[#84919A]'
                            }`}
                          >
                            {active ? 'Kích' : `Lv.${ps.unlockLevel}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Compact Selected Skill Inspector & Upgrade */}
              <div className="rounded border border-[#525E66] bg-[#101418] p-2.5">
                {selectedPassiveSkill ? (
                  <div className="space-y-1.5 text-[11px]">
                    <div className="font-wuxia text-base font-bold" style={{ color: sect.color }}>
                      {selectedPassiveSkill.name}
                    </div>
                    <div className="text-[10px] text-[#95A4AD]">
                      Tâm Pháp Bị Động · Yêu cầu Cấp {selectedPassiveSkill.unlockLevel}
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-[#CED8DE]">
                      {selectedPassiveSkill.description}
                    </p>
                    <div className="rounded border border-[#3F5749] bg-[#101C15] px-2 py-1 font-mono text-[10.5px] font-bold text-[#86EFAC]">
                      {formatPassiveBonusText(selectedPassiveSkill)}
                    </div>
                  </div>
                ) : effectiveActiveSkill ? (
                  (() => {
                    const sk = effectiveActiveSkill;
                    const lvl = player.skillLevels[sk.id] || 0;
                    const unlocked = player.level >= sk.unlockLevel;
                    const isMax = lvl >= 20;
                    const upgradeCost = Math.round(450 * Math.pow(Math.max(1, lvl + 1), 1.45));
                    const canUpgrade = unlocked && !isMax && player.silver >= upgradeCost;
                    const curMult = Math.round(
                      sk.multiplier * (1 + Math.max(0, lvl - 1) * 0.12) * 100
                    );
                    const nextMult = Math.round(
                      sk.multiplier * (1 + Math.max(0, lvl) * 0.12) * 100
                    );

                    return (
                      <div className="space-y-2 text-[10.5px]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-wuxia text-base font-bold" style={{ color: sk.color }}>
                            {sk.name}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-[#F5D061] tabular-nums">
                            Tầng {lvl}/20
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-snug text-[#CED8DE]">
                          {sk.description}
                        </p>
                        <div className="rounded border border-[#3E4A52] bg-[#0B0E11] px-2 py-1 text-[10px] text-[#F5D061]">
                          {sk.effectText}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] tabular-nums">
                          <div className="rounded border border-[#39434B] bg-[#0D1114] p-1.5">
                            <div className="text-[9px] text-[#8E9CA5]">Hiện tại</div>
                            <div>Uy lực: {curMult}%</div>
                            <div>Hồi: {sk.cooldown}s · MP {sk.mpCost}</div>
                          </div>
                          <div className="rounded border border-[#496A57] bg-[#101C16] p-1.5">
                            <div className="text-[9px] text-[#86EFAC]">
                              {isMax ? 'Đỉnh Phong' : `Tầng ${lvl + 1}`}
                            </div>
                            <div className="font-bold text-[#4ADE80]">
                              Uy lực: {isMax ? curMult : nextMult}%
                            </div>
                            <div className="text-[#C7D4DC]">Phạm vi: {sk.radius}px</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums">
                          <span className="font-sans text-[#9AA8B1]">Phí lĩnh ngộ</span>
                          <span
                            className={
                              player.silver >= upgradeCost
                                ? 'font-bold text-[#F5D061]'
                                : 'font-bold text-[#F87171]'
                            }
                          >
                            {isMax ? 'Tối Đa' : `${formatNumber(upgradeCost)} Bạc`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpgradeSkill(sk.id)}
                          disabled={!canUpgrade}
                          className="kt-btn-crimson flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold disabled:opacity-45 cursor-pointer"
                        >
                          <ArrowUpCircle className="h-3.5 w-3.5" />
                          <span>
                            {!unlocked
                              ? `Cần Cấp ${sk.unlockLevel}`
                              : isMax
                              ? 'Đã Viên Mãn'
                              : lvl === 0
                              ? 'Học Tuyệt Học'
                              : `Lên Tầng ${lvl + 1}`}
                          </span>
                        </button>
                      </div>
                    );
                  })()
                ) : null}
              </div>
            </div>
          )}

          {/* ========================================================================
              TAB 4: CƯỜNG HÓA — COMPACT VERTICAL ANVIL
             ======================================================================== */}
          {tab === 'enhance' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1.5">
                {SLOTS.map((slot) => {
                  const item = player.equipment[slot];
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`flex flex-col items-center rounded border p-1.5 text-center cursor-pointer ${
                        active
                          ? 'border-[#F5D061] bg-[#1E272D]'
                          : 'border-[#3E4850] bg-[#111519] hover:border-[#6E7E88]'
                      }`}
                    >
                      {item ? (
                        <PixelItemIcon
                          slot={slot}
                          quality={item.quality}
                          itemName={item.name}
                          sectId={player.sect}
                          enhance={item.enhance}
                          size="sm"
                        />
                      ) : (
                        <div className="kt-slot flex h-9 w-9 items-center justify-center text-[9px] text-[#6B7780]">
                          —
                        </div>
                      )}
                      <span className="mt-1 text-[9.5px] text-[#B6C3CB]">
                        {SLOT_LABELS[slot].slice(0, 7)}
                      </span>
                      {item && (
                        <span className="font-mono text-[9.5px] font-bold text-[#F5D061] tabular-nums">
                          +{item.enhance}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded border border-[#546068] bg-[#12161A] p-2.5">
                {activeEnhanceItem ? (
                  (() => {
                    const cost = getEnhanceCost(activeEnhanceItem);
                    const curEff = getEffectiveItemStats(activeEnhanceItem);
                    const nextEff = getEffectiveItemStats({
                      ...activeEnhanceItem,
                      enhance: activeEnhanceItem.enhance + 1,
                    });
                    const canAfford =
                      player.silver >= cost.silver && player.enhanceStones >= cost.stones;

                    return (
                      <div className="space-y-2 text-[10.5px]">
                        <div className="flex items-center gap-2 border-b border-[#303940] pb-2">
                          <PixelItemIcon
                            slot={activeEnhanceItem.slot}
                            quality={activeEnhanceItem.quality}
                            itemName={activeEnhanceItem.name}
                            sectId={player.sect}
                            enhance={activeEnhanceItem.enhance}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate font-wuxia text-base font-bold"
                              style={{ color: QUALITY_META[activeEnhanceItem.quality].color }}
                            >
                              {activeEnhanceItem.name} (+{activeEnhanceItem.enhance} → +
                              {activeEnhanceItem.enhance + 1})
                            </div>
                            <div className="text-[9.5px] text-[#96A4AD]">
                              {getEnhanceTierLabel(activeEnhanceItem.enhance)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] tabular-nums">
                          <div className="rounded border border-[#3B454D] bg-[#0D1114] p-2">
                            <div className="font-sans text-[9.5px] text-[#96A4AD]">Hiện tại</div>
                            <div>Công: {curEff.atk}</div>
                            <div>Thủ: {curEff.def}</div>
                            <div>HP: {curEff.hp}</div>
                            <div className="text-[#F5D061]">LC {formatNumber(curEff.power)}</div>
                          </div>
                          <div className="rounded border border-[#496A57] bg-[#101C16] p-2">
                            <div className="font-sans text-[9.5px] text-[#86EFAC]">
                              Sau +{activeEnhanceItem.enhance + 1}
                            </div>
                            <div className="text-[#4ADE80]">Công: {nextEff.atk}</div>
                            <div className="text-[#4ADE80]">Thủ: {nextEff.def}</div>
                            <div className="text-[#4ADE80]">HP: {nextEff.hp}</div>
                            <div className="font-bold text-[#F5D061]">
                              +{formatNumber(nextEff.power - curEff.power)} LC
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded border border-[#3C474F] bg-[#0D1114] px-2 py-1.5 font-mono text-[10px] tabular-nums">
                          <span>
                            <strong className="text-[#F5D061]">{formatNumber(cost.silver)}</strong> Bạc ·{' '}
                            <strong className="text-[#C084FC]">{cost.stones}</strong> Đá
                          </span>
                          <span>
                            Tỷ lệ{' '}
                            <strong
                              className={
                                cost.successRate >= 70 ? 'text-[#4ADE80]' : 'text-[#FBBF24]'
                              }
                            >
                              {cost.successRate}%
                            </strong>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onEnhanceSlot(selectedSlot)}
                          disabled={!canAfford}
                          className="kt-btn-crimson flex w-full items-center justify-center gap-1.5 py-2 text-[11px] font-bold disabled:opacity-45 cursor-pointer"
                        >
                          <Hammer className="h-3.5 w-3.5" />
                          <span>
                            {canAfford ? 'Tiến Hành Cường Hóa' : 'Thiếu Bạc hoặc Đá CH'}
                          </span>
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <div className="py-6 text-center text-[11px] text-[#86949D]">
                    Hãy trang bị vật phẩm vào ô này trước khi cường hóa.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================
              TAB 5: THÚ CƯỠI & HUYỄN HÓA — COMPACT VERTICAL LIST
             ======================================================================== */}
          {tab === 'mounts' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMountView('mounts')}
                  className={`flex-1 py-1 text-[10px] font-semibold cursor-pointer ${
                    mountView === 'mounts' ? 'kt-tab-active' : 'kt-tab'
                  }`}
                >
                  Tuấn Mã ({player.ownedMounts.length}/{MOUNTS.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMountView('illusions')}
                  className={`flex flex-1 items-center justify-center gap-1 py-1 text-[10px] font-semibold cursor-pointer ${
                    mountView === 'illusions' ? 'kt-tab-active' : 'kt-tab'
                  }`}
                >
                  <Sparkles className="h-3 w-3 text-[#F5D061]" />
                  <span>Huyễn Hóa ({unlockedIllusionCount}/{MOUNT_ILLUSIONS.length})</span>
                </button>
              </div>

              {activeMount && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleMount}
                    className="kt-btn-jade flex-1 py-1 text-[10.5px] font-semibold cursor-pointer"
                  >
                    {player.isMounted
                      ? `Đang Cưỡi ${activeIllusion ? activeIllusion.name : activeMount.name} (Xuống · R)`
                      : 'Lên Ngựa Ngay (R)'}
                  </button>
                  {activeIllusion && (
                    <button
                      type="button"
                      onClick={() => onEquipIllusion(null)}
                      className="kt-btn-bronze px-2 py-1 text-[10px] cursor-pointer whitespace-nowrap"
                    >
                      Ngựa gốc
                    </button>
                  )}
                </div>
              )}

              {mountView === 'mounts' ? (
                <div className="space-y-2">
                  {MOUNTS.map((m) => {
                    const owned = player.ownedMounts.includes(m.id);
                    const equipped = player.activeMountId === m.id;
                    const q = QUALITY_META[m.quality];
                    const levelMet = player.level >= m.levelReq;
                    const canAfford =
                      levelMet &&
                      player.silver >= m.silverCost &&
                      player.goldIngots >= m.ingotCost;

                    return (
                      <div
                        key={m.id}
                        className={`rounded border p-2 ${
                          equipped ? 'bg-[#18221D]' : 'bg-[#12161A]'
                        }`}
                        style={{ borderColor: equipped ? '#88C29B' : q.border }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9.5px] text-[#95A4AD]">
                              Bậc {m.tier} · {q.name} · Lv.{m.levelReq}
                            </div>
                            <div
                              className="truncate font-wuxia text-base font-bold"
                              style={{ color: q.color }}
                            >
                              {m.name}
                            </div>
                            <div className="mt-0.5 font-mono text-[9.5px] text-[#C4D1D9] tabular-nums">
                              Tốc +{m.moveSpeedPct}% · Kháng +{m.allResist}% · HP +
                              {formatNumber(m.bonusHp)}
                            </div>
                          </div>
                          <PixelMountPreview
                            mount={m}
                            width={74}
                            height={56}
                            isMoving={equipped && player.isMounted}
                          />
                        </div>
                        <div className="mt-1.5">
                          {owned ? (
                            <button
                              type="button"
                              onClick={() => onSelectMount(m.id)}
                              disabled={equipped && player.isMounted}
                              className={`flex w-full items-center justify-center gap-1 py-1 text-[10.5px] font-semibold cursor-pointer ${
                                equipped && player.isMounted
                                  ? 'kt-btn-jade cursor-default'
                                  : 'kt-btn-crimson'
                              }`}
                            >
                              {equipped && player.isMounted ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  <span>Đang Xuất Chiến</span>
                                </>
                              ) : (
                                <span>{equipped ? 'Lên Ngựa Ngay' : `Cưỡi ${m.name}`}</span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onBuyMount(m.id)}
                              disabled={!canAfford}
                              className="kt-btn-crimson w-full py-1 text-[10.5px] font-semibold disabled:opacity-40 cursor-pointer"
                            >
                              {!levelMet
                                ? `Cần Cấp ${m.levelReq}`
                                : `Thuần Hóa (${formatNumber(m.silverCost)} Bạc${
                                    m.ingotCost > 0 ? ` + ${m.ingotCost} Đồng` : ''
                                  })`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {MOUNT_ILLUSIONS.map((ill) => {
                    const stars = player.mountIllusions?.[ill.id] || 0;
                    const unlocked = stars > 0;
                    const isEquipped = player.activeMountIllusionId === ill.id;
                    const isMaxStar = stars >= 5;
                    const q = QUALITY_META[ill.quality];
                    const curStats = getIllusionStats(ill, Math.max(1, stars));
                    const cost = getIllusionUpgradeCost(ill, stars);
                    const canAfford =
                      !isMaxStar &&
                      player.silver >= cost.silver &&
                      player.goldIngots >= cost.ingots &&
                      player.enhanceStones >= cost.stones;

                    return (
                      <div
                        key={ill.id}
                        className={`rounded border p-2 ${
                          isEquipped ? 'bg-[#18221D]' : 'bg-[#12161A]'
                        }`}
                        style={{ borderColor: isEquipped ? ill.auraColor : q.border }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div
                              className="truncate font-wuxia text-base font-bold"
                              style={{ color: ill.auraColor }}
                            >
                              {ill.name}
                            </div>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`h-2.5 w-2.5 ${
                                    s <= stars
                                      ? 'fill-[#F5D061] text-[#F5D061]'
                                      : 'text-[#3B464E]'
                                  }`}
                                />
                              ))}
                              <span className="ml-1 font-mono text-[9.5px] text-[#C4D1D9]">
                                {unlocked ? `${stars}/5★` : 'Chưa mở'}
                              </span>
                            </div>
                            <div className="mt-0.5 font-mono text-[9.5px] text-[#C4D1D9] tabular-nums">
                              Tốc +{curStats.moveSpeedPct}% · Công +{formatNumber(curStats.bonusAtk)}
                            </div>
                          </div>
                          <PixelMountPreview
                            mount={activeMount || MOUNTS[0]}
                            illusion={ill}
                            illusionStars={Math.max(1, stars)}
                            width={74}
                            height={56}
                            isMoving
                          />
                        </div>

                        {!isMaxStar && (
                          <div className="mt-1 font-mono text-[9.5px] text-[#9EB0BA] tabular-nums">
                            {formatNumber(cost.silver)} Bạc
                            {cost.ingots > 0 ? ` · ${cost.ingots} Đồng` : ''} · {cost.stones} Đá CH
                          </div>
                        )}

                        <div className="mt-1.5 flex items-center gap-1.5">
                          {unlocked ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEquipIllusion(isEquipped ? null : ill.id)}
                                className={`flex-1 py-1 text-[10px] font-semibold cursor-pointer ${
                                  isEquipped ? 'kt-btn-bronze' : 'kt-btn-crimson'
                                }`}
                              >
                                {isEquipped ? 'Đang Huyễn Hóa (Gỡ)' : 'Khoác Ngoại Hình'}
                              </button>
                              {!isMaxStar && (
                                <button
                                  type="button"
                                  onClick={() => onUnlockOrUpgradeIllusion(ill.id)}
                                  disabled={!canAfford}
                                  className="kt-btn-jade px-2.5 py-1 text-[10px] font-semibold disabled:opacity-40 cursor-pointer"
                                >
                                  +{stars + 1}★
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onUnlockOrUpgradeIllusion(ill.id)}
                              disabled={!canAfford}
                              className="kt-btn-crimson w-full py-1 text-[10px] font-semibold disabled:opacity-40 cursor-pointer"
                            >
                              {canAfford ? `Kích Hoạt ${ill.name}` : 'Chưa Đủ Nguyên Liệu'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

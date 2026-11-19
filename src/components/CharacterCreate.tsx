import React, { useState } from 'react';
import { ArrowLeft, Dices, Shield, Sparkles, Sword } from 'lucide-react';
import { ASSET_PATHS, ELEMENT_META, RANDOM_WUXIA_NAMES, SECTS } from '../game/data';
import { formatPassiveBonusText } from '../game/engine';
import { SectId } from '../game/types';
import { PixelHeroPreview } from './PixelItemIcon';

interface CharacterCreateProps {
  onBack: () => void;
  onConfirm: (name: string, sect: SectId) => void;
}

const SECT_LIST: SectId[] = ['thieu_lam', 'duong_mon', 'nga_mi', 'cai_bang', 'vo_dang'];

export const CharacterCreate: React.FC<CharacterCreateProps> = ({ onBack, onConfirm }) => {
  const [name, setName] = useState(
    () => RANDOM_WUXIA_NAMES[Math.floor(Math.random() * RANDOM_WUXIA_NAMES.length)]
  );
  const [selectedSect, setSelectedSect] = useState<SectId>('vo_dang');

  const sect = SECTS[selectedSect];
  const elem = ELEMENT_META[sect.element];

  const handleRandomName = () => {
    const others = RANDOM_WUXIA_NAMES.filter((n) => n !== name);
    setName(others[Math.floor(Math.random() * others.length)]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;
    onConfirm(cleaned, selectedSect);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#0B0907] text-[#F4E8CD]">
      <img
        src={ASSET_PATHS.titleBackdrop}
        alt="Tạo Nhân Vật Kiếm Thế"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0806]/92 via-[#0E0A07]/85 to-[#090705]/96" />

      {/* Classic Kiếm Thế 2009 Bronze Title Ribbon */}
      <div className="kt-titlebar relative z-10 flex items-center justify-between px-6 py-3 md:px-10">
        <button
          onClick={onBack}
          className="kt-btn-bronze flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Quay Lại</span>
        </button>
        <h1 className="font-wuxia text-2xl font-bold tracking-wide text-[#F7DA85] md:text-3xl">
          Khởi Tạo Hiệp Khách · Ngũ Đại Môn Phái
        </h1>
        <div className="hidden text-xs text-[#D5C094] lg:block">
          Kim khắc Mộc · Mộc khắc Thổ · Thổ khắc Thủy · Thủy khắc Hỏa · Hỏa khắc Kim
        </div>
      </div>

      {/* Main Split Window */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-12 lg:items-center">
        {/* Left: 5 Sects Plaque Selector */}
        <div className="kt-window overflow-hidden lg:col-span-5">
          <div className="kt-titlebar px-4 py-2 text-xs font-semibold text-[#F7DA85]">
            Chọn Tông Môn (Ngũ Hành)
          </div>
          <div className="flex flex-col gap-2 p-3.5">
            {SECT_LIST.map((sid) => {
              const s = SECTS[sid];
              const el = ELEMENT_META[s.element];
              const active = sid === selectedSect;
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => setSelectedSect(sid)}
                  className={`flex items-center justify-between px-3.5 py-3 text-left transition-colors cursor-pointer ${
                    active ? 'kt-btn-jade' : 'kt-slot hover:border-[#D4AF37]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border text-xs font-bold"
                      style={{
                        borderColor: el.color,
                        backgroundColor: `${el.color}22`,
                        color: el.color,
                      }}
                    >
                      {el.name}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-wuxia text-xl font-bold leading-none"
                          style={{ color: active ? '#FEF3C7' : s.color }}
                        >
                          {s.name}
                        </span>
                        <span className="text-[11px] font-semibold" style={{ color: s.color }}>
                          Hệ {s.elementName}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#CBB894]">{s.role}</div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-[#DFCEAC] tabular-nums">
                    <div>Công {s.baseStats.atk}</div>
                    <div>Thủ {s.baseStats.def}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Sect Scroll & Character Name */}
        <form onSubmit={handleSubmit} className="kt-window overflow-hidden lg:col-span-7">
          <div className="kt-titlebar flex items-center justify-between px-5 py-2.5">
            <span className="font-wuxia text-xl font-bold" style={{ color: sect.color }}>
              {sect.name} · Ngũ Hành {sect.elementName}
            </span>
            <span className="text-xs text-[#D5C094]">
              Binh khí: <strong className="text-[#FDE68A]">{sect.weaponType}</strong>
            </span>
          </div>

          <div className="p-5">
            <div className="flex flex-col gap-4 border-b border-[#4B361D] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="text-xs text-[#DFCEAC]">
                  Khắc chế hệ{' '}
                  <span className="font-semibold" style={{ color: ELEMENT_META[elem.counters].color }}>
                    {ELEMENT_META[elem.counters].name}
                  </span>{' '}
                  (+22% sát thương)
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-[#E7DAC0]">{sect.summary}</p>
              </div>
              <div className="kt-slot flex shrink-0 flex-col items-center p-1.5">
                <PixelHeroPreview sectId={selectedSect} width={144} height={130} interactive />
              </div>
            </div>

            {/* Base Stats Row */}
            <div className="mt-4 grid grid-cols-3 gap-2.5 border-b border-[#4B361D] pb-4 sm:grid-cols-6">
              {[
                { label: 'Sinh Lực', val: sect.baseStats.hp },
                { label: 'Nội Lực', val: sect.baseStats.mp },
                { label: 'Công Kích', val: sect.baseStats.atk },
                { label: 'Phòng Thủ', val: sect.baseStats.def },
                { label: 'Chí Mạng', val: `${sect.baseStats.crit}%` },
                { label: 'Thân Pháp', val: `${sect.baseStats.dodge}%` },
              ].map((st) => (
                <div key={st.label} className="kt-slot px-2.5 py-2 text-center">
                  <div className="text-[10px] text-[#B8A582]">{st.label}</div>
                  <div className="font-mono text-xs font-bold text-[#FEF3C7] tabular-nums">
                    {st.val}
                  </div>
                </div>
              ))}
            </div>

            {/* 4 Sect Skills */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#F7DA85]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Tứ Đại Tuyệt Học Môn Phái</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sect.skills.map((sk) => (
                  <div key={sk.id} className="kt-slot px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color: sk.color }}>
                        [{sk.keyBind}] {sk.name}
                      </span>
                      <span className="font-mono text-[10px] text-[#B8A582] tabular-nums">
                        Lv.{sk.unlockLevel}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#D2C1A0]">{sk.effectText}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4 Sect Passive Skills Preview */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#F7DA85]">
                <Shield className="h-3.5 w-3.5" />
                <span>Tâm Pháp Bị Động Tông Môn</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sect.passives.map((ps) => (
                  <div
                    key={ps.id}
                    className="kt-slot flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[#F4E8CD]">{ps.name}</div>
                      <div className="truncate font-mono text-[10px] text-[#4ADE80] tabular-nums">
                        {formatPassiveBonusText(ps)}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[#B8A582] tabular-nums">
                      Lv.{ps.unlockLevel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Character Name + Submit */}
            <div className="mt-5 flex flex-col gap-3 border-t border-[#4B361D] pt-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="hero-name"
                  className="mb-1 block text-xs font-semibold text-[#F7DA85]"
                >
                  Danh Hiệu Nhân Vật (Tên Giang Hồ)
                </label>
                <div className="flex gap-2">
                  <input
                    id="hero-name"
                    type="text"
                    maxLength={22}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nhập tên hiệp khách..."
                    className="kt-slot w-full px-3 py-2 text-sm text-[#FEF3C7] placeholder-[#7B6B54] focus:border-[#EBC56A] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRandomName}
                    title="Đặt tên ngẫu nhiên"
                    className="kt-btn-bronze flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Dices className="h-4 w-4" />
                    <span>Ngẫu Nhiên</span>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={!name.trim()}
                className="kt-btn-crimson flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Sword className="h-4 w-4" />
                <span>Bắt Đầu Hành Tẩu</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

import React from 'react';
import { SectId, SkillDef } from '../game/types';

interface SkillIconProps {
  sectId?: SectId;
  skillType?: SkillDef['type'] | 'passive' | 'potion_hp' | 'potion_mp' | 'dash' | 'chest' | 'mount';
  skillIndex?: number;
  color?: string;
  accentColor?: string;
  size?: number;
  locked?: boolean;
  className?: string;
}

/**
 * Hand-crafted Kiếm Thế 2009 martial arts & consumable icon medallions.
 * Produces crisp high-contrast wuxia iconography for hotbar slots & skill tree.
 */
export const SkillIcon: React.FC<SkillIconProps> = ({
  sectId = 'vo_dang',
  skillType = 'melee',
  skillIndex = 0,
  color = '#F5D061',
  accentColor = '#FEF08A',
  size = 36,
  locked = false,
  className = '',
}) => {
  const c1 = locked ? '#6B7280' : color;
  const c2 = locked ? '#9CA3AF' : accentColor;
  const bgTop = locked ? '#1A1E22' : '#1E252B';
  const bgBot = locked ? '#0B0D0F' : '#090C0E';
  const uid = `sk_${sectId}_${skillType}_${skillIndex}_${c1.replace('#', '')}`;

  const renderGlyph = () => {
    if (skillType === 'potion_hp') {
      return (
        <g>
          {/* Classic Kiếm Thế Red Kim Sang Dược Glass Vial */}
          <rect x="19" y="6" width="10" height="4" rx="1" fill="#C9A25B" stroke="#5E4319" strokeWidth="1.2" />
          <path d="M20 10 L28 10 L28 15 L36 25 C39 30 37 40 24 41 C11 40 9 30 12 25 L20 15 Z" fill="#2A0909" stroke="#D7E0E6" strokeWidth="1.6" />
          <path d="M13.5 27 C16 25 32 25 34.5 27 C36.5 31.5 34.5 38.5 24 39 C13.5 38.5 11.5 31.5 13.5 27 Z" fill="url(#hpGrad)" />
          <ellipse cx="19" cy="29" rx="2.2" ry="5" transform="rotate(-18 19 29)" fill="#FCA5A5" opacity="0.65" />
          <circle cx="28" cy="34" r="1.6" fill="#FEE2E2" opacity="0.7" />
        </g>
      );
    }

    if (skillType === 'potion_mp') {
      return (
        <g>
          {/* Classic Kiếm Thế Blue Hồi Nội Đan Vial */}
          <rect x="19" y="6" width="10" height="4" rx="1" fill="#A8B5BF" stroke="#374151" strokeWidth="1.2" />
          <path d="M20 10 L28 10 L28 15 L36 25 C39 30 37 40 24 41 C11 40 9 30 12 25 L20 15 Z" fill="#0A1633" stroke="#D7E0E6" strokeWidth="1.6" />
          <path d="M13.5 27 C16 25 32 25 34.5 27 C36.5 31.5 34.5 38.5 24 39 C13.5 38.5 11.5 31.5 13.5 27 Z" fill="url(#mpGrad)" />
          <ellipse cx="19" cy="29" rx="2.2" ry="5" transform="rotate(-18 19 29)" fill="#BFDBFE" opacity="0.7" />
        </g>
      );
    }

    if (skillType === 'dash') {
      return (
        <g>
          {/* Khinh Công Wind Feather & Cloud Trail */}
          <path d="M8 34 Q18 32 28 22 Q35 15 40 10" fill="none" stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M9 39 Q20 38 30 29 Q36 24 41 19" fill="none" stroke="#BAE6FD" strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
          <path d="M16 24 C20 14 30 10 38 11 C36 20 30 27 21 29 C18 29 15 27 16 24 Z" fill="#0EA5E9" stroke="#E0F2FE" strokeWidth="1.4" />
          <path d="M19 25 L35 13" stroke="#F0F9FF" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      );
    }

    if (skillType === 'chest') {
      return (
        <g>
          {/* Imperial Gold Treasure Chest */}
          <rect x="9" y="18" width="30" height="20" rx="2" fill="#7C2D12" stroke="#F5D061" strokeWidth="1.8" />
          <path d="M9 22 L39 22 L36 13 L12 13 Z" fill="#B45309" stroke="#FDE68A" strokeWidth="1.5" />
          <rect x="21" y="20" width="6" height="8" rx="1" fill="#FDE047" stroke="#78350F" strokeWidth="1.2" />
          <circle cx="24" cy="24" r="1.4" fill="#78350F" />
          <path d="M12 18 L12 38 M36 18 L36 38" stroke="#F5D061" strokeWidth="1.5" />
        </g>
      );
    }

    if (skillType === 'mount') {
      return (
        <g>
          {/* Warhorse Crest */}
          <path
            d="M15 37 L17 25 L13 21 L18 14 L23 11 L26 14 L34 17 L32 22 L27 22 L29 29 L35 37 Z"
            fill={c1}
            stroke={c2}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="16" r="1.4" fill="#0B0D0F" />
          <path d="M15 24 Q10 28 12 35" fill="none" stroke={c2} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    }

    if (skillType === 'passive') {
      return (
        <g>
          {/* Ancient Martial Arts Tâm Pháp Scroll */}
          <rect x="12" y="10" width="24" height="28" rx="2" fill="#2A2116" stroke={c1} strokeWidth="1.6" />
          <rect x="9" y="8" width="30" height="4.5" rx="2" fill={c1} stroke="#14100B" strokeWidth="1" />
          <rect x="9" y="35.5" width="30" height="4.5" rx="2" fill={c1} stroke="#14100B" strokeWidth="1" />
          <circle cx="24" cy="24" r="7" fill="none" stroke={c2} strokeWidth="1.5" opacity="0.9" />
          <path d="M24 17 L24 31 M17 24 L31 24" stroke={c1} strokeWidth="1.4" opacity="0.85" />
          <circle cx="24" cy="24" r="2.2" fill={c2} />
        </g>
      );
    }

    // Sect-specific active skills (distinct silhouette per sect + skillIndex 0..3)
    if (sectId === 'thieu_lam') {
      if (skillIndex === 0) {
        // Golden Staff Sweep
        return (
          <g>
            <path d="M10 36 Q22 14 38 14" fill="none" stroke={c2} strokeWidth="3" strokeLinecap="round" opacity="0.55" />
            <line x1="11" y1="37" x2="37" y2="11" stroke={c1} strokeWidth="4.2" strokeLinecap="round" />
            <line x1="11" y1="37" x2="37" y2="11" stroke="#FEF9C3" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="35" cy="13" r="3.5" fill={c2} />
          </g>
        );
      }
      if (skillIndex === 1) {
        // Kim Chung Trạo (Golden Bell Shield)
        return (
          <g>
            <path d="M24 9 C16 9 13 17 13 26 L10 34 L38 34 L35 26 C35 17 32 9 24 9 Z" fill={c1} fillOpacity="0.28" stroke={c1} strokeWidth="2.2" />
            <path d="M16 34 L32 34 M24 6 L24 10" stroke={c2} strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="24" cy="23" r="4.5" fill="none" stroke={c2} strokeWidth="1.6" />
          </g>
        );
      }
      if (skillIndex === 2) {
        // Sư Tử Hống (Sonic Wave Rings)
        return (
          <g>
            <circle cx="24" cy="24" r="15" fill="none" stroke={c1} strokeWidth="1.8" strokeDasharray="4 3" />
            <circle cx="24" cy="24" r="10" fill="none" stroke={c2} strokeWidth="2.2" />
            <circle cx="24" cy="24" r="4.5" fill={c1} />
          </g>
        );
      }
      // Như Lai Thần Chưởng (Buddha Palm)
      return (
        <g>
          <circle cx="24" cy="24" r="16" fill={c1} fillOpacity="0.2" stroke={c2} strokeWidth="1.4" />
          <path d="M17 36 L17 20 C17 18 19 18 19 20 L19 15 C19 13 22 13 22 15 L22 13 C22 11 25 11 25 13 L25 15 C25 13 28 13 28 15 L28 21 C30 19 33 21 31 24 L29 36 Z" fill={c1} stroke="#FEF9C3" strokeWidth="1.3" />
          <circle cx="23.5" cy="27" r="2.2" fill="#FEF9C3" />
        </g>
      );
    }

    if (sectId === 'duong_mon') {
      if (skillIndex === 0) {
        // Throwing Daggers
        return (
          <g>
            <polygon points="39,10 27,18 30,21" fill={c2} stroke={c1} strokeWidth="1.2" />
            <polygon points="32,19 14,31 17,34" fill={c1} stroke={c2} strokeWidth="1.2" />
            <polygon points="36,27 20,38 23,40" fill={c1} stroke={c2} strokeWidth="1.1" opacity="0.85" />
          </g>
        );
      }
      if (skillIndex === 1) {
        // Poison Venom Cloud / Trap
        return (
          <g>
            <circle cx="24" cy="25" r="13" fill={c1} fillOpacity="0.22" stroke={c1} strokeWidth="1.8" />
            <path d="M24 10 C28 17 34 21 34 27 C34 33 29.5 37 24 37 C18.5 37 14 33 14 27 C14 21 20 17 24 10 Z" fill={c1} stroke={c2} strokeWidth="1.5" />
            <circle cx="21" cy="28" r="2" fill="#ECFCCB" opacity="0.8" />
          </g>
        );
      }
      if (skillIndex === 2) {
        // Mạn Thiên Hoa Vũ (Rain of Needles)
        return (
          <g>
            <path d="M12 11 L20 23 M22 8 L28 22 M33 10 L37 23 M10 24 L18 37 M21 24 L27 38 M31 24 L37 37" stroke={c2} strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="24" cy="24" r="14" fill="none" stroke={c1} strokeWidth="1.2" strokeDasharray="2 3" />
          </g>
        );
      }
      // Bạo Vũ Lê Hoa (Explosive Crossbow Lotus)
      return (
        <g>
          <polygon points="24,6 28,18 41,18 31,26 35,39 24,31 13,39 17,26 7,18 20,18" fill={c1} fillOpacity="0.35" stroke={c2} strokeWidth="1.6" />
          <circle cx="24" cy="24" r="5" fill={c2} />
        </g>
      );
    }

    if (sectId === 'nga_mi') {
      if (skillIndex === 0) {
        // Frost Sword Slash
        return (
          <g>
            <path d="M10 34 C14 16 28 10 39 12" fill="none" stroke={c2} strokeWidth="3" strokeLinecap="round" />
            <line x1="13" y1="36" x2="36" y2="12" stroke="#E0F2FE" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M10 30 L18 38" stroke={c1} strokeWidth="2.4" strokeLinecap="round" />
          </g>
        );
      }
      if (skillIndex === 1) {
        // Phật Quang Phổ Chiếu (Healing Lotus)
        return (
          <g>
            <path d="M24 10 C29 17 29 27 24 35 C19 27 19 17 24 10 Z" fill={c2} stroke="#FFFFFF" strokeWidth="1.2" />
            <path d="M12 22 C18 20 22 26 24 35 C17 33 12 28 12 22 Z" fill={c1} stroke={c2} strokeWidth="1.2" />
            <path d="M36 22 C30 20 26 26 24 35 C31 33 36 28 36 22 Z" fill={c1} stroke={c2} strokeWidth="1.2" />
            <circle cx="24" cy="24" r="3" fill="#FEF9C3" />
          </g>
        );
      }
      if (skillIndex === 2) {
        // Frost Crystal Star
        return (
          <g>
            <path d="M24 7 L24 41 M7 24 L41 24 M12 12 L36 36 M36 12 L12 36" stroke={c2} strokeWidth="2.2" strokeLinecap="round" />
            <polygon points="24,14 34,24 24,34 14,24" fill={c1} fillOpacity="0.45" stroke="#E0F2FE" strokeWidth="1.4" />
          </g>
        );
      }
      // Tứ Tượng Đồng Quy (Four Frost Pillars)
      return (
        <g>
          <circle cx="24" cy="24" r="16" fill={c1} fillOpacity="0.22" stroke={c2} strokeWidth="1.8" />
          <circle cx="24" cy="13" r="3.5" fill={c2} />
          <circle cx="24" cy="35" r="3.5" fill={c2} />
          <circle cx="13" cy="24" r="3.5" fill={c2} />
          <circle cx="35" cy="24" r="3.5" fill={c2} />
          <circle cx="24" cy="24" r="5" fill="#FFFFFF" opacity="0.85" />
        </g>
      );
    }

    if (sectId === 'cai_bang') {
      if (skillIndex === 0) {
        // Flame Palm Strike
        return (
          <g>
            <path d="M24 8 C31 16 36 21 34 30 C32 36 28 39 24 39 C18 39 13 34 14 27 C15 21 19 18 19 13 C21 15 22 12 24 8 Z" fill={c1} stroke={c2} strokeWidth="1.6" />
            <path d="M24 19 C28 24 29 29 24 35 C20 31 19 26 24 19 Z" fill="#FEF08A" />
          </g>
        );
      }
      if (skillIndex === 1) {
        // Đả Cẩu Bổng Pháp (Jade Bamboo Staff)
        return (
          <g>
            <circle cx="24" cy="24" r="14" fill="none" stroke={c1} strokeWidth="2" strokeDasharray="10 6" />
            <line x1="11" y1="36" x2="37" y2="12" stroke="#4ADE80" strokeWidth="4" strokeLinecap="round" />
            <line x1="18" y1="29.5" x2="20" y2="27.5" stroke="#14532D" strokeWidth="3.5" />
            <line x1="27" y1="21" x2="29" y2="19" stroke="#14532D" strokeWidth="3.5" />
          </g>
        );
      }
      if (skillIndex === 2) {
        // Phi Long Tại Thiên (Twin Flame Arcs)
        return (
          <g>
            <path d="M9 32 C12 16 24 10 38 14" fill="none" stroke={c1} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M12 38 C18 24 28 19 40 24" fill="none" stroke={c2} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="36" cy="15" r="4" fill="#FEF08A" />
          </g>
        );
      }
      // Hàng Long Thập Bát Chưởng (Blazing Dragon Coil)
      return (
        <g>
          <path d="M12 35 C9 22 18 11 30 13 C38 14 39 24 33 28 C27 32 20 27 22 21 C24 17 30 18 30 22" fill="none" stroke={c1} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M12 35 C9 22 18 11 30 13 C38 14 39 24 33 28" fill="none" stroke="#FEF08A" strokeWidth="1.2" strokeLinecap="round" />
          <polygon points="37,10 31,12 34,17" fill="#FEF08A" />
        </g>
      );
    }

    // Võ Đang (Default / Earth-Lightning / Taiji Swords)
    if (skillIndex === 0) {
      // Kiếm Phi Kinh Thiên
      return (
        <g>
          <line x1="11" y1="37" x2="36" y2="12" stroke="#F8FAFC" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M14 27 L21 34" stroke={c1} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M25 10 L38 10 L38 23" fill="none" stroke={c2} strokeWidth="1.8" opacity="0.8" />
        </g>
      );
    }
    if (skillIndex === 1) {
      // Tọa Vọng Vô Ngã (Taiji Barrier)
      return (
        <g>
          <circle cx="24" cy="24" r="14" fill="#111827" stroke={c1} strokeWidth="2" />
          <path d="M24 10 A14 14 0 0 1 24 38 A7 7 0 0 1 24 24 A7 7 0 0 0 24 10 Z" fill={c2} />
          <circle cx="24" cy="17" r="2.2" fill="#111827" />
          <circle cx="24" cy="31" r="2.2" fill={c2} />
        </g>
      );
    }
    if (skillIndex === 2) {
      // Thiên Địa Vô Cực (Lightning Bolt)
      return (
        <g>
          <polygon points="27,7 14,25 23,25 19,41 35,21 25,21" fill={c1} stroke={c2} strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      );
    }
    // Vạn Kiếm Quy Tông (Sword Rain)
    return (
      <g>
        <line x1="24" y1="7" x2="24" y2="39" stroke="#FEF9C3" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="14" y1="12" x2="14" y2="35" stroke={c1} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="34" y1="12" x2="34" y2="35" stroke={c1} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M19 14 L29 14 M10 18 L18 18 M30 18 L38 18" stroke={c2} strokeWidth="2" strokeLinecap="round" />
      </g>
    );
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`block shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}_bg`} cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor={c1} stopOpacity={locked ? 0.14 : 0.34} />
          <stop offset="55%" stopColor={bgTop} stopOpacity="0.96" />
          <stop offset="100%" stopColor={bgBot} stopOpacity="1" />
        </radialGradient>
        <linearGradient id="hpGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F87171" />
          <stop offset="55%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#7F1D1D" />
        </linearGradient>
        <linearGradient id="mpGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="55%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
      {/* Background plate */}
      <rect x="1" y="1" width="46" height="46" rx="2" fill={`url(#${uid}_bg)`} />
      {/* Subtle 2009 glossy upper sheen */}
      <path d="M2 2 L46 2 L46 18 Q24 24 2 18 Z" fill="#FFFFFF" opacity={locked ? 0.03 : 0.08} />
      {/* Martial arts artwork */}
      {renderGlyph()}
      {/* Inner metallic highlight border */}
      <rect
        x="1.5"
        y="1.5"
        width="45"
        height="45"
        rx="2"
        fill="none"
        stroke={locked ? '#4B5563' : c1}
        strokeOpacity={locked ? 0.45 : 0.65}
        strokeWidth="1.2"
      />
    </svg>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Send } from 'lucide-react';
import { ChatChannel, ChatMessage, SimulatedMaster } from '../../game/types';

interface ChatDockProps {
  messages: ChatMessage[];
  whisperTarget: SimulatedMaster | null;
  masters: SimulatedMaster[];
  onSendMessage: (channel: ChatChannel, content: string) => void;
  onSelectMasterAction: (master: SimulatedMaster, action: 'friend' | 'duel' | 'whisper') => void;
}

const CHANNELS: { id: ChatChannel; label: string; color: string }[] = [
  { id: 'world', label: 'Chung', color: '#FDE68A' },
  { id: 'whisper', label: 'Mật', color: '#F472B6' },
  { id: 'guild', label: 'Bang', color: '#4ADE80' },
  { id: 'system', label: 'Hệ thống', color: '#38BDF8' },
];

export const ChatDock: React.FC<ChatDockProps> = ({
  messages,
  whisperTarget,
  masters,
  onSendMessage,
  onSelectMasterAction,
}) => {
  const [channel, setChannel] = useState<ChatChannel>('world');
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [selectedSender, setSelectedSender] = useState<SimulatedMaster | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (whisperTarget) {
      setChannel('whisper');
      setCollapsed(false);
    }
  }, [whisperTarget]);

  const filtered =
    channel === 'world'
      ? messages.filter((m) => m.channel === 'world' || m.channel === 'system')
      : messages.filter((m) => m.channel === channel);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered.length, channel, collapsed]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(channel === 'system' ? 'world' : channel, input.trim());
    setInput('');
  };

  const handleClickName = (senderId?: string) => {
    if (!senderId) return;
    const found = masters.find((m) => m.id === senderId);
    if (found) setSelectedSender(found);
  };

  const activeChan = CHANNELS.find((c) => c.id === channel) || CHANNELS[0];

  return (
    <div className="pointer-events-auto flex w-[310px] max-w-[44vw] flex-col text-xs">
      {/* Classic Kiếm Thế 2009 Floating Translucent Chat Stream ABOVE the Channel Strip */}
      {!collapsed && (
        <div className="kt-ink-panel mb-1 overflow-hidden">
          {selectedSender && (
            <div className="flex items-center justify-between gap-2 border-b border-[#46535B] bg-[#1A2126] px-2 py-1 text-[10.5px]">
              <span className="truncate font-semibold text-[#FDE047]">{selectedSender.name}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => {
                    onSelectMasterAction(selectedSender, 'friend');
                    setSelectedSender(null);
                  }}
                  className="text-[#4ADE80] hover:underline cursor-pointer"
                >
                  Kết bạn
                </button>
                <button
                  onClick={() => {
                    onSelectMasterAction(selectedSender, 'duel');
                    setSelectedSender(null);
                  }}
                  className="text-[#F87171] hover:underline cursor-pointer"
                >
                  Tỷ thí
                </button>
                <button
                  onClick={() => {
                    onSelectMasterAction(selectedSender, 'whisper');
                    setSelectedSender(null);
                  }}
                  className="text-[#F472B6] hover:underline cursor-pointer"
                >
                  Mật
                </button>
                <button
                  onClick={() => setSelectedSender(null)}
                  className="text-[#9AA8B0] hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          <div ref={listRef} className="h-[104px] space-y-0.5 overflow-y-auto px-2 py-1.5 leading-snug">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-[#84929B]">
                {channel === 'whisper'
                  ? 'Nhấn vào tên cao thủ trên kênh Chung để nhắn mật.'
                  : 'Chưa có tin nhắn nào trong kênh này.'}
              </div>
            ) : (
              filtered.slice(-30).map((msg) => {
                const tagColor =
                  msg.channel === 'system'
                    ? '#38BDF8'
                    : msg.channel === 'guild'
                    ? '#4ADE80'
                    : msg.channel === 'whisper'
                    ? '#F472B6'
                    : '#FDE047';
                const tagText =
                  msg.channel === 'system'
                    ? 'HT'
                    : msg.channel === 'guild'
                    ? 'Bang'
                    : msg.channel === 'whisper'
                    ? 'Mật'
                    : 'TG';
                return (
                  <div
                    key={msg.id}
                    className="break-words text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.98)]"
                  >
                    <span className="font-semibold" style={{ color: tagColor }}>
                      [{tagText}]
                    </span>{' '}
                    {msg.senderId ? (
                      <button
                        onClick={() => handleClickName(msg.senderId)}
                        className="font-semibold text-[#FEF3C7] hover:text-[#FDE047] hover:underline cursor-pointer"
                      >
                        {msg.sender}:
                      </button>
                    ) : (
                      <span className="font-semibold text-[#FDE68A]">{msg.sender}:</span>
                    )}{' '}
                    <span className="text-[#E9EEF1]">{msg.content}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Classic Kiếm Thế 2009 Bottom Channel Tabs + Steel-Bordered Chat Input Box */}
      <div className="kt-hud-box overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#3D474F] bg-[#1A2024] px-1 py-0.5">
          <div className="flex items-center gap-0.5">
            {CHANNELS.map((c) => {
              const isActive = channel === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setChannel(c.id);
                    setCollapsed(false);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive ? 'kt-tab-active' : 'kt-tab border-transparent bg-transparent'
                  }`}
                  style={{ color: isActive ? c.color : undefined }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="px-1 py-0.5 text-[#A8B7C0] hover:text-white cursor-pointer"
            aria-label="Thu gọn khung tán gẫu"
            title={collapsed ? 'Mở rộng khung tán gẫu' : 'Thu gọn khung tán gẫu'}
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-1.5 bg-[#0C1012]/95 px-2 py-1"
        >
          <span
            className="shrink-0 text-[10px] font-semibold"
            style={{ color: activeChan.color }}
          >
            /{activeChan.label}
          </span>
          <MessageSquare className="h-3 w-3 shrink-0 text-[#6F7E87]" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              channel === 'whisper' && whisperTarget
                ? `Mật tới ${whisperTarget.name}...`
                : 'Nhập lời tán gẫu giang hồ...'
            }
            className="w-full bg-transparent text-[11px] text-[#F2F6F8] placeholder-[#6B7982] focus:outline-none"
          />
          <button
            type="submit"
            className="kt-btn-jade px-1.5 py-0.5 cursor-pointer"
            aria-label="Gửi tin nhắn"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
};

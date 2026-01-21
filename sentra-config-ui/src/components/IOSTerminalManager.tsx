import React, { useMemo, useState } from 'react';
import { IoChevronBack, IoLogoWindows, IoTerminal, IoCodeSlash, IoAdd, IoClose } from 'react-icons/io5';
import { Radio } from 'antd';
import { useTerminals } from '../hooks/useTerminals';
import { useWindowsStore } from '../store/windowsStore';

type Props = {
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onClose: () => void;
  backLabel?: string;
};

export const IOSTerminalManager: React.FC<Props> = ({ addToast, onClose, backLabel = '主页' }) => {
  const allocateZ = useWindowsStore((s) => s.allocateZ);
  const { terminalWindows, bringTerminalToFront, handleRunShell, handleCloseTerminal } = useTerminals({ addToast, allocateZ });

  const [shellType, setShellType] = useState<'powershell' | 'cmd' | 'bash'>('powershell');

  const activeTerms = useMemo(() => {
    return [...terminalWindows].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  }, [terminalWindows]);

  const runTitle = useMemo(() => {
    if (shellType === 'cmd') return 'CMD';
    if (shellType === 'bash') return 'Bash';
    return 'PowerShell';
  }, [shellType]);

  return (
    <div className="ios-app-window" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000' }}>
      <div
        className="ios-app-header"
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'rgba(28, 28, 30, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#fff',
          zIndex: 10,
        }}
      >
        <div
          className="ios-back-btn"
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#fff', fontSize: 17 }}
        >
          <IoChevronBack size={24} /> {backLabel}
        </div>
        <div style={{ fontWeight: 600, fontSize: 17 }}>终端执行器</div>
        <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={onClose} style={{ color: '#ff453a', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <IoClose size={22} />
          </div>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Radio.Group
              value={shellType}
              onChange={(e) => setShellType(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              style={{ display: 'flex', width: '100%' }}
            >
              <Radio.Button value="powershell" style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IoTerminal /> PowerShell
                </span>
              </Radio.Button>
              <Radio.Button value="cmd" style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IoLogoWindows /> CMD
                </span>
              </Radio.Button>
              <Radio.Button value="bash" style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IoCodeSlash /> Bash
                </span>
              </Radio.Button>
            </Radio.Group>
          </div>

          <button
            onClick={() => void handleRunShell(shellType, runTitle)}
            style={{
              height: 36,
              padding: '0 10px',
              borderRadius: 10,
              background: '#0a84ff',
              color: '#fff',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            aria-label="新建"
          >
            <IoAdd />
          </button>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.5 }}>
          提示：移动端建议使用“新建”创建 shell；已打开的终端会以全屏窗口显示。
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
        {activeTerms.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>暂无终端会话</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeTerms.map((t) => (
              <div
                key={t.id}
                style={{
                  background: 'rgba(28, 28, 30, 0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.title}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    PID: {t.processId}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <button
                    onClick={() => bringTerminalToFront(t.id)}
                    style={{
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 10,
                      background: 'rgba(10,132,255,0.18)',
                      color: '#0a84ff',
                      border: '1px solid rgba(10,132,255,0.28)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    打开
                  </button>
                  <button
                    onClick={() => void handleCloseTerminal(t.id)}
                    style={{
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 10,
                      background: 'rgba(255,69,58,0.14)',
                      color: '#ff453a',
                      border: '1px solid rgba(255,69,58,0.22)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    关闭
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

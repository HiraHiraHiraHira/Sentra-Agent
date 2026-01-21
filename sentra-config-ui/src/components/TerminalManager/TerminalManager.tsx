import { Button, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Tag } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useTerminals } from '../../hooks/useTerminals';
import { useWindowsStore } from '../../store/windowsStore';
import type { TerminalWin } from '../../types/ui';
import styles from './TerminalManager.module.css';

type Props = {
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
};

type ShellType = 'powershell' | 'cmd' | 'bash';
type ViewKind = 'shell' | 'script';

function isWindows() {
  try {
    return String(navigator.platform || '').toLowerCase().includes('win');
  } catch {
    return true;
  }
}

function shellLabel(t: ShellType) {
  if (t === 'cmd') return 'CMD';
  if (t === 'bash') return 'Bash';
  return 'PowerShell';
}

function parseShellTypeFromAppKey(appKey?: string): ShellType | null {
  const s = String(appKey || '');
  const m = s.match(/^(?:shell|execpty):([^:]+):/i);
  const v = (m?.[1] || '').toLowerCase();
  if (v === 'powershell' || v === 'cmd' || v === 'bash') return v;
  return null;
}

export default function TerminalManager(props: Props) {
  const addToast = props.addToast;
  const allocateZ = useWindowsStore(s => s.allocateZ);

  const { terminalWindows, activeTerminalId, bringTerminalToFront, handleCloseTerminal, handleRunShell } = useTerminals({
    addToast: (type, title, message) => addToast(type, title, message),
    allocateZ,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createShell, setCreateShell] = useState<ShellType>(() => (isWindows() ? 'powershell' : 'bash'));
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [viewKind, setViewKind] = useState<ViewKind>('shell');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const suggestedName = useMemo(() => {
    const label = shellLabel(createShell);
    const count = terminalWindows.filter(t => String(t.appKey || '').startsWith(`execpty:${createShell}:`)).length;
    return `${label} ${count + 1}`;
  }, [createShell, terminalWindows]);

  const filteredSessions = useMemo(() => {
    const q = String(filter || '').trim().toLowerCase();
    const list = terminalWindows.filter(t => {
      const isShell = String(t.appKey || '').startsWith('shell:') || String(t.appKey || '').startsWith('execpty:');
      if (viewKind === 'shell') return isShell;
      return !isShell;
    });
    const sorted = [...list].sort((a, b) => (b.z || 0) - (a.z || 0));
    if (!q) return sorted;
    return sorted.filter(t => {
      const hay = `${t.title || ''} ${t.processId || ''} ${t.appKey || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, terminalWindows, viewKind]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId && filteredSessions.some(s => s.id === selectedId)) return selectedId;
    if (activeTerminalId && filteredSessions.some(s => s.id === activeTerminalId)) return activeTerminalId;
    return filteredSessions[0]?.id || null;
  }, [activeTerminalId, filteredSessions, selectedId]);

  const selected = useMemo(() => {
    if (!effectiveSelectedId) return null;
    return terminalWindows.find(t => t.id === effectiveSelectedId) || null;
  }, [effectiveSelectedId, terminalWindows]);

  const openCreate = useCallback(() => {
    const nextShell: ShellType = isWindows() ? 'powershell' : 'bash';
    setCreateShell(nextShell);
    setCreateName('');
    setCreateOpen(true);
  }, []);

  const doCreate = useCallback(async () => {
    const name = String(createName || '').trim() || suggestedName;
    setCreating(true);
    try {
      await handleRunShell(createShell, name);
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  }, [createName, createShell, handleRunShell, suggestedName]);

  const shellOptions = useMemo(() => {
    const opts: { label: string; value: ShellType }[] = [
      { label: 'PowerShell', value: 'powershell' },
      { label: 'Bash', value: 'bash' },
      { label: 'CMD', value: 'cmd' },
    ];
    if (!isWindows()) {
      return opts.filter(o => o.value !== 'cmd');
    }
    return opts;
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>
            <div className={styles.titleMain}>终端执行器</div>
            <div className={styles.titleSub}>多会话终端管理（支持滚动回看 / 搜索 / 一键关闭）</div>
          </div>
          <Space>
            <Button type="primary" onClick={openCreate}>新建终端</Button>
          </Space>
        </div>

        <div className={styles.body}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarTop}>
              <Segmented
                value={viewKind}
                onChange={(v) => setViewKind(v as ViewKind)}
                options={[
                  { label: '终端', value: 'shell' },
                  { label: '脚本', value: 'script' },
                ]}
              />
            </div>

            <div className={styles.sidebarTop}>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="搜索会话 / PID"
                allowClear
              />
            </div>

            <div className={styles.sessionList}>
              {filteredSessions.length === 0 ? (
                <div className={styles.empty}>暂无会话</div>
              ) : (
                filteredSessions.map((s: TerminalWin) => {
                  const isActive = effectiveSelectedId === s.id;
                  const shellType = parseShellTypeFromAppKey(s.appKey);
                  return (
                    <div
                      key={s.id}
                      className={`${styles.sessionItem} ${isActive ? styles.sessionItemActive : ''}`}
                      onClick={() => {
                        setSelectedId(s.id);
                        bringTerminalToFront(s.id);
                      }}
                    >
                      <div className={styles.sessionHeaderRow}>
                        <div className={styles.sessionTitle}>{s.title}</div>
                        <div className={styles.sessionTag}>
                          {shellType ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>{shellLabel(shellType)}</Tag> : <Tag color="purple" style={{ marginInlineEnd: 0 }}>Script</Tag>}
                        </div>
                      </div>
                      <div className={styles.sessionPid}>PID: {s.processId}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={styles.main}>
            <div className={styles.mainTop}>
              <div className={styles.mainTitle}>
                <div className={styles.mainTitleLine}>{selected?.title || '未选择会话'}</div>
                <div className={styles.mainSubtitle}>{selected ? `PID: ${selected.processId}` : '请选择左侧会话，或点击“新建终端”'}</div>
              </div>
              <Space>
                <Button
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    try {
                      void navigator.clipboard?.writeText(String(selected.processId || ''));
                      addToast('success', '已复制', 'ProcessId 已复制到剪贴板');
                    } catch {
                      addToast('warning', '复制失败');
                    }
                  }}
                >
                  复制 PID
                </Button>
                <Button disabled={!selected} onClick={() => selected && bringTerminalToFront(selected.id)}>
                  打开窗口
                </Button>
                <Popconfirm
                  title="关闭会话"
                  description="将终止该进程并关闭窗口"
                  okText="关闭"
                  cancelText="取消"
                  onConfirm={() => selected && handleCloseTerminal(selected.id)}
                  disabled={!selected}
                >
                  <Button danger disabled={!selected}>关闭</Button>
                </Popconfirm>
              </Space>
            </div>

            <div className={styles.terminalArea}>
              {selected ? (
                <div className={styles.previewHint}>
                  <div className={styles.previewHintTitle}>已在独立窗口运行</div>
                  <div className={styles.previewHintSub}>终端内容不在此处投射。点击上方“打开窗口”查看。</div>
                </div>
              ) : (
                <div className={styles.empty}>暂无会话</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        title="新建终端"
        okText="确认"
        cancelText="取消"
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        onOk={doCreate}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="终端名称">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={suggestedName}
              autoFocus
            />
          </Form.Item>
          <Form.Item label="Shell 类型">
            <Select
              value={createShell}
              options={shellOptions}
              onChange={(v) => {
                setCreateShell(v as ShellType);
                setCreateName('');
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

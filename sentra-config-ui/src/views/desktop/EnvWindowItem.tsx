import { memo, Suspense, lazy, useCallback, useMemo } from 'react';
import { MacWindow } from '../../components/MacWindow';
import { EnvEditor } from '../../components/EnvEditor';
import { getDisplayName, getIconForType } from '../../utils/icons';
import type { DeskWindow } from '../../types/ui';
import { Alert, Button, Divider, Tag, Typography, Tabs } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { restorePluginSkill, savePluginSkill } from '../../services/api';

const MonacoEditor = lazy(async () => {
  await import('../../utils/monacoSetup.ts');
  const mod = await import('@monaco-editor/react');
  return { default: mod.default };
});

type SetOpenWindows = (next: DeskWindow[] | ((prev: DeskWindow[]) => DeskWindow[])) => void;

export type EnvWindowItemProps = {
  w: DeskWindow;
  desktopSafeArea: { top: number; bottom: number; left: number; right: number };
  theme: 'light' | 'dark';
  saving: boolean;
  performanceMode: boolean;
  activeWinId: string | null;
  bringToFront: (id: string) => void;
  setActiveWinId: (id: string | null) => void;
  setActiveUtilityId: (id: string | null) => void;
  setOpenWindows: SetOpenWindows;
  handleClose: (id: string) => void;
  handleSave: (id: string) => void | Promise<void>;
  handleVarChange: (id: string, index: number, field: 'key' | 'value' | 'comment', val: string) => void;
  handleAddVar: (id: string) => void;
  handleDeleteVar: (id: string, index: number) => void;
  handleRestore: (id: string) => void;
  handleWindowMaximize: (id: string, isMaximized: boolean) => void;
};

export const EnvWindowItem = memo(({
  w,
  desktopSafeArea,
  theme,
  saving,
  performanceMode,
  activeWinId,
  bringToFront,
  setActiveWinId,
  setActiveUtilityId,
  setOpenWindows,
  handleClose,
  handleSave,
  handleVarChange,
  handleAddVar,
  handleDeleteVar,
  handleRestore,
  handleWindowMaximize,
}: EnvWindowItemProps) => {
  const isPlugin = w.file.type === 'plugin';
  const activeSection = (w.section || 'mcp') as 'mcp' | 'skills';

  const handleCloseWin = useCallback(() => {
    handleWindowMaximize(w.id, false);
    handleClose(w.id);
  }, [handleClose, handleWindowMaximize, w.id]);

  const handleMinimizeWin = useCallback(() => {
    setOpenWindows(ws => ws.map(x => x.id === w.id ? { ...x, minimized: true } : x));
    setActiveWinId(null);
    handleWindowMaximize(w.id, false);
  }, [handleWindowMaximize, setActiveWinId, setOpenWindows, w.id]);

  const handleFocusWin = useCallback(() => {
    bringToFront(w.id);
    setActiveUtilityId(null);
  }, [bringToFront, setActiveUtilityId, w.id]);

  const handleMoveWin = useCallback((x: number, y: number) => {
    setOpenWindows(ws => ws.map(win => win.id === w.id ? { ...win, pos: { x, y } } : win));
  }, [setOpenWindows, w.id]);

  const handleResizeWin = useCallback((width: number, height: number) => {
    setOpenWindows(ws => ws.map(win => win.id === w.id ? { ...win, size: { width, height } } : win));
  }, [setOpenWindows, w.id]);

  const handleUpdateVar = useCallback((idx: number, field: 'key' | 'value' | 'comment', val: string) => {
    handleVarChange(w.id, idx, field, val);
  }, [handleVarChange, w.id]);

  const handleAddVarWin = useCallback(() => {
    handleAddVar(w.id);
  }, [handleAddVar, w.id]);

  const handleDeleteVarWin = useCallback((idx: number) => {
    handleDeleteVar(w.id, idx);
  }, [handleDeleteVar, w.id]);

  const handleSaveWin = useCallback(() => {
    handleSave(w.id);
  }, [handleSave, w.id]);

  const handleRestoreWin = useCallback(() => {
    handleRestore(w.id);
  }, [handleRestore, w.id]);

  const setSection = useCallback((next: 'mcp' | 'skills') => {
    setOpenWindows(ws => ws.map(win => win.id === w.id ? { ...win, section: next } : win));
  }, [setOpenWindows, w.id]);

  const skillText = useMemo(() => {
    if (!isPlugin) return '';
    if (typeof w.skillDraft === 'string') return w.skillDraft;
    const raw = (w.file as any)?.skillMarkdown;
    return typeof raw === 'string' ? raw : '';
  }, [isPlugin, w.file, w.skillDraft]);

  const skillIsDefault = useMemo(() => {
    if (!isPlugin) return true;
    const v = (w.file as any)?.skillIsDefault;
    return Boolean(v);
  }, [isPlugin, w.file]);

  const skillDefaultSource = useMemo(() => {
    if (!isPlugin) return null;
    const v = (w.file as any)?.skillDefaultSource;
    return v === 'example' || v === 'generated' ? v : null;
  }, [isPlugin, w.file]);

  const handleSaveSkill = useCallback(async () => {
    if (!isPlugin) return;
    await savePluginSkill(w.file.name, skillText);
    setOpenWindows(ws => ws.map(win => win.id === w.id ? { ...win, skillDirty: false } : win));
    await handleSave(w.id);
  }, [handleSave, isPlugin, setOpenWindows, skillText, w.file.name, w.id]);

  const handleRestoreSkill = useCallback(async () => {
    if (!isPlugin) return;
    await restorePluginSkill(w.file.name);
    setOpenWindows(ws => ws.map(win => {
      if (win.id !== w.id) return win;
      return { ...win, skillDraft: undefined, skillDirty: false };
    }));
    await handleSave(w.id);
  }, [handleSave, isPlugin, setOpenWindows, w.file.name, w.id]);

  const handleMaximizeWin = useCallback((isMax: boolean) => {
    handleWindowMaximize(w.id, isMax);
    setOpenWindows(ws => ws.map(win => win.id === w.id ? { ...win, maximized: isMax } : win));
  }, [handleWindowMaximize, setOpenWindows, w.id]);

  const pluginSidebarAddon = useMemo(() => {
    if (!isPlugin) return null;

    const statusText = skillIsDefault
      ? (skillDefaultSource === 'example'
        ? '默认：来自 skill.example.md'
        : '默认：自动生成模板')
      : '已自定义：来自 skill.md（优先生效）';

    const statusHint = skillIsDefault
      ? (skillDefaultSource === 'example'
        ? '你可以直接在这里编辑；点击“保存为 skill.md”后将创建/覆盖 skill.md。'
        : '该插件没有 skill.example.md，当前内容为系统生成模板。建议保存一次生成 skill.md 以便后续维护。')
      : '当前已存在 skill.md。恢复默认会删除 skill.md，回到 skill.example.md（如果存在）或生成模板。';

    const helperText = activeSection === 'skills'
      ? '编辑插件技能提示词（Markdown），用于约束/增强该插件的工具调用与输出风格。'
      : '编辑插件运行所需的环境变量（.env）。';

    return (
      <div style={{ padding: 8 }}>
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>模式</Typography.Text>
          <Tabs
            size="small"
            activeKey={activeSection}
            onChange={(key) => setSection(key as 'mcp' | 'skills')}
            items={[
              { key: 'mcp', label: 'MCP 配置' },
              { key: 'skills', label: 'Skills 提示词' }
            ]}
            style={{ marginBottom: 0 }}
          />
        </div>

        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>说明</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12, opacity: 0.85, display: 'block' }}>{helperText}</Typography.Text>

        {activeSection === 'skills' ? (
          <>
            <Divider style={{ margin: '12px 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Tag color={skillIsDefault ? 'default' : 'success'}>{statusText}</Tag>
              {w.skillDirty && <Tag color="warning">未保存</Tag>}
            </div>

            <Alert
              type={skillIsDefault ? 'info' : 'success'}
              showIcon
              message={statusHint}
              style={{ marginBottom: 12 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                size="small"
                icon={<SaveOutlined />}
                type="primary"
                onClick={handleSaveSkill}
                disabled={saving || !w.skillDirty}
                block
              >
                保存为 skill.md
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleRestoreSkill}
                disabled={saving}
                danger={!skillIsDefault}
                block
              >
                恢复默认（删除 skill.md）
              </Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }, [activeSection, handleRestoreSkill, handleSaveSkill, isPlugin, saving, setSection, skillDefaultSource, skillIsDefault, w.skillDirty]);

  return (
    <MacWindow
      id={w.id}
      title={`${getDisplayName(w.file.name)}`}
      icon={getIconForType(w.file.name, w.file.type)}
      safeArea={desktopSafeArea}
      zIndex={w.z}
      isActive={activeWinId === w.id}
      isMinimized={w.minimized}
      performanceMode={performanceMode}
      initialPos={w.pos}
      initialSize={w.size}
      initialMaximized={!!w.maximized}
      onClose={handleCloseWin}
      onMinimize={handleMinimizeWin}
      onMaximize={handleMaximizeWin}
      onFocus={handleFocusWin}
      onMove={handleMoveWin}
      onResize={handleResizeWin}
    >
      <EnvEditor
        appName={getDisplayName(w.file.name)}
        vars={w.editedVars}
        onUpdate={handleUpdateVar}
        onAdd={handleAddVarWin}
        onDelete={handleDeleteVarWin}
        onSave={handleSaveWin}
        onRestore={handleRestoreWin}
        saving={saving}
        isExample={!w.file.hasEnv && w.file.hasExample}
        theme={theme}
        sidebarAddon={isPlugin ? pluginSidebarAddon : undefined}
        showToolbarActions={!isPlugin || activeSection === 'mcp'}
      >
        {isPlugin && activeSection === 'skills' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 8 }}>
            <Suspense fallback={<div style={{ padding: 12, opacity: 0.7, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>编辑器加载中...</div>}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <MonacoEditor
                  height="100%"
                  width="100%"
                  defaultLanguage="markdown"
                  theme={theme === 'dark' ? 'vs-dark' : 'light'}
                  value={skillText}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    find: {
                      addExtraSpaceOnTop: false,
                      autoFindInSelection: 'never',
                      seedSearchStringFromSelection: 'always',
                    },
                  }}
                  onChange={(v) => {
                    const next = String(v ?? '');
                    setOpenWindows(ws => ws.map(win => {
                      if (win.id !== w.id) return win;
                      return { ...win, skillDraft: next, skillDirty: true };
                    }));
                  }}
                />
              </div>
            </Suspense>
          </div>
        ) : null}
      </EnvEditor>
    </MacWindow>
  );
});

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Space, Tag, Tooltip } from 'antd';
import { CloudDownloadOutlined, DeleteOutlined, ReloadOutlined, SaveOutlined, StarOutlined, PlusOutlined } from '@ant-design/icons';
import type { PresetFile } from '../types/config';
import { deletePresetFile, fetchPresetFile, fetchPresets, saveModuleConfig, savePresetFile } from '../services/api';
import { useAppStore } from '../store/appStore';

const MonacoEditor = lazy(async () => {
  await import('../utils/monacoSetup');
  const mod = await import('@monaco-editor/react');
  return { default: mod.default };
});

class EditorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12 }}>
          <Alert
            type="error"
            message="编辑器渲染失败"
            description={this.state.error.message || String(this.state.error)}
            showIcon
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function inferWorldbookCandidates(files: PresetFile[]) {
  return (files || []).filter((f) => {
    const name = String(f?.name || '').toLowerCase();
    const p = String(f?.path || '').toLowerCase();
    if (!p.endsWith('.json')) return false;
    return name.includes('worldbook') || p.includes('worldbook');
  });
}

function getRootModuleEnv(configData: any): { moduleName: string; variables: any[] } | null {
  const modules = Array.isArray(configData?.modules) ? configData.modules : [];
  const root = modules.find((m: any) => m && (m.name === '.' || m.path === '.' || String(m.name || '').trim() === '.'));
  if (!root) return null;
  const variables = Array.isArray(root.variables) ? root.variables : [];
  return { moduleName: root.name || '.', variables };
}

function getEnvVar(variables: any[], key: string): string {
  const k = String(key || '').trim();
  const row = (variables || []).find((v) => v && String(v.key || '').trim() === k);
  return row && typeof row.value === 'string' ? row.value : '';
}

function upsertEnvVar(variables: any[], key: string, value: string): any[] {
  const k = String(key || '').trim();
  const next = Array.isArray(variables) ? variables.map((x) => ({ ...x })) : [];
  const idx = next.findIndex((v) => v && String(v.key || '').trim() === k);
  if (idx >= 0) {
    next[idx] = { ...next[idx], key: k, value: String(value ?? '') };
    return next;
  }
  next.push({ key: k, value: String(value ?? '') });
  return next;
}

export interface WorldbookManagerProps {
  theme: 'light' | 'dark';
  performanceMode?: boolean;
  addToast: (type: 'success' | 'error', title: string, message?: string) => void;
  isActive?: boolean;
  onOpenImporter?: () => void;
  loadConfigs?: (silent?: boolean) => Promise<void> | void;
}

export const WorldbookManager: React.FC<WorldbookManagerProps> = ({
  theme,
  performanceMode,
  addToast,
  isActive,
  onOpenImporter,
  loadConfigs,
}) => {
  const configData = useAppStore((s) => s.configData);

  const rootEnv = useMemo(() => getRootModuleEnv(configData), [configData]);
  const activeWorldbookFile = useMemo(() => {
    const v = rootEnv ? getEnvVar(rootEnv.variables, 'WORLDBOOK_FILE') : '';
    return v || 'worldbook.json';
  }, [rootEnv]);

  const [files, setFiles] = useState<PresetFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PresetFile | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('worldbook_new.json');

  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);

  const refreshList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchPresets();
      const list = Array.isArray(res) ? (res as PresetFile[]) : [];
      setFiles(list);
    } catch (e: any) {
      addToast('error', '加载失败', e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!isActive) return;
    void refreshList();
  }, [isActive, refreshList]);

  const worldbookFiles = useMemo(() => inferWorldbookCandidates(files), [files]);

  const selectFile = useCallback(async (f: PresetFile) => {
    if (!f) return;
    try {
      setLoadingFile(true);
      setSelectedFile(f);
      const res = await fetchPresetFile(f.path);
      setFileContent(res.content || '');
    } catch (e: any) {
      addToast('error', '读取失败', e?.message || String(e));
      setSelectedFile(null);
      setFileContent('');
    } finally {
      setLoadingFile(false);
    }
  }, [addToast]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    try {
      setSaving(true);
      await savePresetFile(selectedFile.path, fileContent);
      addToast('success', '保存成功', `已保存 ${selectedFile.name}`);
      await refreshList();
    } catch (e: any) {
      addToast('error', '保存失败', e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [addToast, fileContent, refreshList, selectedFile]);

  const handleDelete = useCallback(async () => {
    if (!selectedFile) return;
    try {
      setSaving(true);
      await deletePresetFile(selectedFile.path);
      addToast('success', '删除成功', `已删除 ${selectedFile.name}`);
      setSelectedFile(null);
      setFileContent('');
      await refreshList();
    } catch (e: any) {
      addToast('error', '删除失败', e?.message || String(e));
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
    }
  }, [addToast, refreshList, selectedFile]);

  const handleSetActive = useCallback(async () => {
    if (!selectedFile) return;
    if (!rootEnv) {
      addToast('error', '设置失败', '未找到根目录 .env 模块');
      return;
    }
    try {
      setSaving(true);
      const nextVars = upsertEnvVar(rootEnv.variables, 'WORLDBOOK_FILE', selectedFile.path);
      await saveModuleConfig(rootEnv.moduleName, nextVars);
      addToast('success', '已设为当前世界书', selectedFile.path);
      if (typeof loadConfigs === 'function') {
        await loadConfigs(true);
      }
    } catch (e: any) {
      addToast('error', '设置失败', e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [addToast, loadConfigs, rootEnv, selectedFile]);

  const handleCreate = useCallback(async () => {
    const name = String(newFileName || '').trim();
    if (!name) return;
    if (!name.toLowerCase().endsWith('.json')) {
      addToast('error', '创建失败', '世界书文件名必须以 .json 结尾');
      return;
    }
    try {
      setSaving(true);
      const template = JSON.stringify({ meta: { title: 'Worldbook', category: 'worldbook', version: '1.0.0' } }, null, 2);
      await savePresetFile(name, template);
      addToast('success', '创建成功', `已创建 ${name}`);
      setCreateOpen(false);
      await refreshList();
      const created: PresetFile = { name: name.split('/').pop() || name, path: name, size: template.length, modified: new Date().toISOString() };
      await selectFile(created);
    } catch (e: any) {
      addToast('error', '创建失败', e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [addToast, newFileName, refreshList, selectFile]);

  const editorBg = theme === 'dark' ? '#0b0f14' : '#ffffff';
  const editorFg = theme === 'dark' ? 'rgba(255,255,255,0.92)' : '#111827';

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: editorBg, color: editorFg }}>
      <div style={{ width: 320, borderRight: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.10)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 600 }}>世界书</div>
          <Space size={6}>
            <Tooltip title="新建">
              <Button size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />
            </Tooltip>
            <Tooltip title="刷新">
              <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void refreshList()} />
            </Tooltip>
          </Space>
        </div>

        <div style={{ padding: '0 10px 10px', fontSize: 12, opacity: 0.8 }}>
          当前：<Tag color="blue">{activeWorldbookFile}</Tag>
        </div>

        <div style={{ padding: '0 10px 10px' }}>
          <Button block icon={<CloudDownloadOutlined />} onClick={() => onOpenImporter && onOpenImporter()}>
            导入世界书
          </Button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
          {worldbookFiles.length === 0 ? (
            <Empty description="没有发现 worldbook*.json" />
          ) : (
            worldbookFiles.map((f) => {
              const isActive = f.path === activeWorldbookFile;
              const isSel = selectedFile?.path === f.path;
              return (
                <div
                  key={f.path}
                  onClick={() => void selectFile(f)}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    cursor: 'pointer',
                    marginBottom: 6,
                    background: isSel
                      ? (theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)')
                      : 'transparent',
                    border: isSel
                      ? (theme === 'dark' ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(15,23,42,0.12)')
                      : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{f.name}</div>
                    {isActive ? <Tag icon={<StarOutlined />} color="gold">启用中</Tag> : null}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, wordBreak: 'break-all' }}>{f.path}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedFile ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="选择一个世界书文件开始编辑" />
          </div>
        ) : (
          <>
            <div style={{
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              borderBottom: theme === 'dark' ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.10)'
            }}>
              <div style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.path}</div>
              <Space size={8}>
                <Button size="small" icon={<StarOutlined />} onClick={() => void handleSetActive()} disabled={saving}>
                  设为当前
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteConfirmOpen(true)} disabled={saving} />
                <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void handleSave()} loading={saving}>
                  保存
                </Button>
              </Space>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {loadingFile ? (
                <div style={{ padding: 12, fontSize: 12, opacity: 0.8 }}>读取文件中...</div>
              ) : (
                <Suspense fallback={
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      resize: 'none',
                      border: 'none',
                      outline: 'none',
                      background: editorBg,
                      color: editorFg,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                      fontSize: 13,
                      lineHeight: 1.45,
                      padding: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                }>
                  <EditorErrorBoundary>
                    <MonacoEditor
                      height="100%"
                      language="json"
                      value={fileContent}
                      onChange={(v) => setFileContent(v || '')}
                      theme={theme === 'dark' ? 'vs-dark' : 'light'}
                      onMount={(editor) => {
                        editorRef.current = editor;
                        window.setTimeout(() => {
                          try { editor.layout(); } catch { }
                        }, 0);
                      }}
                      options={{
                        minimap: { enabled: !performanceMode },
                        fontSize: 13,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                    />
                  </EditorErrorBoundary>
                </Suspense>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={deleteConfirmOpen && !!selectedFile}
        title="确认删除"
        onCancel={() => setDeleteConfirmOpen(false)}
        onOk={() => void handleDelete()}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <div style={{ padding: '6px 0', color: 'var(--text-secondary)' }}>
          确定要删除文件 <strong>{selectedFile?.name}</strong> 吗？此操作无法撤销。
        </div>
      </Modal>

      <Modal
        open={createOpen}
        title="新建世界书"
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText="创建"
        cancelText="取消"
        okButtonProps={{ disabled: !String(newFileName || '').trim() }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>文件名（保存到 agent-presets/ 下）</div>
          <Input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} placeholder="worldbook_xxx.json" />
        </div>
      </Modal>
    </div>
  );
};

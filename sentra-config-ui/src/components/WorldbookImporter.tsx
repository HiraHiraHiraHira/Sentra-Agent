import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, Segmented, Switch, Upload } from 'antd';
import { InboxOutlined, SaveOutlined, StarOutlined } from '@ant-design/icons';
import { saveModuleConfig, savePresetFile } from '../services/api';
import { useAppStore } from '../store/appStore';

type ToastFn = (type: 'success' | 'error', title: string, message?: string) => void;

function getRootModuleEnv(configData: any): { moduleName: string; variables: any[] } | null {
  const modules = Array.isArray(configData?.modules) ? configData.modules : [];
  const root = modules.find((m: any) => m && (m.name === '.' || String(m.name || '').trim() === '.'));
  if (!root) return null;
  const variables = Array.isArray(root.variables) ? root.variables : [];
  return { moduleName: root.name || '.', variables };
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

export interface WorldbookImporterProps {
  open: boolean;
  onClose: () => void;
  addToast: ToastFn;
  theme: 'light' | 'dark';
  loadConfigs?: (silent?: boolean) => Promise<void> | void;
  embedded?: boolean;
}

export const WorldbookImporter: React.FC<WorldbookImporterProps> = ({ open, onClose, addToast, theme, loadConfigs, embedded }) => {
  const configData = useAppStore((s) => s.configData);
  const rootEnv = useMemo(() => getRootModuleEnv(configData), [configData]);

  const [mode, setMode] = useState<'upload' | 'text'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('worldbook.json');
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);
  const [setAsActive, setSetAsActive] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('upload');
    setFile(null);
    setFileName('worldbook.json');
    setRawText('');
    setSaving(false);
    setSetAsActive(true);
  }, [open]);

  const preparedJson = useMemo(() => {
    const text = String(rawText || '').trim();
    if (!text) return '';
    try {
      const obj = JSON.parse(text);
      return JSON.stringify(obj, null, 2);
    } catch {
      return text;
    }
  }, [rawText]);

  const handlePick = useCallback(async (f: File | null) => {
    setFile(f);
    if (!f) {
      setRawText('');
      return;
    }
    try {
      const text = await f.text();
      setRawText(text);
      setFileName(f.name || 'worldbook.json');
    } catch (e: any) {
      addToast('error', '读取失败', e?.message || String(e));
    }
  }, [addToast]);

  const handleSave = useCallback(async () => {
    const name = String(fileName || '').trim();
    if (!name) {
      addToast('error', '保存失败', '请填写文件名');
      return;
    }
    if (!name.toLowerCase().endsWith('.json')) {
      addToast('error', '保存失败', '世界书必须是 .json 文件');
      return;
    }
    const content = String(preparedJson || '').trim();
    if (!content) {
      addToast('error', '保存失败', '内容为空');
      return;
    }

    try {
      JSON.parse(content);
    } catch (e: any) {
      addToast('error', 'JSON 无法解析', e?.message || String(e));
      return;
    }

    try {
      setSaving(true);
      await savePresetFile(name, content);

      if (setAsActive) {
        if (!rootEnv) {
          addToast('error', '设置失败', '未找到根目录 .env 模块');
        } else {
          const nextVars = upsertEnvVar(rootEnv.variables, 'WORLDBOOK_FILE', name);
          await saveModuleConfig(rootEnv.moduleName, nextVars);
          if (typeof loadConfigs === 'function') {
            await loadConfigs(true);
          }
        }
      }

      addToast('success', '保存成功', `已保存到 agent-presets/${name}`);
      onClose();
    } catch (e: any) {
      addToast('error', '保存失败', e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }, [addToast, fileName, loadConfigs, onClose, preparedJson, rootEnv, setAsActive]);

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: embedded ? '100%' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as any)}
          options={[
            { label: '上传', value: 'upload' },
            { label: '文本', value: 'text' },
          ]}
          disabled={saving}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>保存后设为当前</div>
          <Switch checked={setAsActive} onChange={setSetAsActive} disabled={saving} />
        </div>
      </div>

      {mode === 'upload' ? (
        <Upload.Dragger
          multiple={false}
          showUploadList={false}
          accept=".json"
          disabled={saving}
          beforeUpload={(f) => {
            void handlePick(f as any);
            return false;
          }}
          style={{ borderRadius: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <InboxOutlined />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600 }}>{file ? '已选择文件' : '拖拽世界书 JSON 到这里'}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>或点击选择文件（仅 .json）</div>
            </div>
          </div>
        </Upload.Dragger>
      ) : null}

      {mode === 'text' ? (
        <Input.TextArea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="粘贴 worldbook JSON..."
          autoSize={{ minRows: 8, maxRows: 18 }}
          disabled={saving}
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
        />
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 12, alignItems: 'start' }}>
        <div style={{
          background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
          borderRadius: 12,
          padding: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          minHeight: 160,
        }}>
          {preparedJson || '预览区：选择文件或粘贴 JSON 后会显示格式化内容'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>文件名（保存到 agent-presets/）</div>
          <Input value={fileName} onChange={(e) => setFileName(e.target.value)} disabled={saving} />

          <Button
            type="primary"
            icon={setAsActive ? <StarOutlined /> : <SaveOutlined />}
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!String(preparedJson || '').trim()}
          >
            {setAsActive ? '保存并启用' : '保存'}
          </Button>

          <Button onClick={onClose} disabled={saving}>取消</Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => void handlePick(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
      />
    </div>
  );

  if (embedded) {
    if (!open) return null;
    return content;
  }

  return (
    <Modal
      open={open}
      title="导入世界书"
      onCancel={onClose}
      footer={null}
      width={820}
      destroyOnHidden
    >
      {content}
    </Modal>
  );
};

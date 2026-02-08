import { useState } from 'react';
import { restorePluginSkill, saveModuleConfig, savePluginConfig, savePluginSkill } from '../services/api';
import { getDisplayName } from '../utils/icons';
import type { FileItem, IOSEditorWin } from '../types/ui';
import type { EnvVariable } from '../types/config';
import type { ToastMessage } from '../components/Toast';

export type UseIOSEditorParams = {
  setSaving: (s: boolean) => void;
  addToast: (type: ToastMessage['type'], title: string, message?: string) => void;
  loadConfigs: (silent?: boolean) => Promise<void> | void;
};

function filterVarsByExample(file: FileItem, vars: EnvVariable[]) {
  if (!file.hasEnv || !file.hasExample) return vars;
  const example = file.exampleVariables || [];
  if (!Array.isArray(example) || example.length === 0) return vars;
  const exampleKeys = new Set(example.map(v => String(v.key || '')));
  return (vars || []).filter(v => exampleKeys.has(String(v.key || '')));
}

export function useIOSEditor({ setSaving, addToast, loadConfigs }: UseIOSEditorParams) {
  const [iosEditorWindows, setIosEditorWindows] = useState<IOSEditorWin[]>([]);
  const [activeIOSEditorId, setActiveIOSEditorId] = useState<string | null>(null);

  const openIOSWindow = (file: FileItem) => {
    // Refresh configs to ensure we have the latest data
    loadConfigs(true); // silent mode

    const existing = iosEditorWindows.find(w => w.file.name === file.name && w.file.type === file.type);
    if (existing) {
      if (existing.minimized) {
        setIosEditorWindows(prev => prev.map(w => w.id === existing.id ? { ...w, minimized: false } : w));
      }

      // Refresh window data from the latest file snapshot.
      setIosEditorWindows(prev => prev.map(w => {
        if (w.id !== existing.id) return w;
        const rawSkill = (file as any)?.skillMarkdown;
        const nextSkill = typeof rawSkill === 'string' ? rawSkill : '';
        const shouldRefreshDraft = !w.skillDirty && (w.skillDraft == null || w.skillDraft === '' || w.skillDraft === nextSkill);
        return {
          ...w,
          file,
          editedVars: filterVarsByExample(file, file.variables ? [...file.variables] : []),
          skillDraft: shouldRefreshDraft ? nextSkill : w.skillDraft,
        };
      }));

      setActiveIOSEditorId(existing.id);
      return existing.id;
    }
    const id = `ios-editor-${Date.now()}`;

    const rawSkill = (file as any)?.skillMarkdown;
    const skillDraft = typeof rawSkill === 'string' ? rawSkill : '';
    const win: IOSEditorWin = {
      id,
      file,
      editedVars: filterVarsByExample(file, file.variables ? [...file.variables] : []),
      minimized: false,
      section: 'mcp',
      skillDraft,
      skillDirty: false,
    };
    setIosEditorWindows(prev => [...prev, win]);
    setActiveIOSEditorId(id);
    return id;
  };

  const setSection = (id: string, section: 'mcp' | 'skills') => {
    setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, section } : w));
  };

  const updateSkillDraft = (id: string, next: string) => {
    setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, skillDraft: next, skillDirty: true } : w));
  };

  const saveSkill = async (id: string) => {
    const win = iosEditorWindows.find(w => w.id === id);
    if (!win) return;
    if (win.file.type !== 'plugin') {
      addToast('error', '保存失败', 'Skills 仅适用于插件（plugin）');
      return;
    }
    try {
      setSaving(true);
      await savePluginSkill(win.file.name, String(win.skillDraft || ''));
      setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, skillDirty: false } : w));
      addToast('success', '保存成功', `已更新 ${getDisplayName(win.file.name)} · skill.md`);
      await loadConfigs(true);
    } catch (e) {
      addToast('error', '保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const restoreSkill = async (id: string) => {
    const win = iosEditorWindows.find(w => w.id === id);
    if (!win) return;
    if (win.file.type !== 'plugin') {
      addToast('error', '恢复失败', 'Skills 仅适用于插件（plugin）');
      return;
    }
    try {
      setSaving(true);
      await restorePluginSkill(win.file.name);
      setIosEditorWindows(prev => prev.map(w => {
        if (w.id !== id) return w;
        return { ...w, skillDraft: undefined, skillDirty: false };
      }));
      addToast('success', '已恢复默认', `已删除 ${getDisplayName(win.file.name)} · skill.md`);
      await loadConfigs(true);
    } catch (e) {
      addToast('error', '恢复失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const minimize = (id: string) => {
    setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
    setActiveIOSEditorId(null);
  };

  const close = (id: string) => {
    setIosEditorWindows(prev => prev.filter(w => w.id !== id));
    if (activeIOSEditorId === id) setActiveIOSEditorId(null);
  };

  const changeVar = (id: string, index: number, field: 'key' | 'value' | 'comment', val: string) => {
    setIosEditorWindows(prev => prev.map(w => {
      if (w.id !== id) return w;
      const newVars = [...w.editedVars];
      newVars[index] = { ...newVars[index], [field]: val } as EnvVariable;
      return { ...w, editedVars: newVars };
    }));
  };

  const addVar = (id: string) => {
    setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, editedVars: [...w.editedVars, { key: '', value: '', comment: '', isNew: true }] } : w));
  };

  const deleteVar = (id: string, index: number) => {
    const win = iosEditorWindows.find(w => w.id === id);
    if (!win) return;

    const targetVar = win.editedVars[index];

    // Check if variable exists in .env.example
    const exampleKeys = new Set((win.file.exampleVariables || []).map(v => v.key));
    if (exampleKeys.has(targetVar.key)) {
      addToast('error', '无法删除', `变量 "${targetVar.key}" 存在于 .env.example 中，无法删除`);
      return;
    }

    // Allow deletion and show success feedback
    setIosEditorWindows(prev => prev.map(w => w.id === id ? { ...w, editedVars: w.editedVars.filter((_, i) => i !== index) } : w));
    addToast('success', '删除成功', `已删除变量 "${targetVar.key}"`);
  };

  const save = async (id: string) => {
    const win = iosEditorWindows.find(w => w.id === id);
    if (!win) return;
    try {
      setSaving(true);
      const validVars = win.editedVars.filter(v => v.key.trim());
      if (win.file.type === 'module') {
        await saveModuleConfig(win.file.name, validVars);
      } else {
        await savePluginConfig(win.file.name, validVars);
      }
      addToast('success', '保存成功', `已更新 ${getDisplayName(win.file.name)} 配置`);
      await loadConfigs(true);
    } catch (error) {
      addToast('error', '保存失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  return {
    iosEditorWindows,
    activeIOSEditorId,
    openIOSWindow,
    minimize,
    close,
    changeVar,
    addVar,
    deleteVar,
    save,
    setSection,
    updateSkillDraft,
    saveSkill,
    restoreSkill,
    setActiveIOSEditorId,
  } as const;
}

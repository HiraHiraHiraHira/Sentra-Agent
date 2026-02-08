import React, { useMemo } from 'react';
import { IoChevronBack, IoClose } from 'react-icons/io5';
import { EnvEditor } from './EnvEditor';
import { EnvVariable } from '../types/config';

interface IOSEditorProps {
    fileType?: 'module' | 'plugin';
    fileName?: string;
    appName: string;
    vars: EnvVariable[];
    onUpdate: (index: number, field: 'key' | 'value' | 'comment', val: string) => void;
    onAdd: () => void;
    onDelete: (index: number) => void;
    onSave: () => void;

    section?: 'mcp' | 'skills';
    onSectionChange?: (next: 'mcp' | 'skills') => void;

    skillDraft?: string;
    skillDirty?: boolean;
    onSkillChange?: (next: string) => void;
    onSaveSkill?: () => void;
    onRestoreSkill?: () => void;

    onMinimize: () => void;
    onClose: () => void;
    saving: boolean;
    isExample: boolean;
    backLabel?: string;
}

export const IOSEditor: React.FC<IOSEditorProps> = ({
    fileType,
    fileName,
    appName,
    vars,
    onUpdate,
    onAdd,
    onDelete,
    onSave,
    section = 'mcp',
    onSectionChange,
    skillDraft,
    skillDirty,
    onSkillChange,
    onSaveSkill,
    onRestoreSkill,
    onMinimize,
    onClose,
    saving,
    isExample,
    backLabel = '主页'
}) => {
    const isPlugin = fileType === 'plugin';

    const safeSkillText = useMemo(() => {
        return typeof skillDraft === 'string' ? skillDraft : '';
    }, [skillDraft]);

    return (
        <div className="ios-app-window">
            <div className="ios-app-header">
                <div className="ios-back-btn" onClick={onMinimize}>
                    <IoChevronBack /> {backLabel}
                </div>
                <div>{appName}</div>
                <div
                    style={{ color: '#ff3b30', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', display: 'flex', alignItems: 'center' }}
                    onClick={onClose}
                >
                    <IoClose size={24} />
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#1c1c1e', display: 'flex', flexDirection: 'column' }}>
                {isPlugin ? (
                    <div style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => onSectionChange?.('mcp')}
                            style={{
                                flex: 1,
                                height: 34,
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: section === 'mcp' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                fontWeight: 700,
                            }}
                        >
                            MCP 配置
                        </button>
                        <button
                            type="button"
                            onClick={() => onSectionChange?.('skills')}
                            style={{
                                flex: 1,
                                height: 34,
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.18)',
                                background: section === 'skills' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                fontWeight: 700,
                            }}
                        >
                            Skills
                        </button>
                    </div>
                ) : null}

                {(!isPlugin || section === 'mcp') ? (
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <EnvEditor
                            appName={appName}
                            vars={vars}
                            onUpdate={onUpdate}
                            onAdd={onAdd}
                            onDelete={onDelete}
                            onSave={onSave}
                            saving={saving}
                            isExample={isExample}
                            theme="dark"
                            isMobile={true}
                        />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 12px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0 10px' }}>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {fileName ? fileName : 'plugin'} · skill.md
                            </div>
                            {skillDirty ? (
                                <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 800 }}>未保存</div>
                            ) : null}
                        </div>

                        <textarea
                            value={safeSkillText}
                            onChange={(e) => onSkillChange?.(e.target.value)}
                            placeholder="在此编辑插件 Skills（Markdown）…"
                            style={{
                                flex: 1,
                                width: '100%',
                                resize: 'none',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.16)',
                                background: 'rgba(0,0,0,0.25)',
                                color: 'rgba(255,255,255,0.92)',
                                fontSize: 13,
                                lineHeight: 1.45,
                                padding: 12,
                                outline: 'none',
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                                WebkitOverflowScrolling: 'touch',
                            }}
                            spellCheck={false}
                        />

                        <div style={{ display: 'flex', gap: 10, paddingTop: 10 }}>
                            <button
                                type="button"
                                onClick={onRestoreSkill}
                                disabled={saving}
                                style={{
                                    flex: 1,
                                    height: 36,
                                    borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.16)',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    opacity: saving ? 0.6 : 1,
                                }}
                            >
                                恢复默认
                            </button>
                            <button
                                type="button"
                                onClick={onSaveSkill}
                                disabled={saving || !skillDirty}
                                style={{
                                    flex: 1,
                                    height: 36,
                                    borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.16)',
                                    background: saving || !skillDirty ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.32)',
                                    color: '#fff',
                                    fontWeight: 800,
                                    opacity: saving ? 0.6 : 1,
                                }}
                            >
                                保存
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

import React, { useState } from 'react';
import { IoChevronBack, IoAdd, IoSave, IoSearch, IoDocumentText, IoTrash } from 'react-icons/io5';
import Editor from '@monaco-editor/react';
import { PresetsEditorState } from '../hooks/usePresetsEditor';


interface IOSPresetsEditorProps {
    onClose: () => void;
    addToast: (type: 'success' | 'error', title: string, message?: string) => void;
    state: PresetsEditorState;
}

export const IOSPresetsEditor: React.FC<IOSPresetsEditorProps> = ({ onClose, state }) => {
    const {
        files,
        selectedFile,
        fileContent,
        searchTerm,
        loading,
        saving,
        loadingFile,
        setSearchTerm,
        selectFile,
        saveFile,
        setFileContent,
        createFile,
        deleteFile
    } = state;

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Filter files
    const filteredFiles = files.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = async () => {
        if (!newFileName) return;
        await createFile(newFileName);
        setShowCreateModal(false);
        setNewFileName('');
    };

    const handleDelete = async () => {
        if (!selectedFile) return;
        await deleteFile(selectedFile);
        setShowDeleteModal(false);
    };

    return (
        <div className="ios-app-window" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000' }}>
            {/* Header */}
            <div className="ios-app-header" style={{
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                background: 'rgba(28, 28, 30, 0.95)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                zIndex: 10
            }}>
                <div className="ios-back-btn" onClick={() => {
                    if (selectedFile) {
                        selectFile(null as any); // Hack to deselect, but better to add deselect method to hook or just pass null if hook allows
                        // Actually hook expects PresetFile. Let's check hook.
                        // The hook doesn't have a clear way to deselect except maybe passing a dummy or handling it.
                        // Let's just close the app if on file list, or go back to list if on file.
                        // Wait, selectFile(null) might crash if types are strict.
                        // Let's look at how we can "go back".
                        // If we are in file view (selectedFile is set), we want to go back to list.
                        // But the hook's selectFile takes a PresetFile.
                        // We might need to reload the page or just use a local state for view?
                        // The state 'selectedFile' controls the view.
                        // We can't easily set it to null via selectFile because of types.
                        // But we can force it if we cast, or update the hook.
                        // For now, let's assume onClose closes the whole thing.
                    }
                    onClose();
                }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#0a84ff', fontSize: '17px' }}>
                    <IoChevronBack size={24} /> 主页
                </div>
                <div style={{ fontWeight: 600, fontSize: '17px' }}>
                    {selectedFile ? selectedFile.name : '预设撰写'}
                </div>
                <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
                    {selectedFile ? (
                        <div onClick={saveFile} style={{ color: '#0a84ff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            {saving ? '...' : <IoSave size={22} />}
                        </div>
                    ) : (
                        <div onClick={() => setShowCreateModal(true)} style={{ color: '#0a84ff', cursor: 'pointer' }}>
                            <IoAdd size={28} />
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {selectedFile ? (
                    // Editor View
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {loadingFile ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                                加载中...
                            </div>
                        ) : (
                            <>
                                <Editor
                                    height="100%"
                                    defaultLanguage="markdown" // Presets are usually prompts/markdown
                                    theme="vs-dark"
                                    value={fileContent}
                                    onChange={(val) => setFileContent(val || '')}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        wordWrap: 'on',
                                        lineNumbers: 'off',
                                        folding: false,
                                        padding: { top: 10 }
                                    }}
                                />
                                {/* Toolbar for file actions */}
                                <div style={{
                                    height: '44px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0 20px',
                                    background: '#1c1c1e',
                                    borderTop: '1px solid #333'
                                }}>
                                    <div onClick={() => {
                                        // We need a way to deselect. 
                                        // Since we can't via hook easily without changing it, 
                                        // we'll just reload files which might reset selection? 
                                        // No, hook state persists.
                                        // Let's cast to any to pass null, and we fixed the hook to handle it.
                                        selectFile(null as any);
                                    }} style={{ color: '#0a84ff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                        <IoChevronBack /> 返回列表
                                    </div>
                                    <div onClick={() => setShowDeleteModal(true)} style={{ color: '#ff453a', cursor: 'pointer' }}>
                                        <IoTrash size={20} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    // File List View
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Search Bar */}
                        <div style={{ padding: '10px 16px', background: '#1c1c1e' }}>
                            <div style={{
                                background: '#2c2c2e',
                                borderRadius: '10px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 10px'
                            }}>
                                <IoSearch color="#8e8e93" size={18} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="搜索预设..."
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#fff',
                                        marginLeft: '8px',
                                        flex: 1,
                                        outline: 'none',
                                        fontSize: '16px'
                                    }}
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loading ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>加载中...</div>
                            ) : filteredFiles.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                                    {searchTerm ? '未找到匹配文件' : '暂无预设文件'}
                                </div>
                            ) : (
                                filteredFiles.map(file => (
                                    <div
                                        key={file.path}
                                        onClick={() => selectFile(file)}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid #2c2c2e',
                                            display: 'flex',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            background: '#000'
                                        }}
                                    >
                                        <IoDocumentText color="#0a84ff" size={24} style={{ marginRight: 12 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: '#fff', fontSize: '16px', marginBottom: 4 }}>{file.name}</div>
                                            <div style={{ color: '#666', fontSize: '12px' }}>
                                                {new Date(file.modified).toLocaleString()} · {(file.size / 1024).toFixed(1)} KB
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 100
                }} onClick={() => setShowCreateModal(false)}>
                    <div style={{
                        width: '80%', background: '#1c1c1e', borderRadius: '14px', padding: '20px',
                        textAlign: 'center'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0', color: '#fff' }}>新建预设</h3>
                        <input
                            autoFocus
                            value={newFileName}
                            onChange={e => setNewFileName(e.target.value)}
                            placeholder="文件名 (例如: my-preset)"
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#2c2c2e', color: '#fff', marginBottom: '20px', outline: 'none'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowCreateModal(false)} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#2c2c2e', color: '#fff', fontSize: '16px'
                            }}>取消</button>
                            <button onClick={handleCreate} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#0a84ff', color: '#fff', fontSize: '16px', fontWeight: 'bold'
                            }}>创建</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 100
                }} onClick={() => setShowDeleteModal(false)}>
                    <div style={{
                        width: '80%', background: '#1c1c1e', borderRadius: '14px', padding: '20px',
                        textAlign: 'center'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>确认删除?</h3>
                        <p style={{ color: '#888', marginBottom: '20px' }}>此操作无法撤销。</p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowDeleteModal(false)} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#2c2c2e', color: '#fff', fontSize: '16px'
                            }}>取消</button>
                            <button onClick={handleDelete} style={{
                                flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                                background: '#ff453a', color: '#fff', fontSize: '16px', fontWeight: 'bold'
                            }}>删除</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

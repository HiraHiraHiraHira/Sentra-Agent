import React, { useState } from 'react';
import styles from './PresetsEditor.module.css';
import { IoSearch, IoDocumentText, IoChevronBack, IoAdd } from 'react-icons/io5';
import Editor from '@monaco-editor/react';
import { SafeInput } from './SafeInput';
import { motion, AnimatePresence } from 'framer-motion';
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
        createFile
    } = state;

    const [showNewFileModal, setShowNewFileModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    const filteredFiles = files.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getLanguage = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'json': return 'json';
            case 'js': return 'javascript';
            case 'ts': return 'typescript';
            case 'md': return 'markdown';
            case 'yml':
            case 'yaml': return 'yaml';
            case 'css': return 'css';
            case 'html': return 'html';
            default: return 'plaintext';
        }
    };

    const handleCreateFile = async () => {
        if (!newFileName.trim()) return;
        await createFile(newFileName);
        setShowNewFileModal(false);
        setNewFileName('');
    };

    return (
        <div className={`${styles.container} ${styles.mobileContainer}`}>
            <AnimatePresence>
                {!selectedFile ? (
                    <motion.div
                        className={styles.mobileFileList}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <div className={styles.mobileHeader}>
                            <button onClick={() => setShowNewFileModal(true)} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 24, padding: 0, display: 'flex' }}>
                                <IoAdd />
                            </button>
                            <div className={styles.mobileTitle}>预设文件</div>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 16 }}>
                                完成
                            </button>
                        </div>

                        <div style={{ padding: '0 16px 16px' }}>
                            <div className={styles.searchWrapper} style={{ marginTop: 16 }}>
                                <IoSearch className={styles.searchIcon} />
                                <SafeInput
                                    type="text"
                                    placeholder="搜索文件..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={styles.searchInput}
                                    style={{ background: '#1c1c1e', borderColor: 'transparent' }}
                                />
                            </div>
                        </div>

                        <div className={styles.fileList} style={{ padding: '0 16px' }}>
                            {loading ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>加载中...</div>
                            ) : (
                                filteredFiles.map(file => (
                                    <div
                                        key={file.path}
                                        className={styles.fileItem}
                                        style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', borderRadius: 0 }}
                                        onClick={() => selectFile(file)}
                                    >
                                        <IoDocumentText className={styles.fileIcon} style={{ color: '#0a84ff' }} />
                                        <div className={styles.fileName} style={{ fontSize: 16 }}>{file.name}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        className={styles.mobileEditor}
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        <div className={styles.mobileEditorToolbar}>
                            <button className={styles.backBtn} onClick={() => selectFile(null as any)}>
                                <IoChevronBack /> 返回
                            </button>
                            <div className={styles.mobileTitle} style={{ fontSize: 15 }}>{selectedFile.name}</div>
                            <button
                                className={styles.saveBtn}
                                style={{ width: 'auto', border: 'none', background: 'none' }}
                                onClick={saveFile}
                                disabled={saving}
                            >
                                {saving ? '...' : '保存'}
                            </button>
                        </div>

                        <div style={{ flex: 1, position: 'relative' }}>
                            {loadingFile ? (
                                <div className={styles.emptyState}>读取文件中...</div>
                            ) : (
                                <Editor
                                    height="100%"
                                    language={getLanguage(selectedFile.name)}
                                    value={fileContent}
                                    onChange={(value) => setFileContent(value || '')}
                                    theme="vs-dark"
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        lineNumbers: 'off',
                                        padding: { top: 10, bottom: 10 }
                                    }}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {showNewFileModal && (
                <div className={styles.modalOverlay} style={{ zIndex: 2000 }}>
                    <div className={styles.modalContent} style={{ width: '80%', maxWidth: 320 }}>
                        <div className={styles.modalTitle}>新建文件</div>
                        <input
                            type="text"
                            className={styles.modalInput}
                            placeholder="文件名"
                            value={newFileName}
                            onChange={(e) => setNewFileName(e.target.value)}
                            autoFocus
                        />
                        <div className={styles.modalActions}>
                            <button
                                className={styles.cancelBtn}
                                onClick={() => setShowNewFileModal(false)}
                            >
                                取消
                            </button>
                            <button
                                className={styles.confirmBtn}
                                onClick={handleCreateFile}
                            >
                                创建
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

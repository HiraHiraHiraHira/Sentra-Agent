import React, { useState } from 'react';
import { EnvVariable } from '../types/config';
import styles from './EnvEditor.module.css';
import { IoAdd, IoSave, IoTrash, IoInformationCircle, IoSearch, IoWarning } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { SafeInput } from './SafeInput';

interface EnvEditorProps {
  appName?: string;
  vars: EnvVariable[];
  onUpdate: (index: number, field: 'key' | 'value' | 'comment', val: string) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  isExample?: boolean;
  theme: 'light' | 'dark';
  isMobile?: boolean;
}

export const EnvEditor: React.FC<EnvEditorProps> = ({
  appName,
  vars,
  onUpdate,
  onAdd,
  onDelete,
  onSave,
  saving,
  isExample,
  theme,
  isMobile
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; key: string } | null>(null);

  const filteredVars = vars.map((v, i) => ({ ...v, originalIndex: i }))
    .filter(v =>
      v.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.comment && v.comment.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  return (
    <div
      className={`${styles.container} ${isMobile ? styles.mobileContainer : ''}`}
      data-theme={theme}
      onContextMenu={(e) => {
        e.stopPropagation();
      }}
    >
      {!isMobile && (
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.searchWrapper}>
              <IoSearch className={styles.searchIcon} />
              <SafeInput
                type="text"
                placeholder="搜索配置..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>
          <div className={styles.sidebarContent}>
            <div className={styles.groupTitle}>通用设置</div>
            <div className={`${styles.sidebarItem} ${styles.active}`}>
              <span className="material-icons" style={{ fontSize: 16, marginRight: 8 }}>tune</span>
              环境变量
            </div>
          </div>
        </div>
      )}

      <div className={styles.mainContent}>
        <div className={styles.toolbar}>
          {isMobile ? (
            <>
              <div className={styles.mobileSearchInputBox}>
                <IoSearch className={styles.searchIcon} />
                <SafeInput
                  type="text"
                  placeholder="搜索配置..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={styles.searchInput}
                />
              </div>
              <div className={styles.actions}>
                <button className={styles.macBtn} onClick={onAdd}>
                  <IoAdd size={14} style={{ marginRight: 4 }} />
                  新增
                </button>
                <button className={`${styles.macBtn} ${styles.primary}`} onClick={onSave} disabled={saving}>
                  <IoSave size={14} style={{ marginRight: 4 }} />
                  {saving ? '...' : '保存'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.breadcrumb}>
                <span className={styles.badge}>{vars.length}</span> 配置项
                {appName && <span style={{ marginLeft: 8, opacity: 0.6 }}> • {appName}</span>}
              </div>
              <div className={styles.actions}>
                <button className={styles.macBtn} onClick={onAdd}>
                  <IoAdd size={14} style={{ marginRight: 4 }} />
                  新增
                </button>
                <button className={`${styles.macBtn} ${styles.primary}`} onClick={onSave} disabled={saving}>
                  <IoSave size={14} style={{ marginRight: 4 }} />
                  {saving ? '...' : '保存'}
                </button>
              </div>
            </>
          )}
        </div>

        {isExample && (
          <div style={{
            background: '#3a3a10',
            color: '#dcdcaa',
            padding: '8px 20px',
            fontSize: '12px',
            borderBottom: '1px solid #4d4d18',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <IoInformationCircle size={16} />
            <span>当前正在预览默认配置 (.env.example)。保存后将创建新的 .env 配置文件。</span>
          </div>
        )}

        <div className={styles.scrollArea}>
          {vars.length === 0 ? (
            <div className={styles.emptyState}>
              <IoInformationCircle size={48} style={{ marginBottom: 16 }} />
              <div style={{ fontWeight: 500 }}>配置文件为空</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>点击右上角"新增"按钮添加配置项</div>
            </div>
          ) : (
            <div className={styles.settingsGroup}>
              {filteredVars.map((v) => (
                <div key={v.originalIndex} className={styles.settingsRow}>
                  <div className={styles.rowHeader}>
                    <div className={styles.keyInfo}>
                      {v.isNew ? (
                        <SafeInput
                          className={styles.newKeyInput}
                          value={v.key}
                          onChange={(e) => onUpdate(v.originalIndex, 'key', e.target.value)}
                          placeholder="NEW_KEY"
                          autoFocus
                        />
                      ) : (
                        <div className={styles.keyName}>{v.key}</div>
                      )}
                      <div className={styles.keyComment}>
                        <SafeInput
                          className={styles.commentInput}
                          value={v.comment || ''}
                          onChange={(e) => onUpdate(v.originalIndex, 'comment', e.target.value)}
                          placeholder="添加说明..."
                        />
                      </div>
                    </div>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteConfirm({ index: v.originalIndex, key: v.key })}
                      title="删除"
                    >
                      <IoTrash size={16} />
                    </button>
                  </div>

                  <div className={styles.editorWrapper}>
                    <SafeInput
                      className={styles.valueInput}
                      value={v.value}
                      onChange={(e) => onUpdate(v.originalIndex, 'value', e.target.value)}
                      placeholder="Value"
                      spellCheck={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {deleteConfirm && (
          <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)}>
            <motion.div
              className={styles.modalContent}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={styles.modalIcon}>
                <IoWarning size={48} color="#FF3B30" />
              </div>
              <h3 className={styles.modalTitle}>确认删除?</h3>
              <p className={styles.modalText}>
                您确定要删除配置项 <span className={styles.highlight}>{deleteConfirm.key || '未命名'}</span> 吗？此操作无法撤销。
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setDeleteConfirm(null)}
                >
                  取消
                </button>
                <button
                  className={styles.confirmBtn}
                  onClick={() => {
                    onDelete(deleteConfirm.index);
                    setDeleteConfirm(null);
                  }}
                >
                  删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
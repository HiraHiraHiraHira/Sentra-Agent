import React from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'info' | 'warning' | 'error';
}

export const Dialog: React.FC<DialogProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = '确认',
    cancelText = '取消',
    type = 'info'
}) => {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onCancel}>
            <div className={styles.dialog} onClick={e => e.stopPropagation()}>
                <div className={styles.title}>{title}</div>
                <div className={styles.message}>{message}</div>
                <div className={styles.buttons}>
                    <button className={`${styles.btn} ${styles.cancel}`} onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        className={`${styles.btn} ${styles.confirm} ${type === 'error' ? styles.danger : ''}`}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

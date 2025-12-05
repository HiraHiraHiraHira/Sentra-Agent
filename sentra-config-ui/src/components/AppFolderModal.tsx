import React from 'react';
import { IoClose } from 'react-icons/io5';
import type { AppFolder } from '../types/ui';

interface AppFolderProps {
    folder: AppFolder;
    onAppClick: (appId: string, onClick: () => void) => void;
    onClose: () => void;
}

export const AppFolderModal: React.FC<AppFolderProps> = ({ folder, onAppClick, onClose }) => {
    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.4)', // Slightly more transparent since no blur
                    zIndex: 10000,
                    animation: 'fadeIn 0.2s ease-out',
                }}
            />

            {/* Folder Modal - macOS Style */}
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(30, 30, 30, 0.85)', // Fallback / stronger bg for performance
                    backdropFilter: 'blur(20px)', // Reduced from 40px
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '24px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                    zIndex: 10001,
                    minWidth: '450px',
                    maxWidth: '600px',
                    willChange: 'transform, opacity', // Performance hint
                    animation: 'scaleIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '24px 28px 20px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div
                        style={{
                            fontSize: '20px',
                            fontWeight: 600,
                            color: 'white',
                            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                    >
                        {folder.name}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            borderRadius: '50%',
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'white',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <IoClose size={20} />
                    </button>
                </div>

                {/* Apps Grid */}
                <div
                    style={{
                        padding: '28px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                        gap: '24px',
                        minHeight: '200px',
                    }}
                >
                    {folder.apps.map((app) => (
                        <div
                            key={app.id}
                            onClick={() => {
                                onAppClick(app.id, app.onClick);
                                onClose();
                            }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '12px 8px',
                                borderRadius: '16px',
                                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                background: 'transparent',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.transform = 'translateY(-4px) scale(1.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            }}
                        >
                            <div style={{ width: 70, height: 70, marginBottom: 10 }}>
                                {app.icon}
                            </div>
                            <div
                                style={{
                                    fontSize: 13,
                                    color: 'white',
                                    textAlign: 'center',
                                    lineHeight: 1.3,
                                    fontWeight: 500,
                                    maxWidth: 90,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
                                }}
                            >
                                {app.name}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.9);
          }
          to { 
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
        </>
    );
};

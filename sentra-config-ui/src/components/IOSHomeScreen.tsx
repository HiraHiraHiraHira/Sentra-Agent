import React from 'react';
import { IoWifi, IoBatteryFull, IoApps } from 'react-icons/io5';
import { DesktopIcon, AppFolder } from '../types/ui';
import { IOSAppFolder } from './IOSAppFolder';

interface IOSHomeScreenProps {
    icons: DesktopIcon[];
    folders: AppFolder[];
    onLaunch: (icon: DesktopIcon) => void;
    wallpaper: string;
    onLaunchpadOpen: () => void;
    dockExtra: { id: string; name: string; icon: React.ReactNode; onClick: () => void }[];
    onAppSwitcherOpen?: () => void;
}

export const IOSHomeScreen: React.FC<IOSHomeScreenProps> = ({ icons, folders, onLaunch, wallpaper, onLaunchpadOpen, dockExtra, onAppSwitcherOpen }) => {
    // Combine folders and icons, folders first
    const allItems = [...folders, ...icons];
    const pageSize = 12;
    const pageCount = Math.max(1, Math.ceil(allItems.length / pageSize));
    const [pageIndex, setPageIndex] = React.useState(0);

    React.useEffect(() => {
        if (pageIndex >= pageCount) setPageIndex(Math.max(0, pageCount - 1));
    }, [pageCount, pageIndex]);

    const gridItems = allItems.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

    const computeDockCapacity = React.useCallback(() => {
        const w = window.innerWidth || 390;
        const dockIconSize = Math.min(54, Math.max(44, Math.round(w * 0.12)));
        const leftRight = 40; // ios.css: left/right = 20px
        const padding = 24; // ios.css: padding = 0 12px
        const gap = 10; // ios.css: gap = 10px
        const available = Math.max(0, w - leftRight - padding);
        const cap = Math.floor((available + gap) / (dockIconSize + gap));
        return Math.max(3, Math.min(8, cap));
    }, []);

    const [dockCapacity, setDockCapacity] = React.useState<number>(() => {
        if (typeof window === 'undefined') return 5;
        return computeDockCapacity();
    });

    React.useEffect(() => {
        const onResize = () => setDockCapacity(computeDockCapacity());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [computeDockCapacity]);

    const [openFolderId, setOpenFolderId] = React.useState<string | null>(null);

    // Dock: Launchpad + dynamic top-used apps from props
    const uniqueDockExtra = React.useMemo(() => {
        const out: { id: string; name: string; icon: React.ReactNode; onClick: () => void }[] = [];
        const seen = new Set<string>();
        for (const it of dockExtra || []) {
            if (!it || !it.id) continue;
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            out.push(it);
        }
        return out;
    }, [dockExtra]);

    const dockIcons = [
        {
            id: 'launchpad',
            name: '启动台',
            icon: <div style={{
                width: 'var(--ios-dock-icon-size)',
                height: 'var(--ios-dock-icon-size)',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}>
                <IoApps size={28} color="white" />
            </div>,
            onClick: onLaunchpadOpen
        },
        ...uniqueDockExtra.slice(0, Math.max(0, dockCapacity - 1))
    ];

    // Long-press to show name on Dock icons
    const [showId, setShowId] = React.useState<string | null>(null);
    const timerRef = React.useRef<number | null>(null);
    const clearTimer = () => { if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; } };
    const bindLong = (id: string) => ({
        onMouseDown: () => { clearTimer(); timerRef.current = window.setTimeout(() => setShowId(id), 500); },
        onMouseUp: () => { clearTimer(); setShowId(null); },
        onMouseLeave: () => { clearTimer(); setShowId(null); },
        onTouchStart: () => { clearTimer(); timerRef.current = window.setTimeout(() => setShowId(id), 500); },
        onTouchEnd: () => { clearTimer(); setShowId(null); },
        onTouchCancel: () => { clearTimer(); setShowId(null); },
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    });

    const swipeRef = React.useRef<{ y: number; opened: boolean } | null>(null);
    const panRef = React.useRef<{ x: number; y: number; opened: boolean; pageMoved: boolean } | null>(null);
    const longPressRef = React.useRef<{ x: number; y: number; timer: number | null; active: boolean } | null>(null);

    const clearLongPress = () => {
        const st = longPressRef.current;
        if (st?.timer != null) {
            window.clearTimeout(st.timer);
        }
        longPressRef.current = null;
    };

    const shouldAllowLongPress = (target: EventTarget | null) => {
        const el = target as HTMLElement | null;
        if (!el) return false;
        if (el.closest('.ios-icon-container')) return false;
        if (el.closest('.ios-dock')) return false;
        if (el.closest('.ios-status-bar')) return false;
        if (el.closest('.ios-folder-overlay')) return false;
        return true;
    };

    const maybeStartLongPress = (x: number, y: number, target: EventTarget | null) => {
        if (!onAppSwitcherOpen) return;
        if (!shouldAllowLongPress(target)) return;
        clearLongPress();
        const timer = window.setTimeout(() => {
            const st = longPressRef.current;
            if (!st || !st.active) return;
            st.active = false;
            onAppSwitcherOpen();
        }, 520);
        longPressRef.current = { x, y, timer, active: true };
    };

    const handlePanStart = (x: number, y: number) => {
        panRef.current = { x, y, opened: false, pageMoved: false };
        swipeRef.current = { y, opened: false };
    };

    const handlePanMove = (x: number, y: number) => {
        if (!panRef.current) return;
        const dx = x - panRef.current.x;
        const dy = y - panRef.current.y;

        const lp = longPressRef.current;
        if (lp?.active) {
            const moved = Math.hypot(x - lp.x, y - lp.y);
            if (moved > 10) {
                clearLongPress();
            }
        }

        const bottomZone = panRef.current.y >= (window.innerHeight - 120);
        if (bottomZone && onAppSwitcherOpen && !panRef.current.opened && dy < -32 && Math.abs(dy) > Math.abs(dx)) {
            panRef.current.opened = true;
            onAppSwitcherOpen();
            return;
        }

        if (openFolderId) return;
        if (pageCount <= 1) return;
        if (panRef.current.pageMoved) return;
        const gridZone = panRef.current.y >= 80 && panRef.current.y <= (window.innerHeight - 140);
        if (!gridZone) return;

        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
            panRef.current.pageMoved = true;
            if (dx < 0) {
                setPageIndex((p) => Math.min(pageCount - 1, p + 1));
            } else {
                setPageIndex((p) => Math.max(0, p - 1));
            }
        }
    };

    const handlePanEnd = () => {
        panRef.current = null;
        swipeRef.current = null;
        clearLongPress();
    };

    return (
        <div
            className="ios-container"
            style={{ backgroundImage: `url(${wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
            onTouchStart={(e) => {
                const t = e.touches?.[0];
                if (!t) return;
                handlePanStart(t.clientX, t.clientY);
                maybeStartLongPress(t.clientX, t.clientY, e.target);
            }}
            onTouchMove={(e) => {
                const t = e.touches?.[0];
                if (!t) return;
                handlePanMove(t.clientX, t.clientY);
            }}
            onTouchEnd={handlePanEnd}
            onTouchCancel={handlePanEnd}
            onPointerDown={(e) => {
                handlePanStart(e.clientX, e.clientY);
                maybeStartLongPress(e.clientX, e.clientY, e.target);
            }}
            onPointerMove={(e) => {
                if ((e.buttons ?? 0) === 0) return;
                handlePanMove(e.clientX, e.clientY);
            }}
            onPointerUp={handlePanEnd}
            onPointerCancel={handlePanEnd}
        >
            {/* Status Bar */}
            <div
                className="ios-status-bar"
            >
                <div>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <IoWifi size={18} />
                    <IoBatteryFull size={20} />
                </div>
            </div>

            {/* Grid Area */}
            <div className="ios-grid">
                {gridItems.map(item => {
                    if ('apps' in item) {
                        // It's a folder
                        return (
                            <div key={item.id} className="ios-icon-container">
                                <IOSAppFolder
                                    folder={item}
                                    isOpen={openFolderId === item.id}
                                    onOpen={() => setOpenFolderId(item.id)}
                                    onClose={() => setOpenFolderId(null)}
                                    onAppClick={(_appId, onClick) => {
                                        onClick();
                                        setOpenFolderId(null);
                                    }}
                                />
                            </div>
                        );
                    } else {
                        // It's an icon
                        return (
                            <div key={item.id} className="ios-icon-container" onClick={() => onLaunch(item)}>
                                <div className="ios-icon" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                                    {item.icon}
                                </div>
                                <div className="ios-label">{item.name}</div>
                            </div>
                        );
                    }
                })}
            </div>

            {pageCount > 1 && (
                <div style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 120,
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 8,
                    zIndex: 12,
                    pointerEvents: openFolderId ? 'none' : 'auto'
                }}>
                    {Array.from({ length: pageCount }).map((_, i) => (
                        <div
                            key={i}
                            onClick={() => setPageIndex(i)}
                            style={{
                                width: i === pageIndex ? 18 : 7,
                                height: 7,
                                borderRadius: 999,
                                background: i === pageIndex ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.35)',
                                transition: 'all 120ms ease',
                                cursor: 'pointer'
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Dock */}
            <div className="ios-dock">
                {dockIcons.map(icon => (
                    <div
                        key={icon.id}
                        className="ios-icon-container"
                        onClick={icon.onClick}
                        style={{ marginBottom: 0, position: 'relative' }}
                        {...bindLong(icon.id)}
                    >
                        <div className="ios-icon" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                            {icon.icon}
                        </div>
                        {showId === icon.id && (
                            <div style={{
                                position: 'absolute',
                                bottom: 'calc(var(--ios-dock-icon-size) + 10px)',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.8)',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 12,
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none'
                            }}>
                                {icon.name}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

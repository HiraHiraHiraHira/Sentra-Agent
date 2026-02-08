import { Suspense, lazy } from 'react';
import { IoChevronBack } from 'react-icons/io5';
import { SentraLoading } from './SentraLoading';
import { useTerminals } from '../hooks/useTerminals';
import { useUIStore } from '../store/uiStore';
import { useWindowsStore } from '../store/windowsStore';
import { DesktopTerminalWindows } from '../views/desktop/DesktopTerminalWindows';
import { storage } from '../utils/storage';

const TerminalWindow = lazy(() => import('./TerminalWindow').then(module => ({ default: module.TerminalWindow })));
const TerminalExecutorWindow = lazy(() => import('./TerminalExecutorWindow').then(module => ({ default: module.TerminalExecutorWindow })));

type TerminalWindowsLayerProps = {
  isPortable: boolean;
};

export function TerminalWindowsLayer(props: TerminalWindowsLayerProps) {
  const { isPortable } = props;
  const addToast = useUIStore(s => s.addToast);
  const performanceModeOverride = useUIStore(s => s.performanceModeOverride);
  const allocateZ = useWindowsStore(s => s.allocateZ);

  const {
    terminalWindows,
    setTerminalWindows,
    activeTerminalId,
    bringTerminalToFront,
    handleCloseTerminal,
    handleMinimizeTerminal,
  } = useTerminals({ addToast, allocateZ });

  const MENU_BAR_HEIGHT = 30;
  const SIDE_TABS_EXPANDED_WIDTH = 220;
  const BOTTOM_SAFE = 0;

  const sideTabsCollapsed = storage.getBool('sentra_side_tabs_collapsed', { fallback: true });
  const desktopSafeArea = {
    top: MENU_BAR_HEIGHT,
    bottom: BOTTOM_SAFE,
    left: sideTabsCollapsed ? 0 : SIDE_TABS_EXPANDED_WIDTH,
    right: 0,
  };

  if (isPortable) {
    return (
      <>
        {terminalWindows.map(term => (
          <div
            key={term.id}
            className="ios-app-window"
            style={{ display: term.minimized ? 'none' : 'flex', zIndex: (term.z ?? 2000) + 3000 }}
            onPointerDownCapture={() => {
              bringTerminalToFront(term.id);
            }}
          >
            <div className="ios-app-header">
              <div className="ios-back-btn" onClick={() => {
                handleMinimizeTerminal(term.id);
              }}>
                <IoChevronBack /> 终端
              </div>
              <div>{term.title}</div>
              <div style={{ color: '#ff3b30', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => handleCloseTerminal(term.id)}>
                关闭
              </div>
            </div>
            <Suspense fallback={<SentraLoading title="加载终端" subtitle="首次打开可能较慢，请稍等..." />}>
              {String(term.appKey || '').startsWith('execpty:') ? (
                <TerminalExecutorWindow sessionId={term.processId} onSessionNotFound={() => handleCloseTerminal(term.id)} />
              ) : (
                <TerminalWindow processId={term.processId} onProcessNotFound={() => handleCloseTerminal(term.id)} />
              )}
            </Suspense>
          </div>
        ))}
      </>
    );
  }

  const performanceMode = performanceModeOverride === 'on';

  return (
    <DesktopTerminalWindows
      terminalWindows={terminalWindows}
      activeTerminalId={activeTerminalId}
      bringTerminalToFront={bringTerminalToFront}
      handleCloseTerminal={handleCloseTerminal}
      handleMinimizeTerminal={handleMinimizeTerminal}
      setTerminalWindows={setTerminalWindows}
      handleWindowMaximize={() => { }}
      desktopSafeArea={desktopSafeArea}
      performanceMode={performanceMode}
    />
  );
}

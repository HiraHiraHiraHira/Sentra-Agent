import { IOSHomeScreen } from '../components/IOSHomeScreen';
import { IOSEditor } from '../components/IOSEditor';
import { IOSPresetsEditor } from '../components/IOSPresetsEditor';
import { Launchpad } from '../components/Launchpad';
import { TerminalWindow } from '../components/TerminalWindow';
import { ToastContainer, ToastMessage } from '../components/Toast';
import { IoChevronBack } from 'react-icons/io5';
import { getDisplayName, getIconForType } from '../utils/icons';
import { FileItem, IOSEditorWin, DesktopIcon, TerminalWin, AppFolder } from '../types/ui';
import { PresetsEditorState } from '../hooks/usePresetsEditor';

export type MobileViewProps = {
  allItems: FileItem[];
  usageCounts: Record<string, number>;
  recordUsage: (key: string) => void;
  desktopIcons: DesktopIcon[];
  desktopFolders: AppFolder[];
  launchpadOpen: boolean;
  setLaunchpadOpen: (open: boolean) => void;
  handleIOSOpenWindow: (file: FileItem) => void;
  iosEditorWindows: IOSEditorWin[];
  activeIOSEditorId: string | null;
  saving: boolean;
  handleIOSVarChange: (id: string, index: number, field: 'key' | 'value' | 'comment', val: string) => void;
  handleIOSAddVar: (id: string) => void;
  handleIOSDeleteVar: (id: string, index: number) => void;
  handleIOSSave: (id: string) => void | Promise<void>;
  handleIOSMinimizeEditor: (id: string) => void;
  handleIOSCloseEditor: (id: string) => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
  terminalWindows: TerminalWin[];
  handleMinimizeTerminal: (id: string) => void;
  handleCloseTerminal: (id: string) => void;
  iosPresetsEditorOpen: boolean;
  setIosPresetsEditorOpen: (open: boolean) => void;
  addToast: (type: 'success' | 'error', title: string, message?: string) => void;
  presetsState: PresetsEditorState;
};

export function MobileView(props: MobileViewProps) {
  const {
    allItems,
    usageCounts,
    recordUsage,
    desktopIcons,
    desktopFolders,
    launchpadOpen,
    setLaunchpadOpen,
    handleIOSOpenWindow,
    iosEditorWindows,
    activeIOSEditorId,
    saving,
    handleIOSVarChange,
    handleIOSAddVar,
    handleIOSDeleteVar,
    handleIOSSave,
    handleIOSMinimizeEditor,
    handleIOSCloseEditor,
    toasts,
    removeToast,
    terminalWindows,
    handleMinimizeTerminal,
    handleCloseTerminal,
    iosPresetsEditorOpen,
    setIosPresetsEditorOpen,
    addToast,
    presetsState,
  } = props;

  const topByUsage = [...allItems]
    .map(item => ({ item, count: usageCounts[`${item.type}:${item.name}`] || 0 }))
    .sort((a, b) => b.count - a.count);
  const fallback = [...allItems].sort((a, b) => getDisplayName(a.name).localeCompare(getDisplayName(b.name), 'zh-Hans-CN'));
  const pick = (arr: { item: FileItem, count?: number }[], n: number) => arr.slice(0, n).map(x => x.item);
  const selected = (topByUsage[0]?.count ? pick(topByUsage, 3) : fallback.slice(0, 3));
  const iosDockExtra = selected.map(it => ({
    id: `${it.type}-${it.name}`,
    name: getDisplayName(it.name),
    icon: getIconForType(it.name, it.type),
    onClick: () => { recordUsage(`${it.type}:${it.name}`); handleIOSOpenWindow(it); }
  }));

  // Add Presets to Dock
  iosDockExtra.push({
    id: 'ios-presets',
    name: '预设撰写',
    icon: getIconForType('agent-presets', 'module'),
    onClick: () => setIosPresetsEditorOpen(true)
  });

  return (
    <>
      <IOSHomeScreen
        icons={desktopIcons}
        folders={desktopFolders}
        onLaunch={(icon) => icon.onClick()}
        wallpaper="/wallpapers/ios-default.png"
        onLaunchpadOpen={() => setLaunchpadOpen(true)}
        dockExtra={iosDockExtra}
      />

      {terminalWindows.map(term => (
        <div key={term.id} className="ios-app-window" style={{ display: term.minimized ? 'none' : 'flex' }}>
          <div className="ios-app-header">
            <div className="ios-back-btn" onClick={() => handleMinimizeTerminal(term.id)}>
              <IoChevronBack /> Home
            </div>
            <div>{term.title}</div>
            <div style={{ color: '#ff3b30', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => handleCloseTerminal(term.id)}>
              Close
            </div>
          </div>
          <TerminalWindow processId={term.processId} />
        </div>
      ))}

      <Launchpad
        isOpen={launchpadOpen}
        onClose={() => setLaunchpadOpen(false)}
        items={allItems.map(item => ({
          name: item.name,
          type: item.type,
          onClick: () => {
            recordUsage(`${item.type}:${item.name}`);
            handleIOSOpenWindow(item);
            setLaunchpadOpen(false);
          }
        }))}
      />

      {iosEditorWindows
        .filter(win => !win.minimized)
        .map(win => (
          <div key={win.id} style={{ display: win.id === activeIOSEditorId ? 'flex' : 'none' }}>
            <IOSEditor
              appName={getDisplayName(win.file.name)}
              vars={win.editedVars}
              onUpdate={(idx, field, val) => handleIOSVarChange(win.id, idx, field, val)}
              onAdd={() => handleIOSAddVar(win.id)}
              onDelete={(idx) => handleIOSDeleteVar(win.id, idx)}
              onSave={() => handleIOSSave(win.id)}
              onMinimize={() => handleIOSMinimizeEditor(win.id)}
              onClose={() => handleIOSCloseEditor(win.id)}
              saving={saving}
              isExample={!win.file.hasEnv && win.file.hasExample}
            />
          </div>
        ))}

      {iosPresetsEditorOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2000 }}>
          <IOSPresetsEditor
            onClose={() => setIosPresetsEditorOpen(false)}
            addToast={addToast}
            state={presetsState}
          />
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}

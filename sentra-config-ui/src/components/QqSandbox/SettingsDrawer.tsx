import { Button, Drawer, InputNumber, Space, Tooltip } from 'antd';
import styles from './QqSandbox.module.css';

export function SettingsDrawer(props: {
  showDev: boolean;
  setShowDev: (v: boolean) => void;
  napcatEnvPath: string;
  streamPort: number;
  defaultStreamPort: number;
  setStreamPort: (v: number) => void;
  napcatBusy: boolean;
  onStartNapcat: () => void;
  onStopNapcat: () => void;
  onUseDefaultPort: () => void;
  onClearPortOverride: () => void;
}) {
  const {
    showDev,
    setShowDev,
    napcatEnvPath,
    streamPort,
    defaultStreamPort,
    setStreamPort,
    napcatBusy,
    onStartNapcat,
    onStopNapcat,
    onUseDefaultPort,
    onClearPortOverride,
  } = props;

  return (
    <Drawer
      title="QQ 沙盒设置"
      open={showDev}
      onClose={() => setShowDev(false)}
      size="default"
      styles={{ wrapper: { width: 420, maxWidth: '92vw' }, body: { padding: 14 }, header: { padding: '12px 14px' } }}
    >
      <div className={styles.settingsPanel}>
        <div className={styles.settingsGroup}>
          <div className={styles.settingsGroupTitle}>连接配置</div>
          <div className={styles.settingsRow}>
            <div className={styles.settingsLabel}>Stream 端口</div>
            <div className={styles.settingsControl}>
              <InputNumber
                className={styles.portInput}
                min={1}
                max={65535}
                value={Number.isFinite(streamPort) && streamPort > 0 ? streamPort : null}
                placeholder={defaultStreamPort > 0 ? String(defaultStreamPort) : 'STREAM_PORT'}
                onChange={(v) => {
                  const n = typeof v === 'number' ? v : Number(v);
                  setStreamPort(Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0);
                }}
              />
              <div className={styles.settingsHint}>
                {napcatEnvPath ? `NC沙盒 配置路径：${napcatEnvPath}` : '正在读取 NC沙盒 配置...'}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsGroupTitle}>NC沙盒</div>
          <div className={styles.settingsActionsRow}>
            <Space size={8} wrap className={styles.settingsActionsWrap}>
              <Tooltip title="启动 NC沙盒">
                <Button className={styles.settingsPrimaryBtn} type="primary" disabled={napcatBusy} onClick={onStartNapcat}>
                  启动
                </Button>
              </Tooltip>
              <Tooltip title="停止 NC沙盒">
                <Button className={styles.settingsDangerBtn} danger disabled={napcatBusy} onClick={onStopNapcat}>
                  停止
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsGroupTitle}>端口操作</div>
          <div className={styles.settingsActionsRow}>
            <Space size={8} wrap className={styles.settingsActionsWrap}>
              <Tooltip title={defaultStreamPort > 0 ? `恢复默认端口：${defaultStreamPort}` : '暂无默认端口'}>
                <Button className={styles.settingsSecondaryBtn} onClick={onUseDefaultPort} disabled={defaultStreamPort <= 0}>
                  使用默认
                </Button>
              </Tooltip>
              <Tooltip title="删除本地保存的端口覆盖（将回到默认端口）">
                <Button className={styles.settingsSecondaryBtn} onClick={onClearPortOverride}>
                  清除覆盖
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

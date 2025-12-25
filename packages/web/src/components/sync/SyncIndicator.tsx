/**
 * 同步状态指示器
 */

import { useState, useEffect } from 'react';
import { useSyncStore } from '../../stores/sync-store';
import { useI18n } from '../../i18n';
import { addSyncListener, isSyncInProgress, SyncResult } from '../../services/incremental-sync';
import styles from './SyncIndicator.module.css';

export function SyncIndicator() {
  const { t } = useI18n();
  const { status, lastSyncTime } = useSyncStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const [incrementalSyncing, setIncrementalSyncing] = useState(false);
  const [lastIncrementalSync, setLastIncrementalSync] = useState<number | null>(null);

  // 监听增量同步状态
  useEffect(() => {
    const unsubscribe = addSyncListener((result: SyncResult) => {
      setIncrementalSyncing(false);
      if (result.success) {
        setLastIncrementalSync(Date.now());
      }
    });

    // 检查初始状态
    setIncrementalSyncing(isSyncInProgress());

    return unsubscribe;
  }, []);

  const getStatusIcon = () => {
    if (incrementalSyncing) return '🔄';
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'disconnected':
        return '⚪';
      case 'offline':
        return '🔴';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusText = () => {
    if (incrementalSyncing) return t('settings.syncing');
    switch (status) {
      case 'connected':
        return t('sync.connected');
      case 'connecting':
        return t('sync.connecting');
      case 'disconnected':
        return t('sync.disconnected');
      case 'offline':
        return t('sync.offline');
      case 'error':
        return t('sync.error');
      default:
        return t('sync.unknown');
    }
  };

  const formatLastSync = () => {
    const syncTime = lastIncrementalSync || lastSyncTime;
    if (!syncTime) return t('settings.neverSynced');
    
    const now = Date.now();
    const diff = now - syncTime;
    
    if (diff < 60000) {
      return t('sync.justNow');
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} ${t('sync.minutesAgo')}`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} ${t('sync.hoursAgo')}`;
    } else {
      return new Date(syncTime).toLocaleString();
    }
  };

  return (
    <div 
      className={styles.container}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={styles.icon}>{getStatusIcon()}</span>
      <span className={styles.status}>{getStatusText()}</span>
      
      {showTooltip && (
        <div className={styles.tooltip}>
          <div className={styles.tooltipRow}>
            <span>{t('sync.status')}:</span>
            <span>{getStatusText()}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span>{t('settings.lastSync')}:</span>
            <span>{formatLastSync()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

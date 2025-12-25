/**
 * 同步状态指示器
 */

import { useEffect, useState } from 'react';
import { useSyncStore } from '../../stores/sync-store';
import { useTranslation } from 'react-i18next';
import styles from './SyncIndicator.module.css';

export function SyncIndicator() {
  const { t } = useTranslation();
  const { status, lastSyncTime } = useSyncStore();
  const [showTooltip, setShowTooltip] = useState(false);

  const getStatusIcon = () => {
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
    if (!lastSyncTime) return t('sync.neverSynced');
    
    const now = Date.now();
    const diff = now - lastSyncTime;
    
    if (diff < 60000) {
      return t('sync.justNow');
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return t('sync.minutesAgo', { count: minutes });
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return t('sync.hoursAgo', { count: hours });
    } else {
      return new Date(lastSyncTime).toLocaleString();
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
            <span>{t('sync.lastSync')}:</span>
            <span>{formatLastSync()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

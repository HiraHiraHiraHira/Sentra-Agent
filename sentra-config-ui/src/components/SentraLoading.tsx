import React from 'react';
import { Spin } from 'antd';
import styles from './SentraLoading.module.css';

export type SentraLoadingProps = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  full?: boolean;
  spinSize?: 'small' | 'default' | 'large';
  className?: string;
  style?: React.CSSProperties;
};

export function SentraLoading(props: SentraLoadingProps) {
  const {
    title = '加载中...',
    subtitle,
    compact = false,
    full = true,
    spinSize = compact ? 'default' : 'large',
    className,
    style,
  } = props;

  return (
    <div
      className={[
        styles.wrapper,
        full ? styles.full : '',
        compact ? styles.compact : '',
        className || '',
      ].filter(Boolean).join(' ')}
      style={style}
    >
      <div className={styles.inner}>
        <Spin size={spinSize} />
        {title ? <div className={styles.title}>{title}</div> : null}
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}

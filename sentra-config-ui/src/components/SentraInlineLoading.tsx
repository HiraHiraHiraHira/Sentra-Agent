import React from 'react';
import { Spin } from 'antd';

export type SentraInlineLoadingProps = {
  text?: string;
  size?: 'small' | 'default';
  style?: React.CSSProperties;
};

export function SentraInlineLoading(props: SentraInlineLoadingProps) {
  const { text = '加载中...', size = 'small', style } = props;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        textAlign: 'center',
        color: 'var(--sentra-muted-fg)',
        fontSize: 12,
        ...(style || {}),
      }}
    >
      <Spin size={size} />
      <span>{text}</span>
    </div>
  );
}

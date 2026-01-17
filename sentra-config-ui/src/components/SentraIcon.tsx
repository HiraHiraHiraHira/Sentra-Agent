import React from 'react';

export const SentraIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = 'currentColor' }) => {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        backgroundColor: color,
        WebkitMask: 'url(/icons/sentra.svg) center / contain no-repeat',
        mask: 'url(/icons/sentra.svg) center / contain no-repeat',
      }}
    />
  );
};
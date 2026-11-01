import React from 'react';
import {icons} from 'lucide-react';
import * as brands from 'simple-icons';

// "Name" → lucide icon (stroke); "brand:github" → simple-icons logo (fill).
export const Icon: React.FC<{name: string; size: number; color: string; stroke?: number}> = ({name, size, color, stroke = 2}) => {
  if (name.startsWith('brand:')) {
    const key = 'si' + name.slice(6).replace(/^./, (c) => c.toUpperCase());
    const b = (brands as Record<string, any>)[key];
    if (!b) return null;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{display: 'block'}}>
        <path d={b.path} fill={color} />
      </svg>
    );
  }
  const L = (icons as Record<string, React.FC<any>>)[name];
  return L ? <L size={size} color={color} strokeWidth={stroke} style={{display: 'block'}} /> : null;
};

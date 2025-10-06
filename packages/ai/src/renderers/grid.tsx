/**
 * Grid renderer component
 * Layout container that arranges child components in rows or columns
 */

import React from 'react';
import { Box } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { ComponentRenderer } from '../compiler/index.js';
import { Theme } from '../runtime/theme.js';

interface GridRendererProps {
  component: Extract<ComponentType, { type: 'grid' }>;
  data: any;
  theme: Theme;
}

export function GridRenderer({ component, data, theme }: GridRendererProps) {
  const { direction = 'row', gap = 1, children } = component;
  
  // Determine if we should switch to column layout for narrow terminals
  const shouldUseColumnLayout = direction === 'row' && theme.shouldUseCompactLayout();
  
  const actualDirection = shouldUseColumnLayout ? 'column' : direction;
  
  return (
    <Box 
      flexDirection={actualDirection}
      gap={gap}
    >
      {children.map((child: ComponentType, index: number) => (
        <Box key={`${child.id || index}`} flex={1}>
          <ComponentRenderer 
            component={child}
            data={data}
            theme={theme}
          />
        </Box>
      ))}
    </Box>
  );
}
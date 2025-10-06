/**
 * Stat renderer component
 * Displays single metrics with labels and units
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { evaluateJSONPath } from '../runtime/data-binding.js';
import { Theme } from '../runtime/theme.js';

interface StatRendererProps {
  component: Extract<ComponentType, { type: 'stat' }>;
  data: any;
  theme: Theme;
}

export function StatRenderer({ component, data, theme }: StatRendererProps) {
  // Extract stat value
  const value = useMemo(() => {
    try {
      const rawValue = evaluateJSONPath(data, component.value);
      
      // Format numbers nicely
      if (typeof rawValue === 'number') {
        return theme.formatNumber(rawValue);
      }
      
      return rawValue != null ? String(rawValue) : 'N/A';
    } catch (error) {
      return 'Error';
    }
  }, [data, component.value, theme]);

  // Format the display value with unit
  const displayValue = useMemo(() => {
    if (component.unit && value !== 'N/A' && value !== 'Error') {
      return `${value} ${component.unit}`;
    }
    return value;
  }, [value, component.unit]);

  return (
    <Box 
      borderStyle="single" 
      borderColor="blue" 
      padding={1}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight={5}
    >
      {/* Large value display */}
      <Box>
        <Text color="cyan" bold>
          {displayValue}
        </Text>
      </Box>
      
      {/* Label */}
      <Box marginTop={1}>
        <Text dimColor>
          {component.label}
        </Text>
      </Box>
    </Box>
  );
}
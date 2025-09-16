/**
 * Sparkline renderer component
 * Displays time series data as ASCII charts
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { extractArrayItems } from '../runtime/data-binding.js';
import { Theme } from '../runtime/theme.js';

interface SparklineRendererProps {
  component: Extract<ComponentType, { type: 'sparkline' }>;
  data: any;
  theme: Theme;
}

export function SparklineRenderer({ component, data, theme }: SparklineRendererProps) {
  // Extract sparkline data
  const values = useMemo(() => {
    try {
      const rawData = extractArrayItems(data, component.from);
      return rawData
        .map(item => typeof item === 'number' ? item : parseFloat(item))
        .filter(val => !isNaN(val));
    } catch (error) {
      return [];
    }
  }, [data, component.from]);

  // Generate ASCII sparkline
  const sparkline = useMemo(() => {
    if (values.length === 0) return 'No data';
    if (values.length === 1) return '▁';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) {
      return '▄'.repeat(Math.min(values.length, 50));
    }

    // Sparkline characters from lowest to highest
    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    
    return values.slice(0, 50).map(val => {
      const normalized = (val - min) / range;
      const charIndex = Math.floor(normalized * (chars.length - 1));
      return chars[Math.max(0, Math.min(charIndex, chars.length - 1))];
    }).join('');
  }, [values]);

  // Calculate stats
  const stats = useMemo(() => {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, trend: 'flat' };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Simple trend calculation
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    let trend = 'flat';
    if (secondAvg > firstAvg * 1.05) trend = 'up';
    else if (secondAvg < firstAvg * 0.95) trend = 'down';

    return { min, max, avg, trend };
  }, [values]);

  if (values.length === 0) {
    return (
      <Box borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>No data available for sparkline: {component.id}</Text>
      </Box>
    );
  }

  return (
    <Box 
      borderStyle="single" 
      borderColor="green" 
      padding={1}
      flexDirection="column"
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text dimColor>Sparkline ({component.id})</Text>
      </Box>

      {/* Sparkline chart */}
      <Box marginBottom={1}>
        <Text color="green">
          {sparkline}
        </Text>
      </Box>

      {/* Stats */}
      <Box justifyContent="space-between">
        <Box>
          <Text dimColor>
            Min: {theme.formatNumber(stats.min)} • 
            Max: {theme.formatNumber(stats.max)} • 
            Avg: {theme.formatNumber(stats.avg)}
          </Text>
        </Box>
        
        <Box>
          <Text color={stats.trend === 'up' ? 'green' : stats.trend === 'down' ? 'red' : 'gray'}>
            {stats.trend === 'up' ? '📈' : stats.trend === 'down' ? '📉' : '➡️'} {stats.trend}
          </Text>
        </Box>
      </Box>

      {/* Data points count */}
      <Box marginTop={1}>
        <Text dimColor>
          {values.length} data points
          {values.length > 50 && ' (showing first 50)'}
        </Text>
      </Box>
    </Box>
  );
}
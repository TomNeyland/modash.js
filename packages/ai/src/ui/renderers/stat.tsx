/**
 * Stat Renderer - Single metric display with label, value, and unit
 * 
 * Features:
 * - Large numeric display
 * - Color coding based on value ranges
 * - Unit formatting (K, M, B suffixes)
 * - Trend indicators
 * - Real-time updates for streaming
 */

import React, { useMemo, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface StatRendererProps extends RendererProps {}

export const StatRenderer: React.FC<StatRendererProps> = ({ component, context }) => {
  const { props } = component;
  const [previousValue, setPreviousValue] = useState<number | null>(null);

  // Get data from JSONPath or use direct value
  const rawValue = useMemo(() => {
    if (props.v) {
      // Direct value specified
      const numValue = parseFloat(props.v);
      return isNaN(numValue) ? props.v : numValue;
    }
    
    // Extract from data using JSONPath
    const data = evaluateJSONPath(context.data, props.f || '$');
    if (data.length === 0) return 0;
    
    // If it's an array of numbers, sum them
    if (Array.isArray(data) && data.every(d => typeof d === 'number')) {
      return data.reduce((sum, val) => sum + val, 0);
    }
    
    // If it's a single value, use it
    return data[0];
  }, [context.data, props.f, props.v]);

  // Format the value for display
  const formattedValue = useMemo(() => {
    if (typeof rawValue === 'number') {
      // Apply unit suffixes for large numbers
      if (rawValue >= 1_000_000_000) {
        return (rawValue / 1_000_000_000).toFixed(1) + 'B';
      } else if (rawValue >= 1_000_000) {
        return (rawValue / 1_000_000).toFixed(1) + 'M';
      } else if (rawValue >= 1_000) {
        return (rawValue / 1_000).toFixed(1) + 'K';
      }
      
      // Format with commas for readability
      return rawValue.toLocaleString();
    }
    
    return String(rawValue);
  }, [rawValue]);

  // Determine color based on value or trend
  const valueColor = useMemo(() => {
    if (typeof rawValue === 'number') {
      if (previousValue !== null && rawValue !== previousValue) {
        return rawValue > previousValue ? 'green' : 'red';
      }
      
      // Default color coding
      if (rawValue > 1000000) return 'green';
      if (rawValue > 100000) return 'yellow';
      if (rawValue < 0) return 'red';
    }
    
    return 'white';
  }, [rawValue, previousValue]);

  // Calculate trend indicator
  const trendIndicator = useMemo(() => {
    if (typeof rawValue === 'number' && previousValue !== null && rawValue !== previousValue) {
      const diff = rawValue - previousValue;
      const percent = Math.abs(diff / previousValue * 100);
      
      if (diff > 0) {
        return `↗ +${percent.toFixed(1)}%`;
      } else {
        return `↘ -${percent.toFixed(1)}%`;
      }
    }
    
    return null;
  }, [rawValue, previousValue]);

  // Update previous value for trend calculation
  useEffect(() => {
    if (typeof rawValue === 'number') {
      setPreviousValue(rawValue);
    }
  }, [rawValue]);

  // Auto-refresh for streaming data
  useEffect(() => {
    if (!context.isStreaming) return;
    
    const interval = setInterval(() => {
      // The useMemo dependencies will handle re-computation
    }, context.emitInterval || 100);
    
    return () => clearInterval(interval);
  }, [context.isStreaming, context.emitInterval]);

  return (
    <Box 
      flexDirection="column" 
      alignItems="center" 
      justifyContent="center"
      padding={1}
      borderStyle="round"
      borderColor="gray"
      minWidth={20}
      minHeight={5}
    >
      {/* Label */}
      {props.lb && (
        <Box marginBottom={1}>
          <Text color="gray" bold>
            {props.lb}
          </Text>
        </Box>
      )}
      
      {/* Value */}
      <Box justifyContent="center">
        <Text color={valueColor} bold>
          {formattedValue}
        </Text>
        {props.u && (
          <Text color="gray"> {props.u}</Text>
        )}
      </Box>
      
      {/* Trend indicator */}
      {trendIndicator && (
        <Box marginTop={1}>
          <Text color={trendIndicator.includes('↗') ? 'green' : 'red'}>
            {trendIndicator}
          </Text>
        </Box>
      )}
      
      {/* Additional context for streaming */}
      {context.isStreaming && (
        <Box marginTop={1}>
          <Text color="blue">●</Text>
          <Text color="gray"> live</Text>
        </Box>
      )}
    </Box>
  );
};
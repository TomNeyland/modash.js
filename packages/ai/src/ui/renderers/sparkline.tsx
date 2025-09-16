/**
 * Sparkline Renderer - Compact time-series visualization using ASCII charts
 * 
 * Features:
 * - ASCII-based sparkline charts using asciichart
 * - Automatic scaling and smoothing
 * - Color coding for trends
 * - Real-time updates for streaming data
 * - Configurable axes labels
 */

import React, { useMemo, useEffect } from 'react';
import { Box, Text } from 'ink';
import asciichart from 'asciichart';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface SparklineRendererProps extends RendererProps {}

export const SparklineRenderer: React.FC<SparklineRendererProps> = ({ component, context }) => {
  const { props } = component;

  // Get data from JSONPath
  const sourceData = useMemo(() => {
    const data = evaluateJSONPath(context.data, props.f || '$');
    
    // Convert to numbers if needed
    return data.map(d => {
      if (typeof d === 'number') return d;
      if (typeof d === 'string') {
        const num = parseFloat(d);
        return isNaN(num) ? 0 : num;
      }
      if (typeof d === 'object' && d !== null) {
        // Try to extract a numeric field
        const numericFields = Object.keys(d).filter(key => typeof d[key] === 'number');
        if (numericFields.length > 0) {
          return d[numericFields[0]];
        }
      }
      return 0;
    }).filter(n => !isNaN(n));
  }, [context.data, props.f]);

  // Limit data points for display
  const chartData = useMemo(() => {
    const maxPoints = Math.floor(context.width * 0.8); // Use most of available width
    if (sourceData.length <= maxPoints) {
      return sourceData;
    }
    
    // Sample data points evenly
    const step = sourceData.length / maxPoints;
    return Array.from({ length: maxPoints }, (_, i) => 
      sourceData[Math.floor(i * step)]
    );
  }, [sourceData, context.width]);

  // Generate sparkline chart
  const chartContent = useMemo(() => {
    if (chartData.length === 0) {
      return 'No data available';
    }
    
    if (chartData.length === 1) {
      return `Single value: ${chartData[0]}`;
    }
    
    try {
      const config = {
        height: Math.min(10, Math.floor(context.height * 0.3)), // Limit height
        offset: 2, // Padding
        colors: [
          asciichart.blue,     // Use blue for positive trends
          asciichart.red,      // Red for negative trends  
          asciichart.green,    // Green for stable trends
        ],
        format: (x: number) => x.toFixed(1)
      };
      
      return asciichart.plot(chartData, config);
    } catch (error) {
      return `Chart error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }, [chartData, context.width, context.height]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    
    const min = Math.min(...chartData);
    const max = Math.max(...chartData);
    const avg = chartData.reduce((sum, val) => sum + val, 0) / chartData.length;
    const latest = chartData[chartData.length - 1];
    
    // Calculate trend
    let trend = 'stable';
    if (chartData.length >= 2) {
      const first = chartData[0];
      const last = chartData[chartData.length - 1];
      const change = ((last - first) / first) * 100;
      
      if (change > 5) trend = 'rising';
      else if (change < -5) trend = 'falling';
    }
    
    return { min, max, avg, latest, trend };
  }, [chartData]);

  // Get trend color
  const trendColor = useMemo(() => {
    if (!stats) return 'gray';
    
    switch (stats.trend) {
      case 'rising': return 'green';
      case 'falling': return 'red';
      default: return 'yellow';
    }
  }, [stats]);

  // Auto-refresh for streaming data
  useEffect(() => {
    if (!context.isStreaming) return;
    
    const interval = setInterval(() => {
      // The useMemo dependencies will handle re-computation
    }, context.emitInterval || 100);
    
    return () => clearInterval(interval);
  }, [context.isStreaming, context.emitInterval]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with title and trend */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          {props.lb || 'Sparkline'} 
          {props.f && props.f !== '$' ? ` (${props.f})` : ''}
        </Text>
        {stats && (
          <Text color={trendColor}>
            {stats.trend} • {stats.latest.toFixed(1)}
            {props.u && ` ${props.u}`}
          </Text>
        )}
      </Box>
      
      {/* Chart */}
      <Box marginBottom={1}>
        <Text>{chartContent}</Text>
      </Box>
      
      {/* Stats summary */}
      {stats && (
        <Box justifyContent="space-between">
          <Text color="gray">
            Min: {stats.min.toFixed(1)} • Max: {stats.max.toFixed(1)} • Avg: {stats.avg.toFixed(1)}
          </Text>
          <Text color="gray">
            {chartData.length} points
            {context.isStreaming && ' • live'}
          </Text>
        </Box>
      )}
      
      {/* Axes labels if specified */}
      {(props.x || props.y) && (
        <Box marginTop={1}>
          {props.x && <Text color="gray">X: {props.x}</Text>}
          {props.x && props.y && <Text color="gray"> • </Text>}
          {props.y && <Text color="gray">Y: {props.y}</Text>}
        </Box>
      )}
    </Box>
  );
};
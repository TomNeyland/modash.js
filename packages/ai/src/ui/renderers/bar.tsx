/**
 * Bar Renderer - Horizontal bar chart using ASCII characters
 * 
 * Features:
 * - ASCII horizontal bar charts
 * - Auto-scaling based on data range
 * - Color coding for different ranges
 * - Labels and values display
 * - Configurable bar length
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface BarRendererProps extends RendererProps {}

interface BarDataPoint {
  label: string;
  value: number;
  percentage: number;
}

export const BarRenderer: React.FC<BarRendererProps> = ({ component, context }) => {
  const { props } = component;

  // Get data from JSONPath and convert to bar chart data
  const barData = useMemo(() => {
    const data = evaluateJSONPath(context.data, props.f || '$');
    
    let points: BarDataPoint[] = [];
    
    if (data.length === 0) return points;
    
    // Convert data to bar chart points
    if (typeof data[0] === 'object' && data[0] !== null) {
      // Assume object format like { label: "Category A", value: 100 }
      points = data.map(item => {
        const label = item[props.lb || 'label'] || item.name || item._id || 'Unknown';
        const value = parseFloat(item[props.v || 'value'] || item.count || item.total || 0);
        return { label: String(label), value, percentage: 0 };
      });
    } else if (typeof data[0] === 'number') {
      // Array of numbers
      points = data.map((value, index) => ({
        label: `Item ${index + 1}`,
        value,
        percentage: 0
      }));
    }
    
    // Calculate percentages
    const maxValue = Math.max(...points.map(p => p.value));
    if (maxValue > 0) {
      points.forEach(point => {
        point.percentage = (point.value / maxValue) * 100;
      });
    }
    
    // Sort by value descending for better visualization
    return points.sort((a, b) => b.value - a.value);
  }, [context.data, props.f, props.lb, props.v]);

  // Calculate bar display width
  const maxBarWidth = Math.max(20, Math.floor(context.width * 0.4));
  const maxLabelWidth = Math.max(10, Math.floor(context.width * 0.25));

  // Render individual bar
  const renderBar = (point: BarDataPoint, index: number) => {
    const barLength = Math.floor((point.percentage / 100) * maxBarWidth);
    const bar = '█'.repeat(barLength) + '░'.repeat(maxBarWidth - barLength);
    
    // Truncate label if too long
    let label = point.label;
    if (label.length > maxLabelWidth) {
      label = label.substring(0, maxLabelWidth - 3) + '...';
    }
    
    // Color based on value range
    let barColor = 'blue';
    if (point.percentage > 80) barColor = 'green';
    else if (point.percentage > 60) barColor = 'yellow';
    else if (point.percentage < 20) barColor = 'red';
    
    return (
      <Box key={index} marginBottom={0}>
        <Box width={maxLabelWidth + 2}>
          <Text>{label.padEnd(maxLabelWidth)}</Text>
        </Box>
        <Box width={maxBarWidth + 2}>
          <Text color={barColor}>{bar}</Text>
        </Box>
        <Box>
          <Text color="gray">
            {point.value.toLocaleString()}
            {props.u && ` ${props.u}`}
            {' '}({point.percentage.toFixed(1)}%)
          </Text>
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {props.lb || 'Bar Chart'}
          {props.f && props.f !== '$' ? ` (${props.f})` : ''}
        </Text>
      </Box>
      
      {/* Chart */}
      <Box flexDirection="column">
        {barData.length === 0 ? (
          <Text color="gray">No data to display</Text>
        ) : (
          barData.map(renderBar)
        )}
      </Box>
      
      {/* Footer with summary */}
      {barData.length > 0 && (
        <Box marginTop={1} justifyContent="space-between">
          <Text color="gray">
            {barData.length} categories
          </Text>
          <Text color="gray">
            Total: {barData.reduce((sum, p) => sum + p.value, 0).toLocaleString()}
            {props.u && ` ${props.u}`}
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
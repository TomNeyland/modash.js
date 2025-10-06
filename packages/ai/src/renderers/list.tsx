/**
 * List renderer component
 * Displays data as formatted list items using template interpolation
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { extractArrayItems, interpolateTemplate } from '../runtime/data-binding.js';
import { Theme } from '../runtime/theme.js';

interface ListRendererProps {
  component: Extract<ComponentType, { type: 'list' }>;
  data: any;
  theme: Theme;
}

export function ListRenderer({ component, data, theme }: ListRendererProps) {
  // Extract list data
  const items = useMemo(() => {
    try {
      return extractArrayItems(data, component.from);
    } catch (error) {
      return [];
    }
  }, [data, component.from]);

  // Process template for each item
  const listItems = useMemo(() => {
    return items.map((item, index) => {
      try {
        const rendered = interpolateTemplate(component.template, item);
        return { index, rendered, original: item };
      } catch (error) {
        return { 
          index, 
          rendered: `Error rendering item ${index}`, 
          original: item 
        };
      }
    });
  }, [items, component.template]);

  if (items.length === 0) {
    return (
      <Box borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>No data available for list: {component.id}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {listItems.map((item) => (
        <Box key={item.index} marginBottom={0}>
          <Text>• {item.rendered}</Text>
        </Box>
      ))}
      
      {/* Footer with count */}
      <Box marginTop={1}>
        <Text dimColor>
          {listItems.length} item{listItems.length !== 1 ? 's' : ''}
        </Text>
      </Box>
    </Box>
  );
}
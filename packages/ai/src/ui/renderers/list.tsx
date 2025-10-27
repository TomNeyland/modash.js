/**
 * List Renderer - Simple list display with template rows
 * 
 * Features:
 * - Template-based row rendering
 * - Cached JSONPath lookups
 * - Pagination support
 * - Scrollable content
 */

import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface ListRendererProps extends RendererProps {}

export const ListRenderer: React.FC<ListRendererProps> = ({ component, context }) => {
  const { props } = component;
  const [currentPage, setCurrentPage] = useState(0);

  // Get data from JSONPath
  const sourceData = useMemo(() => {
    return evaluateJSONPath(context.data, props.f || '$');
  }, [context.data, props.f]);

  // Pagination
  const pageSize = props.pg || 10;
  const totalPages = Math.ceil(sourceData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return sourceData.slice(start, start + pageSize);
  }, [sourceData, currentPage, pageSize]);

  // Render each list item
  const renderItem = (item: any, index: number) => {
    // Simple template - show key fields
    if (typeof item === 'object' && item !== null) {
      const keys = Object.keys(item).slice(0, 3); // Show first 3 fields
      const display = keys.map(key => `${key}: ${item[key]}`).join(', ');
      
      return (
        <Text key={index}>
          • {display}
        </Text>
      );
    }
    
    return (
      <Text key={index}>
        • {String(item)}
      </Text>
    );
  };

  // Keyboard input handling
  useInput((input, key) => {
    if (key.upArrow && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (key.downArrow && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {props.lb || 'List'}
          {props.f && props.f !== '$' ? ` (${props.f})` : ''}
        </Text>
      </Box>
      
      {/* List items */}
      <Box flexDirection="column">
        {paginatedData.length === 0 ? (
          <Text color="gray">No items to display</Text>
        ) : (
          paginatedData.map(renderItem)
        )}
      </Box>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Box marginTop={1} justifyContent="space-between">
          <Text color="gray">
            Page {currentPage + 1} of {totalPages} ({sourceData.length} total)
          </Text>
          <Text color="gray">
            ↑ ↓ to navigate
          </Text>
        </Box>
      )}
    </Box>
  );
};
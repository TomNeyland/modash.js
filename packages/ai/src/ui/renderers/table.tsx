/**
 * Table Renderer - High-performance table display with pagination and sorting
 * 
 * Features:
 * - Fast pre-rendered strings using cli-table3
 * - Numeric right-alignment
 * - Column truncation/ellipsis
 * - Responsive column dropping
 * - Pagination with stable row keys
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Table from 'cli-table3';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath, parseColumns, parseSort } from '../../uidsl/compiler.js';

export interface TableRendererProps extends RendererProps {}

export const TableRenderer: React.FC<TableRendererProps> = ({ component, context }) => {
  const { props } = component;
  const [currentPage, setCurrentPage] = useState(0);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Parse column specifications
  const columns = useMemo(() => {
    if (!props.c) {
      // Default columns - try to infer from first row
      const firstRow = context.data[0];
      if (!firstRow) return [];
      
      return Object.keys(firstRow).slice(0, 5).map(key => ({
        header: key,
        path: `$.${key}`,
        align: 'l' as const,
        width: undefined
      }));
    }
    
    return parseColumns(props.c);
  }, [props.c, context.data]);

  // Apply responsive column dropping when width is narrow
  const visibleColumns = useMemo(() => {
    if (context.width >= 120) return columns;
    if (context.width >= 80) return columns.slice(0, Math.max(3, Math.floor(columns.length * 0.7)));
    return columns.slice(0, 2); // Very narrow - only show first 2 columns
  }, [columns, context.width]);

  // Get data from JSONPath
  const sourceData = useMemo(() => {
    return evaluateJSONPath(context.data, props.f || '$');
  }, [context.data, props.f]);

  // Apply sorting
  const sortedData = useMemo(() => {
    if (!sortField) {
      // Check if component has default sort
      if (props.s) {
        const sortSpec = parseSort(props.s);
        return [...sourceData].sort((a, b) => {
          const aVal = a[sortSpec.field];
          const bVal = b[sortSpec.field];
          const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortSpec.order === 'desc' ? -result : result;
        });
      }
      return sourceData;
    }
    
    return [...sourceData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -result : result;
    });
  }, [sourceData, sortField, sortOrder, props.s]);

  // Pagination
  const pageSize = props.pg || 20;
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Render table using cli-table3 for consistent formatting
  const tableContent = useMemo(() => {
    if (paginatedData.length === 0) {
      return 'No data to display';
    }

    const table = new Table({
      head: visibleColumns.map(col => col.header),
      style: {
        head: ['cyan'],
        border: ['grey'],
        compact: context.width < 100 // More compact on narrow terminals
      },
      colWidths: visibleColumns.map(col => {
        if (col.width) return col.width;
        // Auto-calculate width based on available space
        const availableWidth = context.width - visibleColumns.length * 3 - 4; // Account for borders
        return Math.floor(availableWidth / visibleColumns.length);
      })
    });

    // Add rows
    paginatedData.forEach(row => {
      const tableRow = visibleColumns.map(col => {
        const value = evaluateJSONPath([row], col.path)[0];
        let cellContent = String(value ?? '');
        
        // Truncate if too long
        const maxCellWidth = col.width || Math.floor((context.width - 20) / visibleColumns.length);
        if (cellContent.length > maxCellWidth - 3) {
          cellContent = cellContent.substring(0, maxCellWidth - 3) + '...';
        }
        
        // Apply alignment
        if (col.align === 'r' && typeof value === 'number') {
          return cellContent.padStart(maxCellWidth);
        } else if (col.align === 'c') {
          const padding = Math.max(0, maxCellWidth - cellContent.length);
          const leftPad = Math.floor(padding / 2);
          return ' '.repeat(leftPad) + cellContent;
        }
        
        return cellContent;
      });
      
      table.push(tableRow);
    });

    return table.toString();
  }, [paginatedData, visibleColumns, context.width]);

  // Keyboard input handling
  useInput((input, key) => {
    if (key.leftArrow && currentPage > 0) {
      setCurrentPage(currentPage - 1);
    } else if (key.rightArrow && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    } else if (input >= '1' && input <= '9') {
      // Sort by column number
      const colIndex = parseInt(input, 10) - 1;
      if (colIndex < visibleColumns.length) {
        const column = visibleColumns[colIndex];
        const field = column.path.replace('$.', '');
        if (sortField === field) {
          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
          setSortField(field);
          setSortOrder('asc');
        }
      }
    }
  });

  // Auto-refresh for streaming data
  useEffect(() => {
    if (!context.isStreaming) return;
    
    const interval = setInterval(() => {
      // Force re-render by updating a state value
      setCurrentPage(prev => prev); // This triggers re-computation of memoized values
    }, context.emitInterval || 100);
    
    return () => clearInterval(interval);
  }, [context.isStreaming, context.emitInterval]);

  return (
    <Box flexDirection="column">
      {/* Table content */}
      <Box marginBottom={1}>
        <Text>{tableContent}</Text>
      </Box>
      
      {/* Pagination and controls */}
      {totalPages > 1 && (
        <Box justifyContent="space-between">
          <Text color="gray">
            Page {currentPage + 1} of {totalPages} ({sortedData.length} total)
          </Text>
          <Text color="gray">
            ← → to navigate, 1-{visibleColumns.length} to sort
          </Text>
        </Box>
      )}
      
      {/* Sort indicator */}
      {sortField && (
        <Text color="yellow">
          Sorted by: {sortField} ({sortOrder})
        </Text>
      )}
    </Box>
  );
};
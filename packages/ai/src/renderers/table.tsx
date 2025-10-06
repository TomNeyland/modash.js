/**
 * Table renderer component
 * Displays tabular data with pagination, sorting, and responsive design
 */

import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { extractArrayItems, evaluateJSONPath } from '../runtime/data-binding.js';
import { Theme } from '../runtime/theme.js';

interface TableRendererProps {
  component: Extract<ComponentType, { type: 'table' }>;
  data: any;
  theme: Theme;
}

interface TableRow {
  [key: string]: any;
}

export function TableRenderer({ component, data, theme }: TableRendererProps) {
  const [currentPage, setCurrentPage] = useState(0);
  
  // Extract table data
  const rows = useMemo(() => {
    try {
      return extractArrayItems(data, component.from) as TableRow[];
    } catch (error) {
      return [];
    }
  }, [data, component.from]);

  // Prepare columns with computed values
  const tableData = useMemo(() => {
    return rows.map((row, index) => {
      const processedRow: Record<string, any> = { _index: index };
      
      component.columns.forEach(col => {
        try {
          const value = evaluateJSONPath(row, col.path);
          processedRow[col.header] = value != null ? String(value) : '';
        } catch {
          processedRow[col.header] = '';
        }
      });
      
      return processedRow;
    });
  }, [rows, component.columns]);

  // Apply sorting if specified
  const sortedData = useMemo(() => {
    if (!component.sort) return tableData;
    
    const { path, dir } = component.sort;
    const column = component.columns.find(col => col.path === path);
    if (!column) return tableData;
    
    return [...tableData].sort((a, b) => {
      const aVal = a[column.header];
      const bVal = b[column.header];
      
      // Handle numeric values
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return dir === 'desc' ? bNum - aNum : aNum - bNum;
      }
      
      // String comparison
      const result = String(aVal).localeCompare(String(bVal));
      return dir === 'desc' ? -result : result;
    });
  }, [tableData, component.sort, component.columns]);

  // Pagination
  const pageSize = component.paginate?.size || Math.min(20, sortedData.length);
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );

  // Calculate column widths
  const terminalWidth = theme.getMaxTableWidth();
  const availableWidth = terminalWidth - (component.columns.length + 1) * 3; // borders and padding
  
  const columnWidths = component.columns.map(col => {
    if (col.width) return Math.min(col.width, availableWidth / component.columns.length);
    return Math.floor(availableWidth / component.columns.length);
  });

  if (rows.length === 0) {
    return (
      <Box borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>No data available for table: {component.id}</Text>
      </Box>
    );
  }

  const borderChars = theme.getBorderChars();

  return (
    <Box flexDirection="column">
      {/* Table Header */}
      <Box>
        <Text>
          {borderChars.topLeft}
          {component.columns.map((col, index) => {
            const width = columnWidths[index];
            const header = theme.padText(
              theme.truncateText(col.header, width), 
              width, 
              col.align || 'left'
            );
            return (
              borderChars.horizontal.repeat(width + 2) +
              (index < component.columns.length - 1 ? borderChars.topTee : '')
            );
          }).join('')}
          {borderChars.topRight}
        </Text>
      </Box>

      {/* Column Headers */}
      <Box>
        <Text>
          {borderChars.vertical}
          {component.columns.map((col, index) => {
            const width = columnWidths[index];
            const header = theme.padText(
              theme.truncateText(col.header, width), 
              width, 
              col.align || 'left'
            );
            return ` ${theme.colorize(header, 'primary')} ${borderChars.vertical}`;
          }).join('')}
        </Text>
      </Box>

      {/* Header separator */}
      <Box>
        <Text>
          {borderChars.leftTee}
          {component.columns.map((col, index) => {
            const width = columnWidths[index];
            return (
              borderChars.horizontal.repeat(width + 2) +
              (index < component.columns.length - 1 ? borderChars.cross : '')
            );
          }).join('')}
          {borderChars.rightTee}
        </Text>
      </Box>

      {/* Table Rows */}
      {paginatedData.map((row, rowIndex) => (
        <Box key={row._index}>
          <Text>
            {borderChars.vertical}
            {component.columns.map((col, colIndex) => {
              const width = columnWidths[colIndex];
              const value = theme.padText(
                theme.truncateText(row[col.header] || '', width), 
                width, 
                col.align || 'left'
              );
              return ` ${value} ${borderChars.vertical}`;
            }).join('')}
          </Text>
        </Box>
      ))}

      {/* Table Footer */}
      <Box>
        <Text>
          {borderChars.bottomLeft}
          {component.columns.map((col, index) => {
            const width = columnWidths[index];
            return (
              borderChars.horizontal.repeat(width + 2) +
              (index < component.columns.length - 1 ? borderChars.bottomTee : '')
            );
          }).join('')}
          {borderChars.bottomRight}
        </Text>
      </Box>

      {/* Pagination info */}
      {totalPages > 1 && (
        <Box marginTop={1}>
          <Text dimColor>
            Page {currentPage + 1} of {totalPages} • {sortedData.length} total rows
            {component.paginate && ' • Use ↑/↓ to navigate'}
          </Text>
        </Box>
      )}
    </Box>
  );
}
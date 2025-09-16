/**
 * JSON renderer component
 * Displays raw JSON data with syntax highlighting
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { type ComponentType } from '../specs/Plan.js';
import { evaluateJSONPath } from '../runtime/data-binding.js';
import { Theme } from '../runtime/theme.js';

interface JsonRendererProps {
  component: Extract<ComponentType, { type: 'json' }>;
  data: any;
  theme: Theme;
}

export function JsonRenderer({ component, data, theme }: JsonRendererProps) {
  // Extract JSON data
  const jsonData = useMemo(() => {
    try {
      return evaluateJSONPath(data, component.from);
    } catch (error) {
      return { error: 'Invalid path: ' + component.from };
    }
  }, [data, component.from]);

  // Format JSON based on style preference
  const formattedJson = useMemo(() => {
    const style = component.style || 'pretty';
    
    try {
      if (style === 'compact') {
        return JSON.stringify(jsonData);
      } else {
        return JSON.stringify(jsonData, null, 2);
      }
    } catch (error) {
      return 'Invalid JSON data';
    }
  }, [jsonData, component.style]);

  // Simple syntax highlighting for JSON
  const highlightedJson = useMemo(() => {
    return formattedJson.split('\n').map((line, index) => {
      // Color keys
      let coloredLine = line.replace(/"([^"]+)":/g, (match, key) => {
        return `"${theme.colorize(key, 'primary')}":`;
      });
      
      // Color string values
      coloredLine = coloredLine.replace(/: "([^"]+)"/g, (match, value) => {
        return `: "${theme.colorize(value, 'success')}"`;
      });
      
      // Color numbers
      coloredLine = coloredLine.replace(/: (\d+\.?\d*)/g, (match, num) => {
        return `: ${theme.colorize(num, 'warning')}`;
      });
      
      // Color booleans and null
      coloredLine = coloredLine.replace(/: (true|false|null)/g, (match, val) => {
        return `: ${theme.colorize(val, 'secondary')}`;
      });
      
      return { line: coloredLine, index };
    });
  }, [formattedJson, theme]);

  return (
    <Box 
      borderStyle="single" 
      borderColor="gray" 
      padding={1}
      flexDirection="column"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text dimColor>JSON Data ({component.id})</Text>
      </Box>

      {/* JSON Content */}
      <Box flexDirection="column">
        {highlightedJson.map(({ line, index }) => (
          <Box key={index}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>

      {/* Footer with data info */}
      <Box marginTop={1}>
        <Text dimColor>
          Style: {component.style || 'pretty'} • 
          Size: {formattedJson.length} chars
        </Text>
      </Box>
    </Box>
  );
}
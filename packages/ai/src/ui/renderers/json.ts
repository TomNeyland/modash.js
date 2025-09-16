/**
 * JSON Renderer - Raw JSON display with pretty/compact modes
 * 
 * Features:
 * - Pretty-printed JSON with syntax highlighting
 * - Compact mode for space efficiency
 * - Scrollable content for large datasets
 * - JSONPath filtering support
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface JsonRendererProps extends RendererProps {}

export const JsonRenderer: React.FC<JsonRendererProps> = ({ component, context }) => {
  const { props } = component;

  // Get data from JSONPath
  const sourceData = useMemo(() => {
    return evaluateJSONPath(context.data, props.f || '$');
  }, [context.data, props.f]);

  // Format JSON content
  const jsonContent = useMemo(() => {
    const style = props.st || 'json';
    const data = sourceData.length === 1 ? sourceData[0] : sourceData;
    
    if (style === 'compact') {
      return JSON.stringify(data);
    }
    
    // Pretty JSON with indentation
    return JSON.stringify(data, null, 2);
  }, [sourceData, props.st]);

  // Split into lines for better terminal rendering
  const lines = useMemo(() => {
    return jsonContent.split('\n');
  }, [jsonContent]);

  // Apply syntax highlighting to JSON
  const renderLine = (line: string, index: number) => {
    // Simple syntax highlighting
    if (line.trim().startsWith('"') && line.includes(':')) {
      // Property name
      const colonIndex = line.indexOf(':');
      const propertyPart = line.substring(0, colonIndex);
      const valuePart = line.substring(colonIndex);
      
      return (
        <Text key={index}>
          <Text color="blue">{propertyPart}</Text>
          <Text color="gray">{valuePart}</Text>
        </Text>
      );
    } else if (line.trim().match(/^".*"[,]?$/)) {
      // String value
      return (
        <Text key={index} color="green">
          {line}
        </Text>
      );
    } else if (line.trim().match(/^\d+[,]?$/)) {
      // Number value
      return (
        <Text key={index} color="yellow">
          {line}
        </Text>
      );
    } else if (line.trim().match(/^(true|false|null)[,]?$/)) {
      // Boolean/null value
      return (
        <Text key={index} color="magenta">
          {line}
        </Text>
      );
    } else {
      // Structural characters
      return (
        <Text key={index} color="gray">
          {line}
        </Text>
      );
    }
  };

  // Handle large JSON by truncating if needed
  const maxLines = Math.floor(context.height * 0.8); // Use most of terminal height
  const displayLines = lines.length > maxLines 
    ? [...lines.slice(0, maxLines - 2), '...', `(${lines.length - maxLines + 2} more lines)`]
    : lines;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          JSON Data {props.f && props.f !== '$' ? `(${props.f})` : ''}
        </Text>
        <Text color="gray"> - {sourceData.length} item{sourceData.length !== 1 ? 's' : ''}</Text>
      </Box>
      
      {/* JSON Content */}
      <Box flexDirection="column">
        {displayLines.map((line, index) => renderLine(line, index))}
      </Box>
      
      {/* Footer info */}
      {lines.length > maxLines && (
        <Box marginTop={1}>
          <Text color="yellow">
            Content truncated - showing {maxLines - 2} of {lines.length} lines
          </Text>
        </Box>
      )}
    </Box>
  );
};
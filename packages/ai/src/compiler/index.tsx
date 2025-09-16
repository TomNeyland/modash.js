/**
 * TUI Compiler - converts UISpec to Ink components
 * Main compiler that maps component specifications to React/Ink renderers
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { type UISpecType, type ComponentType } from '../specs/Plan.js';
import { Theme, createTheme } from '../runtime/theme.js';

// Import all renderers
import { TableRenderer } from '../renderers/table.js';
import { ListRenderer } from '../renderers/list.js';
import { StatRenderer } from '../renderers/stat.js';
import { JsonRenderer } from '../renderers/json.js';
import { SparklineRenderer } from '../renderers/sparkline.js';
import { GridRenderer } from '../renderers/grid.js';

interface ComponentRendererProps {
  component: ComponentType;
  data: any;
  theme: Theme;
}

export function ComponentRenderer({ component, data, theme }: ComponentRendererProps) {
  try {
    switch (component.type) {
      case 'table':
        return <TableRenderer component={component} data={data} theme={theme} />;
      
      case 'list':
        return <ListRenderer component={component} data={data} theme={theme} />;
      
      case 'stat':
        return <StatRenderer component={component} data={data} theme={theme} />;
      
      case 'json':
        return <JsonRenderer component={component} data={data} theme={theme} />;
      
      case 'sparkline':
        return <SparklineRenderer component={component} data={data} theme={theme} />;
      
      case 'grid':
        return <GridRenderer component={component} data={data} theme={theme} />;
      
      case 'cards':
      case 'tree':
      case 'barchart':
      case 'tabs':
        // Fallback to JSON for unimplemented components
        return (
          <Box borderStyle="single" borderColor="yellow" padding={1}>
            <Text color="yellow">
              Component type '{component.type}' not yet implemented
            </Text>
            <Text dimColor>Falling back to JSON display:</Text>
            <JsonRenderer 
              component={{
                type: 'json',
                id: component.id,
                from: (component as any).from || '$',
                style: 'pretty'
              }}
              data={data}
              theme={theme}
            />
          </Box>
        );
      
      default:
        return (
          <Box borderStyle="single" borderColor="red" padding={1}>
            <Text color="red">Unknown component type: {(component as any).type}</Text>
          </Box>
        );
    }
  } catch (error) {
    return (
      <Box borderStyle="single" borderColor="red" padding={1}>
        <Text color="red">Error rendering component {component.id}:</Text>
        <Text dimColor>{error instanceof Error ? error.message : 'Unknown error'}</Text>
      </Box>
    );
  }
}

interface TUIAppProps {
  uiSpec: UISpecType;
  data: any;
  onExit?: () => void;
}

export function TUIApp({ uiSpec, data, onExit }: TUIAppProps) {
  const [theme] = useState(() => createTheme(uiSpec.theme));
  const [showHelp, setShowHelp] = useState(false);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onExit?.();
    } else if (input === '?' || input === 'h') {
      setShowHelp(!showHelp);
    }
  });

  if (showHelp) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>TUI Help</Text>
        <Text>• Press 'q' or Escape to exit</Text>
        <Text>• Press '?' or 'h' to toggle this help</Text>
        {uiSpec.interactions?.enablePagination && (
          <Text>• Use arrow keys for pagination</Text>
        )}
        {uiSpec.interactions?.enableSearch && (
          <Text>• Press '/' to search</Text>
        )}
        <Text dimColor>Press any key to return...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Title */}
      {uiSpec.title && (
        <Box marginBottom={1}>
          <Text bold color="cyan">{uiSpec.title}</Text>
        </Box>
      )}
      
      {/* Main content */}
      <ComponentRenderer 
        component={uiSpec.layout}
        data={data}
        theme={theme}
      />
      
      {/* Footer with help hint */}
      <Box marginTop={1}>
        <Text dimColor>Press 'q' to exit • '?' for help</Text>
      </Box>
    </Box>
  );
}

/**
 * Compile UISpec to Ink React component
 * This is the main entry point for the TUI compiler
 */
export function compileToInk(uiSpec: UISpecType, data: any): React.ComponentType<{ onExit?: () => void }> {
  return function CompiledTUI({ onExit }: { onExit?: () => void }) {
    return <TUIApp uiSpec={uiSpec} data={data} onExit={onExit} />;
  };
}

/**
 * Validate UISpec for common issues
 */
export function validateUISpec(uiSpec: UISpecType): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic validation
  if (!uiSpec.layout) {
    errors.push('UISpec must have a layout component');
  }
  
  // Validate component tree recursively
  function validateComponent(component: ComponentType, path: string): void {
    if (!component.id) {
      errors.push(`Component at ${path} missing required 'id' field`);
    }
    
    if (!component.type) {
      errors.push(`Component at ${path} missing required 'type' field`);
    }
    
    // Type-specific validation
    switch (component.type) {
      case 'table':
        if (!component.columns || component.columns.length === 0) {
          errors.push(`Table component ${component.id} must have columns`);
        }
        break;
      
      case 'list':
        if (!component.template) {
          errors.push(`List component ${component.id} must have template`);
        }
        break;
      
      case 'grid':
        if (!component.children || component.children.length === 0) {
          errors.push(`Grid component ${component.id} must have children`);
        } else {
          component.children.forEach((child, index) => {
            validateComponent(child, `${path}.children[${index}]`);
          });
        }
        break;
    }
  }
  
  if (uiSpec.layout) {
    validateComponent(uiSpec.layout, 'layout');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
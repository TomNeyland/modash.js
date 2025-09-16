/**
 * Tree Renderer - Hierarchical data display with unicode tree characters
 * 
 * Features:
 * - Unicode tree drawing characters
 * - Collapsible/expandable nodes
 * - Recursive data structure support
 * - Pre-rendered for performance
 */

import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RendererProps } from '../../uidsl/compiler.js';
import { evaluateJSONPath } from '../../uidsl/compiler.js';

export interface TreeRendererProps extends RendererProps {}

interface TreeNode {
  label: string;
  children?: TreeNode[];
  expanded?: boolean;
  data?: any;
}

export const TreeRenderer: React.FC<TreeRendererProps> = ({ component, context }) => {
  const { props } = component;
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Get data from JSONPath and convert to tree structure
  const treeData = useMemo(() => {
    const data = evaluateJSONPath(context.data, props.f || '$');
    
    // Convert flat data to tree structure
    // This is a simple implementation - in practice might need more sophisticated grouping
    return data.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        // Create tree node from object properties
        const label = props.lb ? item[props.lb] || `Item ${index + 1}` : `Item ${index + 1}`;
        const children = Object.keys(item)
          .filter(key => key !== (props.lb || '_id'))
          .map(key => ({
            label: `${key}: ${item[key]}`,
            data: item[key]
          }));
        
        return {
          label,
          children: children.length > 0 ? children : undefined,
          data: item
        };
      }
      
      return {
        label: String(item),
        data: item
      };
    });
  }, [context.data, props.f, props.lb]);

  // Render tree with unicode characters
  const renderTree = (nodes: TreeNode[], level = 0, isLast = true, prefix = ''): React.ReactNode[] => {
    return nodes.flatMap((node, index) => {
      const isLastNode = index === nodes.length - 1;
      const nodeId = `${prefix}-${index}`;
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes.has(nodeId);
      
      // Tree drawing characters
      const connector = isLastNode ? '└─' : '├─';
      const childPrefix = prefix + (isLastNode ? '   ' : '│  ');
      
      const elements: React.ReactNode[] = [];
      
      // Render current node
      elements.push(
        <Text key={nodeId}>
          {prefix}{connector}
          {hasChildren && (
            <Text color="yellow">{isExpanded ? '▼ ' : '▶ '}</Text>
          )}
          <Text color={hasChildren ? 'cyan' : 'white'}>
            {node.label}
          </Text>
        </Text>
      );
      
      // Render children if expanded
      if (hasChildren && isExpanded && node.children) {
        elements.push(
          ...renderTree(node.children, level + 1, isLastNode, childPrefix)
        );
      }
      
      return elements;
    });
  };

  // Handle keyboard input for expand/collapse
  useInput((input, key) => {
    if (input === ' ' || key.return) {
      // Toggle expansion of first expandable node (simplified)
      // In a full implementation, would track focus/selection
      const firstExpandableId = '0';
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(firstExpandableId)) {
          newSet.delete(firstExpandableId);
        } else {
          newSet.add(firstExpandableId);
        }
        return newSet;
      });
    }
  });

  // Auto-expand first level by default
  React.useEffect(() => {
    const firstLevelIds = treeData.map((_, index) => String(index));
    setExpandedNodes(new Set(firstLevelIds));
  }, [treeData]);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {props.lb || 'Tree'}
          {props.f && props.f !== '$' ? ` (${props.f})` : ''}
        </Text>
      </Box>
      
      {/* Tree content */}
      <Box flexDirection="column">
        {treeData.length === 0 ? (
          <Text color="gray">No data to display</Text>
        ) : (
          renderTree(treeData)
        )}
      </Box>
      
      {/* Controls hint */}
      <Box marginTop={1}>
        <Text color="gray">
          Space/Enter to expand/collapse
        </Text>
      </Box>
    </Box>
  );
};
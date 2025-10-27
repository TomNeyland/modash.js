/**
 * Main TUI Application - Renders UIDSL components with streaming support
 * 
 * This is the main React Ink application that:
 * - Takes a structured plan (pipeline + UIDSL)
 * - Executes the pipeline against data
 * - Renders the UIDSL with live updates
 * - Handles errors gracefully with inline error panels
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, render } from 'ink';
import type { Document } from 'aggo';
import { parseUIDSLSafe } from './uidsl/parser.js';
import { compileUIDSL, getTerminalDimensions } from './uidsl/compiler.js';
import { executePipelineString } from './engine/run_pipeline.js';
import type { StructuredPlan } from './plan.zod.js';

export interface TUIAppProps {
  plan: StructuredPlan;
  data: Document[];
  onExit?: () => void;
}

export interface TUIAppState {
  loading: boolean;
  results: Document[];
  error: string | null;
  executing: boolean;
  lastUpdate: Date;
}

const ErrorPanel: React.FC<{ error: string; onDismiss?: () => void }> = ({ error, onDismiss }) => (
  <Box 
    borderStyle="round" 
    borderColor="red" 
    padding={1} 
    marginBottom={1}
  >
    <Box flexDirection="column">
      <Text color="red" bold>⚠️ Error</Text>
      <Text color="red" wrap="wrap">{error}</Text>
      {onDismiss && (
        <Text color="gray" marginTop={1}>
          Press 'r' to retry or 'q' to quit
        </Text>
      )}
    </Box>
  </Box>
);

const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(prev => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <Text color="blue">{frames[frame]} {message}</Text>
    </Box>
  );
};

export const TUIApp: React.FC<TUIAppProps> = ({ plan, data, onExit }) => {
  const [state, setState] = useState<TUIAppState>({
    loading: true,
    results: [],
    error: null,
    executing: false,
    lastUpdate: new Date()
  });

  // Execute pipeline and handle streaming
  useEffect(() => {
    let mounted = true;
    let streamingInterval: NodeJS.Timeout | null = null;

    const executePipeline = async () => {
      setState(prev => ({ ...prev, loading: true, error: null, executing: true }));

      try {
        const result = await executePipelineString(plan.q, data, {
          windowing: plan.w,
          onUpdate: (results) => {
            if (mounted) {
              setState(prev => ({ 
                ...prev, 
                results, 
                lastUpdate: new Date() 
              }));
            }
          },
          onError: (error) => {
            if (mounted) {
              setState(prev => ({ 
                ...prev, 
                error: error.message || 'Pipeline execution failed',
                executing: false 
              }));
            }
          }
        });

        if (mounted && result.success && result.results) {
          setState(prev => ({
            ...prev,
            loading: false,
            results: result.results!,
            executing: false,
            lastUpdate: new Date()
          }));
        } else if (mounted && !result.success) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: result.error?.message || 'Pipeline execution failed',
            executing: false
          }));
        }
      } catch (error) {
        if (mounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            executing: false
          }));
        }
      }
    };

    // Start execution
    executePipeline();

    // Set up streaming updates if configured
    if (plan.w?.mode === 'u' && plan.w.emitMs) {
      streamingInterval = setInterval(() => {
        if (mounted && !state.error && state.executing) {
          executePipeline();
        }
      }, plan.w.emitMs);
    }

    return () => {
      mounted = false;
      if (streamingInterval) {
        clearInterval(streamingInterval);
      }
    };
  }, [plan.q, plan.w, data]);

  // Parse UIDSL and compile to components
  const uiComponent = React.useMemo(() => {
    if (state.error && !state.results.length) {
      // Show error state - try to show pipeline error inline
      return (
        <Box flexDirection="column">
          <ErrorPanel error={state.error} />
          {/* Try to show raw JSON as fallback */}
          <Box borderStyle="single" padding={1}>
            <Text color="gray">Raw data ({data.length} items):</Text>
            <Text>{JSON.stringify(data.slice(0, 3), null, 2)}</Text>
            {data.length > 3 && <Text color="gray">... and {data.length - 3} more</Text>}
          </Box>
        </Box>
      );
    }

    try {
      const ast = parseUIDSLSafe(plan.ui);
      const dimensions = getTerminalDimensions();
      const streaming = {
        isStreaming: plan.w?.mode === 'u' || false,
        emitInterval: plan.w?.emitMs
      };

      return compileUIDSL(ast, state.results, dimensions, streaming);
    } catch (error) {
      return (
        <Box flexDirection="column">
          <ErrorPanel 
            error={`UIDSL compilation failed: ${error instanceof Error ? error.message : error}`} 
          />
          <Text color="gray">Falling back to JSON view...</Text>
          <Text>{JSON.stringify(state.results.slice(0, 10), null, 2)}</Text>
        </Box>
      );
    }
  }, [plan.ui, state.results, state.error, data, plan.w]);

  // Handle keyboard input
  React.useEffect(() => {
    const handleKeyPress = (str: string, key: any) => {
      if (key?.name === 'q' || (key?.ctrl && key?.name === 'c')) {
        if (onExit) onExit();
        else process.exit(0);
      } else if (key?.name === 'r' && state.error) {
        // Retry on error
        setState(prev => ({ ...prev, error: null, loading: true }));
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.on('keypress', handleKeyPress);

      return () => {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          process.stdin.off('keypress', handleKeyPress);
        }
      };
    }
  }, [state.error, onExit]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with status */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          🚀 Aggo TUI {plan.w?.mode === 'u' ? '(Live)' : '(Static)'}
        </Text>
        <Text color="gray">
          {state.loading && <LoadingSpinner message="Executing pipeline..." />}
          {state.executing && plan.w?.mode === 'u' && (
            <Text color="blue">● Streaming</Text>
          )}
          {state.results.length > 0 && (
            <Text>
              {state.results.length} results • Updated {state.lastUpdate.toLocaleTimeString()}
            </Text>
          )}
        </Text>
      </Box>

      {/* Main content */}
      <Box flexGrow={1}>
        {state.loading && !state.results.length ? (
          <Box justifyContent="center" alignItems="center" minHeight={10}>
            <LoadingSpinner message="Executing MongoDB pipeline..." />
          </Box>
        ) : (
          uiComponent
        )}
      </Box>

      {/* Footer with help */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text color="gray" wrap="wrap">
          Pipeline: {plan.q.slice(0, 100)}{plan.q.length > 100 ? '...' : ''} • 
          UI: {plan.ui} • 
          Press 'q' to quit{state.error ? ', r to retry' : ''}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Render TUI app to terminal
 */
export function renderTUIApp(plan: StructuredPlan, data: Document[]) {
  const { rerender, unmount } = render(
    <TUIApp 
      plan={plan} 
      data={data} 
      onExit={() => {
        unmount();
        process.exit(0);
      }}
    />
  );

  return { rerender, unmount };
}
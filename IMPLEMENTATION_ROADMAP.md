# Charting Library Integration - Implementation Roadmap

## Executive Summary

This document provides a concrete implementation roadmap for integrating Modash.js with modern charting libraries. Based on the analysis in `CHARTING_INTEGRATION.md` and the working examples in the `examples/` directory, we recommend a phased approach that balances functionality, maintainability, and developer experience.

## Phase 1: Core Data Formatters (Recommended for v0.9.0)

### Implementation: Lightweight Core Helpers

Add the following to the main Modash package without increasing bundle size significantly:

```javascript
// In src/modash/chart-formatters.js
export const ChartFormatters = {
  /**
   * Convert aggregated data to key-value pairs
   * Universal format that works with most charting libraries
   */
  toKeyValue(aggregatedData, options = {}) {
    const keyExtractor = options.keyExtractor || (d => d._id);
    const valueExtractor = options.valueExtractor || (d => d.value);
    
    return aggregatedData.map(item => ({
      key: keyExtractor(item),
      value: valueExtractor(item),
      ...options.additionalFields
    }));
  },

  /**
   * Convert to labeled dataset format (Chart.js compatible)
   */
  toLabeledDataset(aggregatedData, options = {}) {
    const labelExtractor = options.labelExtractor || (d => d._id);
    const valueExtractor = options.valueExtractor || (d => d.value);
    
    return {
      labels: aggregatedData.map(labelExtractor),
      data: aggregatedData.map(valueExtractor)
    };
  },

  /**
   * Convert to time series format (D3.js/Observable Plot compatible)
   */
  toTimeSeries(aggregatedData, options = {}) {
    const timeExtractor = options.timeExtractor || (d => new Date(d._id));
    const valueExtractor = options.valueExtractor || (d => d.value);
    
    return aggregatedData.map(item => ({
      time: timeExtractor(item),
      value: valueExtractor(item)
    }));
  },

  /**
   * Convert to tidy format (Observable Plot preferred format)
   */
  toTidyFormat(groupedData, valueFields, options = {}) {
    const tidyData = [];
    const keyField = options.keyField || '_id';
    
    groupedData.forEach(group => {
      valueFields.forEach(field => {
        tidyData.push({
          [options.categoryName || 'category']: group[keyField],
          [options.metricName || 'metric']: field,
          [options.valueName || 'value']: group[field]
        });
      });
    });
    
    return tidyData;
  }
};
```

### Integration with Main Package

```javascript
// In src/modash/index.js
import { ChartFormatters } from './chart-formatters.js';

const Modash = {
  aggregate,
  count,
  $expression,
  // ... existing exports
  ChartFormatters // Add chart formatters
};

export { ChartFormatters }; // Named export
```

### Developer Experience

```javascript
import Modash, { ChartFormatters } from 'modash';

// 1. Aggregate data with Modash
const salesData = Modash.aggregate(rawData, [
  { $group: { _id: '$category', total: { $sum: '$revenue' } } },
  { $sort: { total: -1 } }
]);

// 2. Format for any chart library
const chartJsFormat = ChartFormatters.toLabeledDataset(salesData);
const d3Format = ChartFormatters.toKeyValue(salesData);
const plotFormat = ChartFormatters.toTidyFormat(salesData, ['total']);
```

## Phase 2: Official Adapter Packages (v0.10.0)

### Package Architecture

Create focused packages under `@modash/` namespace:

#### @modash/chartjs
```javascript
// Full Chart.js integration with helper classes
export class ModashChartJS {
  static timeSeries(data, pipeline, options) {
    const aggregated = Modash.aggregate(data, pipeline);
    return {
      type: 'line',
      data: ChartFormatters.toLabeledDataset(aggregated, options),
      options: this.getDefaultOptions('timeSeries', options)
    };
  }
  
  static categorical(data, pipeline, options) { /* ... */ }
  static multiDataset(data, pipeline, options) { /* ... */ }
}
```

#### @modash/d3
```javascript
// D3.js utilities and helper functions
export class ModashD3 {
  static timeSeries(data, pipeline, options) {
    return Modash.aggregate(data, pipeline).map(d => ({
      date: options.dateExtractor(d),
      value: options.valueExtractor(d)
    }));
  }
  
  static hierarchy(data, pipeline, options) { /* ... */ }
  static network(data, pipeline, options) { /* ... */ }
  static geographic(data, pipeline, options) { /* ... */ }
}
```

#### @modash/plot
```javascript
// Observable Plot integration
export class ModashPlot {
  static line(data, pipeline, options) {
    const aggregated = Modash.aggregate(data, pipeline);
    const tidyData = ChartFormatters.toTidyFormat(aggregated, options.valueFields);
    
    return Plot.plot({
      marks: [Plot.line(tidyData, options.markOptions)],
      ...options.plotOptions
    });
  }
}
```

### Installation & Usage

```bash
# Install core package
npm install modash

# Install specific adapters as needed
npm install @modash/chartjs
npm install @modash/d3
npm install @modash/plot
```

```javascript
// Usage
import Modash from 'modash';
import { ModashChartJS } from '@modash/chartjs';

const chartConfig = ModashChartJS.timeSeries(data, pipeline, options);
```

## Phase 3: Advanced Features (v0.11.0+)

### Real-time Data Streaming
```javascript
// Streaming support for live dashboards
export class ModashStream {
  static async streamingChart(dataStream, pipeline, chartType, options) {
    for await (const chunk of dataStream) {
      const processed = Modash.aggregate(chunk, pipeline);
      yield this.updateChart(processed, chartType, options);
    }
  }
}
```

### Framework Integrations
```javascript
// React hooks
export function useModashChart(data, pipeline, chartOptions) {
  return useMemo(() => 
    ModashChartJS.timeSeries(data, pipeline, chartOptions),
    [data, pipeline, chartOptions]
  );
}

// Vue composables
export function useModashChart(data, pipeline, options) {
  return computed(() => 
    ModashChartJS.categorical(data.value, pipeline, options)
  );
}
```

## Implementation Details

### Bundle Size Impact

**Phase 1 (Core Formatters)**: +2KB gzipped
- Lightweight utility functions
- No external dependencies
- Tree-shakable exports

**Phase 2 (Adapters)**: 0KB impact on core
- Separate packages
- Optional dependencies
- User chooses what to install

### TypeScript Support

```typescript
// Full type safety throughout
interface ChartConfig<T = any> {
  type: string;
  data: ChartData<T>;
  options?: ChartOptions;
}

class ModashChartJS {
  static timeSeries<T extends Record<string, any>>(
    data: T[],
    pipeline: Pipeline,
    options?: TimeSeriesOptions
  ): ChartConfig<number>;
}
```

### Performance Considerations

1. **Lazy Loading**: Chart libraries loaded only when needed
2. **Memoization**: Cache aggregation results for repeated chart updates
3. **Streaming**: Progressive rendering for large datasets
4. **Web Workers**: Offload heavy aggregations

### Testing Strategy

```javascript
// Comprehensive test coverage
describe('@modash/chartjs', () => {
  it('should generate valid Chart.js config', () => {
    const config = ModashChartJS.timeSeries(testData, pipeline);
    expect(config).toMatchChartJsSchema();
  });
  
  it('should handle edge cases gracefully', () => {
    const config = ModashChartJS.timeSeries([], pipeline);
    expect(config.data.datasets[0].data).toEqual([]);
  });
});
```

## Documentation Strategy

### 1. Interactive Examples
- Live CodeSandbox examples
- Real dataset demonstrations
- Performance benchmarks

### 2. Recipe Collection
```markdown
# Chart Recipes

## Time Series Line Chart
```javascript
// Recipe: Daily revenue over time
const config = ModashChartJS.timeSeries(sales, [
  { $project: { date: '$date', revenue: { $multiply: ['$price', '$quantity'] } } },
  { $group: { _id: '$date', total: { $sum: '$revenue' } } },
  { $sort: { _id: 1 } }
], { title: 'Daily Revenue' });
```

### 3. Migration Guides
- Upgrading between versions
- Converting from other libraries
- Best practices

## Success Metrics

### Adoption Metrics
- Downloads of adapter packages
- GitHub stars and community engagement
- Usage in production applications

### Performance Metrics
- Bundle size optimization
- Rendering performance benchmarks
- Memory usage analysis

### Developer Experience
- Time to first chart
- API satisfaction surveys
- Documentation effectiveness

## Risk Mitigation

### Maintenance Burden
- **Risk**: Multiple packages to maintain
- **Mitigation**: Shared tooling, automated testing, community contributions

### Version Compatibility
- **Risk**: Chart library version mismatches
- **Mitigation**: Clear compatibility matrix, automated compatibility testing

### Adoption Challenges
- **Risk**: Developers stick with direct integrations
- **Mitigation**: Superior DX, performance benefits, comprehensive examples

## Timeline

### Month 1: Core Formatters
- [ ] Implement ChartFormatters utilities
- [ ] Add to main package with tests
- [ ] Update documentation

### Month 2-3: First Adapters
- [ ] Create @modash/chartjs package
- [ ] Create @modash/d3 package  
- [ ] Comprehensive examples and docs

### Month 4-6: Ecosystem Growth
- [ ] @modash/plot and @modash/vega packages
- [ ] Framework integrations (React, Vue)
- [ ] Community plugin guidelines

### Month 6+: Advanced Features
- [ ] Real-time streaming support
- [ ] Performance optimizations
- [ ] Interactive dashboard templates

## Conclusion

This roadmap provides a clear path to making Modash.js the go-to library for data aggregation and visualization in modern web applications. By starting with lightweight core utilities and expanding to comprehensive adapter packages, we can serve both simple and complex use cases while maintaining the library's focus and quality.

The phased approach minimizes risk while maximizing value for users, positioning Modash.js as an essential tool in the 2025 data visualization ecosystem.
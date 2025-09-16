# @aggo/rxjs

RxJS integration for aggo.js - Reactive aggregation pipelines for modern web applications.

## Installation

```bash
npm install aggo @aggo/rxjs rxjs
```

Note: This package requires both `aggo` and `rxjs` as peer dependencies.

## Features

- 🔄 **Reactive Aggregation**: Transform Observable streams through aggo pipelines
- 📊 **Real-time Analytics**: Build reactive dashboards with live data updates  
- 🚀 **Streaming Processing**: Handle continuous data streams with incremental aggregation
- 🎯 **Framework Agnostic**: Works with Angular, React + RxJS, Vue, and vanilla applications
- 📦 **Zero Dependencies**: Only peer dependencies on aggo and RxJS

## Quick Start

```typescript
import { from } from 'rxjs';
import { aggregate } from '@aggo/rxjs';

// Stream of user events
const events$ = from([
  { user: 'alice', action: 'login', timestamp: Date.now() },
  { user: 'bob', action: 'purchase', amount: 99.99 },
  { user: 'alice', action: 'logout', timestamp: Date.now() }
]);

// Aggregate events in real-time
const summary$ = aggregate(events$, [
  { $match: { action: { $ne: 'logout' } } },
  { $group: { 
    _id: '$user', 
    actions: { $sum: 1 },
    totalSpent: { $sum: { $ifNull: ['$amount', 0] } }
  }}
]);

summary$.subscribe(result => {
  console.log('User Activity:', result);
});
```

## API Reference

### `aggregate(source$, pipeline, options?)`

Transform an Observable stream through a aggo aggregation pipeline.

```typescript
const results$ = aggregate(documents$, [
  { $match: { status: 'active' } },
  { $project: { name: 1, score: 1 } }
], {
  incremental: true,    // Process incrementally
  distinctOnly: true    // Only emit distinct results
});
```

### `streamingAggregate(source$, pipeline, options?)`

Accumulate documents over time and emit updated aggregation results.

```typescript
const stats$ = streamingAggregate(sensorData$, [
  { $group: { 
    _id: null, 
    avgTemp: { $avg: '$temperature' },
    count: { $sum: 1 }
  }}
]);
```

### `reactiveAggregation(source$, pipeline)`

React to changes in data collections with automatic re-aggregation.

```typescript
const dashboard$ = reactiveAggregation(dataSubject$, [
  { $group: { _id: '$category', sales: { $sum: '$amount' } } },
  { $sort: { sales: -1 } },
  { $limit: 10 }
]);
```

## Use Cases

### Real-Time Dashboard

```typescript
import { BehaviorSubject, interval } from 'rxjs';
import { reactiveAggregation } from '@aggo/rxjs';

const salesData = new BehaviorSubject([
  { product: 'laptop', amount: 999, region: 'US' },
  { product: 'mouse', amount: 29, region: 'EU' }
]);

const topProducts$ = reactiveAggregation(salesData, [
  { $group: { _id: '$product', totalSales: { $sum: '$amount' } } },
  { $sort: { totalSales: -1 } },
  { $limit: 5 }
]);

// Update data every 5 seconds
interval(5000).subscribe(() => {
  const newSale = {
    product: ['laptop', 'mouse', 'keyboard'][Math.floor(Math.random() * 3)],
    amount: Math.floor(Math.random() * 1000),
    region: ['US', 'EU', 'ASIA'][Math.floor(Math.random() * 3)]
  };
  
  salesData.next([...salesData.value, newSale]);
});
```

### Angular Component Integration

```typescript
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { streamingAggregate } from '@aggo/rxjs';

@Component({
  template: `
    <div *ngFor="let metric of metrics$ | async">
      {{ metric.category }}: {{ metric.average | number:'1.2-2' }}
    </div>
  `
})
export class MetricsComponent {
  metrics$: Observable<any[]>;

  constructor(private dataService: DataService) {
    this.metrics$ = streamingAggregate(
      this.dataService.getMetricStream(),
      [
        { $group: { 
          _id: '$category', 
          average: { $avg: '$value' },
          count: { $sum: 1 }
        }},
        { $sort: { average: -1 } }
      ]
    );
  }
}
```

### WebSocket Data Processing

```typescript
import { webSocket } from 'rxjs/webSocket';
import { aggregate } from '@aggo/rxjs';

const ws$ = webSocket('ws://localhost:8080/data');

const processedData$ = aggregate(ws$, [
  { $match: { type: 'sensor_reading' } },
  { $addFields: { 
    processedAt: new Date(),
    valueCategory: { 
      $cond: [
        { $gte: ['$value', 80] }, 'high',
        { $cond: [{ $gte: ['$value', 50] }, 'medium', 'low'] }
      ]
    }
  }},
  { $group: { 
    _id: '$sensor_id',
    latestValue: { $last: '$value' },
    avgValue: { $avg: '$value' },
    category: { $last: '$valueCategory' }
  }}
]);
```

## Options

```typescript
interface ReactiveAggregationOptions {
  incremental?: boolean;    // Accumulate documents over time
  debounceMs?: number;      // Debounce emissions (not yet implemented)
  batchSize?: number;       // Maximum accumulator size
  distinctOnly?: boolean;   // Only emit when results change
}
```

## Framework Integration Examples

### React with RxJS

```jsx
import { useObservable } from 'rxjs-hooks';
import { aggregate } from '@aggo/rxjs';

function SalesChart({ dataStream$ }) {
  const chartData = useObservable(() => 
    aggregate(dataStream$, [
      { $group: { _id: '$month', sales: { $sum: '$amount' } } },
      { $sort: { _id: 1 } }
    ]),
    []
  );

  return <Chart data={chartData} />;
}
```

### Vue 3 Composition API

```vue
<template>
  <div v-for="item in aggregatedData" :key="item._id">
    {{ item._id }}: {{ item.count }}
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useObservable } from '@vueuse/rxjs';
import { streamingAggregate } from '@aggo/rxjs';

const dataStream$ = /* your observable */;
const aggregatedData = useObservable(
  streamingAggregate(dataStream$, [
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ])
);
</script>
```

## Performance Tips

1. **Use `distinctOnly: true`** (default) to avoid unnecessary re-renders
2. **Set appropriate `batchSize`** for streaming aggregations to control memory usage  
3. **Consider incremental processing** for large datasets
4. **Combine with RxJS operators** like `debounceTime()` for high-frequency updates

## License

MIT - Same as aggo.js core
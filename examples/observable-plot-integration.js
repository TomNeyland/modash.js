/**
 * Observable Plot Integration Example
 * Demonstrates how Modash.js can prepare data for Observable Plot visualizations
 * Observable Plot expects "tidy" data (one observation per row)
 */

import Modash from '../src/modash/index.js';

// Sample social media analytics data
const socialMediaData = [
  {
    timestamp: new Date('2024-01-15T09:00:00'),
    platform: 'twitter',
    metric: 'likes',
    value: 150,
    userId: 'user1',
    hashtag: 'javascript',
  },
  {
    timestamp: new Date('2024-01-15T09:00:00'),
    platform: 'twitter',
    metric: 'shares',
    value: 25,
    userId: 'user1',
    hashtag: 'javascript',
  },
  {
    timestamp: new Date('2024-01-15T10:00:00'),
    platform: 'twitter',
    metric: 'likes',
    value: 200,
    userId: 'user1',
    hashtag: 'javascript',
  },
  {
    timestamp: new Date('2024-01-15T10:00:00'),
    platform: 'twitter',
    metric: 'shares',
    value: 35,
    userId: 'user1',
    hashtag: 'javascript',
  },
  {
    timestamp: new Date('2024-01-15T09:00:00'),
    platform: 'linkedin',
    metric: 'likes',
    value: 80,
    userId: 'user2',
    hashtag: 'webdev',
  },
  {
    timestamp: new Date('2024-01-15T09:00:00'),
    platform: 'linkedin',
    metric: 'shares',
    value: 15,
    userId: 'user2',
    hashtag: 'webdev',
  },
  {
    timestamp: new Date('2024-01-15T11:00:00'),
    platform: 'twitter',
    metric: 'likes',
    value: 300,
    userId: 'user3',
    hashtag: 'react',
  },
  {
    timestamp: new Date('2024-01-15T11:00:00'),
    platform: 'twitter',
    metric: 'shares',
    value: 50,
    userId: 'user3',
    hashtag: 'react',
  },
  {
    timestamp: new Date('2024-01-15T12:00:00'),
    platform: 'linkedin',
    metric: 'likes',
    value: 120,
    userId: 'user4',
    hashtag: 'typescript',
  },
  {
    timestamp: new Date('2024-01-15T12:00:00'),
    platform: 'linkedin',
    metric: 'shares',
    value: 20,
    userId: 'user4',
    hashtag: 'typescript',
  },
];

console.log('📊 Observable Plot Integration Examples with Modash.js\n');

// =========================================
// 1. TIME SERIES - ENGAGEMENT OVER TIME
// =========================================
console.log('📈 Time Series: Platform Engagement Over Time');

// Aggregate data for time series visualization
const timeSeriesData = Modash.aggregate(socialMediaData, [
  {
    $group: {
      _id: {
        hour: { $hour: '$timestamp' },
        platform: '$platform',
      },
      totalLikes: {
        $sum: {
          $cond: [{ $eq: ['$metric', 'likes'] }, '$value', 0],
        },
      },
      totalShares: {
        $sum: {
          $cond: [{ $eq: ['$metric', 'shares'] }, '$value', 0],
        },
      },
    },
  },
  {
    $project: {
      hour: '$_id.hour',
      platform: '$_id.platform',
      likes: '$totalLikes',
      shares: '$totalShares',
      _id: 0,
    },
  },
  { $sort: { hour: 1, platform: 1 } },
]);

// Transform for Observable Plot (tidy format)
function toObservablePlotTimeSeries(data) {
  // Convert to long format - one observation per row
  const tidyData = [];

  data.forEach(d => {
    tidyData.push({
      hour: d.hour,
      platform: d.platform,
      metric: 'likes',
      value: d.likes,
    });
    tidyData.push({
      hour: d.hour,
      platform: d.platform,
      metric: 'shares',
      value: d.shares,
    });
  });

  return tidyData;
}

const plotTimeSeriesData = toObservablePlotTimeSeries(timeSeriesData);
console.log(
  'Observable Plot Time Series Data (tidy format):',
  JSON.stringify(plotTimeSeriesData, null, 2)
);

// Observable Plot configuration
const timeSeriesPlotConfig = {
  marks: [
    // Line for each platform and metric combination
    {
      type: 'line',
      data: plotTimeSeriesData,
      x: 'hour',
      y: 'value',
      stroke: 'platform',
      strokeDasharray: 'metric',
      tip: true,
    },
    // Points for clarity
    {
      type: 'dot',
      data: plotTimeSeriesData,
      x: 'hour',
      y: 'value',
      fill: 'platform',
      stroke: 'white',
    },
  ],
  x: { label: 'Hour of Day' },
  y: { label: 'Engagement Count' },
  color: { legend: true },
  title: 'Social Media Engagement by Platform and Hour',
};

console.log(
  'Observable Plot Config:',
  JSON.stringify(timeSeriesPlotConfig, null, 2)
);

// =========================================
// 2. FACETED BAR CHART - HASHTAG PERFORMANCE
// =========================================
console.log('\n📊 Faceted Bar Chart: Hashtag Performance by Platform');

const hashtagData = Modash.aggregate(socialMediaData, [
  {
    $group: {
      _id: {
        hashtag: '$hashtag',
        platform: '$platform',
      },
      totalEngagement: { $sum: '$value' },
      avgEngagement: { $avg: '$value' },
      postCount: { $sum: 1 },
    },
  },
  {
    $project: {
      hashtag: '$_id.hashtag',
      platform: '$_id.platform',
      totalEngagement: 1,
      avgEngagement: { $round: ['$avgEngagement', 1] },
      postCount: 1,
      _id: 0,
    },
  },
]);

console.log('Hashtag Performance Data:', JSON.stringify(hashtagData, null, 2));

const hashtagPlotConfig = {
  marks: [
    {
      type: 'barY',
      data: hashtagData,
      x: 'hashtag',
      y: 'totalEngagement',
      fill: 'platform',
      tip: true,
    },
  ],
  fx: 'platform', // Facet by platform
  x: { label: 'Hashtag' },
  y: { label: 'Total Engagement' },
  color: { legend: true },
  title: 'Hashtag Performance by Platform',
};

console.log('Hashtag Plot Config:', JSON.stringify(hashtagPlotConfig, null, 2));

// =========================================
// 3. SCATTER PLOT - ENGAGEMENT CORRELATION
// =========================================
console.log('\n🔍 Scatter Plot: Likes vs Shares Correlation');

// Pivot data to get likes and shares for same posts
const correlationData = Modash.aggregate(socialMediaData, [
  {
    $group: {
      _id: {
        userId: '$userId',
        timestamp: '$timestamp',
        platform: '$platform',
        hashtag: '$hashtag',
      },
      likes: {
        $sum: {
          $cond: [{ $eq: ['$metric', 'likes'] }, '$value', 0],
        },
      },
      shares: {
        $sum: {
          $cond: [{ $eq: ['$metric', 'shares'] }, '$value', 0],
        },
      },
    },
  },
  {
    $project: {
      userId: '$_id.userId',
      platform: '$_id.platform',
      hashtag: '$_id.hashtag',
      likes: 1,
      shares: 1,
      engagementRate: {
        $cond: [{ $gt: ['$likes', 0] }, { $divide: ['$shares', '$likes'] }, 0],
      },
      _id: 0,
    },
  },
]);

console.log('Correlation Data:', JSON.stringify(correlationData, null, 2));

const scatterPlotConfig = {
  marks: [
    {
      type: 'dot',
      data: correlationData,
      x: 'likes',
      y: 'shares',
      fill: 'platform',
      r: 'engagementRate',
      tip: true,
    },
    // Add regression line
    {
      type: 'linearRegression',
      data: correlationData,
      x: 'likes',
      y: 'shares',
      stroke: 'red',
      strokeDasharray: '5,5',
    },
  ],
  x: { label: 'Likes' },
  y: { label: 'Shares' },
  r: { label: 'Engagement Rate', legend: true },
  color: { legend: true },
  title: 'Likes vs Shares Correlation by Platform',
};

console.log('Scatter Plot Config:', JSON.stringify(scatterPlotConfig, null, 2));

// =========================================
// 4. HEATMAP - PLATFORM ACTIVITY PATTERNS
// =========================================
console.log('\n🔥 Heatmap: Platform Activity Patterns');

const heatmapData = Modash.aggregate(socialMediaData, [
  {
    $project: {
      hour: { $hour: '$timestamp' },
      platform: '$platform',
      metric: '$metric',
      value: '$value',
    },
  },
  {
    $group: {
      _id: {
        hour: '$hour',
        platform: '$platform',
      },
      totalActivity: { $sum: '$value' },
      postCount: { $sum: 1 },
    },
  },
  {
    $project: {
      hour: '$_id.hour',
      platform: '$_id.platform',
      activity: '$totalActivity',
      intensity: { $divide: ['$totalActivity', '$postCount'] },
      _id: 0,
    },
  },
]);

console.log('Heatmap Data:', JSON.stringify(heatmapData, null, 2));

const heatmapPlotConfig = {
  marks: [
    {
      type: 'cell',
      data: heatmapData,
      x: 'hour',
      y: 'platform',
      fill: 'activity',
      tip: true,
    },
  ],
  x: { label: 'Hour of Day' },
  y: { label: 'Platform' },
  color: {
    scheme: 'blues',
    label: 'Total Activity',
    legend: true,
  },
  title: 'Platform Activity Heatmap by Hour',
};

console.log('Heatmap Plot Config:', JSON.stringify(heatmapPlotConfig, null, 2));

// =========================================
// 5. DISTRIBUTION PLOTS
// =========================================
console.log('\n📈 Distribution: Engagement Value Distribution');

// Prepare data for distribution analysis
const distributionData = Modash.aggregate(socialMediaData, [
  {
    $project: {
      platform: '$platform',
      metric: '$metric',
      value: '$value',
      logValue: { $ln: { $add: ['$value', 1] } }, // Log transform for better distribution
    },
  },
]);

console.log(
  'Distribution Data:',
  JSON.stringify(distributionData.slice(0, 5), null, 2)
);

const distributionPlotConfig = {
  marks: [
    // Histogram
    {
      type: 'rectY',
      data: distributionData,
      x: { value: 'value', bin: true },
      y: { reduce: 'count' },
      fill: 'platform',
      tip: true,
    },
  ],
  fx: 'metric', // Facet by metric type
  x: { label: 'Engagement Value' },
  y: { label: 'Frequency' },
  color: { legend: true },
  title: 'Engagement Value Distribution by Metric and Platform',
};

console.log(
  'Distribution Plot Config:',
  JSON.stringify(distributionPlotConfig, null, 2)
);

// =========================================
// 6. OBSERVABLE PLOT HELPER CLASS
// =========================================
console.log('\n🔧 Observable Plot Helper Functions');

/**
 * Helper class for Observable Plot integrations with Modash.js
 */
class ModashObservablePlot {
  /**
   * Create a line chart configuration
   */
  static line(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    // Convert to tidy format if needed
    const tidyData = options.tidyTransform
      ? options.tidyTransform(aggregated)
      : aggregated;

    return {
      marks: [
        {
          type: 'line',
          data: tidyData,
          x: options.x || 'x',
          y: options.y || 'y',
          stroke: options.color,
          strokeWidth: options.strokeWidth || 2,
          tip: options.tip !== false,
        },
        // Add dots if requested
        ...(options.dots
          ? [
              {
                type: 'dot',
                data: tidyData,
                x: options.x || 'x',
                y: options.y || 'y',
                fill: options.color,
                r: options.dotSize || 3,
              },
            ]
          : []),
      ],
      x: { label: options.xLabel },
      y: { label: options.yLabel },
      title: options.title,
      ...options.additionalConfig,
    };
  }

  /**
   * Create a bar chart configuration
   */
  static bar(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      marks: [
        {
          type: options.orientation === 'horizontal' ? 'barX' : 'barY',
          data: aggregated,
          x: options.x || 'x',
          y: options.y || 'y',
          fill: options.fill,
          tip: options.tip !== false,
        },
      ],
      x: { label: options.xLabel },
      y: { label: options.yLabel },
      color: options.colorLegend ? { legend: true } : undefined,
      title: options.title,
      ...options.additionalConfig,
    };
  }

  /**
   * Create a faceted visualization
   */
  static faceted(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      marks: options.marks || [
        {
          type: 'barY',
          data: aggregated,
          x: options.x || 'x',
          y: options.y || 'y',
          fill: options.fill,
        },
      ],
      fx: options.facetX, // Horizontal faceting
      fy: options.facetY, // Vertical faceting
      x: { label: options.xLabel },
      y: { label: options.yLabel },
      title: options.title,
      ...options.additionalConfig,
    };
  }

  /**
   * Create a scatter plot configuration
   */
  static scatter(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      marks: [
        {
          type: 'dot',
          data: aggregated,
          x: options.x || 'x',
          y: options.y || 'y',
          fill: options.color,
          r: options.size,
          tip: options.tip !== false,
        },
        // Add regression line if requested
        ...(options.regression
          ? [
              {
                type: 'linearRegression',
                data: aggregated,
                x: options.x || 'x',
                y: options.y || 'y',
                stroke: options.regressionColor || 'red',
              },
            ]
          : []),
      ],
      x: { label: options.xLabel },
      y: { label: options.yLabel },
      color: options.colorLegend ? { legend: true } : undefined,
      title: options.title,
      ...options.additionalConfig,
    };
  }

  /**
   * Convert grouped data to tidy format for Plot
   */
  static toTidyFormat(groupedData, valueFields, options = {}) {
    const tidyData = [];
    const keyField = options.keyField || '_id';

    groupedData.forEach(group => {
      valueFields.forEach(field => {
        tidyData.push({
          [options.categoryName || 'category']: group[keyField],
          [options.metricName || 'metric']: field,
          [options.valueName || 'value']: group[field],
          ...options.additionalFields,
        });
      });
    });

    return tidyData;
  }
}

// Example using the helper class
console.log('\n🎨 Using Observable Plot Helper Class:');

const helperLineConfig = ModashObservablePlot.line(
  socialMediaData,
  [
    { $match: { metric: 'likes' } },
    {
      $group: {
        _id: { $hour: '$timestamp' },
        totalLikes: { $sum: '$value' },
      },
    },
    { $sort: { _id: 1 } },
  ],
  {
    x: '_id',
    y: 'totalLikes',
    xLabel: 'Hour of Day',
    yLabel: 'Total Likes',
    title: 'Hourly Like Trends',
    dots: true,
    tip: true,
  }
);

console.log(
  'Helper Line Chart Config:',
  JSON.stringify(helperLineConfig, null, 2)
);

// Tidy format conversion example
const groupedSample = [
  { _id: 'twitter', likes: 650, shares: 110 },
  { _id: 'linkedin', likes: 200, shares: 35 },
];

const tidyConverted = ModashObservablePlot.toTidyFormat(
  groupedSample,
  ['likes', 'shares'],
  {
    categoryName: 'platform',
    metricName: 'engagement_type',
    valueName: 'count',
  }
);

console.log('Tidy Format Conversion:', JSON.stringify(tidyConverted, null, 2));

console.log('\n✅ Observable Plot integration examples completed!');
console.log(
  '💡 Observable Plot works best with tidy data - Modash makes the transformation easy!'
);

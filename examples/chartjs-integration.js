/**
 * Chart.js Integration Example
 * Demonstrates how Modash.js can elegantly prepare data for Chart.js visualizations
 */

import Modash from '../src/modash/index.js';

// Sample e-commerce data for demonstration
const salesData = [
  {
    date: new Date('2024-01-15'),
    item: 'laptop',
    category: 'electronics',
    price: 1200,
    quantity: 2,
    region: 'north',
  },
  {
    date: new Date('2024-01-15'),
    item: 'mouse',
    category: 'electronics',
    price: 25,
    quantity: 10,
    region: 'south',
  },
  {
    date: new Date('2024-01-16'),
    item: 'keyboard',
    category: 'electronics',
    price: 75,
    quantity: 5,
    region: 'north',
  },
  {
    date: new Date('2024-01-16'),
    item: 'chair',
    category: 'furniture',
    price: 300,
    quantity: 1,
    region: 'east',
  },
  {
    date: new Date('2024-01-17'),
    item: 'desk',
    category: 'furniture',
    price: 500,
    quantity: 1,
    region: 'west',
  },
  {
    date: new Date('2024-01-17'),
    item: 'monitor',
    category: 'electronics',
    price: 350,
    quantity: 3,
    region: 'north',
  },
  {
    date: new Date('2024-01-18'),
    item: 'headphones',
    category: 'electronics',
    price: 150,
    quantity: 4,
    region: 'south',
  },
  {
    date: new Date('2024-01-18'),
    item: 'lamp',
    category: 'furniture',
    price: 80,
    quantity: 2,
    region: 'east',
  },
];

console.log('📊 Chart.js Integration Examples with Modash.js\n');

// =========================================
// 1. TIME SERIES LINE CHART
// =========================================
console.log('📈 Time Series: Daily Revenue');

const dailyRevenueData = Modash.aggregate(salesData, [
  {
    $project: {
      day: { $dayOfMonth: '$date' },
      revenue: { $multiply: ['$price', '$quantity'] },
    },
  },
  {
    $group: {
      _id: '$day',
      totalRevenue: { $sum: '$revenue' },
    },
  },
  { $sort: { _id: 1 } },
]);

// Transform for Chart.js line chart
function toLineChartConfig(data, _options = {}) {
  return {
    type: 'line',
    data: {
      labels: data.map(d => `Day ${d._id}`),
      datasets: [
        {
          label: 'Daily Revenue ($)',
          data: data.map(d => d.totalRevenue),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Daily Revenue Trend',
        },
        legend: {
          display: true,
          position: 'top',
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return `$${value.toLocaleString()}`;
            },
          },
        },
      },
    },
  };
}

const lineChartConfig = toLineChartConfig(dailyRevenueData);
console.log(
  'Chart.js Line Chart Config:',
  JSON.stringify(lineChartConfig, null, 2)
);

// =========================================
// 2. BAR CHART - CATEGORY PERFORMANCE
// =========================================
console.log('\n📊 Bar Chart: Category Performance');

const categoryData = Modash.aggregate(salesData, [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemsSold: { $sum: '$quantity' },
      avgPrice: { $avg: '$price' },
    },
  },
  { $sort: { totalRevenue: -1 } },
]);

// Transform for Chart.js bar chart
function toBarChartConfig(data, _options = {}) {
  return {
    type: 'bar',
    data: {
      labels: data.map(d => d._id.charAt(0).toUpperCase() + d._id.slice(1)),
      datasets: [
        {
          label: 'Total Revenue ($)',
          data: data.map(d => d.totalRevenue),
          backgroundColor: [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 205, 86, 0.7)',
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 205, 86, 1)',
          ],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Revenue by Category',
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback(value) {
              return `$${value.toLocaleString()}`;
            },
          },
        },
      },
    },
  };
}

const barChartConfig = toBarChartConfig(categoryData);
console.log(
  'Chart.js Bar Chart Config:',
  JSON.stringify(barChartConfig, null, 2)
);

// =========================================
// 3. PIE CHART - REGIONAL DISTRIBUTION
// =========================================
console.log('\n🥧 Pie Chart: Regional Sales Distribution');

const regionalData = Modash.aggregate(salesData, [
  {
    $group: {
      _id: '$region',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      orderCount: { $sum: 1 },
    },
  },
]);

// Transform for Chart.js pie chart
function toPieChartConfig(data) {
  const colors = [
    'rgba(255, 99, 132, 0.7)',
    'rgba(54, 162, 235, 0.7)',
    'rgba(255, 205, 86, 0.7)',
    'rgba(75, 192, 192, 0.7)',
    'rgba(153, 102, 255, 0.7)',
  ];

  return {
    type: 'pie',
    data: {
      labels: data.map(d => d._id.charAt(0).toUpperCase() + d._id.slice(1)),
      datasets: [
        {
          data: data.map(d => d.totalRevenue),
          backgroundColor: colors.slice(0, data.length),
          borderColor: colors
            .slice(0, data.length)
            .map(color => color.replace('0.7', '1')),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Revenue Distribution by Region',
        },
        legend: {
          position: 'right',
        },
        tooltip: {
          callbacks: {
            label(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: $${context.parsed.toLocaleString()} (${percentage}%)`;
            },
          },
        },
      },
    },
  };
}

const pieChartConfig = toPieChartConfig(regionalData);
console.log(
  'Chart.js Pie Chart Config:',
  JSON.stringify(pieChartConfig, null, 2)
);

// =========================================
// 4. MULTI-DATASET BAR CHART - COMPARISON
// =========================================
console.log('\n📊 Multi-Dataset: Revenue vs Items Sold by Category');

// Prepare data with multiple metrics
const comparisonData = Modash.aggregate(salesData, [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      totalItemsSold: { $sum: '$quantity' },
      avgPrice: { $avg: '$price' },
    },
  },
  { $sort: { _id: 1 } },
]);

// Multi-dataset bar chart
function toMultiBarChartConfig(data) {
  return {
    type: 'bar',
    data: {
      labels: data.map(d => d._id.charAt(0).toUpperCase() + d._id.slice(1)),
      datasets: [
        {
          label: 'Total Revenue ($)',
          data: data.map(d => d.totalRevenue),
          backgroundColor: 'rgba(255, 99, 132, 0.7)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Items Sold',
          data: data.map(d => d.totalItemsSold),
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: 'Revenue vs Items Sold by Category',
        },
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          ticks: {
            callback(value) {
              return `$${value.toLocaleString()}`;
            },
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback(value) {
              return `${value} items`;
            },
          },
        },
      },
    },
  };
}

const multiBarChartConfig = toMultiBarChartConfig(comparisonData);
console.log(
  'Chart.js Multi-Dataset Bar Chart Config:',
  JSON.stringify(multiBarChartConfig, null, 2)
);

// =========================================
// 5. HELPER FUNCTIONS FOR REUSABILITY
// =========================================
console.log('\n🔧 Reusable Helper Functions');

/**
 * Generic Chart.js helper functions
 */
class ModashChartJS {
  /**
   * Create a time series chart configuration
   * @param {Array} data - Raw data array
   * @param {Array} pipeline - Modash aggregation pipeline
   * @param {Object} options - Chart customization options
   */
  static timeSeries(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      type: 'line',
      data: {
        labels: aggregated.map(d =>
          options.labelExtractor ? options.labelExtractor(d) : d._id
        ),
        datasets: [
          {
            label: options.label || 'Time Series',
            data: aggregated.map(d =>
              options.valueExtractor ? options.valueExtractor(d) : d.value
            ),
            borderColor: options.borderColor || 'rgb(75, 192, 192)',
            backgroundColor:
              options.backgroundColor || 'rgba(75, 192, 192, 0.2)',
            fill: options.fill !== undefined ? options.fill : true,
            tension: options.tension || 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: options.title || 'Time Series Chart' },
          legend: { display: true, position: 'top' },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: options.yAxisFormatter
              ? { callback: options.yAxisFormatter }
              : {},
          },
        },
        ...options.additionalOptions,
      },
    };
  }

  /**
   * Create a categorical bar chart configuration
   */
  static categorical(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      type: options.chartType || 'bar',
      data: {
        labels: aggregated.map(d =>
          options.labelExtractor ? options.labelExtractor(d) : d._id
        ),
        datasets: [
          {
            label: options.label || 'Categories',
            data: aggregated.map(d =>
              options.valueExtractor ? options.valueExtractor(d) : d.value
            ),
            backgroundColor:
              options.colors || this.generateColors(aggregated.length),
            borderWidth: options.borderWidth || 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: options.title || 'Categorical Chart' },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: options.yAxisFormatter
              ? { callback: options.yAxisFormatter }
              : {},
          },
        },
        ...options.additionalOptions,
      },
    };
  }

  /**
   * Generate a color palette
   */
  static generateColors(count, alpha = 0.7) {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 137.508) % 360; // Golden angle for good color distribution
      colors.push(`hsla(${hue}, 70%, 50%, ${alpha})`);
    }
    return colors;
  }
}

// Example using the helper class
console.log('\n🎨 Using Helper Class:');

const helperTimeSeriesConfig = ModashChartJS.timeSeries(
  salesData,
  [
    {
      $project: {
        day: { $dayOfMonth: '$date' },
        revenue: { $multiply: ['$price', '$quantity'] },
      },
    },
    { $group: { _id: '$day', total: { $sum: '$revenue' } } },
    { $sort: { _id: 1 } },
  ],
  {
    title: 'Daily Revenue with Helper',
    label: 'Revenue ($)',
    labelExtractor: d => `Day ${d._id}`,
    valueExtractor: d => d.total,
    yAxisFormatter: value => `$${value.toLocaleString()}`,
    borderColor: 'rgb(255, 99, 132)',
    backgroundColor: 'rgba(255, 99, 132, 0.1)',
  }
);

console.log(
  'Helper-generated config:',
  JSON.stringify(helperTimeSeriesConfig, null, 2)
);

console.log('\n✅ Chart.js integration examples completed!');
console.log(
  '💡 These examples show how Modash.js naturally prepares data for Chart.js visualizations.'
);

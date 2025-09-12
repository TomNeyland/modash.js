import { expect } from 'chai';
import Modash from '../src/modash/index.js';

/**
 * Documentation-style tests showcasing real-world scenarios
 * These tests serve as both executable documentation and comprehensive examples
 */

// Rich fixture data covering various business scenarios
const fixtures = {
    // E-commerce & Sales Analytics
    products: [
        { _id: 1, name: 'MacBook Pro 16"', category: 'laptops', brand: 'Apple', price: 2499, stock: 15, tags: ['premium', 'professional'], ratings: [5, 4, 5, 4, 5] },
        { _id: 2, name: 'ThinkPad X1 Carbon', category: 'laptops', brand: 'Lenovo', price: 1899, stock: 8, tags: ['business', 'lightweight'], ratings: [4, 4, 5, 4] },
        { _id: 3, name: 'iPad Pro 12.9"', category: 'tablets', brand: 'Apple', price: 1099, stock: 25, tags: ['premium', 'creative'], ratings: [5, 5, 4, 5, 5, 4] },
        { _id: 4, name: 'Surface Pro 9', category: 'tablets', brand: 'Microsoft', price: 999, stock: 12, tags: ['business', '2-in-1'], ratings: [4, 4, 4, 5] },
        { _id: 5, name: 'iPhone 15 Pro', category: 'phones', brand: 'Apple', price: 999, stock: 30, tags: ['premium', 'flagship'], ratings: [5, 5, 5, 4, 5] },
        { _id: 6, name: 'Galaxy S24 Ultra', category: 'phones', brand: 'Samsung', price: 1199, stock: 22, tags: ['premium', 'flagship'], ratings: [5, 4, 5, 5] }
    ],

    orders: [
        { _id: 1001, customerId: 201, productId: 1, quantity: 1, orderDate: new Date('2024-01-15'), status: 'shipped', shippingAddress: { city: 'San Francisco', state: 'CA' } },
        { _id: 1002, customerId: 202, productId: 3, quantity: 2, orderDate: new Date('2024-01-16'), status: 'delivered', shippingAddress: { city: 'New York', state: 'NY' } },
        { _id: 1003, customerId: 201, productId: 5, quantity: 1, orderDate: new Date('2024-01-18'), status: 'processing', shippingAddress: { city: 'San Francisco', state: 'CA' } },
        { _id: 1004, customerId: 203, productId: 2, quantity: 1, orderDate: new Date('2024-01-20'), status: 'shipped', shippingAddress: { city: 'Austin', state: 'TX' } },
        { _id: 1005, customerId: 202, productId: 4, quantity: 1, orderDate: new Date('2024-01-22'), status: 'delivered', shippingAddress: { city: 'New York', state: 'NY' } }
    ],

    customers: [
        { _id: 201, name: 'Alice Johnson', email: 'alice@example.com', registrationDate: new Date('2023-03-15'), tier: 'premium', totalSpent: 3498 },
        { _id: 202, name: 'Bob Smith', email: 'bob@example.com', registrationDate: new Date('2023-06-20'), tier: 'gold', totalSpent: 2198 },
        { _id: 203, name: 'Charlie Brown', email: 'charlie@example.com', registrationDate: new Date('2023-09-10'), tier: 'silver', totalSpent: 1899 }
    ],

    // Content Management & Blog
    blogPosts: [
        { _id: 301, title: 'Getting Started with MongoDB Aggregation', authorId: 401, publishedDate: new Date('2024-01-10'), tags: ['mongodb', 'database', 'tutorial'], views: 1250, likes: 89, comments: ['Great tutorial!', 'Very helpful', 'Thanks for sharing'] },
        { _id: 302, title: 'Advanced JavaScript Patterns', authorId: 402, publishedDate: new Date('2024-01-12'), tags: ['javascript', 'patterns', 'advanced'], views: 2100, likes: 156, comments: ['Mind blown!', 'Excellent examples'] },
        { _id: 303, title: 'TypeScript Best Practices', authorId: 401, publishedDate: new Date('2024-01-15'), tags: ['typescript', 'best-practices'], views: 1875, likes: 134, comments: ['Very useful', 'Bookmarked!', 'Great insights'] },
        { _id: 304, title: 'Node.js Performance Optimization', authorId: 403, publishedDate: new Date('2024-01-18'), tags: ['nodejs', 'performance'], views: 1650, likes: 112, comments: ['Impressive results'] }
    ],

    authors: [
        { _id: 401, name: 'Sarah Wilson', bio: 'Senior Developer', expertise: ['mongodb', 'typescript'], followers: 2500 },
        { _id: 402, name: 'Mike Chen', bio: 'JavaScript Expert', expertise: ['javascript', 'react'], followers: 3200 },
        { _id: 403, name: 'Emma Davis', bio: 'Backend Architect', expertise: ['nodejs', 'performance'], followers: 1800 }
    ],

    // HR & Employee Management
    employees: [
        { _id: 501, name: 'John Doe', department: 'engineering', position: 'Senior Developer', salary: 95000, skills: ['javascript', 'react', 'node'], startDate: new Date('2022-03-01'), performance: [8.5, 9.0, 8.8] },
        { _id: 502, name: 'Jane Smith', department: 'engineering', position: 'Lead Developer', salary: 110000, skills: ['python', 'django', 'postgresql'], startDate: new Date('2021-06-15'), performance: [9.2, 9.1, 9.3] },
        { _id: 503, name: 'Bob Johnson', department: 'design', position: 'UX Designer', salary: 75000, skills: ['figma', 'sketch', 'user-research'], startDate: new Date('2023-01-20'), performance: [8.0, 8.5, 8.3] },
        { _id: 504, name: 'Alice Brown', department: 'marketing', position: 'Marketing Manager', salary: 85000, skills: ['seo', 'content', 'analytics'], startDate: new Date('2022-08-10'), performance: [8.8, 9.0, 8.9] }
    ],

    // Financial & Transaction Processing
    transactions: [
        { _id: 601, accountId: 'ACC001', type: 'deposit', amount: 5000, date: new Date('2024-01-15'), category: 'salary', description: 'Monthly salary' },
        { _id: 602, accountId: 'ACC001', type: 'withdrawal', amount: -1200, date: new Date('2024-01-16'), category: 'rent', description: 'Apartment rent' },
        { _id: 603, accountId: 'ACC002', type: 'deposit', amount: 2500, date: new Date('2024-01-17'), category: 'freelance', description: 'Project payment' },
        { _id: 604, accountId: 'ACC001', type: 'withdrawal', amount: -350, date: new Date('2024-01-18'), category: 'groceries', description: 'Weekly groceries' },
        { _id: 605, accountId: 'ACC002', type: 'withdrawal', amount: -800, date: new Date('2024-01-19'), category: 'utilities', description: 'Monthly utilities' }
    ],

    // IoT & Sensor Data
    sensorReadings: [
        { _id: 701, deviceId: 'TEMP001', location: { building: 'A', floor: 1, room: '101' }, timestamp: new Date('2024-01-20T08:00:00Z'), temperature: 22.5, humidity: 45 },
        { _id: 702, deviceId: 'TEMP001', location: { building: 'A', floor: 1, room: '101' }, timestamp: new Date('2024-01-20T09:00:00Z'), temperature: 24.1, humidity: 48 },
        { _id: 703, deviceId: 'TEMP002', location: { building: 'A', floor: 2, room: '201' }, timestamp: new Date('2024-01-20T08:00:00Z'), temperature: 21.8, humidity: 42 },
        { _id: 704, deviceId: 'TEMP002', location: { building: 'A', floor: 2, room: '201' }, timestamp: new Date('2024-01-20T09:00:00Z'), temperature: 23.2, humidity: 44 }
    ],

    // Social Media & Analytics
    socialPosts: [
        { _id: 801, userId: 901, content: 'Just learned about MongoDB aggregation pipelines! 🔥', timestamp: new Date('2024-01-15T10:30:00Z'), likes: 45, shares: 12, hashtags: ['mongodb', 'database'] },
        { _id: 802, userId: 902, content: 'Building awesome apps with TypeScript', timestamp: new Date('2024-01-16T14:20:00Z'), likes: 78, shares: 23, hashtags: ['typescript', 'development'] },
        { _id: 803, userId: 901, content: 'Great conference today on modern web development', timestamp: new Date('2024-01-17T16:45:00Z'), likes: 32, shares: 8, hashtags: ['webdev', 'conference'] }
    ],

    users: [
        { _id: 901, username: 'techie_sarah', followers: 1250, following: 340, joinDate: new Date('2023-05-15') },
        { _id: 902, username: 'dev_mike', followers: 2100, following: 180, joinDate: new Date('2023-02-20') }
    ]
};

describe('📖 Documentation Examples - Real-World Scenarios', () => {

    describe('🛒 E-commerce & Sales Analytics', () => {
        
        it('should analyze top-selling products by revenue with inventory alerts', () => {
            // Combine orders with product details to find top revenue generators
            const result = Modash.aggregate(fixtures.orders, [
                {
                    $lookup: {
                        from: fixtures.products,
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $addFields: {
                        revenue: { $multiply: ['$quantity', '$product.price'] },
                        lowStock: { $lt: ['$product.stock', 10] }
                    }
                },
                {
                    $group: {
                        _id: '$product.name',
                        totalRevenue: { $sum: '$revenue' },
                        totalQuantitySold: { $sum: '$quantity' },
                        averageOrderSize: { $avg: '$quantity' },
                        lowStockAlert: { $first: '$lowStock' },
                        category: { $first: '$product.category' }
                    }
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: 5 }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('_id');
            expect(result[0]).to.have.property('totalRevenue');
            expect(result[0]).to.have.property('lowStockAlert');
            
            // Should be sorted by revenue (descending)
            if (result.length > 1) {
                expect(result[0].totalRevenue).to.be.at.least(result[1].totalRevenue);
            }
        });

        it('should create customer purchase analytics with tier-based insights', () => {
            const result = Modash.aggregate(fixtures.orders, [
                {
                    $lookup: {
                        from: fixtures.customers,
                        localField: 'customerId',
                        foreignField: '_id',
                        as: 'customer'
                    }
                },
                {
                    $lookup: {
                        from: fixtures.products,
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$customer' },
                { $unwind: '$product' },
                {
                    $addFields: {
                        orderValue: { $multiply: ['$quantity', '$product.price'] },
                        customerName: '$customer.name',
                        customerTier: '$customer.tier',
                        isPremiumProduct: { $in: ['premium', '$product.tags'] }
                    }
                },
                {
                    $group: {
                        _id: '$customerId',
                        customerName: { $first: '$customerName' },
                        customerTier: { $first: '$customerTier' },
                        totalOrders: { $sum: 1 },
                        totalSpent: { $sum: '$orderValue' },
                        avgOrderValue: { $avg: '$orderValue' },
                        premiumProductsPurchased: { $sum: { $cond: ['$isPremiumProduct', 1, 0] } }
                    }
                },
                { $sort: { totalSpent: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('customerName');
            expect(result[0]).to.have.property('totalSpent');
            expect(result[0]).to.have.property('premiumProductsPurchased');
        });

        it('should analyze regional sales patterns with shipping insights', () => {
            const result = Modash.aggregate(fixtures.orders, [
                {
                    $match: {
                        status: { $in: ['shipped', 'delivered'] }
                    }
                },
                {
                    $lookup: {
                        from: fixtures.products,
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: '$shippingAddress.state',
                        orderCount: { $sum: 1 },
                        totalRevenue: { $sum: { $multiply: ['$quantity', '$product.price'] } },
                        avgOrderValue: { $avg: { $multiply: ['$quantity', '$product.price'] } },
                        topCategories: { $addToSet: '$product.category' }
                    }
                },
                { $sort: { totalRevenue: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('_id'); // state
            expect(result[0]).to.have.property('totalRevenue');
            expect(result[0]).to.have.property('topCategories');
        });
    });

    describe('📝 Content Management & Blog Analytics', () => {
        
        it('should find top-performing content with engagement metrics', () => {
            const result = Modash.aggregate(fixtures.blogPosts, [
                {
                    $lookup: {
                        from: fixtures.authors,
                        localField: 'authorId',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $addFields: {
                        engagementScore: { 
                            $add: [
                                { $multiply: ['$views', 0.1] },
                                { $multiply: ['$likes', 2] },
                                { $multiply: [{ $size: '$comments' }, 5] }
                            ]
                        },
                        commentsCount: { $size: '$comments' },
                        authorName: '$author.name'
                    }
                },
                {
                    $match: {
                        views: { $gte: 1000 }
                    }
                },
                { $sort: { engagementScore: -1 } },
                {
                    $project: {
                        title: 1,
                        authorName: 1,
                        views: 1,
                        likes: 1,
                        commentsCount: 1,
                        engagementScore: { $round: ['$engagementScore', 2] },
                        tags: 1
                    }
                },
                { $limit: 10 }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('engagementScore');
            expect(result[0]).to.have.property('authorName');
            expect(result[0]).to.have.property('commentsCount');
        });

        it('should analyze content trends by tags and publication timeline', () => {
            const result = Modash.aggregate(fixtures.blogPosts, [
                { $unwind: '$tags' },
                {
                    $group: {
                        _id: '$tags',
                        postCount: { $sum: 1 },
                        totalViews: { $sum: '$views' },
                        totalLikes: { $sum: '$likes' },
                        avgEngagement: { $avg: { $add: ['$views', { $multiply: ['$likes', 10] }] } },
                        latestPost: { $max: '$publishedDate' },
                        authors: { $addToSet: '$authorId' }
                    }
                },
                {
                    $addFields: {
                        authorCount: { $size: '$authors' },
                        avgViewsPerPost: { $divide: ['$totalViews', '$postCount'] }
                    }
                },
                { $sort: { totalViews: -1 } },
                {
                    $project: {
                        tag: '$_id',
                        postCount: 1,
                        totalViews: 1,
                        avgViewsPerPost: { $round: ['$avgViewsPerPost', 0] },
                        authorCount: 1
                    }
                }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('tag');
            expect(result[0]).to.have.property('avgViewsPerPost');
            expect(result[0]).to.have.property('authorCount');
        });
    });

    describe('👥 HR & Employee Analytics', () => {
        
        it('should analyze salary distribution and performance by department', () => {
            const result = Modash.aggregate(fixtures.employees, [
                {
                    $addFields: {
                        avgPerformance: { $avg: '$performance' },
                        yearsOfService: { 
                            $divide: [
                                { $subtract: [new Date(), '$startDate'] },
                                365.25 * 24 * 60 * 60 * 1000 // Convert milliseconds to years
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$department',
                        employeeCount: { $sum: 1 },
                        avgSalary: { $avg: '$salary' },
                        minSalary: { $min: '$salary' },
                        maxSalary: { $max: '$salary' },
                        avgPerformance: { $avg: '$avgPerformance' },
                        totalPayroll: { $sum: '$salary' },
                        topPerformer: { 
                            $first: {
                                $cond: [
                                    { $eq: ['$avgPerformance', { $max: '$avgPerformance' }] },
                                    '$name',
                                    null
                                ]
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        avgSalaryFormatted: { $round: ['$avgSalary', 0] },
                        salaryRange: { $subtract: ['$maxSalary', '$minSalary'] }
                    }
                },
                { $sort: { avgSalary: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('_id'); // department
            expect(result[0]).to.have.property('avgSalary');
            expect(result[0]).to.have.property('avgPerformance');
            expect(result[0]).to.have.property('totalPayroll');
        });

        it('should identify skill gaps and training needs across teams', () => {
            const result = Modash.aggregate(fixtures.employees, [
                { $unwind: '$skills' },
                {
                    $group: {
                        _id: '$skills',
                        employeeCount: { $sum: 1 },
                        departments: { $addToSet: '$department' },
                        avgSalary: { $avg: '$salary' },
                        totalExperience: { $sum: 1 } // Simplified experience metric
                    }
                },
                {
                    $addFields: {
                        departmentCount: { $size: '$departments' },
                        isHighDemand: { $gte: ['$employeeCount', 2] },
                        skillValue: { $multiply: ['$avgSalary', '$employeeCount'] }
                    }
                },
                { $sort: { skillValue: -1 } },
                {
                    $project: {
                        skill: '$_id',
                        employeeCount: 1,
                        departmentCount: 1,
                        avgSalary: { $round: ['$avgSalary', 0] },
                        isHighDemand: 1,
                        departments: 1
                    }
                }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('skill');
            expect(result[0]).to.have.property('isHighDemand');
            expect(result[0]).to.have.property('departmentCount');
        });
    });

    describe('💰 Financial Transaction Analysis', () => {
        
        it('should create comprehensive account activity summary', () => {
            const result = Modash.aggregate(fixtures.transactions, [
                {
                    $addFields: {
                        month: { $month: '$date' },
                        isDeposit: { $eq: ['$type', 'deposit'] },
                        absAmount: { $abs: '$amount' }
                    }
                },
                {
                    $group: {
                        _id: '$accountId',
                        totalTransactions: { $sum: 1 },
                        totalDeposits: { 
                            $sum: { $cond: ['$isDeposit', '$amount', 0] }
                        },
                        totalWithdrawals: { 
                            $sum: { $cond: ['$isDeposit', 0, { $abs: '$amount' }] }
                        },
                        netBalance: { $sum: '$amount' },
                        avgTransactionSize: { $avg: '$absAmount' },
                        largestTransaction: { $max: '$absAmount' },
                        categories: { $addToSet: '$category' },
                        lastActivity: { $max: '$date' }
                    }
                },
                {
                    $addFields: {
                        categoryCount: { $size: '$categories' },
                        isPositiveBalance: { $gt: ['$netBalance', 0] },
                        activityLevel: {
                            $switch: {
                                branches: [
                                    { case: { $gte: ['$totalTransactions', 4] }, then: 'High' },
                                    { case: { $gte: ['$totalTransactions', 2] }, then: 'Medium' },
                                    { case: { $lt: ['$totalTransactions', 2] }, then: 'Low' }
                                ],
                                default: 'Unknown'
                            }
                        }
                    }
                },
                { $sort: { netBalance: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('_id'); // accountId
            expect(result[0]).to.have.property('netBalance');
            expect(result[0]).to.have.property('activityLevel');
            expect(result[0]).to.have.property('isPositiveBalance');
        });

        it('should analyze spending patterns by category and detect anomalies', () => {
            const result = Modash.aggregate(fixtures.transactions, [
                {
                    $match: {
                        type: 'withdrawal',
                        amount: { $lt: 0 }
                    }
                },
                {
                    $addFields: {
                        spendAmount: { $abs: '$amount' },
                        dayOfWeek: { $dayOfWeek: '$date' }
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        transactionCount: { $sum: 1 },
                        totalSpent: { $sum: '$spendAmount' },
                        avgSpend: { $avg: '$spendAmount' },
                        maxSpend: { $max: '$spendAmount' },
                        minSpend: { $min: '$spendAmount' },
                        accounts: { $addToSet: '$accountId' }
                    }
                },
                {
                    $addFields: {
                        spendRange: { $subtract: ['$maxSpend', '$minSpend'] },
                        accountCount: { $size: '$accounts' },
                        isHighSpend: { $gt: ['$totalSpent', 1000] },
                        consistency: { 
                            $divide: ['$avgSpend', { $add: ['$spendRange', 1] }]
                        }
                    }
                },
                { $sort: { totalSpent: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('_id'); // category
            expect(result[0]).to.have.property('totalSpent');
            expect(result[0]).to.have.property('isHighSpend');
            expect(result[0]).to.have.property('consistency');
        });
    });

    describe('🌡️ IoT Sensor Data Analysis', () => {
        
        it('should monitor environmental conditions with alerts', () => {
            const result = Modash.aggregate(fixtures.sensorReadings, [
                {
                    $addFields: {
                        hour: { $hour: '$timestamp' },
                        tempAlert: {
                            $or: [
                                { $lt: ['$temperature', 18] },
                                { $gt: ['$temperature', 26] }
                            ]
                        },
                        humidityAlert: {
                            $or: [
                                { $lt: ['$humidity', 30] },
                                { $gt: ['$humidity', 60] }
                            ]
                        },
                        locationKey: {
                            $concat: [
                                '$location.building',
                                '-',
                                { $toString: '$location.floor' },
                                '-',
                                '$location.room'
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: '$locationKey',
                        deviceId: { $first: '$deviceId' },
                        avgTemperature: { $avg: '$temperature' },
                        avgHumidity: { $avg: '$humidity' },
                        minTemp: { $min: '$temperature' },
                        maxTemp: { $max: '$temperature' },
                        tempAlertCount: { $sum: { $cond: ['$tempAlert', 1, 0] } },
                        humidityAlertCount: { $sum: { $cond: ['$humidityAlert', 1, 0] } },
                        totalReadings: { $sum: 1 },
                        location: { $first: '$location' }
                    }
                },
                {
                    $addFields: {
                        tempRange: { $subtract: ['$maxTemp', '$minTemp'] },
                        alertPercentage: { 
                            $multiply: [
                                { $divide: [
                                    { $add: ['$tempAlertCount', '$humidityAlertCount'] },
                                    '$totalReadings'
                                ]},
                                100
                            ]
                        },
                        status: {
                            $switch: {
                                branches: [
                                    { case: { $gt: ['$alertPercentage', 50] }, then: 'Critical' },
                                    { case: { $gt: ['$alertPercentage', 20] }, then: 'Warning' },
                                    { case: { $lte: ['$alertPercentage', 20] }, then: 'Normal' }
                                ],
                                default: 'Unknown'
                            }
                        }
                    }
                },
                { $sort: { alertPercentage: -1 } }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('avgTemperature');
            expect(result[0]).to.have.property('status');
            expect(result[0]).to.have.property('alertPercentage');
        });
    });

    describe('📱 Social Media Analytics', () => {
        
        it('should analyze user engagement and trending content', () => {
            const result = Modash.aggregate(fixtures.socialPosts, [
                {
                    $lookup: {
                        from: fixtures.users,
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' },
                { $unwind: '$hashtags' },
                {
                    $group: {
                        _id: '$hashtags',
                        postCount: { $sum: 1 },
                        totalLikes: { $sum: '$likes' },
                        totalShares: { $sum: '$shares' },
                        avgEngagement: { $avg: { $add: ['$likes', { $multiply: ['$shares', 3] }] } },
                        uniqueUsers: { $addToSet: '$user.username' },
                        recentPosts: { $push: { title: { $substr: ['$content', 0, 50] }, timestamp: '$timestamp' } }
                    }
                },
                {
                    $addFields: {
                        userCount: { $size: '$uniqueUsers' },
                        viralityScore: { 
                            $multiply: [
                                '$avgEngagement',
                                { $sqrt: '$userCount' },
                                { $log10: { $add: ['$postCount', 1] } }
                            ]
                        },
                        trendingLevel: {
                            $switch: {
                                branches: [
                                    { case: { $gt: ['$viralityScore', 100] }, then: 'Viral' },
                                    { case: { $gt: ['$viralityScore', 50] }, then: 'Trending' },
                                    { case: { $gt: ['$viralityScore', 20] }, then: 'Popular' }
                                ],
                                default: 'Normal'
                            }
                        }
                    }
                },
                { $sort: { viralityScore: -1 } },
                {
                    $project: {
                        hashtag: '$_id',
                        postCount: 1,
                        userCount: 1,
                        avgEngagement: { $round: ['$avgEngagement', 1] },
                        viralityScore: { $round: ['$viralityScore', 2] },
                        trendingLevel: 1
                    }
                }
            ]);

            expect(result).to.be.an('array');
            expect(result[0]).to.have.property('hashtag');
            expect(result[0]).to.have.property('viralityScore');
            expect(result[0]).to.have.property('trendingLevel');
        });
    });
});
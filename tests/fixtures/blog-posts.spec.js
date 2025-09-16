import { expect } from 'chai';
import Aggo from '../../src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadFixture,
  measurePerformance,
  assertCloseTo,
  formatPerformanceReport,
} from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Blog Posts - Query Patterns & Metamorphic Testing', () => {
  let posts;
  const performanceResults = [];

  before(() => {
    const postsPath = path.join(__dirname, '../../fixtures/blog-posts.jsonl');
    posts = loadFixture(postsPath) || generateBlogPostsFixture(100);
  });

  after(() => {
    if (performanceResults.length > 0) {
      console.log(formatPerformanceReport(performanceResults));
    }
  });

  describe('Content Analytics', () => {
    it('should find most viewed posts', () => {
      let result;
      const perf = measurePerformance('Most Viewed Posts Query', () => {
        result = Aggo.aggregate(posts, [
          { $match: { status: 'published' } },
          { $sort: { views: -1 } },
          { $limit: 10 },
          {
            $project: {
              title: 1,
              views: 1,
              likes: 1,
              engagementRate: {
                $cond: {
                  if: { $gt: ['$views', 0] },
                  then: { $divide: ['$likes', '$views'] },
                  else: 0,
                },
              },
            },
          },
        ]);

        expect(result).to.have.lengthOf.at.most(10);
        if (result.length > 1) {
          expect(result[0].views).to.be.at.least(result[1].views);
        }
      });

      it('should calculate engagement metrics', () => {
        const result = Aggo.aggregate(posts, [
          {
            $addFields: {
              commentCount: { $size: '$comments' },
              engagementScore: {
                $add: [
                  { $multiply: ['$views', 0.1] },
                  { $multiply: ['$likes', 2] },
                  { $multiply: [{ $size: '$comments' }, 5] },
                ],
              },
            },
          },
          {
            $group: {
              _id: '$category',
              avgViews: { $avg: '$views' },
              avgLikes: { $avg: '$likes' },
              avgComments: { $avg: '$commentCount' },
              avgEngagement: { $avg: '$engagementScore' },
              postCount: { $sum: 1 },
            },
          },
          { $sort: { avgEngagement: -1 } },
        ]);

        result.forEach(category => {
          expect(category.avgViews).to.be.at.least(0);
          expect(category.avgLikes).to.be.at.least(0);
          expect(category.avgComments).to.be.at.least(0);
        });
      });
    });

    describe('Author Analytics', () => {
      it('should identify top authors by productivity', () => {
        const result = Aggo.aggregate(posts, [
          {
            $group: {
              _id: '$authorId',
              authorName: { $first: '$authorName' },
              postCount: { $sum: 1 },
              totalViews: { $sum: '$views' },
              totalLikes: { $sum: '$likes' },
              avgViews: { $avg: '$views' },
              categories: { $addToSet: '$category' },
            },
          },
          {
            $addFields: {
              categoryDiversity: { $size: '$categories' },
              performanceScore: {
                $multiply: ['$avgViews', { $sqrt: '$postCount' }],
              },
            },
          },
          { $sort: { performanceScore: -1 } },
          { $limit: 10 },
        ]);

        result.forEach(author => {
          expect(author.postCount).to.be.at.least(1);
          expect(author.categoryDiversity).to.be.at.least(1);
        });
      });

      it('should analyze author posting patterns', () => {
        const result = Aggo.aggregate(posts, [
          {
            $addFields: {
              dayOfWeek: { $dayOfWeek: '$publishedDate' },
              month: { $month: '$publishedDate' },
            },
          },
          {
            $group: {
              _id: {
                author: '$authorId',
                dayOfWeek: '$dayOfWeek',
              },
              postCount: { $sum: 1 },
              avgViews: { $avg: '$views' },
            },
          },
          {
            $group: {
              _id: '$_id.author',
              postingPattern: {
                $push: {
                  day: '$_id.dayOfWeek',
                  count: '$postCount',
                  avgViews: '$avgViews',
                },
              },
              totalPosts: { $sum: '$postCount' },
            },
          },
          { $sort: { totalPosts: -1 } },
          { $limit: 5 },
        ]);

        result.forEach(author => {
          expect(author.postingPattern).to.be.an('array');
          expect(author.totalPosts).to.equal(
            author.postingPattern.reduce((sum, day) => sum + day.count, 0)
          );
        });
      });
    });

    describe('Tag & Category Analysis', () => {
      it('should find trending tags', () => {
        const result = Aggo.aggregate(posts, [
          { $match: { status: 'published' } },
          { $unwind: '$tags' },
          {
            $group: {
              _id: '$tags',
              postCount: { $sum: 1 },
              totalViews: { $sum: '$views' },
              totalLikes: { $sum: '$likes' },
              avgEngagement: {
                $avg: {
                  $add: ['$views', { $multiply: ['$likes', 10] }],
                },
              },
            },
          },
          {
            $addFields: {
              trendScore: {
                $multiply: [
                  '$avgEngagement',
                  { $log10: { $add: ['$postCount', 1] } },
                ],
              },
            },
          },
          { $sort: { trendScore: -1 } },
          { $limit: 10 },
        ]);

        result.forEach(tag => {
          expect(tag._id).to.be.a('string');
          expect(tag.postCount).to.be.at.least(1);
          expect(tag.trendScore).to.be.a('number');
        });
      });

      it('should analyze tag co-occurrence', () => {
        const result = Aggo.aggregate(posts, [
          { $match: { status: 'published' } },
          { $limit: 50 }, // Limit for performance
          { $unwind: '$tags' },
          {
            $group: {
              _id: '$_id',
              tags: { $push: '$tags' },
            },
          },
          {
            $addFields: {
              tagPairs: {
                $reduce: {
                  input: '$tags',
                  initialValue: [],
                  in: {
                    $concatArrays: [
                      '$$value',
                      {
                        $map: {
                          input: {
                            $slice: [
                              '$tags',
                              {
                                $add: [
                                  { $indexOfArray: ['$tags', '$$this'] },
                                  1,
                                ],
                              },
                              100,
                            ],
                          },
                          in: {
                            tag1: '$$this',
                            tag2: '$$this',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ]);

        expect(result).to.be.an('array');
      });
    });

    describe('Comment Analysis', () => {
      it('should find most discussed posts', () => {
        let result;
        const perf = measurePerformance('Most Discussed Posts Query', () => {
          result = Aggo.aggregate(posts, [
            {
              $addFields: {
                commentCount: { $size: '$comments' },
                totalCommentLikes: {
                  $sum: '$comments.likes',
                },
              },
            },
            { $match: { commentCount: { $gt: 0 } } },
            {
              $project: {
                title: 1,
                commentCount: 1,
                totalCommentLikes: 1,
                avgCommentLikes: {
                  $divide: ['$totalCommentLikes', '$commentCount'],
                },
                discussionQuality: {
                  $multiply: [
                    '$commentCount',
                    {
                      $divide: [
                        '$totalCommentLikes',
                        { $max: ['$commentCount', 1] },
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { discussionQuality: -1 } },
            { $limit: 10 },
          ]);
        });
        performanceResults.push(perf);

        result.forEach(post => {
          expect(post.commentCount).to.be.at.least(1);
          expect(post.avgCommentLikes).to.be.at.least(0);
        });
      });

      it('should analyze comment sentiment over time', () => {
        const result = Aggo.aggregate(posts, [
          { $unwind: '$comments' },
          {
            $addFields: {
              commentMonth: { $month: '$comments.timestamp' },
            },
          },
          {
            $group: {
              _id: '$commentMonth',
              totalComments: { $sum: 1 },
              avgLikes: { $avg: '$comments.likes' },
              uniqueCommenters: { $addToSet: '$comments.userId' },
            },
          },
          {
            $addFields: {
              commenterDiversity: { $size: '$uniqueCommenters' },
            },
          },
          { $sort: { _id: 1 } },
        ]);

        result.forEach(month => {
          expect(month._id).to.be.at.least(1).and.at.most(12);
          expect(month.totalComments).to.be.at.least(1);
        });
      });
    });

    describe('SEO & Performance', () => {
      it('should analyze SEO performance correlation', () => {
        const result = Aggo.aggregate(posts, [
          { $match: { status: 'published' } },
          {
            $group: {
              _id: {
                seoRange: {
                  $switch: {
                    branches: [
                      {
                        case: { $lt: ['$metadata.seoScore', 30] },
                        then: 'poor',
                      },
                      {
                        case: { $lt: ['$metadata.seoScore', 60] },
                        then: 'average',
                      },
                      {
                        case: { $lt: ['$metadata.seoScore', 80] },
                        then: 'good',
                      },
                    ],
                    default: 'excellent',
                  },
                },
              },
              avgViews: { $avg: '$views' },
              avgLikes: { $avg: '$likes' },
              postCount: { $sum: 1 },
            },
          },
          { $sort: { avgViews: -1 } },
        ]);

        const seoRanges = ['poor', 'average', 'good', 'excellent'];
        result.forEach(range => {
          expect(seoRanges).to.include(range._id.seoRange);
        });
      });

      it('should identify optimal post length', () => {
        const result = Aggo.aggregate(posts, [
          {
            $addFields: {
              lengthCategory: {
                $switch: {
                  branches: [
                    {
                      case: { $lt: ['$metadata.wordCount', 500] },
                      then: 'short',
                    },
                    {
                      case: { $lt: ['$metadata.wordCount', 1000] },
                      then: 'medium',
                    },
                    {
                      case: { $lt: ['$metadata.wordCount', 1500] },
                      then: 'long',
                    },
                  ],
                  default: 'very-long',
                },
              },
            },
          },
          {
            $group: {
              _id: '$lengthCategory',
              avgViews: { $avg: '$views' },
              avgLikes: { $avg: '$likes' },
              avgReadTime: { $avg: '$metadata.readTime' },
              postCount: { $sum: 1 },
            },
          },
        ]);

        result.forEach(length => {
          expect(['short', 'medium', 'long', 'very-long']).to.include(
            length._id
          );
          expect(length.avgReadTime).to.be.a('number');
        });
      });
    });

    describe('Metamorphic Properties', () => {
      it('should maintain invariant: total views across categories equals sum', () => {
        const totalViews =
          Aggo.aggregate(posts, [
            {
              $group: {
                _id: null,
                total: { $sum: '$views' },
              },
            },
          ])[0]?.total || 0;

        const categoryViews =
          Aggo.aggregate(posts, [
            {
              $group: {
                _id: '$category',
                views: { $sum: '$views' },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$views' },
              },
            },
          ])[0]?.total || 0;

        expect(totalViews).to.equal(categoryViews);
      });

      it('should preserve comment count through transformations', () => {
        const directCount = posts.reduce(
          (sum, post) => sum + (post.comments ? post.comments.length : 0),
          0
        );

        const aggregatedCount =
          Aggo.aggregate(posts, [
            { $unwind: '$comments' },
            { $count: 'totalComments' },
          ])[0]?.totalComments || 0;

        expect(aggregatedCount).to.equal(directCount);
      });

      it('should maintain tag frequency consistency', () => {
        const tagFrequency1 = Aggo.aggregate(posts, [
          { $unwind: '$tags' },
          {
            $group: {
              _id: '$tags',
              count: { $sum: 1 },
            },
          },
        ]);

        const tagFrequency2 = Aggo.aggregate(posts, [
          {
            $project: {
              tags: 1,
            },
          },
          { $unwind: '$tags' },
          {
            $group: {
              _id: '$tags',
              count: { $sum: 1 },
            },
          },
        ]);

        const map1 = new Map(tagFrequency1.map(t => [t._id, t.count]));
        const map2 = new Map(tagFrequency2.map(t => [t._id, t.count]));

        map1.forEach((count, tag) => {
          expect(map2.get(tag)).to.equal(count);
        });
      });

      it('should satisfy distributive property for engagement calculations', () => {
        const categories = [...new Set(posts.map(p => p.category))];

        const totalEngagement = Aggo.aggregate(posts, [
          {
            $group: {
              _id: null,
              totalViews: { $sum: '$views' },
              totalLikes: { $sum: '$likes' },
            },
          },
        ])[0];

        const categoryEngagements = categories.map(
          category =>
            Aggo.aggregate(posts, [
              { $match: { category } },
              {
                $group: {
                  _id: null,
                  totalViews: { $sum: '$views' },
                  totalLikes: { $sum: '$likes' },
                },
              },
            ])[0] || { totalViews: 0, totalLikes: 0 }
        );

        const summedViews = categoryEngagements.reduce(
          (sum, cat) => sum + cat.totalViews,
          0
        );
        const summedLikes = categoryEngagements.reduce(
          (sum, cat) => sum + cat.totalLikes,
          0
        );

        expect(summedViews).to.equal(totalEngagement.totalViews);
        expect(summedLikes).to.equal(totalEngagement.totalLikes);
      });
    });

    describe('Complex Content Queries', () => {
      it('should identify content gaps and opportunities', () => {
        const result = Aggo.aggregate(posts, [
          { $unwind: '$tags' },
          {
            $group: {
              _id: {
                category: '$category',
                tag: '$tags',
              },
              postCount: { $sum: 1 },
              avgViews: { $avg: '$views' },
              lastPublished: { $max: '$publishedDate' },
            },
          },
          {
            $addFields: {
              daysSinceLastPost: {
                $divide: [
                  { $subtract: [new Date(), '$lastPublished'] },
                  1000 * 60 * 60 * 24,
                ],
              },
            },
          },
          {
            $match: {
              $and: [
                { avgViews: { $gte: 100 } },
                { daysSinceLastPost: { $gte: 30 } },
              ],
            },
          },
          { $sort: { avgViews: -1 } },
          { $limit: 10 },
        ]);

        result.forEach(gap => {
          expect(gap.daysSinceLastPost).to.be.at.least(30);
          expect(gap.avgViews).to.be.at.least(100);
        });
      });

      it('should calculate content velocity and momentum', () => {
        const result = Aggo.aggregate(posts, [
          {
            $addFields: {
              ageInDays: {
                $divide: [
                  { $subtract: [new Date(), '$publishedDate'] },
                  1000 * 60 * 60 * 24,
                ],
              },
            },
          },
          {
            $addFields: {
              viewsPerDay: {
                $cond: {
                  if: { $gt: ['$ageInDays', 0] },
                  then: { $divide: ['$views', '$ageInDays'] },
                  else: 0,
                },
              },
              likesPerView: {
                $cond: {
                  if: { $gt: ['$views', 0] },
                  then: { $divide: ['$likes', '$views'] },
                  else: 0,
                },
              },
            },
          },
          {
            $group: {
              _id: '$category',
              avgViewsPerDay: { $avg: '$viewsPerDay' },
              avgLikesPerView: { $avg: '$likesPerView' },
              totalPosts: { $sum: 1 },
              recentPosts: {
                $sum: {
                  $cond: [{ $lt: ['$ageInDays', 30] }, 1, 0],
                },
              },
            },
          },
          {
            $addFields: {
              momentum: {
                $multiply: [
                  '$avgViewsPerDay',
                  '$avgLikesPerView',
                  { $divide: ['$recentPosts', { $max: ['$totalPosts', 1] }] },
                ],
              },
            },
          },
          { $sort: { momentum: -1 } },
        ]);

        result.forEach(category => {
          expect(category.momentum).to.be.a('number');
          expect(category.avgViewsPerDay).to.be.at.least(0);
        });
      });
    });
  });

  function generateBlogPostsFixture(count) {
    const categories = [
      'technology',
      'business',
      'lifestyle',
      'travel',
      'food',
      'health',
    ];
    const tags = [
      'javascript',
      'react',
      'nodejs',
      'mongodb',
      'typescript',
      'devops',
      'cloud',
      'ai',
      'web3',
    ];
    const statuses = ['draft', 'published', 'archived'];

    return Array.from({ length: count }, (_, i) => {
      const publishedDate = new Date(
        Date.now() - Math.random() * 365 * 2 * 24 * 60 * 60 * 1000
      );
      const wordCount = Math.floor(Math.random() * 1800) + 200;

      return {
        _id: `POST-${i + 1}`,
        postId: `post-${i + 1}`,
        title: `Blog Post ${i + 1}`,
        slug: `blog-post-${i + 1}`,
        content: 'Lorem ipsum content...',
        excerpt: 'Short excerpt...',
        authorId: Math.floor(Math.random() * 20) + 1,
        authorName: `Author ${Math.floor(Math.random() * 20) + 1}`,
        publishedDate,
        lastModified: new Date(
          publishedDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
        status:
          statuses[
            Math.random() < 0.8
              ? 1
              : Math.floor(Math.random() * statuses.length)
          ],
        category: categories[Math.floor(Math.random() * categories.length)],
        tags: Array.from(
          { length: Math.floor(Math.random() * 4) + 2 },
          () => tags[Math.floor(Math.random() * tags.length)]
        ),
        views: Math.floor(Math.random() * 50000),
        likes: Math.floor(Math.random() * 1000),
        comments: Array.from(
          { length: Math.floor(Math.random() * 20) },
          (_, j) => ({
            commentId: `comment-${i}-${j}`,
            userId: Math.floor(Math.random() * 1000) + 1,
            userName: `User ${Math.floor(Math.random() * 1000) + 1}`,
            text: 'Comment text...',
            timestamp: new Date(
              publishedDate.getTime() + Math.random() * 60 * 24 * 60 * 60 * 1000
            ),
            likes: Math.floor(Math.random() * 50),
          })
        ),
        metadata: {
          readTime: Math.ceil(wordCount / 200),
          wordCount,
          featured: Math.random() < 0.1,
          seoScore: Math.floor(Math.random() * 100),
        },
      };
    });
  }
});

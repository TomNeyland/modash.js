#!/bin/bash

# Aggo Fixture Demo Script
# This script demonstrates various queries against our generated fixtures

echo "🚀 Aggo Fixture Demo"
echo "======================="
echo

echo "📦 E-commerce Analytics"
echo "-----------------------"
echo "Top 3 product categories by revenue:"
cat fixtures/ecommerce-orders.jsonl | \
  npx aggo '[
    {"$unwind": "$items"},
    {"$group": {
      "_id": "$items.category",
      "revenue": {"$sum": {"$multiply": ["$items.price", "$items.quantity"]}},
      "itemsSold": {"$sum": "$items.quantity"}
    }},
    {"$sort": {"revenue": -1}},
    {"$limit": 3}
  ]' --pretty

echo
echo "📝 Blog Content Insights"
echo "------------------------"
echo "Most engaging posts (likes/views ratio):"
cat fixtures/blog-posts.jsonl | \
  npx aggo '[
    {"$match": {"status": "published", "views": {"$gt": 100}}},
    {"$addFields": {"engagement": {"$divide": ["$likes", "$views"]}}},
    {"$sort": {"engagement": -1}},
    {"$limit": 3},
    {"$project": {"title": 1, "views": 1, "likes": 1, "engagement": 1}}
  ]' --pretty

echo
echo "🌡️ IoT Sensor Monitoring"
echo "------------------------"
echo "Average readings by sensor type:"
cat fixtures/iot-sensors.jsonl | \
  npx aggo '[
    {"$group": {
      "_id": "$sensorType",
      "avgValue": {"$avg": "$value"},
      "minValue": {"$min": "$value"},
      "maxValue": {"$max": "$value"},
      "readingCount": {"$sum": 1}
    }},
    {"$sort": {"_id": 1}}
  ]' --pretty

echo
echo "🏢 HR Analytics"
echo "---------------"
echo "Salary distribution by department:"
cat fixtures/hr-employees.jsonl | \
  npx aggo '[
    {"$group": {
      "_id": "$department",
      "avgSalary": {"$avg": "$salary"},
      "minSalary": {"$min": "$salary"},
      "maxSalary": {"$max": "$salary"},
      "headcount": {"$sum": 1}
    }},
    {"$sort": {"avgSalary": -1}}
  ]' --pretty

echo
echo "💰 Financial Transactions"
echo "-------------------------"
echo "Transaction volume by type:"
cat fixtures/financial-transactions.jsonl | \
  npx aggo '[
    {"$group": {
      "_id": "$type",
      "totalAmount": {"$sum": "$amount"},
      "avgAmount": {"$avg": "$amount"},
      "count": {"$sum": 1}
    }},
    {"$sort": {"totalAmount": -1}}
  ]' --pretty

echo
echo "📱 Social Media Analytics"
echo "-------------------------"
echo "Most active users:"
cat fixtures/social-posts.jsonl | \
  npx aggo '[
    {"$group": {
      "_id": "$userId",
      "username": {"$first": "$username"},
      "postCount": {"$sum": 1},
      "totalLikes": {"$sum": "$likes"},
      "totalShares": {"$sum": "$shares"},
      "avgEngagement": {"$avg": {"$add": ["$likes", "$shares", "$comments"]}}
    }},
    {"$sort": {"avgEngagement": -1}},
    {"$limit": 5},
    {"$project": {
      "username": 1,
      "postCount": 1,
      "avgEngagement": {"$round": ["$avgEngagement", 2]}
    }}
  ]' --pretty

echo
echo "✅ Demo Complete!"
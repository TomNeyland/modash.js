#!/bin/bash

# Aggo Large Dataset Benchmark Script
# This script runs performance benchmarks on large datasets

set -e

echo "🚀 Aggo Large Dataset Benchmark"
echo "=================================="
echo

# Configuration
CLI_PATH="./dist/cli.js"
FIXTURES_DIR="fixtures/large"
RESULTS_FILE="benchmark-results-$(date +%Y%m%d-%H%M%S).txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to measure command execution time
measure_time() {
    local name="$1"
    local command="$2"

    echo -n "  ⏱️  $name: "

    # Run command and capture time (macOS compatible)
    local start=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')
    eval "$command" > /dev/null 2>&1
    local end=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')

    # Duration is already in milliseconds
    local duration=$(( end - start ))

    echo "${GREEN}${duration}ms${NC}"
    echo "$name: ${duration}ms" >> "$RESULTS_FILE"

    return 0
}

# Helper function to measure with output line count
measure_with_output() {
    local name="$1"
    local command="$2"

    echo -n "  📊 $name: "

    # Run command and capture output
    local start=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')
    local output=$(eval "$command" 2>/dev/null)
    local end=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')

    # Calculate duration and line count
    local duration=$(( end - start ))
    local lines=$(echo "$output" | wc -l | tr -d ' ')

    echo "${GREEN}${duration}ms${NC} (${lines} output lines)"
    echo "$name: ${duration}ms (${lines} lines)" >> "$RESULTS_FILE"

    return 0
}

# Check if fixtures exist
check_fixtures() {
    echo "📁 Checking fixtures..."

    if [ ! -f "$FIXTURES_DIR/orders-100k.jsonl" ]; then
        echo "  ⚡ Generating 100k orders fixture..."
        npx tsx scripts/generate-large-fixtures.ts orders
    else
        echo "  ✅ 100k orders fixture exists"
    fi

    if [ ! -f "$FIXTURES_DIR/events-100k.jsonl" ]; then
        echo "  ⚡ Generating 100k events fixture..."
        npx tsx scripts/generate-large-fixtures.ts events
    else
        echo "  ✅ 100k events fixture exists"
    fi

    echo
}

# Run benchmarks
run_benchmarks() {
    echo "🏃 Running Benchmarks"
    echo "--------------------"
    echo

    # 100K Orders Benchmarks
    echo "📦 100K Orders Dataset"
    echo "~~~~~~~~~~~~~~~~~~~~~~"

    measure_with_output "Total Revenue" \
        "cat $FIXTURES_DIR/orders-100k.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": null, \"total\": {\"\\$sum\": \"\\$totalAmount\"}}}]'"

    measure_with_output "Group by Status" \
        "cat $FIXTURES_DIR/orders-100k.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": \"\\$status\", \"count\": {\"\\$sum\": 1}}}]'"

    measure_with_output "Filter High Value" \
        "cat $FIXTURES_DIR/orders-100k.jsonl | node $CLI_PATH '[{\"\\$match\": {\"totalAmount\": {\"\\$gte\": 10000}}}]' | wc -l"

    measure_with_output "Complex Pipeline" \
        "cat $FIXTURES_DIR/orders-100k.jsonl | node $CLI_PATH '[{\"\\$match\": {\"status\": \"delivered\"}}, {\"\\$group\": {\"_id\": \"\\$priority\", \"revenue\": {\"\\$sum\": \"\\$totalAmount\"}}}, {\"\\$sort\": {\"revenue\": -1}}]'"

    echo

    # 100K Events Benchmarks (if available)
    if [ -f "$FIXTURES_DIR/events-100k.jsonl" ]; then
        echo "📊 100K Events Dataset"
        echo "~~~~~~~~~~~~~~~~~~~~~"

        measure_with_output "Event Types" \
            "cat $FIXTURES_DIR/events-100k.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": \"\\$eventType\", \"count\": {\"\\$sum\": 1}}}]'"

        measure_with_output "User Sessions" \
            "cat $FIXTURES_DIR/events-100k.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": \"\\$sessionId\", \"events\": {\"\\$sum\": 1}}}, {\"\\$match\": {\"events\": {\"\\$gte\": 5}}}, {\"\\$limit\": 100}]'"

        echo
    fi

    # 1M Orders Benchmarks (if available)
    if [ -f "$FIXTURES_DIR/orders-1m.jsonl" ]; then
        echo "📦 1M Orders Dataset"
        echo "~~~~~~~~~~~~~~~~~~~"
        echo "  ⚠️  Large dataset - this may take a moment..."

        measure_time "1M Total Revenue" \
            "cat $FIXTURES_DIR/orders-1m.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": null, \"total\": {\"\\$sum\": \"\\$totalAmount\"}}}]'"

        measure_time "1M Group by Status" \
            "cat $FIXTURES_DIR/orders-1m.jsonl | node $CLI_PATH '[{\"\\$group\": {\"_id\": \"\\$status\", \"count\": {\"\\$sum\": 1}}}]'"

        echo
    fi
}

# Calculate throughput
calculate_throughput() {
    echo "📈 Throughput Analysis"
    echo "~~~~~~~~~~~~~~~~~~~~~"

    if [ -f "$FIXTURES_DIR/orders-100k.jsonl" ]; then
        echo -n "  100K orders aggregation: "

        local start=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')
        cat "$FIXTURES_DIR/orders-100k.jsonl" | node "$CLI_PATH" '[{"$group": {"_id": null, "count": {"$sum": 1}}}]' > /dev/null 2>&1
        local end=$(perl -MTime::HiRes=time -e 'printf "%.0f\n", time*1000')

        local duration_ms=$(( end - start ))
        local duration_s=$(echo "scale=3; $duration_ms / 1000" | bc)
        local throughput=$(echo "scale=0; 100000 / $duration_s" | bc)

        echo "${GREEN}${throughput} docs/sec${NC}"
        echo "Throughput (100K): ${throughput} docs/sec" >> "$RESULTS_FILE"
    fi

    echo
}

# Main execution
main() {
    echo "📝 Results will be saved to: $RESULTS_FILE"
    echo

    # Initialize results file
    echo "Aggo Benchmark Results - $(date)" > "$RESULTS_FILE"
    echo "===================================" >> "$RESULTS_FILE"
    echo >> "$RESULTS_FILE"

    # Check and generate fixtures if needed
    check_fixtures

    # Run benchmarks
    run_benchmarks

    # Calculate throughput
    calculate_throughput

    # Summary
    echo "✅ Benchmark Complete!"
    echo
    echo "📊 Summary of Results:"
    echo "---------------------"
    cat "$RESULTS_FILE" | grep -E "ms|docs/sec" | tail -10
    echo
    echo "Full results saved to: ${GREEN}$RESULTS_FILE${NC}"
}

# Run main function
main
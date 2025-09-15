#!/bin/bash
# CI check to ensure no operator snapshot() methods iterate store.liveSet

echo "🔍 Checking for liveSet usage in snapshot methods..."

# Check for liveSet iteration in snapshot methods
# We allow it in MatchOperator for first stage initialization
violations=$(grep -n "for.*liveSet" src/modash/crossfilter-operators.ts | grep -v "// Use upstream active IDs if available")

if [ -n "$violations" ]; then
  echo "❌ VIOLATION: Found liveSet iteration in operators:"
  echo "$violations"
  exit 1
fi

# Check for store.liveSet access in snapshot methods (more general)
# Allow the fallback pattern in MatchOperator and comments
snapshot_violations=$(grep -A 20 "snapshot(" src/modash/crossfilter-operators.ts | grep "store\.liveSet" | grep -v "Array.from" | grep -v "//")

if [ -n "$snapshot_violations" ]; then
  echo "❌ VIOLATION: Found direct liveSet access in snapshot methods:"
  echo "$snapshot_violations"
  exit 1
fi

echo "✅ No inappropriate liveSet usage found in operators"

# Run invariant tests
echo ""
echo "🧪 Running invariant tests..."
npx tsx tests/debug/test_invariants.mjs

exit $?
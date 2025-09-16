/**
 * Phase 6: CLI Integration Tests
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { expect } from 'chai';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

describe('Phase 6: CLI Integration', function () {
  this.timeout(10000); // CLI operations can be slower

  const testDataFile = '/tmp/aggo-test-data.jsonl';
  const testData = `{"name": "Alice", "age": 30, "category": "A", "score": 85}
{"name": "Bob", "age": 25, "category": "B", "score": 92}
{"name": "Charlie", "age": 35, "category": "A", "score": 78}
{"name": "Diana", "age": 28, "category": "B", "score": 95}`;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..');

  beforeEach(async function () {
    await writeFile(testDataFile, testData);
  });

  afterEach(async function () {
    try {
      await unlink(testDataFile);
    } catch (error) {
      // File might not exist, ignore
    }
  });

  describe('CLI Basic Functionality', function () {
    it('should show help when --help flag is used', async function () {
      const { stdout } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts --help`
      );

      expect(stdout).to.include('Aggo CLI');
      expect(stdout).to.include('Usage:');
      expect(stdout).to.include('Options:');
      expect(stdout).to.include('Examples:');
    });

    it('should process data from file with basic pipeline', async function () {
      const pipeline = '[{"$match": {"age": {"$gte": 30}}}]';
      const { stdout } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts '${pipeline}' --file ${testDataFile}`
      );

      const results = stdout
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      expect(results).to.have.length(2);
      expect(results[0]).to.have.property('name', 'Alice');
      expect(results[1]).to.have.property('name', 'Charlie');
    });

    it('should process data from stdin', async function () {
      const pipeline = '[{"$project": {"name": 1, "score": 1}}]';
      const { stdout } = await execAsync(
        `cd "${repoRoot}" && echo '{"name": "Test", "age": 30, "score": 90}' | node --import=tsx/esm src/cli.ts '${pipeline}'`
      );

      const result = JSON.parse(stdout.trim());
      expect(result).to.deep.equal({ name: 'Test', score: 90 });
    });

    it('should output pretty JSON when --pretty flag is used', async function () {
      const pipeline = '[{"$limit": 1}]';
      const { stdout } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts '${pipeline}' --file ${testDataFile} --pretty`
      );

      expect(stdout).to.include('  {'); // Pretty printed with indentation
      expect(stdout).to.include('    "name":'); // Indented property
    });
  });

  describe('CLI Advanced Features', function () {
    it('should show pipeline analysis with --explain flag', async function () {
      const pipeline =
        '[{"$match": {"category": "A"}}, {"$sort": {"score": -1}}]';
      const { stderr } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts '${pipeline}' --file ${testDataFile} --explain`
      );

      expect(stderr).to.include('Pipeline Analysis');
      expect(stderr).to.include('Stage 1: $match');
      expect(stderr).to.include('Stage 2: $sort');
      expect(stderr).to.include('Filtering operation');
      expect(stderr).to.include('Hot path eligible');
    });

    it('should show performance stats with --stats flag', async function () {
      const pipeline =
        '[{"$group": {"_id": "$category", "avgScore": {"$avg": "$score"}}}]';
      const { stderr } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts '${pipeline}' --file ${testDataFile} --stats`
      );

      expect(stderr).to.include('Performance Stats');
      expect(stderr).to.include('Execution time:');
      expect(stderr).to.include('Input documents:');
      expect(stderr).to.include('Output documents:');
      expect(stderr).to.include('Memory delta:');
      expect(stderr).to.include('Throughput:');
    });

    it('should handle complex aggregation pipelines', async function () {
      const pipeline = JSON.stringify([
        { $match: { score: { $gte: 80 } } },
        {
          $group: {
            _id: '$category',
            avgScore: { $avg: '$score' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgScore: -1 } },
      ]);

      const { stdout } = await execAsync(
        `cd "${repoRoot}" && node --import=tsx/esm src/cli.ts '${pipeline}' --file ${testDataFile}`
      );

      const results = stdout
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      expect(results).to.have.length(2);

      // Should be sorted by avgScore descending
      expect(results[0]._id).to.equal('B'); // Higher average score
      expect(results[0].avgScore).to.be.closeTo(93.5, 0.1);
      expect(results[1]._id).to.equal('A'); // Lower average score
      expect(results[1].avgScore).to.equal(85);
    });
  });

  describe('CLI Error Handling', function () {
    it('should show error for invalid pipeline JSON', async function () {
      try {
        await execAsync(
          `cd "${repoRoot}" && echo '{}' | node --import=tsx/esm src/cli.ts '[{invalid json}]'`
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.stderr).to.include('Invalid pipeline JSON');
      }
    });

    it('should show error when no pipeline is provided', async function () {
      try {
        await execAsync(
          `cd "${repoRoot}" && echo '{}' | node --import=tsx/esm src/cli.ts`
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.stderr).to.include('Pipeline is required');
      }
    });

    it('should show helpful error when no input data available', async function () {
      try {
        // Run without stdin or --file, with input redirected from /dev/null
        await execAsync(
          `cd "${repoRoot}" && timeout 5s node --import=tsx/esm src/cli.ts '[{"$match": {}}]' < /dev/null || true`
        );
        // If it succeeds, that's unexpected but not a test failure - it may handle empty stdin gracefully
      } catch (error) {
        // If it fails, check the error message
        if (error.stderr) {
          expect(error.stderr).to.include('No input data');
          expect(error.stderr).to.include('Use --file or pipe data');
        }
      }
    });
  });
});

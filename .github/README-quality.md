# Quality Tooling Documentation

This document describes the comprehensive quality tooling setup for modash.js.

## Overview

The project uses modern, best-practice quality tooling with deep GitHub integration:

- **Prettier** for code formatting
- **ESLint** with modern rule presets for code linting
- **TypeScript** for type checking
- **c8** for test coverage reporting
- **GitHub Actions** for automated CI/CD with comprehensive reporting

## Quality Scripts

### Core Quality Commands

```bash
# Run all quality checks (formatting, linting, type checking, tests with coverage)
npm run quality

# Auto-fix code formatting and linting issues
npm run quality:fix

# Individual checks
npm run format:check        # Check code formatting
npm run format             # Auto-fix formatting
npm run lint               # Lint code
npm run lint:fix           # Auto-fix linting issues
npm run type-check         # TypeScript type checking
npm run test:coverage      # Run tests with coverage report
```

### Quality Standards

- **Code Coverage**: Minimum 80% line coverage, 70% branch coverage
- **Code Style**: Prettier with single quotes, trailing commas, 2-space indentation
- **Linting**: Modern ESLint rules with Prettier integration
- **Type Safety**: TypeScript checking for JavaScript files

## GitHub Actions Workflows

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

Runs on push/PR to main branches:
- Multi-Node.js version testing (18, 20, 22)
- Quality checks across all Node versions
- Security scanning with CodeQL
- Dependency vulnerability scanning
- Build validation and documentation generation

### 2. Quality Gate (`.github/workflows/quality-gate.yml`)

Detailed quality reporting for PRs:
- Comprehensive test reporting with TAP format
- Coverage reporting with visual summaries
- ESLint results with SARIF integration
- TypeScript type checking results
- Code formatting validation
- Detailed GitHub check summaries

### 3. PR Checks (`.github/workflows/pr-checks.yml`)

Advanced PR validation:
- Smart change detection (code vs docs vs tests)
- Performance regression testing
- Export validation for builds
- Coverage comments on PRs
- Conditional execution based on changes

### 4. Release Pipeline (`.github/workflows/release.yml`)

Automated releases on version tags:
- Full quality validation before release
- Automated GitHub releases with notes
- NPM publishing with proper authentication
- Build artifact archival

### 5. Dependency Management (`.github/workflows/dependency-update.yml`)

Weekly automated dependency updates:
- Automated dependency scanning
- Quality-validated updates
- Automated PR creation for updates
- Safe, incremental dependency management

## GitHub Integration Features

### Check Annotations

- **ESLint**: SARIF format integration for inline code annotations
- **Test Results**: TAP format reporting with detailed failure information  
- **Coverage**: Visual coverage reporting with change impact
- **Type Errors**: TypeScript error reporting in PR reviews

### Status Checks

All workflows provide status checks that:
- Block PR merging if quality gates fail
- Provide detailed failure information
- Link to full workflow logs
- Show coverage changes and trends

### Automated Actions

- **Dependency Updates**: Weekly automated PRs for dependency updates
- **Release Creation**: Automatic releases on version tags
- **Performance Monitoring**: Regression detection in PR checks
- **Security Scanning**: Automated vulnerability detection

## Configuration Files

### Prettier (`.prettierrc.json`)

Modern, consistent code formatting with:
- Single quotes for strings
- Trailing commas (ES5)
- 2-space indentation  
- 80-character line width
- Unix line endings

### ESLint (`eslint.config.js`)

Comprehensive modern linting with:
- ES2022+ feature support
- Prettier integration (no conflicts)
- Modern JavaScript best practices
- Error prevention rules
- Performance optimization rules
- Test-specific rule overrides

### TypeScript (`tsconfig.json`)

Production-ready TypeScript configuration:
- ES2022 target with modern libraries
- Strict type checking for new code
- Declaration file generation
- Source map support for debugging
- Comprehensive error detection

### Coverage (`.c8rc.json`)

Test coverage requirements:
- 80% minimum line coverage
- 70% minimum branch coverage
- HTML, LCOV, and JSON reporting
- Exclusion of non-source files
- Fail-fast on coverage violations

## Best Practices

### Development Workflow

1. **Before Committing**: Run `npm run quality:fix` to auto-fix issues
2. **During Development**: Use `npm run test:watch` for continuous testing
3. **Before PR**: Ensure `npm run quality` passes completely
4. **Code Reviews**: Check GitHub Action results for comprehensive quality reports

### Maintaining Quality

- All quality tools run automatically in CI/CD
- PRs cannot be merged without passing quality gates
- Coverage trends are monitored and reported
- Dependencies are automatically updated and validated

### Integration with IDEs

The quality tooling integrates with modern IDEs:
- **VS Code**: ESLint and Prettier extensions provide real-time feedback
- **WebStorm**: Built-in support for all configured tools
- **Editor Config**: Consistent formatting across all editors

## Troubleshooting

### Common Issues

**ESLint/Prettier Conflicts**: 
- Resolved automatically via `eslint-config-prettier`
- Run `npm run quality:fix` to resolve formatting issues

**TypeScript Errors**:
- Library type issues are resolved via `skipLibCheck`
- Focus on application code type safety

**Coverage Failures**:
- Check `.c8rc.json` for coverage thresholds
- Add tests for uncovered code paths
- Use coverage reports to identify gaps

**CI/CD Failures**:
- Check workflow logs for detailed error information
- Local reproduction via `npm run quality`
- Review GitHub check annotations for specific issues

This quality tooling ensures modash.js maintains production-ready code standards while providing excellent developer experience.
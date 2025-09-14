# 🧩 Contributing Plugins to Modash.js

Modash.js has a **zero-dependency core**. Anything beyond core operators, hot-path optimizations, and IVM streaming must live in **optional plugin packages**.
This keeps the core small, fast, and portable — while still enabling an ecosystem of extensions.

---

## 📦 Plugin Philosophy

* **Core stays zero-deps**: no external libraries inside `modash`.
* **Plugins are opt-in**: published under `@modash/<name>`.
* **Each plugin is its own package** in `packages/<name>`.
* **No runtime coupling**: core doesn’t import plugin code. Plugins import and extend core.

---

## 🔧 Plugin Structure

Each plugin package should look like:

```
packages/
  sql/
    package.json
    src/
      index.ts
      ...
    tests/
      ...
    README.md
```

### `package.json` guidelines

* `"name": "@modash/sql"` (scoped under `@modash/`)
* `"dependencies"`: minimal, only what your plugin actually needs
* `"peerDependencies"`: use when you want the host app to bring its own (e.g. `rxjs`)
* `"optionalDependencies"`: for truly optional extras
* `"main"` + `"exports"`: must expose a clean ESM entry point

---

## 🧩 Plugin API Pattern

All plugins should export a **clear entrypoint** with:

```ts
// Example: packages/sql/src/index.ts

/** Compile a SQL string into a Modash pipeline */
export function compileSql(query: string): Pipeline { /* ... */ }

/** Run a SQL query against docs (array or async stream) */
export async function runSql(
  docs: Document[] | AsyncIterable<Document>,
  query: string,
  opts?: RunOptions
): Promise<Document[]> { /* ... */ }

/** Explain how the SQL maps to a pipeline */
export function explainSql(query: string): ExplainReport { /* ... */ }
```

Guidelines:

* Prefer **pure functions** that take input and return results.
* Use `modash.aggregate()` internally — don’t fork core behavior.
* Expose **`.explain`** and **`.validate`** helpers when possible.

---

## 🛠 CLI Support (Optional)

Plugins may ship their own CLI entrypoint:

```json
// package.json
"bin": {
  "modash-sql": "./dist/cli.js"
}
```

Conventions:

* CLI must accept **JSONL via stdin** or `--file`.
* Queries passed as a **string argument**.
* Must support `--explain`, `--stats`, and `--watch` flags if applicable.

Example:

```bash
cat data.jsonl | npx modash-sql "select count(*) from stdin"
```

---

## 🧪 Testing

* Each plugin must have its own test suite (`packages/<name>/tests`).
* Tests should verify:

  * **Correctness**: plugin produces the same results as equivalent JSON pipelines.
  * **Error ergonomics**: unsupported features return clear errors.
  * **Performance**: no regressions vs. equivalent core pipelines.
* Add a **snapshot suite** mapping plugin DSL → JSON pipeline.

---

## 📖 Documentation

Each plugin should ship a `README.md` with:

* **Quick start** example
* **Supported features**
* **Limitations / fallbacks**
* **Install instructions**:

  ```bash
  npm install @modash/sql
  ```
* Optional badges (CI status, npm version, etc.)

---

## 🛑 Things to Avoid

* Don’t add heavy deps just to parse simple DSLs (e.g. avoid 10MB SQL parsers).
* Don’t patch core files — plugins must extend via imports.
* Don’t silently fall back — always emit clear errors/logs when unsupported.

---

## ✅ Contribution Workflow

1. Open an issue describing your plugin idea.
2. Fork + branch under `feature/plugin-<name>`.
3. Implement under `packages/<name>`.
4. Add tests + docs.
5. Open a PR tagged `[plugin:<name>]`.

Core maintainers will review for:

* API consistency
* Zero-dep core preservation
* DX quality (docs, errors, explainability)

---

## 🌱 Examples of Plugin Ideas

* `@modash/sql`: SQL → pipeline transpiler
* `@modash/rxjs`: Reactive wrappers exposing `.toObservable()` and `.fromObservable()`
* `@modash/duckdb`: Connector for DuckDB WASM backend
* `@modash/geo`: Extra geo operators, with optional turf.js dependency

---

Do you want me to also draft a **boilerplate plugin template** (package.json + index.ts + test stub) so contributors can literally copy-paste and start?

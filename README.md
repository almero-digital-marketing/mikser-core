<p align="center">
  <img src="mikser-lockup-stacked.svg" alt="mikser" width="198" />
</p>

# Mikser Documentation

Mikser is a precision content engine for Node.js — built around a strict lifecycle, a composable plugin system, and zero compromise on output control. Every document, asset, and template flows through the same deterministic pipeline. Plugins hook in at any phase; nothing runs outside the cycle. The result is a system that scales from a single markdown blog to a multi-language, multi-format publishing platform — without ever losing sight of what it produced and why.

## Documentation Index

| Document                                              | Audience           | Description                                        |
| ----------------------------------------------------- | ------------------ | -------------------------------------------------- |
| [Getting Started](./documentation/getting-started.md) | Users              | Installation, first project, basic usage           |
| [Configuration](./documentation/configuration.md)     | Users              | All CLI options and config file reference          |
| [Lifecycle](./documentation/lifecycle.md)             | Users & Developers | Complete lifecycle phases and hook system          |
| [Plugins](./documentation/plugins.md)                 | Users & Developers | Built-in plugins, writing custom plugins           |
| [Entities](./documentation/entities.md)               | Users & Developers | Entity model, operations, journal, catalog         |
| [Rendering](./documentation/rendering.md)             | Users & Developers | Render pipeline, render plugins, render modes      |
| [Watch Mode](./documentation/watch-mode.md)           | Users              | File watching, scheduled tasks, incremental builds |
| [Architecture](./documentation/architecture.md)       | Developers         | System design, module structure, extension points  |
| [API Reference](./documentation/api-reference.md)     | Developers         | Complete public API reference                      |

## Quick Start

```bash
npm install mikser-io
```

```js
// mikser.config.js
export default {
	plugins: ['documents', 'layouts'],
	layouts: {
		cleanUrls: true,
	},
}
```

```bash
npx mikser
```

## Core Concepts

- **Lifecycle** — Processing runs through fixed phases: initialize → load → import → process → persist → render → finalize. Plugins hook into any phase.
- **Entities** — Everything is an entity (document, file, layout, asset). Entities flow through the journal and are tracked in the catalog.
- **Plugins** — Functionality is delivered via plugins. Built-in plugins handle common sources (documents, files, layouts, assets). Custom plugins can be added to any project.
- **Runtime Singleton** — A plain module-level object holds all global state and coordinates the lifecycle. The ES module cache guarantees every importer gets the same instance.
- **Watch Mode** — In watch mode, file changes trigger incremental re-processing without restarting.

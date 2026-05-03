# Mikser Core Documentation

Mikser Core is a lifecycle-driven static site generator and content processing pipeline for Node.js. It provides a hook-based architecture where plugins register callbacks at each phase of the lifecycle, enabling composable content workflows — from loading and transforming documents to rendering and deploying output.

## Documentation Index

| Document | Audience | Description |
|----------|----------|-------------|
| [Getting Started](./getting-started.md) | Users | Installation, first project, basic usage |
| [Configuration](./configuration.md) | Users | All CLI options and config file reference |
| [Lifecycle](./lifecycle.md) | Users & Developers | Complete lifecycle phases and hook system |
| [Plugins](./plugins.md) | Users & Developers | Built-in plugins, writing custom plugins |
| [Entities](./entities.md) | Users & Developers | Entity model, operations, journal, catalog |
| [Rendering](./rendering.md) | Users & Developers | Render pipeline, render plugins, render modes |
| [Watch Mode](./watch-mode.md) | Users | File watching, scheduled tasks, incremental builds |
| [Architecture](./architecture.md) | Developers | System design, module structure, extension points |
| [API Reference](./api-reference.md) | Developers | Complete public API reference |

## Quick Start

```bash
npm install mikser-core
```

```js
// mikser.config.js
export default {
  plugins: ['documents', 'layouts'],
  layouts: {
    cleanUrls: true
  }
}
```

```bash
npx mikser
```

## Core Concepts

- **Lifecycle** — Processing runs through fixed phases: initialize → load → import → process → persist → render → finalize. Plugins hook into any phase.
- **Entities** — Everything is an entity (document, file, layout, asset). Entities flow through the journal and are tracked in the catalog.
- **Plugins** — Functionality is delivered via plugins. Built-in plugins handle common sources (documents, files, layouts, assets). Custom plugins can be added to any project.
- **Runtime Singleton** — A static class holds all global state and coordinates the lifecycle.
- **Watch Mode** — In watch mode, file changes trigger incremental re-processing without restarting.

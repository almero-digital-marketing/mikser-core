# Getting Started

## Prerequisites

- Node.js 18 or later
- A project with `"type": "module"` in `package.json` (Mikser is ESM-only)

## Installation

### As a project dependency

```bash
npm install mikser-core
```

### As a global CLI

```bash
npm install -g mikser-core
mikser
```

## Your First Project

### 1. Project structure

```
my-site/
├── content/          # Source documents
│   ├── index.md
│   └── about.md
├── layouts/          # HTML templates
│   └── page.hbs
├── mikser.config.js
└── package.json
```

### 2. Configuration file

Create `mikser.config.js` in the root of your project:

```js
// mikser.config.js
export default {
  plugins: ['documents', 'layouts'],

  documents: {
    documentsFolder: 'content'
  },

  layouts: {
    layoutsFolder: 'layouts',
    autoLayouts: true,
    cleanUrls: true
  }
}
```

### 3. A document

```markdown
---
title: Home
description: Welcome to my site
---

# Hello World

This is the homepage.
```

Front matter (YAML between `---`) is extracted into `entity.meta`. The remaining content is in `entity.content`.

### 4. A layout template

Layouts are Handlebars templates:

```handlebars
{{! layouts/page.hbs }}
<!DOCTYPE html>
<html>
<head>
  <title>{{document.meta.title}}</title>
</head>
<body>
  {{{document.content}}}
</body>
</html>
```

### 5. Run

```bash
npx mikser
# or
node node_modules/.bin/mikser
```

Output will be written to the `out/` folder.

## CLI Options

```
mikser [options]

  -i, --working-folder <folder>    Working folder (default: ./)
  -p, --plugins [plugins...]       Plugins to load
  -c, --config <file>              Config file path (default: ./mikser.config.js)
  -m, --mode <mode>                Runtime mode (default: development)
  -r, --clear                      Clear output before run
  -o, --output-folder <folder>     Output folder (default: out)
  -w, --watch                      Watch for file changes
  -d, --debug                      Show debug log statements
  -t, --trace                      Show trace log statements
  -e, --runtime-folder <folder>    Runtime/temp folder (default: runtime)
```

## Using Mikser Programmatically

```js
import { setup } from 'mikser-core'

const runtime = await setup({
  workingFolder: './my-project',
  plugins: ['documents', 'layouts'],
  outputFolder: 'dist',
  mode: 'production'
})

await runtime.start()
```

Any option passed to `setup()` overrides CLI arguments and config file values.

## Programmatic API with Custom Hooks

```js
import { setup, onFinalized, useLogger } from 'mikser-core'

onFinalized(async () => {
  const logger = useLogger()
  logger.info('Build complete — deploying...')
  // deploy logic
})

const runtime = await setup({ clear: true })
await runtime.start()
```

## Output Structure

After a successful run:

```
out/
├── index.html          # Rendered pages
├── about/
│   └── index.html      # Clean URLs produce folders
runtime/
├── catalog.json        # Entity catalog snapshot
├── journal.db          # SQLite journal (temporary)
└── render-details.json # Render results
```

## Watch Mode

```bash
mikser --watch
```

In watch mode Mikser watches all source folders. When a file changes, it runs only the process → render → finalize cycle (not the full import), making incremental rebuilds fast.

## Next Steps

- [Configuration Reference](./configuration.md) — all config options in detail
- [Plugins](./plugins.md) — available plugins and how to write your own
- [Lifecycle](./lifecycle.md) — understand the processing phases
- [Rendering](./rendering.md) — how templates and renderers work

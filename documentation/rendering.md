# Rendering

The render system executes template processing and asset transformation. It supports three execution modes and a layered plugin system that loads capabilities on demand per entity.

## How Rendering Works

Rendering is triggered by RENDER operations in the journal. Each entry describes one job: an entity, a renderer name, options, and context data.

```
RENDER journal entries
        │
        ▼
   onRender hook (engine.js)
        │
        ├── For each unique entity:destination pair
        │
        ▼
   render(renderOptions)    ← src/render.js
        │
        ├── Load context plugins    (context.plugins[])
        ├── Load renderer plugin   (render-{options.renderer})
        ├── Load entity plugins    (entity.meta.plugins[])
        ├── Load options plugins   (options.plugins[])
        │
        ├── Call plugin.load() on each plugin
        │
        └── Call renderer.render()
              └── Returns rendered content
```

## Execution Modes

Controlled by `options.tasks`:

| Mode | Constant | Description |
|------|----------|-------------|
| Pool | `TASKS.POOL` | Runs in main process. Fast for small jobs. Default. |
| Queue | `TASKS.QUEUE` | Sequential queue (p-queue). Useful when renders must not overlap. |
| Worker | `TASKS.WORKER` | Runs in a Piscina worker thread. Best for CPU-heavy transforms (images). |

Set via render options:

```js
await renderEntity(entity, { renderer: 'hbs', tasks: 'POOL' })
await renderEntity(entity, { renderer: 'preset', tasks: 'WORKER' })
```

## Queue Concurrency

The number of parallel renders (pool mode) is controlled by `options.threads` (default: 4):

```js
const runtime = await setup({ threads: 8 })
```

## The Render Function

```js
// src/render.js — exported for both direct calls and worker execution
render({
  entity,     // The entity being rendered
  options,    // { renderer, tasks, plugins, ...runtimeOptions }
  config,     // Render-prefixed config keys (render-hbs, render-preset, etc.)
  context,    // Layout context (data, plugins)
  state,      // runtime.state snapshot
  logger,     // Logger instance
  port        // MessagePort (worker mode only)
})
```

The `config` object passed to render contains only keys from `runtime.config` that start with `render-`, so plugins can have render-time configuration:

```js
// mikser.config.js
export default {
  'render-hbs': {
    helpers: ['./helpers/custom.js']
  }
}
```

## The Runtime Object in Templates

Inside a render, a `runtime` object is assembled and passed to all plugins:

```js
{
  [entity.type]: entity,   // e.g. runtime.document = entity
  entity,                  // same reference
  plugins,                 // loaded plugin instances keyed by name
  config,                  // render config
  data: context.data,      // context data from layout's load()
  content()                // async function: reads entity.source as UTF-8
}
```

Render plugins extend this object further (e.g. `runtime.href`, `runtime.asset`, `runtime.resource`).

## Plugin Load / Render Protocol

Each render plugin can export two functions:

```js
export async function load({ entity, options, config, context, runtime, state, logger }) {
  // Runs once per render job
  // Extend runtime with helpers, load external data, register partials, etc.
  runtime.myHelper = (arg) => `result: ${arg}`
}

export async function render({ entity, options, config, context, plugins, runtime, state, logger }) {
  // The actual rendering logic
  // Return the rendered content as a string, or a file path
  const template = await runtime.content()
  return myTemplateEngine(template, runtime)
}
```

Only the renderer plugin (named `render-{options.renderer}`) is expected to export `render()`. Other plugins (loaded via `context.plugins`, `entity.meta.plugins`, `options.plugins`) typically only export `load()`.

---

## Renderer Plugins

### `render-hbs` — Handlebars

The primary template renderer. Compiles and executes a Handlebars template.

**Config key:** `render-hbs`

**Usage:**

```js
await renderEntity(entity, { renderer: 'hbs' }, context)
```

**Template context:**

All properties of the `runtime` object are available directly in the template:

```handlebars
{{! layouts/page.hbs }}
<!DOCTYPE html>
<html lang="en">
<head>
  <title>{{document.meta.title}}</title>
</head>
<body>
  <main>
    {{{document.content}}}
  </main>
  <nav>
    <a href="{{href '/'}}">Home</a>
    <a href="{{href '/about'}}">About</a>
  </nav>
</body>
</html>
```

**Available variables in templates:**
- `document` (or the entity type) — the entity being rendered
- `entity` — same
- `plugins` — loaded plugin instances
- `config` — render config
- `data` — context data from layout's load()
- All helpers registered by render plugins

**Handlebars helpers included:**

Mikser ships with [handlebars-helpers](https://github.com/helpers/handlebars-helpers), providing:

| Category | Helpers |
|----------|---------|
| Arrays | `after`, `before`, `filter`, `first`, `last`, `map`, `sort`, `unique`, ... |
| Collections | `isEmpty`, `iterate`, ... |
| Comparisons | `eq`, `ne`, `lt`, `gt`, `and`, `or`, `if`, ... |
| Dates | `moment` (requires moment.js) |
| Math | `add`, `subtract`, `multiply`, `divide`, `ceil`, `floor`, `round`, ... |
| Strings | `lowercase`, `uppercase`, `trim`, `truncate`, `replace`, `startsWith`, ... |
| URLs | `encodeURI`, `decodeURI`, ... |

**Partials:** Any layout with a name starting with `partials` and `format: 'hbs'` is automatically registered as a Handlebars partial:
```
layouts/
└── partials/
    ├── header.hbs   → {{> partials/header}}
    └── footer.hbs   → {{> partials/footer}}
```

---

### `render-preset` — Asset Presets

Runs an asset transformation preset (e.g. image resizing, conversion).

**Usage:**

```js
// Typically queued by the assets plugin automatically
await renderEntity(entity, { renderer: 'preset', tasks: 'WORKER' })
```

The entity must have `entity.preset` set (done by the assets plugin). The preset module is loaded and its default export is called with the full render context.

---

## Helper Render Plugins

These plugins extend the `runtime` object inside templates. They are loaded automatically when the `render-hbs` renderer is used, or can be listed in `context.plugins`.

### `render-href` — Link Resolution

Resolves internal links using the layouts sitemap and computes relative URLs from the current document's output location.

**Functions added to `runtime`:**

#### `href(path, page?, lang?)`

Looks up an entity in the sitemap by its virtual path. Returns an object with the entity's metadata and a `link` property pointing to its output URL.

```handlebars
{{! Look up an entity — returns { link, meta, ... } }}
{{#with (href '/blog/getting-started')}}
  <a href="{{url link}}">{{meta.title}}</a>
  <p>{{meta.description}}</p>
  <span>{{date meta.date 'MMMM D, YYYY'}}</span>
{{/with}}

{{! Resolve with page number for paginated content }}
<a href="{{url (get 'link' (href '/blog' 2))}}">Page 2</a>

{{! Resolve with language override }}
<a href="{{url (get 'link' (hrefLang '/blog/post' 'fr'))}}">FR</a>

{{! Pagination links }}
{{#if prev}}
  <a href="{{url (get 'link' (href document.name prev))}}">Previous</a>
{{/if}}
{{#if next}}
  <a href="{{url (get 'link' (href document.name next))}}">Next</a>
{{/if}}
```

#### `url(link)`

Converts an absolute virtual output path to a **relative URL** from the current document's output location. Always use `url` when building `href` attributes — it ensures links work regardless of where the site is deployed or nested.

```handlebars
{{! Absolute virtual path → relative URL }}
<a href="{{url '/en/blog/index.html'}}">Blog</a>

{{! Combine with href }}
<a href="{{url (get 'link' (href '/blog'))}}">Blog</a>

{{! Combine with asset }}
<img src="{{url (asset 'thumbnail' name 'webp')}}" />

{{! Combine with resource }}
<link rel="stylesheet" href="{{url (get 'link' (resource 'https://cdn.example.com/lib.css'))}}">

{{! Inside {{#with (href '...')}} — link is already resolved }}
{{#with (href '/blog/getting-started')}}
  <a href="{{url link}}">{{meta.title}}</a>
{{/with}}
```

The `href` plugin reads `runtime.state.layouts.sitemap` to resolve paths to output URLs. It understands clean URLs and pagination.

---

### `render-asset` — Asset Paths

Generates paths to transformed assets (output of the assets plugin).

```handlebars
{{! Generate path to transformed asset }}
<img src="{{asset 'thumbnail' '/images/photo.jpg'}}" alt="Photo">
<img src="{{asset 'thumbnail' '/images/photo.jpg' 'webp'}}" alt="Photo">
```

The path is: `/{assetsFolder}/{preset}/{path}[.{format}]`

---

### `render-resource` — CDN Resource Mapping

Maps CDN URLs to locally cached paths (from the resources plugin).

```handlebars
{{! Map CDN URL to local path }}
<link rel="stylesheet" href="{{resource 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'}}">
```

Returns an object `{ link, name }` where `link` is the local path.

---

### `render-file` — File Utilities

Provides file reading helpers for use inside templates.

```handlebars
{{! Read any file as a string }}
{{readFile '/path/to/file.txt'}}

{{! Read and parse a JSON file }}
{{#with (jsonFile './data/config.json')}}
  {{title}}
{{/with}}

{{! Glob for files }}
{{#each (glob '**/*.md' cwd=docsFolder)}}
  {{this}}
{{/each}}
```

---

## Layout's `load()` Function

Layouts (`.js` files alongside `.hbs` templates) can export a `load` function that runs before rendering to provide context data:

```js
// layouts/blog.js  (alongside layouts/blog.hbs)
export async function load({ entity, options, config, context, runtime, state, logger }) {
  // Return data to be available as `data` in the template
  return {
    relatedPosts: await findRelated(entity),
    navigation: buildNav(runtime.state.layouts.sitemap)
  }
}

// Optionally: specify which plugins to load
export const plugins = ['render-href', 'render-asset']
```

The returned value is available in the template as `data`:

```handlebars
{{#each data.relatedPosts}}
  <a href="{{href this.name}}">{{this.meta.title}}</a>
{{/each}}
```

---

## Pagination

The layouts plugin handles pagination automatically when a layout's `load()` returns a `pages` array:

```js
// layouts/blog-list.js
export async function load({ entity, runtime }) {
  const posts = runtime.state.posts ?? []
  const perPage = 10

  // Return pages array — each item becomes one render job
  return {
    pages: chunk(posts, perPage).map((items, i) => ({
      items,
      page: i + 1,
      total: posts.length
    }))
  }
}
```

Each item in `pages` triggers a separate render call. The entity gets `entity.page` (1-based index) and `entity.pages` (total count) set. The destination URL includes the page number for pages > 1 (e.g. `/blog/page/2`).

---

## Render Output

After rendering completes:

- The rendered content is written to `entity.destination`
- The journal entry is updated with `output: { success: true, result: '...' }`
- `render-details.json` in the runtime folder contains a list of all rendered entities
- Failed renders are logged and marked `output: { success: false }` but do not abort the run

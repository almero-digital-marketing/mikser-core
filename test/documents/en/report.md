---
layout: report
lang: en
title: Mikser Quarterly Report
date: 2026-05-08
author: Mikser Core Team
version: 1.0
---

## Executive Summary

This document demonstrates Mikser's PDF postprocessor. It is authored in Markdown with YAML front-matter, rendered to HTML by the `report.html-pdf.hbs` layout, and then automatically converted to a print-ready PDF by the `post-pdf` plugin using a headless Chromium browser.

The same source file produces two output artefacts — `report.html` (intermediate) and `report.pdf` (final). The intermediate HTML file is deleted after the PDF is written.

## Plugin Pipeline

The pipeline that produces this document involves five plugins:

| Step | Plugin | Responsibility |
|------|--------|----------------|
| 1 | `front-matter` | Parse YAML front-matter from `.md` files |
| 2 | `layouts` | Match document to layout, set render options |
| 3 | `render-hbs` | Render the Handlebars template to HTML |
| 4 | `post-pdf` | Convert the rendered HTML to PDF via Puppeteer |
| 5 | `layouts` (onComplete) | Write PDF to disk, delete intermediate HTML |

## How PDF Generation Works

### Layout naming convention

The layout filename `report.html-pdf.hbs` encodes two pieces of information:

- **`.hbs`** — the template engine (Handlebars)
- **`.html-pdf`** — the output format is HTML with the `pdf` postprocessor

The `getFormatInfo` function in the layouts plugin parses this into `{ format: 'html', postprocessor: 'pdf', template: 'hbs' }`.

### Auto-promotion

After a successful render, the `onBeforePostprocess` hook in `engine.js` reads all RENDER journal entries that have `options.postprocessor` set and queues corresponding POSTPROCESS entries. No manual wiring is needed.

### Browser lifecycle

The `post-pdf` plugin maintains a single shared Puppeteer browser instance:

```js
// setup — called once per postprocess phase
browser = await puppeteer.launch({ headless: true })

// teardown — deferred by 60 s to allow watch-mode reuse
teardownTimer = setTimeout(() => browser.close(), 60_000)
```

If a new build starts within the 60-second window, the timer is cancelled and the existing browser is reused, avoiding a cold launch on every save.

## Configuration Reference

Override defaults in `mikser.config.js` under the `post-pdf` key:

```js
export default {
  plugins: ['documents', 'layouts', 'render-hbs', 'post-pdf'],
  'post-pdf': {
    launch: { executablePath: '/usr/bin/chromium' },
    navigation: { waitUntil: 'domcontentloaded' },
    pdf: {
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' }
    },
    teardownDelay: 30_000
  }
}
```

## Output Summary

| Artefact | Path | Notes |
|----------|------|-------|
| Intermediate HTML | `out/en/report.html` | Written by render phase; deleted after PDF is produced |
| Final PDF | `out/en/report.pdf` | Print-ready A4, background graphics enabled |

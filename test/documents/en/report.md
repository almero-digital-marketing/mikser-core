---
layout: report
lang: en
title: Quarterly Report
date: 2026-05-08
author: Mikser Core
---

## Summary

This document demonstrates the PDF postprocessor. When built, it produces both
`report.html` (the rendered HTML) and `report.pdf` (the postprocessed PDF).

## How it works

The layout file is named `report.html.hbs-pdf`. The `-pdf` suffix tells the
layouts plugin to set `postprocessor: pdf` on the render options. After
rendering, the built-in auto-promotion hook in `engine.js` reads the render
journal and queues a `POSTPROCESS` entry. The `post-pdf` plugin then launches
a headless Chromium browser and prints the HTML to PDF.

## Configuration

PDF output can be customised in `mikser.config.js`:

```js
'postprocess-pdf': {
  pdf: { format: 'A4', printBackground: true }
}
```

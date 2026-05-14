---
layout: notes
lang: en
title: Liquid Smoke Test
date: 2026-05-13
author: Mikser
---

## Hello from LiquidJS

This document renders through **mikser-io-render-liquid**:

- `{{ ... | markdown }}` runs the body through `render-markdown`.
- `{{ date | date: "%Y-%m-%d" }}` uses LiquidJS's built-in date filter.
- `{{ author | default: "Mikser" }}` falls back if `meta.author` is unset.

That's it — every runtime function (e.g. `markdown`, `href`) is available as a Liquid filter without per-helper wiring.

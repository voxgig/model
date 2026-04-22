#!/usr/bin/env node
/* Perf benchmark for @voxgig/model. Runs a model fixture multiple times
 * and reports timings for cold (fresh Model) and warm (reused Model) rebuilds.
 *
 * Scenarios:
 *   - sys01: realistic model with a pre-action that writes files and signals
 *     reload. Exercises the full producer loop (pre + post).
 *   - nopre: model without any pre-action reload. Isolates fix 2 (skip second
 *     aontu.generate).
 */

const Path = require('node:path')
const Fs = require('node:fs')
const { Model } = require('../dist/model')
const { makeBuild } = require('../dist/build')
const { model_producer } = require('../dist/producer/model')
const { prettyPino } = require('@voxgig/util')

const COLD_ITERS = Number(process.env.COLD_ITERS || 5)
const WARM_ITERS = Number(process.env.WARM_ITERS || 10)
const LABEL = process.env.LABEL || 'baseline'
const SCENARIO = process.env.SCENARIO || 'sys01'

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p))
  return sorted[idx]
}

function stats(arr) {
  const sum = arr.reduce((a, b) => a + b, 0)
  return {
    n: arr.length,
    min: Math.min(...arr).toFixed(2),
    p50: pct(arr, 0.5).toFixed(2),
    p95: pct(arr, 0.95).toFixed(2),
    max: Math.max(...arr).toFixed(2),
    mean: (sum / arr.length).toFixed(2),
    total: sum.toFixed(2),
  }
}

// sys01: full Model, has pre-action with reload
async function sys01Cold() {
  const base = Path.resolve(__dirname, 'sys01/model')
  const path = base + '/model.jsonic'
  const times = []
  for (let i = 0; i < COLD_ITERS; i++) {
    const m = new Model({ path, base, debug: 'error' })
    const t0 = performance.now()
    const br = await m.run()
    const t1 = performance.now()
    if (!br.ok) { console.error('cold', br.errs); process.exit(1) }
    times.push(t1 - t0)
  }
  return times
}

async function sys01Warm() {
  const base = Path.resolve(__dirname, 'sys01/model')
  const path = base + '/model.jsonic'
  const m = new Model({ path, base, debug: 'error' })
  const times = []
  for (let i = 0; i < WARM_ITERS; i++) {
    const t0 = performance.now()
    const br = await m.run()
    const t1 = performance.now()
    if (!br.ok) { console.error('warm', br.errs); process.exit(1) }
    times.push(t1 - t0)
  }
  return times
}

// nopre: makeBuild directly on the sys01 model but without local_producer/
// config — no pre-actions signal reload, so fix 2's skip kicks in.
function makeBuildSpec(log) {
  return {
    fs: Fs,
    base: Path.resolve(__dirname, 'sys01/model'),
    path: Path.resolve(__dirname, 'sys01/model/model.jsonic'),
    log,
    res: [
      { path: '/', build: model_producer },
    ],
  }
}

async function nopreCold() {
  const log = prettyPino('bench', { level: 'error' })
  const times = []
  for (let i = 0; i < COLD_ITERS; i++) {
    const b = makeBuild(makeBuildSpec(log), log)
    const t0 = performance.now()
    const br = await b.run({ watch: false })
    const t1 = performance.now()
    if (!br.ok) { console.error('cold', br.errs); process.exit(1) }
    times.push(t1 - t0)
  }
  return times
}

async function nopreWarm() {
  const log = prettyPino('bench', { level: 'error' })
  const b = makeBuild(makeBuildSpec(log), log)
  const times = []
  for (let i = 0; i < WARM_ITERS; i++) {
    const t0 = performance.now()
    const br = await b.run({ watch: false })
    const t1 = performance.now()
    if (!br.ok) { console.error('warm', br.errs); process.exit(1) }
    times.push(t1 - t0)
  }
  return times
}

async function main() {
  console.log(`[${LABEL}/${SCENARIO}] cold x${COLD_ITERS}, warm x${WARM_ITERS}`)

  const cold = SCENARIO === 'nopre' ? await nopreCold() : await sys01Cold()
  console.log(`[${LABEL}/${SCENARIO}] cold (ms):`, stats(cold))

  const warm = SCENARIO === 'nopre' ? await nopreWarm() : await sys01Warm()
  console.log(`[${LABEL}/${SCENARIO}] warm (ms):`, stats(warm))
  if (warm.length > 1) {
    const rest = warm.slice(1)
    console.log(`[${LABEL}/${SCENARIO}] warm first=${warm[0].toFixed(2)} rest_mean=${(rest.reduce((a, b) => a + b, 0) / rest.length).toFixed(2)}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

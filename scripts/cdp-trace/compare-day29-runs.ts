// Day 29 — Final Validation (rc.9) — cross-run reproducibility.
//
// Reads two outputs of analyze-day29-final-rc9.ts (independent runs of the
// identical protocol) and reports, per comparison and per cell, whether the
// classification reproduced. No new statistics: it only lines up the
// existing classify() results of the two runs.
//
//   reproduced  — both runs Consistent in the same direction
//   direction   — same sign of deltaPct, but at least one run not Consistent
//   conflicting — Consistent in opposite directions, or opposite signs with
//                 at least one run Consistent
//   neither     — both runs Stable/Unstable with differing signs
//
// Usage: node scripts/cdp-trace/compare-day29-runs.ts <runA.json> <runB.json> > out.json

import { readFileSync } from 'node:fs'

interface Cell {
  metric: string
  operation: string
  nodeCount: number
  deltaPct: number | null
  signal: string
}

interface Analysis {
  comparisons: Array<{ id: string; a: string; b: string; cells: Cell[] }>
}

const [pathA, pathB] = process.argv.slice(2)
if (!pathA || !pathB) throw new Error('usage: compare-day29-runs.ts <runA.json> <runB.json>')

const runA: Analysis = JSON.parse(readFileSync(pathA, 'utf-8'))
const runB: Analysis = JSON.parse(readFileSync(pathB, 'utf-8'))

const isConsistent = (s: string) => s.startsWith('Consistent')

function agreement(a: Cell, b: Cell): string {
  const signA = Math.sign(a.deltaPct ?? 0)
  const signB = Math.sign(b.deltaPct ?? 0)
  if (isConsistent(a.signal) && isConsistent(b.signal))
    return a.signal === b.signal ? 'reproduced' : 'conflicting'
  if (signA === signB) return 'direction'
  if (isConsistent(a.signal) || isConsistent(b.signal)) return 'conflicting'
  return 'neither'
}

const comparisons = runA.comparisons
  .filter((c) => !c.id.startsWith('drift') && c.id !== 'arch-rc4-original')
  .map((ca) => {
    const cb = runB.comparisons.find((c) => c.id === ca.id)
    if (!cb) throw new Error(`comparison ${ca.id} missing in ${pathB}`)
    const cells = ca.cells.map((x) => {
      const y = cb.cells.find(
        (c) => c.metric === x.metric && c.operation === x.operation && c.nodeCount === x.nodeCount,
      )!
      return {
        metric: x.metric,
        operation: x.operation,
        nodeCount: x.nodeCount,
        runA: { signal: x.signal, deltaPct: x.deltaPct },
        runB: { signal: y.signal, deltaPct: y.deltaPct },
        agreement: agreement(x, y),
      }
    })
    const counts: Record<string, number> = {}
    for (const c of cells) counts[c.agreement] = (counts[c.agreement] ?? 0) + 1
    return { id: ca.id, counts, cells }
  })

console.log(JSON.stringify({ runA: pathA, runB: pathB, comparisons }, null, 2))

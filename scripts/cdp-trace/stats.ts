// CDP Trace Validation Runner — small stats helpers shared by the calibration
// analysis. No npm dependency: this is ~30 lines of arithmetic, not worth a
// package (PAIN_LAB_PRINCIPLES：不引入框架化的抽象層).

export interface Distribution {
  n: number
  median: number
  p25: number
  p75: number
  min: number
  max: number
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const lower = sorted[base]!
  const upper = sorted[base + 1]
  return upper === undefined ? lower : lower + rest * (upper - lower)
}

/** Throws on empty input — callers must only pass observed values, never fill gaps with 0. */
export function summarize(values: number[]): Distribution {
  if (values.length === 0) {
    throw new Error('summarize() called with zero observed values — cannot report a distribution over nothing.')
  }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  }
}

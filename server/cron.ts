// Lightweight cron parser — computes the next run time from a 5-field
// cron expression or special strings (@hourly, @daily, @weekly, @monthly).
//
// Fields: minute hour day month weekday
//   minute     : 0-59
//   hour       : 0-23
//   day        : 1-31
//   month      : 1-12
//   weekday    : 0-6 (0 = Sunday)
//
// Supports:
//   - wildcard (any)
//   - exact value (e.g. 5)
//   - comma-separated list (e.g. 1,15,30)
//   - ranges (e.g. 1-5)
//   - steps (e.g. star/5, 1-10/2)
//   - @hourly, @daily, @weekly, @monthly

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()
  if (field === '*') {
    for (let i = min; i <= max; i++) values.add(i)
    return values
  }
  const parts = field.split(',')
  for (const part of parts) {
    const [range, stepStr] = part.split('/')
    const step = stepStr ? parseInt(stepStr, 10) : 1
    if (range === '*') {
      for (let i = min; i <= max; i += step) values.add(i)
    } else if (range.includes('-')) {
      const [startStr, endStr] = range.split('-')
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      for (let i = start; i <= end; i += step) values.add(i)
    } else {
      const v = parseInt(range, 10)
      if (!isNaN(v)) values.add(v)
    }
  }
  return values
}

function expandSpecial(expr: string): string {
  switch (expr) {
    case '@hourly':  return '0 * * * *'
    case '@daily':   return '0 0 * * *'
    case '@weekly':  return '0 0 * * 0'
    case '@monthly': return '0 0 1 * *'
    default: return expr
  }
}

export interface CronResult {
  valid: true
  minutes: Set<number>
  hours: Set<number>
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
  nextRun: Date
}

export interface CronError {
  valid: false
  error: string
}

export function parseCron(expr: string): CronResult | CronError {
  const expanded = expandSpecial(expr.trim())
  const fields = expanded.split(/\s+/)
  if (fields.length !== 5) {
    return { valid: false, error: `Cron expression must have 5 fields, got ${fields.length}. Format: "min hour day month weekday"` }
  }
  try {
    const minutes = parseField(fields[0], 0, 59)
    const hours = parseField(fields[1], 0, 23)
    const days = parseField(fields[2], 1, 31)
    const months = parseField(fields[3], 1, 12)
    const weekdays = parseField(fields[4], 0, 6)

    if (minutes.size === 0 || hours.size === 0 || days.size === 0 || months.size === 0 || weekdays.size === 0) {
      return { valid: false, error: 'One or more cron fields produced an empty set' }
    }

    const nextRun = getNextRun(minutes, hours, days, months, weekdays)
    if (!nextRun) {
      return { valid: false, error: 'Could not compute next run time from cron expression' }
    }
    return { valid: true, minutes, hours, days, months, weekdays, nextRun }
  } catch (err) {
    return { valid: false, error: `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function getNextRun(
  minutes: Set<number>,
  hours: Set<number>,
  days: Set<number>,
  months: Set<number>,
  weekdays: Set<number>
): Date | null {
  const now = new Date()
  // Start from the next minute boundary
  let candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0)

  // Search up to 4 years ahead (handles edge cases like Feb 29)
  const limit = new Date(candidate.getFullYear() + 4, 11, 31, 23, 59, 59)

  while (candidate <= limit) {
    const m = candidate.getMonth() + 1
    if (!months.has(m)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 1, 0, 0, 0, 0)
      continue
    }
    const d = candidate.getDate()
    if (!days.has(d)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 1, 0, 0, 0, 0)
      continue
    }
    const wd = candidate.getDay()
    if (!weekdays.has(wd)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate() + 1, 0, 0, 0, 0)
      continue
    }
    const h = candidate.getHours()
    if (!hours.has(h)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), candidate.getHours() + 1, 0, 0, 0)
      continue
    }
    const min = candidate.getMinutes()
    if (!minutes.has(min)) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), candidate.getHours(), candidate.getMinutes() + 1, 0, 0)
      continue
    }
    return candidate
  }
  return null
}

export function getNextRunFromExpr(expr: string): Date | null {
  const parsed = parseCron(expr)
  if (!parsed.valid) return null
  return parsed.nextRun
}

export function describeCron(expr: string): string {
  const parsed = parseCron(expr)
  if (!parsed.valid) return parsed.error
  return `Next run: ${parsed.nextRun.toISOString()}`
}

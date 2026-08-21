let passed = 0
const failures = []
let group = ""

export function describe(name) { group = name }

export function ok(label, condition, detail) {
  if (condition) { passed++; return }
  failures.push(`${group} › ${label}${detail ? "\n      " + detail : ""}`)
}

export function eq(label, actual, expected) {
  const a = typeof actual === "string" ? actual : JSON.stringify(actual)
  const b = typeof expected === "string" ? expected : JSON.stringify(expected)
  ok(label, a === b, a === b ? "" : `expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`)
}

export function throws(label, fn) {
  try { fn(); ok(label, false, "expected a throw, got none") }
  catch (e) { passed++ }
}

export function report() {
  if (failures.length === 0) {
    console.log(`\n\x1b[32m✓ ${passed} assertions passed\x1b[0m`)
    process.exit(0)
  }
  console.log(`\n\x1b[31m✗ ${failures.length} failed\x1b[0m (${passed} passed)\n`)
  for (const f of failures) console.log("  " + f)
  process.exit(1)
}

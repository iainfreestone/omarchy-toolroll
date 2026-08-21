.pragma library

// What you have run this session.
//
// Deliberately in memory only. This is a tool people paste JWTs, tokens and
// API keys into, and a durable record of every input would be a liability that
// nothing else here justifies — the per-tool sessions already survive a
// restart for the one thing you were last working on. Secrets are stripped by
// the caller before an entry ever gets here.

var DEFAULT_LIMIT = 50

// Consecutive edits to the same text are one piece of work, not thirty. Runs
// are recorded on a debounce, so typing "hello" would otherwise leave five
// entries; a run that extends or trims the previous one inside a short window
// replaces it instead.
var CONTINUATION_MS = 45000

function makeEntry(entryId, label, input, state, when) {
  return {
    entryId: String(entryId),
    label: String(label || entryId),
    input: String(input === undefined || input === null ? "" : input),
    state: state || {},
    at: Number(when) || 0
  }
}

function isContinuation(previous, entry) {
  if (!previous) return false
  if (previous.entryId !== entry.entryId) return false
  if (entry.at - previous.at > CONTINUATION_MS) return false
  var a = previous.input
  var b = entry.input
  if (a === b) return true
  return a.indexOf(b) === 0 || b.indexOf(a) === 0
}

function add(entries, entry, limit) {
  var list = entries || []
  if (entry.input.length === 0) return list          // nothing worth going back to
  var cap = limit || DEFAULT_LIMIT

  if (list.length > 0 && isContinuation(list[0], entry)) {
    var replaced = list.slice(0)
    replaced[0] = entry
    return replaced
  }
  return [entry].concat(list).slice(0, cap)
}

function remove(entries, index) {
  var out = []
  var list = entries || []
  for (var i = 0; i < list.length; i++) if (i !== index) out.push(list[i])
  return out
}

function clear() { return [] }

// One line, whitespace flattened, cut to width — enough to recognise an entry
// without turning the list into a wall of text.
function preview(text, width) {
  var s = String(text === undefined || text === null ? "" : text)
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
  var max = width || 90
  if (s.length <= max) return s
  return s.substring(0, max - 1) + "…"
}

function relative(entry, now) {
  var elapsed = Math.max(0, Math.round((((now || 0)) - entry.at) / 1000))
  if (elapsed < 10) return "just now"
  if (elapsed < 60) return elapsed + "s ago"
  if (elapsed < 3600) return Math.floor(elapsed / 60) + "m ago"
  return Math.floor(elapsed / 3600) + "h ago"
}

// Grouped by tool, for a summary line.
function summarize(entries) {
  var list = entries || []
  var seen = {}
  var tools = 0
  for (var i = 0; i < list.length; i++) {
    if (seen[list[i].entryId]) continue
    seen[list[i].entryId] = true
    tools++
  }
  return { entries: list.length, tools: tools }
}

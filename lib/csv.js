.pragma library
.import "json.js" as Json

// RFC 4180 CSV with the usual real-world tolerances: any single-character
// delimiter, CRLF or LF, quoted fields containing delimiters and newlines,
// and doubled quotes as an escaped quote.

function detectDelimiter(text) {
  var firstLine = String(text).split(/\r?\n/)[0] || ""
  var candidates = [",", ";", "\t", "|"]
  var best = ","
  var bestCount = 0
  for (var i = 0; i < candidates.length; i++) {
    var count = 0
    var quoted = false
    for (var k = 0; k < firstLine.length; k++) {
      var c = firstLine.charAt(k)
      if (c === '"') quoted = !quoted
      else if (!quoted && c === candidates[i]) count++
    }
    if (count > bestCount) { bestCount = count; best = candidates[i] }
  }
  return best
}

function parseRows(text, delimiter) {
  var s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  var d = delimiter || ","
  var rows = []
  var row = []
  var field = ""
  var quoted = false
  var i = 0
  var started = false

  while (i < s.length) {
    var c = s.charAt(i)
    if (quoted) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue }
        quoted = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"' && field.length === 0) { quoted = true; started = true; i++; continue }
    if (c === d) { row.push(field); field = ""; started = true; i++; continue }
    if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      started = false
      i++
      continue
    }
    field += c
    started = true
    i++
  }
  if (quoted) throw new Error("unterminated quoted field")
  if (started || field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function typed(value, coerce) {
  if (!coerce) return value
  var s = String(value)
  if (s.length === 0) return ""
  if (/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(s)) {
    var n = Number(s)
    if (isFinite(n) && String(n) === s) return n
  }
  if (s === "true") return true
  if (s === "false") return false
  if (s === "null") return null
  return s
}

// opts: { delimiter, header (bool), coerceTypes (bool) }
function toJson(text, opts) {
  var o = opts || {}
  var d = o.delimiter || detectDelimiter(text)
  var rows = parseRows(text, d)
  if (rows.length === 0) return []
  if (o.header === false) {
    return rows.map(function (r) { return r.map(function (v) { return typed(v, o.coerceTypes) }) })
  }
  var headers = rows[0]
  var out = []
  for (var i = 1; i < rows.length; i++) {
    if (rows[i].length === 1 && rows[i][0] === "") continue
    var obj = {}
    var order = []
    for (var k = 0; k < headers.length; k++) {
      var key = headers[k] === "" ? "column" + (k + 1) : headers[k]
      obj[key] = typed(rows[i][k] === undefined ? "" : rows[i][k], o.coerceTypes)
      order.push(key)
    }
    try { Object.defineProperty(obj, "__keyOrder", { value: order, enumerable: false }) } catch (e) {}
    out.push(obj)
  }
  return out
}

function quoteField(value, delimiter) {
  var s = value === null || value === undefined ? ""
    : (typeof value === "object" ? Json.stringify(value, 0) : String(value))
  if (s.indexOf(delimiter) !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1 || /^\s|\s$/.test(s))
    return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// Accepts an array of objects (columns are the union of keys, in first-seen
// order) or an array of arrays (written through as-is).
function fromJson(value, opts) {
  var o = opts || {}
  var d = o.delimiter || ","
  var eol = o.crlf ? "\r\n" : "\n"
  if (!Array.isArray(value)) {
    if (value && typeof value === "object") value = [value]
    else throw new Error("CSV needs an array of rows or objects at the top level")
  }
  if (value.length === 0) return ""

  if (Array.isArray(value[0])) {
    return value.map(function (row) {
      return row.map(function (cell) { return quoteField(cell, d) }).join(d)
    }).join(eol)
  }

  var columns = []
  for (var i = 0; i < value.length; i++) {
    var keys = Json.keysOf(value[i], false)
    for (var k = 0; k < keys.length; k++) if (columns.indexOf(keys[k]) === -1) columns.push(keys[k])
  }
  var lines = []
  if (o.header !== false) lines.push(columns.map(function (c) { return quoteField(c, d) }).join(d))
  for (var r = 0; r < value.length; r++) {
    var row = []
    for (var c2 = 0; c2 < columns.length; c2++) row.push(quoteField(value[r][columns[c2]], d))
    lines.push(row.join(d))
  }
  return lines.join(eol)
}

// Fixed-width preview used by the CSV viewer.
function toTable(text, opts) {
  var o = opts || {}
  var rows = parseRows(text, o.delimiter || detectDelimiter(text))
  if (rows.length === 0) return ""
  var widths = []
  for (var r = 0; r < rows.length; r++)
    for (var c = 0; c < rows[r].length; c++)
      widths[c] = Math.max(widths[c] || 0, String(rows[r][c]).length)
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var cells = []
    for (var k = 0; k < widths.length; k++) {
      var v = rows[i][k] === undefined ? "" : String(rows[i][k])
      cells.push(v + new Array(widths[k] - v.length + 1).join(" "))
    }
    out.push(cells.join("  │ ").replace(/\s+$/, ""))
    if (i === 0) {
      var rule = []
      for (var w = 0; w < widths.length; w++) rule.push(new Array(widths[w] + 1).join("─"))
      out.push(rule.join("──┼─"))
    }
  }
  return out.join("\n")
}

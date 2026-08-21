.pragma library

// A hand-written JSON parser rather than JSON.parse, for two reasons: the
// engine's error messages don't carry a line/column, and a paste-oriented
// tool wants a lenient mode that swallows comments, trailing commas, and
// single quotes before telling you your config is broken.
//
// The engine's own JSON is native C++ and roughly an order of magnitude
// faster than reading characters one at a time in interpreted JS, so `parse`
// tries it first and only falls back to the parser below when it needs
// something native cannot give: a positioned error, lenient syntax, or
// preserved order for integer-like keys.

// Object property order in JS puts integer-like keys first, ahead of string
// keys in insertion order — so a document containing `"10":` would come back
// from a native parse silently reordered, and a formatter that rearranges
// your document is worse than a slow one. One scan of the source finds them.
// The scan is exact rather than approximate: a quote inside a JSON string
// must be escaped, so this byte sequence can only ever be a real key.
var INTEGER_KEY_RE = /"-?\d+"\s*:/

function ParseError(message, index, line, column) {
  this.name = "JsonParseError"
  this.message = message
  this.index = index
  this.line = line
  this.column = column
  this.formatted = message + " (line " + line + ", column " + column + ")"
}

function parseByHand(text, lenient) {
  var s = String(text)
  var i = 0
  var loose = !!lenient

  function fail(message) {
    var line = 1, column = 1
    for (var k = 0; k < i && k < s.length; k++) {
      if (s.charAt(k) === "\n") { line++; column = 1 } else { column++ }
    }
    throw new ParseError(message, i, line, column)
  }

  function skip() {
    while (i < s.length) {
      var c = s.charAt(i)
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "﻿") { i++; continue }
      if (loose && c === "/" && s.charAt(i + 1) === "/") {
        while (i < s.length && s.charAt(i) !== "\n") i++
        continue
      }
      if (loose && c === "/" && s.charAt(i + 1) === "*") {
        var end = s.indexOf("*/", i + 2)
        i = end < 0 ? s.length : end + 2
        continue
      }
      break
    }
  }

  function parseString() {
    var quote = s.charAt(i)
    if (quote !== '"' && !(loose && quote === "'")) fail("expected a string")
    i++
    var out = ""
    while (i < s.length) {
      var c = s.charAt(i)
      if (c === quote) { i++; return out }
      if (c === "\\") {
        i++
        var e = s.charAt(i)
        if (e === "n") out += "\n"
        else if (e === "t") out += "\t"
        else if (e === "r") out += "\r"
        else if (e === "b") out += "\b"
        else if (e === "f") out += "\f"
        else if (e === "/") out += "/"
        else if (e === '"') out += '"'
        else if (e === "'") out += "'"
        else if (e === "\\") out += "\\"
        else if (e === "u") {
          var hex = s.substr(i + 1, 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid \\u escape")
          out += String.fromCharCode(parseInt(hex, 16))
          i += 4
        } else if (loose) out += e
        else fail("invalid escape \\" + e)
        i++
        continue
      }
      if (!loose && c.charCodeAt(0) < 0x20) fail("unescaped control character in string")
      out += c
      i++
    }
    fail("unterminated string")
  }

  function parseNumber() {
    var start = i
    if (s.charAt(i) === "-" || (loose && s.charAt(i) === "+")) i++
    while (i < s.length && /[0-9]/.test(s.charAt(i))) i++
    if (s.charAt(i) === ".") { i++; while (i < s.length && /[0-9]/.test(s.charAt(i))) i++ }
    if (s.charAt(i) === "e" || s.charAt(i) === "E") {
      i++
      if (s.charAt(i) === "+" || s.charAt(i) === "-") i++
      while (i < s.length && /[0-9]/.test(s.charAt(i))) i++
    }
    var raw = s.substring(start, i)
    var n = Number(raw)
    if (raw.length === 0 || !isFinite(n)) { i = start; fail("invalid number") }
    return n
  }

  function parseValue() {
    skip()
    if (i >= s.length) fail("unexpected end of input")
    var c = s.charAt(i)
    if (c === "{") return parseObject()
    if (c === "[") return parseArray()
    if (c === '"' || (loose && c === "'")) return parseString()
    if (s.substr(i, 4) === "true") { i += 4; return true }
    if (s.substr(i, 5) === "false") { i += 5; return false }
    if (s.substr(i, 4) === "null") { i += 4; return null }
    if (/[-+0-9]/.test(c)) return parseNumber()
    fail("unexpected character “" + c + "”")
  }

  function parseObject() {
    i++
    var out = {}
    var order = []
    skip()
    if (s.charAt(i) === "}") { i++; return makeObject(out, order) }
    while (true) {
      skip()
      var key
      if (loose && /[A-Za-z_$]/.test(s.charAt(i))) {
        var ks = i
        while (i < s.length && /[\w$]/.test(s.charAt(i))) i++
        key = s.substring(ks, i)
      } else {
        key = parseString()
      }
      skip()
      if (s.charAt(i) !== ":") fail("expected “:” after object key")
      i++
      out[key] = parseValue()
      if (order.indexOf(key) === -1) order.push(key)
      skip()
      var c2 = s.charAt(i)
      if (c2 === ",") {
        i++
        skip()
        if (s.charAt(i) === "}") {
          if (!loose) fail("trailing comma in object")
          i++
          return makeObject(out, order)
        }
        continue
      }
      if (c2 === "}") { i++; return makeObject(out, order) }
      fail(i >= s.length ? "unterminated object" : "expected “,” or “}”")
    }
  }

  function parseArray() {
    i++
    var out = []
    skip()
    if (s.charAt(i) === "]") { i++; return out }
    while (true) {
      out.push(parseValue())
      skip()
      var c = s.charAt(i)
      if (c === ",") {
        i++
        skip()
        if (s.charAt(i) === "]") {
          if (!loose) fail("trailing comma in array")
          i++
          return out
        }
        continue
      }
      if (c === "]") { i++; return out }
      fail(i >= s.length ? "unterminated array" : "expected “,” or “]”")
    }
  }

  // Key order is preserved by the object literal itself for string keys, but
  // numeric-looking keys get reordered by the engine, so carry the source
  // order alongside for the formatter to use.
  function makeObject(obj, order) {
    var box = {}
    for (var k = 0; k < order.length; k++) box[order[k]] = obj[order[k]]
    if (order.length) {
      try { Object.defineProperty(box, "__keyOrder", { value: order, enumerable: false }) }
      catch (e) { /* engine without defineProperty support: fall back to natural order */ }
    }
    return box
  }

  var value = parseValue()
  skip()
  if (i < s.length) fail("unexpected trailing content")
  return value
}

// Returns { value, native } so a caller that just parsed can tell whether the
// result carries source key order (hand parser) or relies on natural property
// order (native) — which is what makes it safe to stringify natively too.
function parseWithMeta(text, lenient) {
  var s = String(text)
  if (!lenient && !INTEGER_KEY_RE.test(s)) {
    try {
      return { value: JSON.parse(s), native: true }
    } catch (e) {
      // Native rejected it. Re-read by hand purely to report where.
    }
  }
  return { value: parseByHand(s, lenient), native: false }
}

function parse(text, lenient) {
  return parseWithMeta(text, lenient).value
}

// The native serializer emits exactly the format `stringify` does for the
// default options, so the JSON tool uses it when nothing fancy is asked for
// and the value came back from a native parse.
function canStringifyNatively(meta, opts) {
  var o = opts || {}
  return meta && meta.native === true && !o.sortKeys && !o.escapeUnicode
}

function stringifyMeta(meta, indent, opts) {
  if (canStringifyNatively(meta, opts)) {
    var pad = typeof indent === "string" ? indent : (indent > 0 ? indent : 0)
    return JSON.stringify(meta.value, null, pad)
  }
  return stringify(meta.value, indent, opts)
}

function keysOf(value, sorted) {
  var order = value && value.__keyOrder
  var keys = []
  if (order && order.length) {
    keys = order.slice(0)
  } else {
    for (var k in value) if (k !== "__keyOrder") keys.push(k)
  }
  if (sorted) keys.sort()
  return keys
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function quote(str, escapeUnicode) {
  var s = String(str)
  var out = '"'
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    var code = s.charCodeAt(i)
    if (c === '"') out += '\\"'
    else if (c === "\\") out += "\\\\"
    else if (c === "\n") out += "\\n"
    else if (c === "\r") out += "\\r"
    else if (c === "\t") out += "\\t"
    else if (c === "\b") out += "\\b"
    else if (c === "\f") out += "\\f"
    else if (code < 0x20 || (escapeUnicode && code > 0x7e)) out += "\\u" + ("0000" + code.toString(16)).slice(-4)
    else out += c
  }
  return out + '"'
}

function formatNumber(n) {
  if (!isFinite(n)) return "null"
  return String(n)
}

// indent: number of spaces, or "\t", or 0/"" for minified output.
function stringify(value, indent, opts) {
  var o = opts || {}
  var pad = typeof indent === "string" ? indent : (indent > 0 ? new Array(indent + 1).join(" ") : "")
  var minified = pad === ""
  var nl = minified ? "" : "\n"
  var colon = minified ? ":" : ": "

  function walk(v, depth) {
    if (v === null || v === undefined) return "null"
    var t = typeof v
    if (t === "boolean") return v ? "true" : "false"
    if (t === "number") return formatNumber(v)
    if (t === "string") return quote(v, o.escapeUnicode)
    var here = minified ? "" : new Array(depth + 2).join(pad)
    var closing = minified ? "" : new Array(depth + 1).join(pad)
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]"
      var items = []
      for (var i = 0; i < v.length; i++) items.push(here + walk(v[i], depth + 1))
      return "[" + nl + items.join("," + nl) + nl + closing + "]"
    }
    var keys = keysOf(v, o.sortKeys)
    if (keys.length === 0) return "{}"
    var rows = []
    for (var k = 0; k < keys.length; k++)
      rows.push(here + quote(keys[k], o.escapeUnicode) + colon + walk(v[keys[k]], depth + 1))
    return "{" + nl + rows.join("," + nl) + nl + closing + "}"
  }

  return walk(value, 0)
}

function summarize(value) {
  var counts = { objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, depth: 0 }
  function walk(v, depth) {
    if (depth > counts.depth) counts.depth = depth
    if (v === null) { counts.nulls++; return }
    if (Array.isArray(v)) {
      counts.arrays++
      for (var i = 0; i < v.length; i++) walk(v[i], depth + 1)
      return
    }
    var t = typeof v
    if (t === "object") {
      counts.objects++
      var keys = keysOf(v, false)
      for (var k = 0; k < keys.length; k++) walk(v[keys[k]], depth + 1)
      return
    }
    if (t === "string") counts.strings++
    else if (t === "number") counts.numbers++
    else if (t === "boolean") counts.booleans++
  }
  walk(value, 1)
  return counts
}

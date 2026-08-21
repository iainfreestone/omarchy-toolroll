.pragma library

// A YAML subset: block mappings and sequences, flow collections, quoted and
// plain scalars, block scalars with chomping, comments, and multi-document
// streams. Anchors, aliases, merge keys, and custom tags are detected and
// reported rather than silently mis-parsed — quietly dropping an anchor is
// worse than saying "this file needs a real YAML parser".
//
// Scalar typing follows the YAML 1.2 core schema, so `no` stays the string
// "no" instead of turning into false (the Norway problem).

function YamlError(message, line) {
  this.name = "YamlError"
  this.message = message
  this.line = line
  this.formatted = message + (line ? " (line " + line + ")" : "")
}

// --------------------------------------------------------------- scalars

function parseScalar(raw) {
  var s = String(raw).replace(/^\s+|\s+$/g, "")
  if (s.length === 0) return null
  var c = s.charAt(0)
  if (c === '"') return unquoteDouble(s)
  if (c === "'") return unquoteSingle(s)
  if (s === "~" || s === "null" || s === "Null" || s === "NULL") return null
  if (s === "true" || s === "True" || s === "TRUE") return true
  if (s === "false" || s === "False" || s === "FALSE") return false
  if (/^[-+]?\.(inf|Inf|INF)$/.test(s)) return s.charAt(0) === "-" ? -Infinity : Infinity
  if (/^\.(nan|NaN|NAN)$/.test(s)) return NaN
  if (/^[-+]?0x[0-9a-fA-F]+$/.test(s)) return parseInt(s.replace("0x", ""), 16) * (s.charAt(0) === "-" ? -1 : 1)
  if (/^[-+]?0o[0-7]+$/.test(s)) return parseInt(s.replace(/^[-+]?0o/, ""), 8) * (s.charAt(0) === "-" ? -1 : 1)
  if (/^[-+]?(0|[1-9][0-9]*)$/.test(s)) return parseInt(s, 10)
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return Number(s)
  return s
}

function unquoteDouble(s) {
  var body = s.substring(1, s.length - 1)
  var out = ""
  for (var i = 0; i < body.length; i++) {
    var c = body.charAt(i)
    if (c !== "\\") { out += c; continue }
    var e = body.charAt(++i)
    if (e === "n") out += "\n"
    else if (e === "t") out += "\t"
    else if (e === "r") out += "\r"
    else if (e === "0") out += "\0"
    else if (e === "u") { out += String.fromCharCode(parseInt(body.substr(i + 1, 4), 16) || 0); i += 4 }
    else if (e === "x") { out += String.fromCharCode(parseInt(body.substr(i + 1, 2), 16) || 0); i += 2 }
    else out += e
  }
  return out
}

function unquoteSingle(s) {
  return s.substring(1, s.length - 1).replace(/''/g, "'")
}

// Strips a trailing `# comment` while respecting quotes. A `#` only starts a
// comment when preceded by whitespace or at the start of the value.
function stripComment(text) {
  var s = String(text)
  var quote = null
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (quote) {
      if (c === "\\" && quote === '"') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === "#" && (i === 0 || /\s/.test(s.charAt(i - 1)))) return s.substring(0, i)
  }
  return s
}

// Finds the ":" that separates a block-mapping key from its value, ignoring
// colons inside quotes, flow collections, and URLs like http://x (no space
// after the colon).
function keySplit(text) {
  var s = String(text)
  var quote = null
  var depth = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (quote) {
      if (c === "\\" && quote === '"') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === "[" || c === "{") { depth++; continue }
    if (c === "]" || c === "}") { depth--; continue }
    if (c === ":" && depth === 0) {
      var next = s.charAt(i + 1)
      if (next === "" || next === " " || next === "\t") return i
    }
  }
  return -1
}

// ------------------------------------------------------------------ flow

function parseFlow(text, lineNo) {
  var s = String(text)
  var i = 0

  function fail(m) { throw new YamlError(m, lineNo) }
  function skip() { while (i < s.length && /\s/.test(s.charAt(i))) i++ }

  function readScalarToken(stops) {
    var start = i
    var quote = null
    while (i < s.length) {
      var c = s.charAt(i)
      if (quote) {
        if (c === "\\" && quote === '"') i++
        else if (c === quote) quote = null
        i++
        continue
      }
      if (c === '"' || c === "'") { quote = c; i++; continue }
      if (stops.indexOf(c) !== -1) break
      i++
    }
    return s.substring(start, i)
  }

  function value() {
    skip()
    var c = s.charAt(i)
    if (c === "[") {
      i++
      var arr = []
      skip()
      if (s.charAt(i) === "]") { i++; return arr }
      while (true) {
        arr.push(value())
        skip()
        if (s.charAt(i) === ",") { i++; skip(); if (s.charAt(i) === "]") { i++; return arr } continue }
        if (s.charAt(i) === "]") { i++; return arr }
        fail("expected “,” or “]” in flow sequence")
      }
    }
    if (c === "{") {
      i++
      var obj = {}
      skip()
      if (s.charAt(i) === "}") { i++; return obj }
      while (true) {
        skip()
        var keyRaw = readScalarToken([":", ",", "}"])
        if (s.charAt(i) !== ":") fail("expected “:” in flow mapping")
        i++
        obj[String(parseScalar(keyRaw))] = value()
        skip()
        if (s.charAt(i) === ",") { i++; skip(); if (s.charAt(i) === "}") { i++; return obj } continue }
        if (s.charAt(i) === "}") { i++; return obj }
        fail("expected “,” or “}” in flow mapping")
      }
    }
    return parseScalar(readScalarToken([",", "]", "}"]))
  }

  var out = value()
  skip()
  if (i < s.length) fail("unexpected trailing content in flow collection")
  return out
}

// ----------------------------------------------------------------- parse

function parse(text) {
  var source = String(text).replace(/\r\n?/g, "\n").split("\n")
  var lines = []
  for (var n = 0; n < source.length; n++) {
    var raw = source[n]
    var match = raw.match(/^[ \t]*/)[0]
    if (match.indexOf("\t") !== -1 && raw.replace(/^[ \t]+/, "").length > 0)
      throw new YamlError("tabs cannot be used for indentation", n + 1)
    lines.push({ raw: raw, indent: match.length, body: raw.slice(match.length), no: n + 1 })
  }

  var documents = []
  var i = 0

  function blank(idx) {
    if (idx >= lines.length) return false
    var b = lines[idx].body
    return b.length === 0 || b.charAt(0) === "#"
  }

  function nextContent(from) {
    var k = from
    while (k < lines.length && blank(k)) k++
    return k
  }

  function guardUnsupported(body, lineNo) {
    if (/^[&*]\S/.test(body)) throw new YamlError("anchors and aliases are not supported", lineNo)
    if (/^!!?\S/.test(body)) throw new YamlError("explicit tags are not supported", lineNo)
    if (/^\?\s/.test(body)) throw new YamlError("complex mapping keys are not supported", lineNo)
  }

  // Reads a `|` / `>` block scalar body starting at line index `from`.
  function blockScalar(header, from, parentIndent) {
    var style = header.charAt(0)
    var chomp = /[-+]/.test(header) ? header.match(/[-+]/)[0] : ""
    var explicit = header.match(/[0-9]+/)
    var k = from
    var contentIndent = explicit ? parentIndent + parseInt(explicit[0], 10) : -1
    var collected = []

    while (k < lines.length) {
      var line = lines[k]
      if (line.body.length === 0) { collected.push(""); k++; continue }
      if (line.indent <= parentIndent) break
      if (contentIndent < 0) contentIndent = line.indent
      collected.push(line.raw.slice(Math.min(contentIndent, line.indent)))
      k++
    }
    while (collected.length && collected[collected.length - 1] === "") collected.pop()

    var body
    if (style === "|") {
      body = collected.join("\n")
    } else {
      // Folded: a single newline between non-empty lines becomes a space;
      // blank lines and more-indented lines keep their breaks.
      var parts = []
      for (var c = 0; c < collected.length; c++) {
        var cur = collected[c]
        if (parts.length === 0) { parts.push(cur); continue }
        var prev = parts[parts.length - 1]
        if (cur === "" || prev === "" || /^\s/.test(cur) || /^\s/.test(prev)) parts.push(cur)
        else parts[parts.length - 1] = prev + " " + cur
      }
      body = parts.join("\n")
    }
    if (chomp === "-") { /* strip: no trailing newline */ }
    else if (chomp === "+") body += "\n"
    else if (body.length) body += "\n"
    return { value: body, next: k }
  }

  function parseNode(indent) {
    i = nextContent(i)
    if (i >= lines.length) return null
    var line = lines[i]
    if (line.indent < indent) return null
    guardUnsupported(line.body, line.no)

    if (/^-(\s|$)/.test(line.body)) return parseSequence(line.indent)
    if (keySplit(stripComment(line.body)) >= 0) return parseMapping(line.indent)

    // A bare scalar, possibly spilling onto continuation lines.
    var pieces = [stripComment(line.body).replace(/\s+$/, "")]
    i++
    while (i < lines.length && !blank(i) && lines[i].indent > indent
           && keySplit(stripComment(lines[i].body)) < 0 && !/^-(\s|$)/.test(lines[i].body)) {
      pieces.push(stripComment(lines[i].body).replace(/^\s+|\s+$/g, ""))
      i++
    }
    var joined = pieces.join(" ").replace(/\s+$/, "")
    if (/^[\[{]/.test(joined)) return parseFlow(joined, line.no)
    return parseScalar(joined)
  }

  function parseSequence(indent) {
    var out = []
    while (true) {
      i = nextContent(i)
      if (i >= lines.length) break
      var line = lines[i]
      if (line.indent < indent) break
      if (line.indent > indent) throw new YamlError("unexpected indentation in sequence", line.no)
      if (!/^-(\s|$)/.test(line.body)) break

      var rest = line.body.slice(1).replace(/^\s/, "")
      var restStripped = stripComment(rest).replace(/\s+$/, "")
      guardUnsupported(restStripped, line.no)
      var itemIndent = line.indent + 1

      if (restStripped.length === 0) {
        i++
        var nested = parseNode(indent + 1)
        out.push(nested === null ? null : nested)
        continue
      }
      if (/^[|>]/.test(restStripped)) {
        var block = blockScalar(restStripped, i + 1, line.indent)
        out.push(block.value)
        i = block.next
        continue
      }
      // "- key: value" starts a mapping whose column is where `key` begins.
      // Rewrite the line as if the dash were indentation so the mapping
      // parser sees a normal block starting at that column.
      if (keySplit(restStripped) >= 0) {
        var column = line.indent + line.body.indexOf(rest.charAt(0), 1)
        lines[i] = { raw: line.raw, indent: column, body: line.raw.slice(column), no: line.no }
        out.push(parseMapping(column))
        continue
      }
      if (/^[\[{]/.test(restStripped)) { out.push(parseFlow(restStripped, line.no)); i++; continue }
      if (/^-(\s|$)/.test(restStripped)) {
        var column2 = line.indent + line.body.indexOf("-", 1)
        lines[i] = { raw: line.raw, indent: column2, body: line.raw.slice(column2), no: line.no }
        out.push(parseSequence(column2))
        continue
      }
      out.push(parseScalar(restStripped))
      i++
    }
    return out
  }

  function parseMapping(indent) {
    var out = {}
    var order = []
    while (true) {
      i = nextContent(i)
      if (i >= lines.length) break
      var line = lines[i]
      if (line.indent < indent) break
      if (line.indent > indent) throw new YamlError("unexpected indentation in mapping", line.no)
      if (/^(---|\.\.\.)/.test(line.body)) break
      guardUnsupported(line.body, line.no)

      var body = stripComment(line.body).replace(/\s+$/, "")
      var split = keySplit(body)
      if (split < 0) break

      var key = String(parseScalar(body.substring(0, split)))
      var rest = body.slice(split + 1).replace(/^\s+/, "")
      guardUnsupported(rest, line.no)

      if (rest.length === 0) {
        i++
        var child = parseNode(indent + 1)
        out[key] = child
      } else if (/^[|>][-+]?[0-9]*$/.test(rest)) {
        var block = blockScalar(rest, i + 1, line.indent)
        out[key] = block.value
        i = block.next
      } else if (/^[\[{]/.test(rest)) {
        out[key] = parseFlow(rest, line.no)
        i++
      } else {
        // A plain scalar may continue on more-indented following lines.
        var pieces = [rest]
        i++
        while (i < lines.length && !blank(i) && lines[i].indent > indent
               && keySplit(stripComment(lines[i].body)) < 0 && !/^-(\s|$)/.test(lines[i].body)) {
          pieces.push(stripComment(lines[i].body).replace(/^\s+|\s+$/g, ""))
          i++
        }
        out[key] = parseScalar(pieces.join(" "))
      }
      if (order.indexOf(key) === -1) order.push(key)
    }
    try { Object.defineProperty(out, "__keyOrder", { value: order, enumerable: false }) } catch (e) {}
    return out
  }

  while (i < lines.length) {
    i = nextContent(i)
    if (i >= lines.length) break
    if (/^---/.test(lines[i].body)) {
      var trailer = lines[i].body.slice(3).replace(/^\s+/, "")
      if (trailer.length && trailer.charAt(0) !== "#") {
        lines[i] = { raw: trailer, indent: 0, body: trailer, no: lines[i].no }
      } else {
        i++
      }
      documents.push(parseNode(0))
      continue
    }
    if (/^\.\.\./.test(lines[i].body)) { i++; continue }
    documents.push(parseNode(0))
  }

  if (documents.length === 0) return null
  return documents.length === 1 ? documents[0] : documents
}

// ------------------------------------------------------------------ emit

function needsQuotes(s) {
  if (s.length === 0) return true
  if (/^\s|\s$/.test(s)) return true
  if (/[:#\n\t]|: |^[-?&*!|>%@`'"\[\]{},]/.test(s)) return true
  // A string that would round-trip as some other type has to be quoted.
  var reparsed = parseScalar(s)
  return typeof reparsed !== "string"
}

function emitScalar(v) {
  if (v === null || v === undefined) return "null"
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "number") {
    if (v !== v) return ".nan"
    if (v === Infinity) return ".inf"
    if (v === -Infinity) return "-.inf"
    return String(v)
  }
  var s = String(v)
  if (s.indexOf("\n") !== -1) return null // caller switches to a block scalar
  return needsQuotes(s) ? '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\t/g, "\\t") + '"' : s
}

function keysOf(value) {
  var order = value && value.__keyOrder
  if (order && order.length) return order.slice(0)
  var keys = []
  for (var k in value) if (k !== "__keyOrder") keys.push(k)
  return keys
}

function emit(value, indentWidth) {
  var width = Number(indentWidth) > 0 ? Number(indentWidth) : 2
  var pad = new Array(width + 1).join(" ")

  function isCollection(v) {
    return v !== null && typeof v === "object"
  }

  function block(v, depth) {
    var prefix = new Array(depth + 1).join(pad)
    if (Array.isArray(v)) {
      if (v.length === 0) return prefix + "[]"
      var rows = []
      for (var i = 0; i < v.length; i++) {
        var item = v[i]
        if (isCollection(item) && (Array.isArray(item) ? item.length : keysOf(item).length)) {
          rows.push(prefix + "-\n" + block(item, depth + 1))
        } else {
          rows.push(prefix + "- " + inline(item, depth))
        }
      }
      return rows.join("\n")
    }
    var keys = keysOf(v)
    if (keys.length === 0) return prefix + "{}"
    var out = []
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k]
      var val = v[key]
      var quotedKey = needsQuotes(String(key)) ? '"' + String(key).replace(/"/g, '\\"') + '"' : String(key)
      if (isCollection(val) && (Array.isArray(val) ? val.length : keysOf(val).length)) {
        out.push(prefix + quotedKey + ":\n" + block(val, depth + 1))
      } else {
        out.push(prefix + quotedKey + ": " + inline(val, depth))
      }
    }
    return out.join("\n")
  }

  function inline(v, depth) {
    if (isCollection(v)) return Array.isArray(v) ? "[]" : "{}"
    var scalar = emitScalar(v)
    if (scalar !== null) return scalar
    // Multi-line strings become literal block scalars.
    var childPad = new Array(depth + 2).join(pad)
    var body = String(v).replace(/\n$/, "").split("\n").map(function (l) { return childPad + l }).join("\n")
    return "|-\n" + body
  }

  if (!isCollection(value)) {
    var scalar = emitScalar(value)
    return scalar === null ? String(value) : scalar
  }
  return block(value, 0)
}

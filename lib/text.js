.pragma library

// String-level transforms: URL encoding, HTML entities, backslash escapes,
// case conversion, and line operations.

// ------------------------------------------------------------------- url

// encodeURIComponent leaves ! ' ( ) * alone; RFC 3986 says they are reserved,
// and the difference bites when signing requests, so escape them too.
function urlEncodeComponent(text) {
  return encodeURIComponent(String(text)).replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase()
  })
}

function urlEncodeFull(text) { return encodeURI(String(text)) }

function urlDecode(text) {
  var s = String(text)
  try {
    return decodeURIComponent(s)
  } catch (e) {
    // Salvage what we can: decode valid %XX runs one at a time and leave
    // malformed ones verbatim rather than failing the whole paste.
    return s.replace(/%[0-9a-fA-F]{2}/g, function (m) {
      try { return decodeURIComponent(m) } catch (err) { return m }
    })
  }
}

function urlDecodePlus(text) { return urlDecode(String(text).replace(/\+/g, " ")) }

// --------------------------------------------------------- html entities

var NAMED_ENTITIES = {
  "quot": 34, "amp": 38, "apos": 39, "lt": 60, "gt": 62, "nbsp": 160, "iexcl": 161,
  "cent": 162, "pound": 163, "curren": 164, "yen": 165, "brvbar": 166, "sect": 167,
  "uml": 168, "copy": 169, "ordf": 170, "laquo": 171, "not": 172, "shy": 173, "reg": 174,
  "macr": 175, "deg": 176, "plusmn": 177, "sup2": 178, "sup3": 179, "acute": 180,
  "micro": 181, "para": 182, "middot": 183, "cedil": 184, "sup1": 185, "ordm": 186,
  "raquo": 187, "frac14": 188, "frac12": 189, "frac34": 190, "iquest": 191,
  "Agrave": 192, "Aacute": 193, "Acirc": 194, "Atilde": 195, "Auml": 196, "Aring": 197,
  "AElig": 198, "Ccedil": 199, "Egrave": 200, "Eacute": 201, "Ecirc": 202, "Euml": 203,
  "Igrave": 204, "Iacute": 205, "Icirc": 206, "Iuml": 207, "ETH": 208, "Ntilde": 209,
  "Ograve": 210, "Oacute": 211, "Ocirc": 212, "Otilde": 213, "Ouml": 214, "times": 215,
  "Oslash": 216, "Ugrave": 217, "Uacute": 218, "Ucirc": 219, "Uuml": 220, "Yacute": 221,
  "THORN": 222, "szlig": 223, "agrave": 224, "aacute": 225, "acirc": 226, "atilde": 227,
  "auml": 228, "aring": 229, "aelig": 230, "ccedil": 231, "egrave": 232, "eacute": 233,
  "ecirc": 234, "euml": 235, "igrave": 236, "iacute": 237, "icirc": 238, "iuml": 239,
  "eth": 240, "ntilde": 241, "ograve": 242, "oacute": 243, "ocirc": 244, "otilde": 245,
  "ouml": 246, "divide": 247, "oslash": 248, "ugrave": 249, "uacute": 250, "ucirc": 251,
  "uuml": 252, "yacute": 253, "thorn": 254, "yuml": 255, "OElig": 338, "oelig": 339,
  "Scaron": 352, "scaron": 353, "Yuml": 376, "fnof": 402, "circ": 710, "tilde": 732,
  "ensp": 8194, "emsp": 8195, "thinsp": 8201, "zwnj": 8204, "zwj": 8205, "lrm": 8206,
  "rlm": 8207, "ndash": 8211, "mdash": 8212, "lsquo": 8216, "rsquo": 8217, "sbquo": 8218,
  "ldquo": 8220, "rdquo": 8221, "bdquo": 8222, "dagger": 8224, "Dagger": 8225,
  "bull": 8226, "hellip": 8230, "permil": 8240, "prime": 8242, "Prime": 8243,
  "lsaquo": 8249, "rsaquo": 8250, "oline": 8254, "frasl": 8260, "euro": 8364,
  "trade": 8482, "larr": 8592, "uarr": 8593, "rarr": 8594, "darr": 8595, "harr": 8596,
  "crarr": 8629, "lceil": 8968, "rceil": 8969, "lfloor": 8970, "rfloor": 8971,
  "loz": 9674, "spades": 9824, "clubs": 9827, "hearts": 9829, "diams": 9830,
  "alpha": 945, "beta": 946, "gamma": 947, "delta": 948, "pi": 960, "sigma": 963,
  "omega": 969, "Alpha": 913, "Beta": 914, "Gamma": 915, "Delta": 916, "Pi": 928,
  "Sigma": 931, "Omega": 937, "infin": 8734, "ne": 8800, "le": 8804, "ge": 8805,
  "sum": 8721, "prod": 8719, "radic": 8730, "int": 8747, "asymp": 8776, "equiv": 8801
}

var CODE_TO_NAME = (function () {
  var out = {}
  for (var name in NAMED_ENTITIES) {
    var code = NAMED_ENTITIES[name]
    // First name wins so `&quot;` beats a later synonym.
    if (out[code] === undefined) out[code] = name
  }
  return out
})()

// mode: "minimal" (only the five XML-significant chars), "named" (named where
// one exists, numeric otherwise), or "all" (everything non-ASCII, numeric).
function htmlEncode(text, mode) {
  var s = String(text)
  var how = mode || "named"
  var out = ""
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    var code = s.charCodeAt(i)
    if (ch === "&") { out += "&amp;"; continue }
    if (ch === "<") { out += "&lt;"; continue }
    if (ch === ">") { out += "&gt;"; continue }
    if (ch === '"') { out += "&quot;"; continue }
    if (ch === "'") { out += how === "minimal" ? "&#39;" : "&apos;"; continue }
    if (how === "minimal" || code < 128) { out += ch; continue }
    if (how === "named" && CODE_TO_NAME[code]) { out += "&" + CODE_TO_NAME[code] + ";"; continue }
    // Surrogate pairs must be emitted as one numeric reference.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      var low = s.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += "&#" + (0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00)) + ";"
        i++
        continue
      }
    }
    out += "&#" + code + ";"
  }
  return out
}

function htmlDecode(text) {
  return String(text).replace(/&(#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, function (match, body) {
    if (body.charAt(0) === "#") {
      var code = body.charAt(1) === "x" || body.charAt(1) === "X"
        ? parseInt(body.substr(2), 16)
        : parseInt(body.substr(1), 10)
      if (!isFinite(code) || code < 0 || code > 0x10ffff) return match
      return codePointToString(code)
    }
    var named = NAMED_ENTITIES[body]
    if (named === undefined) return match
    return codePointToString(named)
  })
}

function codePointToString(code) {
  if (code < 0x10000) return String.fromCharCode(code)
  code -= 0x10000
  return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff))
}

// -------------------------------------------------------------- escaping

function backslashEscape(text, quoteStyle) {
  var s = String(text)
  var out = ""
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    var code = s.charCodeAt(i)
    if (ch === "\\") { out += "\\\\" }
    else if (ch === "\n") { out += "\\n" }
    else if (ch === "\r") { out += "\\r" }
    else if (ch === "\t") { out += "\\t" }
    else if (ch === "\b") { out += "\\b" }
    else if (ch === "\f") { out += "\\f" }
    else if (ch === '"' && quoteStyle !== "single") { out += '\\"' }
    else if (ch === "'" && quoteStyle === "single") { out += "\\'" }
    else if (code < 0x20 || code === 0x7f) { out += "\\u" + ("0000" + code.toString(16)).slice(-4) }
    else { out += ch }
  }
  return out
}

function backslashUnescape(text) {
  var s = String(text)
  var out = ""
  for (var i = 0; i < s.length; i++) {
    if (s.charAt(i) !== "\\") { out += s.charAt(i); continue }
    var n = s.charAt(++i)
    if (n === "n") out += "\n"
    else if (n === "r") out += "\r"
    else if (n === "t") out += "\t"
    else if (n === "b") out += "\b"
    else if (n === "f") out += "\f"
    else if (n === "v") out += "\v"
    else if (n === "0" && !/[0-9]/.test(s.charAt(i + 1))) out += "\0"
    else if (n === "u") {
      if (s.charAt(i + 1) === "{") {
        var end = s.indexOf("}", i + 2)
        if (end < 0) { out += "\\u"; continue }
        out += codePointToString(parseInt(s.substring(i + 2, end), 16) || 0)
        i = end
      } else {
        out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16) || 0)
        i += 4
      }
    }
    else if (n === "x") { out += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16) || 0); i += 2 }
    else out += n
  }
  return out
}

// ------------------------------------------------------------ case forms

// Splits on separators, camel humps, and letter/digit boundaries so
// "parseHTTPResponse2XML" becomes [parse, HTTP, Response, 2, XML].
function words(text) {
  var s = String(text || "")
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  s = s.replace(/([a-zA-Z])([0-9])/g, "$1 $2")
  s = s.replace(/([0-9])([a-zA-Z])/g, "$1 $2")
  s = s.replace(/[_\-.\/\\:]+/g, " ")
  var parts = s.split(/\s+/)
  var out = []
  for (var i = 0; i < parts.length; i++) if (parts[i].length) out.push(parts[i])
  return out
}

function capitalize(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() }

var CASE_FORMS = [
  { id: "camel",    label: "camelCase" },
  { id: "pascal",   label: "PascalCase" },
  { id: "snake",    label: "snake_case" },
  { id: "constant", label: "CONSTANT_CASE" },
  { id: "kebab",    label: "kebab-case" },
  { id: "train",    label: "Train-Case" },
  { id: "dot",      label: "dot.case" },
  { id: "path",     label: "path/case" },
  { id: "title",    label: "Title Case" },
  { id: "sentence", label: "Sentence case" },
  { id: "lower",    label: "lower case" },
  { id: "upper",    label: "UPPER CASE" }
]

function toCase(text, form) {
  var w = words(text)
  if (w.length === 0) return ""
  switch (form) {
    case "camel":    return w.map(function (x, i) { return i === 0 ? x.toLowerCase() : capitalize(x) }).join("")
    case "pascal":   return w.map(capitalize).join("")
    case "snake":    return w.join("_").toLowerCase()
    case "constant": return w.join("_").toUpperCase()
    case "kebab":    return w.join("-").toLowerCase()
    case "train":    return w.map(capitalize).join("-")
    case "dot":      return w.join(".").toLowerCase()
    case "path":     return w.join("/").toLowerCase()
    case "title":    return w.map(capitalize).join(" ")
    case "sentence": return capitalize(w.join(" "))
    case "lower":    return w.join(" ").toLowerCase()
    case "upper":    return w.join(" ").toUpperCase()
    default:         return String(text)
  }
}

// -------------------------------------------------------------- line ops

function splitLines(text) {
  return String(text).replace(/\r\n?/g, "\n").split("\n")
}

function naturalCompare(a, b) {
  var re = /(\d+)|(\D+)/g
  var ax = String(a).match(re) || []
  var bx = String(b).match(re) || []
  for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
    var an = parseInt(ax[i], 10), bn = parseInt(bx[i], 10)
    if (isFinite(an) && isFinite(bn)) {
      if (an !== bn) return an - bn
    } else if (ax[i] !== bx[i]) {
      return ax[i] < bx[i] ? -1 : 1
    }
  }
  return ax.length - bx.length
}

function lineOp(text, op, opts) {
  var o = opts || {}
  var lines = splitLines(text)
  if (o.ignoreBlank) lines = lines.filter(function (l) { return l.trim().length > 0 })

  switch (op) {
    case "sort":
      lines = lines.slice(0).sort(function (a, b) {
        var x = o.caseSensitive ? a : a.toLowerCase()
        var y = o.caseSensitive ? b : b.toLowerCase()
        return o.natural ? naturalCompare(x, y) : (x < y ? -1 : x > y ? 1 : 0)
      })
      if (o.descending) lines.reverse()
      break
    case "dedupe":
      var seen = {}
      var kept = []
      for (var i = 0; i < lines.length; i++) {
        var key = o.caseSensitive ? lines[i] : lines[i].toLowerCase()
        if (seen[key]) continue
        seen[key] = true
        kept.push(lines[i])
      }
      lines = kept
      break
    case "duplicates":
      var counts = {}
      for (var c = 0; c < lines.length; c++) {
        var ck = o.caseSensitive ? lines[c] : lines[c].toLowerCase()
        counts[ck] = (counts[ck] || 0) + 1
      }
      var dupSeen = {}
      lines = lines.filter(function (l) {
        var k = o.caseSensitive ? l : l.toLowerCase()
        if (counts[k] < 2 || dupSeen[k]) return false
        dupSeen[k] = true
        return true
      })
      break
    case "reverse":
      lines = lines.slice(0).reverse()
      break
    case "shuffle":
      lines = lines.slice(0)
      for (var s = lines.length - 1; s > 0; s--) {
        var r = Math.floor(Math.random() * (s + 1))
        var t = lines[s]; lines[s] = lines[r]; lines[r] = t
      }
      break
    case "number":
      var pad = String(lines.length).length
      lines = lines.map(function (l, idx) {
        return ("        " + (idx + 1)).slice(-pad) + ". " + l
      })
      break
    case "trim":
      lines = lines.map(function (l) { return l.replace(/^\s+|\s+$/g, "") })
      break
    case "join":
      return lines.join(o.joiner === undefined ? ", " : o.joiner)
  }
  return lines.join("\n")
}

// The fuller picture, for the statistics tool. `stats` stays as it is because
// half a dozen tools use it for a one-line status and do not want the cost of
// counting unique words on every keystroke.
function analyze(text) {
  var s = String(text === undefined || text === null ? "" : text)
  var lines = splitLines(s)
  var wordList = s.match(/[^\s]+/g) || []

  var unique = {}
  var uniqueCount = 0
  var totalWordLength = 0
  for (var i = 0; i < wordList.length; i++) {
    totalWordLength += wordList[i].length
    var key = wordList[i].toLowerCase().replace(/^[^\w']+|[^\w']+$/g, "")
    if (key.length === 0) continue
    if (!unique[key]) { unique[key] = true; uniqueCount++ }
  }

  var longest = 0
  var nonEmpty = 0
  for (var l = 0; l < lines.length; l++) {
    if (lines[l].length > longest) longest = lines[l].length
    if (lines[l].replace(/^\s+|\s+$/g, "").length > 0) nonEmpty++
  }

  // A paragraph is a run of text separated by a blank line; a sentence ends at
  // . ! or ? — both are approximations, and neither pretends otherwise.
  var paragraphs = s.replace(/^\s+|\s+$/g, "").length === 0
    ? 0 : s.replace(/^\s+|\s+$/g, "").split(/\n\s*\n/).length
  var sentences = (s.match(/[^.!?]+[.!?]+(\s|$)/g) || []).length
  if (sentences === 0 && wordList.length > 0) sentences = 1

  return {
    characters: s.length,
    charactersNoSpaces: s.replace(/\s/g, "").length,
    words: wordList.length,
    uniqueWords: uniqueCount,
    lines: s.length === 0 ? 0 : lines.length,
    nonEmptyLines: nonEmpty,
    longestLine: longest,
    paragraphs: paragraphs,
    sentences: sentences,
    averageWordLength: wordList.length === 0
      ? 0 : Math.round((totalWordLength / wordList.length) * 10) / 10,
    // 200 words per minute is the usual desk figure for silent reading.
    readingSeconds: Math.round((wordList.length / 200) * 60)
  }
}

function stats(text) {
  var s = String(text)
  var lines = splitLines(s)
  var wordCount = (s.match(/\S+/g) || []).length
  return {
    characters: s.length,
    charactersNoSpaces: s.replace(/\s/g, "").length,
    words: wordCount,
    lines: s.length === 0 ? 0 : lines.length
  }
}

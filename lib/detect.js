.pragma library
.import "bytes.js" as Bytes
.import "json.js" as Json
.import "yaml.js" as Yaml
.import "jwt.js" as Jwt
.import "csv.js" as Csv
.import "generate.js" as Gen
.import "color.js" as Color
.import "cron.js" as Cron

// Clipboard sniffing — the trick that makes a toolbox feel like it read your
// mind. Each detector returns a confidence so the strongest signal wins;
// order alone would be too brittle, since a JWT is also valid Base64 and a
// JSON document is also valid YAML.

// Detection runs on the UI thread the moment the overlay opens, before there
// is any result worth showing, so it must stay cheap regardless of what is on
// the clipboard. Past this size the "does it actually parse?" confirmations
// are skipped and shape alone decides, at slightly lower confidence. The point
// of detection is to save a click, not to spend a second of the shell's main
// thread proving a payload is well-formed.
var DEEP_CHECK_LIMIT = 65536

function suggestion(toolId, confidence, reason, state) {
  return { toolId: toolId, confidence: confidence, reason: reason, state: state || {} }
}

function firstLine(text) {
  return String(text).split("\n")[0].replace(/^\s+|\s+$/g, "")
}

function trimmed(text) {
  return String(text === undefined || text === null ? "" : text).replace(/^\s+|\s+$/g, "")
}

// Returns every plausible tool for this text, best first.
function suggestAll(text) {
  var s = trimmed(text)
  var out = []
  if (s.length === 0) return out

  // --- unambiguous structural signatures ------------------------------------

  if (Jwt.looksLikeJwt(s)) out.push(suggestion("jwt", 0.99, "looks like a JWT"))

  if (/^[{[]/.test(s)) {
    if (s.length > DEEP_CHECK_LIMIT) {
      out.push(suggestion("json", 0.9, "starts like JSON"))
    } else try {
      Json.parse(s)
      out.push(suggestion("json", 0.97, "valid JSON"))
    } catch (e) {
      try {
        Json.parse(s, true)
        out.push(suggestion("json", 0.8, "JSON with comments or trailing commas", { lenient: true }))
      } catch (e2) {
        out.push(suggestion("json", 0.6, "starts like JSON but does not parse"))
      }
    }
  }

  if (/^<\?xml/i.test(s)) out.push(suggestion("xml", 0.96, "XML document"))
  else if (/^<!DOCTYPE html/i.test(s) || /^<html/i.test(s)) out.push(suggestion("html", 0.95, "HTML document"))
  else if (/^<[a-z!/]/i.test(s) && /<\/[a-z][\w:-]*>|\/>/i.test(s)) {
    out.push(suggestion("html", 0.7, "markup fragment"))
    out.push(suggestion("xml", 0.65, "markup fragment"))
  }

  if (/^[a-z][\w+.-]*:\/\//i.test(s) && s.indexOf("\n") === -1)
    out.push(suggestion("url-parse", 0.95, "a URL"))

  var uuid = Gen.uuidVersion(s)
  if (uuid) out.push(suggestion("id-inspect", 0.95, "a UUID (v" + uuid.version + ")"))
  else if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(s)) out.push(suggestion("id-inspect", 0.9, "a ULID"))

  if (/^#?[0-9a-f]{3}$/i.test(s) || /^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)
      || /^(rgb|hsl|hsv)a?\s*\(/i.test(s)) {
    try {
      Color.parse(s)
      out.push(suggestion("color", 0.93, "a color value"))
    } catch (e) { /* not a color after all */ }
  }

  // --- timestamps -----------------------------------------------------------

  if (/^[0-9]{9,19}$/.test(s)) {
    out.push(suggestion("unixtime", 0.9, "an epoch timestamp"))
    out.push(suggestion("base-convert", 0.4, "a number"))
  } else if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})/.test(s)) {
    out.push(suggestion("unixtime", 0.9, "an ISO 8601 date"))
  }

  if (/^(0[xX][0-9a-fA-F]+|0b[01]+|0o[0-7]+)$/.test(s))
    out.push(suggestion("base-convert", 0.9, "a prefixed number literal"))

  // --- cron -----------------------------------------------------------------

  if (s.indexOf("\n") === -1 && /^(@\w+|[\d*/,\-]+(\s+[\w*/,\-]+){4,5})$/.test(s)) {
    try {
      Cron.parse(s)
      out.push(suggestion("cron", 0.92, "a cron expression"))
    } catch (e) { /* not cron */ }
  }

  // --- encodings ------------------------------------------------------------

  if (/%[0-9a-fA-F]{2}/.test(s))
    out.push(suggestion("url-encode", 0.85, "percent-encoded text", { mode: "decode" }))

  if (/&(#\d+|#x[0-9a-fA-F]+|[a-z]+);/i.test(s))
    out.push(suggestion("html-entities", 0.82, "contains HTML entities", { mode: "decode" }))

  if (Bytes.looksLikeBase64(s) && s.indexOf(" ") === -1) {
    // Only offer Base64 when the payload decodes to something plausible;
    // otherwise every hex string and random token gets a false suggestion.
    if (s.length > DEEP_CHECK_LIMIT) {
      out.push(suggestion("base64", 0.7, "looks like Base64", { mode: "decode" }))
    } else try {
      var decoded = Bytes.decodeBase64(s)
      var confidence = 0.5
      try {
        var asText = Bytes.fromUtf8(decoded, true)
        if (/^[\x20-\x7e\s]*$/.test(asText)) confidence = 0.86
      } catch (e) { confidence = 0.55 }
      out.push(suggestion("base64", confidence, "decodes as Base64", { mode: "decode" }))
    } catch (e) { /* not base64 */ }
  }

  if (/^[0-9a-f]{32}$/i.test(s)) out.push(suggestion("hash", 0.6, "MD5-length hex digest"))
  else if (/^[0-9a-f]{40}$/i.test(s)) out.push(suggestion("hash", 0.6, "SHA-1-length hex digest"))
  else if (/^[0-9a-f]{64}$/i.test(s)) out.push(suggestion("hash", 0.6, "SHA-256-length hex digest"))

  // --- languages ------------------------------------------------------------

  if (/^\s*(select|insert\s+into|update|delete\s+from|with|create\s+(table|index|view)|alter\s+table)\b/i.test(s))
    out.push(suggestion("sql", 0.9, "a SQL statement"))

  if (/^[^{}]*\{[^{}]*:[^{}]*\}/.test(s) && /[.#@][\w-]+|\b[a-z-]+\s*:\s*[^;]+;/i.test(s) && s.indexOf("<") === -1)
    out.push(suggestion("css", 0.7, "looks like CSS"))

  if (/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|```)/m.test(s) && /\n/.test(s))
    out.push(suggestion("markdown", 0.6, "Markdown formatting"))

  // --- tabular / structured text -------------------------------------------

  var lines = String(s).split("\n").filter(function (l) { return l.replace(/^\s+|\s+$/g, "").length > 0 })
  if (lines.length >= 2) {
    var delimiter = Csv.detectDelimiter(s)
    var counts = []
    for (var i = 0; i < Math.min(lines.length, 8); i++) {
      var count = 0
      for (var c = 0; c < lines[i].length; c++) if (lines[i].charAt(c) === delimiter) count++
      counts.push(count)
    }
    var consistent = counts[0] > 0 && counts.every(function (n) { return n === counts[0] })
    if (consistent) out.push(suggestion("json-csv", 0.85, "delimited rows", { mode: "toJson" }))
  }

  if (!/^[{[]/.test(s) && /^[\w".-]+\s*:( |$)/m.test(s) && lines.length >= 2) {
    if (s.length > DEEP_CHECK_LIMIT) {
      out.push(suggestion("json-yaml", 0.7, "looks like YAML", { mode: "toJson" }))
    } else try {
      var parsed = Yaml.parse(s)
      if (parsed !== null && typeof parsed === "object")
        out.push(suggestion("json-yaml", 0.8, "valid YAML", { mode: "toJson" }))
    } catch (e) { /* not YAML */ }
  }

  if (lines.length >= 3) out.push(suggestion("lines", 0.35, lines.length + " lines of text"))

  // --- always-available fallbacks ------------------------------------------

  out.push(suggestion("hash", 0.15, "hash this text"))
  out.push(suggestion("base64", 0.14, "encode as Base64", { mode: "encode" }))

  out.sort(function (a, b) { return b.confidence - a.confidence })

  // Keep only the strongest suggestion per tool.
  var seen = {}
  var unique = []
  for (var k = 0; k < out.length; k++) {
    if (seen[out[k].toolId]) continue
    seen[out[k].toolId] = true
    unique.push(out[k])
  }
  return unique
}

// The single best guess, or null when nothing looked convincing enough to
// hijack the user's tool selection.
function suggestBest(text, threshold) {
  var all = suggestAll(text)
  var minimum = threshold === undefined ? 0.6 : threshold
  if (all.length === 0 || all[0].confidence < minimum) return null
  return all[0]
}

function topSuggestions(text, limit) {
  var all = suggestAll(text)
  var strong = []
  for (var i = 0; i < all.length && strong.length < (limit || 4); i++)
    if (all[i].confidence >= 0.5) strong.push(all[i])
  return strong
}

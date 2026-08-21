.pragma library
.import "bytes.js" as Bytes
.import "text.js" as Text
.import "hash.js" as Hash
.import "json.js" as Json
.import "yaml.js" as Yaml
.import "csv.js" as Csv
.import "sql.js" as Sql
.import "markup.js" as Markup
.import "numbers.js" as Num
.import "color.js" as Color
.import "time.js" as Time
.import "cron.js" as Cron
.import "url.js" as Url
.import "jwt.js" as Jwt
.import "dataurl.js" as DataUrl
.import "types.js" as Types
.import "sanitize.js" as Sanitize
.import "diff.js" as Diff
.import "generate.js" as Gen

// The tool catalogue. Every entry is data plus one `run` function, so the QML
// side stays six generic views instead of thirty bespoke screens:
//
//   transform  input pane  -> output pane
//   report     input pane  -> labelled fields and/or text sections
//   diff       two inputs  -> annotated rows
//   preview    input pane  -> rendered markdown or HTML
//   image      input pane  -> generated image
//   generate   options     -> output pane (no input)
//
// `run(input, state)` always returns the same envelope, so a view never has
// to know which tool produced it.

function result(extra) {
  var out = {
    ok: true, error: "", output: "", format: "", info: "",
    fields: [], sections: [], rows: [], imageCommand: null, swatch: "",
    // Argv whose stdout becomes the output. The mirror of imageCommand: that
    // one turns text into a picture, this one turns a picture into text.
    // Prefix and suffix dress that output — declarative rather than a callback,
    // so an envelope stays plain data and survives the worker thread.
    textCommand: null, textPrefix: "", textSuffix: "",
    // A URL a view can hand straight to an Image, for tools whose result is a
    // picture that needs no file (a data: URI).
    imageSource: "",
    // Where in the input the failure was, when the thrower knew. -1 / 0 mean
    // "not known"; the UI uses these to put the cursor on the problem instead
    // of just naming a line number at you.
    errorIndex: -1, errorLine: 0, errorColumn: 0
  }
  for (var k in extra) out[k] = extra[k]
  return out
}

function failure(message) {
  return result({ ok: false, error: String(message) })
}

// Copies whatever position a thrown error carried onto the envelope. The JSON
// parser knows the exact character index; the YAML one only knows the line,
// and the UI turns that into an index against the input it still has.
function withPosition(envelope, error) {
  if (!error) return envelope
  if (typeof error.index === "number" && isFinite(error.index)) envelope.errorIndex = error.index
  if (typeof error.line === "number" && isFinite(error.line)) envelope.errorLine = error.line
  if (typeof error.column === "number" && isFinite(error.column)) envelope.errorColumn = error.column
  return envelope
}

// Character offset of a 1-based line/column pair. Clamps rather than throwing:
// a position past the end of the text should land at the end, not blow up.
function indexOfPosition(text, line, column) {
  var s = String(text === undefined || text === null ? "" : text)
  var targetLine = Math.max(1, Number(line) || 1)
  var targetColumn = Math.max(1, Number(column) || 1)
  var index = 0
  var currentLine = 1
  while (currentLine < targetLine && index < s.length) {
    var nextBreak = s.indexOf("\n", index)
    if (nextBreak === -1) return s.length
    index = nextBreak + 1
    currentLine++
  }
  return Math.min(s.length, index + targetColumn - 1)
}

// A blank envelope: no output, no error, nothing to say. Used before a tool
// has run, and when input has changed but the run is waiting to be asked for
// — showing the previous run's output next to different input would read as
// an answer to a question nobody asked.
function emptyResult() { return result({}) }

function guard(fn) {
  try {
    return fn()
  } catch (e) {
    return withPosition(failure(e && (e.formatted || e.message) ? (e.formatted || e.message) : String(e)), e)
  }
}

function opt(state, key, fallback) {
  if (!state || state[key] === undefined || state[key] === null) return fallback
  return state[key]
}

function num(state, key, fallback) {
  var v = Number(opt(state, key, fallback))
  return isFinite(v) ? v : fallback
}

function flag(state, key, fallback) {
  var v = opt(state, key, fallback)
  return v === true || v === "true"
}

function field(label, value, extra) {
  var row = { label: label, value: value === undefined || value === null ? "" : String(value), mono: true, swatch: "", note: "" }
  for (var k in extra) row[k] = extra[k]
  return row
}

function section(title, body) {
  return { title: title, body: body === undefined || value === null ? "" : String(body) }
}

function textSection(title, body) {
  return { title: title, body: body === undefined || body === null ? "" : String(body) }
}

// Two tools take a filesystem path as their input rather than text, and the
// host is the only thing that should ever set it. Nothing reaches them from a
// shared chain or the clipboard today — the chain and headless paths do not
// execute a textCommand at all — but both are one small change away from
// doing so, and "reads any file you can read" is not a surprise worth leaving
// lying around in something people are invited to share.
var OWNED_IMAGE_PATH = /^\/[^\0]*\/omarchy-toolroll-(scan|preview)-\d+\.png$/

function isOwnedImagePath(path) {
  var s = String(path === undefined || path === null ? "" : path)
  if (s.indexOf("..") !== -1) return false
  return OWNED_IMAGE_PATH.test(s)
}

function empty(input) {
  return String(input === undefined || input === null ? "" : input).length === 0
}

function sizeInfo(input, output) {
  var from = Bytes.utf8Length(input)
  var to = Bytes.utf8Length(output)
  var delta = from === 0 ? 0 : Math.round(((to - from) / from) * 100)
  return Bytes.humanBytes(from) + " → " + Bytes.humanBytes(to)
    + (from > 0 && to !== from ? " (" + (delta > 0 ? "+" : "") + delta + "%)" : "")
}

var INDENT_OPTION = {
  key: "indent", type: "select", label: "Indent", default: "2",
  choices: [{ value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }, { value: "tab", label: "Tab" }]
}

function indentValue(state) {
  var v = String(opt(state, "indent", "2"))
  return v === "tab" ? "\t" : Number(v)
}

function indentWidth(state) {
  var v = String(opt(state, "indent", "2"))
  return v === "tab" ? 0 : Number(v)
}

// ---------------------------------------------------------------- catalogue

var TOOLS = [

// ==================================================================== session

{
  id: "history",
  name: "History",
  category: "Session",
  icon: "󰋚",
  keywords: ["recent", "previous", "back", "undo", "log", "session"],
  description: "Everything you have run this session. Kept in memory only.",
  view: "history",
  // The view reads the list from the host; there is nothing to compute.
  run: function (input, state) { return result({}) }
},

// ============================================================ encode / decode

{
  id: "base64",
  name: "Base64 String",
  category: "Encode & decode",
  icon: "󰯉",
  keywords: ["b64", "encode", "decode", "atob", "btoa"],
  description: "Encode and decode Base64, standard or URL-safe.",
  view: "transform",
  modes: [{ id: "encode", label: "Encode" }, { id: "decode", label: "Decode" }],
  options: [
    { key: "urlSafe", type: "toggle", label: "URL-safe", default: false },
    { key: "padding", type: "toggle", label: "Padding", default: true },
    { key: "wrap", type: "toggle", label: "Wrap at 76", default: false }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      if (opt(state, "mode", "encode") === "decode") {
        var bytes = Bytes.decodeBase64(input)
        var text
        try {
          text = Bytes.fromUtf8(bytes, true)
        } catch (e) {
          return result({
            output: Bytes.toHex(bytes, false, " "),
            info: "Not UTF-8 text — showing " + bytes.length + " raw bytes as hex"
          })
        }
        return result({ output: text, info: bytes.length + " bytes decoded" })
      }
      var encoded = Bytes.encodeBase64(Bytes.toUtf8(input), flag(state, "urlSafe", false), flag(state, "padding", true))
      if (flag(state, "wrap", false)) encoded = Bytes.wrapLines(encoded, 76)
      return result({ output: encoded, info: sizeInfo(input, encoded) })
    })
  }
},

{
  id: "url-encode",
  name: "URL Encode",
  category: "Encode & decode",
  icon: "󰖟",
  keywords: ["percent", "escape", "uri", "querystring"],
  description: "Percent-encode and decode URLs and query components.",
  view: "transform",
  modes: [{ id: "encode", label: "Encode" }, { id: "decode", label: "Decode" }],
  options: [
    { key: "scope", type: "select", label: "Scope", default: "component",
      choices: [{ value: "component", label: "Component" }, { value: "full", label: "Whole URL" }] },
    { key: "plusAsSpace", type: "toggle", label: "+ is a space", default: true }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      if (opt(state, "mode", "encode") === "decode") {
        var decoded = flag(state, "plusAsSpace", true) ? Text.urlDecodePlus(input) : Text.urlDecode(input)
        return result({ output: decoded, info: sizeInfo(input, decoded) })
      }
      var encoded = opt(state, "scope", "component") === "full"
        ? Text.urlEncodeFull(input)
        : Text.urlEncodeComponent(input)
      return result({ output: encoded, info: sizeInfo(input, encoded) })
    })
  }
},

{
  id: "html-entities",
  name: "HTML Entities",
  category: "Encode & decode",
  icon: "󰌝",
  keywords: ["escape", "amp", "nbsp", "xml"],
  description: "Escape and unescape HTML entities.",
  view: "transform",
  modes: [{ id: "encode", label: "Encode" }, { id: "decode", label: "Decode" }],
  options: [
    { key: "scope", type: "select", label: "Escape", default: "named",
      choices: [
        { value: "minimal", label: "& < > \" ' only" },
        { value: "named", label: "Named where possible" },
        { value: "all", label: "All non-ASCII" }] }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = opt(state, "mode", "encode") === "decode"
        ? Text.htmlDecode(input)
        : Text.htmlEncode(input, opt(state, "scope", "named"))
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "escape",
  name: "Backslash Escape",
  category: "Encode & decode",
  icon: "󰩫",
  keywords: ["string", "quote", "json string", "literal"],
  description: "Escape text for a source-code string literal, and back.",
  view: "transform",
  modes: [{ id: "escape", label: "Escape" }, { id: "unescape", label: "Unescape" }],
  options: [
    { key: "quote", type: "select", label: "Quote", default: "double",
      choices: [{ value: "double", label: "Double" }, { value: "single", label: "Single" }] }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = opt(state, "mode", "escape") === "unescape"
        ? Text.backslashUnescape(input)
        : Text.backslashEscape(input, opt(state, "quote", "double"))
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "jwt",
  name: "JWT Debugger",
  category: "Encode & decode",
  icon: "󰌆",
  keywords: ["token", "bearer", "auth", "claims", "hs256"],
  description: "Decode a JWT, read its claims, and verify an HMAC signature.",
  view: "report",
  secondary: { key: "secret", label: "Secret", placeholder: "HMAC secret (optional)",
               password: true, secret: true },
  options: [{ key: "secretIsBase64", type: "toggle", label: "Secret is Base64", default: false }],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var decoded = Jwt.decode(input)
      var verification = Jwt.verify(decoded, String(opt(state, "secret", "")), flag(state, "secretIsBase64", false))

      var fields = [field("Algorithm", decoded.algorithm), field("Status", decoded.expiryStatus)]
      for (var i = 0; i < decoded.claims.length; i++) {
        var claim = decoded.claims[i]
        var value = typeof claim.value === "object" ? Json.stringify(claim.value, 0) : String(claim.value)
        fields.push(field(claim.label, value, { note: claim.note }))
      }

      return result({
        fields: fields,
        sections: [
          textSection("Header", Json.stringify(decoded.header, 2)),
          textSection("Payload", Json.stringify(decoded.payload, 2)),
          textSection("Signature", decoded.signature)
        ],
        info: verification.message,
        output: Json.stringify(decoded.payload, 2)
      })
    })
  }
},

{
  id: "hash",
  name: "Hash Generator",
  category: "Encode & decode",
  icon: "󰯄",
  keywords: ["md5", "sha1", "sha256", "sha512", "checksum", "hmac", "crc"],
  description: "MD5, SHA and CRC32 digests, with optional HMAC.",
  view: "report",
  secondary: { key: "hmacKey", label: "HMAC key", placeholder: "leave empty for a plain digest",
               secret: true },
  options: [
    { key: "uppercase", type: "toggle", label: "Uppercase", default: false },
    { key: "base64", type: "toggle", label: "Base64 output", default: false }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var messageBytes = Bytes.toUtf8(input)
      var key = String(opt(state, "hmacKey", ""))
      var useHmac = key.length > 0
      var keyBytes = useHmac ? Bytes.toUtf8(key) : null
      var algorithms = ["md5", "sha1", "sha256", "sha384", "sha512", "crc32"]
      var labels = { md5: "MD5", sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512", crc32: "CRC32" }
      var fields = []
      for (var i = 0; i < algorithms.length; i++) {
        var name = algorithms[i]
        if (useHmac && name === "crc32") continue
        var digest = useHmac ? Hash.hmac(name, keyBytes, messageBytes) : Hash.digest(name, messageBytes)
        var encoded = flag(state, "base64", false)
          ? Bytes.encodeBase64(digest)
          : Bytes.toHex(digest, flag(state, "uppercase", false))
        fields.push(field((useHmac ? "HMAC-" : "") + labels[name], encoded))
      }
      return result({
        fields: fields,
        info: messageBytes.length + " bytes hashed" + (useHmac ? " with an HMAC key" : ""),
        output: fields.length ? fields[2].value : ""
      })
    })
  }
},

{
  id: "base-convert",
  name: "Number Base",
  category: "Encode & decode",
  icon: "󰎠",
  keywords: ["hex", "binary", "octal", "decimal", "radix", "twos complement"],
  description: "Convert integers between bases, exactly, at any size.",
  view: "report",
  options: [
    { key: "from", type: "select", label: "Input base", default: "auto",
      choices: [
        { value: "auto", label: "Auto" }, { value: "10", label: "Decimal" },
        { value: "16", label: "Hex" }, { value: "2", label: "Binary" },
        { value: "8", label: "Octal" }, { value: "36", label: "Base 36" }] },
    { key: "group", type: "toggle", label: "Group digits", default: true }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var raw = String(input).replace(/^\s+|\s+$/g, "")
      var chosen = String(opt(state, "from", "auto"))
      var base
      if (chosen === "auto") {
        var sniffed = Num.sniffBase(raw)
        base = sniffed[0] !== null ? sniffed[0] : (Num.isValidIn(raw, 10) ? 10 : 16)
      } else {
        base = Number(chosen)
      }
      if (!Num.isValidIn(raw, base))
        throw new Error("“" + raw + "” is not a valid base-" + base + " number")

      var decimal = Num.convert(raw, base, 10)
      var group = flag(state, "group", true)
      var binary = Num.convert(raw, base, 2)
      var fields = [
        field("Detected base", chosen === "auto" ? "base " + base + " (auto)" : "base " + base),
        field("Decimal", group ? Num.groupDigits(decimal, 3, ",") : decimal),
        field("Hexadecimal", "0x" + Num.convert(raw, base, 16).toUpperCase()),
        field("Octal", "0o" + Num.convert(raw, base, 8)),
        field("Binary", group ? Num.groupDigits(binary, 8, " ") : binary),
        field("Base 36", Num.convert(raw, base, 36)),
        field("Base 62-ish (base 36)", Num.convert(raw, base, 36).toUpperCase())
      ]
      var widths = [8, 16, 32, 64]
      var sections = []
      var lines = []
      for (var i = 0; i < widths.length; i++) {
        var bits = Num.twosComplement(decimal, widths[i])
        lines.push("int" + widths[i] + "  " + (bits === null ? "does not fit" : Num.groupDigits(bits, 8, " ")))
      }
      sections.push(textSection("Two's complement", lines.join("\n")))
      return result({ fields: fields, sections: sections, output: decimal, info: binary.length + " bits" })
    })
  }
},

{
  id: "unicode",
  name: "Unicode Inspector",
  category: "Encode & decode",
  icon: "󰬴",
  keywords: ["codepoint", "utf8", "ascii", "character", "emoji", "bytes"],
  description: "Break text into code points, UTF-8 bytes, and escapes.",
  view: "transform",
  options: [
    { key: "limit", type: "select", label: "Show", default: "200",
      choices: [{ value: "200", label: "First 200" }, { value: "1000", label: "First 1000" }, { value: "0", label: "Everything" }] }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var s = String(input)
      var limit = num(state, "limit", 200)
      var rows = ["char  code point  utf-8 bytes        escape", "────  ──────────  ─────────────────  ────────────"]
      var shown = 0
      for (var i = 0; i < s.length; i++) {
        var cp = s.codePointAt ? s.codePointAt(i) : s.charCodeAt(i)
        var char = String.fromCharCode(s.charCodeAt(i))
        if (cp > 0xffff) { char = s.substr(i, 2); i++ }
        if (limit > 0 && shown >= limit) { rows.push("… " + (s.length - i) + " more"); break }
        var bytes = Bytes.toUtf8(char)
        var display = cp < 32 || cp === 127 ? "·" : char
        // Pad to four, but never truncate: an astral code point needs five or
        // six digits, and slicing to the last four turned U+1F30D into
        // U+F30D — an escape that silently produces a different character.
        var hex = cp.toString(16).toUpperCase()
        while (hex.length < 4) hex = "0" + hex
        rows.push(pad(display, 4) + "  " + pad("U+" + hex, 10) + "  "
          + pad(Bytes.toHex(bytes, false, " "), 17) + "  \\u" + (cp > 0xffff ? "{" + hex + "}" : hex))
        shown++
      }
      var utf8 = Bytes.toUtf8(s)
      return result({
        output: rows.join("\n"),
        info: s.length + " UTF-16 units · " + countCodePoints(s) + " code points · " + utf8.length + " UTF-8 bytes"
      })
    })
  }
},

{
  id: "base64-image",
  name: "Base64 Image",
  category: "Encode & decode",
  icon: "󰋩",
  keywords: ["data uri", "datauri", "image", "inline", "embed", "css", "png", "jpeg"],
  description: "Turn an image into a data URI, and a data URI back into an image.",
  view: "dataurl",
  modes: [{ id: "encode", label: "Image → Data URI" }, { id: "decode", label: "Data URI → Image" }],
  options: [
    { key: "cssWrap", type: "toggle", label: "Wrap in url()", default: false },
    { key: "mime", type: "select", label: "Type", default: "auto",
      choices: [{ value: "auto", label: "Detect" }].concat(DataUrl.MIME_TYPES) }
  ],
  // In encode mode `input` is the path of an image, as with the QR reader; in
  // decode mode it is the data URI itself.
  run: function (input, state) {
    var decoding = opt(state, "mode", "encode") === "decode"
    if (empty(input))
      return result({ info: decoding
        ? "Paste a data URI — a url(data:…) from a stylesheet works too"
        : "Copy an image, then press Paste image" })

    if (!decoding) {
      if (!isOwnedImagePath(input))
        return failure("Use Paste image — this reads an image the plugin captured, not any path you hand it")
      // base64(1) reads the file directly: the bytes never touch this engine.
      var chosen = String(opt(state, "mime", "auto"))
      var mime = chosen === "auto" ? "image/png" : chosen
      var wrap = flag(state, "cssWrap", false)
      return result({
        textCommand: ["base64", "-w0", "--", String(input)],
        textPrefix: (wrap ? 'url("' : "") + "data:" + mime + ";base64,",
        textSuffix: wrap ? '")' : "",
        info: "Encoding as " + mime
      })
    }

    return guard(function () {
      var parsed = DataUrl.parse(input)
      var mime = parsed.sniffed || parsed.mime
      var note = parsed.sniffed && parsed.sniffed !== parsed.mime && !parsed.wasBare
        ? " (labelled " + parsed.mime + ", but it is really " + parsed.sniffed + ")"
        : (parsed.wasBare ? " (bare base64, detected as " + mime + ")" : "")
      return result({
        imageSource: DataUrl.build(mime, parsed.base64, false),
        output: parsed.base64,
        info: mime + " · " + DataUrl.describeSize(parsed.bytes) + " decoded" + note
      })
    })
  }
},

// ========================================================== format / validate

{
  id: "json",
  name: "JSON Format",
  category: "Format & validate",
  icon: "󰘦",
  keywords: ["pretty", "beautify", "minify", "validate", "lint"],
  description: "Pretty-print, minify, and validate JSON with real error positions.",
  view: "transform",
  modes: [{ id: "format", label: "Format" }, { id: "minify", label: "Minify" }],
  options: [
    INDENT_OPTION,
    { key: "sortKeys", type: "toggle", label: "Sort keys", default: false },
    { key: "escapeUnicode", type: "toggle", label: "\\u escapes", default: false },
    { key: "lenient", type: "toggle", label: "Allow comments", default: false }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      // parseWithMeta/stringifyMeta take the engine's native JSON when it is
      // safe to, which is the difference between instant and several seconds
      // on a multi-megabyte document.
      var parsed = Json.parseWithMeta(input, flag(state, "lenient", false))
      var minify = opt(state, "mode", "format") === "minify"
      var out = Json.stringifyMeta(parsed, minify ? 0 : indentValue(state), {
        sortKeys: flag(state, "sortKeys", false),
        escapeUnicode: flag(state, "escapeUnicode", false)
      })
      var counts = Json.summarize(parsed.value)
      return result({
        output: out,
        info: "Valid JSON · " + counts.objects + " objects, " + counts.arrays + " arrays, depth "
          + counts.depth + " · " + sizeInfo(input, out)
      })
    })
  }
},

{
  id: "json-yaml",
  name: "JSON ⇄ YAML",
  category: "Format & validate",
  icon: "󰬀",
  keywords: ["yml", "convert", "config"],
  description: "Convert between JSON and YAML in either direction.",
  view: "transform",
  modes: [{ id: "toYaml", label: "JSON → YAML" }, { id: "toJson", label: "YAML → JSON" }],
  options: [INDENT_OPTION],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      if (opt(state, "mode", "toYaml") === "toJson") {
        var value = Yaml.parse(input)
        var json = Json.stringify(value, indentValue(state), {})
        return result({ output: json, info: "Valid YAML · " + sizeInfo(input, json) })
      }
      var parsed = Json.parse(input, true)
      var yaml = Yaml.emit(parsed, indentWidth(state) || 2)
      return result({ output: yaml, info: "Valid JSON · " + sizeInfo(input, yaml) })
    })
  }
},

{
  id: "json-csv",
  name: "JSON ⇄ CSV",
  category: "Format & validate",
  icon: "󰈛",
  keywords: ["spreadsheet", "tsv", "table", "convert"],
  description: "Convert between JSON records and delimited text.",
  view: "transform",
  modes: [{ id: "toJson", label: "CSV → JSON" }, { id: "toCsv", label: "JSON → CSV" }, { id: "table", label: "Table" }],
  options: [
    { key: "delimiter", type: "select", label: "Delimiter", default: "auto",
      choices: [
        { value: "auto", label: "Auto" }, { value: ",", label: "Comma" },
        { value: ";", label: "Semicolon" }, { value: "\t", label: "Tab" }, { value: "|", label: "Pipe" }] },
    { key: "header", type: "toggle", label: "First row is a header", default: true },
    { key: "coerceTypes", type: "toggle", label: "Detect numbers", default: true }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var chosen = String(opt(state, "delimiter", "auto"))
      var delimiter = chosen === "auto" ? null : chosen
      var mode = opt(state, "mode", "toJson")

      if (mode === "toCsv") {
        var value = Json.parse(input, true)
        var csv = Csv.fromJson(value, { delimiter: delimiter || ",", header: flag(state, "header", true) })
        return result({ output: csv, info: Csv.parseRows(csv, delimiter || ",").length + " rows" })
      }
      if (mode === "table") {
        return result({
          output: Csv.toTable(input, { delimiter: delimiter }),
          info: Csv.parseRows(input, delimiter || Csv.detectDelimiter(input)).length + " rows"
        })
      }
      var records = Csv.toJson(input, {
        delimiter: delimiter,
        header: flag(state, "header", true),
        coerceTypes: flag(state, "coerceTypes", true)
      })
      var json = Json.stringify(records, indentValue(state) || 2, {})
      return result({
        output: json,
        info: records.length + " records · delimiter "
          + describeDelimiter(delimiter || Csv.detectDelimiter(input))
      })
    })
  }
},

{
  id: "xml",
  name: "XML Format",
  category: "Format & validate",
  icon: "󰗀",
  keywords: ["pretty", "beautify", "minify", "soap", "rss"],
  description: "Indent or compact XML documents.",
  view: "transform",
  modes: [{ id: "format", label: "Format" }, { id: "minify", label: "Minify" }],
  options: [INDENT_OPTION],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = opt(state, "mode", "format") === "minify"
        ? Markup.minifyMarkup(input, { html: false })
        : Markup.formatXml(input, { indent: indentWidth(state) || 2, tabs: indentWidth(state) === 0 })
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "html",
  name: "HTML Format",
  category: "Format & validate",
  icon: "󰌝",
  keywords: ["pretty", "beautify", "minify", "markup"],
  description: "Indent or compact HTML, leaving script and style bodies alone.",
  view: "transform",
  modes: [{ id: "format", label: "Format" }, { id: "minify", label: "Minify" }],
  options: [INDENT_OPTION, { key: "keepComments", type: "toggle", label: "Keep comments", default: true }],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = opt(state, "mode", "format") === "minify"
        ? Markup.minifyMarkup(input, { html: true, keepComments: flag(state, "keepComments", true) })
        : Markup.formatHtml(input, { indent: indentWidth(state) || 2, tabs: indentWidth(state) === 0 })
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "css",
  name: "CSS Format",
  category: "Format & validate",
  icon: "󰌜",
  keywords: ["stylesheet", "beautify", "minify", "scss"],
  description: "Indent or compact stylesheets.",
  view: "transform",
  modes: [{ id: "format", label: "Format" }, { id: "minify", label: "Minify" }],
  options: [INDENT_OPTION, { key: "keepComments", type: "toggle", label: "Keep comments", default: false }],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = opt(state, "mode", "format") === "minify"
        ? Markup.minifyCss(input, { keepComments: flag(state, "keepComments", false) })
        : Markup.formatCss(input, { indent: indentWidth(state) || 2, tabs: indentWidth(state) === 0 })
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "sql",
  name: "SQL Format",
  category: "Format & validate",
  icon: "󰆼",
  keywords: ["query", "beautify", "minify", "postgres", "mysql"],
  description: "Lay a query out by clause, or squash it onto one line.",
  view: "transform",
  modes: [{ id: "format", label: "Format" }, { id: "minify", label: "Minify" }],
  options: [
    INDENT_OPTION,
    { key: "uppercase", type: "toggle", label: "Uppercase keywords", default: true },
    { key: "compactLists", type: "toggle", label: "Compact lists", default: false }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      if (opt(state, "mode", "format") === "minify")
        return result({ output: Sql.minify(input), info: sizeInfo(input, Sql.minify(input)) })
      var out = Sql.format(input, {
        indent: indentWidth(state),
        uppercase: flag(state, "uppercase", true),
        compactLists: flag(state, "compactLists", false)
      })
      return result({ output: out, info: sizeInfo(input, out) })
    })
  }
},

{
  id: "json-types",
  name: "JSON → Types",
  category: "Format & validate",
  icon: "󰅩",
  keywords: ["typescript", "go", "rust", "interface", "struct", "codegen", "types", "model"],
  description: "Turn a JSON sample into type declarations you can paste into a project.",
  view: "transform",
  options: [
    { key: "language", type: "select", label: "Language", default: "typescript",
      choices: Types.LANGUAGES },
    { key: "rootName", type: "text", label: "Root name", default: "Root" },
    INDENT_OPTION,
    { key: "lenient", type: "toggle", label: "Allow comments", default: false }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var options = {
        language: opt(state, "language", "typescript"),
        rootName: String(opt(state, "rootName", "Root")),
        indent: indentWidth(state),
        lenient: flag(state, "lenient", false)
      }
      var out = Types.generate(input, options)
      var counts = Types.summarize(input, options)
      return result({
        output: out,
        info: counts.types + (counts.types === 1 ? " type" : " types")
          + (counts.optional > 0 ? " · " + counts.optional + " optional from the sample" : "")
          + (counts.unknown > 0 ? " · " + counts.unknown + " the sample could not pin down" : "")
      })
    })
  }
},

// ================================================================ text & data

{
  id: "case",
  name: "Case Converter",
  category: "Text & data",
  icon: "󰬴",
  keywords: ["camel", "snake", "kebab", "pascal", "title", "constant"],
  description: "Every common naming convention at once.",
  view: "report",
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var forms = Text.CASE_FORMS
      var fields = []
      for (var i = 0; i < forms.length; i++)
        fields.push(field(forms[i].label, Text.toCase(input, forms[i].id)))
      var parts = Text.words(input)
      return result({ fields: fields, info: parts.length + " words: " + parts.join(" · "), output: fields[0].value })
    })
  }
},

{
  id: "text-stats",
  name: "Text Statistics",
  category: "Text & data",
  icon: "󰆾",
  keywords: ["count", "words", "characters", "lines", "reading time", "analyze", "wordcount"],
  description: "Count what is in a block of text.",
  view: "report",
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var a = Text.analyze(input)
      var bytes = Bytes.utf8Length(input)
      return result({
        fields: [
          field("Characters", String(a.characters)),
          field("Characters without spaces", String(a.charactersNoSpaces)),
          field("Words", String(a.words)),
          field("Unique words", String(a.uniqueWords)
            + (a.words > 0 ? "   " + Math.round((a.uniqueWords / a.words) * 100) + "% of the total" : "")),
          field("Sentences", String(a.sentences)),
          field("Paragraphs", String(a.paragraphs)),
          field("Lines", String(a.lines) + "   " + a.nonEmptyLines + " not blank"),
          field("Longest line", a.longestLine + " characters"),
          field("Average word length", String(a.averageWordLength)),
          field("Reading time", Time.durationBreakdown(a.readingSeconds) + "   at 200 words a minute"),
          field("Size as UTF-8", Bytes.humanBytes(bytes)
            + (bytes !== a.characters ? "   " + (bytes - a.characters) + " bytes over the character count" : ""))
        ],
        info: a.words + " words · " + a.characters + " characters",
        output: String(a.words)
      })
    })
  }
},

{
  id: "lines",
  name: "Line Tools",
  category: "Text & data",
  icon: "󰕲",
  keywords: ["sort", "dedupe", "unique", "shuffle", "reverse", "number", "trim"],
  description: "Sort, dedupe, shuffle, number, and trim lines.",
  view: "transform",
  modes: [
    { id: "sort", label: "Sort" }, { id: "dedupe", label: "Dedupe" },
    { id: "duplicates", label: "Duplicates" }, { id: "reverse", label: "Reverse" },
    { id: "shuffle", label: "Shuffle" }, { id: "number", label: "Number" },
    { id: "trim", label: "Trim" }, { id: "join", label: "Join" }
  ],
  options: [
    { key: "caseSensitive", type: "toggle", label: "Case sensitive", default: false },
    { key: "natural", type: "toggle", label: "Natural order", default: false },
    { key: "descending", type: "toggle", label: "Descending", default: false },
    { key: "ignoreBlank", type: "toggle", label: "Drop blank lines", default: false },
    { key: "joiner", type: "text", label: "Join with", default: ", " }
  ],
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var out = Text.lineOp(input, opt(state, "mode", "sort"), {
        caseSensitive: flag(state, "caseSensitive", false),
        natural: flag(state, "natural", false),
        descending: flag(state, "descending", false),
        ignoreBlank: flag(state, "ignoreBlank", false),
        joiner: opt(state, "joiner", ", ")
      })
      var before = Text.splitLines(input).length
      var after = Text.splitLines(out).length
      var stats = Text.stats(input)
      return result({
        output: out,
        info: before + " lines in, " + after + " out · " + stats.words + " words, " + stats.characters + " characters"
      })
    })
  }
},

{
  id: "diff",
  name: "Text Diff",
  category: "Text & data",
  icon: "󰦓",
  keywords: ["compare", "changes", "patch", "unified"],
  description: "Compare two blocks of text line by line.",
  view: "diff",
  options: [
    { key: "ignoreCase", type: "toggle", label: "Ignore case", default: false },
    { key: "ignoreWhitespace", type: "toggle", label: "Ignore whitespace", default: false },
    { key: "context", type: "select", label: "Context", default: "all",
      choices: [{ value: "all", label: "Everything" }, { value: "3", label: "3 lines" }, { value: "1", label: "1 line" }] }
  ],
  run: function (input, state) {
    var right = String(opt(state, "right", ""))
    if (empty(input) && empty(right)) return result({})
    return guard(function () {
      var diff = Diff.diffLines(input, right, {
        ignoreCase: flag(state, "ignoreCase", false),
        ignoreWhitespace: flag(state, "ignoreWhitespace", false)
      })
      var contextChoice = String(opt(state, "context", "all"))
      var context = contextChoice === "all" ? -1 : Number(contextChoice)
      return result({
        rows: diff.rows,
        output: Diff.unified(diff, context, { left: "left", right: "right" }),
        info: diff.identical
          ? "The two sides are identical"
          : "+" + diff.added + " −" + diff.removed + " · " + diff.unchanged + " unchanged"
            + (diff.truncated ? " · too large for an exact diff, showing whole blocks" : "")
      })
    })
  }
},

{
  id: "regex",
  name: "RegExp Tester",
  // The only tool that runs code the user wrote. A pattern with catastrophic
  // backtracking can spin for a very long time on a short input, and there is
  // no way to interrupt a running regex — so it never runs inline, and the
  // thread it can wedge is a worker rather than the whole desktop.
  alwaysWorker: true,
  category: "Text & data",
  icon: "󰑑",
  keywords: ["regular expression", "match", "capture", "pattern"],
  description: "Run a pattern over a subject and inspect every match.",
  view: "report",
  secondary: { key: "pattern", label: "Pattern", placeholder: "\\b(\\w+)@(\\w+\\.\\w+)\\b", mono: true },
  options: [
    { key: "global", type: "toggle", label: "g", default: true },
    { key: "ignoreCase", type: "toggle", label: "i", default: false },
    { key: "multiline", type: "toggle", label: "m", default: false },
    { key: "dotAll", type: "toggle", label: "s", default: false }
  ],
  run: function (input, state) {
    var pattern = String(opt(state, "pattern", ""))
    if (empty(pattern)) return result({ info: "Enter a pattern to start matching" })
    if (empty(input)) return result({})
    return guard(function () {
      var flags = (flag(state, "global", true) ? "g" : "")
        + (flag(state, "ignoreCase", false) ? "i" : "")
        + (flag(state, "multiline", false) ? "m" : "")
        + (flag(state, "dotAll", false) ? "s" : "")
      var re
      try {
        re = new RegExp(pattern, flags)
      } catch (e) {
        return failure("Invalid pattern: " + e.message)
      }

      var subject = String(input)
      var matches = []
      var lines = []
      if (flags.indexOf("g") === -1) {
        var one = re.exec(subject)
        if (one) matches.push(one)
      } else {
        var m
        var guardCounter = 0
        while ((m = re.exec(subject)) !== null && guardCounter < 5000) {
          matches.push(m)
          if (m[0].length === 0) re.lastIndex++
          guardCounter++
        }
      }

      for (var i = 0; i < matches.length; i++) {
        var match = matches[i]
        var groups = []
        for (var g = 1; g < match.length; g++)
          groups.push("  $" + g + " = " + (match[g] === undefined ? "(no match)" : match[g]))
        lines.push("#" + (i + 1) + " at " + match.index + "–" + (match.index + match[0].length) + "  " + match[0])
        if (groups.length) lines.push(groups.join("\n"))
      }

      return result({
        fields: [
          field("Pattern", "/" + pattern + "/" + flags),
          field("Matches", String(matches.length)),
          field("Groups per match", matches.length ? String(matches[0].length - 1) : "—")
        ],
        sections: matches.length ? [textSection("Matches", lines.join("\n"))] : [],
        info: matches.length === 0 ? "No matches" : matches.length + " matches",
        output: matches.map(function (m) { return m[0] }).join("\n")
      })
    })
  }
},

{
  id: "markdown",
  name: "Markdown Preview",
  category: "Text & data",
  icon: "󰍔",
  keywords: ["md", "readme", "render"],
  description: "Render Markdown as you type.",
  view: "preview",
  format: "markdown",
  run: function (input, state) {
    var safe = Sanitize.forPreview(input, "markdown")
    var note = Sanitize.describe(safe.blocked)
    return result({
      output: safe.text, format: "markdown",
      info: Text.stats(input).words + " words" + (note ? " · " + note : "")
    })
  }
},

{
  id: "html-preview",
  name: "HTML Preview",
  category: "Text & data",
  icon: "󰋼",
  keywords: ["render", "markup", "view"],
  description: "Render an HTML fragment as rich text.",
  view: "preview",
  format: "html",
  run: function (input, state) {
    var safe = Sanitize.forPreview(input, "html")
    var note = Sanitize.describe(safe.blocked)
    return result({
      output: safe.text, format: "html",
      info: note ? note : "Rendered as rich text — no scripts, no network"
    })
  }
},

// ================================================================= time & web

{
  id: "unixtime",
  name: "Unix Time",
  category: "Time & web",
  icon: "󰥔",
  keywords: ["timestamp", "epoch", "date", "iso8601", "utc"],
  description: "Convert epochs and date strings in both directions.",
  view: "report",
  actions: [{ id: "now", label: "Now", fillsInput: true }],
  action: function (id, input, state) {
    if (id === "now") return String(Math.floor(new Date().getTime() / 1000))
    return input
  },
  run: function (input, state) {
    if (empty(input)) return result({ info: "Paste an epoch or a date, or press Now" })
    return guard(function () {
      var d = Time.describe(input)
      return result({
        fields: [
          field("Relative", d.relative),
          field("Local", d.local, { note: d.timezoneOffset }),
          field("UTC", d.utc),
          field("ISO 8601", d.iso),
          field("ISO 8601 local", d.isoLocal),
          field("RFC 2822", d.rfc2822),
          field("Epoch seconds", String(d.epochSeconds)),
          field("Epoch millis", String(d.epochMillis)),
          field("Day", d.dayOfWeek + ", day " + d.dayOfYear + " of the year"),
          field("Week", d.isoWeek + " · " + d.quarter + (d.leapYear ? " · leap year" : ""))
        ],
        info: d.source === "epoch" ? "Read as " + d.detectedUnit : "Parsed as a date string",
        output: d.iso
      })
    })
  }
},

{
  id: "cron",
  name: "Cron Parser",
  category: "Time & web",
  icon: "󰅐",
  keywords: ["crontab", "schedule", "job", "timer"],
  description: "Explain a cron expression and show when it fires next.",
  view: "report",
  options: [
    { key: "count", type: "select", label: "Next runs", default: "5",
      choices: [{ value: "5", label: "5" }, { value: "10", label: "10" }, { value: "20", label: "20" }] }
  ],
  run: function (input, state) {
    if (empty(input)) return result({ info: "Try “*/15 9-17 * * 1-5” or “@daily”" })
    return guard(function () {
      var fields = Cron.parse(input)
      var runs = Cron.nextRuns(fields, num(state, "count", 5))
      var lines = []
      var now = new Date()
      for (var i = 0; i < runs.length; i++)
        lines.push(Time.isoLocal(runs[i]).replace("T", "  ") + "   " + Time.relative(runs[i], now))
      var names = ["second", "minute", "hour", "day of month", "month", "day of week"]
      var breakdown = []
      for (var k = 0; k < names.length; k++) {
        var f = fields[names[k]]
        if (!f) continue
        if (names[k] === "second" && !fields.__hasSeconds) continue
        breakdown.push(field(names[k].replace(/^./, function (c) { return c.toUpperCase() }),
          f.wildcard ? "every" : summarizeValues(f.values), { note: f.raw }))
      }
      return result({
        fields: [field("Meaning", Cron.describe(fields))].concat(breakdown),
        sections: lines.length ? [textSection("Next " + runs.length + " runs", lines.join("\n"))] : [],
        info: fields.__hasSeconds ? "6-field expression (with seconds)" : "5-field expression",
        output: Cron.describe(fields)
      })
    })
  }
},

{
  id: "url-parse",
  name: "URL Parser",
  category: "Time & web",
  icon: "󰌷",
  keywords: ["query", "params", "host", "path", "link"],
  description: "Split a URL into its parts and decode its query string.",
  view: "report",
  run: function (input, state) {
    if (empty(input)) return result({})
    return guard(function () {
      var u = Url.parse(input)
      var fields = [
        field("Scheme", u.protocol || "—"),
        field("Host", u.host || "—"),
        field("Port", u.port || "(default)"),
        field("Path", u.path || "/"),
        field("Fragment", u.hash || "—")
      ]
      if (u.username) fields.splice(1, 0, field("Credentials", u.username + (u.password ? ":" + u.password : "")))
      var lines = []
      for (var i = 0; i < u.params.length; i++)
        lines.push(padRight(u.params[i].key, 20) + "  " + u.params[i].value)
      var sections = []
      if (u.params.length) sections.push(textSection(u.params.length + " query parameters", lines.join("\n")))
      if (u.pathSegments.length) sections.push(textSection("Path segments", u.pathSegments.join("\n")))
      return result({
        fields: fields,
        sections: sections,
        info: u.origin ? "Origin " + u.origin : "Relative URL",
        output: u.origin || u.path
      })
    })
  }
},

{
  id: "color",
  name: "Color Converter",
  category: "Time & web",
  icon: "󰏘",
  keywords: ["hex", "rgb", "hsl", "hsv", "cmyk", "contrast", "wcag"],
  description: "Convert a color between formats and check its contrast.",
  view: "report",
  run: function (input, state) {
    if (empty(input)) return result({ info: "Try #1e90ff, rgb(30 144 255), or dodgerblue" })
    return guard(function () {
      var c = Color.describe(input)
      return result({
        swatch: c.hex,
        fields: [
          field("HEX", c.hex, { swatch: c.hex }),
          field("HEX uppercase", c.hexUpper),
          field("HEX + alpha", c.hex8),
          field("RGB", c.rgbString),
          field("RGBA", c.rgbaString),
          field("HSL", c.hslString),
          field("HSV", c.hsvString),
          field("CMYK", c.cmykString),
          field("Nearest CSS name", c.nearestName + (c.isNamedExactly ? " (exact)" : " (approx)")),
          field("Contrast on white", c.contrastWhite + ":1", { note: wcagVerdict(c.contrastWhite) }),
          field("Contrast on black", c.contrastBlack + ":1", { note: wcagVerdict(c.contrastBlack) })
        ],
        info: "Relative luminance " + c.luminance,
        output: c.hex
      })
    })
  }
},

{
  id: "qr",
  name: "QR Code",
  category: "Time & web",
  icon: "󰐲",
  keywords: ["barcode", "scan", "wifi", "share"],
  description: "Turn text or a URL into a scannable QR code.",
  view: "image",
  options: [
    { key: "size", type: "select", label: "Module size", default: "8",
      choices: [{ value: "6", label: "Small" }, { value: "8", label: "Medium" }, { value: "12", label: "Large" }] },
    { key: "level", type: "select", label: "Error correction", default: "M",
      choices: [{ value: "L", label: "L · 7%" }, { value: "M", label: "M · 15%" },
                { value: "Q", label: "Q · 25%" }, { value: "H", label: "H · 30%" }] }
  ],
  run: function (input, state) {
    if (empty(input)) return result({ info: "Type anything to encode it" })
    return result({
      imageCommand: ["qrencode", "-o", "%OUT%", "-s", String(opt(state, "size", "8")),
                     "-m", "2", "-l", String(opt(state, "level", "M")), "--", String(input)],
      info: Bytes.utf8Length(input) + " bytes encoded",
      output: String(input)
    })
  }
},

{
  id: "qr-read",
  name: "QR Reader",
  category: "Time & web",
  icon: "󰐎",
  keywords: ["barcode", "scan", "decode", "qrcode", "image", "screenshot"],
  description: "Read a QR code out of an image on your clipboard.",
  view: "decode",
  // `input` is the path of the image to scan, not text — the decode view has
  // no text field, and the host is the only thing that ever sets it.
  run: function (input, state) {
    if (empty(input))
      return result({ info: "Copy an image containing a QR code — a screenshot will do" })
    if (!isOwnedImagePath(input))
      return failure("Use Paste image — this reads an image the plugin captured, not any path you hand it")
    return result({
      textCommand: ["zbarimg", "--quiet", "--raw", "--", String(input)],
      info: "Scanning the image on your clipboard"
    })
  }
},

// ================================================================= generators

{
  id: "uuid",
  name: "UUID & ULID",
  category: "Generators",
  icon: "󰆧",
  keywords: ["guid", "uuid4", "uuid7", "ulid", "identifier", "random"],
  description: "Generate identifiers, one or a hundred at a time.",
  view: "generate",
  options: [
    { key: "kind", type: "select", label: "Kind", default: "v4",
      choices: [{ value: "v4", label: "UUID v4" }, { value: "v7", label: "UUID v7" },
                { value: "ulid", label: "ULID" }, { value: "nil", label: "Nil UUID" }, { value: "max", label: "Max UUID" }] },
    { key: "count", type: "select", label: "Count", default: "1",
      choices: [{ value: "1", label: "1" }, { value: "5", label: "5" }, { value: "10", label: "10" },
                { value: "25", label: "25" }, { value: "100", label: "100" }] },
    { key: "uppercase", type: "toggle", label: "Uppercase", default: false },
    { key: "braces", type: "toggle", label: "Braces", default: false },
    { key: "hyphens", type: "toggle", label: "Hyphens", default: true }
  ],
  run: function (input, state) {
    return guard(function () {
      var kind = opt(state, "kind", "v4")
      var count = num(state, "count", 1)
      var format = {
        uppercase: flag(state, "uppercase", false),
        braces: flag(state, "braces", false),
        hyphens: flag(state, "hyphens", true)
      }
      var out = []
      for (var i = 0; i < count; i++) {
        if (kind === "v7") out.push(Gen.uuidV7(format))
        else if (kind === "ulid") out.push(flag(state, "uppercase", false) ? Gen.ulid() : Gen.ulid().toLowerCase())
        else if (kind === "nil") out.push(Gen.uuidNil(format))
        else if (kind === "max") out.push(Gen.uuidMax(format))
        else out.push(Gen.uuidV4(format))
      }
      return result({
        output: out.join("\n"),
        info: count + " generated · " + entropyNote()
      })
    })
  }
},

{
  id: "random-string",
  name: "Random String",
  category: "Generators",
  icon: "󰒲",
  keywords: ["password", "secret", "token", "key", "nonce"],
  description: "Passwords, tokens, and API keys with a real entropy estimate.",
  view: "generate",
  options: [
    { key: "length", type: "select", label: "Length", default: "24",
      choices: [{ value: "8", label: "8" }, { value: "12", label: "12" }, { value: "16", label: "16" },
                { value: "24", label: "24" }, { value: "32", label: "32" }, { value: "64", label: "64" }] },
    { key: "count", type: "select", label: "Count", default: "1",
      choices: [{ value: "1", label: "1" }, { value: "5", label: "5" }, { value: "10", label: "10" }] },
    { key: "uppercase", type: "toggle", label: "A–Z", default: true },
    { key: "digits", type: "toggle", label: "0–9", default: true },
    { key: "symbols", type: "toggle", label: "Symbols", default: false },
    { key: "unambiguous", type: "toggle", label: "No look-alikes", default: false }
  ],
  run: function (input, state) {
    return guard(function () {
      var settings = {
        uppercase: flag(state, "uppercase", true),
        digits: flag(state, "digits", true),
        symbols: flag(state, "symbols", false),
        unambiguous: flag(state, "unambiguous", false)
      }
      var length = num(state, "length", 24)
      var count = num(state, "count", 1)
      var out = []
      for (var i = 0; i < count; i++) out.push(Gen.randomString(length, settings))
      var alphabet = Gen.alphabetSizeFor(settings)
      return result({
        output: out.join("\n"),
        info: alphabet + "-character alphabet · ~" + Gen.entropyBits(length, alphabet)
          + " bits of entropy · " + entropyNote()
      })
    })
  }
},

{
  id: "lorem",
  name: "Lorem Ipsum",
  category: "Generators",
  icon: "󰈚",
  keywords: ["placeholder", "filler", "dummy text", "paragraphs"],
  description: "Placeholder copy by word, sentence, or paragraph.",
  view: "generate",
  options: [
    { key: "unit", type: "select", label: "Unit", default: "paragraphs",
      choices: [{ value: "paragraphs", label: "Paragraphs" }, { value: "sentences", label: "Sentences" },
                { value: "words", label: "Words" }] },
    { key: "count", type: "select", label: "Count", default: "3",
      choices: [{ value: "1", label: "1" }, { value: "3", label: "3" }, { value: "5", label: "5" },
                { value: "10", label: "10" }, { value: "25", label: "25" }] },
    { key: "classic", type: "toggle", label: "Start with “Lorem ipsum”", default: true }
  ],
  run: function (input, state) {
    return guard(function () {
      var out = Gen.lorem(opt(state, "unit", "paragraphs"), num(state, "count", 3), flag(state, "classic", true))
      var stats = Text.stats(out)
      return result({ output: out, info: stats.words + " words · " + stats.characters + " characters" })
    })
  }
},

{
  id: "id-inspect",
  name: "ID Inspector",
  category: "Generators",
  icon: "󰋼",
  keywords: ["uuid", "ulid", "decode", "version", "timestamp"],
  description: "Read the version and embedded timestamp out of a UUID or ULID.",
  view: "report",
  run: function (input, state) {
    if (empty(input)) return result({ info: "Paste a UUID or a ULID" })
    return guard(function () {
      var raw = String(input).replace(/^\s+|\s+$/g, "")
      var uuid = Gen.uuidVersion(raw)
      if (uuid) {
        var fields = [
          field("Type", "UUID"),
          field("Version", uuid.version),
          field("Variant", uuid.variant),
          field("Canonical", raw.replace(/[{}]/g, "").toLowerCase())
        ]
        if (uuid.timestamp)
          fields.push(field("Embedded time", Time.humanUtc(uuid.timestamp), { note: Time.relative(uuid.timestamp) }))
        return result({ fields: fields, info: "Valid UUID", output: raw })
      }
      var ulid = Gen.decodeUlid(raw)
      return result({
        fields: [
          field("Type", "ULID"),
          field("Timestamp", Time.humanUtc(ulid.timestamp), { note: Time.relative(ulid.timestamp) }),
          field("Epoch millis", String(ulid.timestamp.getTime())),
          field("Randomness", ulid.randomness)
        ],
        info: "Valid ULID",
        output: raw
      })
    })
  }
}

]

// ------------------------------------------------------------------- helpers

function pad(text, width) {
  var s = String(text)
  while (s.length < width) s += " "
  return s
}

function padRight(text, width) { return pad(text, width) }

function countCodePoints(s) {
  var count = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) i++
    count++
  }
  return count
}

function describeDelimiter(d) {
  if (d === "\t") return "tab"
  if (d === ",") return "comma"
  if (d === ";") return "semicolon"
  if (d === "|") return "pipe"
  return "“" + d + "”"
}

function summarizeValues(values) {
  if (values.length > 12) return values.length + " values"
  return values.join(", ")
}

function wcagVerdict(ratio) {
  if (ratio >= 7) return "AAA"
  if (ratio >= 4.5) return "AA"
  if (ratio >= 3) return "AA large text only"
  return "fails WCAG"
}

function entropyNote() {
  return Gen.hasStrongEntropy() ? "from /dev/urandom" : "Math.random fallback — not for secrets"
}

// --------------------------------------------------------------- public API

function tools() { return TOOLS }

// Tools that cannot be a chain step, and why.
//
// A chain is a fold: text in, text out, with no app around it. Most tools are
// exactly that shape, but a few are windows rather than transforms — they
// browse, they render, they invent, or they need a file only the app can open.
// Offering one in the step picker is a trap rather than a choice: History
// reports success and hands the next step an empty string, and a preview
// passes its input along having done nothing at all.
//
// This is not the same as a step in the wrong place. QR Code is deliberately
// absent here because it works perfectly as the last step; being misplaced
// earns a warning on the step card, not removal from the picker.
//
// Each reason completes the sentence "<Tool> cannot run as a chain step — it …".
var NOT_A_STEP = {
  "history": "browses past sessions rather than transforming text",
  "markdown": "renders a preview, passing its text through untouched",
  "html-preview": "renders a preview, passing its text through untouched",
  "diff": "compares two texts, and a step only ever has one",
  "uuid": "generates new text, discarding whatever the previous step produced",
  "random-string": "generates new text, discarding whatever the previous step produced",
  "lorem": "generates new text, discarding whatever the previous step produced",
  "qr-read": "reads an image through the app",
  "base64-image": "reads a file through the app"
}

function stepBlockReason(tool) {
  if (!tool) return ""
  var id = typeof tool === "string" ? tool : tool.id
  var reason = NOT_A_STEP[id]
  return reason ? reason : ""
}

// The picker's list: everything that can actually be a step.
function stepTools() {
  var out = []
  for (var i = 0; i < TOOLS.length; i++)
    if (!stepBlockReason(TOOLS[i])) out.push(TOOLS[i])
  return out
}

function byId(id) {
  for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]
  return null
}

function categories() {
  var seen = []
  for (var i = 0; i < TOOLS.length; i++)
    if (seen.indexOf(TOOLS[i].category) === -1) seen.push(TOOLS[i].category)
  return seen
}

// Ranked substring search over name, category, and keywords. Deliberately not
// fuzzy: with thirty tools, exact prefix matches ranked first is faster to
// aim at than a scoring function that sometimes surprises you.
function search(query) {
  var q = String(query || "").replace(/^\s+|\s+$/g, "").toLowerCase()
  if (q.length === 0) return TOOLS.slice(0)
  var scored = []
  for (var i = 0; i < TOOLS.length; i++) {
    var tool = TOOLS[i]
    var name = tool.name.toLowerCase()
    var score = -1
    if (name.indexOf(q) === 0) score = 0
    else if (name.indexOf(q) !== -1) score = 1
    else if (tool.category.toLowerCase().indexOf(q) !== -1) score = 3
    else if (String(tool.description || "").toLowerCase().indexOf(q) !== -1) score = 4
    else {
      for (var k = 0; k < tool.keywords.length; k++) {
        if (tool.keywords[k].indexOf(q) === 0) { score = 2; break }
        if (tool.keywords[k].indexOf(q) !== -1) { score = 3; break }
      }
    }
    if (score >= 0) scored.push({ tool: tool, score: score, index: i })
  }
  scored.sort(function (a, b) { return a.score - b.score || a.index - b.index })
  return scored.map(function (s) { return s.tool })
}

// State keys that must never reach the disk. Declared on the tool rather than
// inferred, so a new field holding key material has to opt in deliberately —
// the alternative is a filter somewhere else that someone has to remember to
// update, which is how secrets end up in files.
function secretKeys(tool) {
  var out = []
  if (!tool) return out
  if (tool.secondary && tool.secondary.secret === true) out.push(tool.secondary.key)
  var options = tool.options || []
  for (var i = 0; i < options.length; i++)
    if (options[i].secret === true) out.push(options[i].key)
  return out
}

// A copy of `state` with every secret key dropped. Used everywhere state is
// persisted: per-tool sessions and saved chain steps alike.
function withoutSecrets(tool, state) {
  var keys = secretKeys(tool)
  var out = {}
  if (!state) return out
  for (var k in state) if (keys.indexOf(k) === -1) out[k] = state[k]
  return out
}

function defaultsFor(tool) {
  var state = {}
  if (!tool) return state
  if (tool.modes && tool.modes.length) state.mode = tool.modes[0].id
  var options = tool.options || []
  for (var i = 0; i < options.length; i++) state[options[i].key] = options[i].default
  if (tool.secondary) state[tool.secondary.key] = ""
  return state
}

function run(tool, input, state) {
  if (!tool || typeof tool.run !== "function") return failure("This tool has no implementation")
  try {
    return tool.run(input === undefined || input === null ? "" : String(input), state || {})
  } catch (e) {
    return withPosition(failure(e && (e.formatted || e.message) ? (e.formatted || e.message) : String(e)), e)
  }
}

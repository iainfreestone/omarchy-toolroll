.pragma library

// data: URIs — the `background: url(data:image/png;base64,...)` form.
//
// Neither direction decodes the payload in JavaScript. Encoding shells out to
// base64(1) because the bytes never need to enter the JS engine, and decoding
// hands the URI straight to Qt, whose image loader understands data: natively.
// A megabyte of base64 through the interpreter would cost seconds for nothing.

var MIME_TYPES = [
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/webp", label: "WebP" },
  { value: "image/gif", label: "GIF" },
  { value: "image/svg+xml", label: "SVG" }
]

// Magic numbers, so an encoded file is labelled by what it actually is rather
// than by whatever the dropdown happened to be set to.
//
// Base64 encodes in three-byte groups, so a prefix is only stable if it lands
// on a group boundary — "<svg" spans two groups and its fourth character moves
// with whatever follows, while "<sv" does not.
function sniffMime(base64) {
  var head = String(base64 || "").substring(0, 16)
  if (head.indexOf("iVBORw0KGgo") === 0) return "image/png"      // \x89PNG\r\n\x1a\n
  if (head.indexOf("/9j/") === 0) return "image/jpeg"            // ff d8 ff
  if (head.indexOf("R0lGOD") === 0) return "image/gif"           // GIF8
  if (head.indexOf("UklGR") === 0) return "image/webp"           // RIFF
  if (head.indexOf("PHN2") === 0) return "image/svg+xml"         // <sv
  if (head.indexOf("PD94") === 0) return "image/svg+xml"         // <?x
  return ""
}

function build(mime, base64, cssWrap) {
  var uri = "data:" + (mime || "image/png") + ";base64," + String(base64 || "").replace(/\s+/g, "")
  return cssWrap ? 'url("' + uri + '")' : uri
}

// Byte length of the encoded payload, worked out from the base64 length rather
// than by decoding it.
function decodedSize(base64) {
  var s = String(base64 || "").replace(/\s+/g, "")
  if (s.length === 0) return 0
  var padding = 0
  if (s.charAt(s.length - 1) === "=") padding++
  if (s.charAt(s.length - 2) === "=") padding++
  return Math.max(0, Math.floor(s.length * 3 / 4) - padding)
}

// Accepts a full data: URI, a CSS url("data:...") wrapper, or bare base64 —
// all three are things people actually have on their clipboard.
function parse(text) {
  var s = String(text || "").replace(/^\s+|\s+$/g, "")
  if (s.length === 0) throw new Error("paste a data URI or some base64")

  var css = s.match(/^url\(\s*["']?([\s\S]*?)["']?\s*\)$/)
  if (css) s = css[1].replace(/^\s+|\s+$/g, "")

  var uri = s.match(/^data:([^;,]*)(;charset=[^;,]*)?(;base64)?,([\s\S]*)$/i)
  if (uri) {
    if (!uri[3]) throw new Error("only base64 data URIs are supported, not percent-encoded ones")
    var payload = uri[4].replace(/\s+/g, "")
    var declared = uri[1] || "application/octet-stream"
    return {
      mime: declared,
      base64: payload,
      bytes: decodedSize(payload),
      sniffed: sniffMime(payload),
      wasBare: false
    }
  }

  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s.replace(/\s+/g, "")))
    throw new Error("that is neither a data URI nor base64")

  var bare = s.replace(/\s+/g, "")
  var guessed = sniffMime(bare)
  if (!guessed) throw new Error("this is base64, but it does not look like an image")
  return { mime: guessed, base64: bare, bytes: decodedSize(bare), sniffed: guessed, wasBare: true }
}

function looksLikeDataUri(text) {
  return /^\s*(url\(\s*["']?)?data:[^;,]*;base64,/i.test(String(text || ""))
}

function describeSize(bytes) {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1048576) return (Math.round(bytes / 102.4) / 10) + " KB"
  return (Math.round(bytes / 104857.6) / 10) + " MB"
}

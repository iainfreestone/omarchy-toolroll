.pragma library

// Byte-level primitives shared by every other lib. QML's JS engine has no
// TextEncoder, Buffer, atob or btoa, so UTF-8 and Base64 are done by hand
// here once and reused everywhere.

var B64_STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
var B64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// --------------------------------------------------------------- utf-8

// String (UTF-16) -> array of byte values. Lone surrogates are encoded as
// U+FFFD rather than throwing, so pasting half a pair still produces output.
function toUtf8(str) {
  var s = String(str === undefined || str === null ? "" : str)
  var out = []
  for (var i = 0; i < s.length; i++) {
    var cp = s.charCodeAt(i)
    if (cp >= 0xd800 && cp <= 0xdbff) {
      var next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00)
        i++
      } else {
        cp = 0xfffd
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd
    }

    if (cp < 0x80) {
      out.push(cp)
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    } else {
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    }
  }
  return out
}

// Byte length of the UTF-8 encoding, without building the array. Status lines
// only ever want the count, and materialising ten million array elements to
// count them is both slow and a large memory spike. Matches toUtf8 exactly,
// including its U+FFFD substitution for lone surrogates.
function utf8Length(str) {
  var s = String(str === undefined || str === null ? "" : str)
  var total = 0
  for (var i = 0; i < s.length; i++) {
    var cp = s.charCodeAt(i)
    if (cp < 0x80) {
      total += 1
    } else if (cp < 0x800) {
      total += 2
    } else if (cp >= 0xd800 && cp <= 0xdbff) {
      var next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
      if (next >= 0xdc00 && next <= 0xdfff) { total += 4; i++ }
      else total += 3
    } else {
      total += 3
    }
  }
  return total
}

// Bytes -> string. Invalid sequences become U+FFFD; `strict` makes them throw
// instead, which is how the Base64 decoder tells text from binary.
function fromUtf8(bytes, strict) {
  var out = ""
  var i = 0
  var n = bytes.length
  while (i < n) {
    var b0 = bytes[i] & 0xff
    var cp = -1
    var need = 0
    if (b0 < 0x80) { cp = b0; need = 0 }
    else if ((b0 & 0xe0) === 0xc0) { cp = b0 & 0x1f; need = 1 }
    else if ((b0 & 0xf0) === 0xe0) { cp = b0 & 0x0f; need = 2 }
    else if ((b0 & 0xf8) === 0xf0) { cp = b0 & 0x07; need = 3 }

    if (cp < 0 || i + need > n - 1) {
      if (strict) throw new Error("invalid UTF-8 at byte " + i)
      out += "�"
      i++
      continue
    }
    var ok = true
    for (var k = 1; k <= need; k++) {
      var bk = bytes[i + k] & 0xff
      if ((bk & 0xc0) !== 0x80) { ok = false; break }
      cp = (cp << 6) | (bk & 0x3f)
    }
    if (!ok || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
      if (strict) throw new Error("invalid UTF-8 at byte " + i)
      out += "�"
      i++
      continue
    }
    // Reject overlong forms — they are the classic smuggling trick and a
    // reliable "this isn't really text" signal.
    if ((need === 1 && cp < 0x80) || (need === 2 && cp < 0x800) || (need === 3 && cp < 0x10000)) {
      if (strict) throw new Error("overlong UTF-8 sequence at byte " + i)
      out += "�"
      i++
      continue
    }
    if (cp < 0x10000) {
      out += String.fromCharCode(cp)
    } else {
      cp -= 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    }
    i += need + 1
  }
  return out
}

// --------------------------------------------------------------- base64

function encodeBase64(bytes, urlSafe, pad) {
  var alphabet = urlSafe ? B64_URL : B64_STD
  var padded = pad === undefined ? true : !!pad
  var out = ""
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i] & 0xff
    var b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : -1
    var b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : -1
    out += alphabet.charAt(b0 >> 2)
    out += alphabet.charAt(((b0 & 0x03) << 4) | (b1 < 0 ? 0 : b1 >> 4))
    if (b1 < 0) { out += padded ? "==" : ""; break }
    out += alphabet.charAt(((b1 & 0x0f) << 2) | (b2 < 0 ? 0 : b2 >> 6))
    if (b2 < 0) { out += padded ? "=" : ""; break }
    out += alphabet.charAt(b2 & 0x3f)
  }
  return out
}

// Accepts standard and URL-safe alphabets in the same pass, tolerates missing
// padding, and ignores whitespace — real-world Base64 arrives all of those ways.
function decodeBase64(text) {
  var s = String(text || "").replace(/[\s\r\n]+/g, "")
  s = s.replace(/=+$/, "")
  if (s.length === 0) return []
  var out = []
  var acc = 0
  var bits = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    var v = B64_STD.indexOf(c)
    if (v < 0) v = B64_URL.indexOf(c)
    if (v < 0) throw new Error("invalid Base64 character “" + c + "” at position " + i)
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 0xff)
    }
  }
  return out
}

// Heuristic used by clipboard detection, so it errs toward false negatives:
// an all-lowercase run of letters is far more likely to be a word than a
// payload, and real Base64 never contains spaces.
function looksLikeBase64(text) {
  var s = String(text || "").replace(/[\r\n]+/g, "")
  if (s.length < 8 || s.length % 4 === 1) return false
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return false
  return /[A-Z0-9+/=_-]/.test(s)
}

// --------------------------------------------------------------- hex

function toHex(bytes, upper, separator) {
  var sep = separator || ""
  var out = []
  for (var i = 0; i < bytes.length; i++) {
    var h = (bytes[i] & 0xff).toString(16)
    if (h.length < 2) h = "0" + h
    out.push(upper ? h.toUpperCase() : h)
  }
  return out.join(sep)
}

function fromHex(text) {
  var s = String(text || "").replace(/^0[xX]/, "").replace(/[\s:,_-]+/g, "")
  if (s.length % 2 !== 0) throw new Error("hex input needs an even number of digits")
  if (s.length && !/^[0-9a-fA-F]+$/.test(s)) throw new Error("input contains non-hex characters")
  var out = []
  for (var i = 0; i < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16))
  return out
}

// --------------------------------------------------------------- helpers

function wrapLines(text, width) {
  var w = Number(width)
  if (!isFinite(w) || w <= 0) return text
  var out = []
  for (var i = 0; i < text.length; i += w) out.push(text.substr(i, w))
  return out.join("\n")
}

function humanBytes(n) {
  var units = ["B", "KB", "MB", "GB"]
  var v = Number(n) || 0
  var u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  var s = u === 0 ? String(v) : (Math.round(v * 100) / 100).toString()
  return s + " " + units[u]
}

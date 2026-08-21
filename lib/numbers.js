.pragma library

// Base conversion done on digit strings rather than Number, so a 256-bit hex
// value converts exactly instead of collapsing into a float.

var DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"

function digitValue(ch) {
  var v = DIGITS.indexOf(String(ch).toLowerCase())
  return v
}

function normalize(text) {
  return String(text || "").replace(/[\s_,]/g, "")
}

// Strips an explicit prefix and returns [base, digits] when the input
// announces its own base (0x, 0b, 0o, #).
function sniffBase(text) {
  var s = normalize(text).replace(/^[-+]/, "")
  if (/^0[xX]/.test(s)) return [16, s.slice(2)]
  if (/^#/.test(s)) return [16, s.slice(1)]
  if (/^0[bB]/.test(s)) return [2, s.slice(2)]
  if (/^0[oO]/.test(s)) return [8, s.slice(2)]
  return [null, s]
}

function isValidIn(text, base) {
  var s = sniffBase(text)[1]
  if (s.length === 0) return false
  for (var i = 0; i < s.length; i++) {
    var v = digitValue(s.charAt(i))
    if (v < 0 || v >= base) return false
  }
  return true
}

// Repeated long division of the digit array by the target base.
function convert(text, fromBase, toBase) {
  var raw = normalize(text)
  var negative = raw.charAt(0) === "-"
  var sniffed = sniffBase(raw)
  var digits = sniffed[1]
  var base = fromBase

  if (digits.length === 0) return ""
  if (base < 2 || base > 36 || toBase < 2 || toBase > 36) throw new Error("bases must be between 2 and 36")

  var values = []
  for (var i = 0; i < digits.length; i++) {
    var v = digitValue(digits.charAt(i))
    if (v < 0 || v >= base) throw new Error("“" + digits.charAt(i) + "” is not a valid base-" + base + " digit")
    values.push(v)
  }

  var out = ""
  while (values.length > 0) {
    var next = []
    var remainder = 0
    for (var k = 0; k < values.length; k++) {
      var acc = remainder * base + values[k]
      var q = Math.floor(acc / toBase)
      remainder = acc % toBase
      if (next.length > 0 || q > 0) next.push(q)
    }
    out = DIGITS.charAt(remainder) + out
    values = next
  }
  if (out === "") out = "0"
  return (negative ? "-" : "") + out
}

function toDecimalNumber(text, base) {
  var decimal = convert(text, base, 10)
  var n = Number(decimal)
  return isFinite(n) ? n : null
}

// Two's-complement view for the common integer widths. Returns null when the
// value doesn't fit, so the UI can say so instead of printing a lie.
function twosComplement(decimalText, bits) {
  var n = Number(decimalText)
  if (!isFinite(n) || Math.floor(n) !== n) return null
  if (Math.abs(n) > 9007199254740991) return null
  var max = Math.pow(2, bits)
  if (n < -Math.pow(2, bits - 1) || n >= max) return null
  var unsigned = n < 0 ? n + max : n
  var out = ""
  for (var i = bits - 1; i >= 0; i--) {
    out += Math.floor(unsigned / Math.pow(2, i)) % 2
  }
  return out
}

function groupDigits(text, size, separator) {
  var s = String(text)
  var negative = s.charAt(0) === "-"
  if (negative) s = s.slice(1)
  var out = []
  for (var end = s.length; end > 0; end -= size) out.unshift(s.slice(Math.max(0, end - size), end))
  return (negative ? "-" : "") + out.join(separator || " ")
}

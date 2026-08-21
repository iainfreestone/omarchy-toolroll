.pragma library
.import "bytes.js" as Bytes

// Generators. Randomness comes from an injectable source so the UI can feed
// it real entropy from /dev/urandom; the Math.random fallback is clearly
// flagged rather than quietly pretending to be secure.

var entropy = null

function setEntropySource(fn) { entropy = typeof fn === "function" ? fn : null }
function hasStrongEntropy() { return entropy !== null }

function randomBytes(count) {
  if (entropy) {
    var supplied = entropy(count)
    if (supplied && supplied.length >= count) return supplied.slice(0, count)
  }
  var out = []
  for (var i = 0; i < count; i++) out.push(Math.floor(Math.random() * 256))
  return out
}

// Rejection sampling: taking `byte % n` skews toward the low values whenever
// n doesn't divide 256, which is exactly the bias a password generator must
// not have.
function randomInt(bound) {
  if (bound <= 0) return 0
  var limit = 256 - (256 % bound)
  while (true) {
    var b = randomBytes(1)[0]
    if (b < limit) return b % bound
  }
}

function pick(list) { return list[randomInt(list.length)] }

// ------------------------------------------------------------------ uuid

function formatUuid(b, upper, braces, hyphens) {
  var hex = Bytes.toHex(b, upper)
  var out = hyphens === false ? hex
    : hex.substr(0, 8) + "-" + hex.substr(8, 4) + "-" + hex.substr(12, 4) + "-"
      + hex.substr(16, 4) + "-" + hex.substr(20, 12)
  return braces ? "{" + out + "}" : out
}

function uuidV4(opts) {
  var o = opts || {}
  var b = randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  return formatUuid(b, o.uppercase, o.braces, o.hyphens)
}

// Time-ordered v7: 48-bit big-endian millisecond timestamp, then randomness.
function uuidV7(opts, now) {
  var o = opts || {}
  var ms = (now || new Date()).getTime()
  var b = randomBytes(16)
  for (var i = 5; i >= 0; i--) {
    b[i] = ms % 256
    ms = Math.floor(ms / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  return formatUuid(b, o.uppercase, o.braces, o.hyphens)
}

function uuidNil(opts) {
  var o = opts || {}
  var b = []
  for (var i = 0; i < 16; i++) b.push(0)
  return formatUuid(b, o.uppercase, o.braces, o.hyphens)
}

function uuidMax(opts) {
  var o = opts || {}
  var b = []
  for (var i = 0; i < 16; i++) b.push(255)
  return formatUuid(b, o.uppercase, o.braces, o.hyphens)
}

function uuidVersion(text) {
  var s = String(text || "").replace(/[{}\s-]/g, "").toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(s)) return null
  if (s === "00000000000000000000000000000000") return { version: "nil", variant: "-" }
  if (s === "ffffffffffffffffffffffffffffffff") return { version: "max", variant: "-" }
  var version = parseInt(s.charAt(12), 16)
  var variantNibble = parseInt(s.charAt(16), 16)
  var variant = (variantNibble & 0x8) === 0 ? "NCS (legacy)"
    : ((variantNibble & 0x4) === 0 ? "RFC 4122" : ((variantNibble & 0x2) === 0 ? "Microsoft" : "reserved"))
  var out = { version: String(version), variant: variant }
  if (version === 7) {
    var ms = parseInt(s.substr(0, 12), 16)
    out.timestamp = new Date(ms)
  }
  if (version === 1) {
    // 60-bit count of 100ns intervals since 1582-10-15.
    var timeHigh = parseInt(s.substr(13, 3), 16)
    var timeMid = parseInt(s.substr(8, 4), 16)
    var timeLow = parseInt(s.substr(0, 8), 16)
    var intervals = timeHigh * 4294967296 * 65536 + timeMid * 4294967296 + timeLow
    out.timestamp = new Date(intervals / 10000 - 12219292800000)
  }
  return out
}

// ------------------------------------------------------------------ ulid

var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function ulid(now) {
  var ms = (now || new Date()).getTime()
  var time = ""
  for (var i = 9; i >= 0; i--) {
    time = CROCKFORD.charAt(ms % 32) + time
    ms = Math.floor(ms / 32)
  }
  var random = ""
  for (var k = 0; k < 16; k++) random += CROCKFORD.charAt(randomInt(32))
  return time + random
}

function decodeUlid(text) {
  var s = String(text || "").replace(/\s/g, "").toUpperCase()
  if (s.length !== 26) throw new Error("a ULID is 26 characters, this is " + s.length)
  var ms = 0
  for (var i = 0; i < 10; i++) {
    var v = CROCKFORD.indexOf(s.charAt(i))
    if (v < 0) throw new Error("“" + s.charAt(i) + "” is not valid Crockford base32")
    ms = ms * 32 + v
  }
  return { timestamp: new Date(ms), randomness: s.slice(10) }
}

// -------------------------------------------------------- random strings

var CHARSETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?",
  // Crockford-style: no 0/O/1/l/I, for anything a human retypes.
  unambiguous: "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
}

function randomString(length, opts) {
  var o = opts || {}
  var n = Math.max(1, Math.min(4096, Number(length) || 16))
  var alphabet = ""
  if (o.unambiguous) {
    alphabet = CHARSETS.unambiguous + (o.symbols ? CHARSETS.symbols : "")
  } else {
    if (o.lowercase !== false) alphabet += CHARSETS.lowercase
    if (o.uppercase) alphabet += CHARSETS.uppercase
    if (o.digits) alphabet += CHARSETS.digits
    if (o.symbols) alphabet += CHARSETS.symbols
  }
  if (alphabet.length === 0) alphabet = CHARSETS.lowercase
  var out = ""
  for (var i = 0; i < n; i++) out += alphabet.charAt(randomInt(alphabet.length))
  return out
}

// Shannon entropy of the *generator*, not of the produced string — the
// honest number for "how hard is this to guess".
function entropyBits(length, alphabetSize) {
  return Math.round(length * (Math.log(alphabetSize) / Math.log(2)) * 10) / 10
}

function alphabetSizeFor(opts) {
  var o = opts || {}
  if (o.unambiguous) return CHARSETS.unambiguous.length + (o.symbols ? CHARSETS.symbols.length : 0)
  var size = 0
  if (o.lowercase !== false) size += 26
  if (o.uppercase) size += 26
  if (o.digits) size += 10
  if (o.symbols) size += CHARSETS.symbols.length
  return size || 26
}

// ----------------------------------------------------------- lorem ipsum

var LOREM = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor "
  + "incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud "
  + "exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure "
  + "in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur "
  + "sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim "
  + "id est laborum at vero eos accusamus iusto odio dignissimos ducimus blanditiis "
  + "praesentium voluptatum deleniti atque corrupti quos dolores quas molestias").split(" ")

function loremWords(count) {
  var out = []
  for (var i = 0; i < count; i++) out.push(LOREM[randomInt(LOREM.length)])
  return out.join(" ")
}

function loremSentence(startWithLorem) {
  var length = 6 + randomInt(10)
  var body = loremWords(length)
  if (startWithLorem) body = "lorem ipsum dolor sit amet, " + loremWords(4 + randomInt(6))
  // A comma somewhere in the middle reads far more like real filler text.
  if (!startWithLorem && length > 9) {
    var words = body.split(" ")
    var at = 3 + randomInt(words.length - 5)
    words[at] = words[at] + ","
    body = words.join(" ")
  }
  return body.charAt(0).toUpperCase() + body.slice(1) + "."
}

function loremParagraph(classic) {
  var sentences = 3 + randomInt(3)
  var out = []
  for (var i = 0; i < sentences; i++) out.push(loremSentence(classic && i === 0))
  return out.join(" ")
}

function lorem(unit, count, classic) {
  var n = Math.max(1, Math.min(500, Number(count) || 1))
  if (unit === "words") return loremWords(n)
  if (unit === "sentences") {
    var s = []
    for (var i = 0; i < n; i++) s.push(loremSentence(classic && i === 0))
    return s.join(" ")
  }
  var p = []
  for (var k = 0; k < n; k++) p.push(loremParagraph(classic && k === 0))
  return p.join("\n\n")
}

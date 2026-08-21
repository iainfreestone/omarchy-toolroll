.pragma library
.import "bytes.js" as Bytes

// Pure-JS digests. Everything operates on byte arrays and returns byte
// arrays, so callers pick their own output encoding (hex, Base64, ...).
// Shelling out to openssl would have been shorter, but a hash tool that
// only works when a package happens to be installed is not a tool.

// ------------------------------------------------------------------ md5

var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]

var MD5_K = (function () {
  var k = []
  for (var i = 0; i < 64; i++) k.push((Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0)
  return k
})()

function rotl32(x, n) { return ((x << n) | (x >>> (32 - n))) | 0 }
function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) | 0 }
function add32() {
  var sum = 0
  for (var i = 0; i < arguments.length; i++) sum = (sum + arguments[i]) | 0
  return sum
}

// Little-endian length padding (md5) vs big-endian (sha) is the only
// structural difference between the two Merkle-Damgård families here.
function padMessage(bytes, littleEndian) {
  var len = bytes.length
  var out = bytes.slice(0)
  out.push(0x80)
  while (out.length % 64 !== 56) out.push(0)
  var bitsLo = (len << 3) >>> 0
  var bitsHi = Math.floor(len / 536870912) >>> 0
  if (littleEndian) {
    out.push(bitsLo & 0xff, (bitsLo >>> 8) & 0xff, (bitsLo >>> 16) & 0xff, (bitsLo >>> 24) & 0xff)
    out.push(bitsHi & 0xff, (bitsHi >>> 8) & 0xff, (bitsHi >>> 16) & 0xff, (bitsHi >>> 24) & 0xff)
  } else {
    out.push((bitsHi >>> 24) & 0xff, (bitsHi >>> 16) & 0xff, (bitsHi >>> 8) & 0xff, bitsHi & 0xff)
    out.push((bitsLo >>> 24) & 0xff, (bitsLo >>> 16) & 0xff, (bitsLo >>> 8) & 0xff, bitsLo & 0xff)
  }
  return out
}

function md5(bytes) {
  var msg = padMessage(bytes, true)
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476

  for (var off = 0; off < msg.length; off += 64) {
    var m = []
    for (var i = 0; i < 16; i++) {
      var j = off + i * 4
      m.push((msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24)) | 0)
    }
    var a = a0, b = b0, c = c0, d = d0
    for (var k = 0; k < 64; k++) {
      var f, g
      if (k < 16) { f = (b & c) | (~b & d); g = k }
      else if (k < 32) { f = (d & b) | (~d & c); g = (5 * k + 1) % 16 }
      else if (k < 48) { f = b ^ c ^ d; g = (3 * k + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * k) % 16 }
      var tmp = d
      d = c
      c = b
      b = add32(b, rotl32(add32(a, f, MD5_K[k], m[g]), MD5_S[k]))
      a = tmp
    }
    a0 = add32(a0, a); b0 = add32(b0, b); c0 = add32(c0, c); d0 = add32(d0, d)
  }

  var out = []
  var words = [a0, b0, c0, d0]
  for (var w = 0; w < 4; w++)
    out.push(words[w] & 0xff, (words[w] >>> 8) & 0xff, (words[w] >>> 16) & 0xff, (words[w] >>> 24) & 0xff)
  return out
}

// ----------------------------------------------------------------- sha1

function sha1(bytes) {
  var msg = padMessage(bytes, false)
  var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]

  for (var off = 0; off < msg.length; off += 64) {
    var w = []
    for (var i = 0; i < 16; i++) {
      var j = off + i * 4
      w.push(((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) | 0)
    }
    for (var t = 16; t < 80; t++) w.push(rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1))

    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4]
    for (var k = 0; k < 80; k++) {
      var f, kc
      if (k < 20) { f = (b & c) | (~b & d); kc = 0x5a827999 }
      else if (k < 40) { f = b ^ c ^ d; kc = 0x6ed9eba1 }
      else if (k < 60) { f = (b & c) | (b & d) | (c & d); kc = 0x8f1bbcdc }
      else { f = b ^ c ^ d; kc = 0xca62c1d6 }
      var tmp = add32(rotl32(a, 5), f, e, kc, w[k])
      e = d; d = c; c = rotl32(b, 30); b = a; a = tmp
    }
    h[0] = add32(h[0], a); h[1] = add32(h[1], b); h[2] = add32(h[2], c)
    h[3] = add32(h[3], d); h[4] = add32(h[4], e)
  }
  return wordsToBytesBE(h)
}

function wordsToBytesBE(words) {
  var out = []
  for (var i = 0; i < words.length; i++)
    out.push((words[i] >>> 24) & 0xff, (words[i] >>> 16) & 0xff, (words[i] >>> 8) & 0xff, words[i] & 0xff)
  return out
}

// --------------------------------------------------------------- sha-256

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]

function sha256core(bytes, h) {
  var msg = padMessage(bytes, false)
  for (var off = 0; off < msg.length; off += 64) {
    var w = []
    for (var i = 0; i < 16; i++) {
      var j = off + i * 4
      w.push(((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) | 0)
    }
    for (var t = 16; t < 64; t++) {
      var s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3)
      var s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10)
      w.push(add32(w[t - 16], s0, w[t - 7], s1))
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (var k = 0; k < 64; k++) {
      var S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      var ch = (e & f) ^ (~e & g)
      var t1 = add32(hh, S1, ch, SHA256_K[k], w[k])
      var S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      var maj = (a & b) ^ (a & c) ^ (b & c)
      var t2 = add32(S0, maj)
      hh = g; g = f; f = e; e = add32(d, t1); d = c; c = b; b = a; a = add32(t1, t2)
    }
    var next = [a, b, c, d, e, f, g, hh]
    for (var n = 0; n < 8; n++) h[n] = add32(h[n], next[n])
  }
  return h
}

function sha256(bytes) {
  return wordsToBytesBE(sha256core(bytes, [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]))
}

function sha224(bytes) {
  return wordsToBytesBE(sha256core(bytes, [
    0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4])).slice(0, 28)
}

// --------------------------------------------------------------- sha-512
//
// 64-bit arithmetic done as [hi, lo] 32-bit pairs — QML's JS engine has no
// reliable BigInt guarantee and the pair form is faster anyway.

var SHA512_K = [
  [0x428a2f98,0xd728ae22],[0x71374491,0x23ef65cd],[0xb5c0fbcf,0xec4d3b2f],[0xe9b5dba5,0x8189dbbc],
  [0x3956c25b,0xf348b538],[0x59f111f1,0xb605d019],[0x923f82a4,0xaf194f9b],[0xab1c5ed5,0xda6d8118],
  [0xd807aa98,0xa3030242],[0x12835b01,0x45706fbe],[0x243185be,0x4ee4b28c],[0x550c7dc3,0xd5ffb4e2],
  [0x72be5d74,0xf27b896f],[0x80deb1fe,0x3b1696b1],[0x9bdc06a7,0x25c71235],[0xc19bf174,0xcf692694],
  [0xe49b69c1,0x9ef14ad2],[0xefbe4786,0x384f25e3],[0x0fc19dc6,0x8b8cd5b5],[0x240ca1cc,0x77ac9c65],
  [0x2de92c6f,0x592b0275],[0x4a7484aa,0x6ea6e483],[0x5cb0a9dc,0xbd41fbd4],[0x76f988da,0x831153b5],
  [0x983e5152,0xee66dfab],[0xa831c66d,0x2db43210],[0xb00327c8,0x98fb213f],[0xbf597fc7,0xbeef0ee4],
  [0xc6e00bf3,0x3da88fc2],[0xd5a79147,0x930aa725],[0x06ca6351,0xe003826f],[0x14292967,0x0a0e6e70],
  [0x27b70a85,0x46d22ffc],[0x2e1b2138,0x5c26c926],[0x4d2c6dfc,0x5ac42aed],[0x53380d13,0x9d95b3df],
  [0x650a7354,0x8baf63de],[0x766a0abb,0x3c77b2a8],[0x81c2c92e,0x47edaee6],[0x92722c85,0x1482353b],
  [0xa2bfe8a1,0x4cf10364],[0xa81a664b,0xbc423001],[0xc24b8b70,0xd0f89791],[0xc76c51a3,0x0654be30],
  [0xd192e819,0xd6ef5218],[0xd6990624,0x5565a910],[0xf40e3585,0x5771202a],[0x106aa070,0x32bbd1b8],
  [0x19a4c116,0xb8d2d0c8],[0x1e376c08,0x5141ab53],[0x2748774c,0xdf8eeb99],[0x34b0bcb5,0xe19b48a8],
  [0x391c0cb3,0xc5c95a63],[0x4ed8aa4a,0xe3418acb],[0x5b9cca4f,0x7763e373],[0x682e6ff3,0xd6b2b8a3],
  [0x748f82ee,0x5defb2fc],[0x78a5636f,0x43172f60],[0x84c87814,0xa1f0ab72],[0x8cc70208,0x1a6439ec],
  [0x90befffa,0x23631e28],[0xa4506ceb,0xde82bde9],[0xbef9a3f7,0xb2c67915],[0xc67178f2,0xe372532b],
  [0xca273ece,0xea26619c],[0xd186b8c7,0x21c0c207],[0xeada7dd6,0xcde0eb1e],[0xf57d4f7f,0xee6ed178],
  [0x06f067aa,0x72176fba],[0x0a637dc5,0xa2c898a6],[0x113f9804,0xbef90dae],[0x1b710b35,0x131c471b],
  [0x28db77f5,0x23047d84],[0x32caab7b,0x40c72493],[0x3c9ebe0a,0x15c9bebc],[0x431d67c4,0x9c100d4c],
  [0x4cc5d4be,0xcb3e42b6],[0x597f299c,0xfc657e2a],[0x5fcb6fab,0x3ad6faec],[0x6c44198c,0x4a475817]]

function add64(a, b) {
  var lo = (a[1] >>> 0) + (b[1] >>> 0)
  var hi = (a[0] >>> 0) + (b[0] >>> 0) + (lo > 0xffffffff ? 1 : 0)
  return [hi >>> 0, lo >>> 0]
}
function add64all(list) {
  var acc = [0, 0]
  for (var i = 0; i < list.length; i++) acc = add64(acc, list[i])
  return acc
}
function xor64(a, b) { return [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0] }
function and64(a, b) { return [(a[0] & b[0]) >>> 0, (a[1] & b[1]) >>> 0] }
function not64(a) { return [(~a[0]) >>> 0, (~a[1]) >>> 0] }
function rotr64(a, n) {
  if (n === 0) return [a[0] >>> 0, a[1] >>> 0]
  if (n === 32) return [a[1] >>> 0, a[0] >>> 0]
  if (n < 32) {
    return [((a[0] >>> n) | (a[1] << (32 - n))) >>> 0, ((a[1] >>> n) | (a[0] << (32 - n))) >>> 0]
  }
  var m = n - 32
  return [((a[1] >>> m) | (a[0] << (32 - m))) >>> 0, ((a[0] >>> m) | (a[1] << (32 - m))) >>> 0]
}
function shr64(a, n) {
  if (n < 32) return [(a[0] >>> n) >>> 0, ((a[1] >>> n) | (a[0] << (32 - n))) >>> 0]
  return [0, (a[0] >>> (n - 32)) >>> 0]
}

function pad128(bytes) {
  var len = bytes.length
  var out = bytes.slice(0)
  out.push(0x80)
  while (out.length % 128 !== 112) out.push(0)
  // 128-bit length field; a browser-sized message never fills the top half.
  for (var z = 0; z < 8; z++) out.push(0)
  var bitsLo = (len * 8) % 4294967296
  var bitsHi = Math.floor((len * 8) / 4294967296)
  out.push((bitsHi >>> 24) & 0xff, (bitsHi >>> 16) & 0xff, (bitsHi >>> 8) & 0xff, bitsHi & 0xff)
  out.push((bitsLo >>> 24) & 0xff, (bitsLo >>> 16) & 0xff, (bitsLo >>> 8) & 0xff, bitsLo & 0xff)
  return out
}

function sha512core(bytes, h) {
  var msg = pad128(bytes)
  for (var off = 0; off < msg.length; off += 128) {
    var w = []
    for (var i = 0; i < 16; i++) {
      var j = off + i * 8
      w.push([
        ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0,
        ((msg[j + 4] << 24) | (msg[j + 5] << 16) | (msg[j + 6] << 8) | msg[j + 7]) >>> 0])
    }
    for (var t = 16; t < 80; t++) {
      var s0 = xor64(xor64(rotr64(w[t - 15], 1), rotr64(w[t - 15], 8)), shr64(w[t - 15], 7))
      var s1 = xor64(xor64(rotr64(w[t - 2], 19), rotr64(w[t - 2], 61)), shr64(w[t - 2], 6))
      w.push(add64all([w[t - 16], s0, w[t - 7], s1]))
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (var k = 0; k < 80; k++) {
      var S1 = xor64(xor64(rotr64(e, 14), rotr64(e, 18)), rotr64(e, 41))
      var ch = xor64(and64(e, f), and64(not64(e), g))
      var t1 = add64all([hh, S1, ch, SHA512_K[k], w[k]])
      var S0 = xor64(xor64(rotr64(a, 28), rotr64(a, 34)), rotr64(a, 39))
      var maj = xor64(xor64(and64(a, b), and64(a, c)), and64(b, c))
      var t2 = add64(S0, maj)
      hh = g; g = f; f = e; e = add64(d, t1); d = c; c = b; b = a; a = add64(t1, t2)
    }
    var next = [a, b, c, d, e, f, g, hh]
    for (var n = 0; n < 8; n++) h[n] = add64(h[n], next[n])
  }
  return h
}

function pairsToBytes(pairs) {
  var out = []
  for (var i = 0; i < pairs.length; i++) {
    out.push((pairs[i][0] >>> 24) & 0xff, (pairs[i][0] >>> 16) & 0xff, (pairs[i][0] >>> 8) & 0xff, pairs[i][0] & 0xff)
    out.push((pairs[i][1] >>> 24) & 0xff, (pairs[i][1] >>> 16) & 0xff, (pairs[i][1] >>> 8) & 0xff, pairs[i][1] & 0xff)
  }
  return out
}

function sha512(bytes) {
  return pairsToBytes(sha512core(bytes, [
    [0x6a09e667, 0xf3bcc908], [0xbb67ae85, 0x84caa73b], [0x3c6ef372, 0xfe94f82b], [0xa54ff53a, 0x5f1d36f1],
    [0x510e527f, 0xade682d1], [0x9b05688c, 0x2b3e6c1f], [0x1f83d9ab, 0xfb41bd6b], [0x5be0cd19, 0x137e2179]]))
}

function sha384(bytes) {
  return pairsToBytes(sha512core(bytes, [
    [0xcbbb9d5d, 0xc1059ed8], [0x629a292a, 0x367cd507], [0x9159015a, 0x3070dd17], [0x152fecd8, 0xf70e5939],
    [0x67332667, 0xffc00b31], [0x8eb44a87, 0x68581511], [0xdb0c2e0d, 0x64f98fa7], [0x47b5481d, 0xbefa4fa4]])).slice(0, 48)
}

// ---------------------------------------------------------------- crc32

var CRC_TABLE = (function () {
  var table = []
  for (var n = 0; n < 256; n++) {
    var c = n
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table.push(c >>> 0)
  }
  return table
})()

function crc32(bytes) {
  var crc = 0xffffffff
  for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  crc = (crc ^ 0xffffffff) >>> 0
  return [(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff]
}

// ----------------------------------------------------------------- hmac

var ALGORITHMS = {
  "md5":    { fn: md5,    block: 64 },
  "sha1":   { fn: sha1,   block: 64 },
  "sha224": { fn: sha224, block: 64 },
  "sha256": { fn: sha256, block: 64 },
  "sha384": { fn: sha384, block: 128 },
  "sha512": { fn: sha512, block: 128 },
  "crc32":  { fn: crc32,  block: 0 }
}

function digest(name, bytes) {
  var algorithm = ALGORITHMS[String(name).toLowerCase()]
  if (!algorithm) throw new Error("unknown algorithm: " + name)
  return algorithm.fn(bytes)
}

function hmac(name, keyBytes, messageBytes) {
  var algorithm = ALGORITHMS[String(name).toLowerCase()]
  if (!algorithm || algorithm.block === 0) throw new Error("HMAC is not defined for " + name)
  var block = algorithm.block
  var key = keyBytes.slice(0)
  if (key.length > block) key = algorithm.fn(key)
  while (key.length < block) key.push(0)

  var inner = [], outer = []
  for (var i = 0; i < block; i++) {
    inner.push(key[i] ^ 0x36)
    outer.push(key[i] ^ 0x5c)
  }
  return algorithm.fn(outer.concat(algorithm.fn(inner.concat(messageBytes))))
}

function hexDigest(name, text) { return Bytes.toHex(digest(name, Bytes.toUtf8(text))) }

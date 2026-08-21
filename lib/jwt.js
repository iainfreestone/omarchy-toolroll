.pragma library
.import "bytes.js" as Bytes
.import "json.js" as Json
.import "hash.js" as Hash
.import "time.js" as Time

// JWT inspection. HMAC signatures are verified for real; RSA and ECDSA
// signatures are reported as unverifiable rather than shown with a
// reassuring-looking checkmark we haven't earned.

var TIME_CLAIMS = { exp: "expires", iat: "issued at", nbf: "not before", auth_time: "authenticated at" }

var CLAIM_NAMES = {
  iss: "Issuer", sub: "Subject", aud: "Audience", exp: "Expires at", nbf: "Not before",
  iat: "Issued at", jti: "JWT ID", azp: "Authorized party", scope: "Scope",
  email: "Email", name: "Name", preferred_username: "Username", typ: "Type",
  alg: "Algorithm", kid: "Key ID"
}

function decodeSegment(segment, label) {
  var bytes
  try {
    bytes = Bytes.decodeBase64(segment)
  } catch (e) {
    throw new Error("the " + label + " is not valid base64url: " + e.message)
  }
  var text
  try {
    text = Bytes.fromUtf8(bytes, true)
  } catch (e) {
    throw new Error("the " + label + " is not valid UTF-8")
  }
  try {
    return Json.parse(text)
  } catch (e) {
    throw new Error("the " + label + " is not valid JSON: " + (e.formatted || e.message))
  }
}

function decode(token, now) {
  var raw = String(token || "").replace(/^\s+|\s+$/g, "")
  if (raw.length === 0) throw new Error("paste a JWT")
  // Strip the Authorization-header prefix before collapsing whitespace,
  // otherwise "Bearer eyJ..." becomes one unsplittable blob.
  raw = raw.replace(/^bearer\s+/i, "").replace(/\s+/g, "")

  var parts = raw.split(".")
  if (parts.length !== 3) {
    if (parts.length === 5) throw new Error("this looks like a JWE (encrypted); only signed JWTs can be decoded here")
    throw new Error("a JWT has three dot-separated parts, this has " + parts.length)
  }

  var header = decodeSegment(parts[0], "header")
  var payload = decodeSegment(parts[1], "payload")
  var algorithm = String(header.alg || "none")

  var reference = now || new Date()
  var claims = []
  var keys = Json.keysOf(payload, false)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var value = payload[key]
    var row = { key: key, label: CLAIM_NAMES[key] || key, value: value, note: "" }
    if (TIME_CLAIMS[key] && typeof value === "number") {
      var date = new Date(value * 1000)
      row.note = Time.humanUtc(date) + " · " + Time.relative(date, reference)
    }
    claims.push(row)
  }

  var status = "no expiry claim"
  var valid = null
  if (typeof payload.exp === "number") {
    var expDate = new Date(payload.exp * 1000)
    valid = expDate.getTime() > reference.getTime()
    status = valid
      ? "valid, expires " + Time.relative(expDate, reference)
      : "EXPIRED " + Time.relative(expDate, reference)
  }
  if (typeof payload.nbf === "number" && new Date(payload.nbf * 1000).getTime() > reference.getTime()) {
    valid = false
    status = "not valid yet, starts " + Time.relative(new Date(payload.nbf * 1000), reference)
  }

  return {
    header: header,
    payload: payload,
    signature: parts[2],
    signingInput: parts[0] + "." + parts[1],
    algorithm: algorithm,
    claims: claims,
    expiryStatus: status,
    isCurrentlyValid: valid
  }
}

var HMAC_ALGORITHMS = { HS256: "sha256", HS384: "sha384", HS512: "sha512" }

// secretIsBase64 matters: half the JWT secrets in the wild are base64-encoded
// bytes, and verifying against the wrong interpretation silently fails.
function verify(decoded, secret, secretIsBase64) {
  var algorithm = String(decoded.algorithm || "").toUpperCase()
  if (algorithm === "NONE") return { supported: true, valid: false, message: "alg is “none” — this token is unsigned" }
  var hashName = HMAC_ALGORITHMS[algorithm]
  if (!hashName) {
    return {
      supported: false,
      valid: null,
      message: algorithm + " needs a public key; only HS256/384/512 can be checked here"
    }
  }
  if (!secret || secret.length === 0) return { supported: true, valid: null, message: "enter the shared secret to verify" }

  var keyBytes
  try {
    keyBytes = secretIsBase64 ? Bytes.decodeBase64(secret) : Bytes.toUtf8(secret)
  } catch (e) {
    return { supported: true, valid: null, message: "the secret is not valid base64" }
  }

  var expected = Bytes.encodeBase64(
    Hash.hmac(hashName, keyBytes, Bytes.toUtf8(decoded.signingInput)), true, false)
  var actual = String(decoded.signature).replace(/=+$/, "")
  var matches = expected === actual
  return {
    supported: true,
    valid: matches,
    message: matches ? "signature verified (" + algorithm + ")" : "signature does not match this secret"
  }
}

function looksLikeJwt(text) {
  var s = String(text || "").replace(/\s+/g, "")
  return /^(Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s)
}

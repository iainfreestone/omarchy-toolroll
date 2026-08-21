.pragma library
.import "text.js" as Text

// URL splitting done by hand: the QML JS engine has no URL constructor, and
// hand-parsing also lets malformed input degrade into "here's what I could
// read" instead of an exception.

function parse(text) {
  var raw = String(text || "").replace(/^\s+|\s+$/g, "")
  if (raw.length === 0) throw new Error("enter a URL")

  var out = {
    href: raw, protocol: "", username: "", password: "", hostname: "", port: "",
    path: "", search: "", hash: "", params: []
  }

  var rest = raw
  var hashAt = rest.indexOf("#")
  if (hashAt !== -1) { out.hash = rest.slice(hashAt + 1); rest = rest.slice(0, hashAt) }

  var queryAt = rest.indexOf("?")
  if (queryAt !== -1) { out.search = rest.slice(queryAt + 1); rest = rest.slice(0, queryAt) }

  var schemeMatch = rest.match(/^([A-Za-z][A-Za-z0-9+.-]*):/)
  if (schemeMatch) {
    out.protocol = schemeMatch[1]
    rest = rest.slice(schemeMatch[0].length)
  }

  if (rest.substr(0, 2) === "//") {
    rest = rest.slice(2)
    var slashAt = rest.indexOf("/")
    var authority = slashAt === -1 ? rest : rest.slice(0, slashAt)
    out.path = slashAt === -1 ? "" : rest.slice(slashAt)

    var atAt = authority.lastIndexOf("@")
    if (atAt !== -1) {
      var credentials = authority.slice(0, atAt)
      authority = authority.slice(atAt + 1)
      var colonAt = credentials.indexOf(":")
      out.username = colonAt === -1 ? credentials : credentials.slice(0, colonAt)
      out.password = colonAt === -1 ? "" : credentials.slice(colonAt + 1)
    }
    // IPv6 literals keep their brackets and their internal colons.
    var portMatch = authority.match(/^(\[[^\]]*\]|[^:]*)(?::([0-9]*))?$/)
    if (portMatch) {
      out.hostname = portMatch[1]
      out.port = portMatch[2] || ""
    } else {
      out.hostname = authority
    }
  } else {
    out.path = rest
  }

  out.params = parseQuery(out.search)
  out.host = out.hostname + (out.port ? ":" + out.port : "")
  out.origin = out.protocol && out.hostname ? out.protocol + "://" + out.host : ""
  var dot = out.hostname.lastIndexOf(".")
  out.tld = dot > 0 ? out.hostname.slice(dot + 1) : ""
  out.pathSegments = out.path.split("/").filter(function (p) { return p.length > 0 })
  return out
}

function parseQuery(search) {
  var s = String(search || "").replace(/^\?/, "")
  if (s.length === 0) return []
  var out = []
  var pairs = s.split(/[&;]/)
  for (var i = 0; i < pairs.length; i++) {
    if (pairs[i].length === 0) continue
    var eq = pairs[i].indexOf("=")
    var key = eq === -1 ? pairs[i] : pairs[i].slice(0, eq)
    var value = eq === -1 ? "" : pairs[i].slice(eq + 1)
    out.push({ key: Text.urlDecodePlus(key), value: Text.urlDecodePlus(value), raw: pairs[i] })
  }
  return out
}

function buildQuery(params) {
  var parts = []
  for (var i = 0; i < params.length; i++) {
    var p = params[i]
    parts.push(Text.urlEncodeComponent(p.key) + (p.value === "" ? "" : "=" + Text.urlEncodeComponent(p.value)))
  }
  return parts.join("&")
}

function build(parts) {
  var out = ""
  if (parts.protocol) out += parts.protocol + "://"
  if (parts.username) out += parts.username + (parts.password ? ":" + parts.password : "") + "@"
  out += parts.hostname || ""
  if (parts.port) out += ":" + parts.port
  out += parts.path || ""
  var search = parts.params && parts.params.length ? buildQuery(parts.params) : (parts.search || "")
  if (search) out += "?" + search
  if (parts.hash) out += "#" + parts.hash
  return out
}

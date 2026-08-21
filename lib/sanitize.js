.pragma library

// Keeping the preview panes offline.
//
// Qt's rich-text and Markdown renderers fetch remote images. Confirmed by
// pointing a preview at a local listener and watching two HTTP GETs arrive —
// so pasting HTML out of an email into the preview would load every tracking
// pixel in it, leaking your address and confirming you had opened it. This
// plugin's first promise is that it never touches the network, and a renderer
// quietly doing it on your behalf breaks that promise in the worst place: on
// content you did not write and cannot see.
//
// The rule is an allowlist, not a blocklist: only `data:` URIs may load,
// because they carry their bytes with them and cannot reach anywhere. Every
// other scheme — http, https, protocol-relative //host, and file: — is
// neutralised. Blocking file: too is deliberate; a preview has no business
// reading the disk on the say-so of pasted text.

function isLocalReference(url) {
  var s = String(url || "").replace(/^\s+/, "")
  return /^data:/i.test(s)
}

// Attributes Qt's rich text will fetch. `href` is absent on purpose: a link is
// only followed when activated, and the preview already ignores activation.
var FETCHING_ATTRIBUTES = ["src", "background"]

function stripHtmlResources(text, report) {
  var out = String(text)
  for (var i = 0; i < FETCHING_ATTRIBUTES.length; i++) {
    var attribute = FETCHING_ATTRIBUTES[i]
    var pattern = new RegExp("(\\s" + attribute + "\\s*=\\s*)([\"']?)([^\"'>\\s]*)\\2", "gi")
    out = out.replace(pattern, function (whole, lead, quote, url) {
      if (isLocalReference(url)) return whole
      report.blocked++
      return lead + '""'
    })
  }
  return out
}

// ![alt](url) and ![alt](url "title"). Reference-style images are handled by
// emptying the definition they point at, further down.
function stripMarkdownImages(text, report) {
  return String(text).replace(/(!\[[^\]]*\]\()([^)\s]*)([^)]*)(\))/g,
    function (whole, lead, url, rest, close) {
      if (isLocalReference(url) || url.length === 0) return whole
      report.blocked++
      return lead + close
    })
}

// [ref]: https://... — the definition half of a reference-style image.
function stripMarkdownDefinitions(text, report) {
  return String(text).replace(/^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/gm,
    function (whole, lead, url, rest) {
      if (isLocalReference(url)) return whole
      report.blocked++
      return lead + rest
    })
}

// Returns { text, blocked } so the view can say what it withheld rather than
// silently showing a different document from the one that was pasted.
function forPreview(text, format) {
  var report = { blocked: 0 }
  var out = String(text === undefined || text === null ? "" : text)

  if (String(format) === "markdown") {
    out = stripMarkdownImages(out, report)
    out = stripMarkdownDefinitions(out, report)
  }
  // Markdown gets the HTML pass too: Qt's Markdown renderer honours inline
  // HTML, so an <img> inside a Markdown document fetches just the same.
  out = stripHtmlResources(out, report)

  return { text: out, blocked: report.blocked }
}

function describe(blocked) {
  if (blocked === 0) return ""
  return blocked === 1
    ? "1 remote image blocked — previews never touch the network"
    : blocked + " remote images blocked — previews never touch the network"
}

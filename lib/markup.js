.pragma library

// HTML / XML / CSS formatting. The markup side parses into a small node tree
// first, because whitespace only means something in some places: inside
// <pre>, <script>, <style> and <textarea> it is content, everywhere else it
// is layout.

var VOID_ELEMENTS = ("area base br col embed hr img input link meta param source track wbr").split(" ")
var RAW_ELEMENTS = ("script style pre textarea").split(" ")
var INLINE_ELEMENTS = ("a abbr b bdi bdo br button cite code data dfn em i img input kbd label mark "
  + "q s samp select small span strong sub sup textarea time u var wbr").split(" ")

function inList(list, name) { return list.indexOf(String(name).toLowerCase()) !== -1 }

// ------------------------------------------------------------------ parse

function parseMarkup(text, isHtml) {
  var s = String(text)
  var i = 0
  var root = { type: "root", children: [] }
  var stack = [root]

  function top() { return stack[stack.length - 1] }
  function push(node) { top().children.push(node) }

  while (i < s.length) {
    if (s.charAt(i) !== "<") {
      var textEnd = s.indexOf("<", i)
      if (textEnd === -1) textEnd = s.length
      var body = s.substring(i, textEnd)
      if (body.length) push({ type: "text", text: body })
      i = textEnd
      continue
    }

    if (s.substr(i, 4) === "<!--") {
      var commentEnd = s.indexOf("-->", i + 4)
      commentEnd = commentEnd === -1 ? s.length : commentEnd + 3
      push({ type: "comment", text: s.substring(i, commentEnd) })
      i = commentEnd
      continue
    }
    if (s.substr(i, 9).toUpperCase() === "<![CDATA[") {
      var cdataEnd = s.indexOf("]]>", i + 9)
      cdataEnd = cdataEnd === -1 ? s.length : cdataEnd + 3
      push({ type: "cdata", text: s.substring(i, cdataEnd) })
      i = cdataEnd
      continue
    }
    if (s.charAt(i + 1) === "!" || s.charAt(i + 1) === "?") {
      var directiveEnd = s.indexOf(">", i)
      directiveEnd = directiveEnd === -1 ? s.length : directiveEnd + 1
      push({ type: "directive", text: s.substring(i, directiveEnd) })
      i = directiveEnd
      continue
    }

    var closing = s.charAt(i + 1) === "/"
    var tagEnd = findTagEnd(s, i)
    var tagText = s.substring(i, tagEnd)
    var nameMatch = tagText.match(/^<\/?\s*([A-Za-z_][\w:.-]*)/)
    var name = nameMatch ? nameMatch[1] : ""
    i = tagEnd

    if (closing) {
      // Unwind to the matching open tag; unbalanced markup is common enough
      // in the wild that bailing out entirely would be unhelpful.
      for (var k = stack.length - 1; k > 0; k--) {
        if (String(stack[k].name).toLowerCase() === name.toLowerCase()) {
          stack.length = k
          break
        }
      }
      continue
    }

    var selfClosing = /\/>$/.test(tagText) || (isHtml && inList(VOID_ELEMENTS, name))
    var attrs = tagText.replace(/^<\s*[A-Za-z_][\w:.-]*/, "").replace(/\/?>$/, "")
    var node = { type: "element", name: name, attrs: normalizeAttrs(attrs), children: [], selfClosing: selfClosing }
    push(node)

    if (!selfClosing) {
      if (isHtml && inList(RAW_ELEMENTS, name)) {
        var closeTag = new RegExp("</\\s*" + name + "\\s*>", "i")
        var remainder = s.slice(i)
        var found = remainder.search(closeTag)
        var rawBody = found === -1 ? remainder : remainder.slice(0, found)
        node.raw = rawBody
        i += found === -1 ? remainder.length : found + remainder.slice(found).match(closeTag)[0].length
      } else {
        stack.push(node)
      }
    }
  }
  return root
}

// Attribute values can contain ">", so scan with quote awareness rather than
// reaching for the next ">".
function findTagEnd(s, from) {
  var quote = null
  for (var i = from + 1; i < s.length; i++) {
    var c = s.charAt(i)
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === ">") return i + 1
  }
  return s.length
}

function normalizeAttrs(attrs) {
  var s = String(attrs).replace(/^\s+|\s+$/g, "")
  if (s.length === 0) return ""
  return " " + s.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ")
}

// ----------------------------------------------------------------- render

function isBlank(node) {
  return node.type === "text" && /^\s*$/.test(node.text)
}

function collapse(text) {
  return String(text).replace(/\s+/g, " ")
}

function renderTree(root, opts) {
  var o = opts || {}
  var pad = o.tabs ? "\t" : new Array((o.indent === undefined ? 2 : o.indent) + 1).join(" ")
  var wrapAt = o.wrapAt === undefined ? 100 : o.wrapAt
  var out = []

  function indentFor(depth) {
    var s = ""
    for (var i = 0; i < depth; i++) s += pad
    return s
  }

  function openTag(node) {
    return "<" + node.name + node.attrs + (node.selfClosing && !o.html ? "/>" : ">")
  }

  // A text-bearing element whose other children are inline is rendered on one
  // line when it fits — <td>42</td> and <p>a <b>b</b> c</p> should not become
  // three lines each. An element with no text of its own (<div><br></div>)
  // stays expanded, and XML gets no inline set at all since it has no such
  // concept.
  function inlineText(node) {
    var parts = []
    var sawText = false
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i]
      if (child.type === "text") {
        if (!/^\s*$/.test(child.text)) sawText = true
        parts.push(collapse(child.text))
        continue
      }
      if (child.type !== "element") return null
      if (!o.html || !inList(INLINE_ELEMENTS, child.name)) return null
      if (child.raw !== undefined) return null
      var inner = child.children.length ? inlineText(child) : ""
      if (inner === null) return null
      parts.push(openTag(child) + inner + (child.selfClosing ? "" : "</" + child.name + ">"))
    }
    if (!sawText) return null
    return parts.join("").replace(/^\s+|\s+$/g, "")
  }

  function walk(node, depth) {
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i]
      if (isBlank(child)) continue

      if (child.type === "text") {
        var body = collapse(child.text).replace(/^\s+|\s+$/g, "")
        if (body.length) out.push(indentFor(depth) + body)
        continue
      }
      if (child.type === "comment" || child.type === "directive" || child.type === "cdata") {
        out.push(indentFor(depth) + child.text.replace(/\s*\n\s*/g, " "))
        continue
      }

      if (child.raw !== undefined) {
        var rawBody = String(child.raw).replace(/^\n+|\s+$/g, "")
        if (rawBody.length === 0) {
          out.push(indentFor(depth) + openTag(child) + "</" + child.name + ">")
        } else {
          out.push(indentFor(depth) + openTag(child))
          var lines = dedent(rawBody).split("\n")
          for (var r = 0; r < lines.length; r++) out.push(indentFor(depth + 1) + lines[r])
          out.push(indentFor(depth) + "</" + child.name + ">")
        }
        continue
      }

      if (child.selfClosing || child.children.length === 0) {
        out.push(indentFor(depth) + openTag(child) + (child.selfClosing ? "" : "</" + child.name + ">"))
        continue
      }

      var single = inlineText(child)
      if (single !== null && (indentFor(depth).length + single.length + child.name.length * 2 + 5) <= wrapAt
          && single.indexOf("\n") === -1) {
        out.push(indentFor(depth) + openTag(child) + single + "</" + child.name + ">")
        continue
      }

      out.push(indentFor(depth) + openTag(child))
      walk(child, depth + 1)
      out.push(indentFor(depth) + "</" + child.name + ">")
    }
  }

  walk(root, 0)
  return out.join("\n")
}

// Removes the shared leading indentation from an embedded <script>/<style>
// body so it can be re-indented to its new depth.
function dedent(text) {
  var lines = String(text).split("\n")
  var smallest = null
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*$/.test(lines[i])) continue
    var lead = lines[i].match(/^[ \t]*/)[0].length
    if (smallest === null || lead < smallest) smallest = lead
  }
  if (!smallest) return lines.join("\n")
  return lines.map(function (l) { return l.slice(smallest) }).join("\n")
}

function formatHtml(text, opts) {
  var o = opts || {}
  o.html = true
  return renderTree(parseMarkup(text, true), o)
}

function formatXml(text, opts) {
  var o = opts || {}
  o.html = false
  return renderTree(parseMarkup(text, false), o)
}

function minifyMarkup(text, opts) {
  var o = opts || {}
  var isHtml = o.html !== false
  var root = parseMarkup(text, isHtml)
  var out = ""

  function walk(node) {
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i]
      if (child.type === "text") {
        var body = collapse(child.text)
        if (/^\s*$/.test(body)) {
          // Keep one space where it separates inline content from text.
          var previous = node.children[i - 1]
          var next = node.children[i + 1]
          var betweenInline = previous && next
            && (previous.type === "text" || (previous.type === "element" && inList(INLINE_ELEMENTS, previous.name)))
            && (next.type === "text" || (next.type === "element" && inList(INLINE_ELEMENTS, next.name)))
          if (betweenInline) out += " "
          continue
        }
        out += body
        continue
      }
      if (child.type === "comment") { if (!o.keepComments) continue; out += child.text; continue }
      if (child.type === "directive" || child.type === "cdata") { out += child.text; continue }
      out += "<" + child.name + child.attrs + (child.selfClosing && !isHtml ? "/>" : ">")
      if (child.raw !== undefined) {
        out += String(child.raw).replace(/^\s+|\s+$/g, "")
        out += "</" + child.name + ">"
        continue
      }
      if (child.selfClosing) continue
      walk(child)
      out += "</" + child.name + ">"
    }
  }
  walk(root)
  return out.replace(/^\s+|\s+$/g, "")
}

// -------------------------------------------------------------------- css

function cssTokens(text) {
  var s = String(text)
  var tokens = []
  var i = 0
  // A chunk is a list of pieces so that string literals stay identifiable —
  // collapsing whitespace must never reach inside content: "a  b".
  var pieces = []

  function flushBuffer() {
    var joined = piecesText(pieces)
    if (joined.replace(/^\s+|\s+$/g, "").length) tokens.push({ type: "chunk", pieces: pieces, text: joined })
    pieces = []
  }

  function addLiteral(text) {
    if (pieces.length && !pieces[pieces.length - 1].isString) pieces[pieces.length - 1].text += text
    else pieces.push({ text: text, isString: false })
  }

  while (i < s.length) {
    var c = s.charAt(i)
    if (c === "/" && s.charAt(i + 1) === "*") {
      flushBuffer()
      var end = s.indexOf("*/", i + 2)
      end = end === -1 ? s.length : end + 2
      tokens.push({ type: "comment", text: s.substring(i, end) })
      i = end
      continue
    }
    if (c === '"' || c === "'") {
      var quoteEnd = i + 1
      while (quoteEnd < s.length) {
        if (s.charAt(quoteEnd) === "\\") { quoteEnd += 2; continue }
        if (s.charAt(quoteEnd) === c) { quoteEnd++; break }
        quoteEnd++
      }
      pieces.push({ text: s.substring(i, quoteEnd), isString: true })
      i = quoteEnd
      continue
    }
    if (c === "{" || c === "}" || c === ";") {
      flushBuffer()
      tokens.push({ type: c, text: c })
      i++
      continue
    }
    addLiteral(c)
    i++
  }
  flushBuffer()
  return tokens
}

function piecesText(pieces) {
  var out = ""
  for (var i = 0; i < pieces.length; i++) out += pieces[i].text
  return out
}

// Applies a whitespace/spacing transform to the non-string pieces only.
function mapPieces(pieces, fn) {
  var out = ""
  for (var i = 0; i < pieces.length; i++) out += pieces[i].isString ? pieces[i].text : fn(pieces[i].text)
  return out
}

function formatCss(text, opts) {
  var o = opts || {}
  var pad = o.tabs ? "\t" : new Array((o.indent === undefined ? 2 : o.indent) + 1).join(" ")
  var tokens = cssTokens(text)
  var out = []
  var depth = 0
  var pending = []

  function indentFor() {
    var s = ""
    for (var i = 0; i < depth; i++) s += pad
    return s
  }

  // Declarations arrive as a chunk followed by a ";" token, and the last one
  // in a block often has neither — so the semicolon is added on flush.
  function flushDeclaration() {
    var body = mapPieces(pending, function (t) { return t.replace(/\s+/g, " ") }).replace(/^\s+|\s+$/g, "")
    pending = []
    if (body.length === 0) return
    out.push(indentFor() + tidyDeclaration(body) + ";")
  }

  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    if (t.type === "comment") {
      flushDeclaration()
      out.push(indentFor() + t.text)
      continue
    }
    if (t.type === "chunk") { pending = pending.concat(t.pieces); continue }
    if (t.type === ";") { flushDeclaration(); continue }
    if (t.type === "{") {
      var selector = mapPieces(pending, function (t) { return t.replace(/\s+/g, " ") }).replace(/^\s+|\s+$/g, "")
      pending = []
      var parts = selector.split(",")
      for (var p = 0; p < parts.length; p++) {
        var one = parts[p].replace(/^\s+|\s+$/g, "")
        if (one.length === 0) continue
        out.push(indentFor() + one + (p < parts.length - 1 ? "," : " {"))
      }
      depth++
      continue
    }
    if (t.type === "}") {
      flushDeclaration()
      depth = Math.max(0, depth - 1)
      out.push(indentFor() + "}")
      // A blank line between top-level rules is what makes a stylesheet
      // skimmable.
      if (depth === 0 && i < tokens.length - 1) out.push("")
      continue
    }
  }
  flushDeclaration()
  return out.join("\n").replace(/\n+$/, "")
}

function tidyDeclaration(body) {
  var colon = body.indexOf(":")
  if (colon === -1) return body
  var property = body.slice(0, colon).replace(/\s+$/, "")
  var value = body.slice(colon + 1).replace(/^\s+/, "")
  return property + ": " + value
}

function minifyCss(text, opts) {
  var o = opts || {}
  var tokens = cssTokens(text)
  var out = ""
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    if (t.type === "comment") { if (o.keepComments) out += t.text; continue }
    if (t.type === "chunk") {
      out += mapPieces(t.pieces, function (text) {
        return text.replace(/\s+/g, " ").replace(/\s*([:,>+~])\s*/g, "$1")
      }).replace(/^\s+|\s+$/g, "")
      continue
    }
    if (t.type === "{") { out = out.replace(/\s+$/, "") + "{"; continue }
    if (t.type === "}") { out = out.replace(/;$/, "") + "}"; continue }
    if (t.type === ";") { out += ";"; continue }
  }
  return out.replace(/;\}/g, "}").replace(/^\s+|\s+$/g, "")
}

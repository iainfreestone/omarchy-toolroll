.pragma library

// SQL formatter. Tokenises first — strings, quoted identifiers, comments, and
// numbers all have to survive intact — then lays the tokens out by clause.
// It is a formatter, not a parser: it never rewrites your query, only its
// whitespace and (optionally) keyword casing.

var TOP_LEVEL = ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "RETURNING", "WITH", "WINDOW",
  "UNION ALL", "UNION", "INTERSECT", "EXCEPT", "FETCH"]

var JOINS = ["LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "RIGHT JOIN",
  "INNER JOIN", "CROSS JOIN", "FULL JOIN", "NATURAL JOIN", "STRAIGHT_JOIN", "JOIN"]

var NEWLINE_BEFORE = ["AND", "OR", "ON", "WHEN", "ELSE"]

var KEYWORDS = ("SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET "
  + "DELETE RETURNING WITH AS ON AND OR NOT IN IS NULL LIKE ILIKE BETWEEN EXISTS CASE WHEN THEN ELSE END "
  + "JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL UNION ALL INTERSECT EXCEPT DISTINCT COUNT SUM AVG MIN MAX "
  + "CREATE TABLE ALTER DROP INDEX VIEW PRIMARY KEY FOREIGN REFERENCES CONSTRAINT UNIQUE DEFAULT "
  + "CASCADE ASC DESC BY TRUE FALSE INT INTEGER TEXT VARCHAR BOOLEAN TIMESTAMP DATE NUMERIC DECIMAL "
  + "OVER PARTITION ROW ROWS RANGE PRECEDING FOLLOWING CURRENT UNBOUNDED FILTER WITHIN GROUPS "
  + "RECURSIVE MATERIALIZED LATERAL USING NULLS FIRST LAST").split(" ")

var KEYWORD_SET = (function () {
  var set = {}
  for (var i = 0; i < KEYWORDS.length; i++) set[KEYWORDS[i]] = true
  return set
})()

function tokenize(sql) {
  var s = String(sql)
  var tokens = []
  var i = 0
  while (i < s.length) {
    var c = s.charAt(i)

    if (/\s/.test(c)) {
      var wsStart = i
      while (i < s.length && /\s/.test(s.charAt(i))) i++
      tokens.push({ type: "space", text: s.substring(wsStart, i) })
      continue
    }
    if (c === "-" && s.charAt(i + 1) === "-") {
      var lineEnd = s.indexOf("\n", i)
      if (lineEnd === -1) lineEnd = s.length
      tokens.push({ type: "comment", text: s.substring(i, lineEnd) })
      i = lineEnd
      continue
    }
    if (c === "/" && s.charAt(i + 1) === "*") {
      var blockEnd = s.indexOf("*/", i + 2)
      blockEnd = blockEnd === -1 ? s.length : blockEnd + 2
      tokens.push({ type: "block-comment", text: s.substring(i, blockEnd) })
      i = blockEnd
      continue
    }
    if (c === "'" || c === '"' || c === "`") {
      var quoteStart = i
      i++
      while (i < s.length) {
        if (s.charAt(i) === "\\") { i += 2; continue }
        if (s.charAt(i) === c) {
          // Doubled quotes are an escaped quote in standard SQL.
          if (s.charAt(i + 1) === c) { i += 2; continue }
          i++
          break
        }
        i++
      }
      tokens.push({ type: c === "'" ? "string" : "quoted", text: s.substring(quoteStart, i) })
      continue
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s.charAt(i + 1)))) {
      var numStart = i
      while (i < s.length && /[0-9.eE]/.test(s.charAt(i))) {
        if ((s.charAt(i) === "e" || s.charAt(i) === "E") && /[-+]/.test(s.charAt(i + 1))) i++
        i++
      }
      tokens.push({ type: "number", text: s.substring(numStart, i) })
      continue
    }
    if (/[A-Za-z_@#$:]/.test(c)) {
      var wordStart = i
      while (i < s.length && /[A-Za-z0-9_@#$.:]/.test(s.charAt(i))) i++
      var word = s.substring(wordStart, i)
      tokens.push({ type: KEYWORD_SET[word.toUpperCase()] ? "keyword" : "word", text: word })
      continue
    }
    if (c === "(" || c === ")") {
      tokens.push({ type: c === "(" ? "open" : "close", text: c })
      i++
      continue
    }
    if (c === ",") { tokens.push({ type: "comma", text: "," }); i++; continue }
    if (c === ";") { tokens.push({ type: "semicolon", text: ";" }); i++; continue }

    var opStart = i
    while (i < s.length && /[-+*/%<>=!|&^~]/.test(s.charAt(i))) i++
    if (i === opStart) i++
    tokens.push({ type: "operator", text: s.substring(opStart, i) })
  }
  return tokens
}

// Multi-word clauses ("GROUP BY", "LEFT OUTER JOIN") are matched against the
// upcoming keyword run so they stay on one line.
function matchPhrase(tokens, index, phrases) {
  var words = []
  var positions = []
  var k = index
  while (k < tokens.length && words.length < 4) {
    if (tokens[k].type === "space") { k++; continue }
    if (tokens[k].type !== "keyword" && tokens[k].type !== "word") break
    words.push(tokens[k].text.toUpperCase())
    positions.push(k)
    k++
  }
  for (var p = 0; p < phrases.length; p++) {
    var parts = phrases[p].split(" ")
    if (parts.length > words.length) continue
    var ok = true
    for (var w = 0; w < parts.length; w++) if (words[w] !== parts[w]) { ok = false; break }
    if (ok) return { phrase: phrases[p], endIndex: positions[parts.length - 1] }
  }
  return null
}

// opts: { indent (spaces), uppercase (bool), compactLists (bool) }
function format(sql, opts) {
  var o = opts || {}
  var indentWidth = o.indent === undefined ? 2 : Number(o.indent)
  var pad = indentWidth === 0 ? "\t" : new Array(indentWidth + 1).join(" ")
  var tokens = tokenize(sql)
  var out = ""
  var depth = 0
  var line = ""
  // True when the previous token was "(" or similar, so the next token must
  // hug it instead of getting the usual separating space.
  var suppressSpace = false
  // One entry per open paren: true when it opened a subquery block, which
  // means its closing paren gets its own line.
  var blockStack = []

  function indentFor(level) {
    var n = Math.max(0, level)
    var s = ""
    for (var i = 0; i < n; i++) s += pad
    return s
  }

  function flush() {
    if (line.replace(/\s+$/, "").length > 0) out += line.replace(/\s+$/, "") + "\n"
    line = ""
  }

  function startLine(level) {
    flush()
    line = indentFor(level)
  }

  function append(text, spaceBefore) {
    var wantsSpace = spaceBefore !== false && !suppressSpace
    if (line.replace(/^\s+/, "").length > 0 && wantsSpace) line += " "
    suppressSpace = false
    line += text
  }

  function caseFor(token) {
    if (!o.uppercase) return token.text
    return token.type === "keyword" ? token.text.toUpperCase() : token.text
  }

  var i = 0
  while (i < tokens.length) {
    var token = tokens[i]

    if (token.type === "space") { i++; continue }

    if (token.type === "comment" || token.type === "block-comment") {
      startLine(depth)
      append(token.text, false)
      flush()
      i++
      continue
    }

    if (token.type === "keyword" || token.type === "word") {
      var top = matchPhrase(tokens, i, TOP_LEVEL)
      if (top && tokens[i].type === "keyword") {
        var isSub = depth > 0
        startLine(isSub ? depth : 0)
        append(o.uppercase ? top.phrase : sliceText(tokens, i, top.endIndex), false)
        i = top.endIndex + 1
        continue
      }
      var join = matchPhrase(tokens, i, JOINS)
      if (join && tokens[i].type === "keyword") {
        startLine(depth)
        append(o.uppercase ? join.phrase : sliceText(tokens, i, join.endIndex), false)
        i = join.endIndex + 1
        continue
      }
      if (token.type === "keyword" && NEWLINE_BEFORE.indexOf(token.text.toUpperCase()) !== -1) {
        startLine(depth + 1)
        append(caseFor(token), false)
        i++
        continue
      }
      append(caseFor(token))
      i++
      continue
    }

    if (token.type === "open") {
      append("(", isFunctionCall(tokens, i) ? false : undefined)
      depth++
      // A parenthesised SELECT is a subquery and gets its own block; a plain
      // value list or function argument stays inline.
      var opensBlock = tokens[i + 1] !== undefined
        && matchPhrase(tokens, i + 1, ["SELECT", "WITH", "VALUES"]) !== null
        && nextMeaningful(tokens, i + 1).type === "keyword"
      blockStack.push(opensBlock)
      if (opensBlock) {
        flush()
        line = indentFor(depth)
      } else {
        suppressSpace = true
      }
      i++
      continue
    }

    if (token.type === "close") {
      var wasBlock = blockStack.pop() === true
      depth = Math.max(0, depth - 1)
      if (wasBlock) {
        flush()
        line = indentFor(depth)
      }
      append(")", false)
      i++
      continue
    }

    if (token.type === "comma") {
      append(",", false)
      if (!o.compactLists && depth === 0) { flush(); line = indentFor(1) }
      i++
      continue
    }

    if (token.type === "semicolon") {
      append(";", false)
      flush()
      out += "\n"
      i++
      continue
    }

    append(token.text, isTightOperator(token.text) ? false : undefined)
    i++
  }
  flush()
  return out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "")
}

function sliceText(tokens, from, to) {
  var parts = []
  for (var i = from; i <= to; i++) if (tokens[i].type !== "space") parts.push(tokens[i].text)
  return parts.join(" ")
}

function nextMeaningful(tokens, from) {
  for (var i = from; i < tokens.length; i++) if (tokens[i].type !== "space") return tokens[i]
  return null
}

function isFunctionCall(tokens, index) {
  for (var i = index - 1; i >= 0; i--) {
    if (tokens[i].type === "space") return false
    return tokens[i].type === "word" || tokens[i].type === "keyword"
  }
  return false
}

function isTightOperator(text) { return text === "." || text === "::" }

function minify(sql) {
  var tokens = tokenize(sql)
  var kept = []
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i]
    if (t.type === "space" || t.type === "comment" || t.type === "block-comment") continue
    kept.push(t)
  }

  // Spacing is decided from token adjacency rather than by collapsing
  // whitespace at the end — a global \s+ squeeze would eat the spaces inside
  // string literals along with everything else.
  var out = ""
  for (var k = 0; k < kept.length; k++) {
    var token = kept[k]
    var previous = kept[k - 1]
    if (previous && needsSpaceBetween(previous, token)) out += " "
    out += token.text
  }
  return out
}

var VALUE_TYPES = { word: true, keyword: true, number: true, string: true, quoted: true }

function needsSpaceBetween(previous, token) {
  if (token.type === "comma" || token.type === "semicolon" || token.type === "close") return false
  if (previous.type === "open") return false
  if (isTightOperator(previous.text) || isTightOperator(token.text)) return false
  if (previous.type === "comma" || previous.type === "semicolon") return true
  if (previous.type === "close" && token.type === "open") return true
  if (VALUE_TYPES[previous.type] && token.type === "open") {
    // "count (x)" reads as a function call losing its name; keep it tight.
    return previous.type !== "word" && previous.type !== "keyword"
  }
  return true
}

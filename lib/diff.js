.pragma library

// Line diff via longest common subsequence. Common prefixes and suffixes are
// trimmed first, which is what keeps the O(n·m) table small for the usual
// case of two nearly-identical files.

function normalizeLine(line, opts) {
  var s = line
  if (opts.ignoreCase) s = s.toLowerCase()
  if (opts.ignoreWhitespace) s = s.replace(/\s+/g, " ").replace(/^ | $/g, "")
  if (opts.ignoreTrailingWhitespace) s = s.replace(/\s+$/, "")
  return s
}

function split(text) {
  return String(text === undefined || text === null ? "" : text).replace(/\r\n?/g, "\n").split("\n")
}

var MAX_CELLS = 4000000

function lcsTable(a, b) {
  var table = []
  for (var i = 0; i <= a.length; i++) {
    var row = new Array(b.length + 1)
    row[b.length] = 0
    table.push(row)
  }
  for (var j = 0; j <= b.length; j++) table[a.length][j] = 0
  for (var x = a.length - 1; x >= 0; x--) {
    for (var y = b.length - 1; y >= 0; y--) {
      table[x][y] = a[x] === b[y] ? table[x + 1][y + 1] + 1 : Math.max(table[x + 1][y], table[x][y + 1])
    }
  }
  return table
}

// rows: { type: "same" | "add" | "remove", text, leftNo, rightNo }
function diffLines(leftText, rightText, options) {
  var opts = options || {}
  var left = split(leftText)
  var right = split(rightText)
  var leftKeys = left.map(function (l) { return normalizeLine(l, opts) })
  var rightKeys = right.map(function (l) { return normalizeLine(l, opts) })

  var rows = []
  var head = 0
  while (head < leftKeys.length && head < rightKeys.length && leftKeys[head] === rightKeys[head]) head++
  var tail = 0
  while (tail < leftKeys.length - head && tail < rightKeys.length - head
         && leftKeys[leftKeys.length - 1 - tail] === rightKeys[rightKeys.length - 1 - tail]) tail++

  for (var h = 0; h < head; h++) rows.push({ type: "same", text: left[h], leftNo: h + 1, rightNo: h + 1 })

  var midLeft = leftKeys.slice(head, leftKeys.length - tail)
  var midRight = rightKeys.slice(head, rightKeys.length - tail)
  var truncated = false

  if ((midLeft.length + 1) * (midRight.length + 1) > MAX_CELLS) {
    // Too big for an exact diff: report the changed block wholesale rather
    // than allocating gigabytes to be precise about it.
    truncated = true
    for (var r = 0; r < midLeft.length; r++)
      rows.push({ type: "remove", text: left[head + r], leftNo: head + r + 1, rightNo: 0 })
    for (var a2 = 0; a2 < midRight.length; a2++)
      rows.push({ type: "add", text: right[head + a2], leftNo: 0, rightNo: head + a2 + 1 })
  } else {
    var table = lcsTable(midLeft, midRight)
    var i = 0, j = 0
    while (i < midLeft.length && j < midRight.length) {
      if (midLeft[i] === midRight[j]) {
        rows.push({ type: "same", text: left[head + i], leftNo: head + i + 1, rightNo: head + j + 1 })
        i++; j++
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        rows.push({ type: "remove", text: left[head + i], leftNo: head + i + 1, rightNo: 0 })
        i++
      } else {
        rows.push({ type: "add", text: right[head + j], leftNo: 0, rightNo: head + j + 1 })
        j++
      }
    }
    while (i < midLeft.length) {
      rows.push({ type: "remove", text: left[head + i], leftNo: head + i + 1, rightNo: 0 })
      i++
    }
    while (j < midRight.length) {
      rows.push({ type: "add", text: right[head + j], leftNo: 0, rightNo: head + j + 1 })
      j++
    }
  }

  for (var t = 0; t < tail; t++) {
    var li = leftKeys.length - tail + t
    var ri = rightKeys.length - tail + t
    rows.push({ type: "same", text: left[li], leftNo: li + 1, rightNo: ri + 1 })
  }

  var added = 0, removed = 0
  for (var k = 0; k < rows.length; k++) {
    if (rows[k].type === "add") added++
    else if (rows[k].type === "remove") removed++
  }
  return {
    rows: rows,
    added: added,
    removed: removed,
    unchanged: rows.length - added - removed,
    identical: added === 0 && removed === 0,
    truncated: truncated
  }
}

// Unified diff with `context` lines of surrounding context, or every line
// when context is negative.
function unified(result, context, labels) {
  var rows = result.rows
  var ctx = context === undefined ? 3 : context
  var names = labels || { left: "a", right: "b" }
  var keep = []

  if (ctx < 0) {
    for (var k = 0; k < rows.length; k++) keep.push(k)
  } else {
    var mark = {}
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].type === "same") continue
      for (var d = -ctx; d <= ctx; d++) if (rows[i + d]) mark[i + d] = true
    }
    for (var m = 0; m < rows.length; m++) if (mark[m]) keep.push(m)
  }

  var out = ["--- " + names.left, "+++ " + names.right]
  var previous = -2
  for (var n = 0; n < keep.length; n++) {
    var idx = keep[n]
    if (idx !== previous + 1) {
      var row = rows[idx]
      out.push("@@ -" + (row.leftNo || row.rightNo) + " +" + (row.rightNo || row.leftNo) + " @@")
    }
    var prefix = rows[idx].type === "add" ? "+" : (rows[idx].type === "remove" ? "-" : " ")
    out.push(prefix + rows[idx].text)
    previous = idx
  }
  if (out.length === 2) out.push("(files are identical)")
  return out.join("\n")
}

// Character-level diff for a single pair of lines, used to highlight what
// actually changed inside a modified line.
function diffWords(leftText, rightText) {
  var left = String(leftText).split(/(\s+)/)
  var right = String(rightText).split(/(\s+)/)
  if ((left.length + 1) * (right.length + 1) > MAX_CELLS) return null
  var table = lcsTable(left, right)
  var out = []
  var i = 0, j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { out.push({ type: "same", text: left[i] }); i++; j++ }
    else if (table[i + 1][j] >= table[i][j + 1]) { out.push({ type: "remove", text: left[i] }); i++ }
    else { out.push({ type: "add", text: right[j] }); j++ }
  }
  while (i < left.length) { out.push({ type: "remove", text: left[i] }); i++ }
  while (j < right.length) { out.push({ type: "add", text: right[j] }); j++ }
  return out
}

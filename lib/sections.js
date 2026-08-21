.pragma library

// Section order and collapsed state for the sidebar.
//
// The list is one flat array of rows, and the ListView derives its headings
// from each row's `category`. That means the order sections appear in *is* the
// order their rows appear in, and hiding a section means removing its rows —
// so both features live here, as list transforms, rather than as view state.
//
// Two rules shape everything below:
//
//   A section you have never seen must still appear. A saved order is a list
//   of names captured at some past version; add a tool in a new category and
//   that category is absent from it. Anything unknown keeps its natural
//   position relative to what surrounds it rather than being dropped or
//   silently shunted to the end.
//
//   A collapsed section must keep its heading. It is the only thing left to
//   click to get the section back, so collapsing removes a section's rows but
//   leaves one placeholder behind to carry the heading. Callers skip
//   placeholders when moving the selection.

// Sections whose position is structural rather than a preference. Search
// results have no headings at all, and these two are the answer to "what was I
// just doing" — a question that is only useful at the top.
var UNMOVABLE = ["Chains", "Pinned & recent", "Recent"]

function isMovable(name) {
  return UNMOVABLE.indexOf(String(name)) === -1
}

// The section names present in a set of rows, in the order they occur.
function names(rows) {
  var out = []
  for (var i = 0; i < (rows || []).length; i++) {
    var name = rows[i].category
    if (name !== undefined && out.indexOf(name) === -1) out.push(name)
  }
  return out
}

function rowsFor(rows, name) {
  var out = []
  for (var i = 0; i < (rows || []).length; i++)
    if (rows[i].category === name) out.push(rows[i])
  return out
}

// Reorders rows so their sections follow `savedOrder`. Sections missing from
// the saved order keep their natural position: the result is the saved order
// with unknown sections spliced back in where they were found.
function applyOrder(rows, savedOrder) {
  var present = names(rows)
  var saved = savedOrder || []
  if (saved.length === 0) return (rows || []).slice(0)

  // Unmovable sections keep their natural position whatever the saved order
  // says, so a stale file cannot bury the chain list halfway down.
  var fixed = []
  var movable = []
  var i
  for (i = 0; i < present.length; i++)
    (isMovable(present[i]) ? movable : fixed).push(present[i])

  var ordered = []
  for (i = 0; i < saved.length; i++)
    if (movable.indexOf(saved[i]) !== -1 && ordered.indexOf(saved[i]) === -1)
      ordered.push(saved[i])
  // Whatever the saved order did not mention, in the order it naturally fell.
  for (i = 0; i < movable.length; i++)
    if (ordered.indexOf(movable[i]) === -1) ordered.push(movable[i])

  var final = fixed.concat(ordered)
  var out = []
  for (i = 0; i < final.length; i++) out = out.concat(rowsFor(rows, final[i]))
  return out
}

// Moving a section is expressed against what is actually on screen, then
// stored as a full order, so the file always describes a complete arrangement
// rather than a diff nobody could read.
function move(savedOrder, rows, name, delta) {
  if (!isMovable(name)) return (savedOrder || []).slice(0)
  var current = names(applyOrder(rows, savedOrder)).filter(isMovable)
  var at = current.indexOf(String(name))
  if (at === -1) return current
  var to = at + delta
  if (to < 0 || to >= current.length) return current
  var out = current.slice(0)
  out.splice(at, 1)
  out.splice(to, 0, String(name))
  return out
}

function canMove(savedOrder, rows, name, delta) {
  if (!isMovable(name)) return false
  var current = names(applyOrder(rows, savedOrder)).filter(isMovable)
  var at = current.indexOf(String(name))
  if (at === -1) return false
  var to = at + delta
  return to >= 0 && to < current.length
}

// ----------------------------------------------------------------- collapse

function isCollapsed(collapsed, name) {
  return (collapsed || []).indexOf(String(name)) !== -1
}

function toggleCollapsed(collapsed, name) {
  var out = (collapsed || []).slice(0)
  var at = out.indexOf(String(name))
  if (at === -1) out.push(String(name))
  else out.splice(at, 1)
  return out
}

// Replaces a collapsed section's rows with a single placeholder, which exists
// only so the ListView still draws the heading. It carries the count, because
// "Text & data" with nothing under it should still say how much is in there.
function applyCollapse(rows, collapsed) {
  var out = []
  var seen = {}
  for (var i = 0; i < (rows || []).length; i++) {
    var row = rows[i]
    var name = row.category
    if (!isCollapsed(collapsed, name)) { out.push(row); continue }
    if (seen[name]) continue
    seen[name] = true
    // Carries the same keys a real row does. The delegate binds `name` and
    // `icon` into string properties whether or not it draws them, and Qt
    // complains — correctly — about assigning undefined to a QString.
    out.push({ id: "section-placeholder:" + name, category: name, name: "", icon: "",
               placeholder: true, hiddenCount: rowsFor(rows, name).length })
  }
  return out
}

function isPlaceholder(row) {
  return !!row && row.placeholder === true
}

// How many real rows a collapsed section is hiding, for its heading.
function hiddenCount(rows, name) {
  var found = rowsFor(rows, name)
  for (var i = 0; i < found.length; i++)
    if (isPlaceholder(found[i])) return found[i].hiddenCount
  return 0
}

// Everything the sidebar needs, in one pass, in the right order.
function arrange(rows, savedOrder, collapsed) {
  return applyCollapse(applyOrder(rows, savedOrder), collapsed)
}

.pragma library
.import "catalog.js" as Catalog

// The block of tools that sits above the catalogue.
//
// Recent alone churns, and not all of that churn is yours: clipboard detection
// seeds an input and runs it, so a tool you never chose can take one of five
// slots. Pinning is the fix — a pinned tool sorts first and never ages out —
// and it lives in the same block rather than a section of its own, because a
// second heading above the tools would be more chrome for the same job.

var DEFAULT_LIMIT = 5

function isPinned(pinnedIds, toolId) {
  return (pinnedIds || []).indexOf(String(toolId)) !== -1
}

// Chains are already permanent at the top of the list, so they have nothing to
// gain from a pin; anything the catalogue doesn't know about can't be one.
function canPin(toolId) {
  var id = String(toolId)
  if (id.indexOf("chain:") === 0) return false
  return Catalog.byId(id) !== null
}

function togglePin(pinnedIds, toolId) {
  var id = String(toolId)
  if (!canPin(id)) return (pinnedIds || []).slice(0)
  var list = pinnedIds || []
  if (isPinned(list, id)) {
    var out = []
    for (var i = 0; i < list.length; i++) if (list[i] !== id) out.push(list[i])
    return out
  }
  // Appended, so pins keep the order you made them in — a pinned tool that
  // never moves is the entire point.
  return list.concat([id])
}

// Records use, most recent first. Keyed off a tool having actually run
// something, not off being selected: arrowing down the list selects each tool
// on the way past, and that would fill this with things you only skimmed.
function note(recentIds, entryId, limit) {
  var id = String(entryId)
  var list = recentIds || []
  if (id.length === 0 || id.indexOf("chain:") === 0) return list.slice(0)
  if (list.length > 0 && list[0] === id) return list.slice(0)

  var cap = limit || DEFAULT_LIMIT
  var out = [id]
  // Keep a little more than is shown, so unpinning something reveals the
  // entries it had been sitting on top of rather than an empty gap.
  var keep = cap * 3
  for (var i = 0; i < list.length && out.length < keep; i++)
    if (list[i] !== id) out.push(list[i])
  return out
}

function label(pinnedIds) {
  return (pinnedIds || []).length > 0 ? "Pinned & recent" : "Recent"
}

// [{ id, name, icon, category, pinned, inRecents }] — pinned first in pin
// order, then
// recents by recency. The cap applies only to the unpinned ones, so pinning a
// tool never costs you a recent slot.
function block(pinnedIds, recentIds, limit) {
  var heading = label(pinnedIds)
  var cap = limit || DEFAULT_LIMIT
  var out = []
  var taken = {}
  var i, tool

  var pins = pinnedIds || []
  for (i = 0; i < pins.length; i++) {
    tool = Catalog.byId(pins[i])
    if (!tool || taken[tool.id]) continue
    taken[tool.id] = true
    out.push({ id: tool.id, name: tool.name, icon: tool.icon, category: heading,
               pinned: true, inRecents: true })
  }

  var recents = recentIds || []
  var shown = 0
  for (i = 0; i < recents.length && shown < cap; i++) {
    tool = Catalog.byId(recents[i])
    if (!tool || taken[tool.id]) continue
    taken[tool.id] = true
    shown++
    out.push({ id: tool.id, name: tool.name, icon: tool.icon, category: heading,
               pinned: false, inRecents: true })
  }
  return out
}

// Ids the block covers, so the caller can drop them from their categories —
// one row per tool keeps arrow-key navigation unambiguous.
function hoisted(pinnedIds, recentIds, limit) {
  var rows = block(pinnedIds, recentIds, limit)
  var out = {}
  for (var i = 0; i < rows.length; i++) out[rows[i].id] = true
  return out
}

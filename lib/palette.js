.pragma library

// The theme's own named colours.
//
// The shell's Color singleton reads colors.toml but keeps only five roles —
// foreground, background, accent, muted, and urgent (from `red`) — so green,
// cyan, orange and the rest are parsed and discarded. Every stock theme
// declares them, and using the theme's own hues is the only way to add colour
// that cannot clash with the theme it sits in.
//
// Nothing here invents a colour. If a theme omits one, the caller's fallback
// (the accent) is used, which is exactly how the plugin looked before.

var NAMED = ["red", "green", "yellow", "blue", "cyan", "magenta", "orange", "brown",
             "accent", "foreground", "background", "muted"]

function parse(text) {
  var out = {}
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    // Same shape the shell's own parser accepts: key = "#rrggbb", quoted or not.
    var match = lines[i].match(/^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/)
    if (!match) continue
    var key = match[1]
    if (NAMED.indexOf(key) === -1) continue
    if (out[key] === undefined) out[key] = match[2]   // first wins, as the shell does
  }
  return out
}

// Which hue introduces each section of the tool list. Red is deliberately
// absent: it means "something went wrong" everywhere else in the plugin, and a
// category that permanently looks like an error would be a poor joke.
var CATEGORY_HUES = {
  "Chains": "magenta",
  "Pinned & recent": "accent",
  "Recent": "accent",
  "Session": "muted",
  "Encode & decode": "blue",
  "Format & validate": "green",
  "Text & data": "cyan",
  "Time & web": "orange",
  "Generators": "yellow"
}

function categoryColor(palette, category, fallback) {
  var hue = CATEGORY_HUES[String(category)]
  if (!hue) return fallback
  var found = palette ? palette[hue] : null
  return found ? found : fallback
}

// Named lookup with a fallback, for the places that want one specific hue —
// a diff wants green for an addition whatever the theme, or nothing at all.
function color(palette, name, fallback) {
  var found = palette ? palette[String(name)] : null
  return found ? found : fallback
}

function has(palette, name) {
  return palette ? palette[String(name)] !== undefined : false
}

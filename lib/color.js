.pragma library

// Color parsing and conversion. Accepts what people actually paste: #rgb,
// #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla(), hsv()/hsb(), bare hex, and
// CSS named colors.

var NAMED = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4",
  azure: "f0ffff", beige: "f5f5dc", bisque: "ffe4c4", black: "000000",
  blanchedalmond: "ffebcd", blue: "0000ff", blueviolet: "8a2be2", brown: "a52a2a",
  burlywood: "deb887", cadetblue: "5f9ea0", chartreuse: "7fff00", chocolate: "d2691e",
  coral: "ff7f50", cornflowerblue: "6495ed", cornsilk: "fff8dc", crimson: "dc143c",
  cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b", darkgoldenrod: "b8860b",
  darkgray: "a9a9a9", darkgreen: "006400", darkgrey: "a9a9a9", darkkhaki: "bdb76b",
  darkmagenta: "8b008b", darkolivegreen: "556b2f", darkorange: "ff8c00",
  darkorchid: "9932cc", darkred: "8b0000", darksalmon: "e9967a", darkseagreen: "8fbc8f",
  darkslateblue: "483d8b", darkslategray: "2f4f4f", darkturquoise: "00ced1",
  darkviolet: "9400d3", deeppink: "ff1493", deepskyblue: "00bfff", dimgray: "696969",
  dodgerblue: "1e90ff", firebrick: "b22222", floralwhite: "fffaf0", forestgreen: "228b22",
  fuchsia: "ff00ff", gainsboro: "dcdcdc", ghostwhite: "f8f8ff", gold: "ffd700",
  goldenrod: "daa520", gray: "808080", green: "008000", greenyellow: "adff2f",
  grey: "808080", honeydew: "f0fff0", hotpink: "ff69b4", indianred: "cd5c5c",
  indigo: "4b0082", ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa",
  lawngreen: "7cfc00", lightblue: "add8e6", lightcoral: "f08080", lightcyan: "e0ffff",
  lightgray: "d3d3d3", lightgreen: "90ee90", lightgrey: "d3d3d3", lightpink: "ffb6c1",
  lightsalmon: "ffa07a", lightseagreen: "20b2aa", lightskyblue: "87cefa",
  lightslategray: "778899", lightsteelblue: "b0c4de", lightyellow: "ffffe0",
  lime: "00ff00", limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff",
  maroon: "800000", mediumaquamarine: "66cdaa", mediumblue: "0000cd",
  mediumorchid: "ba55d3", mediumpurple: "9370db", mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee", mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc",
  mediumvioletred: "c71585", midnightblue: "191970", mintcream: "f5fffa",
  mistyrose: "ffe4e1", moccasin: "ffe4b5", navajowhite: "ffdead", navy: "000080",
  oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23", orange: "ffa500",
  orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98",
  paleturquoise: "afeeee", palevioletred: "db7093", papayawhip: "ffefd5",
  peachpuff: "ffdab9", peru: "cd853f", pink: "ffc0cb", plum: "dda0dd",
  powderblue: "b0e0e6", purple: "800080", rebeccapurple: "663399", red: "ff0000",
  rosybrown: "bc8f8f", royalblue: "4169e1", saddlebrown: "8b4513", salmon: "fa8072",
  sandybrown: "f4a460", seagreen: "2e8b57", seashell: "fff5ee", sienna: "a0522d",
  silver: "c0c0c0", skyblue: "87ceeb", slateblue: "6a5acd", slategray: "708090",
  snow: "fffafa", springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c",
  teal: "008080", thistle: "d8bfd8", tomato: "ff6347", turquoise: "40e0d0",
  violet: "ee82ee", wheat: "f5deb3", white: "ffffff", whitesmoke: "f5f5f5",
  yellow: "ffff00", yellowgreen: "9acd32", transparent: "00000000"
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function round(v, places) {
  var m = Math.pow(10, places === undefined ? 0 : places)
  return Math.round(v * m) / m
}

// Returns { r, g, b, a } with r/g/b in 0..255 and a in 0..1.
function parse(text) {
  var s = String(text || "").replace(/^\s+|\s+$/g, "").toLowerCase()
  if (s.length === 0) throw new Error("enter a color")

  if (NAMED[s] !== undefined) s = "#" + NAMED[s]

  var hex = s.charAt(0) === "#" ? s.slice(1) : (/^[0-9a-f]{3,8}$/.test(s) ? s : null)
  if (hex !== null) {
    if (hex.length === 3 || hex.length === 4) {
      var expanded = ""
      for (var i = 0; i < hex.length; i++) expanded += hex.charAt(i) + hex.charAt(i)
      hex = expanded
    }
    if (hex.length !== 6 && hex.length !== 8) throw new Error("hex colors need 3, 4, 6, or 8 digits")
    if (!/^[0-9a-f]+$/.test(hex)) throw new Error("“" + s + "” is not a valid hex color")
    return {
      r: parseInt(hex.substr(0, 2), 16),
      g: parseInt(hex.substr(2, 2), 16),
      b: parseInt(hex.substr(4, 2), 16),
      a: hex.length === 8 ? parseInt(hex.substr(6, 2), 16) / 255 : 1
    }
  }

  var fn = s.match(/^(rgba?|hsla?|hsva?|hsba?)\s*\(([^)]*)\)$/)
  if (!fn) throw new Error("“" + text + "” is not a color I recognise")
  var kind = fn[1]
  var parts = fn[2].split(/[\s,\/]+/).filter(function (p) { return p.length > 0 })
  if (parts.length < 3) throw new Error(kind + "() needs at least three values")

  function channel(raw, scale) {
    var p = String(raw)
    if (p.indexOf("%") !== -1) return clamp(parseFloat(p) / 100 * scale, 0, scale)
    return clamp(parseFloat(p), 0, scale)
  }
  function alphaOf(raw) {
    if (raw === undefined) return 1
    var p = String(raw)
    return clamp(p.indexOf("%") !== -1 ? parseFloat(p) / 100 : parseFloat(p), 0, 1)
  }

  if (kind.charAt(0) === "r") {
    return {
      r: Math.round(channel(parts[0], 255)),
      g: Math.round(channel(parts[1], 255)),
      b: Math.round(channel(parts[2], 255)),
      a: alphaOf(parts[3])
    }
  }
  var h = ((parseFloat(parts[0]) % 360) + 360) % 360
  var sat = clamp(parseFloat(parts[1]) / 100, 0, 1)
  var third = clamp(parseFloat(parts[2]) / 100, 0, 1)
  var rgb = kind.charAt(1) === "s" && kind.charAt(2) === "l"
    ? hslToRgb(h, sat, third)
    : hsvToRgb(h, sat, third)
  rgb.a = alphaOf(parts[3])
  return rgb
}

function hslToRgb(h, s, l) {
  var c = (1 - Math.abs(2 * l - 1)) * s
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  var m = l - c / 2
  return fromSector(h, c, x, m)
}

function hsvToRgb(h, s, v) {
  var c = v * s
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  var m = v - c
  return fromSector(h, c, x, m)
}

function fromSector(h, c, x, m) {
  var r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a: 1 }
}

function toHsl(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b)
  var l = (max + min) / 2
  var d = max - min
  var h = 0, s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1) }
}

function toHsv(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b)
  var d = max - min
  var h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0))
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: round(h, 1), s: round((max === 0 ? 0 : d / max) * 100, 1), v: round(max * 100, 1) }
}

function toCmyk(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255
  var k = 1 - Math.max(r, g, b)
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 }
  return {
    c: round(((1 - r - k) / (1 - k)) * 100, 1),
    m: round(((1 - g - k) / (1 - k)) * 100, 1),
    y: round(((1 - b - k) / (1 - k)) * 100, 1),
    k: round(k * 100, 1)
  }
}

function hex2(n) {
  var h = Math.round(clamp(n, 0, 255)).toString(16)
  return h.length < 2 ? "0" + h : h
}

function toHex(c, withAlpha, upper) {
  var out = "#" + hex2(c.r) + hex2(c.g) + hex2(c.b) + (withAlpha ? hex2(c.a * 255) : "")
  return upper ? out.toUpperCase() : out
}

// WCAG relative luminance and contrast ratio — the numbers you actually need
// when picking a foreground for a background.
function luminance(c) {
  function channel(v) {
    var x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
}

function contrast(a, b) {
  var la = luminance(a), lb = luminance(b)
  var hi = Math.max(la, lb), lo = Math.min(la, lb)
  return round((hi + 0.05) / (lo + 0.05), 2)
}

function nearestNamed(c) {
  var best = null
  var bestDistance = Infinity
  for (var name in NAMED) {
    var hex = NAMED[name]
    if (hex.length !== 6) continue
    var dr = c.r - parseInt(hex.substr(0, 2), 16)
    var dg = c.g - parseInt(hex.substr(2, 2), 16)
    var db = c.b - parseInt(hex.substr(4, 2), 16)
    var distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) { bestDistance = distance; best = name }
  }
  return { name: best, exact: bestDistance === 0 }
}

function describe(text) {
  var c = parse(text)
  var hsl = toHsl(c)
  var hsv = toHsv(c)
  var cmyk = toCmyk(c)
  var named = nearestNamed(c)
  var white = { r: 255, g: 255, b: 255, a: 1 }
  var black = { r: 0, g: 0, b: 0, a: 1 }
  return {
    rgb: c,
    hex: toHex(c, false, false),
    hexUpper: toHex(c, false, true),
    hex8: toHex(c, true, false),
    rgbString: "rgb(" + c.r + ", " + c.g + ", " + c.b + ")",
    rgbaString: "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + round(c.a, 3) + ")",
    hslString: "hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)",
    hslaString: "hsla(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%, " + round(c.a, 3) + ")",
    hsvString: "hsv(" + hsv.h + ", " + hsv.s + "%, " + hsv.v + "%)",
    cmykString: "cmyk(" + cmyk.c + "%, " + cmyk.m + "%, " + cmyk.y + "%, " + cmyk.k + "%)",
    luminance: round(luminance(c), 4),
    contrastWhite: contrast(c, white),
    contrastBlack: contrast(c, black),
    nearestName: named.name,
    isNamedExactly: named.exact
  }
}

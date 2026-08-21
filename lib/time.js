.pragma library

// Timestamp parsing and formatting. Formatting is done by hand rather than
// through toLocaleString so the output is identical on every machine and
// stays copy-pasteable.

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad(n, width) {
  var s = String(Math.abs(n))
  while (s.length < (width || 2)) s = "0" + s
  return (n < 0 ? "-" : "") + s
}

// Epoch values arrive in seconds, milliseconds, microseconds, or nanoseconds
// and nothing labels which. Digit count is the only usable signal: anything
// past ~2001 in seconds is 10 digits, so the thresholds below hold until the
// year 2286.
function detectEpochUnit(digits) {
  if (digits <= 11) return { unit: "seconds", factor: 1000 }
  if (digits <= 14) return { unit: "milliseconds", factor: 1 }
  if (digits <= 17) return { unit: "microseconds", factor: 1 / 1000 }
  return { unit: "nanoseconds", factor: 1 / 1000000 }
}

// Returns { date, source, unit } or throws.
function parse(text) {
  var s = String(text || "").replace(/^\s+|\s+$/g, "")
  if (s.length === 0 || s.toLowerCase() === "now") return { date: new Date(), source: "now", unit: "" }

  if (/^-?[0-9]+(\.[0-9]+)?$/.test(s)) {
    var digits = s.replace(/[-.]/g, "").length
    var detected = detectEpochUnit(digits)
    var ms = Number(s) * detected.factor
    if (!isFinite(ms)) throw new Error("that number is out of range")
    var d = new Date(Math.round(ms))
    if (isNaN(d.getTime())) throw new Error("that number is not a valid timestamp")
    return { date: d, source: "epoch", unit: detected.unit }
  }

  var parsed = new Date(s)
  if (isNaN(parsed.getTime())) {
    // "2024-01-15 10:30:00" is extremely common and not all engines take it.
    var normalized = s.replace(" ", "T")
    parsed = new Date(normalized)
    if (isNaN(parsed.getTime())) throw new Error("“" + text + "” is not a timestamp I recognise")
  }
  return { date: parsed, source: "date-string", unit: "" }
}

function offsetString(date) {
  var minutes = -date.getTimezoneOffset()
  var sign = minutes < 0 ? "-" : "+"
  var abs = Math.abs(minutes)
  return sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60)
}

function isoLocal(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
    + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds())
    + offsetString(date)
}

function humanLocal(date) {
  return DAYS[date.getDay()] + ", " + date.getDate() + " " + MONTHS[date.getMonth()] + " "
    + date.getFullYear() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":"
    + pad(date.getSeconds())
}

function humanUtc(date) {
  return DAYS[date.getUTCDay()] + ", " + date.getUTCDate() + " " + MONTHS[date.getUTCMonth()] + " "
    + date.getUTCFullYear() + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":"
    + pad(date.getUTCSeconds()) + " UTC"
}

function rfc2822(date) {
  return DAYS[date.getDay()].substr(0, 3) + ", " + pad(date.getDate()) + " " + MONTHS[date.getMonth()]
    + " " + date.getFullYear() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":"
    + pad(date.getSeconds()) + " " + offsetString(date).replace(":", "")
}

function relative(date, from) {
  var now = from || new Date()
  var deltaSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
  var future = deltaSeconds > 0
  var abs = Math.abs(deltaSeconds)
  var units = [
    [31536000, "year"], [2592000, "month"], [604800, "week"],
    [86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]
  ]
  if (abs < 5) return "just now"
  for (var i = 0; i < units.length; i++) {
    if (abs >= units[i][0]) {
      var count = Math.floor(abs / units[i][0])
      var label = count + " " + units[i][1] + (count === 1 ? "" : "s")
      return future ? "in " + label : label + " ago"
    }
  }
  return "just now"
}

// ISO 8601 week number (weeks start Monday, week 1 holds the first Thursday).
function isoWeek(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  var day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() }
}

function dayOfYear(date) {
  var start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date - start) / 86400000)
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function describe(text, now) {
  var parsed = parse(text)
  var d = parsed.date
  var week = isoWeek(d)
  return {
    source: parsed.source,
    detectedUnit: parsed.unit,
    epochSeconds: Math.floor(d.getTime() / 1000),
    epochMillis: d.getTime(),
    iso: d.toISOString(),
    isoLocal: isoLocal(d),
    local: humanLocal(d),
    utc: humanUtc(d),
    rfc2822: rfc2822(d),
    relative: relative(d, now),
    dayOfWeek: DAYS[d.getDay()],
    dayOfYear: dayOfYear(d),
    isoWeek: week.year + "-W" + pad(week.week),
    quarter: "Q" + (Math.floor(d.getMonth() / 3) + 1),
    timezoneOffset: offsetString(d),
    leapYear: isLeapYear(d.getFullYear())
  }
}

function fromParts(parts) {
  var d = new Date(parts.year, (parts.month || 1) - 1, parts.day || 1,
    parts.hour || 0, parts.minute || 0, parts.second || 0)
  return d
}

function durationBreakdown(seconds) {
  var total = Math.floor(Math.abs(Number(seconds) || 0))
  var out = []
  var units = [[86400, "d"], [3600, "h"], [60, "m"], [1, "s"]]
  for (var i = 0; i < units.length; i++) {
    var n = Math.floor(total / units[i][0])
    total -= n * units[i][0]
    if (n > 0 || (out.length === 0 && i === units.length - 1)) out.push(n + units[i][1])
  }
  return out.join(" ")
}

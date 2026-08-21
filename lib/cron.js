.pragma library

// Cron expression parser: 5-field (standard), 6-field (leading seconds, the
// Quartz/systemd-timer style), the @-shorthands, and the step/range/list
// syntax. Produces both an English description and the next fire times, which
// together answer the only two questions anyone has about a cron line.

var MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
var DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
var DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTH_FULL = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"]

var SHORTHANDS = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *"
}

function fieldSpec(name, min, max, names) {
  return { name: name, min: min, max: max, names: names || null }
}

var FIELDS_5 = [
  fieldSpec("minute", 0, 59),
  fieldSpec("hour", 0, 23),
  fieldSpec("day of month", 1, 31),
  fieldSpec("month", 1, 12, MONTH_NAMES),
  fieldSpec("day of week", 0, 6, DAY_NAMES)
]

var FIELDS_6 = [fieldSpec("second", 0, 59)].concat(FIELDS_5)

function parseField(raw, spec) {
  var text = String(raw).replace(/^\s+|\s+$/g, "")
  if (text.length === 0) throw new Error("empty " + spec.name + " field")
  var values = {}
  var parts = text.split(",")

  function nameToNumber(token) {
    var t = String(token).toUpperCase()
    if (spec.names) {
      var idx = spec.names.indexOf(t.substr(0, 3))
      if (idx !== -1) return idx + spec.min
    }
    if (!/^-?[0-9]+$/.test(t)) throw new Error("“" + token + "” is not valid in the " + spec.name + " field")
    return parseInt(t, 10)
  }

  for (var p = 0; p < parts.length; p++) {
    var part = parts[p]
    var step = 1
    var slash = part.indexOf("/")
    if (slash !== -1) {
      step = parseInt(part.slice(slash + 1), 10)
      if (!isFinite(step) || step < 1) throw new Error("step must be a positive number in the " + spec.name + " field")
      part = part.slice(0, slash)
    }

    var from, to
    if (part === "*" || part === "?") {
      from = spec.min
      to = spec.max
    } else if (part.indexOf("-") > 0) {
      var bounds = part.split("-")
      from = nameToNumber(bounds[0])
      to = nameToNumber(bounds[1])
    } else {
      from = nameToNumber(part)
      to = slash !== -1 ? spec.max : from
    }

    // Sunday is both 0 and 7 in every cron implementation worth supporting.
    if (spec.name === "day of week") {
      if (from === 7) from = 0
      if (to === 7) to = 0
      if (to < from) to = 6
    }
    if (from < spec.min || to > spec.max || to < from)
      throw new Error(spec.name + " must be between " + spec.min + " and " + spec.max)

    for (var v = from; v <= to; v += step) values[v] = true
  }

  var out = []
  for (var k in values) out.push(Number(k))
  out.sort(function (a, b) { return a - b })
  return { values: out, raw: text, wildcard: text === "*" || text === "?" }
}

function parse(expression) {
  var text = String(expression || "").replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ")
  if (text.length === 0) throw new Error("enter a cron expression")
  if (text.charAt(0) === "@") {
    var mapped = SHORTHANDS[text.toLowerCase()]
    if (text.toLowerCase() === "@reboot") throw new Error("@reboot fires at boot, so it has no schedule")
    if (!mapped) throw new Error("unknown shorthand “" + text + "”")
    text = mapped
  }
  var parts = text.split(" ")
  if (parts.length !== 5 && parts.length !== 6)
    throw new Error("a cron expression needs 5 fields (or 6 with seconds), got " + parts.length)

  var specs = parts.length === 6 ? FIELDS_6 : FIELDS_5
  var fields = {}
  for (var i = 0; i < specs.length; i++) fields[specs[i].name] = parseField(parts[i], specs[i])
  if (parts.length === 5) fields["second"] = { values: [0], raw: "0", wildcard: false }
  fields.__hasSeconds = parts.length === 6
  fields.__normalized = text
  return fields
}

// ------------------------------------------------------------ description

function list(values, formatter) {
  var items = values.map(formatter || function (v) { return String(v) })
  if (items.length === 1) return items[0]
  if (items.length === 2) return items[0] + " and " + items[1]
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1]
}

function isEveryN(field, spec) {
  var raw = field.raw
  var m = raw.match(/^\*\/([0-9]+)$/)
  return m ? Number(m[1]) : null
}

function pad2(n) { return n < 10 ? "0" + n : String(n) }

function describe(fields) {
  var minute = fields["minute"], hour = fields["hour"]
  var dom = fields["day of month"], month = fields["month"], dow = fields["day of week"]
  var second = fields["second"]

  var timePart
  var minuteStep = isEveryN(minute)
  var hourStep = isEveryN(hour)

  if (minute.wildcard && hour.wildcard) {
    timePart = fields.__hasSeconds && !second.wildcard
      ? "every minute at " + list(second.values, function (s) { return s + "s" })
      : "every minute"
  } else if (minuteStep && hour.wildcard) {
    timePart = "every " + minuteStep + " minutes"
  } else if (minute.wildcard) {
    timePart = "every minute past " + list(hour.values, function (h) { return pad2(h) + ":00–" + pad2(h) + ":59" })
  } else if (hour.wildcard) {
    timePart = hourStep
      ? "at minute " + list(minute.values) + " every " + hourStep + " hours"
      : "at minute " + list(minute.values) + " of every hour"
  } else {
    var times = []
    for (var h = 0; h < hour.values.length; h++)
      for (var m = 0; m < minute.values.length; m++)
        times.push(pad2(hour.values[h]) + ":" + pad2(minute.values[m]))
    timePart = times.length > 6 ? times.length + " times a day" : "at " + list(times)
  }

  var dayPart = ""
  if (!dom.wildcard && !dow.wildcard) {
    dayPart = "on day " + list(dom.values) + " of the month and on " + list(dow.values, function (d) { return DAY_FULL[d] })
  } else if (!dom.wildcard) {
    dayPart = "on day " + list(dom.values) + " of the month"
  } else if (!dow.wildcard) {
    dayPart = "on " + list(dow.values, function (d) { return DAY_FULL[d] })
  } else {
    dayPart = "every day"
  }

  var monthPart = month.wildcard ? "" : " in " + list(month.values, function (m) { return MONTH_FULL[m - 1] })

  return (timePart + ", " + dayPart + monthPart).replace(/^./, function (c) { return c.toUpperCase() })
}

// ------------------------------------------------------------- next runs

function matches(fields, date) {
  if (fields["minute"].values.indexOf(date.getMinutes()) === -1) return false
  if (fields["hour"].values.indexOf(date.getHours()) === -1) return false
  if (fields["month"].values.indexOf(date.getMonth() + 1) === -1) return false

  var dom = fields["day of month"], dow = fields["day of week"]
  var domMatch = dom.values.indexOf(date.getDate()) !== -1
  var dowMatch = dow.values.indexOf(date.getDay()) !== -1
  // Vixie cron: when both day fields are restricted, either one matching is
  // enough — a surprising rule that a parser has to get right.
  if (dom.wildcard && dow.wildcard) return true
  if (dom.wildcard) return dowMatch
  if (dow.wildcard) return domMatch
  return domMatch || dowMatch
}

function nextRuns(fields, count, from) {
  var wanted = Math.max(1, Math.min(50, count || 5))
  var cursor = new Date((from || new Date()).getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  var out = []
  // Four years of minutes is enough to prove "29 February on a Monday" style
  // expressions never fire, without spinning forever.
  var limit = 366 * 4 * 24 * 60
  var steps = 0
  while (out.length < wanted && steps < limit) {
    if (matches(fields, cursor)) out.push(new Date(cursor.getTime()))
    cursor.setMinutes(cursor.getMinutes() + 1)
    steps++
  }
  return out
}

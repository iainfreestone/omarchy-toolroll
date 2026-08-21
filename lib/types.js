.pragma library
.import "json.js" as Json
.import "text.js" as Text

// JSON to type declarations.
//
// Two passes: infer a shape from the sample, then print it in a language.
// Keeping those apart is what makes adding a language a printer rather than a
// second inference algorithm.
//
// The inference is honest about what a *sample* can tell you: a field absent
// from some elements of an array becomes optional, a field that is sometimes
// null becomes nullable, and a field that is a string here and a number there
// becomes the language's escape hatch rather than a guess.

// ------------------------------------------------------------------ shapes

function shape(kind, extra) {
  var out = { kind: kind, of: null, fields: [], name: "", nullable: false }
  for (var k in extra) out[k] = extra[k]
  return out
}

function isInteger(n) {
  return isFinite(n) && Math.floor(n) === n && Math.abs(n) < 9007199254740991
}

function infer(value) {
  if (value === null || value === undefined) return shape("null")
  if (typeof value === "boolean") return shape("boolean")
  if (typeof value === "number") return shape(isInteger(value) ? "integer" : "number")
  if (typeof value === "string") return shape("string")

  if (Array.isArray(value)) {
    if (value.length === 0) return shape("array", { of: shape("any") })
    var element = infer(value[0])
    for (var i = 1; i < value.length; i++) element = merge(element, infer(value[i]))
    return shape("array", { of: element })
  }

  var keys = Json.keysOf(value, false)
  var fields = []
  for (var k = 0; k < keys.length; k++)
    fields.push({ name: keys[k], type: infer(value[keys[k]]), optional: false })
  return shape("object", { fields: fields })
}

// Combining two observations of the same position. Order must not matter, so
// every rule here is symmetric.
function merge(a, b) {
  if (a.kind === "null" && b.kind === "null") return shape("null")
  if (a.kind === "null") return nullableOf(b)
  if (b.kind === "null") return nullableOf(a)

  if (a.kind === "any" || b.kind === "any") return shape("any", { nullable: a.nullable || b.nullable })

  // A field seen as 1 and 1.5 is a float, not two different types.
  if ((a.kind === "integer" && b.kind === "number") || (a.kind === "number" && b.kind === "integer"))
    return shape("number", { nullable: a.nullable || b.nullable })

  if (a.kind !== b.kind) return shape("any", { nullable: a.nullable || b.nullable })

  if (a.kind === "array")
    return shape("array", { of: merge(a.of, b.of), nullable: a.nullable || b.nullable })

  if (a.kind === "object") {
    var byName = {}
    var order = []
    var i
    for (i = 0; i < a.fields.length; i++) {
      byName[a.fields[i].name] = { name: a.fields[i].name, type: a.fields[i].type, optional: a.fields[i].optional }
      order.push(a.fields[i].name)
    }
    for (i = 0; i < b.fields.length; i++) {
      var field = b.fields[i]
      var existing = byName[field.name]
      if (!existing) {
        // Present in one sample and not the other: optional by observation.
        byName[field.name] = { name: field.name, type: field.type, optional: true }
        order.push(field.name)
        continue
      }
      existing.type = merge(existing.type, field.type)
      existing.optional = existing.optional || field.optional
    }
    // A field missing from b entirely is optional too.
    var inB = {}
    for (i = 0; i < b.fields.length; i++) inB[b.fields[i].name] = true
    for (i = 0; i < a.fields.length; i++)
      if (!inB[a.fields[i].name]) byName[a.fields[i].name].optional = true

    var merged = []
    for (i = 0; i < order.length; i++) merged.push(byName[order[i]])
    return shape("object", { fields: merged, nullable: a.nullable || b.nullable })
  }

  return shape(a.kind, { nullable: a.nullable || b.nullable })
}

function nullableOf(type) {
  var out = shape(type.kind, { of: type.of, fields: type.fields, name: type.name })
  out.nullable = true
  return out
}

// ------------------------------------------------------------------ naming

// Deliberately naive: strip a trailing plural so `users: [...]` yields `User`.
// Getting English plurals right is not this tool's job, and the name is a
// starting point you are expected to edit.
function singular(word) {
  var w = String(word)
  if (/ies$/i.test(w) && w.length > 4) return w.slice(0, -3) + "y"
  if (/(s|x|z|ch|sh)es$/i.test(w) && w.length > 4) return w.slice(0, -2)
  if (/ss$/i.test(w)) return w
  if (/s$/i.test(w) && w.length > 3) return w.slice(0, -1)
  return w
}

function pascal(text) {
  var words = Text.words(String(text))
  if (words.length === 0) return "Value"
  var out = ""
  for (var i = 0; i < words.length; i++)
    out += words[i].charAt(0).toUpperCase() + words[i].slice(1)
  return /^[0-9]/.test(out) ? "N" + out : out
}

// Walks the shape assigning a name to every object, and collects them in the
// order they should be declared.
function nameObjects(root, rootName) {
  var declared = []
  var taken = {}

  function claim(preferred) {
    var base = pascal(preferred) || "Value"
    if (!taken[base]) { taken[base] = true; return base }
    var n = 2
    while (taken[base + n]) n++
    taken[base + n] = true
    return base + n
  }

  function walk(type, preferred) {
    if (type.kind === "array") { walk(type.of, singular(preferred)); return }
    if (type.kind !== "object") return
    type.name = claim(preferred)
    for (var i = 0; i < type.fields.length; i++)
      walk(type.fields[i].type, type.fields[i].name)
    // Children first so a declaration never references a name defined below it
    // in languages that care.
    declared.push(type)
  }

  walk(root, rootName || "Root")
  return declared
}

// ---------------------------------------------------------------- printers

// Raw identifiers cover every one of these, so the list only needs to be
// complete, not clever.
var RUST_KEYWORDS = ("as break const continue crate else enum extern false fn for if impl in let "
  + "loop match mod move mut pub ref return self static struct super trait true type unsafe use "
  + "where while async await dyn abstract become box do final macro override priv typeof unsized "
  + "virtual yield try").split(" ")

var LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" }
]

function indentOf(width) {
  return width === 0 ? "\t" : new Array((width || 2) + 1).join(" ")
}

function typescript(root, objects, opts) {
  var pad = indentOf(opts.indent)
  function render(type) {
    switch (type.kind) {
      case "string": return "string"
      case "integer": case "number": return "number"
      case "boolean": return "boolean"
      case "null": return "null"
      case "any": return "any"
      case "array": return arrayOf(render(type.of), type.of)
      case "object": return type.name
    }
    return "any"
  }
  function arrayOf(inner, of) {
    // `(string | null)[]` needs the parentheses; `string[]` does not.
    return (of.nullable || of.kind === "any" && false) ? "(" + inner + " | null)[]" : inner + "[]"
  }
  function withNull(text, type) { return type.nullable ? text + " | null" : text }

  var out = []
  for (var i = objects.length - 1; i >= 0; i--) {
    var type = objects[i]
    var lines = [(opts.exported === false ? "" : "export ") + "interface " + type.name + " {"]
    for (var f = 0; f < type.fields.length; f++) {
      var field = type.fields[f]
      var key = /^[A-Za-z_$][\w$]*$/.test(field.name) ? field.name : JSON.stringify(field.name)
      lines.push(pad + key + (field.optional ? "?" : "") + ": " + withNull(render(field.type), field.type) + ";")
    }
    lines.push("}")
    out.push(lines.join("\n"))
  }
  if (root.kind === "array")
    out.push("export type Root = " + withNull(render(root), root) + ";")
  return out.join("\n\n")
}

// Go's naming convention — and every Go linter — wants initialisms in one
// case: ID, not Id; URL, not Url. Generated code that trips the project's
// linter on arrival is not much of a favour. This is golint's own list.
var GO_INITIALISMS = ("acl api ascii cpu css dns eof guid html http https id ip json lhs qps ram "
  + "rhs rpc sla smtp sql ssh tcp tls ttl udp ui uid uuid uri url vm xml xmpp xsrf xss").split(" ")

function goName(name) {
  var words = Text.words(String(name))
  if (words.length === 0) return "Field"
  var out = ""
  for (var i = 0; i < words.length; i++) {
    var lower = words[i].toLowerCase()
    out += GO_INITIALISMS.indexOf(lower) !== -1
      ? lower.toUpperCase()
      : words[i].charAt(0).toUpperCase() + words[i].slice(1)
  }
  return /^[0-9]/.test(out) ? "N" + out : out
}

function golang(root, objects, opts) {
  var pad = indentOf(opts.indent)
  function render(type) {
    var base
    switch (type.kind) {
      case "string": base = "string"; break
      case "integer": base = "int64"; break
      case "number": base = "float64"; break
      case "boolean": base = "bool"; break
      case "null": case "any": return "interface{}"
      case "array": return "[]" + render(type.of)
      case "object": base = goName(type.name); break
      default: return "interface{}"
    }
    // Go has no nullable primitives; a pointer is how you say "may be absent".
    return type.nullable ? "*" + base : base
  }

  var out = []
  for (var i = objects.length - 1; i >= 0; i--) {
    var type = objects[i]
    var lines = ["type " + goName(type.name) + " struct {"]
    for (var f = 0; f < type.fields.length; f++) {
      var field = type.fields[f]
      var rendered = render(field.type)
      if (field.optional && rendered.charAt(0) !== "*" && rendered.indexOf("[]") !== 0
          && rendered !== "interface{}")
        rendered = "*" + rendered
      var tag = "`json:\"" + field.name + (field.optional ? ",omitempty" : "") + "\"`"
      lines.push(pad + goName(field.name) + " " + rendered + " " + tag)
    }
    lines.push("}")
    out.push(lines.join("\n"))
  }
  if (root.kind === "array") out.push("type Root " + render(root))
  return out.join("\n\n")
}

function rust(root, objects, opts) {
  var pad = indentOf(opts.indent)
  function render(type) {
    var base
    switch (type.kind) {
      case "string": base = "String"; break
      case "integer": base = "i64"; break
      case "number": base = "f64"; break
      case "boolean": base = "bool"; break
      case "null": case "any": base = "serde_json::Value"; break
      case "array": base = "Vec<" + render(type.of) + ">"; break
      case "object": base = type.name; break
      default: base = "serde_json::Value"
    }
    return type.nullable ? "Option<" + base + ">" : base
  }
  function snake(name) { return Text.toCase(name, "snake") }

  // A JSON key like `ref`, `type` or `match` is an ordinary field name and a
  // Rust keyword, so it has to be escaped or the output will not compile.
  function escapeKeyword(name) {
    return RUST_KEYWORDS.indexOf(name) === -1 ? name : "r#" + name
  }

  var out = []
  for (var i = objects.length - 1; i >= 0; i--) {
    var type = objects[i]
    var lines = ["#[derive(Debug, Clone, Serialize, Deserialize)]", "pub struct " + type.name + " {"]
    for (var f = 0; f < type.fields.length; f++) {
      var field = type.fields[f]
      var rendered = render(field.type)
      if (field.optional && rendered.indexOf("Option<") !== 0) rendered = "Option<" + rendered + ">"
      var renamed = snake(field.name)
      // serde needs telling whenever the idiomatic Rust name is not the key.
      if (renamed !== field.name) lines.push(pad + '#[serde(rename = "' + field.name + '")]')
      lines.push(pad + "pub " + escapeKeyword(renamed) + ": " + rendered + ",")
    }
    lines.push("}")
    out.push(lines.join("\n"))
  }
  if (root.kind === "array") out.push("pub type Root = " + render(root) + ";")
  return out.join("\n\n")
}

// ------------------------------------------------------------------- entry

function generate(text, options) {
  var opts = options || {}
  var value = Json.parse(text, opts.lenient === true)
  var root = infer(value)
  var objects = nameObjects(root, opts.rootName || "Root")

  if (objects.length === 0 && root.kind !== "array")
    throw new Error("this JSON has no object to describe — a type needs fields")

  var language = String(opts.language || "typescript")
  if (language === "go") return golang(root, objects, opts)
  if (language === "rust") return rust(root, objects, opts)
  return typescript(root, objects, opts)
}

function summarize(text, options) {
  var opts = options || {}
  var value = Json.parse(text, opts.lenient === true)
  var root = infer(value)
  var objects = nameObjects(root, opts.rootName || "Root")
  var optional = 0
  var loose = 0
  for (var i = 0; i < objects.length; i++)
    for (var f = 0; f < objects[i].fields.length; f++) {
      if (objects[i].fields[f].optional) optional++
      if (objects[i].fields[f].type.kind === "any") loose++
    }
  return { types: objects.length, optional: optional, unknown: loose }
}

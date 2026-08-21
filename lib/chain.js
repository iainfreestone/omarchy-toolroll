.pragma library
.import "catalog.js" as Catalog

// Chains: run one tool's output into the next.
//
// This is the thing a single-tool toolbox can't do. Decoding an auth header is
// base64 → JSON format; inspecting a compressed payload is base64 → hash;
// tidying an export is CSV → JSON → format. Doing that by hand means bouncing
// output back into input three times, and doing it *often* means doing that
// every single time.
//
// The whole engine is a fold, because every tool already returns an envelope
// whose `output` is a string — the catalogue was built that way, so composing
// tools costs almost nothing here.

var STORE_VERSION = 1

function makeSlug(text) {
  var slug = String(text || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.length ? slug : "chain"
}

function makeId(name, existingChains) {
  var base = makeSlug(name)
  var taken = {}
  var chains = existingChains || []
  for (var i = 0; i < chains.length; i++) taken[chains[i].id] = true
  if (!taken[base]) return base
  var n = 2
  while (taken[base + "-" + n]) n++
  return base + "-" + n
}

// A step's stored state carries only what the user changed; the tool's
// defaults fill in the rest, so adding an option to a tool doesn't break
// chains saved before it existed.
function normalizeStep(step) {
  var toolId = step && step.toolId ? String(step.toolId) : ""
  var tool = Catalog.byId(toolId)
  var state = Catalog.defaultsFor(tool)
  if (step && step.state) {
    for (var key in step.state) state[key] = step.state[key]
  }
  return { toolId: toolId, state: state }
}

function normalize(chain) {
  var source = chain || {}
  var steps = []
  var rawSteps = source.steps || []
  for (var i = 0; i < rawSteps.length; i++) steps.push(normalizeStep(rawSteps[i]))
  return {
    id: source.id ? String(source.id) : makeSlug(source.name),
    name: source.name ? String(source.name) : "Untitled chain",
    steps: steps
  }
}

// An image tool's text output is its input passed straight through, so putting
// one anywhere but last makes it a no-op. That's a warning rather than an
// error: the rest of the chain still does something useful, and refusing to
// run it would be less help than saying what's wrong.
function producesImage(tool) {
  return tool !== null && tool !== undefined && tool.view === "image"
}

function midChainImageWarning(position, total, toolName) {
  return toolName + " produces an image, so it only does something as the last "
    + "step — here it passes its input through unchanged (step " + position + " of " + total + ")"
}

function validate(chain) {
  var errors = []
  var warnings = []
  var normalized = normalize(chain)
  if (normalized.steps.length === 0) errors.push("a chain needs at least one step")
  for (var i = 0; i < normalized.steps.length; i++) {
    var toolId = normalized.steps[i].toolId
    var tool = Catalog.byId(toolId)
    if (!tool) {
      errors.push("step " + (i + 1) + " refers to an unknown tool: " + (toolId || "(none)"))
      continue
    }
    if (producesImage(tool) && i !== normalized.steps.length - 1)
      warnings.push({ index: i, message: midChainImageWarning(i + 1, normalized.steps.length, tool.name) })
    var blockReason = Catalog.stepBlockReason(tool)
    if (blockReason)
      warnings.push({ index: i, message: tool.name + " cannot run as a chain step — it "
        + blockReason })
  }
  return { ok: errors.length === 0, errors: errors, warnings: warnings }
}

function describe(chain) {
  var normalized = normalize(chain)
  var names = []
  for (var i = 0; i < normalized.steps.length; i++) {
    var tool = Catalog.byId(normalized.steps[i].toolId)
    names.push(tool ? tool.name : "?")
  }
  return names.length ? names.join(" → ") : "empty chain"
}

// A one-line summary of what a step did, for its card in the chain view.
function stepSummary(envelope) {
  if (!envelope.ok) return envelope.error
  if (envelope.info) return envelope.info
  return envelope.output.length + " characters"
}

function passThrough(text) {
  var envelope = Catalog.emptyResult()
  envelope.ok = true
  envelope.output = String(text)
  envelope.info = ""
  return envelope
}

function run(chain, input) {
  var normalized = normalize(chain)
  var current = String(input === undefined || input === null ? "" : input)
  var steps = []
  var failedAt = -1
  var error = ""

  for (var i = 0; i < normalized.steps.length; i++) {
    var step = normalized.steps[i]
    var tool = Catalog.byId(step.toolId)

    if (!tool) {
      failedAt = i
      error = "step " + (i + 1) + " refers to an unknown tool: " + step.toolId
      steps.push({ toolId: step.toolId, name: step.toolId, ok: false, error: error,
                   output: "", info: "", inputLength: current.length, outputLength: 0 })
      break
    }

    // A tool that cannot be a step is not run at all — its input is handed
    // straight to the next step and the card says why. Running it would be
    // worse than useless: History reports success and returns nothing, which
    // empties the chain from that point on without ever looking like a failure.
    var blocked = Catalog.stepBlockReason(tool)
    var envelope = blocked ? passThrough(current) : Catalog.run(tool, current, step.state)
    var record = {
      toolId: step.toolId,
      name: tool.name,
      ok: envelope.ok,
      error: envelope.error,
      output: envelope.output,
      info: envelope.info,
      summary: stepSummary(envelope),
      inputLength: current.length,
      outputLength: envelope.output.length,
      // An image tool's picture is only meaningful as the last step; anywhere
      // else its text output is just its input, so the step is flagged instead
      // of quietly doing nothing.
      imageCommand: envelope.imageCommand,
      // A tool that answers with a command for the host to run — the QR reader,
      // Base64 Image encoding — cannot run inside this fold, which is pure and
      // synchronous. It was quietly passing its input straight through.
      needsHost: blocked !== "" && (tool.id === "qr-read" || tool.id === "base64-image"),
      // Only meaningful for the first step: later steps see an intermediate
      // value, not the text the user can actually see and edit.
      errorIndex: envelope.errorIndex,
      errorLine: envelope.errorLine,
      errorColumn: envelope.errorColumn,
      producesImage: producesImage(tool),
      warning: blocked
        ? tool.name + " cannot run as a chain step — it " + blocked
          + ", so its input passes through unchanged"
        : (producesImage(tool) && i !== normalized.steps.length - 1
           ? midChainImageWarning(i + 1, normalized.steps.length, tool.name) : "")
    }
    steps.push(record)

    if (!envelope.ok) {
      failedAt = i
      error = "step " + (i + 1) + " (" + tool.name + "): " + envelope.error
      break
    }
    current = envelope.output
  }

  var last = steps.length ? steps[steps.length - 1] : null
  var endsInImage = failedAt === -1 && last !== null && last.producesImage === true
    && last.imageCommand !== null

  return {
    ok: failedAt === -1,
    error: error,
    failedAt: failedAt,
    output: failedAt === -1 ? current : "",
    steps: steps,
    // A chain that ends in an image produces a picture, not the text that went
    // into it — the view renders this and the headless path copies the file.
    endsInImage: endsInImage,
    imageCommand: endsInImage ? last.imageCommand : null,
    // Where the output came from when a chain stops early, so the view can
    // still show the partial result rather than going blank.
    partialOutput: current
  }
}

// ------------------------------------------------------------------- store

function parseStore(text) {
  var raw = String(text || "").replace(/^\s+|\s+$/g, "")
  if (raw.length === 0) return []
  var parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    // A hand-edited file with a typo shouldn't lose every chain silently, but
    // there is nothing useful to return either — the caller reports it.
    throw new Error("toolroll-chains.json is not valid JSON: " + e.message)
  }
  if (!parsed || parsed.version !== STORE_VERSION) return []
  var chains = []
  var list = parsed.chains || []
  for (var i = 0; i < list.length; i++) chains.push(normalize(list[i]))
  return chains
}

function serializeStore(chains) {
  var out = []
  var list = chains || []
  for (var i = 0; i < list.length; i++) {
    var chain = normalize(list[i])
    var steps = []
    for (var s = 0; s < chain.steps.length; s++) {
      // Persist only what differs from the tool's defaults, so the file stays
      // readable and survives new options being added to a tool.
      var tool = Catalog.byId(chain.steps[s].toolId)
      var defaults = Catalog.defaultsFor(tool)
      // Secrets are stripped before anything else: a saved chain is a file
      // people share, and a JWT step's HMAC key has no business travelling
      // with it.
      var safe = Catalog.withoutSecrets(tool, chain.steps[s].state)
      var state = {}
      for (var key in safe) {
        if (defaults[key] !== safe[key]) state[key] = safe[key]
      }
      steps.push({ toolId: chain.steps[s].toolId, state: state })
    }
    out.push({ id: chain.id, name: chain.name, steps: steps })
  }
  return JSON.stringify({ version: STORE_VERSION, chains: out }, null, 2) + "\n"
}

function find(chains, id) {
  var list = chains || []
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function upsert(chains, chain) {
  var list = (chains || []).slice(0)
  var normalized = normalize(chain)
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === normalized.id) {
      list[i] = normalized
      return list
    }
  }
  list.push(normalized)
  return list
}

function remove(chains, id) {
  var out = []
  var list = chains || []
  for (var i = 0; i < list.length; i++) if (list[i].id !== id) out.push(list[i])
  return out
}

function moveStep(chain, index, delta) {
  var normalized = normalize(chain)
  var target = index + delta
  if (index < 0 || index >= normalized.steps.length) return normalized
  if (target < 0 || target >= normalized.steps.length) return normalized
  var steps = normalized.steps.slice(0)
  var held = steps[index]
  steps[index] = steps[target]
  steps[target] = held
  normalized.steps = steps
  return normalized
}

function removeStep(chain, index) {
  var normalized = normalize(chain)
  var steps = []
  for (var i = 0; i < normalized.steps.length; i++) if (i !== index) steps.push(normalized.steps[i])
  normalized.steps = steps
  return normalized
}

function addStep(chain, toolId, state) {
  var normalized = normalize(chain)
  normalized.steps = normalized.steps.concat([normalizeStep({ toolId: toolId, state: state })])
  return normalized
}

function setStepState(chain, index, key, value) {
  var normalized = normalize(chain)
  if (index < 0 || index >= normalized.steps.length) return normalized
  var steps = normalized.steps.slice(0)
  var state = {}
  for (var k in steps[index].state) state[k] = steps[index].state[k]
  state[key] = value
  steps[index] = { toolId: steps[index].toolId, state: state }
  normalized.steps = steps
  return normalized
}

// A chain seeded from a tool you are already using. Chains are otherwise only
// found by people who notice the section at the top of the list, and the
// moment anyone actually wants one is right after doing the first step by
// hand — so this is what the tool view's Chain button builds.
function fromTool(toolId, state, existingChains) {
  var tool = Catalog.byId(toolId)
  var name = tool ? tool.name : "New chain"
  return normalize({
    id: makeId(name, existingChains),
    name: name,
    steps: [{ toolId: toolId, state: state || {} }]
  })
}

// Chains people are likely to want on day one, offered when the store is
// empty so the feature isn't an empty list with a plus button.
//
// All three are at least three steps, on purpose. A one- or two-step chain
// teaches the wrong lesson: if a single conversion is all you need, run the
// tool. A chain earns its name at the point where no single tool — here or in
// any of the other converters — gets you from what you have to what you want.
// So each of these is a job with a real shape, and each step in it is load
// bearing: remove one and the chain stops working.
function starterChains() {
  return [
    // Pulling a payload out of a link someone sent you: an OAuth `state`, a
    // signed redirect, a `?data=` blob. It arrives percent-encoded, wrapping
    // base64, wrapping JSON — three layers, three steps, in that order.
    { id: "url-param-json", name: "Encoded URL param \u2192 JSON", steps: [
      { toolId: "url-encode", state: { mode: "decode" } },
      { toolId: "base64", state: { mode: "decode" } },
      { toolId: "json", state: { mode: "format" } }
    ] },

    // Answering "are these two configs actually the same?" — the question
    // reformatting and key reordering make impossible to answer by eye.
    // Through JSON to drop YAML's formatting freedom, minified with keys
    // sorted to drop the rest, then hashed. Same meaning, same digest.
    { id: "config-fingerprint", name: "YAML config fingerprint", steps: [
      { toolId: "json-yaml", state: { mode: "toJson" } },
      { toolId: "json", state: { mode: "minify", sortKeys: true } },
      { toolId: "hash", state: {} }
    ] },

    // The thing everyone does by hand against a wall of log: pull out every
    // match, drop the repeats, sort what's left. The pattern is a starting
    // point — it ships matching email addresses because that is the most
    // recognisable shape to edit away from.
    { id: "unique-matches", name: "Extract unique matches", steps: [
      { toolId: "regex", state: { pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.]+" } },
      { toolId: "lines", state: { mode: "dedupe" } },
      { toolId: "lines", state: { mode: "sort" } }
    ] }
  ]
}

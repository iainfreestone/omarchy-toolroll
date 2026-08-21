import QtQuick
import QtQml.WorkerScript
import "../lib/catalog.js" as Catalog
import "../lib/chain.js" as Chain

// Decides where a run happens.
//
// Everything used to run inline on the shell's UI thread, which meant a big
// paste didn't just stall this overlay — it stalled the bar, the notification
// daemon and the polkit agent, because they all live in the one Quickshell
// process. Anything past a threshold now goes to a WorkerScript thread.
//
// Small inputs deliberately stay inline: the thread hop costs more than the
// work does at that size, and typing has to feel immediate.
QtObject {
  id: root

  // Below this many characters, run inline. 32k is comfortably past the point
  // where any tool here is perceptible, and well short of where one is slow.
  property int inlineLimit: 32768

  // Past this, stop re-running on every keystroke — recomputing a multi-
  // megabyte parse per character would peg a core and queue work faster than
  // it drains. The user asks for it explicitly instead.
  property int manualLimit: 2097152

  readonly property bool busy: root._inFlightId !== 0
  readonly property bool available: worker !== null

  // Milliseconds the last worker run took, for the status line.
  property int lastElapsed: 0

  property int _inFlightId: 0
  property int _nextId: 1
  // At most one run is in flight; a request arriving during one replaces any
  // other waiting request, so a fast typist collapses to the latest keystroke
  // instead of building a backlog.
  property var _queued: null

  signal finished(var envelope)
  signal chainFinished(var outcome)

  function sizeOf(input, state) {
    var total = String(input === undefined || input === null ? "" : input).length
    // The diff tool's second pane lives in state, and it counts.
    if (state && typeof state.right === "string") total += state.right.length
    return total
  }

  function needsExplicitRun(input, state) {
    return sizeOf(input, state) >= root.manualLimit
  }

  function runsInline(input, state) {
    return sizeOf(input, state) < root.inlineLimit
  }

  function run(tool, input, state) {
    if (!tool) return
    // A tool can insist on the worker regardless of size — see regex.
    if (tool.alwaysWorker === true && root.available) {
      submit({ kind: "tool", toolId: tool.id, input: String(input || ""), state: state || {} })
      return
    }
    if (runsInline(input, state) || !root.available) {
      root.lastElapsed = 0
      root.finished(Catalog.run(tool, input, state))
      return
    }
    submit({ kind: "tool", toolId: tool.id, input: String(input || ""), state: state || {} })
  }

  function runChain(chain, input) {
    if (!chain) return
    if (runsInline(input, null) || !root.available) {
      root.lastElapsed = 0
      root.chainFinished(Chain.run(chain, input))
      return
    }
    submit({ kind: "chain", chain: chain, input: String(input || "") })
  }

  function submit(request) {
    if (root._inFlightId !== 0) {
      root._queued = request
      return
    }
    dispatch(request)
  }

  function dispatch(request) {
    request.requestId = root._nextId++
    root._inFlightId = request.requestId
    worker.sendMessage(request)
  }

  function handleReply(message) {
    // A reply for anything but the current request is stale by definition,
    // since only one runs at a time.
    if (message.requestId !== root._inFlightId) return
    root._inFlightId = 0
    root.lastElapsed = message.elapsed

    var next = root._queued
    root._queued = null
    if (next) {
      // Newer input arrived while this was running: the result we just got is
      // already out of date, so start the newer one instead of showing it.
      dispatch(next)
      return
    }
    if (message.kind === "chain") root.chainFinished(message.payload)
    else root.finished(message.payload)
  }

  property WorkerScript worker: WorkerScript {
    source: Qt.resolvedUrl("../lib/worker.js")
    onMessage: function (message) { root.handleReply(message) }
  }
}

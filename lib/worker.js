// Runs on the WorkerScript thread, off the shell's UI thread.
//
// This loads worker-bundle.js rather than importing the individual libs
// because `.import` does not work in a worker's JS engine — the namespaces
// come back undefined, and on a chain as deep as catalog.js it segfaults the
// whole shell. See tools/build-worker-bundle.mjs for the full reasoning.

Qt.include("worker-bundle.js")

function blankEnvelope(message) {
  return { ok: false, error: message, output: "", format: "", info: "",
           fields: [], sections: [], rows: [], imageCommand: null, swatch: "" }
}

// Messages carry a toolId rather than a tool, because a tool object holds
// functions and nothing with a function in it survives the thread boundary.
// The worker looks the tool up in its own copy of the catalogue.
WorkerScript.onMessage = function (message) {
  var started = new Date().getTime()
  var payload

  try {
    if (message.kind === "chain") {
      payload = Chain.run(message.chain, message.input)
    } else {
      var tool = Catalog.byId(message.toolId)
      payload = tool
        ? Catalog.run(tool, message.input, message.state)
        : blankEnvelope("unknown tool: " + message.toolId)
    }
  } catch (e) {
    // Catalog.run already guards each tool, so reaching here means the failure
    // was in the lookup or the envelope itself. Report it rather than letting
    // the worker die silently and leave the UI spinning forever.
    var text = "worker: " + (e && e.message ? e.message : String(e))
    payload = message.kind === "chain"
      ? { ok: false, error: text, failedAt: -1, output: "", steps: [], partialOutput: "" }
      : blankEnvelope(text)
  }

  WorkerScript.sendMessage({
    requestId: message.requestId,
    kind: message.kind || "tool",
    payload: payload,
    elapsed: new Date().getTime() - started
  })
}

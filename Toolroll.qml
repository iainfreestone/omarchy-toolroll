import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "ui"
import "lib/catalog.js" as Catalog
import "lib/detect.js" as Detect
import "lib/chain.js" as Chain
import "lib/history.js" as History
import "lib/recents.js" as Recents
import "lib/sections.js" as Sections
import "lib/palette.js" as Palette
import "lib/generate.js" as Gen

// Toolroll — an offline developer toolbox hosted inside omarchy-shell.
//
// Shape mirrors the other summoned overlays (clipboard, emojis): one
// layer-shell window with exclusive keyboard focus, a centred card, and the
// [menu] theme tokens so it matches whatever theme is active.
Item {
  id: root

  // Injected by the shell's panel loader.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  property bool opened: false
  // false: summoned layer-shell overlay. true: an ordinary window Hyprland
  // manages like any other, for keeping open beside your work.
  property bool detached: false
  property string filterText: ""
  property string selectedEntryId: "json"
  property string statusText: ""

  readonly property string statePath: Quickshell.env("HOME") + "/.local/state/omarchy/toolroll.json"
  // Chains are authored content rather than session scratch, so they live in
  // config where they can be edited by hand, backed up, and shared.
  readonly property string chainsPath: Quickshell.env("HOME") + "/.config/omarchy/toolroll-chains.json"
  // Where image tools read and write. Ours and generated, so the shell
  // indirection used to hand a path to wl-copy carries no user input.
  //
  // The name rotates because Qt will not reload an image whose URL hasn't
  // changed, even with cache disabled — writing a new picture to the same path
  // left the previous one on screen next to a result that no longer described
  // it. A short rotation is enough: only the immediately previous name matters.
  readonly property string imageDir: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp")
  property int imageRevision: 0

  function nextImagePath(kind) {
    root.imageRevision = (root.imageRevision + 1) % 8
    return root.imageDir + "/omarchy-toolroll-" + kind + "-" + root.imageRevision + ".png"
  }

  // Shares the [menu] surface tokens, so a theme that styles the launcher
  // styles this too.
  property color background: Color.menu.background
  property color foreground: Color.menu.text
  property color borderColor: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", borderColor, Math.max(1, Style.space(2)))
  property color scrim: Color.menu.scrim
  property color accent: Color.accent

  // The theme's own named hues, which the shell's Color singleton parses and
  // then discards. Used only to tint category icons and to give a diff its
  // conventional green; everything falls back to the accent without them.
  property var palette: ({})

  function categoryColor(category) {
    return Palette.categoryColor(root.palette, category, root.accent)
  }

  property var chains: []
  property bool chainsSeeded: false

  // Tools you have actually run something through, most recent first. Keyed off
  // use rather than selection, so arrowing down the list — which does select
  // each tool on the way past — doesn't fill this with things you skimmed.
  property var recentIds: []
  // Pinned tools sort first and never age out — Recent alone churns, and not
  // all of that churn is yours: clipboard detection runs tools you never chose.
  property var pinnedIds: []
  readonly property int recentLimit: 5

  // In memory only, by design — see lib/history.js.
  property var history: []

  function noteHistory(entryId, input, state) {
    var id = String(entryId)
    var tool = Catalog.byId(id)
    var label = tool ? tool.name : id
    if (!tool && id.indexOf("chain:") === 0) {
      var chain = Chain.find(root.chains, id.slice(6))
      label = chain ? chain.name : id
    }
    if (id === "history") return   // browsing the list is not an event in it
    root.history = History.add(root.history,
      History.makeEntry(id, label, input, Catalog.withoutSecrets(tool, state),
                        new Date().getTime()), 50)
  }

  function restoreHistory(index) {
    var entry = root.history[index]
    if (!entry) return
    selectEntry(entry.entryId, entry.input, entry.state)
    root.statusText = "Restored from history"
    statusTimer.restart()
  }

  function forgetHistory(index) { root.history = History.remove(root.history, index) }

  function clearHistory() {
    root.history = History.clear()
    root.statusText = "History cleared"
    statusTimer.restart()
  }

  // Ordering lives in lib/recents.js so it can be tested.
  function noteRecent(entryId) {
    var next = Recents.note(root.recentIds, entryId, root.recentLimit)
    if (next.length === root.recentIds.length
        && (next.length === 0 || next[0] === root.recentIds[0])) return
    root.recentIds = next
    persistTimer.restart()
  }

  // Deferred for the same reason as toggleSection above: pinning moves a tool
  // into the block at the top, which rebuilds the list and deletes the very
  // button that was clicked.
  function togglePin(toolId) {
    if (!Recents.canPin(toolId)) return
    var id = String(toolId)
    Qt.callLater(function () {
      var wasPinned = Recents.isPinned(root.pinnedIds, id)
      root.pinnedIds = Recents.togglePin(root.pinnedIds, id)
      persistTimer.restart()
      var tool = Catalog.byId(id)
      root.statusText = (tool ? tool.name : id) + (wasPinned ? " unpinned" : " pinned to the top")
      statusTimer.restart()
    })
  }

  // Chains render in the tool list as ordinary entries — same shape, own
  // category — so the picker needed no changes to gain them.
  readonly property var chainEntries: {
    var out = []
    var query = String(root.filterText).toLowerCase()
    for (var i = 0; i < root.chains.length; i++) {
      var chain = root.chains[i]
      if (query.length > 0 && chain.name.toLowerCase().indexOf(query) === -1) continue
      out.push({ id: "chain:" + chain.id, name: chain.name, icon: "󰽜", category: "Chains" })
    }
    if (query.length === 0) out.push({ id: "chain:new", name: "New chain…", icon: "󰐕", category: "Chains" })
    return out
  }

  // Which sections are folded away, and what order the rest sit in. Both are
  // remembered, because a sidebar you have arranged and then find rearranged
  // on the next launch is worse than one that was never arrangeable.
  property var collapsedSections: []
  property var sectionOrder: []

  readonly property var entries: {
    var out = root.chainEntries.slice(0)
    var tools = Catalog.search(root.filterText)
    // While searching, show the plain ranked list — a Recent section would
    // just push the thing you typed for further down, and a section order or a
    // fold would fight the ranking that is the whole point of searching.
    if (String(root.filterText).length > 0) return out.concat(tools)

    // Pinned and recent tools are hoisted out of their categories rather than
    // duplicated: one row per tool keeps arrow-key navigation unambiguous.
    out = out.concat(Recents.block(root.pinnedIds, root.recentIds, root.recentLimit))
    var hoisted = Recents.hoisted(root.pinnedIds, root.recentIds, root.recentLimit)
    for (var t = 0; t < tools.length; t++) if (!hoisted[tools[t].id]) out.push(tools[t])
    return Sections.arrange(out, root.sectionOrder, root.collapsedSections)
  }

  // Folding, reordering and pinning all rewrite `entries`, which reassigns the
  // tool list's model, which destroys every delegate it built — including the
  // header or row whose click handler is still on the stack. Qt calls that
  // fatal and aborts the whole shell, so the write is queued to run once the
  // handler has returned. `name` is captured by value for the same reason:
  // the object it came from is gone by the time this runs.
  function toggleSection(name) {
    var section = String(name)
    Qt.callLater(function () {
      root.collapsedSections = Sections.toggleCollapsed(root.collapsedSections, section)
      persistTimer.restart()
    })
  }

  function moveSection(name, delta) {
    var section = String(name)
    var by = delta
    Qt.callLater(function () {
      if (!Sections.canMove(root.sectionOrder, root.entries, section, by)) return
      root.sectionOrder = Sections.move(root.sectionOrder, root.entries, section, by)
      persistTimer.restart()
    })
  }
  // Text detection cannot see a picture, so an image clipboard gets its own
  // pair of offers — both image tools, with the path as their input.
  readonly property var suggestions: root.imageOnClipboard
    ? [{ toolId: "qr-read", reason: "an image on the clipboard", state: {} },
       { toolId: "base64-image", reason: "an image on the clipboard", state: { mode: "encode" } }]
    : (root.clipboardSample.length > 0 ? Detect.topSuggestions(root.clipboardSample, 4) : [])
  property string clipboardSample: ""
  property bool sampleFromSelection: false
  property bool imageOnClipboard: false

  // ------------------------------------------------------------ lifecycle

  function open(payloadJson) {
    root.opened = true
    root.statusText = ""
    primeEntropy()
    // `{"source":"primary"}` reads what you have highlighted rather than what
    // you copied — bind that to its own key and there is no Ctrl+C step.
    var usePrimary = false
    var pinnedTool = ""
    try {
      var parsed = JSON.parse(payloadJson || "{}")
      usePrimary = parsed.source === "primary"
      pinnedTool = parsed.tool || parsed.chain || ""
    } catch (e) { usePrimary = false }

    // An image on the clipboard can only mean one thing here, and no amount of
    // sniffing text will find it — so ask what the clipboard holds first.
    if (!usePrimary && pinnedTool.length === 0) {
      clipboardTypes(function (types) {
        if (types.indexOf("image/") !== -1) {
          readClipboardImage(function (path, error) {
            if (error.length > 0 || path.length === 0) {
              readText(false, function (text) {
                root.clipboardSample = text
                applyClipboardSuggestion(text, payloadJson)
              })
              return
            }
            // The path is the input both image tools want, so it doubles as
            // the sample the suggestion chips hand over.
            root.clipboardSample = path
            root.imageOnClipboard = true
            root.statusText = "Clipboard holds an image — loaded into QR Reader"
            statusTimer.restart()
            selectEntry("qr-read", path, null)
          })
          return
        }
        readText(false, function (text) {
          root.clipboardSample = text
          root.sampleFromSelection = false
          root.imageOnClipboard = false
          applyClipboardSuggestion(text, payloadJson)
        })
      })
      return
    }

    readText(usePrimary, function (text) {
      root.clipboardSample = text
      root.sampleFromSelection = usePrimary
      root.imageOnClipboard = false
      applyClipboardSuggestion(text, payloadJson)
    })
    Qt.callLater(function () { searchField.forceActiveFocus(); searchField.selectAll() })
  }

  function close() { root.opened = false }

  function dismiss() {
    root.opened = false
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "io.github.iainfreestone.toolroll")
  }

  // Also reachable over IPC, where every argument arrives as a string:
  //   omarchy-shell shell call io.github.iainfreestone.toolroll setDetached true
  function setDetached(value) {
    var next = value === true || value === "true"
    if (next === root.detached) return
    root.detached = next
    persistTimer.restart()
    root.statusText = next
      ? "Pinned — an ordinary window now, so move, resize and tile it as usual"
      : "Back to the summoned overlay"
    statusTimer.restart()
    // The re-parent moves the focused item between windows; put the cursor
    // somewhere sensible rather than nowhere.
    Qt.callLater(function () { searchField.forceActiveFocus() })
  }

  function toggle() {
    if (root.opened) root.dismiss()
    else root.open("{}")
  }

  // A payload can pin a tool explicitly (`{"tool":"json"}`); otherwise the
  // clipboard decides, and only when it is confident enough to be useful.
  function applyClipboardSuggestion(text, payloadJson) {
    var payload = {}
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = {} }

    // `{"chain":"url-param-json"}` and `{"tool":"json"}` both pin the selection;
    // a chain id has to be recognised here too, or it falls through to
    // clipboard detection and quietly opens something else.
    var wanted = payload.chain ? "chain:" + payload.chain
      : (payload.tool ? String(payload.tool) : "")
    if (wanted.length > 0 && (wanted.indexOf("chain:") === 0 || Catalog.byId(wanted))) {
      selectEntry(wanted, payload.input !== undefined ? payload.input : undefined, null)
      return
    }
    if (payload.ignoreClipboard === true) return

    var best = Detect.suggestBest(text)
    if (!best) return
    root.statusText = (root.sampleFromSelection ? "Selection " : "Clipboard ")
      + best.reason + " — loaded into " + Catalog.byId(best.toolId).name
    statusTimer.restart()   // otherwise this one never expires
    selectEntry(best.toolId, text, best.state)
  }

  // One entry point for everything the list can hold: a tool, a saved chain,
  // or the "new chain" affordance.
  function selectEntry(entryId, seedInput, seedState) {
    var id = String(entryId)
    if (id === "chain:new") { createChain(); return }
    if (id.indexOf("chain:") === 0) {
      var chain = Chain.find(root.chains, id.slice(6))
      if (!chain) return
      root.selectedEntryId = id
      workspace.loadChain(chain, seedInput)
      persistTimer.restart()
      return
    }
    selectTool(id, seedInput, seedState)
  }

  function selectTool(toolId, seedInput, seedState) {
    var tool = Catalog.byId(toolId)
    if (!tool) return
    root.selectedEntryId = toolId
    workspace.loadTool(tool, seedInput, seedState)
    persistTimer.restart()
  }

  // ------------------------------------------------------------ chains

  function saveChains() {
    chainsFile.setText(Chain.serializeStore(root.chains))
    restrictToOwner(root.chainsPath)
  }

  function loadChains(raw) {
    var parsed = []
    try {
      parsed = Chain.parseStore(raw)
    } catch (e) {
      root.statusText = String(e.message)
      statusTimer.restart()
      return
    }
    if (parsed.length === 0 && !root.chainsSeeded) {
      // An empty list with a plus button teaches nothing; ship a few chains
      // that show what the feature is for.
      var starters = Chain.starterChains()
      var seeded = []
      for (var i = 0; i < starters.length; i++) seeded.push(Chain.normalize(starters[i]))
      root.chains = seeded
      root.chainsSeeded = true
      saveChains()
      return
    }
    root.chainsSeeded = true
    root.chains = parsed
  }

  // Seeded from whatever tool the user was just using, then selected with its
  // step picker open — so the path from "I keep doing this by hand" to a saved
  // chain is one button and one choice.
  function createChainFrom(toolId, state, seedInput) {
    var chain = Chain.fromTool(toolId, state, root.chains)
    root.chains = Chain.upsert(root.chains, chain)
    saveChains()
    selectEntry("chain:" + chain.id, seedInput, null)
    root.statusText = "Chain started from " + chain.name + " — add the next step"
    statusTimer.restart()
    workspace.promptForNextStep()
  }

  // Shown at most once: the moment someone pushes output back into input they
  // are building a chain by hand, and that is when the feature makes sense.
  property bool chainHintShown: false

  function noteManualChain() {
    if (root.chainHintShown) return
    root.chainHintShown = true
    persistTimer.restart()
    root.statusText = "Doing that often? The Chain button saves it as one step-by-step pipeline"
    // A sentence to read, not a confirmation to glance at.
    statusTimer.interval = 6000
    statusTimer.restart()
  }

  function createChain() {
    var id = Chain.makeId("New chain", root.chains)
    var chain = Chain.normalize({ id: id, name: "New chain", steps: [] })
    root.chains = Chain.upsert(root.chains, chain)
    saveChains()
    selectEntry("chain:" + id)
  }

  function updateChain(chain) {
    root.chains = Chain.upsert(root.chains, chain)
    saveChains()
  }

  function deleteChain(chainId) {
    root.chains = Chain.remove(root.chains, chainId)
    saveChains()
    selectEntry("json")
  }

  // ------------------------------------------------------------ clipboard

  // A queue, not a single slot: two reads can overlap (summon, dismiss, summon
  // again while the first wl-paste is still streaming a large clipboard), and
  // with one slot the earlier callback was silently dropped and its caller
  // waited forever. Jobs run one at a time because they can now name different
  // sources — the clipboard and the primary selection hold different text.
  property var textReadQueue: []
  property var textReadInFlight: null

  function readClipboard(callback) { readText(false, callback) }
  function readSelection(callback) { readText(true, callback) }

  function readText(primary, callback) {
    root.textReadQueue = root.textReadQueue.concat([{ primary: primary === true, callback: callback }])
    pumpTextReads()
  }

  function pumpTextReads() {
    if (root.textReadInFlight !== null || root.textReadQueue.length === 0) return
    var job = root.textReadQueue[0]
    root.textReadQueue = root.textReadQueue.slice(1)
    root.textReadInFlight = job
    pasteProc.command = job.primary
      ? ["wl-paste", "--primary", "--no-newline"]
      : ["wl-paste", "--no-newline"]
    pasteProc.running = true
  }

  function deliverClipboard(text) {
    var job = root.textReadInFlight
    if (job === null) return
    root.textReadInFlight = null
    if (job.callback) job.callback(String(text))
    pumpTextReads()
  }

  // wl-copy takes the image on stdin. The path is ours and fixed, so the shell
  // indirection here carries no user input.
  function copyImage(path) {
    if (!path || String(path).length === 0) return
    Quickshell.execDetached(["sh", "-c",
      "wl-copy --type image/png < " + Util.shellQuote(String(path))])
  }

  property var saveQueue: []
  property var saveInFlight: null

  // Saves into ~/Pictures, creating it if needed. Returns the destination
  // through the callback so the caller can say where it went rather than
  // guessing optimistically.
  function saveImage(path, callback) {
    if (!path || String(path).length === 0) return
    var stamp = Qt.formatDateTime(new Date(), "yyyyMMdd-hhmmss")
    var directory = Quickshell.env("HOME") + "/Pictures"
    var destination = directory + "/toolroll-" + stamp + ".png"
    root.saveQueue = root.saveQueue.concat([{
      source: String(path), destination: destination, directory: directory, callback: callback
    }])
    pumpSaveQueue()
  }

  function pumpSaveQueue() {
    if (root.saveInFlight !== null || root.saveQueue.length === 0) return
    var job = root.saveQueue[0]
    root.saveQueue = root.saveQueue.slice(1)
    root.saveInFlight = job
    saveProc.command = ["sh", "-c",
      "mkdir -p " + Util.shellQuote(job.directory)
      + " && cp " + Util.shellQuote(job.source) + " " + Util.shellQuote(job.destination)]
    saveProc.running = true
  }

  // The text goes over stdin, never argv.
  //
  // A process's arguments are world-readable through /proc/<pid>/cmdline for as
  // long as it lives, so passing the copied text as an argument published it to
  // every other process on the machine. This is a tool people paste tokens and
  // keys into, and copying the result is the last thing they do with it — the
  // one moment it must not leak. stdin is private to the two processes.
  // Serial, like the image renders above: a second copy arriving while the
  // first is still running would otherwise overwrite `pending` and be lost.
  property var clipboardQueue: []

  Process {
    id: clipboardWriter
    property string pending: ""
    command: ["wl-copy"]
    onStarted: {
      write(clipboardWriter.pending)
      clipboardWriter.pending = ""
      // Closing stdin is what tells wl-copy the content has ended.
      stdinEnabled = false
    }
    onExited: root.drainClipboardQueue()
  }

  function drainClipboardQueue() {
    if (clipboardWriter.running || root.clipboardQueue.length === 0) return
    var next = root.clipboardQueue.shift()
    clipboardWriter.pending = next
    clipboardWriter.stdinEnabled = true
    clipboardWriter.running = true
  }

  function copyText(text) {
    root.clipboardQueue.push(String(text))
    drainClipboardQueue()
  }

  // ------------------------------------------------------------ images

  // Serial queue, for the same reason the clipboard reads are queued: two
  // renders can now overlap (the view and a headless run), and they share one
  // output file — so they take turns rather than clobbering each other.
  property var imageQueue: []
  property var imageInFlight: null

  function renderImage(argv, callback) {
    root.imageQueue = root.imageQueue.concat([{ argv: argv, callback: callback }])
    pumpImageQueue()
  }

  function pumpImageQueue() {
    if (root.imageInFlight !== null || root.imageQueue.length === 0) return
    var job = root.imageQueue[0]
    root.imageQueue = root.imageQueue.slice(1)
    root.imageInFlight = job

    job.path = nextImagePath("preview")
    var command = []
    for (var i = 0; i < job.argv.length; i++)
      command.push(job.argv[i] === "%OUT%" ? job.path : String(job.argv[i]))
    imageProc.command = command
    imageProc.running = true
  }

  // ---------------------------------------------------- reading the clipboard
  //                                                        as an image

  property var pendingImageRead: null

  // wl-paste writes PNG bytes, which a text collector would mangle, so it goes
  // to a file and the caller gets the path.
  function readClipboardImage(callback) {
    var destination = nextImagePath("scan")
    root.pendingImageRead = { callback: callback, path: destination }
    imageReadProc.command = ["sh", "-c",
      "wl-paste --type image/png > " + Util.shellQuote(destination)]
    imageReadProc.running = true
  }

  property var pendingTypesCallback: null

  function clipboardTypes(callback) {
    root.pendingTypesCallback = callback
    typesProc.running = true
  }

  // ------------------------------------------------- commands that emit text

  property var textCommandQueue: []
  property var textCommandInFlight: null

  function runTextCommand(argv, callback) {
    root.textCommandQueue = root.textCommandQueue.concat([{ argv: argv, callback: callback }])
    pumpTextCommands()
  }

  function pumpTextCommands() {
    if (root.textCommandInFlight !== null || root.textCommandQueue.length === 0) return
    var job = root.textCommandQueue[0]
    root.textCommandQueue = root.textCommandQueue.slice(1)
    root.textCommandInFlight = job
    var command = []
    for (var i = 0; i < job.argv.length; i++) command.push(String(job.argv[i]))
    textCommandProc.command = command
    textCommandProc.running = true
  }

  // ------------------------------------------------------------ entropy

  property var entropyPool: []

  // Generators fall back to Math.random without this; priming from
  // /dev/urandom is what makes the password generator honest.
  function primeEntropy() {
    if (root.entropyPool.length > 512) return
    entropyProc.running = true
  }

  function installEntropySource() {
    Gen.setEntropySource(function (count) {
      if (root.entropyPool.length < count) return null
      var taken = root.entropyPool.slice(0, count)
      root.entropyPool = root.entropyPool.slice(count)
      if (root.entropyPool.length < 256) Qt.callLater(root.primeEntropy)
      return taken
    })
  }

  // ------------------------------------------------------------ headless
  //
  // Run a chain (or a single tool) over the clipboard without ever showing the
  // window, and put the result back on the clipboard:
  //
  //   omarchy-shell shell call io.github.iainfreestone.toolroll run '{"chain":"url-param-json"}'
  //
  // Bound to a key, that is the whole interaction for the common case: copy,
  // press, paste. The plugin is keepLoaded, so there is nothing to start.

  property var headlessPending: null

  function run(argJson) {
    var args = {}
    try {
      args = JSON.parse(argJson || "{}")
    } catch (e) {
      return "argument is not valid JSON"
    }

    var chain = args.chain ? Chain.find(root.chains, String(args.chain)) : null
    if (args.chain && !chain) return "unknown chain: " + args.chain
    var tool = args.tool ? Catalog.byId(String(args.tool)) : null
    if (args.tool && !tool) return "unknown tool: " + args.tool
    if (!chain && !tool) return "pass either a chain or a tool"

    root.headlessPending = {
      label: chain ? chain.name : tool.name,
      // `quiet` suppresses the notification for anyone scripting this.
      quiet: args.quiet === true
    }

    // A tool whose input is an image wants the clipboard's picture, not its
    // text. Without this the QR reader answered "ok" and did nothing at all,
    // which is a worse failure than an error.
    if (tool && (tool.view === "decode" || tool.view === "dataurl")) {
      readClipboardImage(function (path, error) {
        if (error.length > 0 || path.length === 0) {
          root.headlessFinished(false, "", "there is no image on the clipboard", "")
          return
        }
        headlessRunner.run(tool, path, Catalog.defaultsFor(tool))
      })
      return "ok"
    }

    readText(args.source === "primary", function (text) {
      if (!text || text.length === 0) {
        root.headlessFinished(false, "", args.source === "primary"
          ? "nothing is selected" : "the clipboard is empty")
        return
      }
      // Goes through the same runner as the UI, so a large clipboard doesn't
      // block the shell just because there was no window to block.
      if (chain) headlessRunner.runChain(chain, text)
      else headlessRunner.run(tool, text, Catalog.defaultsFor(tool))
    })
    return "ok"
  }

  // A chain that ends in an image has to render before there is anything to
  // hand back — copying its text output would return the input unchanged.
  function headlessImage(command) {
    renderImage(command, function (path, error) {
      if (String(error).length > 0) root.headlessFinished(false, "", error, "")
      else root.headlessFinished(true, "", "", path)
    })
  }

  // Some tools answer with a command for the host to run rather than with
  // text — reading a QR, encoding an image as a data URI. Their result is
  // whatever it prints.
  function headlessText(envelope) {
    runTextCommand(envelope.textCommand, function (output, error) {
      if (String(error).length > 0) {
        root.headlessFinished(false, "", error, "")
        return
      }
      var body = String(output).replace(/\s+$/, "")
      root.headlessFinished(true,
        body.length > 0 ? envelope.textPrefix + body + envelope.textSuffix : "", "", "")
    })
  }

  function headlessFinished(ok, output, error, imagePath) {
    var pending = root.headlessPending
    root.headlessPending = null
    if (!pending) return

    var isImage = imagePath !== undefined && imagePath !== null && String(imagePath).length > 0
    if (ok && isImage) {
      copyImage(imagePath)
    } else if (ok && output.length > 0) {
      copyText(output)
    }
    if (pending.quiet) return

    var title = ok ? pending.label : "Toolroll failed"
    var body = ok
      ? (isImage ? "Image on the clipboard"
                 : "Result on the clipboard · " + output.length + " characters")
      : String(error)
    Quickshell.execDetached(["notify-send", "-a", "Toolroll",
                             ok ? "-u" : "-u", ok ? "low" : "normal", title, body])
  }

  property Runner headlessRunner: Runner {
    onFinished: function (envelope) {
      if (envelope.ok && envelope.imageCommand) root.headlessImage(envelope.imageCommand)
      else if (envelope.ok && envelope.textCommand) root.headlessText(envelope)
      else root.headlessFinished(envelope.ok, envelope.output, envelope.error, "")
    }
    onChainFinished: function (outcome) {
      if (outcome.ok && outcome.endsInImage && outcome.imageCommand) root.headlessImage(outcome.imageCommand)
      else root.headlessFinished(outcome.ok, outcome.output, outcome.error, "")
    }
  }

  // ------------------------------------------------------------ navigation

  function moveSelection(delta) {
    var list = root.entries
    if (list.length === 0) return
    var index = -1
    for (var i = 0; i < list.length; i++) if (list[i].id === root.selectedEntryId) index = i
    var next = index + delta
    if (next < 0) next = list.length - 1
    if (next >= list.length) next = 0
    // Skip the "new chain" affordance when arrowing through the list; it is a
    // command, not a destination.
    if (list[next].id === "chain:new") next = (next + (delta >= 0 ? 1 : -1) + list.length) % list.length
    selectEntry(list[next].id, undefined, null)
  }

  function setFilter(text) {
    root.filterText = text
    var list = root.entries
    var stillVisible = false
    for (var i = 0; i < list.length; i++) if (list[i].id === root.selectedEntryId) stillVisible = true
    if (!stillVisible && list.length > 0) selectEntry(list[0].id, undefined, null)
  }

  function goBack() {
    if (searchField.activeFocus) {
      if (root.filterText.length > 0) { searchField.text = ""; setFilter("") }
      // A pinned window closes the way every other window does, not with
      // Escape — there, Escape just walks back out of what you were typing.
      else if (!root.detached) root.dismiss()
      return
    }
    searchField.forceActiveFocus()
    searchField.selectAll()
  }

  Component.onCompleted: {
    primeEntropy()
    selectEntry(root.selectedEntryId, undefined, null)
  }

  // ------------------------------------------------------------ processes

  Process {
    id: pasteProc
    // `command` is set per job by pumpTextReads — clipboard or primary.
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.deliverClipboard(text)
    }
    onExited: function (code, status) {
      // wl-paste exits non-zero when there is nothing to read; that isn't an
      // error worth surfacing, it just means there is nothing to suggest. If
      // the stream already delivered, this is a no-op.
      root.deliverClipboard("")
    }
  }

  Process {
    id: typesProc
    command: ["wl-paste", "--list-types"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var callback = root.pendingTypesCallback
        root.pendingTypesCallback = null
        if (callback) callback(String(text))
      }
    }
    onExited: function (code, status) {
      var callback = root.pendingTypesCallback
      root.pendingTypesCallback = null
      if (callback) callback("")
    }
  }

  Process {
    id: imageReadProc
    onExited: function (code, status) {
      var job = root.pendingImageRead
      root.pendingImageRead = null
      if (!job || !job.callback) return
      if (code === 0) job.callback(job.path, "")
      else job.callback("", "Could not read an image from the clipboard")
    }
  }

  Process {
    id: textCommandProc
    property string collected: ""
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: textCommandProc.collected = String(text)
    }
    onExited: function (code, status) {
      var job = root.textCommandInFlight
      root.textCommandInFlight = null
      var output = textCommandProc.collected
      textCommandProc.collected = ""
      if (job && job.callback) {
        // zbarimg exits 4 when it simply didn't find a code — not a failure
        // worth an error message, just nothing there.
        if (code === 0) job.callback(output, "")
        else if (code === 4) job.callback("", "No QR code found in that image")
        else job.callback("", "Could not run zbarimg — install it with: omarchy pkg add zbar")
      }
      pumpTextCommands()
    }
  }

  Process {
    id: saveProc
    onExited: function (code, status) {
      var job = root.saveInFlight
      root.saveInFlight = null
      if (job && job.callback) {
        if (code === 0) job.callback(job.destination.replace(Quickshell.env("HOME"), "~"), "")
        else job.callback("", "Could not save the image to " + job.directory)
      }
      pumpSaveQueue()
    }
  }

  Process {
    id: imageProc
    onExited: function (code, status) {
      var job = root.imageInFlight
      root.imageInFlight = null
      if (job && job.callback) {
        if (code === 0) job.callback(job.path, "")
        else job.callback("", "Could not run qrencode — install it with: omarchy pkg add qrencode")
      }
      pumpImageQueue()
    }
  }

  Process {
    id: entropyProc
    command: ["od", "-An", "-vtu1", "-N", "4096", "/dev/urandom"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var parts = String(text).split(/\s+/)
        var pool = root.entropyPool.slice(0)
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].length === 0) continue
          var n = parseInt(parts[i], 10)
          if (n >= 0 && n <= 255) pool.push(n)
        }
        root.entropyPool = pool
        if (pool.length > 0) root.installEntropySource()
      }
    }
  }

  // ------------------------------------------------------------ persistence

  Timer {
    id: persistTimer
    interval: 400
    onTriggered: root.saveState()
  }

  // Both files this plugin writes are made owner-only.
  //
  // FileView creates them with the process umask, which on a stock install is
  // 0644 — world-readable. The session store holds whatever you last had in
  // each tool, which for this plugin means tokens, config and payloads, and a
  // saved chain can carry a pattern you would rather not publish to every
  // account on the machine. Re-applied after each write because an atomic write
  // replaces the file, and its replacement is a new inode with fresh
  // permissions.
  // Only when the mode is actually wrong, which is not an optimisation.
  //
  // chainsFile watches its own file and reloads on change, and chmod counts as
  // a change: an unconditional chmod here fired inotify, which reloaded, which
  // chmod'd again, forever. Every pass rewrote the chain list and rebuilt every
  // row in the sidebar, so the scrollbar flickered and a click on a pin landed
  // on a delegate that had already been destroyed. Testing first means the
  // first pass fixes the mode and the second does nothing at all.
  //
  // A shell is needed for the test, and it gets a path this plugin built from
  // $HOME, passed as an argument rather than interpolated into the script.
  function restrictToOwner(path) {
    Quickshell.execDetached(["sh", "-c",
      "test \"$(stat -c %a \"$1\")\" = 600 || chmod 600 \"$1\"", "sh", path])
  }

  function saveState() {
    restrictToOwner(root.statePath)
    stateFile.setText(JSON.stringify({
      version: 1,
      lastTool: root.selectedEntryId,
      detached: root.detached,
      chainHintShown: root.chainHintShown,
      recent: root.recentIds,
      pinnedTools: root.pinnedIds,
      collapsedSections: root.collapsedSections,
      sectionOrder: root.sectionOrder,
      sessions: workspace.sessions
    }, null, 2) + "\n")
  }

  function loadState(raw) {
    try {
      var parsed = JSON.parse(raw || "{}")
      if (parsed.version !== 1) return
      if (parsed.sessions) workspace.sessions = parsed.sessions
      if (Array.isArray(parsed.recent)) root.recentIds = parsed.recent
      if (Array.isArray(parsed.pinnedTools)) root.pinnedIds = parsed.pinnedTools
      if (Array.isArray(parsed.collapsedSections)) root.collapsedSections = parsed.collapsedSections
      if (Array.isArray(parsed.sectionOrder)) root.sectionOrder = parsed.sectionOrder
      // `pinned` was this setting's name before it collided with the
      // sidebar's pinned tools; still read it so the choice survives.
      if (parsed.detached === true || parsed.pinned === true) root.detached = true
      if (parsed.chainHintShown === true) root.chainHintShown = true
      if (parsed.lastTool) selectEntry(parsed.lastTool, undefined, null)
    } catch (e) {
      // A corrupt state file should cost you your last tool, nothing more.
    }
  }

  FileView {
    id: themeColorsFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/colors.toml"
    watchChanges: true
    printErrors: false
    onLoaded: root.palette = Palette.parse(text())
    onFileChanged: reload()
    // A theme without these keys simply leaves the palette empty, and every
    // caller falls back to the accent.
    onLoadFailed: root.palette = ({})
  }

  FileView {
    id: chainsFile
    path: root.chainsPath
    atomicWrites: true
    printErrors: false
    watchChanges: true
    onLoaded: { root.restrictToOwner(root.chainsPath); root.loadChains(text()) }
    onLoadFailed: root.loadChains("")
    onFileChanged: reload()
  }

  FileView {
    id: stateFile
    path: root.statePath
    atomicWrites: true
    printErrors: false
    onLoaded: { root.restrictToOwner(root.statePath); root.loadState(text()) }
  }

  Connections {
    target: workspace
    function onSessionsUpdated() { persistTimer.restart() }
    function onEntryUsed(entryId, input, state) {
      root.noteRecent(entryId)
      root.noteHistory(entryId, input, state)
    }
    function onChainEdited(chain) { root.updateChain(chain) }
    function onChainDeleted(chainId) { root.deleteChain(chainId) }
    function onChainRequested(toolId, state, input) { root.createChainFrom(toolId, state, input) }
    function onManualChainNoticed() { root.noteManualChain() }
    function onStatusMessage(message) {
      root.statusText = message
      statusTimer.restart()
    }
  }

  Timer {
    id: statusTimer
    interval: 2500
    onTriggered: {
      root.statusText = ""
      interval = 2500
    }
  }

  // ------------------------------------------------------------ surfaces
  //
  // Two of them, and the UI exists once and is re-parented between them, so
  // pinning preserves everything: input, options, scroll position, focus.
  //
  // The summoned overlay is a layer-shell surface with a scrim and exclusive
  // keyboard focus — right for "convert this one thing and get out". The
  // pinned window is an ordinary xdg-toplevel that Hyprland tiles, moves,
  // resizes and sends to another workspace like any other window — right for
  // keeping open beside your editor. Both shapes have first-party precedent:
  // the clipboard and emoji overlays are the former, omarchy.dev-gallery is
  // the latter.

  Item {
    id: content
    parent: root.detached ? floatingHost : cardHost
    anchors.fill: parent

    Shortcut {
      sequences: ["Escape"]
      context: Qt.WindowShortcut
      onActivated: root.goBack()
    }
    Shortcut {
      sequences: ["Ctrl+K", "Ctrl+L"]
      context: Qt.WindowShortcut
      onActivated: { searchField.forceActiveFocus(); searchField.selectAll() }
    }
    Shortcut {
      // Clicking the error message works too, but this is a keyboard-first
      // surface and a caption is a mouse-only target.
      sequences: ["Ctrl+E"]
      context: Qt.WindowShortcut
      onActivated: workspace.jumpToError()
    }
    Shortcut {
      // Not Ctrl+Shift+Z: that is redo in every Qt text editor, including the
      // one that has focus here, so the field swallowed it before a window
      // shortcut ever saw it. TextArea owns plain Ctrl+Z for typing; this
      // reaches past the bulk replacements that wipe its history.
      sequences: ["Alt+Z"]
      context: Qt.WindowShortcut
      onActivated: workspace.restore()
    }
    Shortcut {
      sequences: ["Ctrl+P"]
      context: Qt.WindowShortcut
      onActivated: root.togglePin(root.selectedEntryId)
    }
    Shortcut {
      sequences: ["Ctrl+Shift+C"]
      context: Qt.WindowShortcut
      onActivated: workspace.copy(workspace.result ? workspace.result.output : "")
    }
    Shortcut {
      sequences: ["Ctrl+Shift+V"]
      context: Qt.WindowShortcut
      onActivated: workspace.pasteIntoInput()
    }
    Shortcut {
      sequences: ["Ctrl+Return", "Ctrl+Enter"]
      context: Qt.WindowShortcut
      onActivated: workspace.rerun()
    }
    Shortcut {
      sequences: ["Ctrl+Down", "Ctrl+J"]
      context: Qt.WindowShortcut
      onActivated: root.moveSelection(1)
    }
    Shortcut {
      sequences: ["Ctrl+Up"]
      context: Qt.WindowShortcut
      onActivated: root.moveSelection(-1)
    }

    Column {
      anchors.fill: parent
      spacing: Style.spacing.md

      // ---- header
      Item {
        width: parent.width
        height: Math.max(searchField.height, titleText.implicitHeight)

        Text {
          textFormat: Text.PlainText
          id: titleText
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(150)
          text: "Toolroll"
          color: root.foreground
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.title
        }

        TextField {
          id: searchField
          anchors.left: titleText.right
          anchors.leftMargin: Style.spacing.md
          width: Style.space(280)
          placeholderText: "Search tools…"
          foreground: root.foreground
          accent: root.accent
          font.family: Style.font.menuFamily
          verticalPadding: Style.spacing.xxs
          onTextEdited: root.setFilter(text)

          Keys.onPressed: function (event) {
            if (event.key === Qt.Key_Down) { root.moveSelection(1); event.accepted = true }
            else if (event.key === Qt.Key_Up) { root.moveSelection(-1); event.accepted = true }
            else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter
                     || event.key === Qt.Key_Tab) {
              workspace.focusInput()
              event.accepted = true
            }
          }
        }

        Button {
          id: shapeButton
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: root.detached ? "Overlay" : "Detach"
          iconText: root.detached ? "󰨟" : "󰏌"
          tooltipText: root.detached
            ? "Back to the overlay: summoned over your work, gone on Escape"
            : "Detach into an ordinary window you can keep open beside your work"
          bordered: true
          selected: root.detached
          foreground: root.foreground
          accent: root.accent
          iconSize: Style.font.iconSmall
          horizontalPadding: Style.spacing.sm
          verticalPadding: Style.spacing.xxs
          onClicked: root.setDetached(!root.detached)
        }

        Text {
          textFormat: Text.PlainText
          anchors.left: searchField.right
          anchors.leftMargin: Style.spacing.lg
          anchors.right: shapeButton.left
          anchors.rightMargin: Style.spacing.md
          anchors.verticalCenter: parent.verticalCenter
          text: root.statusText.length > 0 ? root.statusText
            : (workspace.canJumpToError
               ? "ctrl+e jump to the error · ctrl+k search · esc back"
               : "ctrl+k search · ctrl+↑↓ tool · ctrl+shift+c copy · esc back")
          color: root.statusText.length > 0 ? root.accent : Qt.darker(root.foreground, 1.55)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
          horizontalAlignment: Text.AlignRight
        }
      }

      // ---- clipboard suggestions
      Row {
        width: parent.width
        height: visible ? Style.spacing.controlHeight : 0
        spacing: Style.spacing.sm
        visible: root.suggestions.length > 1

        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          text: "From clipboard:"
          color: Qt.darker(root.foreground, 1.5)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
        }

        Repeater {
          model: root.suggestions

          Button {
            required property var modelData
            readonly property var suggestedTool: Catalog.byId(modelData.toolId)
            text: suggestedTool ? suggestedTool.name : modelData.toolId
            tooltipText: modelData.reason
            bordered: true
            selected: root.selectedEntryId === modelData.toolId
            foreground: root.foreground
            accent: root.accent
            fontFamily: Style.font.menuFamily
            fontSize: Style.font.caption
            verticalPadding: Style.spacing.xxs
            onClicked: root.selectEntry(modelData.toolId, root.clipboardSample, modelData.state)
          }
        }
      }

      PanelSeparator { width: parent.width; foreground: root.foreground }

      // ---- body
      Row {
        width: parent.width
        height: parent.height - y
        spacing: Style.spacing.lg

        ToolList {
          id: toolList
          width: Style.space(215)
          height: parent.height
          tools: root.entries
          selectedId: root.selectedEntryId
          foreground: root.foreground
          accent: root.accent
          palette: root.palette
          collapsedSections: root.collapsedSections
          onPicked: function (entryId) {
            root.selectEntry(entryId, undefined, null)
            if (entryId !== "chain:new") workspace.focusInput()
          }
          onPinToggled: function (toolId) { root.togglePin(toolId) }
          onSectionToggled: function (name) { root.toggleSection(name) }
          onSectionMoved: function (name, delta) { root.moveSection(name, delta) }
        }

        Rectangle {
          width: 1
          height: parent.height
          color: Util.alpha(root.foreground, 0.15)
        }

        Workspace {
          id: workspace
          width: parent.width - toolList.width - Style.spacing.lg * 2 - 1
          height: parent.height
          bridge: root
          foreground: root.foreground
          accent: root.accent
        }
      }
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened && !root.detached
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-toolroll"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.dismiss()
    }

    BorderSurface {
      id: card
      anchors.centerIn: parent
      // Roomy on a big display, but never wider than the screen and never so
      // narrow that the two-pane views have to stack.
      width: Math.min(Math.max(Style.space(900), Math.round(panel.width * 0.72)),
                      panel.width - Style.gapsOut * 2)
      height: Math.min(Math.max(Style.space(600), Math.round(panel.height * 0.82)),
                       panel.height - Style.gapsOut * 2)
      radius: Style.cornerRadius
      color: root.background
      borderSpec: root.borderSpec
      padding: Style.spacing.panelPadding

      // Swallow clicks so they don't reach the dismiss handler behind the card.
      MouseArea { anchors.fill: parent; onClicked: {} }

      Item {
        id: cardHost
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
      }
    }
  }

  FloatingWindow {
    id: floating
    visible: root.opened && root.detached
    title: "Toolroll"
    color: root.background
    implicitWidth: Style.space(1120)
    implicitHeight: Style.space(760)
    minimumSize: Qt.size(Style.space(760), Style.space(480))

    // Closing from the titlebar or with the compositor's close key should read
    // as dismissing the plugin, not leave it "open" with nothing on screen.
    onVisibleChanged: {
      if (!visible && root.opened && root.detached) root.dismiss()
    }

    FocusScope {
      anchors.fill: parent
      focus: true

      Item {
        id: floatingHost
        anchors.fill: parent
        anchors.margins: Style.spacing.panelPadding
      }
    }
  }
}

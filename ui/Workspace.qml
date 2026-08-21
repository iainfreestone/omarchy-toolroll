import QtQuick
import qs.Commons
import qs.Ui
import "../lib/catalog.js" as Catalog
import "../lib/chain.js" as Chain
import "../lib/samples.js" as Samples

// The right-hand pane. It hosts either a single tool — header, options, and
// whichever view the tool declares — or a chain, which runs several tools in
// sequence. It owns the input, the per-tool state, and the recompute cycle so
// the views stay presentational.
Item {
  id: root

  // Set by DevUtils.qml — used for clipboard access and running the external
  // commands that image tools declare.
  property var bridge: null

  property var tool: null
  // Exactly one of `tool` and `chain` is set at a time.
  property var chain: null
  property var chainResult: null
  readonly property bool chainMode: root.chain !== null
  property bool deleteConfirmOpen: false

  property color foreground: Color.menu.text
  property color accent: Color.accent

  // { toolId: { input: "", state: {} } } — kept across tool switches and
  // persisted between sessions so a half-finished job survives Esc.
  property var sessions: ({})

  property string inputText: ""
  property var state: ({})
  property var result: Catalog.emptyResult()

  property string imagePath: ""
  property string imageError: ""

  // The decode view's pair: the text a command read back out of an image.
  property string decodedText: ""
  property string decodeError: ""
  property bool decoding: false

  // True when the input is large enough that we've stopped recomputing on
  // every keystroke and are waiting to be asked.
  property bool awaitingRun: false

  readonly property bool busy: runner.busy

  // What the header shows about the run itself, as opposed to its result.
  readonly property string runStatus: {
    if (root.awaitingRun)
      return "Input is " + Math.round(runner.sizeOf(root.inputText, root.state) / 104857.6) / 10
        + " MB — press Ctrl+Enter to run"
    if (runner.busy) return "working…"
    if (runner.lastElapsed > 0)
      return "ran in " + (runner.lastElapsed >= 1000
        ? (Math.round(runner.lastElapsed / 100) / 10) + "s" : runner.lastElapsed + "ms")
        + " off the UI thread"
    return ""
  }

  // Names the button rather than gesturing at it, and says what pressing it is
  // for — this text is read by exactly the person who does not yet know.
  readonly property string inputPlaceholder: {
    var base = root.chainMode ? "Paste what the chain should run on" : "Paste here"
    if (root.availableSamples.length === 0) return base
    return base + ", or press Load Sample above to see what this expects"
  }

  signal statusMessage(string message)
  // Raised whenever a chain is edited, so the host can persist it.
  signal chainEdited(var chain)
  signal chainDeleted(string chainId)
  // Raised when a tool actually produced something from real input. Two
  // consumers: the Recent list wants only the id, history wants the rest.
  signal entryUsed(string entryId, string input, var state)
  // "Turn what I'm doing into a chain" — raised from the tool header.
  signal chainRequested(string toolId, var state, string input)
  // Fired the first time someone hand-rolls a chain by sending output back to
  // input; the host decides whether that hint has been shown before.
  signal manualChainNoticed()
  // Not `sessionsChanged` — that name collides with the change signal Qt
  // generates for the `sessions` property.
  signal sessionsUpdated()

  // ------------------------------------------------------------ state

  function sessionFor(toolId) {
    var existing = root.sessions[toolId]
    if (!existing) return { input: "", state: Catalog.defaultsFor(Catalog.byId(toolId)) }
    // Also stripped on the way in, so a file written by an older build heals
    // itself the next time the session is saved.
    return {
      input: existing.input,
      state: Catalog.withoutSecrets(Catalog.byId(toolId), existing.state)
    }
  }

  // Chains share the session store with tools under a prefixed key, so
  // switching between a chain and a tool keeps both inputs.
  function sessionKey() {
    if (root.chainMode) return "chain:" + root.chain.id
    return root.tool ? root.tool.id : ""
  }

  function persistSession() {
    var key = sessionKey()
    if (!key) return
    var next = ({})
    for (var k in root.sessions) next[k] = root.sessions[k]
    // Secrets never reach the file. The JWT debugger's HMAC key and the hash
    // tool's key are masked on screen; writing them to disk anyway would make
    // that masking a lie.
    next[key] = {
      input: root.inputText,
      state: root.chainMode ? {} : Catalog.withoutSecrets(root.tool, root.state)
    }
    root.sessions = next
    root.sessionsUpdated()
  }

  function loadTool(nextTool, seedInput, seedState) {
    root.chain = null
    root.chainResult = null
    if (!nextTool) { root.tool = null; return }

    var session = sessionFor(nextTool.id)
    var merged = Catalog.defaultsFor(nextTool)
    for (var k in session.state) if (merged[k] !== undefined || k === "right") merged[k] = session.state[k]
    if (seedState) for (var s in seedState) merged[s] = seedState[s]

    // Arriving with a seed — the clipboard, usually — over work already sitting
    // in this same tool's session is exactly as destructive as pressing Clear.
    if (seedInput !== undefined && seedInput !== null && root.tool && root.tool.id === nextTool.id
        && session.input.length > 0 && session.input !== seedInput)
      captureRestorePoint("the clipboard was loaded", session.input)

    // Neither view should ever see the other's data. Blanking the input across
    // the swap is what makes that true: the outgoing view renders empty for a
    // frame (harmless, every view handles empty), the incoming one is built
    // empty, and only then does its own input arrive. Setting the tool first
    // handed the new view the old input; setting the input first handed the
    // old view the new one — a decode view treats input as a file path, so
    // either way something tried to open a picture that was really text.
    root.inputText = ""
    root.state = merged
    clearDerived()
    root.tool = nextTool
    root.inputText = seedInput !== undefined && seedInput !== null ? seedInput : session.input
    recompute()

    // Seeded input arrives by direct assignment, which skips the debounce that
    // saves a session — so text loaded from the clipboard or a payload was
    // never remembered unless you happened to type into it afterwards.
    if (seedInput !== undefined && seedInput !== null) persistSession()
  }

  // ---- undoing the six things that can't be undone
  //
  // TextArea gives typing its own Ctrl+Z for free, and a bulk assignment to
  // `text` wipes that history — so the operations that replace the input
  // wholesale are precisely the ones its undo cannot reach back past. One slot
  // is enough: this is not a general undo stack, it is a way back from a
  // handful of destructive moments.
  property var restorePoint: null
  readonly property bool canRestore: root.restorePoint !== null

  function captureRestorePoint(what, value) {
    var text = value === undefined || value === null ? root.inputText : String(value)
    if (text.length === 0) return   // nothing was lost, so offer nothing
    root.restorePoint = { kind: "input", input: text, what: what }
    restoreTimer.restart()
  }

  function captureChainRestorePoint(what) {
    if (!root.chainMode) return
    root.restorePoint = { kind: "chain", chain: Chain.normalize(root.chain), what: what }
    restoreTimer.restart()
  }

  function restore() {
    var point = root.restorePoint
    if (!point) return
    root.restorePoint = null
    if (point.kind === "chain") {
      applyChainEdit(point.chain)
      root.statusMessage("Put the step back")
      return
    }
    setInput(point.input)
    recompute(true)
    root.statusMessage("Restored what was there before " + point.what)
  }

  function clearInput() {
    captureRestorePoint("clearing")
    setInput("")
  }

  // The offer expires: a stale Undo button that restores something from ten
  // minutes ago is worse than no button.
  property Timer restoreTimer: Timer {
    interval: 12000
    onTriggered: root.restorePoint = null
  }

  // Anything computed from the last run, cleared when the subject changes.
  function clearDerived() {
    root.imagePath = ""
    root.imageError = ""
    root.decodedText = ""
    root.decodeError = ""
    root.decoding = false
  }

  function loadChain(nextChain, seedInput) {
    root.tool = null
    root.state = ({})
    clearDerived()
    if (!nextChain) { root.chain = null; return }
    var session = root.sessions["chain:" + nextChain.id]
    // Same swap rule as loadTool: blank across the change, fill in after.
    root.inputText = ""
    root.chain = nextChain
    root.inputText = seedInput !== undefined && seedInput !== null
      ? seedInput : (session ? session.input : "")
    recompute()
  }

  // ---- chain editing. Each returns a new chain object rather than mutating
  // the current one, so the property change propagates to the view.
  // Every one of these is called from a button inside a step card, and writing
  // `chain` rebuilds the Repeater that owns that card — destroying the button
  // whose click handler is still on the stack, which Qt treats as fatal and
  // aborts the whole shell for. So the write is queued to run once the handler
  // has returned.
  //
  // The edit is passed as a function rather than a finished chain so it is
  // computed against whatever `chain` holds when it runs: two quick clicks
  // both built from the chain as it was before either of them, and the second
  // silently undid the first.
  function applyChainEdit(edit) {
    Qt.callLater(function () {
      var next = typeof edit === "function" ? edit(root.chain) : edit
      if (!next) return
      root.chain = next
      root.chainEdited(next)
      recompute()
    })
  }

  function addChainStep(toolId) {
    applyChainEdit(function (chain) { return Chain.addStep(chain, toolId, null) })
  }
  function removeChainStep(index) {
    // A removed step takes its options with it, and there is no confirm here.
    captureChainRestorePoint("removing a step")
    applyChainEdit(function (chain) { return Chain.removeStep(chain, index) })
  }
  function moveChainStep(index, delta) {
    applyChainEdit(function (chain) { return Chain.moveStep(chain, index, delta) })
  }
  function setChainStepState(index, key, value) {
    applyChainEdit(function (chain) { return Chain.setStepState(chain, index, key, value) })
  }

  function renameChain(name) {
    var next = Chain.normalize(root.chain)
    next.name = String(name)
    applyChainEdit(next)
  }

  function stateValue(key, fallback) {
    if (!root.state || root.state[key] === undefined) return fallback
    return root.state[key]
  }

  function setStateValue(key, value) {
    var next = ({})
    for (var k in root.state) next[k] = root.state[k]
    next[key] = value
    root.state = next
    recompute()
    persistSession()
  }

  function setInput(text) {
    root.inputText = String(text)
    debounce.restart()
  }

  // The examples available here, whether that is a tool, a built-in chain, or
  // a chain the user built themselves. Three each; the button picks one.
  readonly property var availableSamples: {
    if (root.chainMode)
      return root.chain ? Samples.forChainOrBorrow(root.chain, Chain.run) : []
    return root.tool ? Samples.forTool(root.tool.id) : []
  }

  function loadSample() {
    var choices = root.availableSamples
    if (choices.length === 0) return
    // Never the one already on screen, so pressing the button always shows
    // something new.
    var sample = Samples.pick(choices, root.inputText)
    if (!sample) return

    captureRestorePoint("the sample was loaded")
    // Options first: an example that needs Decode selected has to arrive with
    // it selected, or the first thing it demonstrates is an error.
    if (sample.state) {
      var next = ({})
      for (var k in root.state) next[k] = root.state[k]
      for (var key in sample.state) next[key] = sample.state[key]
      root.state = next
      persistSession()
    }
    setInput(sample.input)
    recompute()
    if (sample.label)
      root.statusMessage("Sample: " + sample.label)
  }

  // The failing envelope, whichever mode produced it. For a chain only the
  // first step's position is usable — a later step's error refers to an
  // intermediate value that isn't on screen anywhere.
  readonly property var errorSource: {
    if (root.chainMode) {
      if (!root.chainResult || root.chainResult.ok || root.chainResult.failedAt !== 0) return null
      return root.chainResult.steps.length > 0 ? root.chainResult.steps[0] : null
    }
    return root.result && !root.result.ok ? root.result : null
  }

  readonly property bool canJumpToError: root.errorSource !== null
    && (root.errorSource.errorIndex >= 0 || root.errorSource.errorLine > 0)

  function jumpToError() {
    if (!root.canJumpToError) return
    var source = root.errorSource
    var index = source.errorIndex >= 0
      ? source.errorIndex
      : Catalog.indexOfPosition(root.inputText, source.errorLine, source.errorColumn || 1)
    if (!viewLoader.item || typeof viewLoader.item.jumpToError !== "function") return
    if (!viewLoader.item.jumpToError(index))
      root.statusMessage("That part of the input is past what's shown here")
  }

  // Ctrl+Enter / the Regenerate button: always runs, whatever the size.
  function rerun() { recompute(true) }

  // Hands the work to the runner, which decides between running inline and
  // running on the worker thread. The result arrives via runner.finished, so
  // nothing here blocks the shell.
  function recompute(force) {
    if (!root.tool && !root.chainMode) return
    if (!force && runner.needsExplicitRun(root.inputText, root.state)) {
      root.awaitingRun = true
      // Drop the previous run's output: it answers the old input, and leaving
      // it on screen beside the new one is worse than showing nothing.
      root.result = Catalog.emptyResult()
      root.chainResult = null
      return
    }
    root.awaitingRun = false
    if (root.chainMode) runner.runChain(root.chain, root.inputText)
    else runner.run(root.tool, root.inputText, root.state)
  }

  property Runner runner: Runner {
    onFinished: function (envelope) {
      root.result = envelope
      if (root.tool && root.tool.view === "image") root.regenerateImage()
      if (root.tool && (root.tool.view === "decode" || root.tool.view === "dataurl"))
        root.rerunTextCommand()
      if (envelope.ok && root.inputText.length > 0)
        root.entryUsed(root.sessionKey(), root.inputText, root.state)
    }
    onChainFinished: function (outcome) {
      root.chainResult = outcome
      root.regenerateImage()
    }
  }

  function runAction(actionId) {
    if (!root.tool || typeof root.tool.action !== "function") return
    var produced = root.tool.action(actionId, root.inputText, root.state)
    if (produced !== undefined && produced !== null) {
      setInput(String(produced))
      recompute()
    }
  }

  // ------------------------------------------------------------ clipboard

  function copy(text) {
    if (!bridge || !text || String(text).length === 0) return
    bridge.copyText(String(text))
    root.statusMessage("Copied " + String(text).length + " characters")
  }

  function copyImage() {
    if (!bridge || root.imagePath.length === 0) return
    bridge.copyImage(root.imagePath)
    root.statusMessage("Image copied to the clipboard")
  }

  function saveImage() {
    if (!bridge || root.imagePath.length === 0) return
    bridge.saveImage(root.imagePath, function (destination, error) {
      root.statusMessage(error.length > 0 ? error : "Saved to " + destination)
    })
  }

  // The actions every input pane offers, in one place so a new one — pasting
  // the primary selection, say — appears everywhere at once rather than in
  // whichever views someone remembered to update.
  // In chain mode the title is a bordered text field, so the header buttons
  // take its height and the row reads as one line. Applied to all of them, not
  // just one, or they disagree with each other whenever two are visible.
  readonly property real headerButtonHeight: root.chainMode ? titleLoader.height : -1

  readonly property var inputActions: {
    var out = []
    out.push({ icon: "󰆒", tooltip: "Paste from the clipboard",
               action: function () { root.pasteIntoInput() } })
    out.push({ icon: "󰗧", tooltip: "Paste the primary selection (what you have highlighted)",
               action: function () { root.pasteSelectionIntoInput() } })
    out.push({ icon: "󰅖", tooltip: "Clear", action: function () { root.setInput("") } })
    return out
  }


  readonly property var decodeActions: [
    { icon: "󰋩", label: " Paste image", tooltip: "Read the image on your clipboard",
      action: function () { root.pasteImageIntoInput() } },
    { icon: "󰑐", tooltip: "Scan it again", action: function () { root.rerunTextCommand() } }
  ]

  // The actions every image pane offers, in one place so the QR tool and a
  // chain that ends in an image behave identically.
  // The manual version of a chain: run a tool, push its output back in, run
  // another. Worth pointing out the real thing the first time it happens.
  function recycleOutput(text) {
    captureRestorePoint("the output was sent back")
    setInput(text)
    if (!root.chainMode) root.manualChainNoticed()
  }

  readonly property var imageActions: [
    { icon: "󰆏", label: " Copy image", tooltip: "Copy the image to the clipboard",
      action: function () { root.copyImage() } },
    { icon: "󰆓", label: " Save", tooltip: "Save into ~/Pictures",
      action: function () { root.saveImage() } }
  ]

  function pasteIntoInput() { pasteInto("") }
  function pasteSelectionIntoInput() { pasteInto("", true) }

  // key === "" targets the main input; anything else targets that state key
  // (the diff view's right-hand pane).
  function pasteInto(key, primary) {
    if (!bridge) return
    if (!key || key.length === 0) captureRestorePoint("pasting")
    bridge.readText(primary === true, function (text) {
      if (key && key.length > 0) setStateValue(key, text)
      else { setInput(text); recompute() }
    })
  }

  // ------------------------------------------------------------ images

  // Either a single image tool, or a chain whose last step produces one.
  readonly property var activeImageCommand: {
    if (root.chainMode)
      return root.chainResult && root.chainResult.imageCommand ? root.chainResult.imageCommand : null
    return root.result && root.result.imageCommand ? root.result.imageCommand : null
  }

  // Runs the argv a tool asked for and treats its stdout as the output. Used
  // by the QR reader; the mirror of regenerateImage.
  function rerunTextCommand() {
    if (!bridge) return
    root.decodedText = ""
    root.decodeError = ""
    if (!root.result || !root.result.textCommand) { root.decoding = false; return }
    root.decoding = true
    var envelope = root.result
    bridge.runTextCommand(envelope.textCommand, function (output, error) {
      root.decoding = false
      var body = String(output).replace(/\s+$/, "")
      root.decodedText = body.length > 0 ? envelope.textPrefix + body + envelope.textSuffix : ""
      root.decodeError = String(error)
    })
  }

  // Loads an image from the clipboard for a decode tool to read.
  function pasteImageIntoInput() {
    if (!bridge) return
    bridge.readClipboardImage(function (path, error) {
      if (error.length > 0) {
        root.decodeError = error
        return
      }
      setInput(path)
      recompute(true)
    })
  }

  function regenerateImage() {
    if (!bridge) return
    root.imagePath = ""
    root.imageError = ""
    var command = root.activeImageCommand
    if (!command) return
    bridge.renderImage(command, function (path, error) {
      root.imagePath = path
      root.imageError = error
    })
  }

  Timer {
    id: debounce
    // Small inputs recompute almost immediately; larger ones wait for a real
    // pause in typing, since each run costs a thread hop and a copy.
    interval: runner.runsInline(root.inputText, root.state) ? 80 : 300
    onTriggered: {
      root.recompute(false)
      root.persistSession()
    }
  }

  // ------------------------------------------------------------ layout

  Column {
    anchors.fill: parent
    spacing: Style.spacing.md

    // ---- header
    Item {
      width: parent.width
      height: titleColumn.implicitHeight

      Column {
        id: titleColumn
        anchors.left: parent.left
        anchors.right: headerButtons.left
        anchors.rightMargin: Style.spacing.md
        spacing: Style.spacing.xxs

        // A chain's name is editable in place; a tool's is not.
        Loader {
          id: titleLoader
          width: parent.width
          sourceComponent: root.chainMode ? chainTitle : toolTitle
        }

        Text {
          textFormat: Text.PlainText
          width: parent.width
          text: root.chainMode ? Chain.describe(root.chain) : (root.tool ? root.tool.description : "")
          color: Qt.darker(root.foreground, 1.45)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.bodySmall
          elide: Text.ElideRight
        }
      }

      Row {
        id: headerButtons
        anchors.right: parent.right
        // On the title's line, not the centre of the title-plus-description
        // block. In chain mode the title is a bordered text field, and centring
        // against the whole block left these buttons hanging off its bottom
        // edge, lined up with neither the field nor the description.
        //
        // A plain binding rather than an anchor: titleLoader is a child of the
        // sibling column, and Qt refuses to anchor to anything that is not a
        // parent or sibling — it warns and leaves the item wherever it was.
        y: Math.round(titleLoader.y + titleLoader.height / 2 - height / 2)
        spacing: Style.spacing.sm

        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          text: root.runStatus
          visible: text.length > 0
          color: root.awaitingRun ? root.accent : Qt.darker(root.foreground, 1.45)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
          rightPadding: Style.spacing.sm
        }

        Button {
          text: "Run"
          height: root.headerButtonHeight > 0 ? root.headerButtonHeight : implicitHeight
          bordered: true
          visible: root.awaitingRun
          foreground: root.foreground
          accent: root.accent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.rerun()
        }

        Button {
          text: "Undo"
          height: root.headerButtonHeight > 0 ? root.headerButtonHeight : implicitHeight
          iconText: "󰕌"
          tooltipText: root.restorePoint
            ? "Restore what was there before " + root.restorePoint.what : ""
          bordered: true
          visible: root.canRestore
          foreground: root.accent
          accent: root.accent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          iconSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.restore()
        }

        // Worded and up here with the other actions. As an unlabelled glyph in
        // the input pane's icon row it was effectively invisible — the one
        // button whose whole job is helping someone who does not yet know what
        // the tool wants, so it says what it does in full.
        Button {
          text: "Load Sample"
          iconText: "󱟃"
          tooltipText: root.availableSamples.length > 1
            ? "Load a sample \u2014 press again for another of "
              + root.availableSamples.length
            : "Load a sample"
          bordered: true
          height: root.headerButtonHeight > 0 ? root.headerButtonHeight : implicitHeight
          visible: root.availableSamples.length > 0
          foreground: root.foreground
          accent: root.accent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          iconSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.loadSample()
        }

        Button {
          text: "Chain"
          height: root.headerButtonHeight > 0 ? root.headerButtonHeight : implicitHeight
          iconText: "󰽜"
          tooltipText: "Start a chain with this tool as the first step"
          bordered: true
          // Hidden for tools that cannot be a step at all — offering to start
          // a chain with History or a generator only builds a broken one.
          visible: !root.chainMode && root.tool !== null
            && Catalog.stepBlockReason(root.tool) === ""
          foreground: root.foreground
          accent: root.accent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          iconSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.chainRequested(root.tool.id, root.state, root.inputText)
        }

        Button {
          text: "Delete chain"
          bordered: true
          // Matches the name field it sits beside, so the two read as one row
          // rather than a tall box with a small sticker next to it.
          height: root.headerButtonHeight > 0 ? root.headerButtonHeight : implicitHeight
          visible: root.chainMode
          foreground: Color.urgent
          accent: Color.urgent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.deleteConfirmOpen = true
        }

        Repeater {
          model: root.tool && root.tool.actions ? root.tool.actions : []

          Button {
            required property var modelData
            text: modelData.label
            bordered: true
            foreground: root.foreground
            accent: root.accent
            fontFamily: Style.font.menuFamily
            fontSize: Style.font.caption
            verticalPadding: Style.spacing.xxs
            onClicked: root.runAction(modelData.id)
          }
        }
      }
    }

    // ---- secondary single-line input (JWT secret, regex pattern, HMAC key)
    Row {
      width: parent.width
      height: visible ? secondaryField.height : 0
      spacing: Style.spacing.md
      visible: !root.chainMode && root.tool !== null && root.tool.secondary !== undefined

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(90)
        text: root.tool && root.tool.secondary ? root.tool.secondary.label : ""
        color: Qt.darker(root.foreground, 1.35)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.bodySmall
        horizontalAlignment: Text.AlignRight
      }

      TextField {
        id: secondaryField
        width: parent.width - Style.space(90) - Style.spacing.md
        foreground: root.foreground
        accent: root.accent
        placeholderText: root.tool && root.tool.secondary ? root.tool.secondary.placeholder : ""
        password: root.tool && root.tool.secondary ? root.tool.secondary.password === true : false
        font.family: root.tool && root.tool.secondary && root.tool.secondary.mono
          ? Style.fontFamily : Style.font.menuFamily
        text: root.tool && root.tool.secondary ? String(root.stateValue(root.tool.secondary.key, "")) : ""
        verticalPadding: Style.spacing.xxs
        onTextEdited: root.setStateValue(root.tool.secondary.key, text)
      }
    }

    // ---- options
    OptionBar {
      id: optionBar
      width: parent.width
      visible: !root.chainMode && root.tool !== null && (((root.tool.modes || []).length > 0)
        || ((root.tool.options || []).length > 0))
      tool: root.tool
      state: root.state
      foreground: root.foreground
      accent: root.accent
      onChanged: function (key, value) { root.setStateValue(key, value) }
    }

    // ---- the view itself
    Loader {
      id: viewLoader
      width: parent.width
      height: parent.height - y
      source: {
        if (root.chainMode) return Qt.resolvedUrl("views/ChainView.qml")
        if (!root.tool) return ""
        var name = root.tool.view.charAt(0).toUpperCase() + root.tool.view.slice(1)
        return Qt.resolvedUrl("views/" + name + "View.qml")
      }
      onLoaded: if (item) item.host = root
    }
  }

  ConfirmDialog {
    anchors.fill: parent
    z: 10
    opened: root.deleteConfirmOpen
    message: root.chain ? "Delete the chain “" + root.chain.name + "”?" : ""
    confirmText: "Delete"
    foreground: root.foreground
    fontFamily: Style.font.menuFamily
    onCanceled: root.deleteConfirmOpen = false
    onConfirmed: {
      root.deleteConfirmOpen = false
      if (root.chain) root.chainDeleted(root.chain.id)
    }
  }

  // After seeding a chain from a tool, open the step picker so the next move
  // is visible rather than something you have to go looking for.
  function promptForNextStep() {
    Qt.callLater(function () {
      if (viewLoader.item && typeof viewLoader.item.focusAddStep === "function")
        viewLoader.item.focusAddStep()
    })
  }

  function focusInput() {
    if (viewLoader.item && typeof viewLoader.item.focusInput === "function") viewLoader.item.focusInput()
  }

  property Component toolTitle: Component {
    Text {
      textFormat: Text.PlainText
      text: root.tool ? root.tool.name : ""
      color: root.foreground
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.heading
      elide: Text.ElideRight
    }
  }

  property Component chainTitle: Component {
    TextField {
      text: root.chain ? root.chain.name : ""
      foreground: root.foreground
      accent: root.accent
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.heading
      horizontalPadding: Style.spacing.xs
      verticalPadding: 0
      onEditingFinished: if (text !== root.chain.name) root.renameChain(text)
    }
  }
}

import QtQuick
import qs.Commons
import qs.Ui
import "../"

// The mirror of ImageView: a picture on the left, the text read out of it on
// the right. Where the QR tool turns text into a code, this turns a code —
// a screenshot of one, usually — back into text.
Item {
  id: root
  property var host: null

  readonly property bool sideBySide: width > Style.space(680)
  readonly property bool hasImage: host.inputText.length > 0

  // Nothing to type into, so focus goes to the result for copying.
  function focusInput() { resultPane.focusEditor() }

  Grid {
    anchors.fill: parent
    // Only columns is set: giving Grid both makes rows*columns a hard cap on
    // how many children it will lay out, which silently drops a pane.
    columns: root.sideBySide ? 2 : 1
    spacing: Style.spacing.md

    ImagePane {
      id: sourcePane
      width: root.sideBySide ? (parent.width - Style.spacing.md) / 2 : parent.width
      height: root.sideBySide ? parent.height : (parent.height - Style.spacing.md) / 2
      label: "Image"
      placeholder: "Copy an image containing a QR code — a screenshot will do — then press Paste image"
      imagePath: host.inputText
      imageError: host.decodeError
      foreground: host.foreground
      accent: host.accent
      actions: host.decodeActions
      actionsAlwaysVisible: true
    }

    CodeArea {
      id: resultPane
      width: sourcePane.width
      height: sourcePane.height
      label: "Decoded"
      readOnly: true
      foreground: host.foreground
      accent: host.accent
      placeholder: host.decodeError.length > 0 ? ""
        : (root.hasImage ? "Reading…" : "Whatever the code says appears here")
      text: host.decodedText
      status: {
        if (host.decoding) return "scanning…"
        if (host.decodeError.length > 0) return host.decodeError
        if (host.decodedText.length === 0) return ""
        var lines = host.decodedText.split("\n").length
        return lines > 1 ? lines + " codes found" : "1 code found"
      }
      statusIsError: host.decodeError.length > 0
      actions: [
        { icon: "󰆏", tooltip: "Copy the decoded text",
          action: function () { host.copy(host.decodedText) } },
        { icon: "󰓡", tooltip: "Send it to another tool",
          action: function () { host.copy(host.decodedText) } }
      ]
    }
  }
}

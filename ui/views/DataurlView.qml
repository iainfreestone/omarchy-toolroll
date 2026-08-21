import QtQuick
import qs.Commons
import qs.Ui
import "../"

// Image on the left, text on the right, both directions. The panes keep their
// places when the mode flips — only which one is the source changes — because
// swapping their positions as well would make the toggle feel like a different
// screen rather than the same one running backwards.
Item {
  id: root
  property var host: null

  readonly property bool sideBySide: width > Style.space(680)
  readonly property bool decoding: host.stateValue("mode", "encode") === "decode"

  function focusInput() {
    if (root.decoding) textPane.focusEditor()
    else textPane.focusEditor()
  }

  Grid {
    anchors.fill: parent
    // Only columns is set: giving Grid both makes rows*columns a hard cap on
    // how many children it will lay out, which silently drops a pane.
    columns: root.sideBySide ? 2 : 1
    spacing: Style.spacing.md

    ImagePane {
      id: imagePane
      width: root.sideBySide ? (parent.width - Style.spacing.md) / 2 : parent.width
      height: root.sideBySide ? parent.height : (parent.height - Style.spacing.md) / 2
      label: root.decoding ? "Result" : "Source image"
      placeholder: root.decoding
        ? "The picture appears here"
        : "Copy an image, then press Paste image"
      // Encoding reads a file; decoding renders the URI itself.
      imagePath: root.decoding ? "" : host.inputText
      sourceUrl: root.decoding && host.result ? host.result.imageSource : ""
      imageError: host.decodeError
      status: dimensions
      foreground: host.foreground
      accent: host.accent
      actionsAlwaysVisible: !root.decoding
      actions: root.decoding ? host.imageActions : host.decodeActions
    }

    CodeArea {
      id: textPane
      width: imagePane.width
      height: imagePane.height
      label: root.decoding ? "Data URI" : "Data URI"
      readOnly: !root.decoding
      foreground: host.foreground
      accent: host.accent
      placeholder: root.decoding
        ? "Paste a data URI, or a url(data:…) lifted out of a stylesheet"
        : "The encoded URI appears here"
      text: root.decoding ? host.inputText : host.decodedText
      status: {
        if (host.decoding) return "encoding…"
        if (!root.decoding && host.decodeError.length > 0) return host.decodeError
        if (root.decoding && host.result && !host.result.ok) return host.result.error
        if (host.result) return host.result.info
        return ""
      }
      statusIsError: (host.result && !host.result.ok) || host.decodeError.length > 0
      actions: root.decoding
        ? host.inputActions
        : [{ icon: "󰆏", tooltip: "Copy the data URI",
             action: function () { host.copy(host.decodedText) } }]
      onEdited: function (value) { if (root.decoding) host.setInput(value) }
    }
  }
}

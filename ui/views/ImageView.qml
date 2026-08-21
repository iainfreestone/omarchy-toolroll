import QtQuick
import qs.Commons
import qs.Ui
import "../"

// Input on the left, the generated image on the right. The image itself is
// produced by an external command declared by the tool; the host runs it and
// hands back a file path.
Item {
  id: root
  property var host: null

  readonly property bool sideBySide: width > Style.space(680)

  // Clicking a positioned error puts the cursor on it.
  function jumpToError(index) { return inputPane.focusAt(index) }

  function focusInput() { inputPane.focusEditor() }

  Grid {
    anchors.fill: parent
    // Only columns is set: giving Grid both makes rows*columns a hard cap on
    // how many children it will lay out, which silently drops a pane.
    columns: root.sideBySide ? 2 : 1
    spacing: Style.spacing.md

    CodeArea {
      id: inputPane
      width: root.sideBySide ? (parent.width - Style.spacing.md) / 2 : parent.width
      height: root.sideBySide ? parent.height : (parent.height - Style.spacing.md) / 2
      label: "Content"
      placeholder: host.inputPlaceholder
      foreground: host.foreground
      accent: host.accent
      text: host.inputText
      status: host.result ? host.result.info : ""
      actions: host.inputActions
      onEdited: function (value) { host.setInput(value) }
    }

    ImagePane {
      width: inputPane.width
      height: inputPane.height
      label: "Preview"
      placeholder: "Type something to generate a code"
      imagePath: host.imagePath
      imageError: host.imageError
      foreground: host.foreground
      accent: host.accent
      actions: host.imageActions
    }
  }
}

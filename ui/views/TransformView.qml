import QtQuick
import qs.Commons
import "../"

// Input on the left, output on the right. Splits vertically when the card is
// too narrow for two readable columns.
Item {
  id: root
  property var host: null

  readonly property bool sideBySide: width > Style.space(760)

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
      label: "Input"
      placeholder: host ? host.inputPlaceholder : ""
      status: host && host.result && !host.result.ok ? "" : (host ? host.result.info : "")
      foreground: host ? host.foreground : Color.menu.text
      accent: host ? host.accent : Color.accent
      text: host ? host.inputText : ""
      actions: host.inputActions
      onEdited: function (value) { host.setInput(value) }
    }

    CodeArea {
      id: outputPane
      width: inputPane.width
      height: inputPane.height
      label: "Output"
      readOnly: true
      foreground: host ? host.foreground : Color.menu.text
      accent: host ? host.accent : Color.accent
      placeholder: "Output appears here"
      text: host && host.result ? (host.result.ok ? host.result.output : "") : ""
      status: host && host.result && !host.result.ok ? host.result.error : ""
      statusIsError: host && host.result ? !host.result.ok : false
      statusClickable: host ? host.canJumpToError : false
      onStatusClicked: host.jumpToError()
      actions: [
        { icon: "󰆏", tooltip: "Copy output", action: function () { host.copy(host.result.output) } },
        { icon: "󰓡", tooltip: "Send output back to the input", action: function () { host.recycleOutput(host.result.output) } }
      ]
    }
  }
}

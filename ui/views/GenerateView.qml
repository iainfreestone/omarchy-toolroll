import QtQuick
import qs.Commons
import "../"

// Generators have no input: the options bar above is the whole form, and this
// view is just the result plus a way to make another one.
Item {
  id: root
  property var host: null

  function focusInput() { outputPane.focusEditor() }

  CodeArea {
    id: outputPane
    anchors.fill: parent
    label: "Generated"
    readOnly: true
    foreground: host.foreground
    accent: host.accent
    placeholder: "Press Regenerate"
    text: host.result ? host.result.output : ""
    status: host.result ? host.result.info : ""
    actions: [
      { icon: "󰑐", label: " Regenerate", tooltip: "Generate a new set (Ctrl+Enter)",
        action: function () { host.rerun() } },
      { icon: "󰆏", tooltip: "Copy", action: function () { host.copy(host.result.output) } }
    ]
  }
}

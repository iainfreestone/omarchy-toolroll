import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "../"

// Source on the left, rendered result on the right. Qt's own Markdown and
// rich-text renderers do the work, which keeps the preview completely offline
// — no embedded browser, no network, no scripts.
Item {
  id: root
  property var host: null

  readonly property bool sideBySide: width > Style.space(700)

  // Clicking a positioned error puts the cursor on it.
  function jumpToError(index) { return sourcePane.focusAt(index) }

  function focusInput() { sourcePane.focusEditor() }

  Grid {
    anchors.fill: parent
    // Only columns is set: giving Grid both makes rows*columns a hard cap on
    // how many children it will lay out, which silently drops a pane.
    columns: root.sideBySide ? 2 : 1
    spacing: Style.spacing.md

    CodeArea {
      id: sourcePane
      width: root.sideBySide ? (parent.width - Style.spacing.md) / 2 : parent.width
      height: root.sideBySide ? parent.height : (parent.height - Style.spacing.md) / 2
      label: host.tool && host.tool.format === "markdown" ? "Markdown" : "HTML"
      placeholder: host.inputPlaceholder
      foreground: host.foreground
      accent: host.accent
      text: host.inputText
      status: host.result ? host.result.info : ""
      actions: host.inputActions
      onEdited: function (value) { host.setInput(value) }
    }

    BorderSurface {
      width: sourcePane.width
      height: sourcePane.height
      radius: Style.cornerRadius
      color: Util.alpha(host.foreground, 0.03)
      borderSpec: Border.controlSpec("normal", host.foreground, host.accent)

      ScrollView {
        anchors.fill: parent
        anchors.margins: Style.spacing.lg
        clip: true

        // The one deliberate rich-text sink in the plugin. Everything it is
        // handed has been through Sanitize.forPreview first, which strips every
        // resource reference that is not a data: URI — see lib/sanitize.js.
        Text {
          width: root.sideBySide
            ? sourcePane.width - Style.spacing.lg * 2 - Style.spacing.sm
            : root.width - Style.spacing.lg * 2 - Style.spacing.sm
          text: host.result ? host.result.output : ""
          textFormat: host.tool && host.tool.format === "markdown" ? Text.MarkdownText : Text.RichText
          color: host.foreground
          linkColor: host.accent
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
          // A preview must never become a way to fetch remote content.
          onLinkActivated: function (link) { }
        }
      }
    }
  }
}

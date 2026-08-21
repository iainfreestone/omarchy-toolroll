import QtQuick
import qs.Commons
import qs.Ui
import "../"
import "../../lib/palette.js" as Palette

// Two inputs above, the annotated diff below. Added and removed lines are
// tinted with the theme's accent and urgent roles rather than hard-coded
// green and red, so the diff still reads on every Omarchy theme.
Item {
  id: root
  property var host: null

  // Green for an addition is near-universal, and until now this used the accent
  // because the shell does not expose the theme's green. It does declare one,
  // though — so use the theme's own rather than a hard-coded green that would
  // fight it.
  readonly property color addedColor: Palette.color(host.bridge.palette, "green", Color.accent)
  readonly property color removedColor: Palette.color(host.bridge.palette, "red", Color.urgent)

  // Clicking a positioned error puts the cursor on it.
  function jumpToError(index) { return leftPane.focusAt(index) }

  function focusInput() { leftPane.focusEditor() }

  Column {
    anchors.fill: parent
    spacing: Style.spacing.md

    Row {
      width: parent.width
      height: Math.round(parent.height * 0.4)
      spacing: Style.spacing.md

      CodeArea {
        id: leftPane
        width: (parent.width - Style.spacing.md) / 2
        height: parent.height
        label: "Left"
        placeholder: "Original text"
        foreground: host.foreground
        accent: host.accent
        text: host.inputText
        actions: host.inputActions
        onEdited: function (value) { host.setInput(value) }
      }

      CodeArea {
        id: rightPane
        width: leftPane.width
        height: parent.height
        label: "Right"
        placeholder: "Changed text"
        foreground: host.foreground
        accent: host.accent
        text: host.stateValue("right", "")
        actions: [
          { icon: "󰆒", tooltip: "Paste from the clipboard", action: function () { host.pasteInto("right") } },
          { icon: "󰗧", tooltip: "Paste the primary selection",
            action: function () { host.pasteInto("right", true) } },
          { icon: "󰅖", tooltip: "Clear", action: function () { host.setStateValue("right", "") } }
        ]
        onEdited: function (value) { host.setStateValue("right", value) }
      }
    }

    BorderSurface {
      width: parent.width
      height: parent.height - Math.round(parent.height * 0.4) - Style.spacing.md
      radius: Style.cornerRadius
      color: Util.alpha(host.foreground, 0.03)
      borderSpec: Border.controlSpec("normal", host.foreground, host.accent)

      ListView {
        id: rowList
        anchors.fill: parent
        anchors.margins: Style.spacing.sm
        clip: true
        model: host.result ? host.result.rows : []
        boundsBehavior: Flickable.StopAtBounds

        delegate: Row {
          id: diffRow
          required property var modelData
          width: rowList.width
          height: lineText.implicitHeight

          readonly property color tint: modelData.type === "add" ? root.addedColor
            : (modelData.type === "remove" ? root.removedColor : host.foreground)

          Rectangle {
            width: rowList.width
            height: parent.height
            x: 0
            color: modelData.type === "same" ? "transparent" : Util.alpha(diffRow.tint, 0.1)

            Row {
              anchors.fill: parent
              spacing: Style.spacing.sm

              Text {
                textFormat: Text.PlainText
                width: Style.space(46)
                text: (modelData.leftNo ? String(modelData.leftNo) : "") + " "
                color: Qt.darker(host.foreground, 1.7)
                font.family: Style.fontFamily
                font.pixelSize: Style.font.bodySmall
                horizontalAlignment: Text.AlignRight
              }

              Text {
                textFormat: Text.PlainText
                width: Style.space(46)
                text: (modelData.rightNo ? String(modelData.rightNo) : "") + " "
                color: Qt.darker(host.foreground, 1.7)
                font.family: Style.fontFamily
                font.pixelSize: Style.font.bodySmall
                horizontalAlignment: Text.AlignRight
              }

              Text {
                textFormat: Text.PlainText
                id: lineText
                width: rowList.width - Style.space(110)
                text: (modelData.type === "add" ? "+ " : (modelData.type === "remove" ? "− " : "  ")) + modelData.text
                color: diffRow.tint
                font.family: Style.fontFamily
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
              }
            }
          }
        }
      }

      Text {
        textFormat: Text.PlainText
        anchors.centerIn: parent
        visible: rowList.count === 0
        text: "Paste text into both panes to compare them"
        color: Qt.darker(host.foreground, 1.4)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.body
      }
    }
  }
}

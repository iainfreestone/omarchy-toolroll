import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "../"
import "../../lib/history.js" as History
import "../../lib/catalog.js" as Catalog

// Everything run this session, newest first. Clicking an entry puts you back
// exactly where you were: same tool, same input, same options.
Item {
  id: root
  property var host: null

  readonly property var entries: host && host.bridge ? host.bridge.history : []
  // Recomputed on a timer rather than bound to the clock, so "2m ago" ages
  // without every entry re-rendering on every frame.
  property double now: Date.now()

  function focusInput() { }

  Timer {
    interval: 15000
    running: root.entries.length > 0
    repeat: true
    onTriggered: root.now = Date.now()
  }

  Column {
    anchors.fill: parent
    spacing: Style.spacing.sm

    Item {
      width: parent.width
      height: Style.spacing.controlHeight

      PanelSectionHeader {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: {
          var summary = History.summarize(root.entries)
          if (summary.entries === 0) return "NOTHING YET"
          return summary.entries + (summary.entries === 1 ? " ENTRY" : " ENTRIES")
            + " ACROSS " + summary.tools + (summary.tools === 1 ? " TOOL" : " TOOLS")
        }
        foreground: host.foreground
      }

      Button {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: "Clear"
        bordered: true
        visible: root.entries.length > 0
        foreground: Color.urgent
        accent: Color.urgent
        fontFamily: Style.font.menuFamily
        fontSize: Style.font.caption
        verticalPadding: Style.spacing.xxs
        onClicked: host.bridge.clearHistory()
      }
    }

    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.entries.length === 0
      text: "Runs are recorded here as you work, and kept in memory only —\n"
        + "this is a tool you paste tokens into, so nothing is written to disk."
      color: Qt.darker(host.foreground, 1.4)
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.body
      topPadding: Style.spacing.lg
    }

    ScrollView {
      width: parent.width
      height: parent.height - y
      clip: true
      visible: root.entries.length > 0

      Column {
        width: root.width - Style.spacing.md
        spacing: Style.spacing.xxs

        Repeater {
          model: root.entries

          Rectangle {
            id: row
            required property var modelData
            required property int index

            width: parent.width
            height: Math.max(Style.space(38), previewText.implicitHeight + Style.spacing.xl)
            radius: Style.cornerRadius
            color: hover.containsMouse ? Style.hoverFill : "transparent"

            Column {
              anchors.left: parent.left
              anchors.right: removeButton.left
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.spacing.sm
              anchors.rightMargin: Style.spacing.sm
              spacing: Style.spacing.xxs

              Row {
                spacing: Style.spacing.sm

                Text {
                  textFormat: Text.PlainText
                  text: row.modelData.label
                  color: host.foreground
                  font.family: Style.font.menuFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }

                Text {
                  textFormat: Text.PlainText
                  text: History.relative(row.modelData, root.now)
                  color: Qt.darker(host.foreground, 1.55)
                  font.family: Style.font.menuFamily
                  font.pixelSize: Style.font.caption
                }
              }

              Text {
                textFormat: Text.PlainText
                id: previewText
                width: parent.width
                text: History.preview(row.modelData.input, 140)
                color: Qt.darker(host.foreground, 1.25)
                font.family: Style.fontFamily
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
              }
            }

            Button {
              id: removeButton
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              iconText: "󰅖"
              tooltipText: "Forget this one"
              visible: hover.containsMouse
              foreground: host.foreground
              accent: host.accent
              iconSize: Style.font.iconSmall
              horizontalPadding: Style.spacing.xs
              verticalPadding: Style.spacing.xxs
              onClicked: host.bridge.forgetHistory(row.index)
            }

            MouseArea {
              id: hover
              anchors.fill: parent
              anchors.rightMargin: removeButton.width
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: host.bridge.restoreHistory(row.index)
            }
          }
        }
      }
    }
  }
}

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "../"

// Input on top, a table of labelled values plus optional text sections below.
// Every row copies on click, which is the whole point of a report: you came
// here to take one of these values away with you.
Item {
  id: root
  property var host: null

  // Clicking a positioned error puts the cursor on it.
  function jumpToError(index) { return inputPane.focusAt(index) }

  function focusInput() { inputPane.focusEditor() }

  readonly property var report: host && host.result ? host.result : null
  readonly property int inputHeight: Math.min(Style.space(150), Math.round(height * 0.32))

  Column {
    anchors.fill: parent
    spacing: Style.spacing.md

    CodeArea {
      id: inputPane
      width: parent.width
      height: root.inputHeight
      label: "Input"
      placeholder: host ? host.inputPlaceholder : ""
      foreground: host ? host.foreground : Color.menu.text
      accent: host ? host.accent : Color.accent
      text: host ? host.inputText : ""
      status: host && host.result && !host.result.ok ? host.result.error : ""
      statusIsError: host && host.result ? !host.result.ok : false
      statusClickable: host ? host.canJumpToError : false
      onStatusClicked: host.jumpToError()
      actions: host.inputActions
      onEdited: function (value) { host.setInput(value) }
    }

    ScrollView {
      width: parent.width
      height: parent.height - root.inputHeight - Style.spacing.md
      clip: true

      Column {
        width: root.width
        spacing: Style.spacing.xs

        Repeater {
          model: root.report ? root.report.fields : []

          Rectangle {
            required property var modelData
            width: parent.width
            height: Math.max(Style.spacing.controlHeight, valueText.implicitHeight + Style.spacing.sm)
            radius: Style.cornerRadius
            color: fieldHover.containsMouse ? Style.hoverFill : "transparent"

            Row {
              anchors.fill: parent
              anchors.leftMargin: Style.spacing.sm
              anchors.rightMargin: Style.spacing.sm
              spacing: Style.spacing.md

              Text {
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(150)
                text: modelData.label
                color: Qt.darker(host.foreground, 1.35)
                font.family: Style.font.menuFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }

              Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: modelData.swatch ? Style.space(16) : 0
                height: width
                radius: Style.cornerRadius > 0 ? width / 2 : 0
                visible: width > 0
                color: modelData.swatch ? modelData.swatch : "transparent"
                border.width: 1
                border.color: Util.alpha(host.foreground, 0.4)
              }

              Text {
                id: valueText
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - Style.space(150) - Style.spacing.md * 2
                  - (modelData.swatch ? Style.space(16) + Style.spacing.md : 0)
                text: modelData.value + (modelData.note ? "   " + modelData.note : "")
                color: host.foreground
                font.family: modelData.mono ? Style.fontFamily : Style.font.menuFamily
                font.pixelSize: Style.font.body
                elide: Text.ElideRight
              }
            }

            MouseArea {
              id: fieldHover
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: host.copy(modelData.value)
            }
          }
        }

        Repeater {
          model: root.report ? root.report.sections : []

          Item {
            required property var modelData
            width: parent.width
            // Grow with the content up to a ceiling, after which the pane
            // scrolls. Measured from the line count rather than TextMetrics,
            // which reports the width of one laid-out line, not a block.
            height: Math.min(Style.space(340),
              (String(modelData.body).split("\n").length + 1) * Math.round(Style.font.body * 1.6)
                + Style.space(30)) + Style.spacing.sm

            CodeArea {
              anchors.fill: parent
              anchors.topMargin: Style.spacing.sm
              label: parent.modelData.title
              readOnly: true
              foreground: host.foreground
              accent: host.accent
              text: parent.modelData.body
              actions: [{ icon: "󰆏", tooltip: "Copy", action: function () { host.copy(parent.modelData.body) } }]
            }
          }
        }

        Text {
          width: parent.width
          visible: root.report !== null && root.report.fields.length === 0
            && root.report.sections.length === 0 && root.report.info.length > 0
          text: root.report ? root.report.info : ""
          color: Qt.darker(host.foreground, 1.4)
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
          topPadding: Style.spacing.md
        }
      }
    }
  }
}

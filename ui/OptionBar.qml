import QtQuick
import qs.Commons
import qs.Ui

// Renders a tool's declared modes and options. Everything here is driven from
// the catalogue's option descriptors, so adding a knob to a tool never means
// touching QML.
Flow {
  id: root

  property var tool: null
  property var state: ({})
  property color foreground: Color.menu.text
  property color accent: Color.accent

  signal changed(string key, var value)

  spacing: Style.spacing.sm

  function valueOf(key, fallback) {
    if (!root.state || root.state[key] === undefined) return fallback
    return root.state[key]
  }

  Repeater {
    model: root.tool && root.tool.modes ? root.tool.modes : []

    Button {
      required property var modelData
      text: modelData.label
      bordered: true
      selected: root.valueOf("mode", "") === modelData.id
      foreground: root.foreground
      accent: root.accent
      fontFamily: Style.font.menuFamily
      fontSize: Style.font.caption
      verticalPadding: Style.spacing.xxs
      onClicked: root.changed("mode", modelData.id)
    }
  }

  // A gap between the mode switch and the options that modify it.
  Item {
    width: (root.tool && root.tool.modes && root.tool.modes.length) ? Style.spacing.lg : 0
    height: 1
  }

  Repeater {
    model: root.tool && root.tool.options ? root.tool.options : []

    Loader {
      required property var modelData
      sourceComponent: modelData.type === "toggle" ? toggleChip
        : (modelData.type === "select" ? selectChips : textOption)
      onLoaded: item.descriptor = modelData
    }
  }

  Component {
    id: toggleChip

    Button {
      property var descriptor: null
      text: descriptor ? descriptor.label : ""
      iconText: root.valueOf(descriptor ? descriptor.key : "", false) === true ? "󰄲" : "󰄰"
      bordered: true
      selected: root.valueOf(descriptor ? descriptor.key : "", false) === true
      foreground: root.foreground
      accent: root.accent
      fontFamily: Style.font.menuFamily
      fontSize: Style.font.caption
      iconSize: Style.font.caption
      verticalPadding: Style.spacing.xxs
      onClicked: root.changed(descriptor.key, !(root.valueOf(descriptor.key, false) === true))
    }
  }

  Component {
    id: selectChips

    Row {
      property var descriptor: null
      spacing: Style.spacing.xxs

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: parent.descriptor ? parent.descriptor.label + " " : ""
        color: Qt.darker(root.foreground, 1.4)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.caption
      }

      Repeater {
        model: parent.descriptor ? parent.descriptor.choices : []

        Button {
          required property var modelData
          readonly property var descriptor: parent.descriptor
          text: modelData.label
          bordered: true
          selected: root.valueOf(descriptor ? descriptor.key : "", "") === modelData.value
          foreground: root.foreground
          accent: root.accent
          fontFamily: Style.font.menuFamily
          fontSize: Style.font.caption
          verticalPadding: Style.spacing.xxs
          onClicked: root.changed(descriptor.key, modelData.value)
        }
      }
    }
  }

  Component {
    id: textOption

    Row {
      property var descriptor: null
      spacing: Style.spacing.xs

      Text {
        textFormat: Text.PlainText
        anchors.verticalCenter: parent.verticalCenter
        text: parent.descriptor ? parent.descriptor.label : ""
        color: Qt.darker(root.foreground, 1.4)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.caption
      }

      TextField {
        id: optionField
        width: Style.space(90)
        text: String(root.valueOf(parent.descriptor ? parent.descriptor.key : "", ""))
        foreground: root.foreground
        accent: root.accent
        verticalPadding: Style.spacing.xxs
        font.pixelSize: Style.font.caption
        onTextEdited: root.changed(parent.descriptor.key, text)
      }
    }
  }
}

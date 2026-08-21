import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "../"
import "../../lib/catalog.js" as Catalog

// A chain: the input, the steps it flows through, and what comes out.
//
// Input and output sit together on the left so the ends of the pipe stay
// visible while you edit the middle. Each step shows its own options and what
// it did, because the useful question when a chain misbehaves is never "did it
// fail" but "which step, and what did it see".
Item {
  id: root
  property var host: null

  readonly property var chain: host ? host.chain : null
  readonly property var outcome: host ? host.chainResult : null
  readonly property int stepCount: chain ? chain.steps.length : 0
  readonly property bool endsInImage: root.outcome !== null && root.outcome.endsInImage === true

  Component {
    id: textOutput

    CodeArea {
      label: "Output"
      readOnly: true
      foreground: host.foreground
      accent: host.accent
      placeholder: root.stepCount === 0 ? "Add a step to get started" : "Output appears here"
      text: root.outcome ? (root.outcome.ok ? root.outcome.output : "") : ""
      status: root.outcome && !root.outcome.ok ? root.outcome.error : ""
      statusIsError: root.outcome ? !root.outcome.ok : false
      statusClickable: host ? host.canJumpToError : false
      onStatusClicked: host.jumpToError()
      actions: [
        { icon: "󰆏", tooltip: "Copy output",
          action: function () { host.copy(root.outcome ? root.outcome.output : "") } },
        { icon: "󰓡", tooltip: "Send output back to the input",
          action: function () { host.recycleOutput(root.outcome ? root.outcome.output : "") } }
      ]
    }
  }

  Component {
    id: imageOutput

    ImagePane {
      label: "Output"
      // The last step is the one that made the picture; guard the lookup since
      // a chain can be empty.
      status: root.outcome && root.outcome.steps.length > 0
        ? root.outcome.steps[root.outcome.steps.length - 1].summary : ""
      placeholder: "Generating…"
      imagePath: host.imagePath
      imageError: host.imageError
      foreground: host.foreground
      accent: host.accent
      actions: host.imageActions
    }
  }

  // Clicking a positioned error puts the cursor on it.
  function jumpToError(index) { return inputPane.focusAt(index) }

  function focusInput() { inputPane.focusEditor() }
  function focusAddStep() { stepPicker.open() }

  function stepResult(index) {
    if (!root.outcome || !root.outcome.steps) return null
    return index < root.outcome.steps.length ? root.outcome.steps[index] : null
  }

  Row {
    anchors.fill: parent
    spacing: Style.spacing.lg

    // ---------------------------------------------------------------- ends
    Column {
      id: ends
      width: Math.round(parent.width * 0.42)
      height: parent.height
      spacing: Style.spacing.md

      CodeArea {
        id: inputPane
        width: parent.width
        height: (parent.height - Style.spacing.md) / 2
        label: "Input"
        placeholder: host ? host.inputPlaceholder : ""
        foreground: host.foreground
        accent: host.accent
        text: host.inputText
        actions: host.inputActions
        onEdited: function (value) { host.setInput(value) }
      }

      // A chain whose last step is an image tool produces a picture, not the
      // text that went into it, so the output end of the pipe swaps to a
      // preview rather than echoing the input back.
      Loader {
        width: parent.width
        height: inputPane.height
        sourceComponent: root.endsInImage ? imageOutput : textOutput
      }
    }

    // --------------------------------------------------------------- steps
    Column {
      width: parent.width - ends.width - Style.spacing.lg
      height: parent.height
      spacing: Style.spacing.sm

      // Add step lives up here rather than under the list. The dropdown only
      // ever opens downwards, so as the last row in the column its options
      // fell off the bottom edge of the window — you could click the button
      // and see nothing happen. From the header it opens over the steps.
      Item {
        width: parent.width
        height: Style.spacing.controlHeight

        PanelSectionHeader {
          id: stepsLabel
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          text: root.stepCount === 1 ? "1 STEP" : root.stepCount + " STEPS"
          foreground: host.foreground
        }

        Text {
          textFormat: Text.PlainText
          anchors.left: stepsLabel.right
          anchors.leftMargin: Style.spacing.md
          anchors.right: stepPicker.left
          anchors.rightMargin: Style.spacing.md
          anchors.verticalCenter: parent.verticalCenter
          text: root.outcome && !root.outcome.ok ? "stopped at step " + (root.outcome.failedAt + 1) : ""
          color: Color.urgent
          elide: Text.ElideRight
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
        }

        SearchableDropdown {
          id: stepPicker
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          width: Math.min(Style.space(280), parent.width * 0.5)
          label: ""
          showLabel: false
          triggerLabel: "\uFF0B  Add step"
          placeholderText: "Search tools\u2026"
          foreground: host.foreground
          accent: host.accent
          fontFamily: Style.font.menuFamily
          options: {
            var out = []
            var tools = Catalog.stepTools()
            for (var i = 0; i < tools.length; i++)
              out.push({ value: tools[i].id, label: tools[i].name, description: tools[i].category })
            return out
          }
          onChanged: function (toolId) {
            host.addChainStep(toolId)
            // Leave the trigger showing its prompt rather than the last pick.
            value = ""
          }
        }
      }

      ScrollView {
        width: parent.width
        height: parent.height - y
        clip: true

        Column {
          width: root.width - ends.width - Style.spacing.lg - Style.spacing.md
          spacing: Style.spacing.sm

          Repeater {
            model: root.chain ? root.chain.steps : []

            BorderSurface {
              id: card
              required property var modelData
              required property int index

              readonly property var tool: Catalog.byId(modelData.toolId)
              readonly property var outcome: root.stepResult(index)
              readonly property bool failed: outcome !== null && !outcome.ok
              // Steps after a failure never ran, so they are dimmed rather
              // than shown as though they produced nothing.
              readonly property bool skipped: root.outcome !== null && !root.outcome.ok
                && index > root.outcome.failedAt

              width: parent.width
              height: cardBody.implicitHeight + Style.spacing.lg
              radius: Style.cornerRadius
              color: Util.alpha(host.foreground, card.failed ? 0.0 : 0.03)
              borderSpec: card.failed
                ? Border.flat(Color.urgent, Style.normalBorderWidth)
                : Border.controlSpec("normal", host.foreground, host.accent)
              opacity: card.skipped ? 0.45 : 1

              Column {
                id: cardBody
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: Style.spacing.md
                spacing: Style.spacing.xs

                Item {
                  width: parent.width
                  height: Math.max(nameText.implicitHeight, Style.spacing.controlHeight - Style.space(4))

                  Text {
                    textFormat: Text.PlainText
                    id: stepNumber
                    anchors.left: parent.left
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(22)
                    text: (card.index + 1) + "."
                    color: Qt.darker(host.foreground, 1.5)
                    font.family: Style.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }

                  Text {
                    textFormat: Text.PlainText
                    id: nameText
                    anchors.left: stepNumber.right
                    anchors.right: stepButtons.left
                    anchors.rightMargin: Style.spacing.sm
                    anchors.verticalCenter: parent.verticalCenter
                    text: (card.tool ? card.tool.icon + "  " + card.tool.name : modelData.toolId)
                    color: card.failed ? Color.urgent : host.foreground
                    font.family: Style.font.menuFamily
                    font.pixelSize: Style.font.body
                    elide: Text.ElideRight
                  }

                  Row {
                    id: stepButtons
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.spacing.xxs

                    Button {
                      iconText: "󰁝"
                      tooltipText: "Move up"
                      enabled: card.index > 0
                      opacity: enabled ? 1 : 0.3
                      foreground: host.foreground
                      accent: host.accent
                      iconSize: Style.font.iconSmall
                      horizontalPadding: Style.spacing.xs
                      verticalPadding: Style.spacing.xxs
                      onClicked: host.moveChainStep(card.index, -1)
                    }
                    Button {
                      iconText: "󰁅"
                      tooltipText: "Move down"
                      enabled: card.index < root.stepCount - 1
                      opacity: enabled ? 1 : 0.3
                      foreground: host.foreground
                      accent: host.accent
                      iconSize: Style.font.iconSmall
                      horizontalPadding: Style.spacing.xs
                      verticalPadding: Style.spacing.xxs
                      onClicked: host.moveChainStep(card.index, 1)
                    }
                    Button {
                      iconText: "󰅖"
                      tooltipText: "Remove this step"
                      foreground: host.foreground
                      accent: host.accent
                      iconSize: Style.font.iconSmall
                      horizontalPadding: Style.spacing.xs
                      verticalPadding: Style.spacing.xxs
                      onClicked: host.removeChainStep(card.index)
                    }
                  }
                }

                OptionBar {
                  width: parent.width
                  visible: card.tool !== null && (((card.tool.modes || []).length > 0)
                    || ((card.tool.options || []).length > 0))
                  tool: card.tool
                  state: card.modelData.state
                  foreground: host.foreground
                  accent: host.accent
                  onChanged: function (key, value) { host.setChainStepState(card.index, key, value) }
                }

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  visible: text.length > 0
                  text: {
                    if (card.skipped) return "not reached"
                    if (!card.outcome) return ""
                    return (card.failed ? "" : "→ ") + card.outcome.summary
                  }
                  color: card.failed ? Color.urgent : Qt.darker(host.foreground, 1.45)
                  font.family: Style.font.menuFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }

                // A step that can't do anything where it is says so, rather
                // than quietly passing its input along.
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  visible: text.length > 0
                  text: card.outcome && card.outcome.warning ? "⚠  " + card.outcome.warning : ""
                  color: Color.urgent
                  font.family: Style.font.menuFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }
            }
          }

          Text {
            textFormat: Text.PlainText
            width: parent.width
            visible: root.stepCount === 0
            text: "A chain runs one tool's output into the next.\nUse Add step, above, to begin."
            color: Qt.darker(host.foreground, 1.4)
            font.family: Style.font.menuFamily
            font.pixelSize: Style.font.body
            topPadding: Style.spacing.lg
          }
        }
      }
    }
  }
}

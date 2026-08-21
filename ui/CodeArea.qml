import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui

// A labelled, scrollable text pane — the workhorse of every view. Used for
// both editable input and read-only output; the only difference is the
// `readOnly` flag and which action buttons the caller hangs off the header.
BorderSurface {
  id: root

  property string label: ""
  property string placeholder: ""
  property string status: ""
  // Errors used to render in the same dim grey as an ordinary status line.
  property bool statusIsError: false
  // When the failure carries a position, the status becomes a way to get there.
  property bool statusClickable: false
  property bool readOnly: false
  property bool monospace: true
  property color foreground: Color.menu.text
  property color accent: Color.accent
  // [{ icon, tooltip, action }] — rendered as small buttons in the header.
  property var actions: []

  // The full value. Only a bounded prefix is ever handed to the editor: laying
  // out a multi-megabyte string costs seconds on the UI thread — the same
  // freeze the worker thread exists to prevent, just in the widget instead of
  // the computation. Tools still see the whole thing; only the display is cut.
  property string text: ""
  property int previewLimit: 32768
  readonly property bool truncated: root.text.length > root.previewLimit
  readonly property string displayText: root.truncated
    ? root.text.substring(0, root.previewLimit) : root.text
  readonly property string truncationNote: root.truncated
    ? "showing the first " + Math.round(root.previewLimit / 1024) + " KB of "
      + (root.text.length >= 1048576
         ? (Math.round(root.text.length / 104857.6) / 10) + " MB"
         : Math.round(root.text.length / 1024) + " KB")
      + " — too large to edit here"
    : ""

  property alias cursorPosition: area.cursorPosition

  signal edited(string text)
  signal statusClicked()

  // Puts the cursor on a character index, focuses the editor, and scrolls it
  // into view. Returns false when the index lies past the truncated preview,
  // so the caller can say so rather than parking the cursor somewhere
  // misleading.
  function focusAt(index) {
    var wanted = Number(index)
    if (!isFinite(wanted) || wanted < 0) return false
    if (root.truncated && wanted > root.previewLimit) return false

    area.forceActiveFocus()
    area.cursorPosition = Math.min(wanted, area.length)

    var caret = area.cursorRectangle
    var flick = scroller.contentItem
    if (flick) {
      if (caret.y < flick.contentY || caret.y + caret.height > flick.contentY + flick.height)
        flick.contentY = Math.max(0, Math.min(caret.y - flick.height / 2,
                                              Math.max(0, flick.contentHeight - flick.height)))
      if (caret.x < flick.contentX || caret.x > flick.contentX + flick.width)
        flick.contentX = Math.max(0, Math.min(caret.x - flick.width / 2,
                                              Math.max(0, flick.contentWidth - flick.width)))
    }
    return true
  }

  radius: Style.cornerRadius
  color: Util.alpha(root.foreground, 0.03)
  borderSpec: Border.controlSpec(area.activeFocus ? "focus" : "normal", root.foreground, root.accent)

  function focusEditor() { area.forceActiveFocus() }
  function selectAll() { area.selectAll() }

  Column {
    anchors.fill: parent
    anchors.margins: Style.spacing.sm
    spacing: Style.spacing.xs

    Item {
      width: parent.width
      height: Math.max(Style.spacing.controlHeight - Style.space(4), headerLabel.implicitHeight)

      Text {
        id: headerLabel
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        color: Qt.darker(root.foreground, 1.35)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Item {
        anchors.left: headerLabel.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: headerActions.left
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        height: statusText.implicitHeight
        visible: statusText.text.length > 0

        Text {
          id: statusText
          anchors.fill: parent
          text: root.truncated
            ? (root.status.length > 0 ? root.status + " · " + root.truncationNote : root.truncationNote)
            : root.status
          color: root.statusIsError ? Color.urgent
            : (root.truncated ? root.accent : Qt.darker(root.foreground, 1.5))
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.caption
          font.underline: root.statusClickable && statusHover.containsMouse
          elide: Text.ElideRight
          verticalAlignment: Text.AlignVCenter
        }

        MouseArea {
          id: statusHover
          anchors.fill: parent
          enabled: root.statusClickable
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.statusClicked()
        }
      }

      Row {
        id: headerActions
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.spacing.xs

        Repeater {
          model: root.actions

          Button {
            required property var modelData
            iconText: modelData.icon
            text: modelData.label === undefined ? "" : modelData.label
            tooltipText: modelData.tooltip === undefined ? "" : modelData.tooltip
            foreground: root.foreground
            accent: root.accent
            fontSize: Style.font.caption
            iconSize: Style.font.iconSmall
            horizontalPadding: Style.spacing.sm
            verticalPadding: Style.spacing.xxs
            onClicked: if (modelData.action) modelData.action()
          }
        }
      }
    }

    ScrollView {
      id: scroller
      width: parent.width
      height: parent.height - y
      clip: true

      TextArea {
        id: area
        text: root.displayText
        // Editing a truncated view would silently discard everything past the
        // cut, so it is disabled rather than made lossy.
        readOnly: root.readOnly || root.truncated
        selectByMouse: true
        selectByKeyboard: true
        wrapMode: TextArea.NoWrap
        placeholderText: root.placeholder
        color: root.foreground
        placeholderTextColor: Qt.darker(root.foreground, 1.8)
        selectionColor: Style.selectionFillFor(root.foreground, root.accent)
        selectedTextColor: root.foreground
        font.family: root.monospace ? Style.fontFamily : Style.font.menuFamily
        font.pixelSize: Style.font.body
        background: null
        leftPadding: 0
        rightPadding: Style.spacing.sm
        topPadding: 0
        bottomPadding: 0
        // `edited` fires only on real user input, so programmatic updates
        // (loading a sample, pasting from the clipboard) don't loop back.
        onTextEdited: root.edited(area.text)
      }
    }
  }
}

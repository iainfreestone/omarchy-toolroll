import QtQuick
import qs.Commons
import qs.Ui

// The image counterpart to CodeArea: same header shape — label, status, action
// buttons — with a picture instead of an editor. Shared by the QR tool and by
// chains that end in an image, so "copy" and "save" behave identically
// wherever an image is the result.
BorderSurface {
  id: root

  property string label: "Output"
  property string status: ""
  property string placeholder: ""
  property string imagePath: ""
  // An explicit URL wins over a path — a data: URI has no file behind it, and
  // Qt's image loader understands the scheme natively.
  property string sourceUrl: ""
  property string imageError: ""
  property color foreground: Color.menu.text
  property color accent: Color.accent
  // [{ icon, tooltip, action }] — same shape CodeArea takes.
  property var actions: []
  // Set when the actions are how you get an image, not what you do with one.
  property bool actionsAlwaysVisible: false

  // The path-taking views hand this whatever is in the input pane, so it can be
  // a stray session value rather than a path. Anything that is not an absolute
  // path to something is dropped here: Image would otherwise try to open
  // `file:///`, fail, and warn on every rebuild.
  readonly property bool usablePath: {
    var path = String(root.imagePath).replace(/^\s+|\s+$/g, "")
    return path.length > 1 && path.charAt(0) === "/"
  }
  readonly property string effectiveSource: root.sourceUrl.length > 0
    ? root.sourceUrl : (root.usablePath ? Util.fileUrl(root.imagePath) : "")
  readonly property bool hasImage: preview.status === Image.Ready && root.effectiveSource.length > 0
  // What the picture turned out to be, once loaded.
  readonly property string dimensions: root.hasImage
    ? preview.sourceSize.width + "×" + preview.sourceSize.height : ""

  radius: Style.cornerRadius
  color: Util.alpha(root.foreground, 0.03)
  borderSpec: Border.controlSpec("normal", root.foreground, root.accent)

  Item {
    id: header
    anchors.top: parent.top
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.margins: Style.spacing.sm
    height: Math.max(Style.spacing.controlHeight - Style.space(4), headerLabel.implicitHeight)

    Text {
      textFormat: Text.PlainText
      id: headerLabel
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: root.label
      color: Qt.darker(root.foreground, 1.35)
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }

    Text {
      textFormat: Text.PlainText
      anchors.left: headerLabel.right
      anchors.leftMargin: Style.spacing.md
      anchors.right: headerActions.left
      anchors.rightMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      text: root.status
      color: Qt.darker(root.foreground, 1.5)
      font.family: Style.font.menuFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
      visible: root.status.length > 0
    }

    Row {
      id: headerActions
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.spacing.xs
      // Copy and save need a picture first; a pane that loads one needs its
      // button before there is anything to show.
      visible: root.hasImage || root.actionsAlwaysVisible

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

  Image {
    id: preview
    anchors.centerIn: parent
    anchors.verticalCenterOffset: header.height / 2
    width: Math.min(Style.space(360),
                    parent.width - Style.spacing.xxl,
                    parent.height - header.height - Style.spacing.xxl)
    height: width
    fillMode: Image.PreserveAspectFit
    // QR modules are squares; smoothing turns crisp edges into grey mush.
    smooth: false
    cache: false
    visible: root.hasImage
    source: root.effectiveSource
  }

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    width: parent.width - Style.spacing.xxl
    visible: !root.hasImage
    text: root.imageError.length > 0 ? root.imageError : root.placeholder
    color: root.imageError.length > 0 ? Color.urgent : Qt.darker(root.foreground, 1.4)
    font.family: Style.font.menuFamily
    font.pixelSize: Style.font.body
    horizontalAlignment: Text.AlignHCenter
    wrapMode: Text.WordWrap
  }
}

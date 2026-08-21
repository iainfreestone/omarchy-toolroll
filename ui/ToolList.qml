import QtQuick
import qs.Commons
import qs.Ui
import "../lib/palette.js" as Palette
import "../lib/sections.js" as Sections

// The left-hand tool picker: a flat list grouped by category, driven entirely
// from the catalogue. Selection is keyboard-first — the search field above
// keeps focus and forwards arrow keys here — so the mouse is optional.
Item {
  id: root

  property var tools: []
  property string selectedId: ""
  property color foreground: Color.menu.text
  property color accent: Color.accent
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  // The theme's named hues; empty on a theme that declares none, in which case
  // every icon falls back to the accent exactly as before.
  property var palette: ({})

  signal picked(string toolId)
  signal pinToggled(string toolId)
  signal sectionToggled(string name)
  signal sectionMoved(string name, int delta)

  property var collapsedSections: []
  // The movable headings in the order they currently appear, so a header knows
  // whether it is already at the top or bottom of what it can move within.
  readonly property var movableSections: Sections.names(root.tools).filter(Sections.isMovable)

  readonly property int count: listView.count

  function indexOf(toolId) {
    for (var i = 0; i < root.tools.length; i++) if (root.tools[i].id === toolId) return i
    return -1
  }

  // Steps over the placeholder a collapsed section leaves behind: it exists
  // only to carry the heading, and selecting it would be selecting nothing.
  function move(delta) {
    if (root.tools.length === 0) return
    var next = indexOf(root.selectedId)
    for (var guard = 0; guard < root.tools.length; guard++) {
      next += delta
      if (next < 0) next = root.tools.length - 1
      if (next >= root.tools.length) next = 0
      if (!Sections.isPlaceholder(root.tools[next])) {
        root.picked(root.tools[next].id)
        return
      }
    }
  }

  function ensureVisible() {
    var index = indexOf(root.selectedId)
    if (index >= 0) listView.positionViewAtIndex(index, ListView.Contain)
  }

  onSelectedIdChanged: Qt.callLater(root.ensureVisible)

  ListView {
    id: listView
    anchors.fill: parent
    model: root.tools
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    spacing: 0

    // Categories are rendered as sticky-free inline headers: with thirty
    // entries the whole list nearly fits, and a floating header would cover
    // a row the user is aiming at.
    section.property: "category"
    section.delegate: Item {
      id: heading
      required property string section

      readonly property bool collapsed: Sections.isCollapsed(root.collapsedSections, section)
      readonly property bool movable: Sections.isMovable(section)
      readonly property int position: root.movableSections.indexOf(section)
      readonly property color tint:
        Palette.categoryColor(root.palette, section, root.foreground)

      width: listView.width
      height: Style.spacing.controlHeight

      // The whole heading is the hit target for folding it away — a chevron
      // alone is a nine-pixel thing to aim at, and there is nothing else on
      // the row that wants a click.
      // Same reasoning as the row's pin: the reorder arrows sit on top of this
      // MouseArea and carry their own hover, so their visibility keys off a
      // handler that stays hovered while the cursor is over them.
      HoverHandler { id: headingHover }

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: root.sectionToggled(heading.section)
      }

      Text {
        textFormat: Text.PlainText
        id: chevron
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.sm
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Style.spacing.xxs
        text: heading.collapsed ? "󰅂" : "󰅀"
        color: Qt.lighter(heading.tint, 1.4)
        font.family: Style.fontFamily
        font.pixelSize: Style.font.iconSmall
      }

      // The heading is what the colour actually means, so it carries it too —
      // a tinted glyph alone is a fourteen-pixel hint.
      PanelSectionHeader {
        id: headingText
        anchors.left: chevron.right
        anchors.leftMargin: Style.spacing.xs
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Style.spacing.xxs
        text: heading.section
        foreground: Qt.lighter(heading.tint, 1.4)
      }

      // Folded away, the heading is all that is left, so it says what is
      // behind it rather than leaving you to remember.
      Text {
        textFormat: Text.PlainText
        anchors.left: headingText.right
        anchors.leftMargin: Style.spacing.xs
        anchors.baseline: headingText.baseline
        visible: heading.collapsed
        text: Sections.hiddenCount(root.tools, heading.section) + ""
        color: Qt.darker(root.foreground, 1.5)
        font.family: Style.font.menuFamily
        font.pixelSize: Style.font.caption
      }

      // Reordering appears on hover, like the pin does: two arrows on every
      // heading permanently would be more chrome than the job is worth.
      Row {
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.xs
        anchors.verticalCenter: headingText.verticalCenter
        spacing: 0
        visible: heading.movable && headingHover.hovered

        Button {
          iconText: "󰁝"
          tooltipText: "Move this group up"
          enabled: heading.position > 0
          opacity: enabled ? 1 : 0.35
          foreground: root.foreground
          accent: root.accent
          iconSize: Style.font.iconSmall
          horizontalPadding: Style.spacing.xxs
          verticalPadding: 0
          onClicked: root.sectionMoved(heading.section, -1)
        }

        Button {
          iconText: "󰁅"
          tooltipText: "Move this group down"
          enabled: heading.position >= 0
            && heading.position < root.movableSections.length - 1
          opacity: enabled ? 1 : 0.35
          foreground: root.foreground
          accent: root.accent
          iconSize: Style.font.iconSmall
          horizontalPadding: Style.spacing.xxs
          verticalPadding: 0
          onClicked: root.sectionMoved(heading.section, 1)
        }
      }
    }

    delegate: Rectangle {
      id: row
      required property var modelData
      required property int index

      readonly property bool current: root.selectedId === modelData.id
      readonly property bool isPinned: modelData.pinned === true
      // The pin belongs to the Pinned & recent block and nowhere else. Pinning
      // promotes something out of that list to the top of it, so offering it
      // on a row in "Format & validate" — where there is no list to be at the
      // top of — was only ever confusing. A tool reaches the block by being
      // used, and can be pinned from there. Chains never appear in it: they
      // sit above everything permanently already.
      readonly property bool pinnable: modelData.inRecents === true

      // A collapsed section leaves one placeholder behind so the ListView
      // still draws its heading. It is not a row anyone can see or select.
      readonly property bool placeholder: Sections.isPlaceholder(modelData)

      // Hover is tracked with a handler, not with the MouseArea below. The pin
      // sits on top of that MouseArea and carries its own hover, which would
      // take the hover away and hide the very button being reached for. A
      // handler on the row stays hovered while the cursor is over its children.
      HoverHandler { id: rowHover }

      width: listView.width
      height: placeholder ? 0 : Style.spacing.controlHeight + Style.spacing.xs
      visible: !placeholder
      radius: Style.cornerRadius
      color: current ? root.selectedBackground
        : (rowHover.hovered ? Style.hoverFill : "transparent")

      Row {
        anchors.fill: parent
        anchors.leftMargin: Style.spacing.sm
        anchors.rightMargin: Style.spacing.sm
        spacing: Style.spacing.md

        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          width: Style.font.icon + Style.space(2)
          text: row.modelData.icon
          // Only the glyph carries the category's colour — tinting the labels
          // as well would turn a thirty-five row list into a rainbow and cost
          // more legibility than it buys.
          color: row.current
            ? root.selectedText
            : Palette.categoryColor(root.palette, row.modelData.category,
                                    Qt.darker(root.foreground, 1.3))
          font.family: Style.fontFamily
          font.pixelSize: Style.font.icon
          horizontalAlignment: Text.AlignHCenter
        }

        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: parent.verticalCenter
          width: parent.width - Style.font.icon - Style.space(2) - Style.spacing.md
            - (pin.visible ? pin.width + Style.spacing.xs : 0)
          text: row.modelData.name
          color: row.current ? root.selectedText : root.foreground
          font.family: Style.font.menuFamily
          font.pixelSize: Style.font.body
          elide: Text.ElideRight
        }
      }

      // Declared before the pin so the pin sits on top of it. The other way
      // round — which is how this started — the row's MouseArea covered the
      // pin and swallowed its clicks, so pressing the pin selected the tool
      // and did nothing else.
      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: root.picked(row.modelData.id)
      }

      // Shown on every row of the block, faint until it is either pinned or
      // under the cursor. It used to appear only on hover, from when every one
      // of thirty-five rows had one; now that it is confined to the handful of
      // rows in this block there is nothing to hide from, and an affordance
      // you have to discover by hovering is one most people never find.
      //
      // Fading rather than hiding also keeps it clickable no matter how hover
      // resolves between the row and the button sitting on top of it.
      Button {
        id: pin
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.xs
        anchors.verticalCenter: parent.verticalCenter
        visible: row.pinnable
        opacity: row.isPinned || rowHover.hovered ? 1 : 0.3
        Behavior on opacity { NumberAnimation { duration: 120 } }
        iconText: row.isPinned ? "󰐃" : "󰤱"
        tooltipText: row.isPinned ? "Unpin" : "Pin to the top of the list"
        foreground: row.isPinned ? root.accent : root.foreground
        accent: root.accent
        iconSize: Style.font.iconSmall
        horizontalPadding: Style.spacing.xs
        verticalPadding: Style.spacing.xxs
        onClicked: root.pinToggled(row.modelData.id)
      }
    }
  }

  // ------------------------------------------------------- there is more
  //
  // Thirty-five tools do not fit, and nothing said so: the list simply ended
  // at the bottom of the window looking like the end of the list. Two signals,
  // answering two different questions — a fade says *there is more this way*,
  // and the bar says *how much, and where you are*.

  readonly property bool scrollable: listView.contentHeight > listView.height + 1

  Rectangle {
    anchors.top: parent.top
    width: parent.width
    height: Style.space(18)
    visible: root.scrollable && !listView.atYBeginning
    gradient: Gradient {
      GradientStop { position: 0.0; color: Util.alpha(Color.menu.background, 0.95) }
      GradientStop { position: 1.0; color: "transparent" }
    }
  }

  Rectangle {
    anchors.bottom: parent.bottom
    width: parent.width
    height: Style.space(18)
    visible: root.scrollable && !listView.atYEnd
    gradient: Gradient {
      GradientStop { position: 0.0; color: "transparent" }
      GradientStop { position: 1.0; color: Util.alpha(Color.menu.background, 0.95) }
    }
  }

  Rectangle {
    id: scrollTrack
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.bottom: parent.bottom
    width: Style.space(3)
    visible: root.scrollable
    color: "transparent"

    Rectangle {
      width: parent.width
      radius: width / 2
      // Never smaller than a thumb you can actually see, however long the list.
      height: Math.max(Style.space(24),
                       scrollTrack.height * (listView.height / Math.max(1, listView.contentHeight)))
      y: (scrollTrack.height - height)
         * (listView.contentY / Math.max(1, listView.contentHeight - listView.height))
      color: Util.alpha(root.foreground, listView.moving ? 0.45 : 0.2)
      Behavior on color { ColorAnimation { duration: 150 } }
    }
  }

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    visible: listView.count === 0
    text: "No tool matches"
    color: Qt.darker(root.foreground, 1.4)
    font.family: Style.font.menuFamily
    font.pixelSize: Style.font.body
  }
}

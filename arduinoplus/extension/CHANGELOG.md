# Changelog

## 1.1.0 18.11.2026

### Features
- Added comment anchors: `// @anchor Name` in the code, shown in the anchor list
- Added TODO list for TODO and FIXME comments of the whole sketch
- Added number converter: decimal, hex, binary, Arduino binary and character
- Added pixel editor: 5x8 LCD characters, 8x8 LED matrix images and bitmaps up to 128x128 (Adafruit GFX, U8g2)
- Pixel editor can import images with automatic threshold, dithering and invert
- Pixel editor has a zoom (buttons and Ctrl + mouse wheel)
- Snippets can be renamed, imported and exported
- Added Insert Snippet (`Ctrl+Shift+V`) to pick a snippet from a list
- Added About page with version, changelog and uninstall button
- Added an icon
- All features are grouped in an Arduino+ submenu of the context menu
- Added translations: German, Spanish, French and Italian (English stays the default)
- README and changelog are now part of the VSIX and are shown in the Extension Manager

### Changes
- Anchors follow their line when lines are added or removed above
- The anchor list shows the anchors of all tabs in the sketch
- Uninstalling asks twice and lists all files that will be deleted, because your snippets and anchors are deleted as well

### Bugfixes
- The anchor timer is stopped when the extension is deactivated
- Fixed wrong description and publisher in the VSIX manifest

## 1.0.0 25.12.2025

### Features
- Added Toggle Line Comments
- Added Code Snippets Manager
- Added Sketch Anchors
- Added Duplicate Line

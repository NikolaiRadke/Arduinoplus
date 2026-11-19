# Changelog

## 1.2.0

### Features
- Added printing: current file or whole sketch with syntax colors and line numbers, opened in the browser to print or save as PDF

## 1.1.1 18.11.2026

### Features
- Runs in VS Code and is available in the Visual Studio Marketplace

### Changes
- In VS Code, Toggle Line Comment and Duplicate Line are hidden (VS Code has them already) and the anchor shortcuts are off (they collide with Build and Debug)
- In VS Code, the About page refers to the Extensions view for uninstalling
- Publisher is now NikolaiRadke, like AI.duino
- The extension starts after the IDE has finished loading

## 1.1.0 18.11.2026

### Features
- Added comment anchors: `// @anchor Name` in the code, shown in the anchor list
- Added TODO list for TODO and FIXME comments of the whole sketch
- Added sketch snapshots: save, compare and restore the state of a sketch
- Added number converter: decimal, hex, binary, Arduino binary and character
- Added color picker: RGB888, RGB565, NeoPixel, FastLED and color565
- Added pixel editor: 5x8 LCD characters, 8x8 LED matrix images and bitmaps up to 128x128 (Adafruit GFX, U8g2)
- Pixel editor can import images with automatic threshold, dithering and invert
- Pixel editor has a zoom (buttons and Ctrl + mouse wheel)
- Added melody editor with playback, RTTTL import, example melodies and playMelody() function
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

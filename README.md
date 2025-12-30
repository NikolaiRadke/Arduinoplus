![AI.duino](http://www.nikolairadke.de/aiduino/arduinoplus_back.png)
# Arduino+ for a better Arduino IDE

Arduino integrates features that are terribly missed in the IDE for a better coding experience.

## Features

* **Toggle Line Comments**: Quickly comment/uncomment lines with `//` - perfect for debugging!
* **Duplicate Line**: Duplicates the selected line and inserts it below.  
* **Snippet Manager**: An enhanced clipboard to keep and modify several code snippets.
* **Sketch Anchors**: Set an anchor and jump anytime to the desired position. The sketch needs to be saved fist. Alas, anchors are lost when the sketch is renamed.

### Failed Features

Arduino IDE is not VS Code. A lot of functions are disabled but not documented. It's hard to develop an extension so sometimes ideas will fail.  
* *Trigger Reset by Command:* Requires unavailable Python dependencies and doesn't work for ESP32-CAM.
* *Mousewheel Zoom:* Extension API lacks mouse wheel event access.
* *Compiler Flag Manager:*  System files get overwritten on board updates.
* *Serial Monitor Search:* Extension API has no access to Serial Monitor.

## Screenshot
![Arduino+](http://www.nikolairadke.de/aiduino/arduinoplus_screenshot.png)

## Installation

You need the VSIX file **arduinoplus-X.X.X.vsix** in the same folder with the installer. The installer will install the plugin in your home folder. 
  
#### Windows
Run ``` install_arduinoplus_windows.bat ``` as administrator

#### Linux
```
chmod +x install_arduinoplus_linux.sh
./install_arduinoplus_install_linux.sh
```

#### macOS
```
chmod +x install_arduinoplus_macos.sh
./install_arduinoplus_Install_macos.sh
```
## Usage
You can access all feaures through the right click context menu.  

## Related Projects

- **[AI.duino](https://github.com/NikolaiRadke/AI.duino)** - AI-powered assistance for Arduino IDE.
- **[Extension Manager](https://github.com/NikolaiRadke/Extension-Manager)** -  Manage your Arduino IDE 2.X extensions.

## 💙 Support Arduino+

Arduino+ is free and open source. If it saved your day, consider buying me a coffee! ☕

[![GitHub Sponsors](https://img.shields.io/github/sponsors/NikolaiRadke?style=for-the-badge&logo=github&color=ea4aaa)](https://github.com/sponsors/NikolaiRadke)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/nikolairadke)

Every contribution helps keep this project alive! 🚀



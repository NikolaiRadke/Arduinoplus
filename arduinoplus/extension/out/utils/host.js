/*
 * Arduino+ - Host Detection
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 */

"use strict";

const vscode = require('vscode');

/**
 * Check if the extension runs inside the Arduino IDE (Eclipse Theia)
 * or in VS Code. The Arduino IDE reports its app name as "Arduino IDE".
 * @returns {boolean}
 */
function isArduinoIDE() {
    return String(vscode.env.appName || '').includes('Arduino');
}

module.exports = { isArduinoIDE };

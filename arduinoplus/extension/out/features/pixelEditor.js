/*
 * Arduino+ - Pixel Editor
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Paints pixel graphics and inserts them as byte array:
 * - 5x8 custom characters for HD44780 LCDs (createChar)
 * - 8x8 images for LED matrices (MAX7219)
 * - Bitmaps up to 128x128 for Adafruit GFX (drawBitmap) or U8g2 (drawXBMP)
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { parseNumber } = require('./numberConverter');

const MAX_SIZE = 128;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp'
};
const WEBVIEW_SCRIPT = path.join(__dirname, 'pixelEditor.webview.js');

/**
 * Find width and height of a bitmap with n bytes
 * @param {number} count - Number of bytes
 * @param {string} text - Source, may contain "32x32" or XBM #defines
 * @returns {{width: number, height: number}}
 */
function guessSize(count, text) {
    const bytesFor = (w, h) => Math.ceil(w / 8) * h;
    const valid = (w, h) => w >= 1 && h >= 1 && w <= MAX_SIZE && h <= MAX_SIZE && bytesFor(w, h) === count;

    // XBM: #define name_width 16
    const xbmWidth = text.match(/_width\s+(\d+)/);
    const xbmHeight = text.match(/_height\s+(\d+)/);
    if (xbmWidth && xbmHeight && valid(+xbmWidth[1], +xbmHeight[1])) {
        return { width: +xbmWidth[1], height: +xbmHeight[1] };
    }
    // Comment or name like "32x32"
    const dims = text.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (dims && valid(+dims[1], +dims[2])) {
        return { width: +dims[1], height: +dims[2] };
    }
    // Square image
    for (let s = 1; s <= MAX_SIZE; s++) {
        if (valid(s, s)) return { width: s, height: s };
    }
    // Full width OLED (128 x n), else 8 pixels wide
    if (count % 16 === 0 && count / 16 <= MAX_SIZE) return { width: 128, height: count / 16 };
    return { width: 8, height: Math.min(MAX_SIZE, count) };
}

/**
 * Read an existing character or bitmap array from the selection
 * @param {string} text
 * @returns {{name: string, mode: string, width: number, height: number, rows: string[], format: string}|null}
 */
function parseBitmap(text) {
    const open = text.indexOf('{');
    const close = text.lastIndexOf('}');
    const body = open !== -1 ? text.substring(open + 1, close > open ? close : undefined) : text;
    const values = [];
    let format = null;
    for (const token of body.replace(/\/\/.*$/gm, '').split(/[\s,]+/).filter(Boolean)) {
        const parsed = parseNumber(token);
        if (!parsed) continue;
        values.push(Number(parsed.value & 0xFFn));
        format = format || parsed.format;
        if (values.length === MAX_SIZE * MAX_SIZE / 8) break;
    }
    if (values.length === 0) return null;

    const isXbm = /_bits\s*\[|U8X8_PROGMEM|_width\s+\d+/.test(text);
    let mode;
    if (isXbm) mode = 'xbm';
    else if (values.length > 8 || /PROGMEM/.test(text)) mode = 'gfx';
    else if (values.some(v => v > 31)) mode = 'matrix';
    else mode = 'lcd';

    let width;
    let height;
    if (mode === 'lcd') {
        width = 5;
        height = 8;
    } else if (mode === 'matrix') {
        width = 8;
        height = 8;
    } else {
        ({ width, height } = guessSize(values.length, text));
    }

    const perRow = Math.ceil(width / 8);
    const rows = [];
    for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) {
            let on;
            if (mode === 'lcd') {
                on = ((values[y] || 0) & (0x10 >> x)) !== 0;
            } else {
                const byte = values[y * perRow + Math.floor(x / 8)] || 0;
                on = mode === 'xbm' ? (byte & (1 << (x % 8))) !== 0 : (byte & (0x80 >> (x % 8))) !== 0;
            }
            row += on ? '1' : '0';
        }
        rows.push(row);
    }

    const nameMatch = text.match(/([A-Za-z_]\w*?)(?:_bits)?\s*\[\s*\d*\s*\]/);
    return {
        name: nameMatch ? nameMatch[1] : 'image',
        mode,
        width,
        height,
        rows,
        format: format === 'hex' ? 'hex' : format === 'bin' ? 'bin' : 'arduino'
    };
}

class PixelEditor {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
        this.panel = null;
        this.targetEditor = null;
    }

    /**
     * Open the editor, prefilled with a selected array
     */
    show() {
        const editor = vscode.window.activeTextEditor;
        this.targetEditor = editor || this.targetEditor;

        let initial = { name: 'customChar', mode: 'lcd', width: 5, height: 8, rows: [], format: 'arduino' };
        if (editor && !editor.selection.isEmpty) {
            initial = parseBitmap(editor.document.getText(editor.selection)) || initial;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.webview.postMessage({ command: 'load', data: initial });
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusPixelEditor',
            this.t('lcdchar.title'),
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
        });

        this.panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'insert') {
                await this.insert(message.code);
            } else if (message.command === 'copy') {
                await vscode.env.clipboard.writeText(message.code);
                vscode.window.showInformationMessage(this.t('lcdchar.copied'));
            } else if (message.command === 'importImage') {
                await this.importImage();
            } else if (message.command === 'imageError') {
                vscode.window.showErrorMessage(this.t('lcdchar.importFailed', message.error || ''));
            }
        });

        this.panel.webview.html = this.getWebviewContent(initial);
    }

    /**
     * Let the user pick an image and send it to the webview as data URL.
     * The webview scales it and turns it into pixels.
     */
    async importImage() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { [this.t('lcdchar.images')]: Object.keys(IMAGE_TYPES) },
            openLabel: this.t('lcdchar.importImage')
        });
        if (!uris || uris.length === 0 || !this.panel) return;

        const file = uris[0].fsPath;
        const type = IMAGE_TYPES[path.extname(file).slice(1).toLowerCase()];
        try {
            if (!type) throw new Error(path.extname(file));
            if (fs.statSync(file).size > MAX_IMAGE_BYTES) throw new Error('> 20 MB');
            const dataUrl = `data:${type};base64,` + fs.readFileSync(file).toString('base64');
            const name = path.basename(file, path.extname(file));
            this.panel.webview.postMessage({ command: 'image', dataUrl, name });
        } catch (error) {
            vscode.window.showErrorMessage(this.t('lcdchar.importFailed', error.message));
        }
    }

    /**
     * Insert code into the editor the panel was opened from
     * (the webview has the focus, so there may be no active editor)
     * @param {string} code
     */
    async insert(code) {
        let editor = vscode.window.activeTextEditor;
        if (!editor && this.targetEditor) {
            const uri = this.targetEditor.document.uri.toString();
            editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
        }
        if (!editor) {
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        await editor.edit(editBuilder => {
            if (editor.selection.isEmpty) {
                editBuilder.insert(editor.selection.active, code);
            } else {
                // Replaces the array that was selected
                editBuilder.replace(editor.selection, code.replace(/\n$/, ''));
            }
        });
        vscode.window.showInformationMessage(this.t('lcdchar.inserted'));
    }

    /**
     * Generate the webview HTML
     * @param {Object} initial - Data from parseBitmap
     * @returns {string}
     */
    getWebviewContent(initial) {
        const t = this.t;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const config = {
            initial,
            usage: {
                lcd: t('lcdchar.usage'),
                matrix: t('lcdchar.usageMatrix'),
                gfx: t('lcdchar.usageGfx'),
                xbm: t('lcdchar.usageXbm')
            }
        };
        // No "</script>" inside the inline script
        const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
        const script = fs.readFileSync(WEBVIEW_SCRIPT, 'utf8');
        const presets = ['16x16', '32x32', '64x64', '128x64', '128x128']
            .map(p => `<button class="secondary small" data-preset="${p}">${p.replace('x', '×')}</button>`).join('');

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; user-select: none; }
    .layout { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
    canvas { border-radius: 4px; cursor: crosshair; display: block; }
    #canvasWrap { overflow: auto; max-width: calc(100vw - 40px); max-height: 70vh; width: max-content; }
    #zoomValue { min-width: 44px; text-align: center; font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--vscode-descriptionForeground); }
    .tools { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
    .controls { min-width: 300px; flex: 1; }
    .controls label.title { display: block; margin: 12px 0 4px 0; color: var(--vscode-descriptionForeground); }
    .controls label.title:first-child { margin-top: 0; }
    .options label { display: inline-block; margin: 0 12px 2px 0; white-space: nowrap; }
    .options.columns { display: grid; grid-template-columns: max-content max-content; column-gap: 16px; row-gap: 2px; }
    .options.columns label { margin: 0; }
    input[type=text], input[type=number] { padding: 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); font-family: var(--vscode-editor-font-family); }
    input[type=text] { width: 180px; }
    input[type=number] { width: 56px; }
    pre { margin: 10px 0; padding: 10px 12px; max-height: 300px; overflow: auto; border-radius: 3px; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); user-select: text; }
    button { padding: 5px 12px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.small { padding: 2px 8px; font-size: 12px; }
    .hint { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); user-select: text; }
    #importPanel { display: none; margin-top: 12px; padding: 10px 12px; border-radius: 4px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); max-width: 420px; }
    #importPanel .row { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
    #importPanel input[type=range] { flex: 1; min-width: 140px; }
    #thresholdValue { width: 32px; text-align: right; font-family: var(--vscode-editor-font-family); }
</style>
</head>
<body>
<div class="layout">
    <div>
        <div id="canvasWrap"><canvas id="canvas"></canvas></div>
        <div class="tools">
            <button class="secondary small" id="zoomOut" title="${esc(t('lcdchar.zoomOut'))}">−</button>
            <span id="zoomValue"></span>
            <button class="secondary small" id="zoomIn" title="${esc(t('lcdchar.zoomIn'))}">+</button>
            <button class="secondary small" id="zoomFit">${esc(t('lcdchar.zoomFit'))}</button>
            <span class="hint" style="margin-top: 0">${esc(t('lcdchar.zoomHint'))}</span>
        </div>
        <div class="tools">
            <button class="secondary" data-shift="up" title="${esc(t('lcdchar.shift'))}">↑</button>
            <button class="secondary" data-shift="down" title="${esc(t('lcdchar.shift'))}">↓</button>
            <button class="secondary" data-shift="left" title="${esc(t('lcdchar.shift'))}">←</button>
            <button class="secondary" data-shift="right" title="${esc(t('lcdchar.shift'))}">→</button>
            <button class="secondary" id="invert">${esc(t('lcdchar.invert'))}</button>
            <button class="secondary" id="clear">${esc(t('lcdchar.clear'))}</button>
        </div>
        <div class="tools">
            <button class="secondary" id="importImage">🖼️ ${esc(t('lcdchar.importImage'))}</button>
        </div>
        <div id="importPanel">
            <div class="row"><strong id="imageName"></strong></div>
            <div class="row">
                <span>${esc(t('lcdchar.threshold'))}</span>
                <input type="range" id="threshold" min="1" max="254" value="128">
                <span id="thresholdValue">128</span>
                <button class="secondary small" id="autoThreshold">${esc(t('lcdchar.auto'))}</button>
            </div>
            <div class="row">
                <label><input type="checkbox" id="dither"> ${esc(t('lcdchar.dither'))}</label>
                <label><input type="checkbox" id="invertImage"> ${esc(t('lcdchar.invertImage'))}</label>
            </div>
            <div class="row">
                <button class="secondary small" id="originalSize">${esc(t('lcdchar.originalSize'))}</button>
                <button class="small" id="closeImage">${esc(t('lcdchar.closeImage'))}</button>
            </div>
            <div class="hint">${esc(t('lcdchar.importHint'))}</div>
        </div>
        <div class="hint">${esc(t('lcdchar.hint'))}</div>
    </div>
    <div class="controls">
        <label class="title">${esc(t('lcdchar.mode'))}</label>
        <div class="options columns">
            <label><input type="radio" name="mode" value="lcd"> ${esc(t('lcdchar.modeLcd'))}</label>
            <label><input type="radio" name="mode" value="matrix"> ${esc(t('lcdchar.modeMatrix'))}</label>
            <label><input type="radio" name="mode" value="gfx"> ${esc(t('lcdchar.modeGfx'))}</label>
            <label><input type="radio" name="mode" value="xbm"> ${esc(t('lcdchar.modeXbm'))}</label>
        </div>
        <div id="sizeRow">
            <label class="title">${esc(t('lcdchar.size'))}</label>
            <div class="tools" style="margin-top: 0">
                <input type="number" id="width" min="1" max="${MAX_SIZE}"> × <input type="number" id="height" min="1" max="${MAX_SIZE}">
                ${presets}
            </div>
        </div>
        <label class="title" for="name">${esc(t('lcdchar.name'))}</label>
        <input type="text" id="name" spellcheck="false">
        <label class="title">${esc(t('lcdchar.format'))}</label>
        <div class="options">
            <label><input type="radio" name="format" value="arduino"> B10001</label>
            <label><input type="radio" name="format" value="bin"> 0b10001</label>
            <label><input type="radio" name="format" value="hex"> 0x11</label>
        </div>
        <pre id="code"></pre>
        <div class="tools">
            <button id="insert">${esc(t('lcdchar.insert'))}</button>
            <button class="secondary" id="copy">${esc(t('snippet.copy'))}</button>
        </div>
        <div class="hint" id="usage"></div>
    </div>
</div>
<script nonce="${nonce}">const CONFIG = ${configJson};</script>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
    }
}

module.exports = {
    PixelEditor,
    parseBitmap,
    guessSize
};

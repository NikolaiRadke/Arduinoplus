/*
 * Arduino+ - Color Picker
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Picks and converts colors for LEDs and displays:
 * 0xRRGGBB, RGB565 (0xF800), strip.Color(r, g, b), CRGB(r, g, b), tft.color565(r, g, b)
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const WEBVIEW_SCRIPT = path.join(__dirname, 'colorPicker.webview.js');

// strip.Color(255, 0, 0), pixels.Color(r, g, b, w), CRGB(...), tft.color565(...)
const CALL_PATTERN = /((?:[A-Za-z_]\w*\s*(?:\.|->)\s*)?)(Color|CRGB|color565)\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d{1,3})\s*)?\)/g;
// 0xFF8000 (RGB888) or 0xF800 (RGB565)
const HEX_PATTERN = /(?<![\w.])0[xX]([0-9a-fA-F]{6}|[0-9a-fA-F]{4})(?![\w.])/g;

/**
 * RGB565 to RGB888
 * @param {number} value
 * @returns {number[]} [r, g, b]
 */
function rgb565ToRgb(value) {
    return [
        Math.round(((value >> 11) & 0x1F) * 255 / 31),
        Math.round(((value >> 5) & 0x3F) * 255 / 63),
        Math.round((value & 0x1F) * 255 / 31)
    ];
}

/**
 * Parse a color literal or call
 * @param {string} text
 * @returns {{format: string, rgb: number[], white: number|null, prefix: string}|null}
 */
function parseColor(text) {
    const trimmed = text.trim();
    CALL_PATTERN.lastIndex = 0;
    const call = CALL_PATTERN.exec(trimmed);
    if (call && call.index === 0 && call[0].length === trimmed.length) {
        const rgb = [+call[3], +call[4], +call[5]];
        if (rgb.some(v => v > 255)) return null;
        const format = call[2] === 'Color' ? 'neopixel' : call[2] === 'CRGB' ? 'crgb' : 'color565';
        return { format, rgb, white: call[6] !== undefined ? +call[6] : null, prefix: call[1].replace(/\s+/g, '') };
    }
    const hex = trimmed.match(/^0[xX]([0-9a-fA-F]{6}|[0-9a-fA-F]{4})$/);
    if (hex) {
        const value = parseInt(hex[1], 16);
        if (hex[1].length === 4) {
            return { format: 'hex565', rgb: rgb565ToRgb(value), white: null, prefix: '' };
        }
        return { format: 'hex888', rgb: [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF], white: null, prefix: '' };
    }
    return null;
}

/**
 * Find a color at the cursor position of a line
 * @returns {{start: number, end: number, text: string}|null}
 */
function findColorAt(lineText, character) {
    for (const pattern of [CALL_PATTERN, HEX_PATTERN]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return { start, end, text: match[0] };
            }
        }
    }
    return null;
}

class ColorPicker {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
        this.panel = null;
        this.target = null; // { uri, range, text } of the color found in the code
    }

    /**
     * Open the picker with the color at the cursor or in the selection
     */
    show() {
        const editor = vscode.window.activeTextEditor;
        let initial = { format: 'hex888', rgb: [255, 128, 0], white: null, prefix: '' };
        this.target = null;

        if (editor) {
            let range = null;
            let text = null;
            if (!editor.selection.isEmpty) {
                range = new vscode.Range(editor.selection.start, editor.selection.end);
                text = editor.document.getText(range);
            } else {
                const position = editor.selection.active;
                const found = findColorAt(editor.document.lineAt(position.line).text, position.character);
                if (found) {
                    range = new vscode.Range(position.line, found.start, position.line, found.end);
                    text = found.text;
                }
            }
            const parsed = text ? parseColor(text) : null;
            if (parsed) {
                initial = parsed;
                this.target = { uri: editor.document.uri.toString(), range, text };
            }
            this.lastEditorUri = editor.document.uri.toString();
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.webview.postMessage({ command: 'load', data: initial, replace: !!this.target });
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusColorPicker',
            this.t('color.title'),
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.onDidDispose(() => {
            this.panel = null;
        });
        this.panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'apply') {
                await this.apply(message.code);
            } else if (message.command === 'copy') {
                await vscode.env.clipboard.writeText(message.code);
                vscode.window.showInformationMessage(this.t('lcdchar.copied'));
            }
        });
        this.panel.webview.html = this.getWebviewContent(initial, !!this.target);
    }

    /**
     * Replace the color found in the code, or insert at the cursor
     * (the webview has the focus, so the editor is searched by its URI)
     */
    async apply(code) {
        const uri = this.target ? this.target.uri : this.lastEditorUri;
        const editor = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.toString() === uri
            ? vscode.window.activeTextEditor
            : vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri) || vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        // Only replace if the code at the old place is still the same
        const target = this.target && editor.document.uri.toString() === this.target.uri
            && editor.document.getText(this.target.range) === this.target.text ? this.target : null;

        await editor.edit(editBuilder => {
            if (target) {
                editBuilder.replace(target.range, code);
            } else if (!editor.selection.isEmpty) {
                editBuilder.replace(editor.selection, code);
            } else {
                editBuilder.insert(editor.selection.active, code);
            }
        });

        // The new text can be replaced again with the next click
        if (target) {
            const start = target.range.start;
            const range = new vscode.Range(start.line, start.character, start.line, start.character + code.length);
            this.target = { uri: target.uri, range, text: code };
        }
        vscode.window.showInformationMessage(this.t(target ? 'color.replaced' : 'lcdchar.inserted'));
    }

    /**
     * Generate the webview HTML
     */
    getWebviewContent(initial, replace) {
        const t = this.t;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const config = {
            initial,
            replace,
            labels: { apply: t('color.apply'), insert: t('lcdchar.insert') }
        };
        const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
        const script = fs.readFileSync(WEBVIEW_SCRIPT, 'utf8');
        const slider = (id, label, max) => `
            <div class="slider"><span>${label}</span><input type="range" id="${id}" min="0" max="${max}"><input type="number" id="${id}Num" min="0" max="${max}"></div>`;
        const format = (value, label) => `
            <label class="format"><input type="radio" name="format" value="${value}"><span class="label">${esc(label)}</span><code id="out-${value}"></code></label>`;

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; }
    .layout { display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; }
    .swatches { display: flex; gap: 10px; }
    .swatch { width: 120px; height: 96px; border-radius: 6px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
    .swatch-label { margin-top: 4px; font-size: 12px; color: var(--vscode-descriptionForeground); text-align: center; }
    .slider { display: grid; grid-template-columns: 28px 1fr 56px; gap: 8px; align-items: center; margin-top: 6px; }
    .slider input[type=range] { width: 100%; }
    input[type=number] { padding: 2px 4px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    input[type=color] { width: 48px; height: 28px; padding: 0; border: none; background: none; cursor: pointer; }
    .group { margin-top: 14px; width: 252px; }
    .group-title { margin: 14px 0 2px 0; color: var(--vscode-descriptionForeground); }
    .formats { min-width: 300px; flex: 1; }
    .format { display: grid; grid-template-columns: 20px 130px 1fr; align-items: center; padding: 5px 6px; border-radius: 3px; cursor: pointer; }
    .format:hover { background: var(--vscode-list-hoverBackground); }
    .format .label { color: var(--vscode-descriptionForeground); }
    .format code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); user-select: text; }
    .tools { display: flex; gap: 6px; margin-top: 14px; }
    button { padding: 5px 12px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .hint { margin-top: 10px; font-size: 12px; color: var(--vscode-descriptionForeground); max-width: 420px; }
</style>
</head>
<body>
<div class="layout">
    <div>
        <div class="swatches">
            <div><div class="swatch" id="swatch"></div><div class="swatch-label">RGB888</div></div>
            <div><div class="swatch" id="swatch565"></div><div class="swatch-label">${esc(t('color.tft'))}</div></div>
        </div>
        <div class="group">
            <div class="slider"><span></span><input type="color" id="native"><span></span></div>
            <div class="group-title">RGB</div>
            ${slider('r', 'R', 255)}${slider('g', 'G', 255)}${slider('b', 'B', 255)}
            <div class="group-title">HSV</div>
            ${slider('h', 'H', 360)}${slider('s', 'S', 100)}${slider('v', 'V', 100)}
        </div>
    </div>
    <div class="formats">
        <div class="group-title" style="margin-top: 0">${esc(t('lcdchar.format'))}</div>
        ${format('hex888', 'RGB888')}
        ${format('hex565', 'RGB565 (TFT)')}
        ${format('neopixel', 'NeoPixel')}
        ${format('crgb', 'FastLED')}
        ${format('color565', 'TFT color565')}
        <div class="tools">
            <button id="apply"></button>
            <button class="secondary" id="copy">${esc(t('snippet.copy'))}</button>
        </div>
        <div class="hint">${esc(t('color.hint'))}</div>
    </div>
</div>
<script nonce="${nonce}">const CONFIG = ${configJson};</script>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
    }
}

module.exports = {
    ColorPicker,
    parseColor,
    findColorAt,
    rgb565ToRgb
};

/*
 * Arduino+ - LCD Custom Character Editor
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Paints a 5x8 character for HD44780 displays (LiquidCrystal, createChar)
 * and inserts it as byte array.
 */

"use strict";

const vscode = require('vscode');
const { parseNumber } = require('./numberConverter');

const ROWS = 8;
const COLS = 5;

/**
 * Read an existing character array from the selection
 * @param {string} text - e.g. "byte smiley[8] = { B00000, B01010, ... };"
 * @returns {{name: string, rows: number[], format: string}|null}
 */
function parseCharArray(text) {
    const body = text.includes('{') ? text.substring(text.indexOf('{') + 1, text.lastIndexOf('}') > 0 ? text.lastIndexOf('}') : undefined) : text;
    const tokens = body.split(/[\s,]+/).map(token => token.trim()).filter(Boolean);
    const rows = [];
    let format = null;
    for (const token of tokens) {
        const parsed = parseNumber(token);
        if (!parsed) continue;
        rows.push(Number(parsed.value & 0x1Fn));
        format = format || parsed.format;
        if (rows.length === ROWS) break;
    }
    if (rows.length === 0) return null;
    while (rows.length < ROWS) rows.push(0);

    const nameMatch = text.match(/([A-Za-z_]\w*)\s*\[\s*\d*\s*\]/);
    return {
        name: nameMatch ? nameMatch[1] : 'customChar',
        rows,
        format: format === 'hex' ? 'hex' : format === 'bin' ? 'bin' : 'arduino'
    };
}

class LcdCharEditor {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
        this.panel = null;
        this.targetEditor = null;
    }

    /**
     * Open the editor, prefilled with a selected character array
     */
    show() {
        const editor = vscode.window.activeTextEditor;
        this.targetEditor = editor || this.targetEditor;

        let initial = { name: 'customChar', rows: new Array(ROWS).fill(0), format: 'arduino' };
        if (editor && !editor.selection.isEmpty) {
            initial = parseCharArray(editor.document.getText(editor.selection)) || initial;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.webview.postMessage({ command: 'load', data: initial });
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusLcdChar',
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
            }
        });

        this.panel.webview.html = this.getWebviewContent(initial);
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
                // Replaces the character array that was selected
                editBuilder.replace(editor.selection, code.replace(/\n$/, ''));
            }
        });
        vscode.window.showInformationMessage(this.t('lcdchar.inserted'));
    }

    /**
     * Generate the webview HTML
     * @param {Object} initial - {name, rows, format}
     * @returns {string}
     */
    getWebviewContent(initial) {
        const t = this.t;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; user-select: none; }
    .layout { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
    .grid { display: grid; grid-template-columns: repeat(${COLS}, 32px); grid-template-rows: repeat(${ROWS}, 32px); gap: 3px; padding: 10px; border-radius: 4px; background: #1b3d1b; width: max-content; cursor: crosshair; }
    .pixel { border-radius: 2px; background: #2f5f2f; }
    .pixel.on { background: #c8f7c8; box-shadow: 0 0 4px #c8f7c8; }
    .tools { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    .controls label { display: block; margin: 10px 0 4px 0; color: var(--vscode-descriptionForeground); }
    .controls label:first-child { margin-top: 0; }
    input[type=text] { width: 180px; padding: 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); font-family: var(--vscode-editor-font-family); }
    .formats label { display: inline; margin-right: 12px; color: var(--vscode-foreground); }
    pre { margin: 10px 0; padding: 10px 12px; border-radius: 3px; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); user-select: text; }
    button { padding: 5px 12px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .hint { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="layout">
    <div>
        <div class="grid" id="grid"></div>
        <div class="tools">
            <button class="secondary" data-shift="up" title="${esc(t('lcdchar.shift'))}">↑</button>
            <button class="secondary" data-shift="down" title="${esc(t('lcdchar.shift'))}">↓</button>
            <button class="secondary" data-shift="left" title="${esc(t('lcdchar.shift'))}">←</button>
            <button class="secondary" data-shift="right" title="${esc(t('lcdchar.shift'))}">→</button>
        </div>
        <div class="tools">
            <button class="secondary" id="invert">${esc(t('lcdchar.invert'))}</button>
            <button class="secondary" id="clear">${esc(t('lcdchar.clear'))}</button>
        </div>
        <div class="hint">${esc(t('lcdchar.hint'))}</div>
    </div>
    <div class="controls">
        <label for="name">${esc(t('lcdchar.name'))}</label>
        <input type="text" id="name" spellcheck="false">
        <label>${esc(t('lcdchar.format'))}</label>
        <div class="formats">
            <label><input type="radio" name="format" value="arduino"> B10001</label>
            <label><input type="radio" name="format" value="bin"> 0b10001</label>
            <label><input type="radio" name="format" value="hex"> 0x11</label>
        </div>
        <pre id="code"></pre>
        <div class="tools">
            <button id="insert">${esc(t('lcdchar.insert'))}</button>
            <button class="secondary" id="copy">${esc(t('snippet.copy'))}</button>
        </div>
        <div class="hint">${esc(t('lcdchar.usage'))}</div>
    </div>
</div>
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const ROWS = ${ROWS}, COLS = ${COLS}, MASK = (1 << COLS) - 1;
    let rows = [];
    let paintValue = null;

    const grid = document.getElementById('grid');
    const nameInput = document.getElementById('name');
    const codeBox = document.getElementById('code');

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const pixel = document.createElement('div');
            pixel.className = 'pixel';
            pixel.dataset.row = r;
            pixel.dataset.col = c;
            grid.appendChild(pixel);
        }
    }

    function bit(c) { return 1 << (COLS - 1 - c); }

    function setPixel(pixel, on) {
        const r = +pixel.dataset.row, c = +pixel.dataset.col;
        rows[r] = on ? (rows[r] | bit(c)) : (rows[r] & ~bit(c));
        render();
    }

    function format(value) {
        const f = document.querySelector('input[name=format]:checked').value;
        if (f === 'hex') return '0x' + value.toString(16).toUpperCase().padStart(2, '0');
        const bin = value.toString(2).padStart(COLS, '0');
        return f === 'bin' ? '0b' + bin : 'B' + bin;
    }

    function code() {
        const name = (nameInput.value.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'customChar').replace(/^(\\d)/, '_$1');
        return 'byte ' + name + '[8] = {\\n' + rows.map((v, i) => '  ' + format(v) + (i < ROWS - 1 ? ',' : '')).join('\\n') + '\\n};\\n';
    }

    function render() {
        grid.querySelectorAll('.pixel').forEach(pixel => {
            pixel.classList.toggle('on', (rows[+pixel.dataset.row] & bit(+pixel.dataset.col)) !== 0);
        });
        codeBox.textContent = code();
    }

    function load(data) {
        rows = data.rows.slice(0, ROWS).map(v => v & MASK);
        while (rows.length < ROWS) rows.push(0);
        nameInput.value = data.name;
        document.querySelector('input[name=format][value=' + data.format + ']').checked = true;
        render();
    }

    // Click or drag: the first pixel decides whether to paint or erase
    grid.addEventListener('mousedown', event => {
        if (!event.target.classList.contains('pixel')) return;
        paintValue = !event.target.classList.contains('on');
        setPixel(event.target, paintValue);
        event.preventDefault();
    });
    grid.addEventListener('mouseover', event => {
        if (paintValue !== null && event.target.classList.contains('pixel')) setPixel(event.target, paintValue);
    });
    window.addEventListener('mouseup', () => { paintValue = null; });

    document.querySelectorAll('[data-shift]').forEach(button => button.addEventListener('click', () => {
        const dir = button.dataset.shift;
        if (dir === 'up') rows = rows.slice(1).concat(rows[0]);
        if (dir === 'down') rows = [rows[ROWS - 1]].concat(rows.slice(0, ROWS - 1));
        if (dir === 'left') rows = rows.map(v => ((v << 1) | (v >> (COLS - 1))) & MASK);
        if (dir === 'right') rows = rows.map(v => ((v >> 1) | ((v & 1) << (COLS - 1))) & MASK);
        render();
    }));
    document.getElementById('invert').addEventListener('click', () => { rows = rows.map(v => ~v & MASK); render(); });
    document.getElementById('clear').addEventListener('click', () => { rows = rows.map(() => 0); render(); });
    document.querySelectorAll('input[name=format]').forEach(radio => radio.addEventListener('change', render));
    nameInput.addEventListener('input', render);
    document.getElementById('insert').addEventListener('click', () => vscode.postMessage({ command: 'insert', code: code() }));
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ command: 'copy', code: code() }));

    window.addEventListener('message', event => {
        if (event.data.command === 'load') load(event.data.data);
    });

    load(${JSON.stringify(initial)});
</script>
</body>
</html>`;
    }
}

module.exports = {
    LcdCharEditor,
    parseCharArray
};

/*
 * Arduino+ - LCD Custom Character Editor
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Paints custom characters and icons and inserts them as byte array:
 * 5x8 for HD44780 LCDs (createChar), 8x8 for LED matrices (MAX7219),
 * 16x16 for OLEDs (Adafruit GFX drawBitmap).
 */

"use strict";

const vscode = require('vscode');
const { parseNumber } = require('./numberConverter');

// Grid sizes: HD44780 custom character, MAX7219 LED matrix, OLED icon (Adafruit GFX)
const SIZES = {
    lcd: { cols: 5, rows: 8 },
    matrix: { cols: 8, rows: 8 },
    oled: { cols: 16, rows: 16 }
};

/**
 * Read an existing character or bitmap array from the selection
 * @param {string} text - e.g. "byte smiley[8] = { B00000, B01010, ... };"
 * @returns {{name: string, rows: number[], format: string, size: string}|null}
 */
function parseCharArray(text) {
    const open = text.indexOf('{');
    const close = text.lastIndexOf('}');
    const body = open !== -1 ? text.substring(open + 1, close > open ? close : undefined) : text;
    const values = [];
    let format = null;
    for (const token of body.split(/[\s,]+/).filter(Boolean)) {
        const parsed = parseNumber(token);
        if (!parsed) continue;
        values.push(Number(parsed.value & 0xFFn));
        format = format || parsed.format;
        if (values.length === 32) break;
    }
    if (values.length === 0) return null;

    let size = 'lcd';
    if (values.length > 8 || /PROGMEM/.test(text)) size = 'oled';
    else if (values.some(v => v > 31)) size = 'matrix';

    const rows = [];
    for (let r = 0; r < SIZES[size].rows; r++) {
        rows.push(size === 'oled'
            ? ((values[r * 2] || 0) << 8) | (values[r * 2 + 1] || 0)
            : (values[r] || 0) & ((1 << SIZES[size].cols) - 1));
    }

    const nameMatch = text.match(/([A-Za-z_]\w*)\s*\[\s*\d*\s*\]/);
    return {
        name: nameMatch ? nameMatch[1] : 'customChar',
        rows,
        format: format === 'hex' ? 'hex' : format === 'bin' ? 'bin' : 'arduino',
        size
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

        let initial = { name: 'customChar', rows: new Array(SIZES.lcd.rows).fill(0), format: 'arduino', size: 'lcd' };
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
                // Replaces the array that was selected
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
    .grid { display: grid; gap: 3px; padding: 10px; border-radius: 4px; width: max-content; cursor: crosshair; }
    .pixel { border-radius: 2px; }
    .grid.lcd { background: #1b3d1b; }
    .grid.lcd .pixel { background: #2f5f2f; }
    .grid.lcd .pixel.on { background: #c8f7c8; box-shadow: 0 0 4px #c8f7c8; }
    .grid.matrix { background: #111; }
    .grid.matrix .pixel { border-radius: 50%; background: #3a1010; }
    .grid.matrix .pixel.on { background: #ff3b30; box-shadow: 0 0 6px #ff3b30; }
    .grid.oled { background: #000; gap: 2px; }
    .grid.oled .pixel { border-radius: 1px; background: #101820; }
    .grid.oled .pixel.on { background: #7fd4ff; box-shadow: 0 0 3px #7fd4ff; }
    .tools { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
    .controls label.title { display: block; margin: 12px 0 4px 0; color: var(--vscode-descriptionForeground); }
    .controls label.title:first-child { margin-top: 0; }
    .options label { margin-right: 12px; white-space: nowrap; }
    input[type=text] { width: 180px; padding: 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); font-family: var(--vscode-editor-font-family); }
    pre { margin: 10px 0; padding: 10px 12px; max-height: 340px; overflow: auto; border-radius: 3px; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); user-select: text; }
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
        <label class="title">${esc(t('lcdchar.size'))}</label>
        <div class="options">
            <label><input type="radio" name="size" value="lcd"> ${esc(t('lcdchar.sizeLcd'))}</label>
            <label><input type="radio" name="size" value="matrix"> ${esc(t('lcdchar.sizeMatrix'))}</label>
            <label><input type="radio" name="size" value="oled"> ${esc(t('lcdchar.sizeOled'))}</label>
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
<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const SIZES = ${JSON.stringify(SIZES)};
    const PIXEL = { lcd: 32, matrix: 30, oled: 18 };
    const USAGE = ${JSON.stringify({ lcd: t('lcdchar.usage'), matrix: t('lcdchar.usageMatrix'), oled: t('lcdchar.usageOled') })};
    let size = 'lcd';
    let rows = [];
    let paintValue = null;

    const grid = document.getElementById('grid');
    const nameInput = document.getElementById('name');
    const codeBox = document.getElementById('code');

    function cols() { return SIZES[size].cols; }
    function mask() { return (1 << cols()) - 1; }
    function bit(c) { return 1 << (cols() - 1 - c); }

    function buildGrid() {
        const { cols: c, rows: r } = SIZES[size];
        grid.className = 'grid ' + size;
        grid.style.gridTemplateColumns = 'repeat(' + c + ', ' + PIXEL[size] + 'px)';
        grid.style.gridTemplateRows = 'repeat(' + r + ', ' + PIXEL[size] + 'px)';
        grid.innerHTML = '';
        for (let y = 0; y < r; y++) {
            for (let x = 0; x < c; x++) {
                const pixel = document.createElement('div');
                pixel.className = 'pixel';
                pixel.dataset.row = y;
                pixel.dataset.col = x;
                grid.appendChild(pixel);
            }
        }
        document.getElementById('usage').textContent = USAGE[size];
    }

    function setPixel(pixel, on) {
        const r = +pixel.dataset.row, c = +pixel.dataset.col;
        rows[r] = on ? (rows[r] | bit(c)) : (rows[r] & ~bit(c));
        render();
    }

    function formatByte(value, bits) {
        const f = document.querySelector('input[name=format]:checked').value;
        if (f === 'hex') return '0x' + value.toString(16).toUpperCase().padStart(2, '0');
        const bin = value.toString(2).padStart(bits, '0');
        return f === 'bin' ? '0b' + bin : 'B' + bin;
    }

    function code() {
        const name = (nameInput.value.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'customChar').replace(/^(\\d)/, '_$1');
        if (size === 'oled') {
            // Adafruit GFX drawBitmap: rows of 2 bytes, MSB is the left pixel
            const lines = rows.map(v => '  ' + formatByte(v >> 8, 8) + ', ' + formatByte(v & 0xFF, 8));
            return 'const uint8_t ' + name + '[] PROGMEM = {\\n' + lines.join(',\\n') + '\\n};\\n';
        }
        const lines = rows.map(v => '  ' + formatByte(v, cols()));
        return 'byte ' + name + '[8] = {\\n' + lines.join(',\\n') + '\\n};\\n';
    }

    function render() {
        grid.querySelectorAll('.pixel').forEach(pixel => {
            pixel.classList.toggle('on', (rows[+pixel.dataset.row] & bit(+pixel.dataset.col)) !== 0);
        });
        codeBox.textContent = code();
    }

    // New size: keep the drawing, aligned top left
    function setSize(newSize) {
        const oldCols = cols();
        const { cols: c, rows: r } = SIZES[newSize];
        const shift = c - oldCols;
        rows = Array.from({ length: r }, (_, y) => {
            const v = rows[y] || 0;
            return (shift >= 0 ? v << shift : v >> -shift) & ((1 << c) - 1);
        });
        size = newSize;
        document.querySelector('input[name=size][value=' + size + ']').checked = true;
        buildGrid();
        render();
    }

    function load(data) {
        size = SIZES[data.size] ? data.size : 'lcd';
        rows = data.rows.slice(0, SIZES[size].rows).map(v => v & mask());
        while (rows.length < SIZES[size].rows) rows.push(0);
        nameInput.value = data.name;
        document.querySelector('input[name=size][value=' + size + ']').checked = true;
        document.querySelector('input[name=format][value=' + data.format + ']').checked = true;
        buildGrid();
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
        const dir = button.dataset.shift, n = rows.length, c = cols(), m = mask();
        if (dir === 'up') rows = rows.slice(1).concat(rows[0]);
        if (dir === 'down') rows = [rows[n - 1]].concat(rows.slice(0, n - 1));
        if (dir === 'left') rows = rows.map(v => ((v << 1) | (v >> (c - 1))) & m);
        if (dir === 'right') rows = rows.map(v => ((v >> 1) | ((v & 1) << (c - 1))) & m);
        render();
    }));
    document.getElementById('invert').addEventListener('click', () => { rows = rows.map(v => ~v & mask()); render(); });
    document.getElementById('clear').addEventListener('click', () => { rows = rows.map(() => 0); render(); });
    document.querySelectorAll('input[name=size]').forEach(radio => radio.addEventListener('change', () => setSize(radio.value)));
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
    parseCharArray,
    SIZES
};

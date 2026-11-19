/*
 * Arduino+ - Print
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * The Arduino IDE can't print. Webviews can't print either, so the sketch
 * is written as HTML page with syntax colors and opened in the browser,
 * which prints it (or saves it as PDF).
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { getSketchFiles } = require('./todoList');

// Not in /tmp: a Flatpak IDE has its own /tmp the browser can't see
const PRINT_DIR = path.join(os.homedir(), '.arduinoplus', 'print');

const CONTROL = new Set(('if else for while do switch case default break continue return goto sizeof new delete try catch throw ' +
    'class struct enum union typedef template typename namespace using public private protected virtual override static ' +
    'const constexpr volatile extern inline auto operator this nullptr PROGMEM').split(' '));
const TYPES = new Set(('void bool boolean char unsigned signed short int long float double byte word String size_t ' +
    'uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t Serial Serial1 Serial2 Wire SPI EEPROM').split(' '));
const CONSTANTS = new Set('HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN true false NULL PI LSBFIRST MSBFIRST CHANGE RISING FALLING'.split(' '));

const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Syntax colors for C/C++ lines. Returns HTML per line; block comments
 * may span several lines. Mistakes here are only cosmetic.
 * @param {string[]} lines
 * @returns {string[]} HTML of each line
 */
function highlightLines(lines) {
    let inComment = false;
    return lines.map(line => {
        let out = '';
        let i = 0;
        const span = (cls, text) => `<span class="${cls}">${escapeHtml(text)}</span>`;

        if (inComment) {
            const end = line.indexOf('*/');
            if (end === -1) return span('c', line);
            out += span('c', line.slice(0, end + 2));
            i = end + 2;
            inComment = false;
        }

        // Preprocessor: the directive itself, the rest is colored normally
        const directive = i === 0 && line.match(/^(\s*#\s*\w+)/);
        if (directive) {
            out += span('p', directive[1]);
            i = directive[1].length;
            // #include <file.h>
            const include = line.slice(i).match(/^(\s*)(<[^>]*>)/);
            if (include) {
                out += escapeHtml(include[1]) + span('s', include[2]);
                i += include[0].length;
            }
        }

        while (i < line.length) {
            const rest = line.slice(i);
            let match;
            if (rest.startsWith('//')) {
                out += span('c', rest);
                break;
            }
            if (rest.startsWith('/*')) {
                const end = rest.indexOf('*/', 2);
                if (end === -1) {
                    out += span('c', rest);
                    inComment = true;
                    break;
                }
                out += span('c', rest.slice(0, end + 2));
                i += end + 2;
                continue;
            }
            if ((match = rest.match(/^"(?:\\.|[^"\\])*"?|^'(?:\\.|[^'\\])*'?/))) {
                out += span('s', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = rest.match(/^(?:0[xX][0-9a-fA-F']+|0[bB][01']+|\d[\d']*\.?\d*(?:[eE][+-]?\d+)?)[uUlLfF]*/))) {
                out += span('n', match[0]);
                i += match[0].length;
                continue;
            }
            if ((match = rest.match(/^[A-Za-z_]\w*/))) {
                const word = match[0];
                const isCall = /^\s*\(/.test(rest.slice(word.length));
                let cls = null;
                if (CONTROL.has(word)) cls = 'k';
                else if (TYPES.has(word)) cls = 't';
                else if (CONSTANTS.has(word) || /^A\d{1,2}$/.test(word)) cls = 'o';
                else if (isCall) cls = 'f';
                out += cls ? span(cls, word) : escapeHtml(word);
                i += word.length;
                continue;
            }
            out += escapeHtml(line[i]);
            i++;
        }
        return out;
    });
}

/**
 * Text of a file, open editors with their unsaved changes
 */
function readText(file) {
    const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file);
    return open ? open.getText() : fs.readFileSync(file, 'utf8');
}

/**
 * Build the print page
 * @param {Array<{name: string, text: string, current: boolean}>} files
 * @param {string} sketchName
 * @param {Function} t - Translation function
 * @returns {string} HTML
 */
function buildPage(files, sketchName, t) {
    const date = new Date().toLocaleString(vscode.env.language || 'en', { dateStyle: 'medium', timeStyle: 'short' });
    const sections = files.map(file => {
        const lines = file.text.split(/\r?\n/);
        // No empty last line from the final line break
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
        const rows = highlightLines(lines)
            .map((html, index) => `<tr><td class="num">${index + 1}</td><td class="code">${html || ' '}</td></tr>`)
            .join('\n');
        return `<section class="file${file.current ? ' current' : ''}">
<header><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(sketchName)} · ${escapeHtml(date)}</span></header>
<table>${rows}</table>
</section>`;
    }).join('\n');

    const sizes = [8, 9, 10, 11, 12].map(size =>
        `<option value="${size}"${size === 10 ? ' selected' : ''}>${size} pt</option>`).join('');

    return `<!DOCTYPE html>
<html lang="${escapeHtml(vscode.env.language || 'en')}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(sketchName)} – Arduino+</title>
<style>
    body { margin: 0; font-family: system-ui, sans-serif; color: #222; background: #fff; }
    .toolbar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 10px 20px; background: #2bc4b6; color: #fff; font-size: 14px; }
    .toolbar strong { margin-right: 8px; }
    .toolbar label { white-space: nowrap; cursor: pointer; }
    .toolbar button { padding: 6px 18px; border: none; border-radius: 3px; background: #fff; color: #00796f; font-weight: bold; font-size: 14px; cursor: pointer; }
    .toolbar .hint { flex-basis: 100%; font-size: 12px; opacity: .9; }
    main { padding: 20px; }
    section.file { margin-bottom: 32px; }
    header { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 4px; margin-bottom: 8px; border-bottom: 1px solid #999; font-size: 11pt; }
    header span { color: #666; }
    table { border-collapse: collapse; width: 100%; font-family: "Courier New", Consolas, monospace; font-size: var(--size, 10pt); line-height: 1.35; }
    td { vertical-align: top; padding: 0; }
    td.num { width: 1%; padding-right: 10px; text-align: right; color: #999; white-space: nowrap; user-select: none; }
    td.code { white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }
    .k { color: #728e00; } .t { color: #00979d; } .o { color: #00979d; } .f { color: #d35400; }
    .s { color: #005c5f; } .n { color: #8a7b52; } .c { color: #95a5a6; } .p { color: #5e6d03; }
    body.mono .k, body.mono .t, body.mono .o, body.mono .f, body.mono .s, body.mono .n, body.mono .p { color: inherit; }
    body.mono .k, body.mono .t { font-weight: bold; }
    body.mono .c { color: #666; font-style: italic; }
    body.nonum td.num { display: none; }
    body.only-current section.file:not(.current) { display: none; }
    @media print {
        .toolbar { display: none; }
        main { padding: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        section.file { margin: 0; }
        section.file + section.file { break-before: page; }
        body.only-current section.file.current { break-before: auto; }
        tr { break-inside: avoid; }
        @page { size: A4; margin: 15mm; }
    }
</style>
</head>
<body class="only-current">
<div class="toolbar">
    <strong>Arduino+</strong>
    <label><input type="radio" name="scope" value="current" checked> ${escapeHtml(t('print.current'))}</label>
    <label><input type="radio" name="scope" value="all"> ${escapeHtml(t('print.all', files.length))}</label>
    <label><input type="checkbox" id="colors" checked> ${escapeHtml(t('print.colors'))}</label>
    <label><input type="checkbox" id="numbers" checked> ${escapeHtml(t('print.numbers'))}</label>
    <label>${escapeHtml(t('print.size'))} <select id="size">${sizes}</select></label>
    <button id="print">🖨️ ${escapeHtml(t('print.print'))}</button>
    <span class="hint">${escapeHtml(t('print.hint'))}</span>
</div>
<main>
${sections}
</main>
<script>
    const body = document.body;
    document.querySelectorAll('input[name=scope]').forEach(radio => radio.addEventListener('change', () =>
        body.classList.toggle('only-current', radio.value === 'current' && radio.checked)));
    document.getElementById('colors').addEventListener('change', event => body.classList.toggle('mono', !event.target.checked));
    document.getElementById('numbers').addEventListener('change', event => body.classList.toggle('nonum', !event.target.checked));
    document.getElementById('size').addEventListener('change', event => body.style.setProperty('--size', event.target.value + 'pt'));
    document.getElementById('print').addEventListener('click', () => window.print());
</script>
</body>
</html>`;
}

/**
 * Open a local file in the default browser: openExternal first,
 * then the system command (xdg-open, open, start)
 * @returns {Promise<boolean>}
 */
async function openInBrowser(file) {
    try {
        if (await vscode.env.openExternal(vscode.Uri.file(file))) return true;
    } catch (error) {
        // Try the system command
    }
    const command = process.platform === 'win32' ? `start "" "${file}"`
        : process.platform === 'darwin' ? `open "${file}"`
        : `xdg-open "${file}"`;
    return new Promise(resolve => exec(command, error => resolve(!error)));
}

/**
 * Print the sketch: write the page and open it in the browser
 * @param {Function} t - Translation function
 */
async function printSketch(t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    const current = editor.document.uri.fsPath;
    const sketchFolder = path.dirname(current);
    const sketchName = path.basename(sketchFolder);
    const sketchFiles = getSketchFiles(sketchFolder);
    if (!sketchFiles.includes(current)) sketchFiles.unshift(current);

    try {
        const files = sketchFiles.map(file => ({
            name: path.relative(sketchFolder, file),
            text: file === current ? editor.document.getText() : readText(file),
            current: file === current
        }));
        fs.mkdirSync(PRINT_DIR, { recursive: true });
        const target = path.join(PRINT_DIR, sketchName.replace(/[^\w.-]/g, '_') + '.html');
        fs.writeFileSync(target, buildPage(files, sketchName, t), 'utf8');

        if (!await openInBrowser(target)) {
            vscode.window.showWarningMessage(t('print.openFailed', target));
        }
    } catch (error) {
        vscode.window.showErrorMessage(t('print.failed', error.message));
    }
}

module.exports = {
    printSketch,
    highlightLines,
    buildPage
};

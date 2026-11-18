/*
 * Arduino+ - Melody Editor
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Composes melodies for tone(), plays them in the webview and inserts
 * note and duration arrays. Imports RTTTL ringtones and existing arrays.
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const WEBVIEW_SCRIPT = path.join(__dirname, 'melodyEditor.webview.js');
const NOTE_NAMES = ['C', 'CS', 'D', 'DS', 'E', 'F', 'FS', 'G', 'GS', 'A', 'AS', 'B'];
const VALID_DURATIONS = [1, 2, 4, 8, 16, 32];
// Example melodies, public domain only
const EXAMPLES = [
    {
        label: 'Für Elise (Beethoven)',
        rtttl: 'fuerElise:d=16,o=5,b=80:e,d#,e,d#,e,b4,d,c,8a4,p,c4,e4,a4,8b4,p,e4,g#4,b4,8c,p,e4,' +
            'e,d#,e,d#,e,b4,d,c,8a4,p,c4,e4,a4,8b4,p,e4,c,b4,4a4'
    }
];
// pitches.h knows NOTE_B0 (MIDI 23, 31 Hz) to NOTE_DS8 (MIDI 111, 4978 Hz)
const MIN_MIDI = 23;
const MAX_MIDI = 111;

/**
 * Clamp a MIDI note into the range of pitches.h
 */
function clampMidi(midi) {
    return Math.max(MIN_MIDI, Math.min(MAX_MIDI, midi));
}

/**
 * Parse an RTTTL ringtone, e.g. "Tetris:d=4,o=5,b=160:e6,8b,8c6,8d6"
 * @param {string} text
 * @returns {{name: string, tempo: number, notes: Array}|null}
 */
function parseRtttl(text) {
    // Allow the string with quotes from source code
    const clean = String(text).trim().replace(/^[^"]*"/, '').replace(/"[^"]*$/, '').replace(/\s+/g, '');
    const parts = clean.split(':');
    if (parts.length < 3) return null;

    const settings = { d: 4, o: 6, b: 63 };
    for (const setting of parts[1].split(',')) {
        const match = setting.toLowerCase().match(/^([dob])=(\d+)$/);
        if (match) settings[match[1]] = +match[2];
    }

    const notes = [];
    for (const token of parts.slice(2).join(':').split(',')) {
        const match = token.toLowerCase().match(/^(\d{1,2})?([a-hp])(#?)(\.?)(\d)?(\.?)$/);
        if (!match) continue;
        const duration = match[1] ? +match[1] : settings.d;
        const dot = !!(match[4] || match[6]);
        let midi = null;
        if (match[2] !== 'p') {
            const letter = match[2] === 'h' ? 'b' : match[2];
            const index = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[letter] + (match[3] ? 1 : 0);
            const octave = match[5] ? +match[5] : settings.o;
            midi = clampMidi((octave + 1) * 12 + index);
        }
        notes.push({ midi, d: VALID_DURATIONS.includes(duration) ? duration : 4, dot });
    }
    if (notes.length === 0) return null;
    return { name: parts[0].replace(/[^A-Za-z0-9_]/g, '_') || 'melody', tempo: settings.b || 120, notes };
}

/**
 * Frequency to the nearest MIDI note
 */
function hzToMidi(hz) {
    return clampMidi(Math.round(69 + 12 * Math.log2(hz / 440)));
}

/**
 * Parse existing arrays: first {...} are the notes (NOTE_xx, REST/0 or Hz),
 * second {...} the durations (4 = quarter, negative = dotted)
 * @param {string} text
 * @returns {{name: string, tempo: number, notes: Array}|null}
 */
function parseMelodyCode(text) {
    const blocks = [...String(text).matchAll(/\{([^}]*)\}/g)].map(match => match[1].replace(/\/\/.*$/gm, ''));
    if (blocks.length === 0) return null;

    const noteTokens = blocks[0].split(/[\s,]+/).filter(Boolean);
    const durationTokens = blocks.length > 1 ? blocks[1].split(/[\s,]+/).filter(Boolean) : [];
    const notes = [];
    for (let i = 0; i < noteTokens.length; i++) {
        const token = noteTokens[i];
        let midi;
        const named = token.match(/^NOTE_([A-G])(S?)(\d)$/);
        if (named) {
            midi = clampMidi((+named[3] + 1) * 12 + NOTE_NAMES.indexOf(named[1] + named[2]));
        } else if (token === 'REST' || token === '0') {
            midi = null;
        } else if (/^\d+$/.test(token)) {
            midi = hzToMidi(+token);
        } else {
            return null;
        }
        const raw = durationTokens[i] !== undefined ? parseInt(durationTokens[i], 10) : 4;
        const d = Math.abs(raw) || 4;
        notes.push({ midi, d: VALID_DURATIONS.includes(d) ? d : 4, dot: raw < 0 });
    }
    if (notes.length === 0) return null;

    const nameMatch = String(text).match(/([A-Za-z_]\w*)\s*\[\s*\d*\s*\]/);
    const tempoMatch = String(text).match(/(\d{2,3})\s*BPM/i) || String(text).match(/[Tt]empo\w*\s*=\s*(\d{2,3})/);
    return {
        name: nameMatch ? nameMatch[1] : 'melody',
        tempo: tempoMatch ? +tempoMatch[1] : 120,
        notes
    };
}

class MelodyEditor {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
        this.panel = null;
        this.targetEditor = null;
    }

    /**
     * Open the editor, with the selected melody or RTTTL string
     */
    show() {
        const editor = vscode.window.activeTextEditor;
        this.targetEditor = editor || this.targetEditor;

        let initial = { name: 'melody', tempo: 120, notes: [] };
        if (editor && !editor.selection.isEmpty) {
            const text = editor.document.getText(editor.selection);
            initial = (/:\s*[dob]\s*=/i.test(text) ? parseRtttl(text) : parseMelodyCode(text)) || initial;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.panel.webview.postMessage({ command: 'load', data: initial });
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusMelodyEditor',
            this.t('melody.title'),
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
            } else if (message.command === 'example') {
                const example = EXAMPLES[message.index];
                if (example) this.panel.webview.postMessage({ command: 'load', data: parseRtttl(example.rtttl) });
            } else if (message.command === 'rtttl') {
                const parsed = parseRtttl(message.text);
                if (parsed) {
                    this.panel.webview.postMessage({ command: 'load', data: parsed });
                } else {
                    vscode.window.showWarningMessage(this.t('melody.rtttlFailed'));
                }
            }
        });
        this.panel.webview.html = this.getWebviewContent(initial);
    }

    /**
     * Insert code into the editor the panel was opened from
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
                editBuilder.replace(editor.selection, code.replace(/\n$/, ''));
            }
        });
        vscode.window.showInformationMessage(this.t('lcdchar.inserted'));
    }

    /**
     * Generate the webview HTML
     */
    getWebviewContent(initial) {
        const t = this.t;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const config = {
            initial,
            noteNames: NOTE_NAMES,
            examples: EXAMPLES.map(example => example.label),
            minMidi: MIN_MIDI,
            maxMidi: MAX_MIDI,
            labels: {
                count: t('melody.count'),
                empty: t('melody.empty'),
                play: t('melody.play'),
                stop: t('melody.stop'),
                pitchesHint: t('melody.pitchesHint'),
                durationsHint: t('melody.durationsHint'),
                usage: t('melody.usage')
            }
        };
        const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
        const script = fs.readFileSync(WEBVIEW_SCRIPT, 'utf8');
        const durations = VALID_DURATIONS.map(d =>
            `<label><input type="radio" name="duration" value="${d}"${d === 4 ? ' checked' : ''}> 1/${d}</label>`).join('');

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; }
    .bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    .bar label { white-space: nowrap; }
    .sep { width: 1px; height: 22px; background: var(--vscode-panel-border, rgba(128,128,128,.35)); }
    input[type=number], input[type=text] { padding: 3px 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    input[type=number] { width: 56px; }
    select { padding: 3px 5px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); font-family: inherit; }
    input[type=text] { width: 160px; font-family: var(--vscode-editor-font-family); }
    textarea { width: 100%; box-sizing: border-box; height: 52px; padding: 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); font-family: var(--vscode-editor-font-family); resize: vertical; }
    button { padding: 5px 12px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.small { padding: 2px 8px; font-size: 12px; }
    .keyboard { position: relative; height: 120px; margin: 8px 0 14px 0; user-select: none; }
    .white { position: absolute; top: 0; width: 34px; height: 118px; box-sizing: border-box; border: 1px solid #555; border-radius: 0 0 4px 4px; background: #f4f4f4; color: #333; font-size: 10px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; cursor: pointer; }
    .black { position: absolute; top: 0; width: 22px; height: 72px; border-radius: 0 0 3px 3px; background: #222; z-index: 2; cursor: pointer; }
    .white:hover { background: #ddd; } .black:hover { background: #444; }
    .white.down, .black.down { background: var(--vscode-button-background); }
    .sequence { display: flex; flex-wrap: wrap; gap: 4px; min-height: 34px; padding: 6px; border-radius: 4px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
    .chip { padding: 3px 7px; border-radius: 3px; cursor: pointer; font-family: var(--vscode-editor-font-family); font-size: 12px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .chip small { opacity: .75; margin-left: 3px; }
    .chip.rest { opacity: .6; }
    .chip.selected { outline: 2px solid var(--vscode-focusBorder); }
    .chip.playing { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .empty { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 4px; }
    .columns { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 14px; }
    .columns > div { flex: 1; min-width: 280px; }
    .title { margin: 0 0 4px 0; color: var(--vscode-descriptionForeground); }
    pre { margin: 8px 0; padding: 10px 12px; max-height: 260px; overflow: auto; border-radius: 3px; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
    .hint { margin-top: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="bar">
    <button id="play"></button>
    <label>${esc(t('melody.tempo'))} <input type="number" id="tempo" min="20" max="400"> BPM</label>
    <select id="example"><option value="">${esc(t('melody.example'))}</option></select>
    <span class="sep"></span>
    <span>${esc(t('melody.duration'))}</span> ${durations}
    <label><input type="checkbox" id="dotted"> ${esc(t('melody.dotted'))}</label>
</div>
<div class="bar">
    <button class="secondary small" id="octaveDown">◀</button>
    <span id="octaveLabel"></span>
    <button class="secondary small" id="octaveUp">▶</button>
    <span class="sep"></span>
    <button class="secondary small" id="rest">${esc(t('melody.rest'))}</button>
    <button class="secondary small" id="delete">${esc(t('melody.delete'))}</button>
    <button class="secondary small" id="clearAll">${esc(t('lcdchar.clear'))}</button>
    <span id="count" class="hint" style="margin-top: 0"></span>
</div>
<div class="keyboard" id="keyboard"></div>
<div class="sequence" id="sequence"></div>
<div class="hint">${esc(t('melody.hint'))}</div>
<div class="columns">
    <div>
        <div class="bar">
            <label>${esc(t('lcdchar.name'))} <input type="text" id="name" spellcheck="false"></label>
            <label>Pin <input type="number" id="pin" min="0" max="99" value="8"></label>
        </div>
        <div class="bar">
            <label><input type="radio" name="notes" value="const" checked> ${esc(t('melody.notesConst'))}</label>
            <label><input type="radio" name="notes" value="hz"> ${esc(t('melody.notesHz'))}</label>
        </div>
        <div class="bar"><label><input type="checkbox" id="withFunction" checked> ${esc(t('melody.function'))}</label></div>
        <pre id="code"></pre>
        <div class="bar">
            <button id="insert">${esc(t('lcdchar.insert'))}</button>
            <button class="secondary" id="copy">${esc(t('snippet.copy'))}</button>
        </div>
    </div>
    <div>
        <div class="title">${esc(t('melody.rtttl'))}</div>
        <textarea id="rtttl" spellcheck="false" placeholder="Tetris:d=4,o=5,b=160:e6,8b,8c6,8d6,16e6,16d6,8c6,8b,a"></textarea>
        <div class="bar" style="margin-top: 6px"><button class="secondary" id="importRtttl">${esc(t('melody.rtttlImport'))}</button></div>
        <div class="hint">${esc(t('melody.rtttlHint'))}</div>
    </div>
</div>
<script nonce="${nonce}">const CONFIG = ${configJson};</script>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
    }
}

module.exports = {
    MelodyEditor,
    parseRtttl,
    parseMelodyCode,
    hzToMidi
};

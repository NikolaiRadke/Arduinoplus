/*
 * Arduino+ - Editor Settings
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * The Arduino IDE hides its editor settings behind the command palette.
 * This panel sets the most asked-for ones and switches color themes.
 * Contributed themes are read when the IDE starts, so changed custom
 * colors need a restart; switching between themes works right away.
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { THEMES, PALETTES, TOKEN_GROUPS, buildTheme } = require('./themes');
const { highlightLines } = require('./printManager');

const STATE_FILE = path.join(os.homedir(), '.arduinoplus', 'editor.json');
const THEME_DIR = path.join(__dirname, '..', '..', 'themes');
const WEBVIEW_SCRIPT = path.join(__dirname, 'editorSettings.webview.js');
const ARDUINOPLUS_THEMES = Object.values(THEMES).map(theme => theme.id);

const SAMPLE = [
    '#include <Servo.h>',
    '// Blink the LED',
    'const int LED = 13;',
    '',
    'void setup() {',
    '  pinMode(LED, OUTPUT);',
    '}',
    '',
    'void loop() {',
    '  if (millis() > 1000) Serial.println("Hello");',
    '}'
];

// Settings of the panel: key, how the checkbox maps to the value
const SETTINGS = {
    autoClose: { keys: ['editor.autoClosingBrackets', 'editor.autoClosingQuotes'], on: undefined, off: 'never' },
    hover: { keys: ['editor.hover.enabled'], on: true, off: false },
    hoverDelay: { keys: ['editor.hover.delay'], number: true, min: 0, max: 5000 },
    notifications: { keys: ['workbench.silentNotifications'], on: false, off: true, arduinoOnly: true },
    fontSize: { keys: ['editor.fontSize'], number: true, min: 6, max: 40 },
    wordWrap: { keys: ['editor.wordWrap'], on: 'on', off: 'off' }
};

const isHex = value => /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Read a setting, e.g. "editor.hover.enabled"
 */
function getSetting(key) {
    const dot = key.indexOf('.');
    return vscode.workspace.getConfiguration(key.slice(0, dot)).get(key.slice(dot + 1));
}

/**
 * Write a user setting, undefined removes it (default value)
 */
async function setSetting(key, value) {
    const dot = key.indexOf('.');
    await vscode.workspace.getConfiguration(key.slice(0, dot)).update(key.slice(dot + 1), value, vscode.ConfigurationTarget.Global);
}

class EditorSettings {
    /**
     * @param {Function} t - Translation function
     * @param {boolean} arduinoIDE - False in VS Code (no workbench.silentNotifications there)
     */
    constructor(t, arduinoIDE = true) {
        this.t = t;
        this.arduinoIDE = arduinoIDE;
        this.panel = null;
        this.syncCustomThemes();
    }

    // --- State in ~/.arduinoplus/editor.json ---

    loadState() {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch (error) {
            return {};
        }
    }

    saveState(state) {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    }

    /**
     * Custom colors of a base, filled up with the accessible palette
     */
    customColors(base, state = this.loadState()) {
        return { ...PALETTES[base], ...((state.custom || {})[base] || {}) };
    }

    /**
     * Write the custom theme files from the saved colors. An update of the
     * extension brings the default files back, so this runs on every start.
     * @returns {boolean} True if a file changed (needs a restart to show)
     */
    syncCustomThemes() {
        const state = this.loadState();
        let changed = false;
        for (const theme of [THEMES.customLight, THEMES.customDark]) {
            const content = JSON.stringify(buildTheme(theme.id, theme.base, this.customColors(theme.base, state), false), null, 2) + '\n';
            const file = path.join(THEME_DIR, theme.file);
            try {
                if (fs.readFileSync(file, 'utf8') === content) continue;
                fs.writeFileSync(file, content, 'utf8');
                changed = true;
            } catch (error) {
                // Read-only extension folder: the custom theme keeps its default colors
            }
        }
        return changed;
    }

    // --- Panel data ---

    getValues() {
        const values = {};
        for (const [id, setting] of Object.entries(SETTINGS)) {
            if (setting.arduinoOnly && !this.arduinoIDE) continue;
            const value = getSetting(setting.keys[0]);
            values[id] = setting.number ? value : value !== setting.off;
        }
        const theme = getSetting('workbench.colorTheme');
        const key = Object.keys(THEMES).find(name => THEMES[name].id === theme);
        values.theme = key || 'standard';
        return values;
    }

    /**
     * Apply one setting from the panel
     */
    async applySetting(id, value) {
        const setting = SETTINGS[id];
        if (!setting || (setting.arduinoOnly && !this.arduinoIDE)) return;
        let newValue;
        if (setting.number) {
            newValue = Math.max(setting.min, Math.min(setting.max, Math.round(Number(value) || 0)));
        } else {
            newValue = value ? setting.on : setting.off;
        }
        for (const key of setting.keys) await setSetting(key, newValue);
    }

    /**
     * Switch the color theme, remember the one the user had before
     * @param {string} choice - "standard" or a key of THEMES
     */
    async applyTheme(choice) {
        const state = this.loadState();
        const current = getSetting('workbench.colorTheme');
        if (!ARDUINOPLUS_THEMES.includes(current)) {
            state.previousTheme = current || null;
            this.saveState(state);
        }
        const target = choice === 'standard' ? (state.previousTheme || undefined) : THEMES[choice].id;
        await setSetting('workbench.colorTheme', target);
    }

    /**
     * Save custom colors and switch to the custom theme
     * @returns {boolean} True if the IDE has to restart to show the colors
     */
    async saveCustom(base, colors) {
        const state = this.loadState();
        const clean = {};
        for (const group of TOKEN_GROUPS) {
            if (isHex(colors[group])) clean[group] = colors[group].toLowerCase();
        }
        state.custom = { ...(state.custom || {}), [base]: clean };
        this.saveState(state);
        const changed = this.syncCustomThemes();
        await this.applyTheme(base === 'light' ? 'customLight' : 'customDark');
        return changed;
    }

    // --- Webview ---

    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            this.post();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusEditorSettings',
            this.t('editor.title'),
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel.onDidDispose(() => {
            this.panel = null;
        });
        this.panel.webview.onDidReceiveMessage(async message => {
            try {
                if (message.command === 'setting') {
                    await this.applySetting(message.id, message.value);
                } else if (message.command === 'theme') {
                    await this.applyTheme(message.theme);
                } else if (message.command === 'saveCustom') {
                    const restart = await this.saveCustom(message.base, message.colors);
                    if (restart) vscode.window.showInformationMessage(this.t('editor.restart'));
                }
            } catch (error) {
                vscode.window.showErrorMessage(this.t('editor.failed', error.message));
            }
            this.post();
        });
        this.panel.webview.html = this.getWebviewContent();
    }

    post() {
        if (!this.panel) return;
        const state = this.loadState();
        this.panel.webview.postMessage({
            command: 'state',
            values: this.getValues(),
            custom: { light: this.customColors('light', state), dark: this.customColors('dark', state) }
        });
    }

    getWebviewContent() {
        const t = this.t;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const config = {
            palettes: PALETTES,
            groups: TOKEN_GROUPS,
            preview: highlightLines(SAMPLE),
            ...this.panelState()
        };
        const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
        const script = fs.readFileSync(WEBVIEW_SCRIPT, 'utf8');
        const toggle = (id, label) => `<label class="row"><input type="checkbox" id="${id}"> ${esc(label)}</label>`;
        const theme = (value, label, hint) => `<label class="row"><input type="radio" name="theme" value="${value}"> ${esc(label)}${hint ? ` <span class="muted">${esc(hint)}</span>` : ''}</label>`;
        const colorRow = group => `<label class="color"><input type="color" data-group="${group}"> ${esc(t('editor.group.' + group))}</label>`;

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; }
    .columns { display: flex; gap: 32px; flex-wrap: wrap; align-items: flex-start; }
    .columns > section { flex: 1; min-width: 300px; }
    h3 { margin: 0 0 10px 0; font-size: 14px; }
    .row { display: block; margin: 0 0 8px 0; cursor: pointer; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .inline { display: flex; align-items: center; gap: 8px; margin: 0 0 8px 22px; }
    input[type=number] { width: 64px; padding: 2px 4px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
    .colors { display: grid; grid-template-columns: repeat(2, max-content); gap: 6px 20px; margin: 8px 0 10px 22px; }
    .color { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    input[type=color] { width: 36px; height: 22px; padding: 0; border: none; background: none; cursor: pointer; }
    button { padding: 5px 12px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .tools { display: flex; gap: 6px; margin: 0 0 10px 22px; }
    #custom { display: none; }
    pre { margin: 14px 0 6px 0; padding: 12px 14px; border-radius: 4px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); line-height: 1.4; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
    pre .k { color: var(--keyword); } pre .t { color: var(--type); } pre .f { color: var(--function); }
    pre .s { color: var(--string); } pre .n, pre .o { color: var(--number); } pre .p { color: var(--preprocessor); }
    pre .c { color: var(--comment); }
    pre.styled .k, pre.styled .t { font-weight: bold; } pre.styled .c { font-style: italic; }
</style>
</head>
<body>
<div class="columns">
    <section>
        <h3>${esc(t('editor.editor'))}</h3>
        ${toggle('autoClose', t('editor.autoClose'))}
        ${toggle('hover', t('editor.hover'))}
        <div class="inline"><span class="muted">${esc(t('editor.hoverDelay'))}</span><input type="number" id="hoverDelay" min="0" max="5000" step="100"> ms</div>
        ${this.arduinoIDE ? toggle('notifications', t('editor.notifications')) : ''}
        ${toggle('wordWrap', t('editor.wordWrap'))}
        <div class="inline" style="margin-left: 0"><span>${esc(t('editor.fontSize'))}</span><input type="number" id="fontSize" min="6" max="40"> px</div>
        <p class="muted">${esc(t('editor.instant'))}</p>
    </section>
    <section>
        <h3>${esc(t('editor.theme'))}</h3>
        ${theme('standard', t('editor.themeStandard'), t('editor.themeStandardHint'))}
        ${theme('accessibleLight', THEMES.accessibleLight.id)}
        ${theme('accessibleDark', THEMES.accessibleDark.id)}
        ${theme('customLight', THEMES.customLight.id)}
        ${theme('customDark', THEMES.customDark.id)}
        <div id="custom">
            <div class="colors">${TOKEN_GROUPS.map(colorRow).join('')}</div>
            <div class="tools">
                <button id="saveCustom">${esc(t('editor.saveCustom'))}</button>
                <button class="secondary" id="resetCustom">${esc(t('editor.resetCustom'))}</button>
            </div>
            <p class="muted" style="margin-left: 22px">${esc(t('editor.customHint'))}</p>
        </div>
        <pre id="preview"></pre>
        <p class="muted">${esc(t('editor.accessibleHint'))}</p>
    </section>
</div>
<script nonce="${nonce}">const CONFIG = ${configJson};</script>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
    }

    panelState() {
        const state = this.loadState();
        return {
            values: this.getValues(),
            custom: { light: this.customColors('light', state), dark: this.customColors('dark', state) }
        };
    }
}

module.exports = { EditorSettings, SETTINGS };

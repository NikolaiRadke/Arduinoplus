/*
 * Arduino+ - About Panel
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MarkdownRenderer = require('../utils/markdown');

const EXTENSION_DIR = path.join(__dirname, '..', '..');
const REPOSITORY_URL = 'https://github.com/NikolaiRadke/Arduinoplus';
const IS_WINDOWS = process.platform === 'win32';

/**
 * About Panel - shows version, changelog and the uninstall option
 */
class AboutPanel {
    /**
     * @param {Function} t - Translation function
     * @param {boolean} arduinoIDE - False in VS Code: uninstalling is done there by VS Code itself
     */
    constructor(t, arduinoIDE = true) {
        this.t = t;
        this.arduinoIDE = arduinoIDE;
        this.panel = null;
    }

    /**
     * Show or reveal the panel
     */
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'arduinoplusAbout',
            this.t('about.title'),
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(EXTENSION_DIR)]
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
        });

        this.panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'uninstall') {
                await this.handleUninstall();
            } else if (message.command === 'openLink' && /^https?:/i.test(message.url || '')) {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
        });

        this.panel.webview.html = this.getWebviewContent();
    }

    /**
     * Read a JSON file from the extension folder
     * @param {string} name - File name
     * @returns {Object|null}
     */
    readJson(name) {
        try {
            return JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, name), 'utf8'));
        } catch (error) {
            return null;
        }
    }

    /**
     * Resolve placeholders of uninstall.json
     * @param {string} entry - e.g. "{arduinoIDE}/extensions/arduinoplus-*.vsix"
     * @returns {string}
     */
    resolvePath(entry) {
        const home = os.homedir();
        return path.normalize(entry
            .replace(/^~(?=$|[\\/])/, home)
            .replace(/\{home\}/g, home)
            .replace(/\{arduinoIDE\}/g, path.join(home, '.arduinoIDE'))
            .replace(/\{tmp\}/g, os.tmpdir()));
    }

    /**
     * Only delete strictly below the home or temp folder
     * @param {string} target - Resolved path
     * @returns {boolean}
     */
    isSafeTarget(target) {
        const normalize = p => path.normalize(IS_WINDOWS ? p.toLowerCase() : p);
        const ideDir = path.join(os.homedir(), '.arduinoIDE');
        const protectedDirs = [
            os.homedir(), os.tmpdir(), ideDir,
            path.join(ideDir, 'extensions'), path.join(ideDir, 'deployedPlugins'), path.join(ideDir, 'plugin-storage')
        ].map(normalize);
        if (protectedDirs.includes(normalize(target))) return false;

        return [os.homedir(), os.tmpdir()].some(parent => {
            const relative = path.relative(normalize(parent), normalize(target));
            return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
        });
    }

    /**
     * All existing paths that uninstall.json would delete.
     * A * is allowed in the last part of a path only.
     * @param {Object} config - uninstall.json
     * @returns {string[]}
     */
    collectTargets(config) {
        const entries = [...(config.directories || []), ...(config.files || [])];
        const targets = new Set();

        for (const entry of entries) {
            if (typeof entry !== 'string' || entry.split(/[\\/]/).includes('..')) continue;
            const resolved = this.resolvePath(entry);
            const dir = path.dirname(resolved);
            const name = path.basename(resolved);
            if (dir.includes('*')) continue;

            let found = [];
            if (name.includes('*')) {
                const escaped = name.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
                const pattern = new RegExp(`^${escaped.join('.*')}$`, IS_WINDOWS ? 'i' : '');
                found = fs.existsSync(dir)
                    ? fs.readdirSync(dir).filter(file => pattern.test(file)).map(file => path.join(dir, file))
                    : [];
            } else if (fs.existsSync(resolved)) {
                found = [resolved];
            }
            found.filter(target => this.isSafeTarget(target)).forEach(target => targets.add(target));
        }
        return [...targets];
    }

    /**
     * Ask (once or twice, see uninstall.json) and uninstall
     */
    async handleUninstall() {
        if (!this.arduinoIDE) return;
        const config = this.readJson('uninstall.json');
        if (!config) {
            vscode.window.showErrorMessage(this.t('about.noUninstaller'));
            return;
        }

        const button = this.t('about.uninstallButton');
        const first = await vscode.window.showWarningMessage(
            this.t('about.uninstallConfirm'), { modal: true }, button
        );
        if (first !== button) return;

        const targets = this.collectTargets(config);

        if (config.confirm && config.confirm.double) {
            const second = await vscode.window.showWarningMessage(
                this.t('about.uninstallConfirmDouble', targets.join('\n')), { modal: true }, button
            );
            if (second !== button) return;
        }

        const failed = [];
        for (const target of targets) {
            try {
                fs.rmSync(target, { recursive: true, force: true });
            } catch (error) {
                failed.push(target);
            }
        }

        if (this.panel) {
            this.panel.dispose();
        }

        if (failed.length > 0) {
            vscode.window.showErrorMessage(this.t('about.uninstallFailed', failed.join(', ')));
        } else {
            vscode.window.showInformationMessage(this.t('about.uninstallSuccess'), { modal: true });
        }
    }

    /**
     * Generate the webview HTML
     * @returns {string}
     */
    getWebviewContent() {
        const t = this.t;
        const webview = this.panel.webview;
        const esc = text => String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

        const packageJson = this.readJson('package.json') || {};
        const version = packageJson.version || '';

        let changelog = '';
        try {
            // vsce packs it as changelog.md, the hand-made VSIX as CHANGELOG.md
            const file = fs.readdirSync(EXTENSION_DIR).find(name => name.toLowerCase() === 'changelog.md');
            changelog = new MarkdownRenderer().render(fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf8'));
        } catch (error) {
            changelog = `<p class="muted">${esc(t('about.noChangelog'))}</p>`;
        }

        const iconFile = packageJson.icon ? path.join(EXTENSION_DIR, packageJson.icon) : null;
        const iconHtml = iconFile && fs.existsSync(iconFile)
            ? `<img class="icon" src="${webview.asWebviewUri(vscode.Uri.file(iconFile))}" alt="">`
            : '';

        const link = (url, label) => `<a href="${esc(url)}">${esc(label)}</a>`;

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
    body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 20px 30px; max-width: 760px; }
    .header { display: flex; gap: 20px; align-items: center; padding-bottom: 16px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
    .icon { width: 96px; height: 96px; object-fit: contain; }
    h1 { margin: 0; font-size: 26px; font-weight: 600; }
    .badge { font-size: 12px; padding: 1px 6px; border-radius: 3px; margin-left: 8px; vertical-align: middle; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .muted { color: var(--vscode-descriptionForeground); }
    .facts { margin: 16px 0; }
    .fact { display: flex; gap: 8px; margin-bottom: 4px; }
    .fact .label { width: 110px; flex-shrink: 0; color: var(--vscode-descriptionForeground); }
    a { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
    a:hover { text-decoration: underline; }
    h2 { font-size: 16px; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
    .changelog { line-height: 1.5; }
    .changelog h1 { font-size: 18px; }
    .changelog h2 { font-size: 15px; border: none; }
    .changelog h3 { font-size: 13px; }
    .changelog code { font-family: var(--vscode-editor-font-family); padding: 1px 4px; border-radius: 3px; background: var(--vscode-textCodeBlock-background); }
    .danger-zone { margin-top: 40px; padding: 16px 20px; border: 1px solid var(--vscode-errorForeground, #f44336); border-radius: 4px; }
    .danger-zone h2 { margin-top: 0; border: none; color: var(--vscode-errorForeground, #f44336); }
    button { padding: 6px 14px; border: none; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: 13px; color: #fff; background: #c62828; }
    button:hover { background: #b71c1c; }
</style>
</head>
<body>
<div class="header">
    ${iconHtml}
    <div>
        <h1>Arduino+<span class="badge">v${esc(version)}</span></h1>
        <div class="muted">${esc(t('about.description'))}</div>
    </div>
</div>

<div class="facts">
    <div class="fact"><span class="label">${esc(t('about.author'))}</span><span>Monster Maker</span></div>
    <div class="fact"><span class="label">${esc(t('about.license'))}</span><span>Apache License 2.0</span></div>
    <div class="fact"><span class="label">GitHub</span>${link(REPOSITORY_URL, 'github.com/NikolaiRadke/Arduinoplus')}</div>
    <div class="fact"><span class="label">${esc(t('about.related'))}</span><span>${link('https://github.com/NikolaiRadke/AI.duino', 'AI.duino')} · ${link('https://github.com/NikolaiRadke/Extension-Manager', 'Extension Manager')}</span></div>
</div>

<h2>${esc(t('about.changelog'))}</h2>
<div class="changelog">${changelog}</div>

${this.arduinoIDE ? `<div class="danger-zone">
    <h2>⚠️ ${esc(t('about.uninstall'))}</h2>
    <p>${esc(t('about.uninstallInfo'))}</p>
    <button id="uninstall">${esc(t('about.uninstallButton'))}</button>
</div>` : `<h2>${esc(t('about.uninstall'))}</h2>
<p class="muted">${esc(t('about.uninstallVSCode'))}</p>`}

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const uninstall = document.getElementById('uninstall');
    if (uninstall) {
        uninstall.addEventListener('click', () => vscode.postMessage({ command: 'uninstall' }));
    }
    document.addEventListener('click', event => {
        const anchor = event.target.closest('a');
        if (!anchor) return;
        event.preventDefault();
        const href = anchor.getAttribute('href') || '';
        if (/^https?:/i.test(href)) vscode.postMessage({ command: 'openLink', url: href });
    });
</script>
</body>
</html>`;
    }
}

module.exports = AboutPanel;

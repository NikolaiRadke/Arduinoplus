/*
 * Arduino+ - Editor Settings (webview script)
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * CONFIG is set by editorSettings.js before this script runs.
 */

(function () {
    const vscode = acquireVsCodeApi();
    const $ = id => document.getElementById(id);
    let custom = CONFIG.custom;
    let shownTheme = null; // Pickers are only refilled when the theme changes, so unsaved colors stay

    const BACKGROUND = { light: '#ffffff', dark: '#1e1f20' };

    function selectedTheme() {
        const radio = document.querySelector('input[name=theme]:checked');
        return radio ? radio.value : 'standard';
    }

    const baseOf = theme => (/Dark$/.test(theme) ? 'dark' : 'light');
    const isCustom = theme => theme.startsWith('custom');

    /** Colors of the color pickers */
    function pickerColors() {
        const colors = {};
        document.querySelectorAll('input[data-group]').forEach(input => { colors[input.dataset.group] = input.value; });
        return colors;
    }

    /** Sample code in the colors of the chosen theme */
    function renderPreview() {
        const theme = selectedTheme();
        const preview = $('preview');
        if (theme === 'standard') {
            preview.style.display = 'none';
            return;
        }
        preview.style.display = '';
        const base = baseOf(theme);
        const colors = isCustom(theme) ? { ...CONFIG.palettes[base], ...pickerColors() } : CONFIG.palettes[base];
        preview.style.background = BACKGROUND[base];
        preview.style.color = colors.text;
        CONFIG.groups.forEach(group => preview.style.setProperty('--' + group, colors[group]));
        preview.classList.toggle('styled', !isCustom(theme));
    }

    function fillPickers() {
        const theme = selectedTheme();
        $('custom').style.display = isCustom(theme) ? 'block' : 'none';
        if (!isCustom(theme)) return;
        const colors = custom[baseOf(theme)];
        document.querySelectorAll('input[data-group]').forEach(input => { input.value = colors[input.dataset.group]; });
    }

    function render(values) {
        ['autoClose', 'hover', 'notifications', 'wordWrap'].forEach(id => {
            if ($(id) && values[id] !== undefined) $(id).checked = values[id];
        });
        if (values.hoverDelay !== undefined) $('hoverDelay').value = values.hoverDelay;
        if (values.fontSize !== undefined) $('fontSize').value = values.fontSize;
        $('hoverDelay').disabled = !values.hover;
        const radio = document.querySelector('input[name=theme][value="' + values.theme + '"]');
        if (radio) radio.checked = true;
        if (values.theme !== shownTheme) {
            shownTheme = values.theme;
            fillPickers();
        }
        renderPreview();
    }

    // --- Events: every change is applied at once ---

    ['autoClose', 'hover', 'notifications', 'wordWrap'].forEach(id => {
        if (!$(id)) return;
        $(id).addEventListener('change', () => vscode.postMessage({ command: 'setting', id, value: $(id).checked }));
    });
    ['hoverDelay', 'fontSize'].forEach(id => {
        $(id).addEventListener('change', () => vscode.postMessage({ command: 'setting', id, value: +$(id).value }));
    });
    document.querySelectorAll('input[name=theme]').forEach(radio => radio.addEventListener('change', () => {
        shownTheme = radio.value;
        fillPickers();
        renderPreview();
        vscode.postMessage({ command: 'theme', theme: radio.value });
    }));
    document.querySelectorAll('input[data-group]').forEach(input => input.addEventListener('input', renderPreview));
    $('saveCustom').addEventListener('click', () => {
        const base = baseOf(selectedTheme());
        custom[base] = { ...custom[base], ...pickerColors() };
        vscode.postMessage({ command: 'saveCustom', base, colors: pickerColors() });
    });
    $('resetCustom').addEventListener('click', () => {
        const base = baseOf(selectedTheme());
        document.querySelectorAll('input[data-group]').forEach(input => { input.value = CONFIG.palettes[base][input.dataset.group]; });
        renderPreview();
    });

    window.addEventListener('message', event => {
        if (event.data.command !== 'state') return;
        custom = event.data.custom;
        render(event.data.values);
    });

    $('preview').innerHTML = CONFIG.preview.join('\n');
    render(CONFIG.values);
})();

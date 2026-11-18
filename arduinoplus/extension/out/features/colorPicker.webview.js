/*
 * Arduino+ - Color Picker (webview script)
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * CONFIG is set by colorPicker.js before this script runs.
 */

(function () {
    const vscode = acquireVsCodeApi();
    let rgb = [255, 128, 0];
    let hsv = [30, 100, 100];
    let white = null;
    let prefixes = { neopixel: 'strip.', color565: 'tft.' };

    const $ = id => document.getElementById(id);
    const hex2 = v => v.toString(16).toUpperCase().padStart(2, '0');

    // --- Conversion ---

    function toRgb565(r, g, b) {
        return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
    }

    function from565(value) {
        return [
            Math.round(((value >> 11) & 0x1F) * 255 / 31),
            Math.round(((value >> 5) & 0x3F) * 255 / 63),
            Math.round((value & 0x1F) * 255 / 31)
        ];
    }

    function rgbToHsv(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        if (d) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h = Math.round(h * 60);
            if (h < 0) h += 360;
        }
        return [h, max ? Math.round(d / max * 100) : 0, Math.round(max / 255 * 100)];
    }

    function hsvToRgb(h, s, v) {
        s /= 100;
        v /= 100;
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        return [r, g, b].map(value => Math.round((value + m) * 255));
    }

    // --- Output ---

    function outputs() {
        const [r, g, b] = rgb;
        const w = white !== null ? ', ' + white : '';
        return {
            hex888: '0x' + hex2(r) + hex2(g) + hex2(b),
            hex565: '0x' + toRgb565(r, g, b).toString(16).toUpperCase().padStart(4, '0'),
            neopixel: prefixes.neopixel + 'Color(' + r + ', ' + g + ', ' + b + w + ')',
            crgb: 'CRGB(' + r + ', ' + g + ', ' + b + ')',
            color565: prefixes.color565 + 'color565(' + r + ', ' + g + ', ' + b + ')'
        };
    }

    function selectedFormat() {
        return document.querySelector('input[name=format]:checked').value;
    }

    // --- Rendering ---

    function render(source) {
        const css = 'rgb(' + rgb.join(',') + ')';
        $('swatch').style.background = css;
        const [r5, g5, b5] = from565(toRgb565(...rgb));
        $('swatch565').style.background = 'rgb(' + r5 + ',' + g5 + ',' + b5 + ')';

        ['r', 'g', 'b'].forEach((id, i) => { $(id).value = rgb[i]; $(id + 'Num').value = rgb[i]; });
        // HSV sliders keep their own values while dragging them (gray has no hue)
        if (source !== 'hsv') hsv = rgbToHsv(...rgb);
        ['h', 's', 'v'].forEach((id, i) => { $(id).value = hsv[i]; $(id + 'Num').value = hsv[i]; });
        if (source !== 'native') $('native').value = '#' + rgb.map(hex2).join('').toLowerCase();

        const out = outputs();
        Object.keys(out).forEach(key => { $('out-' + key).textContent = out[key]; });
    }

    // --- Events ---

    ['r', 'g', 'b'].forEach((id, i) => {
        const update = value => {
            rgb[i] = Math.max(0, Math.min(255, value | 0));
            render('rgb');
        };
        $(id).addEventListener('input', () => update(+$(id).value));
        $(id + 'Num').addEventListener('change', () => update(+$(id + 'Num').value));
    });
    ['h', 's', 'v'].forEach((id, i) => {
        const max = i === 0 ? 360 : 100;
        const update = value => {
            hsv[i] = Math.max(0, Math.min(max, value | 0));
            rgb = hsvToRgb(hsv[0] % 360, hsv[1], hsv[2]);
            render('hsv');
        };
        $(id).addEventListener('input', () => update(+$(id).value));
        $(id + 'Num').addEventListener('change', () => update(+$(id + 'Num').value));
    });
    $('native').addEventListener('input', () => {
        const value = $('native').value;
        rgb = [1, 3, 5].map(i => parseInt(value.substr(i, 2), 16));
        render('native');
    });
    document.querySelectorAll('input[name=format]').forEach(radio => radio.addEventListener('change', () => render()));
    $('apply').addEventListener('click', () => vscode.postMessage({ command: 'apply', code: outputs()[selectedFormat()] }));
    $('copy').addEventListener('click', () => vscode.postMessage({ command: 'copy', code: outputs()[selectedFormat()] }));

    // --- Loading ---

    function load(data, replace) {
        rgb = data.rgb.slice();
        white = data.white;
        prefixes = { neopixel: 'strip.', color565: 'tft.' };
        if (data.format === 'neopixel' || data.format === 'color565') prefixes[data.format] = data.prefix;
        document.querySelector('input[name=format][value=' + data.format + ']').checked = true;
        $('apply').textContent = replace ? CONFIG.labels.apply : CONFIG.labels.insert;
        render();
    }

    window.addEventListener('message', event => {
        if (event.data.command === 'load') load(event.data.data, event.data.replace);
    });

    load(CONFIG.initial, CONFIG.replace);
})();

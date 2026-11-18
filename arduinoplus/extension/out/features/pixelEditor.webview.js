/*
 * Arduino+ - Pixel Editor (webview script)
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * CONFIG is set by pixelEditor.js before this script runs.
 */

(function () {
    const vscode = acquireVsCodeApi();
    const MAX_SIZE = 128;
    const FIXED = { lcd: [5, 8], matrix: [8, 8] };
    const COLORS = {
        lcd: { bg: '#1b3d1b', off: '#2f5f2f', on: '#c8f7c8' },
        matrix: { bg: '#111111', off: '#3a1010', on: '#ff3b30' },
        gfx: { bg: '#000000', off: '#101820', on: '#7fd4ff' },
        xbm: { bg: '#000000', off: '#101820', on: '#7fd4ff' }
    };

    let mode = 'lcd';
    let width = 5;
    let height = 8;
    let pixels = new Uint8Array(width * height);
    let cell = 32;
    let paintValue = null;
    let codeScheduled = false;
    let source = null; // Imported image: { img, width, height }

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const nameInput = document.getElementById('name');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const codeBox = document.getElementById('code');

    // --- Drawing ---

    function cellSize() {
        const available = Math.min(512, Math.max(160, window.innerWidth - 380));
        return Math.max(3, Math.min(32, Math.floor(available / Math.max(width, height))));
    }

    function drawCell(x, y) {
        const colors = COLORS[mode];
        const gap = cell >= 8 ? 2 : (cell >= 5 ? 1 : 0);
        const px = 6 + x * cell;
        const py = 6 + y * cell;
        ctx.fillStyle = colors.bg;
        ctx.fillRect(px, py, cell, cell);
        ctx.fillStyle = pixels[y * width + x] ? colors.on : colors.off;
        if (mode === 'matrix') {
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, cell / 2 - gap, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(px + gap / 2, py + gap / 2, cell - gap, cell - gap);
        }
    }

    function drawAll() {
        cell = cellSize();
        canvas.width = width * cell + 12;
        canvas.height = height * cell + 12;
        ctx.fillStyle = COLORS[mode].bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) drawCell(x, y);
        }
    }

    function cellAt(event) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left - 6) / cell);
        const y = Math.floor((event.clientY - rect.top - 6) / cell);
        return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
    }

    function paint(event) {
        const pos = cellAt(event);
        if (!pos) return;
        const index = pos.y * width + pos.x;
        if (pixels[index] === paintValue) return;
        pixels[index] = paintValue;
        drawCell(pos.x, pos.y);
        scheduleCode();
    }

    canvas.addEventListener('mousedown', event => {
        const pos = cellAt(event);
        if (!pos) return;
        paintValue = pixels[pos.y * width + pos.x] ? 0 : 1;
        paint(event);
        event.preventDefault();
    });
    canvas.addEventListener('mousemove', event => {
        if (paintValue !== null) paint(event);
    });
    window.addEventListener('mouseup', () => { paintValue = null; });
    window.addEventListener('resize', drawAll);

    // --- Code generation ---

    function formatByte(value, bits) {
        const f = document.querySelector('input[name=format]:checked').value;
        if (f === 'hex') return '0x' + value.toString(16).toUpperCase().padStart(2, '0');
        const bin = value.toString(2).padStart(bits, '0');
        return f === 'bin' ? '0b' + bin : 'B' + bin;
    }

    function safeName() {
        return (nameInput.value.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'image').replace(/^(\d)/, '_$1');
    }

    /** Bytes of one row: MSB = left pixel (GFX, matrix), LSB = left pixel (XBM) */
    function rowBytes(y, lsbFirst) {
        const bytes = [];
        for (let b = 0; b < Math.ceil(width / 8); b++) {
            let value = 0;
            for (let i = 0; i < 8; i++) {
                const x = b * 8 + i;
                if (x < width && pixels[y * width + x]) value |= lsbFirst ? (1 << i) : (0x80 >> i);
            }
            bytes.push(value);
        }
        return bytes;
    }

    function bytesBlock(lsbFirst) {
        const perRow = Math.ceil(width / 8);
        const perLine = perRow <= 16 ? perRow * Math.max(1, Math.floor(16 / perRow)) : 16;
        const all = [];
        for (let y = 0; y < height; y++) all.push(...rowBytes(y, lsbFirst));
        const lines = [];
        for (let i = 0; i < all.length; i += perLine) {
            lines.push('  ' + all.slice(i, i + perLine).map(v => formatByte(v, 8)).join(', '));
        }
        return lines.join(',\n');
    }

    function code() {
        const name = safeName();
        if (mode === 'lcd') {
            // HD44780: the lower 5 bits of each byte, bit 4 = left pixel
            const lines = [];
            for (let y = 0; y < 8; y++) {
                let value = 0;
                for (let x = 0; x < 5; x++) if (pixels[y * 5 + x]) value |= 0x10 >> x;
                lines.push('  ' + formatByte(value, 5));
            }
            return 'byte ' + name + '[8] = {\n' + lines.join(',\n') + '\n};\n';
        }
        if (mode === 'matrix') {
            const lines = [];
            for (let y = 0; y < 8; y++) lines.push('  ' + formatByte(rowBytes(y, false)[0], 8));
            return 'byte ' + name + '[8] = {\n' + lines.join(',\n') + '\n};\n';
        }
        if (mode === 'xbm') {
            return '#define ' + name + '_width ' + width + '\n#define ' + name + '_height ' + height + '\n' +
                'static const unsigned char ' + name + '_bits[] U8X8_PROGMEM = {\n' + bytesBlock(true) + '\n};\n';
        }
        return '// ' + width + 'x' + height + '\nconst uint8_t ' + name + '[] PROGMEM = {\n' + bytesBlock(false) + '\n};\n';
    }

    function updateCode() {
        codeScheduled = false;
        codeBox.textContent = code();
        const name = safeName();
        document.getElementById('usage').textContent = CONFIG.usage[mode]
            .split('{0}').join(mode === 'xbm' ? name + '_width, ' + name + '_height, ' + name + '_bits' : name)
            .split('{1}').join(width)
            .split('{2}').join(height);
    }

    function scheduleCode() {
        if (codeScheduled) return;
        codeScheduled = true;
        requestAnimationFrame(updateCode);
    }

    // --- Size and mode ---

    function resize(newWidth, newHeight) {
        newWidth = Math.max(1, Math.min(MAX_SIZE, newWidth | 0));
        newHeight = Math.max(1, Math.min(MAX_SIZE, newHeight | 0));
        const next = new Uint8Array(newWidth * newHeight);
        // Keep the drawing, aligned top left
        for (let y = 0; y < Math.min(height, newHeight); y++) {
            for (let x = 0; x < Math.min(width, newWidth); x++) next[y * newWidth + x] = pixels[y * width + x];
        }
        width = newWidth;
        height = newHeight;
        pixels = next;
        widthInput.value = width;
        heightInput.value = height;
        if (source) {
            applyImage();
            return;
        }
        drawAll();
        updateCode();
    }

    function setMode(newMode) {
        mode = newMode;
        document.querySelector('input[name=mode][value=' + mode + ']').checked = true;
        const bitmap = mode === 'gfx' || mode === 'xbm';
        document.getElementById('sizeRow').style.display = bitmap ? '' : 'none';
        if (bitmap) {
            resize(width, height);
        } else {
            resize(FIXED[mode][0], FIXED[mode][1]);
        }
    }

    document.querySelectorAll('input[name=mode]').forEach(radio => radio.addEventListener('change', () => setMode(radio.value)));
    widthInput.addEventListener('change', () => resize(+widthInput.value, height));
    heightInput.addEventListener('change', () => resize(width, +heightInput.value));
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
        const [w, h] = button.dataset.preset.split('x').map(Number);
        resize(w, h);
    }));

    // --- Tools ---

    document.querySelectorAll('[data-shift]').forEach(button => button.addEventListener('click', () => {
        const dir = button.dataset.shift;
        const next = new Uint8Array(width * height);
        const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
        const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                next[((y + dy + height) % height) * width + ((x + dx + width) % width)] = pixels[y * width + x];
            }
        }
        pixels = next;
        drawAll();
        updateCode();
    }));
    document.getElementById('invert').addEventListener('click', () => {
        pixels = pixels.map(v => (v ? 0 : 1));
        drawAll();
        updateCode();
    });
    document.getElementById('clear').addEventListener('click', () => {
        pixels = new Uint8Array(width * height);
        drawAll();
        updateCode();
    });
    document.querySelectorAll('input[name=format]').forEach(radio => radio.addEventListener('change', updateCode));
    nameInput.addEventListener('input', scheduleCode);
    document.getElementById('insert').addEventListener('click', () => vscode.postMessage({ command: 'insert', code: code() }));
    document.getElementById('copy').addEventListener('click', () => vscode.postMessage({ command: 'copy', code: code() }));

    // --- Image import ---

    /**
     * Gray values of the image, fitted into width x height (aspect ratio kept,
     * centered). Transparent parts (and the border) are marked and always stay off.
     */
    function grayFromImage(w, h) {
        const scale = Math.min(w / source.width, h / source.height);
        const dw = Math.max(1, Math.round(source.width * scale));
        const dh = Math.max(1, Math.round(source.height * scale));
        const dx = Math.floor((w - dw) / 2);
        const dy = Math.floor((h - dh) / 2);

        // Halve step by step, a single big downscale loses thin lines
        let src = source.img;
        let sw = source.width;
        let sh = source.height;
        while (sw / 2 >= dw && sh / 2 >= dh) {
            const step = document.createElement('canvas');
            step.width = Math.ceil(sw / 2);
            step.height = Math.ceil(sh / 2);
            step.getContext('2d').drawImage(src, 0, 0, step.width, step.height);
            src = step;
            sw = step.width;
            sh = step.height;
        }

        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const o = out.getContext('2d');
        o.imageSmoothingEnabled = true;
        o.drawImage(src, dx, dy, dw, dh);
        const data = o.getImageData(0, 0, w, h).data;
        const gray = new Float32Array(w * h);
        const transparent = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
            // Opaque enough pixels keep their own color, the rest is background
            gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
            transparent[i] = data[i * 4 + 3] < 128 ? 1 : 0;
        }
        return { gray, transparent, rect: { x: dx, y: dy, w: dw, h: dh } };
    }

    /**
     * Otsu's method: the threshold that separates the two main
     * brightness groups of the image best (only the image area, not the border)
     */
    function otsuThreshold(gray, transparent, w, rect) {
        const histogram = new Array(256).fill(0);
        let total = 0;
        for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
                if (transparent[y * w + x]) continue;
                histogram[Math.max(0, Math.min(255, Math.round(gray[y * w + x])))]++;
                total++;
            }
        }
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        let sumBack = 0;
        let weightBack = 0;
        let best = 0;
        let threshold = 128;
        let contrast = 0;
        for (let i = 0; i < 256; i++) {
            weightBack += histogram[i];
            if (weightBack === 0) continue;
            const weightFore = total - weightBack;
            if (weightFore === 0) break;
            sumBack += i * histogram[i];
            const meanBack = sumBack / weightBack;
            const meanFore = (sum - sumBack) / weightFore;
            const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
            if (between > best) {
                best = between;
                threshold = i + 1;
                contrast = meanFore - meanBack;
            }
        }
        return { threshold: Math.max(1, Math.min(254, threshold)), contrast };
    }

    /**
     * Automatic threshold and invert:
     * - Image with much transparency: the opaque part is the motif, dark lights up
     * - One-colored motif: everything opaque lights up
     * - Opaque image: the smaller brightness group lights up (the motif of a logo)
     */
    function autoAdjust() {
        const { gray, transparent, rect } = grayFromImage(width, height);
        let { threshold, contrast } = otsuThreshold(gray, transparent, width, rect);
        let dark = 0;
        let visible = 0;
        for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
                const i = y * width + x;
                if (transparent[i]) continue;
                visible++;
                if (gray[i] < threshold) dark++;
            }
        }
        const mostlyTransparent = visible < rect.w * rect.h * 0.8;
        let invert = false;
        if (contrast < 48) {
            // One color: light it all up if it sits on transparency, else default
            threshold = mostlyTransparent ? 254 : 128;
        } else if (!mostlyTransparent) {
            invert = dark > visible / 2;
        }
        document.getElementById('threshold').value = threshold;
        document.getElementById('invertImage').checked = invert;
        applyImage();
    }

    /**
     * Dark pixels become "on". Optional Floyd-Steinberg dithering for photos.
     */
    function toPixels(gray, transparent, w, h, threshold, dither, invert) {
        const g = Float32Array.from(gray);
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                const on = g[i] < threshold;
                out[i] = !transparent[i] && on !== invert ? 1 : 0;
                if (!dither) continue;
                const error = g[i] - (on ? 0 : 255);
                if (x + 1 < w) g[i + 1] += error * 7 / 16;
                if (y + 1 < h) {
                    if (x > 0) g[i + w - 1] += error * 3 / 16;
                    g[i + w] += error * 5 / 16;
                    if (x + 1 < w) g[i + w + 1] += error * 1 / 16;
                }
            }
        }
        return out;
    }

    function applyImage() {
        const threshold = +document.getElementById('threshold').value;
        document.getElementById('thresholdValue').textContent = threshold;
        const image = grayFromImage(width, height);
        pixels = toPixels(image.gray, image.transparent, width, height, threshold,
            document.getElementById('dither').checked, document.getElementById('invertImage').checked);
        const bitmap = mode === 'gfx' || mode === 'xbm';
        document.getElementById('originalSize').style.display =
            bitmap && source.width <= MAX_SIZE && source.height <= MAX_SIZE ? '' : 'none';
        drawAll();
        updateCode();
    }

    function closeImage() {
        source = null;
        document.getElementById('importPanel').style.display = 'none';
    }

    document.getElementById('importImage').addEventListener('click', () => vscode.postMessage({ command: 'importImage' }));
    document.getElementById('threshold').addEventListener('input', () => source && applyImage());
    document.getElementById('dither').addEventListener('change', () => source && applyImage());
    document.getElementById('invertImage').addEventListener('change', () => source && applyImage());
    document.getElementById('originalSize').addEventListener('click', () => source && resize(source.width, source.height));
    document.getElementById('closeImage').addEventListener('click', closeImage);
    document.getElementById('autoThreshold').addEventListener('click', () => source && autoAdjust());

    function loadImage(dataUrl, name) {
        const img = new Image();
        img.onload = () => {
            source = { img, width: img.naturalWidth, height: img.naturalHeight };
            nameInput.value = name.replace(/[^A-Za-z0-9_]/g, '_');
            document.getElementById('imageName').textContent = name + ' (' + source.width + '×' + source.height + ')';
            document.getElementById('importPanel').style.display = 'block';
            autoAdjust();
        };
        img.onerror = () => vscode.postMessage({ command: 'imageError', error: name });
        img.src = dataUrl;
    }

    // --- Loading ---

    function load(data) {
        mode = data.mode;
        width = data.width;
        height = data.height;
        pixels = new Uint8Array(width * height);
        data.rows.forEach((row, y) => {
            for (let x = 0; x < width && x < row.length; x++) pixels[y * width + x] = row[x] === '1' ? 1 : 0;
        });
        nameInput.value = data.name;
        document.querySelector('input[name=format][value=' + data.format + ']').checked = true;
        setMode(mode);
    }

    window.addEventListener('message', event => {
        if (event.data.command === 'load') {
            closeImage();
            load(event.data.data);
        }
        if (event.data.command === 'image') loadImage(event.data.dataUrl, event.data.name);
    });

    load(CONFIG.initial);
})();

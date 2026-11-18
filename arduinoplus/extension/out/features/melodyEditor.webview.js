/*
 * Arduino+ - Melody Editor (webview script)
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * CONFIG is set by melodyEditor.js before this script runs.
 */

(function () {
    const vscode = acquireVsCodeApi();
    const NAMES = CONFIG.noteNames;
    const L = CONFIG.labels;

    let notes = [];       // { midi: number|null, d: 1..32, dot: boolean }
    let selected = -1;    // Index of the selected note, new notes go after it
    let octave = 4;       // Lowest octave of the keyboard
    let audio = null;
    let playing = null;   // { oscillator, timers }

    const $ = id => document.getElementById(id);

    // --- Notes ---

    const frequency = midi => 440 * Math.pow(2, (midi - 69) / 12);
    const constName = midi => 'NOTE_' + NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
    const displayName = midi => NAMES[midi % 12].replace('S', '#') + (Math.floor(midi / 12) - 1);

    function durationMs(note, tempo) {
        const ms = 240000 / tempo / note.d;
        return note.dot ? ms * 1.5 : ms;
    }

    function currentDuration() {
        return { d: +document.querySelector('input[name=duration]:checked').value, dot: $('dotted').checked };
    }

    function addNote(midi) {
        const note = { midi, ...currentDuration() };
        notes.splice(selected + 1, 0, note);
        selected++;
        if (midi !== null) beep(midi, Math.min(400, durationMs(note, tempo())));
        renderSequence();
    }

    // --- Sound (square wave, sounds like a piezo) ---

    function context() {
        if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        return audio;
    }

    function beep(midi, ms) {
        try {
            const ctx = context();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = frequency(midi);
            gain.gain.value = 0.06;
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + ms / 1000);
        } catch (error) {
            // No audio in this webview
        }
    }

    function stop() {
        if (!playing) return;
        try { playing.oscillator.stop(); } catch (error) { /* already stopped */ }
        playing.timers.forEach(clearTimeout);
        playing = null;
        document.querySelectorAll('.chip.playing').forEach(chip => chip.classList.remove('playing'));
        $('play').textContent = '▶ ' + L.play;
    }

    function play() {
        if (playing) {
            stop();
            return;
        }
        if (notes.length === 0) return;
        let ctx;
        try {
            ctx = context();
        } catch (error) {
            return;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);

        const start = ctx.currentTime + 0.05;
        let time = 0;
        const timers = [];
        notes.forEach((note, index) => {
            const ms = durationMs(note, tempo());
            const at = start + time / 1000;
            if (note.midi !== null) {
                osc.frequency.setValueAtTime(frequency(note.midi), at);
                gain.gain.setValueAtTime(0.06, at);
                // 90 % sound, 10 % silence like the generated code
                gain.gain.setValueAtTime(0, at + ms * 0.9 / 1000);
            }
            timers.push(setTimeout(() => {
                document.querySelectorAll('.chip.playing').forEach(chip => chip.classList.remove('playing'));
                const chip = $('sequence').children[index];
                if (chip) chip.classList.add('playing');
            }, 50 + time));
            time += ms;
        });
        timers.push(setTimeout(stop, 50 + time));
        osc.start(start);
        osc.stop(start + time / 1000 + 0.05);
        playing = { oscillator: osc, timers };
        $('play').textContent = '■ ' + L.stop;
    }

    // --- Keyboard ---

    function renderKeyboard() {
        const keyboard = $('keyboard');
        keyboard.innerHTML = '';
        const whiteWidth = 34;
        let whiteIndex = 0;
        for (let midi = (octave + 1) * 12; midi < (octave + 3) * 12 + 1; midi++) {
            if (midi < CONFIG.minMidi || midi > CONFIG.maxMidi) {
                if (!NAMES[midi % 12].includes('S')) whiteIndex++;
                continue;
            }
            const isBlack = NAMES[midi % 12].includes('S');
            const key = document.createElement('div');
            key.className = isBlack ? 'black' : 'white';
            key.style.left = (isBlack ? whiteIndex * whiteWidth - 11 : whiteIndex * whiteWidth) + 'px';
            key.title = displayName(midi);
            if (!isBlack) {
                key.textContent = NAMES[midi % 12] === 'C' ? displayName(midi) : '';
                whiteIndex++;
            }
            key.addEventListener('mousedown', event => {
                event.preventDefault();
                key.classList.add('down');
                addNote(midi);
            });
            key.addEventListener('mouseup', () => key.classList.remove('down'));
            key.addEventListener('mouseleave', () => key.classList.remove('down'));
            keyboard.appendChild(key);
        }
        keyboard.style.width = whiteIndex * whiteWidth + 'px';
        $('octaveLabel').textContent = 'C' + octave + ' – C' + (octave + 2);
    }

    // --- Sequence ---

    function renderSequence() {
        const sequence = $('sequence');
        sequence.innerHTML = '';
        if (notes.length === 0) {
            sequence.innerHTML = '<span class="empty"></span>';
            sequence.firstChild.textContent = L.empty;
        }
        notes.forEach((note, index) => {
            const chip = document.createElement('span');
            chip.className = 'chip' + (note.midi === null ? ' rest' : '') + (index === selected ? ' selected' : '');
            chip.textContent = note.midi === null ? '𝄽' : displayName(note.midi);
            const small = document.createElement('small');
            small.textContent = '1/' + note.d + (note.dot ? '.' : '');
            chip.appendChild(small);
            chip.addEventListener('click', () => {
                selected = selected === index ? -1 : index;
                if (selected !== -1) {
                    // Show the duration of the selected note
                    document.querySelector('input[name=duration][value="' + note.d + '"]').checked = true;
                    $('dotted').checked = note.dot;
                    if (note.midi !== null) beep(note.midi, 250);
                }
                renderSequence();
            });
            sequence.appendChild(chip);
        });
        const seconds = notes.reduce((sum, note) => sum + durationMs(note, tempo()), 0) / 1000;
        $('count').textContent = L.count.replace('{0}', notes.length).replace('{1}', seconds.toFixed(1));
        renderCode();
    }

    // Changing the duration changes the selected note
    function applyDuration() {
        if (selected < 0 || !notes[selected]) return;
        Object.assign(notes[selected], currentDuration());
        renderSequence();
    }

    // --- Code ---

    function tempo() {
        return Math.max(20, Math.min(400, +$('tempo').value || 120));
    }

    function safeName() {
        return ($('name').value.trim().replace(/[^A-Za-z0-9_]/g, '_') || 'melody').replace(/^(\d)/, '_$1');
    }

    function wrap(values) {
        const lines = [];
        for (let i = 0; i < values.length; i += 8) lines.push('  ' + values.slice(i, i + 8).join(', '));
        return lines.join(',\n');
    }

    function code() {
        const name = safeName();
        const hz = document.querySelector('input[name=notes]:checked').value === 'hz';
        const pin = Math.max(0, +$('pin').value | 0);
        const hasRest = notes.some(note => note.midi === null);
        const values = notes.map(note => note.midi === null ? (hz ? '0' : 'REST') : (hz ? String(Math.round(frequency(note.midi))) : constName(note.midi)));
        const durations = notes.map(note => String(note.dot ? -note.d : note.d));

        let out = '// ' + name + ': ' + notes.length + ' notes, ' + tempo() + ' BPM\n';
        if (!hz) out += '// ' + L.pitchesHint + '\n';
        if (!hz && hasRest) out += '#ifndef REST\n#define REST 0\n#endif\n';
        out += 'const int ' + name + '[] = {\n' + wrap(values) + '\n};\n';
        out += '// ' + L.durationsHint + '\n';
        out += 'const int ' + name + 'Durations[] = {\n' + wrap(durations) + '\n};\n';
        out += 'const int ' + name + 'Length = ' + notes.length + ';\n';
        out += 'const int ' + name + 'Tempo = ' + tempo() + ';\n';
        if ($('withFunction').checked) {
            out += '\n' +
                'void playMelody(uint8_t pin, const int *notes, const int *durations, int length, int tempo) {\n' +
                '  const long whole = 240000L / tempo;\n' +
                '  for (int i = 0; i < length; i++) {\n' +
                '    long ms = whole / abs(durations[i]);\n' +
                '    if (durations[i] < 0) ms = ms * 3 / 2;\n' +
                '    if (notes[i] != 0) tone(pin, notes[i], ms * 9 / 10);\n' +
                '    delay(ms);\n' +
                '  }\n' +
                '  noTone(pin);\n' +
                '}\n';
        }
        out += '// ' + L.usage.replace('{0}', 'playMelody(' + pin + ', ' + name + ', ' + name + 'Durations, ' + name + 'Length, ' + name + 'Tempo);') + '\n';
        return out;
    }

    function renderCode() {
        $('code').textContent = code();
    }

    // --- Events ---

    $('play').addEventListener('click', play);
    $('octaveDown').addEventListener('click', () => { if (octave > 0) { octave--; renderKeyboard(); } });
    $('octaveUp').addEventListener('click', () => { if (octave < 7) { octave++; renderKeyboard(); } });
    $('rest').addEventListener('click', () => addNote(null));
    $('delete').addEventListener('click', () => {
        if (selected < 0) return;
        notes.splice(selected, 1);
        selected = Math.min(selected, notes.length - 1);
        renderSequence();
    });
    $('clearAll').addEventListener('click', () => { stop(); notes = []; selected = -1; renderSequence(); });
    document.querySelectorAll('input[name=duration]').forEach(radio => radio.addEventListener('change', applyDuration));
    $('dotted').addEventListener('change', applyDuration);
    $('tempo').addEventListener('change', renderSequence);
    ['name', 'pin'].forEach(id => $(id).addEventListener('input', renderCode));
    $('withFunction').addEventListener('change', renderCode);
    document.querySelectorAll('input[name=notes]').forEach(radio => radio.addEventListener('change', renderCode));
    $('insert').addEventListener('click', () => vscode.postMessage({ command: 'insert', code: code() }));
    $('copy').addEventListener('click', () => vscode.postMessage({ command: 'copy', code: code() }));
    CONFIG.examples.forEach((label, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = label;
        $('example').appendChild(option);
    });
    $('example').addEventListener('change', () => {
        if ($('example').value !== '') vscode.postMessage({ command: 'example', index: +$('example').value });
        $('example').value = '';
    });
    $('importRtttl').addEventListener('click', () => vscode.postMessage({ command: 'rtttl', text: $('rtttl').value }));

    // Delete and arrow keys for the selected note (not while typing)
    document.addEventListener('keydown', event => {
        if (/INPUT|TEXTAREA/.test(event.target.tagName)) return;
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected >= 0) {
            $('delete').click();
            event.preventDefault();
        } else if (event.key === 'ArrowLeft' && selected > -1) {
            selected--;
            renderSequence();
        } else if (event.key === 'ArrowRight' && selected < notes.length - 1) {
            selected++;
            renderSequence();
        } else if (event.key === ' ') {
            play();
            event.preventDefault();
        }
    });

    // --- Loading ---

    function load(data) {
        stop();
        notes = data.notes.map(note => ({ midi: note.midi, d: note.d, dot: !!note.dot }));
        selected = notes.length - 1;
        $('name').value = data.name;
        $('tempo').value = data.tempo;
        // Keyboard around the first note
        const first = notes.find(note => note.midi !== null);
        if (first) octave = Math.max(0, Math.min(7, Math.floor(first.midi / 12) - 1));
        renderKeyboard();
        renderSequence();
    }

    window.addEventListener('message', event => {
        if (event.data.command === 'load') load(event.data.data);
    });

    $('play').textContent = '▶ ' + L.play;
    load(CONFIG.initial);
})();

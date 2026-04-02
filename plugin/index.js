const BACKEND_URL = 'https://backend-duckcaption.onrender.com/api';
let currentJobId = null;
let exportedAudioPath = null;
let sourceAudioBaseName = 'subtitles';

/** Segments SRT source éditables : { time, text } */
let srtSegments = [];
/** { lang: Array<{ time, text }> } */
let translatedSegments = {};

let maxWords = 5;
let maxChars = 24;
let maxCharsPerLine = 42;

const LANG_LABELS = {
    en: '🇬🇧 Anglais',
    nl: '🇳🇱 Néerlandais',
    es: '🇪🇸 Espagnol',
    de: '🇩🇪 Allemand',
    fr: '🇫🇷 Français'
};

const BACKEND_STATUS_INTERVAL_MS = 45000;

function basenameWithoutExt(filename) {
    if (!filename || typeof filename !== 'string') return 'subtitles';
    const i = filename.lastIndexOf('.');
    const base = i > 0 ? filename.slice(0, i) : filename;
    return base.trim() || 'subtitles';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseSrt(content) {
    const segments = [];
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) return segments;

    const blocks = normalized.split(/\n\s*\n/);
    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 2) continue;
        let i = 0;
        if (/^\d+$/.test(lines[0].trim())) i = 1;
        if (i >= lines.length) continue;
        const timeLine = lines[i];
        if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(timeLine)) continue;
        const text = lines.slice(i + 1).join('\n');
        segments.push({ time: timeLine, text });
    }
    return segments;
}

function serializeSrt(segments) {
    return segments.map((seg, idx) => `${idx + 1}\n${seg.time}\n${seg.text}\n`).join('\n');
}

function renderSRTEditor(segments) {
    const container = document.getElementById('srtEditorContainer');
    container.innerHTML = segments
        .map(
            (seg, idx) => `
        <div class="srt-segment">
            <div class="segment-header">
                <span class="segment-number">#${idx + 1}</span>
                <input type="text" class="time-input" value="${escapeHtml(seg.time)}" data-idx="${idx}">
            </div>
            <textarea class="text-input" data-idx="${idx}">${escapeHtml(seg.text)}</textarea>
        </div>`
        )
        .join('');

    container.querySelectorAll('.time-input').forEach((input) => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (segments[idx]) segments[idx].time = e.target.value;
        });
    });

    container.querySelectorAll('.text-input').forEach((textarea) => {
        textarea.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            if (segments[idx]) segments[idx].text = e.target.value;
        });
    });
}

function renderTranslatedSRTs() {
    const container = document.getElementById('translatedSRTsContainer');
    container.innerHTML = Object.entries(translatedSegments)
        .map(([lang, segs]) => {
            const title = LANG_LABELS[lang] || lang;
            return `
        <section class="translated-section">
            <h3>Traduction — ${title}</h3>
            <div class="srt-editor srt-editor--translated" data-lang="${escapeHtml(lang)}">
                ${segs
                    .map(
                        (seg, idx) => `
                    <div class="srt-segment">
                        <div class="segment-header">
                            <span class="segment-number">#${idx + 1}</span>
                            <span class="time-display">${escapeHtml(seg.time)}</span>
                        </div>
                        <textarea class="text-input text-input-translated" data-lang="${escapeHtml(lang)}" data-idx="${idx}">${escapeHtml(seg.text)}</textarea>
                    </div>`
                    )
                    .join('')}
            </div>
            <button type="button" class="btn-download-translated" data-lang="${escapeHtml(lang)}">Télécharger (${title})</button>
        </section>`;
        })
        .join('');

    container.querySelectorAll('.text-input-translated').forEach((textarea) => {
        textarea.addEventListener('input', (e) => {
            const lang = e.target.dataset.lang;
            const idx = parseInt(e.target.dataset.idx, 10);
            if (translatedSegments[lang] && translatedSegments[lang][idx]) {
                translatedSegments[lang][idx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-download-translated').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const lang = e.currentTarget.getAttribute('data-lang');
            if (!lang || !translatedSegments[lang]) return;
            const outName = `${sourceAudioBaseName}_${lang}.srt`;
            saveSrtToDisk(serializeSrt(translatedSegments[lang]), outName);
        });
    });
}

/**
 * UXP n’expose pas toujours TextDecoder ; on lit en utf8 natif ou on décode le binaire à la main.
 */
function utf8BytesToString(bytes) {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(bytes);
    }
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let out = '';
    let i = 0;
    const len = u8.length;
    while (i < len) {
        const c = u8[i++];
        if (c < 0x80) {
            out += String.fromCharCode(c);
        } else if (c < 0xe0 && i < len) {
            out += String.fromCharCode(((c & 0x1f) << 6) | (u8[i++] & 0x3f));
        } else if (c < 0xf0 && i + 1 < len) {
            const c2 = ((c & 0x0f) << 12) | ((u8[i++] & 0x3f) << 6) | (u8[i++] & 0x3f);
            out += String.fromCharCode(c2);
        } else if (i + 2 < len) {
            let u =
                ((c & 0x07) << 18) |
                ((u8[i++] & 0x3f) << 12) |
                ((u8[i++] & 0x3f) << 6) |
                (u8[i++] & 0x3f);
            u -= 0x10000;
            out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
        }
    }
    return out;
}

async function readFileAsUtf8(file) {
    const formats = require('uxp').storage.formats;
    if (formats.utf8 != null) {
        try {
            const text = await file.read({ format: formats.utf8 });
            if (typeof text === 'string') return text;
        } catch (e) {
            console.warn('Lecture utf8 UXP échouée, repli binaire :', e);
        }
    }
    const buf = await file.read({ format: formats.binary });
    return utf8BytesToString(buf);
}

async function refreshBackendStatus() {
    const el = document.getElementById('backendLed');
    if (!el) return;

    try {
        const response = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
        if (response.ok) {
            el.className = 'backend-led backend-led--online';
            el.title = 'Backend connecté';
        } else {
            el.className = 'backend-led backend-led--offline';
            el.title = `Serveur indisponible (HTTP ${response.status})`;
        }
    } catch (e) {
        el.className = 'backend-led backend-led--offline';
        el.title = 'Backend inaccessible';
    }
}

function resetTranslationUi() {
    translatedSegments = {};
    document.getElementById('translatedSRTsContainer').innerHTML = '';
    const ts = document.getElementById('translationStatus');
    if (ts) ts.textContent = '';
}

function wireLanguageTranslateButtons() {
    document.querySelectorAll('.btn-lang-translate').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const lang = e.currentTarget.getAttribute('data-lang');
            if (lang) translateToLanguage(lang);
        });
    });
}

function showEditorWithSegments(segments, showTranslation) {
    srtSegments = segments;
    document.getElementById('editorSection').style.display = 'block';
    document.getElementById('downloadOriginalBtn').disabled = segments.length === 0;
    renderSRTEditor(srtSegments);
    if (showTranslation) {
        document.getElementById('translationSection').style.display = 'block';
    }
}

function initPlugin() {
    if (window.__duckCaptionInited) return;
    window.__duckCaptionInited = true;

    refreshBackendStatus();
    setInterval(refreshBackendStatus, BACKEND_STATUS_INTERVAL_MS);

    document.getElementById('importAudioBtn').addEventListener('click', importAudioFile);
    document.getElementById('importSRTBtn').addEventListener('click', importSRTFile);
    document.getElementById('transcribeBtn').addEventListener('click', transcribe);
    document.getElementById('downloadOriginalBtn').addEventListener('click', () => {
        saveSrtToDisk(serializeSrt(srtSegments), `${sourceAudioBaseName}.srt`);
    });
    wireLanguageTranslateButtons();

    const maxWordsSlider = document.getElementById('maxWordsSlider');
    const maxCharsSlider = document.getElementById('maxCharsSlider');
    const maxCharsPerLineSlider = document.getElementById('maxCharsPerLineSlider');

    maxWordsSlider.addEventListener('input', (e) => {
        maxWords = parseInt(e.target.value, 10);
        document.getElementById('maxWordsValue').textContent = String(maxWords);
    });
    maxCharsSlider.addEventListener('input', (e) => {
        maxChars = parseInt(e.target.value, 10);
        document.getElementById('maxCharsValue').textContent = String(maxChars);
    });
    maxCharsPerLineSlider.addEventListener('input', (e) => {
        maxCharsPerLine = parseInt(e.target.value, 10);
        document.getElementById('maxCharsPerLineValue').textContent = String(maxCharsPerLine);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlugin);
} else {
    initPlugin();
}

async function importAudioFile() {
    const fs = require('uxp').storage.localFileSystem;
    const status = document.getElementById('fileStatus');

    try {
        const file = await fs.getFileForOpening({
            types: ['wav', 'mp3', 'mp4', 'mov', 'aac', 'm4a']
        });

        if (!file) {
            status.textContent = '❌ Aucun fichier sélectionné';
            return;
        }

        exportedAudioPath = file.nativePath;
        sourceAudioBaseName = basenameWithoutExt(file.name);

        document.getElementById('transcriptionOptions').style.display = 'block';
        document.getElementById('transcribeBtn').disabled = false;
        document.getElementById('editorSection').style.display = 'none';
        document.getElementById('translationSection').style.display = 'none';
        resetTranslationUi();

        status.textContent = `✅ Audio chargé : ${file.name}`;
    } catch (error) {
        status.textContent = '❌ Erreur : ' + error.message;
        console.error(error);
    }
}

async function importSRTFile() {
    const fs = require('uxp').storage.localFileSystem;
    const status = document.getElementById('fileStatus');

    try {
        const file = await fs.getFileForOpening({
            types: ['srt']
        });

        if (!file) {
            status.textContent = '❌ Aucun fichier sélectionné';
            return;
        }

        const srtContent = await readFileAsUtf8(file);
        sourceAudioBaseName = basenameWithoutExt(file.name);

        const parsed = parseSrt(srtContent);
        if (parsed.length === 0) {
            status.textContent = '❌ SRT non reconnu (format attendu : index, temps, texte)';
            return;
        }

        exportedAudioPath = null;
        currentJobId = null;
        document.getElementById('transcriptionOptions').style.display = 'none';
        document.getElementById('transcribeBtn').disabled = true;

        resetTranslationUi();
        showEditorWithSegments(parsed, true);

        status.textContent = `✅ SRT chargé : ${file.name} (${parsed.length} segments)`;
    } catch (error) {
        status.textContent = '❌ Erreur : ' + error.message;
        console.error(error);
    }
}

async function transcribe() {
    const status = document.getElementById('transcribeStatus');
    const progressBar = document.getElementById('progressBar');
    const context = document.getElementById('contextInput').value;
    const keyterms = document.getElementById('keytermsInput').value.trim();

    try {
        status.textContent = '⏳ Lecture du fichier...';
        progressBar.style.display = 'block';

        const fs = require('uxp').storage.localFileSystem;
        const audioFile = await fs.getEntryWithUrl(exportedAudioPath);
        sourceAudioBaseName = basenameWithoutExt(audioFile.name);
        const arrayBuffer = await audioFile.read({ format: require('uxp').storage.formats.binary });

        status.textContent = '⏳ Upload...';

        const mimeType = audioFile.name.endsWith('.mp3')
            ? 'audio/mpeg'
            : audioFile.name.endsWith('.wav')
              ? 'audio/wav'
              : audioFile.name.endsWith('.mp4')
                ? 'video/mp4'
                : audioFile.name.endsWith('.mov')
                  ? 'video/quicktime'
                  : audioFile.name.endsWith('.m4a')
                    ? 'audio/mp4'
                    : audioFile.name.endsWith('.aac')
                      ? 'audio/aac'
                      : 'audio/mpeg';

        const blob = new Blob([arrayBuffer], { type: mimeType });
        const formData = new FormData();
        formData.append('file', blob, audioFile.name);

        const uploadRes = await fetch(`${BACKEND_URL}/transcription/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            throw new Error(`Upload failed (${uploadRes.status}): ${errorText}`);
        }

        const uploadData = await uploadRes.json();
        currentJobId = uploadData.job_id;

        status.textContent = '⏳ Transcription en cours...';

        const qs = new URLSearchParams({
            context,
            engine: 'scribe_v2',
            max_words: String(maxWords),
            max_chars: String(maxChars),
            max_chars_per_line: String(maxCharsPerLine)
        });
        if (keyterms) qs.set('keyterms', keyterms);

        const srtRes = await fetch(
            `${BACKEND_URL}/transcription/generate_srt/${currentJobId}?${qs.toString()}`,
            { method: 'POST' }
        );

        if (!srtRes.ok) {
            const errorText = await srtRes.text();
            throw new Error(`Transcription failed (${srtRes.status}): ${errorText}`);
        }

        const srtData = await srtRes.json();
        const srtContent = await fetch(srtData.srt_url).then((r) => r.text());

        let parsed = parseSrt(srtContent);
        if (parsed.length === 0) {
            parsed = [{ time: '00:00:00,000 --> 00:00:01,000', text: srtContent.trim() }];
        }

        resetTranslationUi();
        showEditorWithSegments(parsed, true);

        status.textContent = '✅ Transcription terminée !';
        progressBar.style.display = 'none';
    } catch (error) {
        status.textContent = '❌ Erreur: ' + error.message;
        progressBar.style.display = 'none';
        console.error(error);
    }
}

async function translateToLanguage(lang) {
    if (!srtSegments || srtSegments.length === 0) {
        alert('Aucun sous-titre à traduire. Importez un SRT ou lancez une transcription.');
        return;
    }

    const status = document.getElementById('translationStatus');
    const label = LANG_LABELS[lang] || lang;
    status.textContent = `🌍 Traduction ${label}…`;

    try {
        const srtContent = serializeSrt(srtSegments);

        const response = await fetch(`${BACKEND_URL}/transcription/translate_srt_content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                srt: srtContent,
                languages: [lang],
                method: 'strict',
                max_words: maxWords,
                max_chars: maxChars
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Traduction (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const srtText = (data.translations || {})[lang];
        if (srtText == null) {
            throw new Error('Réponse sans traduction pour cette langue');
        }

        let segs = parseSrt(srtText);
        if (segs.length === 0 && String(srtText).trim()) {
            segs = [{ time: '00:00:00,000 --> 00:00:01,000', text: String(srtText).trim() }];
        }
        translatedSegments[lang] = segs;

        renderTranslatedSRTs();
        status.textContent = `✅ ${label} prêt`;
    } catch (error) {
        status.textContent = '❌ Erreur: ' + error.message;
        console.error(error);
    }
}

window.translateToLanguage = translateToLanguage;

async function saveSrtToDisk(srtContent, filename) {
    const fs = require('uxp').storage.localFileSystem;

    try {
        const folder = await fs.getFolder();
        const file = await folder.createFile(filename, { overwrite: true });
        await file.write(srtContent);
        alert(`✅ Fichier sauvegardé : ${filename}`);
    } catch (error) {
        alert('❌ Erreur: ' + error.message);
    }
}

console.log('🦆 Duck Caption chargé');

const BACKEND_URL = 'https://backend-duckcaption.onrender.com/api';
let currentJobId = null;
let exportedAudioPath = null;

/** Segments SRT éditables : { time, text } */
let srtSegments = [];

let maxWords = 5;
let maxChars = 24;
let maxCharsPerLine = 42;

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
    return segments
        .map((seg, idx) => `${idx + 1}\n${seg.time}\n${seg.text}\n`)
        .join('\n');
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('testBackendBtn').addEventListener('click', testBackend);
    document.getElementById('importFileBtn').addEventListener('click', importAudioFile);
    document.getElementById('transcribeBtn').addEventListener('click', transcribe);
    document.getElementById('downloadBtn').addEventListener('click', downloadSRT);

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
});

async function testBackend() {
    const status = document.getElementById('backendStatus');

    try {
        status.textContent = '⏳ Test en cours...';

        const response = await fetch(`${BACKEND_URL}/health`, {
            method: 'GET'
        });

        if (response.ok) {
            status.textContent = '✅ Backend accessible !';
        } else {
            status.textContent = `⚠️ Backend répondu avec status ${response.status}`;
        }
    } catch (error) {
        status.textContent = '❌ Backend inaccessible : ' + error.message;
    }
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

        status.textContent = `✅ Fichier chargé : ${file.name}`;
        document.getElementById('transcribeBtn').disabled = false;
    } catch (error) {
        status.textContent = '❌ Erreur : ' + error.message;
        console.error(error);
    }
}

async function transcribe() {
    const status = document.getElementById('transcribeStatus');
    const progressBar = document.getElementById('progressBar');
    const context = document.getElementById('contextInput').value;

    try {
        status.textContent = '⏳ Lecture du fichier...';
        progressBar.style.display = 'block';

        const fs = require('uxp').storage.localFileSystem;
        const audioFile = await fs.getEntryWithUrl(exportedAudioPath);
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

        srtSegments = parseSrt(srtContent);
        if (srtSegments.length === 0) {
            srtSegments = [{ time: '00:00:00,000 --> 00:00:01,000', text: srtContent.trim() }];
        }

        document.getElementById('editorSection').style.display = 'block';
        renderSRTEditor(srtSegments);
        document.getElementById('downloadBtn').disabled = false;

        status.textContent = '✅ Transcription terminée !';
        progressBar.style.display = 'none';
    } catch (error) {
        status.textContent = '❌ Erreur: ' + error.message;
        progressBar.style.display = 'none';
        console.error(error);
    }
}

async function downloadSRT() {
    const fs = require('uxp').storage.localFileSystem;
    const srtContent = serializeSrt(srtSegments);

    try {
        const folder = await fs.getFolder();
        const file = await folder.createFile('subtitles.srt', { overwrite: true });
        await file.write(srtContent);

        alert('✅ SRT sauvegardé !');
    } catch (error) {
        alert('❌ Erreur: ' + error.message);
    }
}

console.log('🦆 Duckmotion Transcription chargé');

const BACKEND_URL = 'https://backend-duckcaption.onrender.com';
let currentJobId = null;
let exportedAudioPath = null;

// Au chargement
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('testBackendBtn').addEventListener('click', testBackend);
    document.getElementById('importFileBtn').addEventListener('click', importAudioFile);
    document.getElementById('transcribeBtn').addEventListener('click', transcribe);
    document.getElementById('downloadBtn').addEventListener('click', downloadSRT);
});

async function testBackend() {
    const status = document.getElementById('backendStatus');

    try {
        status.textContent = '⏳ Test en cours...';

        const response = await fetch(`${BACKEND_URL}/`, {
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

// 1. Import fichier audio
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

// 2. Upload et transcription
async function transcribe() {
    const status = document.getElementById('transcribeStatus');
    const progressBar = document.getElementById('progressBar');
    const context = document.getElementById('contextInput').value;

    try {
        status.textContent = '⏳ Lecture du fichier...';
        progressBar.style.display = 'block';

        // Lire le fichier avec le bon format
        const fs = require('uxp').storage.localFileSystem;
        const audioFile = await fs.getEntryWithUrl(exportedAudioPath);
        const arrayBuffer = await audioFile.read({ format: require('uxp').storage.formats.binary });

        status.textContent = '⏳ Upload...';

        // Upload vers backend
        const blob = new Blob([arrayBuffer]);
        const formData = new FormData();
        formData.append('file', blob, audioFile.name);

        const uploadRes = await fetch(`${BACKEND_URL}/transcription/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.status}`);
        }

        const uploadData = await uploadRes.json();
        currentJobId = uploadData.job_id;

        status.textContent = '⏳ Transcription en cours...';

        // Générer SRT
        const srtRes = await fetch(
            `${BACKEND_URL}/transcription/generate_srt/${currentJobId}?context=${encodeURIComponent(context)}&engine=scribe_v2`,
            { method: 'POST' }
        );

        if (!srtRes.ok) {
            throw new Error(`Transcription failed: ${srtRes.status}`);
        }

        const srtData = await srtRes.json();

        // Récupérer le contenu SRT
        const srtContent = await fetch(srtData.srt_url).then(r => r.text());

        document.getElementById('srtResult').value = srtContent;
        document.getElementById('downloadBtn').disabled = false;

        status.textContent = '✅ Transcription terminée !';
        progressBar.style.display = 'none';
    } catch (error) {
        status.textContent = '❌ Erreur: ' + error.message;
        progressBar.style.display = 'none';
        console.error(error);
    }
}

// 3. Télécharger le SRT
async function downloadSRT() {
    const srtContent = document.getElementById('srtResult').value;
    const fs = require('uxp').storage.localFileSystem;
    
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

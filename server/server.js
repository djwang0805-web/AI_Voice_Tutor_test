// server/server.js
// Offline TTS server using Piper (no cloud keys/billing).
// - WebSocket API: send { type: "SYNTH", audioFormat: "LINEAR16", speakingRate?, spans: [{ text, lang }] }
// - Streams WAV chunks (one per span) to the client as binary WS frames.
// - Update VOICE_MODELS paths to your local .onnx models!

import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 8081;

// Absolute path to piper.exe if it's not on PATH (use forward slashes on Windows)
const PIPER_BIN = process.env.PIPER_BIN || 'piper';

// Dedicated temp dir (make it under your user profile on C: to avoid permission issues)
const PIPER_TMP =
  process.env.PIPER_TMP ||
  `${process.env.LOCALAPPDATA}\\Temp\\piper_tmp`;

if (!fs.existsSync(PIPER_TMP)) fs.mkdirSync(PIPER_TMP, { recursive: true });

console.log('PIPER_BIN:', PIPER_BIN);
console.log('PIPER_TMP:', PIPER_TMP);

// Map language tag -> local Piper model path (.onnx + matching .onnx.json in same folder)
const VOICE_MODELS = {
  // TODO: point these to YOUR actual model files
  'en-US': 'E:/Workspace/AI_voice_tutor/voices/en_US-amy-low.onnx',
  'de-DE': 'E:/Workspace/AI_voice_tutor/voices/de_DE-thorsten-low.onnx',
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (_req, res) => res.send('Piper TTS WebSocket Server is running.'));

// --- WebSocket handling ---
wss.on('connection', (ws) => {
  console.log('ws-connected');

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'SYNTH') return;

      const id = msg.id || String(Date.now());
      const audioFormat = msg.audioFormat || 'LINEAR16'; // We output WAV regardless; keep LINEAR16

      ws.send(JSON.stringify({ type: 'AUDIO_START', id, mime: mimeFromFormat(audioFormat) }));

      // Synthesize each span and send as one binary frame per span
      for (const span of msg.spans || []) {
        const lang = span.lang || 'en-US';
        const modelPath = VOICE_MODELS[lang];
        if (!modelPath) throw new Error(`No Piper model mapped for language ${lang}`);

        const text = (span.text ?? '').trim();
        if (!text) continue;

        const wav = await piperSynthesizeFile(text, modelPath, {
          speakingRate: Number.isFinite(span.rate) ? span.rate : msg.speakingRate
        });

        ws.send(wav, { binary: true });
      }

      ws.send(JSON.stringify({ type: 'AUDIO_END', id }));
      ws.send(JSON.stringify({ type: 'DONE', id }));
    } catch (e) {
      console.error('PIPER ERROR:', e?.message || e);
      try {
        ws.send(JSON.stringify({ type: 'ERROR', error: e?.message || 'Synthesis failed' }));
      } catch {}
    }
  });

  ws.on('close', (code, reason) => {
    console.log('ws-closed', code, reason?.toString?.());
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP/WS listening on http://localhost:${PORT}`);
});

// ---- Helpers ----

function mimeFromFormat(fmt) {
  // We always return WAV bytes. Keeping mime consistent avoids decode issues.
  return 'audio/wav';
}

/**
 * Run Piper to write a WAV file we control, then read & return its bytes.
 * This avoids Windows temp/handle issues from Python's NamedTemporaryFile.
 */
async function piperSynthesizeFile(text, modelPath, opts = {}) {
  const outPath = path.join(
    PIPER_TMP,
    `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
  );

  const args = ['-m', modelPath, '--output_file', outPath, '', text];

  // Optional speed: Piper's length_scale is ~ inverse of speaking rate
  if (opts.speakingRate && Number.isFinite(opts.speakingRate) && opts.speakingRate > 0) {
    const lengthScale = 1 / Number(opts.speakingRate);
    args.push('--length_scale', String(lengthScale));
  }

  await new Promise((resolve, reject) => {
    const child = spawn(PIPER_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TMP: PIPER_TMP,
        TEMP: PIPER_TMP,
        TMPDIR: PIPER_TMP,
        PYTHONUTF8: '1',
      },
    });

    child.stderr.on('data', (d) => process.stderr.write(`[piper] ${d}`));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`piper exited with code ${code}`));
    });

  });

  try {
    const buf = await fsp.readFile(outPath);
    return buf;
  } finally {
    fsp.unlink(outPath).catch(() => {});
  }
}
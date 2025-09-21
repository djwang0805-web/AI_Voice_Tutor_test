import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import textToSpeech from '@google-cloud/text-to-speech';
import {buildSSML} from './ssml.js';
import crypto from 'node:crypto';
import s3Cache  from './s3-cache.js';
import express from 'express';
import http from 'node:http'

const { existsS3, putS3 } = s3Cache;

const app = express();
const server = http.createServer(app);
const client = new textToSpeech.TextToSpeechClient();


const PORT = process.env.PORT || 8081;
const wss = new WebSocketServer( {server} );

app.get('/', (_, res) => res.send('Text-to-Speech WebSocket Server is running.'));

/**
 * client message schema (JSON):
 * {
 *  id?: string,
 *  type: 'SYNTH',
 *  audioFormat?: 'MP3' | 'OGG_OPUS' | 'LINEAR16',
 *  speakingRate?: number, // 0.25 .. 4.0
 *  pitch?: number,  // -20 .. 20 semitones
 *  volumeGainDb?: number , // -96 .. 16
 *  spans: [ {text, voiceName, lang } ... ]
 * }
 */
wss.on('listening', () => console.log('WSS listening'));
wss.on('error', (err) => console.error('WSS error:', err));
wss.on('connection', (ws) => {
  console.log("ws-connected");
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'SYNTH') return;

      const id = msg.id || uuidv4();
      const audioFormat = msg.audioFormat || 'OGG_OPUS';
      const audioConfig = pickAudioConfig(audioFormat, msg);

      const ssml = buildSSML(msg.spans);

      const cacheKey = cacheKeyFrom({ssml, audioConfig});

      if (process.env.USE_S3_CACHE === 'true' && (await existsS3(cacheKey))) {
        ws.send(JSON.stringify({type: 'AUDIO_URL', id, url: publicUrl(cacheKey)}));
        ws.send(JSON.stringify({ type: 'DONE', id}));
        return;
      }

      const [response] = await client.synthesizeSpeech({
        input: {ssml},
        voice: {languageCode: 'en-US', name: 'en-US-Neural2-C'},
        audioConfig
      });

      const bytes = response.audioContent;

      if (!bytes) {
        ws.send(JSON.stringify({ type: 'ERROR', id, error: 'No audioContent'}));
        return;
      }

      // Option1: stream raw bytes (binary frame)
      ws.send(JSON.stringify({type: 'AUDIO_START', id, mime: mimeFromFormat(audioFormat)}));
      ws.send(bytes, {binary: true});
      ws.send(JSON.stringify({type: 'AUDIO_END', id}));

      //Option2: also cache to S3 for later reuse
      if (process.env.USE_S3_CACHE === 'true') {
        const url = await putS3(cacheKey, bytes, mimeFromFormat(audioFormat));
        ws.send(JSON.stringify({type: 'AUDIO_URL', id, url}));
      }
      ws.send(JSON.stringify({type: 'DONE', id}));
    }
    catch (e) {
      console.error(e);
    }
  })
})

function pickAudioConfig(fmt, {speakingRate, pitch, volumeGainDb} = {}) {
  const base = {speakingRate, pitch, volumeGainDb};
  switch (fmt) {
    case 'MP3':
      return {...base, audioEncoding: 'MP3'};
    case 'LINEAR16':
      return {...base, audioEncoding: 'LINEAR16', sampleRateHertz: 24000};
    default:
      return {...base, audioEncoding: 'OGG_OPUS'};
  }
}

function mimeFromFormat(fmt) {
  return fmt === 'MP3' ? 'audio/mpeg' : fmt === 'LINEAR16' ? 'audio/wav' : 'audio/ogg';
}

function cacheKeyFrom({ssml, audioConfig}) {
  const h = crypto.createHash('sha1');
  h.update(JSON.stringify({ ssml, audioConfig}));
  return `tts/${h.digest('hex')}.ogg`;
}

function publicUrl(key) {
  return `${process.env.PUBLIC_AUDIO_BASE}/${encodeURIComponent(key)}`
}

server.listen( PORT, () => {
  console.log(`HTTP/WS listening on http://localhost:${PORT}`);
})
console.log('ADC:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
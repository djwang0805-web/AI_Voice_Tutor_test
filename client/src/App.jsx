import { useState, useRef, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

import { AudioQueue, getCtx } from './audioQueue'

const WS_URL = import.meta.env.VITE_WS_URL || 'https://clastic-patiently-sherrell.ngrok-free.app';

function App() {
  const [text, setText] = useState('');
  const [textList, setTextList] = useState([]);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [format, setFormat] = useState('OGG_OPUS');
  const [status, setStatus] = useState('idle');

  const [textLine, setTextLine] = useState('');
  const [lang, setLang] = useState('English');

  const wsRef = useRef(null);
  const queueRef = useRef(null);

 useEffect(() => {
  queueRef.current = new AudioQueue();

  let cancelled = false;
  const ws = new WebSocket(WS_URL);
  ws.binaryType = 'arraybuffer';

  const onOpen = () => {
    if (cancelled) { try { ws.close(); } catch {} return; }
    wsRef.current = ws;
    setStatus('connected');
  };
  const onClose = () => setStatus('disconnected');
  const onError = (e) => { console.error('WS error', e); setStatus('error'); };
  const onMessage = async (event) => {
    if (typeof event.data === 'string') {
      const msg = JSON.parse(event.data);
      if (msg.type === 'AUDIO_URL') {
        queueRef.current.playUrl(msg.url);
      } else if (msg.type === 'ERROR') {
        console.error('Server error:', msg.error);
      }
      return;
    }
    await queueRef.current.enqueue(event.data);
  };

  ws.addEventListener('open', onOpen);
  ws.addEventListener('close', onClose);
  ws.addEventListener('error', onError);
  ws.addEventListener('message', onMessage);

  return () => {
    cancelled = true;
    ws.removeEventListener('open', onOpen);
    ws.removeEventListener('close', onClose);
    ws.removeEventListener('error', onError);
    ws.removeEventListener('message', onMessage);
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try { ws.close(1000); } catch {}
    }
  };
}, []);

  function synthesize() {
    // Wake / resume audio context due to user gesture policies
    getCtx().resume();

    const spans = [
      { text: "Let's test the project", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "My AI voice tutor", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "It's awesome, but you need to add features.", voiceName: 'en-US-Neural2-C', lang: 'en-US'}
    ];
    const payload = {
      type: 'SYNTH',
      audioFormat: format,
      speakingRate: Number(speakingRate),
      pitch: Number(pitch),
      spans
    };
    wsRef.current?.send(JSON.stringify(payload));
  }

  const addTextLine = () => {
    setTextList([...text, {lang, content: textLine}]);
  }
  const popText = () => {
    let editText = [...text];
    editText.pop();
    setTextList(editText);
  }
  const onTextLineChange = () => {
    
  }
  return (
    <>
      <div style={{maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui'}}>
        <h1> AI Voice Tutor </h1>
        <p>Status: {status}</p>

        <label> Text </label>
        <br/>
        <button onClick={addTextLine}>Add a text line to read</button>
        <button onClick={popText}>Pop One Line</button>
        <select value={lang}>
          <option>English</option>
          <option>German</option>
        </select>
        <input value={textLine} onChange={onTextLineChange}></input>
        <textarea rows={5} style={{width: '100%'}} value={text} onChange={(e) => setText(e.target.value)} disabled></textarea>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12}}>
          <label>
            Rate
            <input type="number" min={0.25} max={4} step={0.05} value={speakingRate} onChange={(e) => setSpeakingRate(e.target.value)}/>
          </label>
          <label>
            Pitch (semitones)
            <input type="number" min={-20} max={20} step={1}
            value={pitch} onChange={(e) => setPitch(e.target.value)} />
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="OGG_OPUS">OGG_OPUS</option>
              <option value="MP3">MP3</option>
              <option value="LINEAR16">LINEAR16</option>
            </select>
          </label>
        </div>

        <button onClick={synthesize} style={{marginTop: 16}}>Speak</button>

        <p style={{marginTop: 16, fontSize: 14, opacity: 0.8}}>
          Demo voices: en-US-Nerual2-C (English), de-DE-BerndNeural (German). Edit in code.
        </p>
      </div>
    </>
  )
}

export default App

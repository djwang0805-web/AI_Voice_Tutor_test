import { useState, useRef, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './theme.css'

import { AudioQueue, getCtx } from './audioQueue'

const WS_URL = import.meta.env.VITE_WS_URL || 'https://clastic-patiently-sherrell.ngrok-free.app';

function App() {
  const [text, setText] = useState('');
  const [textList, setTextList] = useState([
      { text: "Hi, do you know when the next train arrives?", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Ja, der Zug kommt in etwa zehn Minuten.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "Oh, thank you! I wasn’t sure if I missed it.", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Kein Problem. Es ist heute etwas verspätet.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "Do you take this train often?", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Ja, ich fahre jeden Tag damit zur Arbeit.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "I’m just visiting. It’s my first time in Germany.", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Willkommen! Wie gefällt es dir bisher?", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "I really like it! The cities are beautiful.", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Das freut mich. Deutschland hat viele schöne Orte.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "Have you ever been to England?", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Ja, einmal in London. Es war eine tolle Erfahrung.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "That’s great! Did you enjoy the food?", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Ja, besonders das Frühstück war interessant.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "Yes, English breakfast is quite heavy.", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Aber lecker! Ich mochte die Würstchen.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "Do you speak English well?", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Ein bisschen, aber ich verstehe dich gut.", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
      { text: "That’s perfect! And I understand your German too.", voiceName: 'en-US-Neural2-C', lang: 'en-US'},
      { text: "Dann können wir uns ja super unterhalten!", voiceName: 'de-DE-BerndNeural', lang: 'de-DE'},
  ]);
  const [speakingRate, setSpeakingRate] = useState(1.2);
  const [pitch, setPitch] = useState(0);
  const [format, setFormat] = useState('OGG_OPUS');
  const [status, setStatus] = useState('idle');

  const [textLine, setTextLine] = useState('');
  const [lang, setLang] = useState('English');

  const wsRef = useRef(null);
  const queueRef = useRef(null);

  const [emotion, setEmotion] = useState('excited'); // 'cheerful' | 'serious' | 'sad' | 'excited'

  // map emotion → FX (tweak to taste)
  function fxForEmotion(name) {
    switch (name) {
      case 'cheerful': return { gain: 1.06, detune: +0.35, brightness: 5,  pauseBefore: 20,  pauseAfter: 70 };
      case 'serious':  return { gain: 0.96, detune: -0.30, brightness: -2, pauseBefore: 40,  pauseAfter: 90 };
      case 'sad':      return { gain: 0.92, detune: -0.45, brightness: -4, pauseBefore: 80,  pauseAfter: 140 };
      case 'excited':  return { gain: 1.08, detune: +0.50, brightness: 7,  pauseBefore: 10,  pauseAfter: 40 };
      default:         return { gain: 1.00, detune: 0,     brightness: 0,  pauseBefore: 20,  pauseAfter: 60 };
    }
  }

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
    const fx = fxForEmotion(emotion);
    await queueRef.current.enqueue(event.data, fx);
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

useEffect( () => {
  let text = '', name = '';
  if (!textList) return;
  for(let i = 0 ; i < textList.length ; i ++){
    let item = textList[i];
    if ( item.lang === 'en-US' ) name = 'Maria';
    else name = "Bernd";
    text += `\n${name}: ${item.text}`
  }
  setText(text)
}, [textList])

  function synthesize() {
    // Wake / resume audio context due to user gesture policies
    getCtx().resume();

    
    const payload = {
      type: 'SYNTH',
      audioFormat: format,
      speakingRate: Number(speakingRate),
      pitch: Number(pitch),
      spans: textList
    };
    wsRef.current?.send(JSON.stringify(payload));
  }

  const addTextLine = () => {
    let voiceName, Lang;
    if (lang === 'English' ){
      voiceName = 'en-US-Neural2-C';
      Lang = 'en-US';
    } else {
      voiceName = 'de-DE-BerndNeural';
      Lang = 'de-DE'
    }
    setTextList([...textList, {text: textLine, voiceName, lang: Lang}]);
  }
  const popText = () => {
    setTextList( prev => prev.slice(0, -1) )
  }
  const onTextLineChange = (e) => {
    setTextLine(e.target.value)
  }
  const clearText = () => {
    setTextList([]);
  }
    // ---------- THEMED UI ----------
  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="logo" />
          <div className="main-title">
            <h1>Let's make magic <img src="magic_stick.png" widht='70px' height='70px' style={{position:'relative', top:'20px',boxShadow:'2px 2px 5px lightpink'}}/>.</h1>
            <p className="subtitle">AI Voice Tutor · English & German</p>
          </div>
        </div>
        <div className="badge">
          <span className={`dot ${status === 'connected' ? 'ok' : ''}`} />
          <span>{status}</span>
        </div>
      </header>

      <section className="controls">
        {/* Left card: Text & Speak */}
        <div className="card pad stack">
          <div className="field">
            <label style={{fontSize:'18px'}}>You can create a wonderful <b>bilingual conversation</b> yourself.</label>
            <textarea
              className="textarea"
              rows={6}
              value={text}
              disabled
            />
          </div>

          <div className="split">
            <div className="field">
              <label>Add a text line</label>
              <input className="input" value={textLine} onChange={onTextLineChange} placeholder="Type a sentence..." />
            </div>
            <div className="field">
              <label>Language</label>
              <select className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option>English</option>
                <option>German</option>
              </select>
            </div>
            <div className="field">
            <label>Emotion</label>
            <select className="select" value={emotion} onChange={(e)=>setEmotion(e.target.value)}>
              <option value="neutral">Neutral</option>
              <option value="cheerful">Cheerful</option>
              <option value="serious">Serious</option>
              <option value="sad">Sad</option>
              <option value="excited">Excited</option>
            </select>
          </div>
          </div>

          <div className="btns">
            <button className="btn" onClick={addTextLine}>Add line</button>
            <button className="btn ghost" onClick={popText} disabled={!textList.length}>Pop last</button>
            <button className="btn ghost" onClick={clearText} disabled={!textList.length}>Clear all</button>
            <button className="btn secondary" onClick={synthesize} disabled={status !== 'connected'} style={{marginLeft:'100px',transform:'scale(1.2)'}}>Speak ⏵</button>
          </div>
        </div>

        {/* Right card: Controls */}
        <div className="card pad stack">
          <div className="row">
            <div className="field">
              <label>Speaking rate</label>
              <input
                className="input"
                type="number"
                min={0.25} max={4} step={0.05}
                value={speakingRate}
                onChange={(e) => setSpeakingRate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Pitch (semitones)</label>
              <input
                className="input"
                type="number"
                min={-20} max={20} step={1}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Format</label>
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="LINEAR16">WAV (LINEAR16)</option>
                <option value="MP3">MP3</option>
                <option value="OGG_OPUS">OGG/Opus</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span className="badge"><span className="dot ok" /> en-US</span>
            <span className="badge"><span className="dot" /> de-DE</span>
          </div>
        </div>
      </section>

      <p className="footer">Tip: bind a pronunciation scoring panel here next.</p>
    </div>
  )

}

export default App

// src/prosodyPlanner.js
// Turns [{text, lang}] into expressive micro-spans with per-span rate & emotion
// Keep it lightweight: pure heuristics + tiny sentiment list.

const POS = ['great','good','awesome','amazing','love','nice','happy','wonderful','cool','excellent','fantastic','super'];
const NEG = ['bad','hard','hate','sad','issue','problem','difficult','terrible','awful','worse','annoying','boring','tired'];

function sentimentScore(s) {
  const t = s.toLowerCase();
  let sc = 0;
  for (const w of POS) if (t.includes(w)) sc += 1;
  for (const w of NEG) if (t.includes(w)) sc -= 1;
  return sc;
}

// crude sentence split
function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

// phrase split around discourse markers; keep marker with next clause
function splitPhrases(s) {
  return s
    .replace(/—/g, ' — ')
    .split(/\s+(?=(?:but|however|because|so|and)\b)|,/gi)
    .map(x => x.trim())
    .filter(Boolean);
}

export function planProsody(list) {
  const out = [];
  for (const item of list) {
    const { text, lang = 'en-US' } = item;
    for (const sent of splitSentences(text)) {
      const sType = /[?]$/.test(sent) ? 'question' : /[!]$/.test(sent) ? 'exclaim' : 'statement';
      const sentScore = sentimentScore(sent);

      // base style from type/sentiment
      const base = {
        rate: sType === 'exclaim' ? 1.12 : sType === 'question' ? 1.06 : 1.0,
        emotion:
          sType === 'exclaim' ? 'excited' :
          sType === 'question' ? 'curious' :
          sentScore > 0 ? 'cheerful' :
          sentScore < 0 ? 'serious' : 'neutral'
      };

      const phrases = splitPhrases(sent);
      phrases.forEach((p, i) => {
        // emphasize contrast after "but/however"
        const contrast = /^\s*(but|however)\b/i.test(p);
        const phrase = p.replace(/^\s*(but|however)\b\s*/i, '').trim();

        // find simple emphasis markers (ALL CAPS or *word*)
        const emph = [];
        phrase.split(/\s+/).forEach(tok => {
          if ((/^[A-Z]{2,}/.test(tok) && tok.length > 2) || /^\*.+\*$/.test(tok)) {
            emph.push(tok.replace(/^\*|\*$/g, ''));
          }
        });

        // micro plan: add a tiny pause between phrases
        const micro = {
          text: phrase,
          lang,
          rate: base.rate * (contrast ? 0.95 : 1.0),
          emotion: contrast ? 'contrast' : base.emotion,
          pauseAfterMs: i < phrases.length - 1 ? 90 : 60,
        };

        out.push(micro);

        // turn emphasized tokens into separate micro-spans with boost
        if (emph.length) {
          emph.forEach(word => {
            out.push({
              text: word,
              lang,
              rate: 1.04,
              emotion: 'emph',
              pauseAfterMs: 50
            });
          });
        }
      });

      // question tail: add a short upward “tag” (helps the rising contour)
      if (sType === 'question') {
        out.push({ text: ' ', lang, rate: 1.0, emotion: 'rise', pauseAfterMs: 80 });
      }
    }
  }
  return out;
}
/**
 * Build SSML that can switch voices mid-sentence.
 * spans: [{text: string, voiceName?: string, lang?: string}]
 * Example voices: 'en-US-Neural2-C', 'de-DE-BerndNeural'
 */

export function buildSSML(spans) {
  const parts = spans.map(({ text, voiceName, lang }) => {
  const safe = escapeXml(text);
  if (voiceName || lang) {
    const voiceAttr = voiceName ? ` name="${voiceName}"` : "";
    const langWrapStart = lang ? `<lang xml:lang="${lang}">` : "";
    const langWrapEnd = lang ? `</lang>` : "";
    return `<voice${voiceAttr}>${langWrapStart}${safe}${langWrapEnd}</voice>`;
  }
  return safe;
  });
  return `<speak>${parts.join(" ")}</speak>`;
}


function escapeXml(s) {
  return s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");
}
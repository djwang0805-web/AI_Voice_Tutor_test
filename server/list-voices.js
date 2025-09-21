import 'dotenv/config';
import textToSpeech from '@google-cloud/text-to-speech';
const client = new textToSpeech.TextToSpeechClient();
const [res] = await client.listVoices({});

for ( const v of res.voices ) {
  if( v.languageCodes.some(c => c.startsWith('en-') || c.startsWith('de-'))) {
    console.log(v.name, v.languageCodes.joint(','));
  }
}
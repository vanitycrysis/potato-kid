// Additive cue renderer. Run after render-audio.mjs (which retains its historical nine-master list).
import {readFileSync,writeFileSync} from 'node:fs';
import {render,scale,peak,wav,decode,sha} from '../art/src/audio/synth.mjs';
import {measure} from '../art/src/audio/measure.mjs';
import {Plot,reviewPanel} from '../art/src/audio/plot.mjs';
const cue=JSON.parse(readFileSync('art/src/audio/planting.json','utf8'));
const params=JSON.parse(readFileSync('art/src/audio/synthesis.json','utf8'));
const pcm=render(cue,params);scale(pcm,Math.round(10**(cue.peakDbfs/20)/peak(pcm)*1e9)/1e9);const b=wav(pcm);
const check=process.argv.includes('--check');
if(check&&!b.equals(readFileSync('art/audio/sfx_plant.wav')))throw Error('Planting master does not reproduce');
const metric=measure(decode(b),false);
if(metric.channels!==1||metric.sampleRate!==48000||metric.bits!==16||metric.samples!==17280||metric.peakDbfs>-3||metric.perChannel.some(c=>Math.abs(c.dc)>.0001||[...c.firstSamples,...c.lastSamples].some(x=>x!==0)))throw Error('Planting cue format/peak/DC/endpoints');
if(!check){writeFileSync('art/audio/sfx_plant.wav',b);const rows=readFileSync('art/audio/masters.sha256','utf8').split('\n').filter(s=>s&&!s.endsWith('sfx_plant.wav'));rows.push(`${sha(b)}  sfx_plant.wav`);writeFileSync('art/audio/masters.sha256',rows.join('\n')+'\n');writeFileSync('.codex-out/gate4-audio.json',JSON.stringify({id:cue.id,sha256:sha(b),bytes:b.length,...metric},null,2)+'\n');const plot=new Plot(900,420);reviewPanel(plot,decode(b),metric,cue.id,0,0,900,420);writeFileSync('art/previews/audio/sfx_plant-review.png',plot.png());}
console.log(`${check?'Verified':'Rendered'} ${cue.id}: ${metric.duration}s / ${metric.peakDbfs.toFixed(2)} dBFS / SHA-256 ${sha(b)}`);

// Reproducible Node-only render + quantized-WAV audit. No npm or external programs.
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
import { render,scale,peak,wav,decode,sha } from '../art/src/audio/synth.mjs';
import { loudness,measure } from '../art/src/audio/measure.mjs';
import { Plot,reviewPanel,seamPlot } from '../art/src/audio/plot.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const score=JSON.parse(readFileSync(resolve(root,'art/src/audio/score.json'),'utf8'));
const params=JSON.parse(readFileSync(resolve(root,'art/src/audio/synthesis.json'),'utf8'));
const check=process.argv.includes('--check'), auditOnly=process.argv.includes('--audit-only');
const audio=resolve(root,'art/audio'),previews=resolve(root,'art/previews/audio'),notes=resolve(root,'.codex-out');
for(const dir of [audio,previews,notes]) mkdirSync(dir,{recursive:true});
const rows=[],overview=new Plot(1080,750);
for(const [index,asset] of [...score.sfx,score.music].entries()) {
  const music=asset.id==='music_garden',path=resolve(audio,`${asset.id}.wav`);
  let b;
  if(auditOnly) b=readFileSync(path);
  else {
    const floating=render(asset,params,music);
    const gain=music ? 10**((params.musicTargetLufs-loudness(floating).value)/20) : 10**(asset.peakDbfs/20)/peak(floating);
    // Quantizing gain makes the PCM insensitive to sub-nanounit libm variation.
    scale(floating,Math.round(gain*1e9)/1e9);
    if(music && peak(floating)>10**(params.musicPeakCeilingDbfs/20)) throw new Error('Music loudness target exceeds peak ceiling; revise arrangement instead of limiting.');
    b=wav(floating);
    if(check) {
      if(!existsSync(path)||!b.equals(readFileSync(path))) throw new Error(`Bit reproducibility failed: ${asset.id}`);
    } else writeFileSync(path,b);
  }
  const channels=decode(b),metric=measure(channels,music);
  if(metric.channels!==(music?2:1)||metric.samples!==Math.round(asset.duration*48000)) throw new Error(`Format/duration failed ${asset.id}`);
  if(!music&&(metric.duration<asset.range[0]||metric.duration>asset.range[1]))throw new Error(`Range ${asset.id}`);
  if(metric.peakDbfs>-3.0||metric.perChannel.some(c=>Math.abs(c.dc)>0.0001))throw new Error(`Peak/DC ${asset.id}`);
  if(!music&&metric.perChannel.some(c=>[...c.firstSamples,...c.lastSamples].some(x=>x!==0)))throw new Error(`Nonzero cue endpoints ${asset.id}`);
  if(music) {
    if(metric.samples!==asset.loopEndSampleExclusive||asset.loopStartSample!==0||Math.abs(metric.loudness.value+18)>0.1)throw new Error('Loop/loudness contract');
    if(metric.seam.some(s=>s.jumpToLocalMaxSlope>1.1||Math.abs(s.levelChange20msDb)>3||s.spectralCosine85ms<0.9))throw new Error('Seam continuity');
  }
  rows.push({id:asset.id,sha256:sha(b),bytes:b.length,intent:asset.intent,...metric});
  const panel=new Plot(900,420);reviewPanel(panel,channels,metric,asset.id,0,0,900,420);
  writeFileSync(resolve(previews,`${asset.id}-review.png`),panel.png());
  reviewPanel(overview,channels,metric,asset.id,(index%3)*360,Math.floor(index/3)*250,360,250,true);
  if(music)writeFileSync(resolve(previews,'music_garden-seam.png'),seamPlot(channels));
  console.log(`${asset.id}: ${metric.duration.toFixed(3)}s, ${metric.peakDbfs.toFixed(2)} dBFS peak, ${metric.rmsDbfs.toFixed(2)} dBFS RMS, ${metric.loudness.value.toFixed(2)} LUFS${metric.duration<0.4?' estimate':''}, ${Math.round(metric.spectralCentroidHz)} Hz centroid`);
}
writeFileSync(resolve(previews,'audio-mvp-review-sheet.png'),overview.png());
const sourcePaths=['score.json','synthesis.json','compose.mjs','synth.mjs','measure.mjs','plot.mjs'];
const report={revision:score.revision,node:process.version,platform:process.platform,arch:process.arch,
  loop:{start:score.music.loopStartSample,endExclusive:score.music.loopEndSampleExclusive,sampleRate:48000,seconds:72},
  sources:Object.fromEntries(sourcePaths.map(p=>[`art/src/audio/${p}`,sha(readFileSync(resolve(root,`art/src/audio/${p}`)))])),
  rendererSha256:sha(readFileSync(fileURLToPath(import.meta.url))),files:rows};
writeFileSync(resolve(notes,'audio-mvp-measurements.json'),JSON.stringify(report,null,2)+'\n');
writeFileSync(resolve(audio,'masters.sha256'),rows.map(r=>`${r.sha256}  ${r.id}.wav`).join('\n')+'\n');
console.log(check?'All nine WAVs reproduced bit for bit and passed the audit.':auditOnly?'Delivered WAVs audited.':'All nine masters rendered and audited.');

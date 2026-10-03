// Original composition, ChatGPT. Rebuild the explicit note-event score without npm.
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('./score.json', import.meta.url);
const score = JSON.parse(readFileSync(path, 'utf8'));
const hz = {
  C3:130.812783, A2:110, F3:174.614116, G3:195.997718,
  C4:261.625565, D4:293.664768, E4:329.627557, F4:349.228231,
  G4:391.995436, A4:440, B4:493.883301, C5:523.251131,
  D5:587.329536, E5:659.255114, G5:783.990872,
};
// Each row is a four-bar melodic thought, two notes per bar. No imported tune.
const phrases = [
  ['E5','D5', 'C5','E5', 'A4','C5', 'D5','G4'],
  ['G4','D5', 'E5','C5', 'C5','A4', 'D5','G4'],
  ['E5','G5', 'E5','C5', 'A4','G4', 'D5','G4'],
  ['D5','E5', 'C5','A4', 'C5','E5', 'D5','G4'],
  ['G4','C5', 'E5','D5', 'A4','C5', 'G4','D5'],
  ['E5','D5', 'C5','A4', 'C5','A4', 'D5','G4'],
];
const roots = ['C3','A2','F3','G3'];
const dyads = [['E4','G4'],['C4','E4'],['A4','C5'],['G4','D5']];
const events = [];
function note(beat, duration, voice, name, gain, pan) {
  events.push({time:beat*0.75, duration, voice, note:name, hz:hz[name], gain, pan});
}
for (let bar=0; bar<24; bar++) {
  const chord=bar%4, phrase=Math.floor(bar/4), pair=phrases[phrase].slice(chord*2,chord*2+2);
  note(bar*4+0.12, 2.85, 'bass', roots[chord], 0.43, 0);
  // Small deterministic offsets change the phrasing; no random timing.
  const first=[0.65,0.85,0.6,0.9,0.75,0.55][phrase];
  const second=bar===23 ? 3.6 : [2.55,2.75,2.9,2.4][chord];
  note(bar*4+first, 1.7, 'pluck', pair[0], [0.68,0.57,0.62,0.54][chord], bar%2 ? 0.24 : -0.24);
  note(bar*4+second, 1.9, 'pluck', pair[1], 0.43, bar%2 ? -0.18 : 0.18);
  // Six quiet dyads, not a continuous pad. They leave open space between phrases.
  if (bar%4===2) for (const [i,name] of dyads[phrase%4].entries()) {
    note(bar*4+0.25, 5.2, 'felt', name, 0.085, i ? 0.32 : -0.32);
  }
}
score.music.events=events.sort((a,b)=>a.time-b.time);
writeFileSync(path, JSON.stringify(score,null,2)+'\n');
console.log(`Authored ${events.length} music events; 24 bars / 72 seconds.`);

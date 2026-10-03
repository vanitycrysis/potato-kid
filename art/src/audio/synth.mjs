// No samples, libraries, native oscillator/exp calls, or nondeterministic RNG.
import { createHash } from 'node:crypto';
export const SR=48000;
const TAU=6.283185307179586, PI=3.141592653589793;
// Fixed polynomial sine avoids platform libm differences in rendered PCM.
function sine(x) {
  x-=TAU*Math.floor((x+PI)/TAU);
  if (x>PI/2) x=PI-x;
  if (x<-PI/2) x=-PI-x;
  const z=x*x;
  return x*(1-z*(1/6-z*(1/120-z*(1/5040-z*(1/362880-z*(1/39916800-z/6227020800))))));
}
function smooth(x) { x=Math.max(0,Math.min(1,x)); return x*x*(3-2*x); }
export function render(asset, parameters, music=false) {
  const length=Math.round(asset.duration*SR), channels=music ? 2 : 1;
  const out=Array.from({length:channels},()=>new Float64Array(length));
  for (const [eventIndex,event] of asset.events.entries()) {
    const v=parameters.voices[event.voice], n=Math.round(event.duration*SR);
    const start=Math.round(event.time*SR), attack=Math.round(v.attack*SR), release=Math.round(v.release*SR);
    const phases=v.partials.map(()=>0), factors=v.partials.map((_,k)=>1-1/(v.decay*SR/(1+k*0.55)));
    const envelopes=v.partials.map(()=>1);
    let state=(parameters.seed+eventIndex*7919)>>>0, noiseLow=0, noiseEnv=1;
    const pan=event.pan??0;
    // Narrow equal-ish-power field, fixed linear gains; center = 0.7071 per side.
    const gains=music ? [0.7071067811865476*(1-pan),0.7071067811865476*(1+pan)] : [1];
    const taps=music ? [[0,1],...parameters.delayTaps] : [[0,1]];
    for (let i=0;i<n;i++) {
      const f=event.hz+((event.endHz??event.hz)-event.hz)*i/(n-1);
      let signal=0;
      for (let k=0;k<phases.length;k++) {
        phases[k]+=TAU*f*v.partials[k][0]/SR;
        if (phases[k]>TAU) phases[k]-=TAU;
        signal+=sine(phases[k])*v.partials[k][1]*envelopes[k];
        envelopes[k]*=factors[k];
      }
      state^=state<<13; state^=state>>>17; state^=state<<5;
      noiseLow+=0.08*((state>>>0)/2147483648-1-noiseLow);
      noiseEnv*=1-1/(0.012*SR);
      signal+=v.noise*noiseLow*noiseEnv;
      const envelope=smooth(i/attack)*smooth((n-1-i)/release);
      signal*=envelope*event.gain;
      for (const [delay,gain] of taps) {
        let target=start+i+Math.round(delay*SR);
        if (music) target%=length;
        if (target>=length) continue;
        for (let c=0;c<channels;c++) out[c][target]+=signal*gain*gains[c];
      }
    }
  }
  // A DC blocker with exact circular steady state for music preserves the seam.
  // A nonperiodic cue ends in a smooth 10 ms fade after filtering.
  const pole=0.9993457156679053;
  for (const ch of out) {
    let x1=music ? ch[length-1] : 0, y1=0;
    const passes=music ? 2 : 1;
    for (let pass=0;pass<passes;pass++) {
      for (let i=0;i<length;i++) {
        const x=ch[i], y=x-x1+pole*y1;
        x1=x; y1=y;
        // First music pass warms filter state; exp(-2260) leaves no residual.
        if (pass===passes-1) ch[i]=y;
      }
    }
    if (!music) for (let i=0;i<480;i++) {
      ch[i]*=smooth(i/479); ch[length-1-i]*=smooth(i/479);
    }
    if (!music) {
      // Remove the tiny residual mean left by the final fade, while preserving
      // the zero endpoints and their slopes (a plain mean subtraction would click).
      let sum=0,weight=0;
      for(let i=0;i<length;i++) {sum+=ch[i];weight+=smooth(i/479)*smooth((length-1-i)/479);}
      const correction=sum/weight;
      for(let i=0;i<length;i++) ch[i]-=correction*smooth(i/479)*smooth((length-1-i)/479);
    }
  }
  return out;
}
export function scale(channels, gain) {
  for (const ch of channels) for (let i=0;i<ch.length;i++) ch[i]*=gain;
}
export function peak(channels) {
  let p=0; for (const ch of channels) for (const x of ch) p=Math.max(p,Math.abs(x)); return p;
}
export function wav(channels) {
  const n=channels[0].length, count=channels.length, bytes=n*count*2;
  const b=Buffer.alloc(44+bytes);
  b.write('RIFF'); b.writeUInt32LE(bytes+36,4); b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(count,22);
  b.writeUInt32LE(SR,24); b.writeUInt32LE(SR*count*2,28);
  b.writeUInt16LE(count*2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(bytes,40);
  for (let i=0;i<n;i++) for (let c=0;c<count;c++) {
    const value=Math.round(channels[c][i]*32768);
    if (value<-32768||value>32767) throw new Error('PCM overflow');
    b.writeInt16LE(value,44+(i*count+c)*2);
  }
  return b;
}
export function decode(b) {
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.readUInt16LE(20)!==1||b.readUInt32LE(24)!==SR||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data') throw new Error('Unexpected master format');
  const count=b.readUInt16LE(22), n=b.readUInt32LE(40)/(2*count);
  const channels=Array.from({length:count},()=>new Float64Array(n));
  for(let i=0;i<n;i++) for(let c=0;c<count;c++) channels[c][i]=b.readInt16LE(44+(i*count+c)*2)/32768;
  return channels;
}
export function sha(b) { return createHash('sha256').update(b).digest('hex'); }

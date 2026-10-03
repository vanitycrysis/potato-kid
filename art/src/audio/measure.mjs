// Measurements use the quantized delivered WAV, never the unquantized synth bus.
import { SR } from './synth.mjs';
export const db=(x)=>x>0 ? 20*Math.log10(x) : -150;
const lk=(energy)=>energy>0 ? -0.691+10*Math.log10(energy) : -150;
function biquad(input,b,a) {
  const out=new Float64Array(input.length); let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<input.length;i++) {
    const x=input[i], y=b[0]*x+b[1]*x1+b[2]*x2-a[0]*y1-a[1]*y2;
    out[i]=y; x2=x1;x1=x;y2=y1;y1=y;
  }
  return out;
}
// ITU-R BS.1770-5 Annex 1, Tables 1/2; stereo weights 1,1, no LFE.
// Not certified against BS.2217; short cues use whole-file ungated K estimate.
export function loudness(channels) {
  const n=channels[0].length, prefix=new Float64Array(n+1);
  for(const ch of channels) {
    const k=biquad(biquad(ch,[1.53512485958697,-2.69169618940638,1.19839281085285],[-1.69065929318241,0.73248077421585]),[1,-2,1],[-1.99004745483398,0.99007225036621]);
    let sum=0; for(let i=0;i<n;i++) {sum+=k[i]*k[i];prefix[i+1]+=sum;}
  }
  const ungated=lk(prefix[n]/n), block=Math.round(SR*0.4), hop=Math.round(SR*0.1), blocks=[];
  for(let i=0;i+block<=n;i+=hop) blocks.push((prefix[i+block]-prefix[i])/block);
  if(!blocks.length) return {value:ungated,ungated,method:'short-file ungated K-weighted estimate; no 400 ms block'};
  const absolute=blocks.filter(e=>lk(e)>-70);
  const relative=lk(absolute.reduce((a,b)=>a+b,0)/absolute.length)-10;
  const gated=absolute.filter(e=>lk(e)>relative);
  return {value:lk(gated.reduce((a,b)=>a+b,0)/gated.length),ungated,method:'BS.1770-style integrated; 400 ms/100 ms hop; -70 LUFS and -10 LU gates; uncertified',blocks:blocks.length,acceptedBlocks:gated.length};
}
export function spectrum(input,start,n=2048,wrap=false) {
  const re=new Float64Array(n), im=new Float64Array(n);
  for(let i=0;i<n;i++) {
    let ix=start+i;
    if(wrap) ix=((ix%input.length)+input.length)%input.length;
    re[i]=(input[ix]??0)*(0.5-0.5*Math.cos(2*Math.PI*i/(n-1)));
  }
  for(let i=1,j=0;i<n;i++) {
    let bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit;
    if(i<j) {[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}
  }
  for(let size=2;size<=n;size<<=1) {
    const angle=-2*Math.PI/size, wr=Math.cos(angle),wi=Math.sin(angle);
    for(let start=0;start<n;start+=size) {
      let ar=1,ai=0;
      for(let j=0;j<size/2;j++) {
        const even=start+j,odd=even+size/2, tr=ar*re[odd]-ai*im[odd],ti=ar*im[odd]+ai*re[odd];
        re[odd]=re[even]-tr;im[odd]=im[even]-ti;re[even]+=tr;im[even]+=ti;
        const next=ar*wr-ai*wi;ai=ar*wi+ai*wr;ar=next;
      }
    }
  }
  const power=new Float64Array(n/2+1);
  for(let i=0;i<power.length;i++) power[i]=re[i]*re[i]+im[i]*im[i];
  return power;
}
function spectralSummary(channels) {
  let weighted=0,total=0; const n=2048,hop=512;
  for(const ch of channels) for(let start=-n/2;start<ch.length;start+=hop) {
    const power=spectrum(ch,start,n);
    for(let k=1;k<power.length;k++) {total+=power[k];weighted+=power[k]*k*SR/n;}
  }
  return weighted/total;
}
function windowRms(ch,start,count) {
  let sum=0;for(let i=start;i<start+count;i++) sum+=ch[i]*ch[i];return Math.sqrt(sum/count);
}
export function measure(channels,loop=false) {
  const n=channels[0].length;
  const perChannel=channels.map(ch=>{
    let sum=0,squares=0,peak=0,maxSlope=0;
    for(let i=0;i<n;i++) {const x=ch[i];sum+=x;squares+=x*x;peak=Math.max(peak,Math.abs(x));if(i) maxSlope=Math.max(maxSlope,Math.abs(x-ch[i-1]));}
    return {peakDbfs:db(peak),rmsDbfs:db(Math.sqrt(squares/n)),dc:sum/n,dcDbfs:db(Math.abs(sum/n)),
      firstSamples:Array.from(ch.slice(0,4),x=>x*32768),lastSamples:Array.from(ch.slice(-4),x=>x*32768),
      firstSlopeLsb:(ch[1]-ch[0])*32768,lastSlopeLsb:(ch[n-1]-ch[n-2])*32768,maxSlopeLsb:maxSlope*32768};
  });
  const result={samples:n,duration:n/SR,channels:channels.length,sampleRate:SR,bits:16,
    peakDbfs:Math.max(...perChannel.map(ch=>ch.peakDbfs)),
    rmsDbfs:10*Math.log10(perChannel.reduce((sum,c)=>sum+10**(c.rmsDbfs/10),0)/channels.length),
    loudness:loudness(channels),spectralCentroidHz:spectralSummary(channels),perChannel};
  if(loop) result.seam=channels.map(ch=>{
    const before=spectrum(ch,n-4096,4096),after=spectrum(ch,0,4096);
    let dot=0,aa=0,bb=0,ca=0,cb=0,pa=0,pb=0;
    for(let k=1;k<before.length;k++) {
      dot+=before[k]*after[k];aa+=before[k]**2;bb+=after[k]**2;
      pa+=before[k];pb+=after[k];ca+=before[k]*k*SR/4096;cb+=after[k]*k*SR/4096;
    }
    let localMax=0;
    for(let i=n-480;i<n-1;i++) localMax=Math.max(localMax,Math.abs(ch[i+1]-ch[i]));
    for(let i=0;i<479;i++) localMax=Math.max(localMax,Math.abs(ch[i+1]-ch[i]));
    const jump=ch[0]-ch[n-1], leftSlope=ch[n-1]-ch[n-2],rightSlope=ch[1]-ch[0];
    return {lastSampleLsb:ch[n-1]*32768,firstSampleLsb:ch[0]*32768,jumpLsb:jump*32768,
      beforeSlopeLsb:leftSlope*32768,afterSlopeLsb:rightSlope*32768,
      slopeChangeBeforeLsb:(jump-leftSlope)*32768,slopeChangeAfterLsb:(rightSlope-jump)*32768,
      localMaxSlopeLsb:localMax*32768,jumpToLocalMaxSlope:Math.abs(jump)/localMax,
      rmsBefore20msDbfs:db(windowRms(ch,n-960,960)),rmsAfter20msDbfs:db(windowRms(ch,0,960)),
      levelChange20msDb:db(windowRms(ch,0,960))-db(windowRms(ch,n-960,960)),
      spectralCosine85ms:dot/Math.sqrt(aa*bb),centroidBefore85msHz:ca/pa,centroidAfter85msHz:cb/pb};
  });
  return result;
}

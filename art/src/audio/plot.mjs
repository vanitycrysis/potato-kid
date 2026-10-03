// Original tiny raster plotter: Node builtins only, including PNG encoder.
import { deflateSync } from 'node:zlib';
import { spectrum, db } from './measure.mjs';
import { SR } from './synth.mjs';
const glyphs={
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
  '-':['00000','00000','00000','11111','00000','00000','00000'],'.':['00000','00000','00000','00000','00000','00110','00110'],
  ':':['00000','00110','00110','00000','00110','00110','00000'],'_':['00000','00000','00000','00000','00000','00000','11111'],
  '/':['00001','00001','00010','00100','01000','10000','10000'],'+':['00000','00100','00100','11111','00100','00100','00000'],
};
const ink=[47,53,49], bg=[249,246,235];
function crc(b) {let c=0xffffffff;for(const x of b) {c^=x;for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,b) {const out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);out.write(type,4);b.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,b.length+8)),b.length+8);return out;}
export class Plot {
  constructor(width,height) {this.w=width;this.h=height;this.p=Buffer.alloc(width*height*3);this.rect(0,0,width,height,bg);}
  pixel(x,y,c) {x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=this.w||y>=this.h)return;const ix=(y*this.w+x)*3;for(let k=0;k<3;k++)this.p[ix+k]=c[k];}
  rect(x,y,w,h,c) {for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)this.pixel(i,j,c);}
  line(x0,y0,x1,y1,c) {const steps=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)));for(let i=0;i<=steps;i++)this.pixel(x0+(x1-x0)*i/(steps||1),y0+(y1-y0)*i/(steps||1),c);}
  text(x,y,s,scale=1,c=ink) {for(const letter of s.toUpperCase()) {const g=glyphs[letter];if(g)for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(g[j][i]==='1')this.rect(x+i*scale,y+j*scale,scale,scale,c);x+=6*scale;}}
  png() {const raw=Buffer.alloc((this.w*3+1)*this.h);for(let y=0;y<this.h;y++)this.p.copy(raw,y*(this.w*3+1)+1,y*this.w*3,(y+1)*this.w*3);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(this.w);ihdr.writeUInt32BE(this.h,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
}
function waveform(plot,channels,x,y,w,h) {
  for(const [c,ch] of channels.entries()) {
    const height=h/channels.length, center=y+height*(c+0.5);
    plot.line(x,center,x+w,center,[184,184,173]);
    plot.text(x+3,y+c*height+3,channels.length===1?'MONO':c===0?'L':'R');
    for(let col=0;col<w;col++) {
      const first=Math.floor(col*ch.length/w),end=Math.max(first+1,Math.floor((col+1)*ch.length/w));
      let lo=0,hi=0;for(let i=first;i<end;i++) {lo=Math.min(lo,ch[i]);hi=Math.max(hi,ch[i]);}
      plot.line(x+col,center-hi*height*0.46,x+col,center-lo*height*0.46,c===0?[68,105,84]:[122,104,58]);
    }
  }
}
function spectrogram(plot,channels,x,y,w,h) {
  const n=2048,colors=[[20,31,43],[40,72,83],[75,126,111],[175,176,107],[251,221,147]];
  for(let col=0;col<w;col++) {
    const start=Math.floor(col*channels[0].length/w)-n/2, power=new Float64Array(n/2+1);
    for(const ch of channels) {const p=spectrum(ch,start,n);for(let k=0;k<p.length;k++)power[k]+=p[k]/channels.length;}
    for(let row=0;row<h;row++) {
      const f=80*(100**(1-row/(h-1))),k=f*n/SR,bin=Math.floor(k);
      const p=power[bin]*(1-(k-bin))+power[bin+1]*(k-bin);
      const level=db(2*Math.sqrt(p)/(n*0.5)); // Hann coherent-gain correction.
      const a=Math.max(0,Math.min(3.999,(level+90)/90*4)),i=Math.floor(a),mix=a-i;
      plot.pixel(x+col,y+row,colors[i].map((v,j)=>Math.round(v+(colors[i+1][j]-v)*mix)));
    }
  }
}
export function reviewPanel(plot,channels,metric,id,x,y,w,h,compact=false) {
  plot.text(x+8,y+7,id,compact?1:2);
  plot.text(x+8,y+(compact?23:32),`${metric.duration.toFixed(3)} S  PEAK ${metric.peakDbfs.toFixed(1)} DBFS  CENTROID ${Math.round(metric.spectralCentroidHz)} HZ`);
  const left=x+(compact?32:64),width=w-(compact?44:80),waveY=y+(compact?41:57),waveH=compact?58:104;
  waveform(plot,channels,left,waveY,width,waveH);
  plot.text(x+4,waveY+waveH/2,'0');
  const specY=waveY+waveH+24,specH=compact?88:146;
  spectrogram(plot,channels,left,specY,width,specH);
  plot.text(x+3,specY,'8K');plot.text(x+3,specY+specH/2,'800');plot.text(x+3,specY+specH-7,'80HZ');
  plot.text(left,specY+specH+8,'0 S');plot.text(left+width-65,specY+specH+8,`${metric.duration.toFixed(2)} S`);
  if(!compact) plot.text(left,specY+specH+25,'LOG FREQUENCY 80-8000 HZ / HANN 2048 / COLORS -90 TO 0 DBFS');
}
export function seamPlot(channels) {
  const p=new Plot(900,340);p.text(20,15,'MUSIC_GARDEN - CONTINUOUS SEAM +/- 10 MS',2);
  for(const [c,ch] of channels.entries()) {
    const y=80+c*115,h=90,center=y+h/2,x=60,w=810;
    p.line(x,center,x+w,center,[180,180,165]);p.text(15,center,c===0?'L':'R');
    p.line(x+w/2,y,x+w/2,y+h,[172,100,64]);
    for(let i=0;i<959;i++) {
      const a=ch[(ch.length-480+i)%ch.length],b=ch[(ch.length-480+i+1)%ch.length];
      p.line(x+i*w/960,center-a*250,x+(i+1)*w/960,center-b*250,[68,105,84]);
    }
  }
  p.text(60,315,'-10 MS');p.text(447,315,'0');p.text(810,315,'+10 MS');return p.png();
}

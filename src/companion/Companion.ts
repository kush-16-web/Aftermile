import { damp } from '../core/math.ts';
export class Companion {
  context:CanvasRenderingContext2D;x=46;y=36;mood='curious';timer=0;messageTimer=0;
  constructor(public canvas:HTMLCanvasElement) {canvas.width=176;canvas.height=128;this.context=canvas.getContext('2d')!;}
  update(dt:number,time:number,danger:number,fuel:number,weather:string,clean:number,reduced:boolean) {
    this.mood=danger>.2?'alert':fuel<18?'concerned':clean>1000?'content':weather==='storm'||weather==='snow'?'watchful':'curious';
    const ctx=this.context;ctx.clearRect(0,0,176,128);ctx.save();ctx.scale(2,2);
    const crawl=reduced?0:Math.sin(time*.24)*12;
    this.x=damp(this.x,44+crawl,2,dt);this.y=damp(this.y,30+(reduced?0:Math.sin(time*.48)*7),2,dt);
    const alert=danger>.2,color=alert?'#f1727c':'#81bdc3';
    ctx.strokeStyle='rgba(138,171,182,.2)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(44,0);ctx.lineTo(this.x,this.y-5);ctx.stroke();
    ctx.translate(this.x,this.y);ctx.rotate(reduced?0:Math.sin(time*.4)*.12);
    ctx.lineCap='round';ctx.strokeStyle=color;ctx.lineWidth=1.4;
    for(const side of [-1,1])for(let i=0;i<4;i++) {
      const phase=reduced?0:Math.sin(time*(alert?9:3)+i*1.4+side)*1.7;
      ctx.beginPath();ctx.moveTo(side*3,(i-1.5)*2.3);ctx.lineTo(side*(9+Math.abs(i-1.5)),(i-1.5)*5+phase);ctx.lineTo(side*(13+Math.abs(i-1.5)),(i-1.5)*7+phase+3);ctx.stroke();
    }
    ctx.fillStyle='#aa354c';ctx.beginPath();ctx.ellipse(0,-2,4.5,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#354853';ctx.beginPath();ctx.ellipse(0,4,4,3.7,0,0,Math.PI*2);ctx.fill();
    if(reduced||time%5<4.8){ctx.fillStyle=alert?'#ffc4c4':'#cbf7f4';ctx.beginPath();ctx.arc(-1.65,5,1.05,0,7);ctx.arc(1.65,5,1.05,0,7);ctx.fill();}
    if(alert){ctx.globalAlpha=danger;ctx.strokeStyle=color;ctx.lineWidth=.8;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,18+i*4,Math.PI*1.1,Math.PI*1.9);ctx.stroke();}}
    ctx.restore();
  }
}

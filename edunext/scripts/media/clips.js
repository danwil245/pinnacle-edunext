// Clip definitions + the canvas animations used to generate them. Shared by
// generate.mjs. Durations are read from @edunext/shared CONFIG at generate time.
// On-brand dark palette; smooth (flicker-free) motion; no text/logos; calm,
// similar average brightness. Topic slugs match the seeded courses + interest
// picker (web-development, data-science, design).

export const PALETTE = {
  bg: '#070b16',
  navy: '#0b2545',
  sky: '#0ea5e9',
  sky2: '#38bdf8',
  indigo: '#6366f1',
  indigo2: '#818cf8',
  emerald: '#34d399',
  amber: '#f59e0b',
  slate: '#1e293b',
};

// Each entry: file, role, topic|variant, label, and `anim` = the body of a
// draw(ctx, t, W, H) function (t = seconds, W/H = 1280/720). Kept as strings so
// generate.mjs can inject them into a headless page.
export const CLIPS = [
  {
    file: 'neutral.mp4',
    role: 'neutral',
    label: 'A general overview',
    durationKey: 'CALIBRATION_CLIP_S',
    anim: `
      // Calm, low-contrast drifting glow — lowest stimulus of all clips.
      const g = ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,'#070b16'); g.addColorStop(1,'#0a1120'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      for (let i=0;i<3;i++){
        const px = W*(0.5+0.18*Math.sin(t*0.06+i*2.1));
        const py = H*(0.5+0.14*Math.cos(t*0.05+i*1.7));
        const r = 360 + 60*Math.sin(t*0.07+i);
        const rg = ctx.createRadialGradient(px,py,0,px,py,r);
        const a = 0.05 + 0.02*Math.sin(t*0.08+i);
        rg.addColorStop(0,'rgba(37,99,235,'+a+')'); rg.addColorStop(1,'rgba(7,11,22,0)');
        ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
      }
    `,
  },
  {
    file: 'web-dev-interest.mp4',
    role: 'interest',
    topic: 'web-development',
    label: 'Building for the web',
    durationKey: 'CALIBRATION_CLIP_S',
    anim: `
      ctx.fillStyle='#070b16'; ctx.fillRect(0,0,W,H);
      // Abstract "code blocks" assembling into a page layout — syntax colours,
      // rounded bars, gentle breathing. No readable text.
      const cols=['#38bdf8','#818cf8','#34d399','#f59e0b','#0ea5e9'];
      const left=W*0.14, top=H*0.16, lh=46, pad=14;
      for(let row=0;row<11;row++){
        const appear=Math.min(1,Math.max(0,(t*1.3 - row*0.35)));
        const ease=appear<1?1-Math.pow(1-appear,3):1;
        const indent=left + (row%4)*34;
        const widthBase=(W*0.42)*(0.4+0.6*((row*37)%10)/10);
        const w=widthBase*ease;
        const y=top+row*lh;
        ctx.globalAlpha=0.18+0.5*ease;
        ctx.fillStyle=cols[row%cols.length];
        const bob=2*Math.sin(t*0.9+row);
        rr(ctx,indent, y+bob, Math.max(8,w), 18, 9); ctx.fill();
        // a couple of short "tokens" after the bar
        ctx.globalAlpha=0.12+0.3*ease;
        ctx.fillStyle=cols[(row+2)%cols.length];
        rr(ctx,indent+w+pad, y+bob, 60*ease, 18, 9); ctx.fill();
      }
      // right-side preview panel building up
      ctx.globalAlpha=0.08; ctx.fillStyle='#38bdf8';
      rr(ctx,W*0.62,top, W*0.24, (H*0.6)*Math.min(1,t*0.4), 16); ctx.fill();
      ctx.globalAlpha=1;
    `,
  },
  {
    file: 'data-science-interest.mp4',
    role: 'interest',
    topic: 'data-science',
    label: 'Thinking with data',
    durationKey: 'CALIBRATION_CLIP_S',
    anim: `
      ctx.fillStyle='#070b16'; ctx.fillRect(0,0,W,H);
      const bx=W*0.12, by=H*0.78, bw=W*0.44, bh=H*0.5;
      // animated bars drawing up
      const n=7;
      for(let i=0;i<n;i++){
        const target=0.3+0.6*((Math.sin(i*1.3)+1)/2);
        const grow=Math.min(1,Math.max(0,t*0.5 - i*0.12));
        const h=bh*target*grow;
        const x=bx + i*(bw/n);
        const grd=ctx.createLinearGradient(x,by,x,by-h);
        grd.addColorStop(0,'#0ea5e9'); grd.addColorStop(1,'#818cf8');
        ctx.fillStyle=grd; ctx.globalAlpha=0.85;
        rr(ctx,x, by-h, bw/n-14, h, 6); ctx.fill();
      }
      ctx.globalAlpha=1;
      // a smooth line + scatter on the right
      const lx=W*0.6, lw=W*0.3, ly=H*0.3, lhh=H*0.34;
      ctx.beginPath(); ctx.lineWidth=4; ctx.strokeStyle='#34d399';
      const prog=Math.min(1,t*0.3);
      for(let p=0;p<=60*prog;p++){
        const fx=lx + (p/60)*lw;
        const fy=ly + lhh*(0.5 + 0.4*Math.sin(p*0.18 + t*0.4));
        if(p===0)ctx.moveTo(fx,fy); else ctx.lineTo(fx,fy);
      }
      ctx.stroke();
      for(let s=0;s<14;s++){
        const sx=lx + ((s*53)%100)/100*lw;
        const sy=ly + ((s*31)%100)/100*lhh + lhh*0.5;
        const pop=Math.min(1,Math.max(0,t*0.4 - s*0.15));
        ctx.globalAlpha=0.6*pop; ctx.fillStyle='#38bdf8';
        ctx.beginPath(); ctx.arc(sx,sy,5*pop,0,7); ctx.fill();
      }
      ctx.globalAlpha=1;
    `,
  },
  {
    file: 'design-interest.mp4',
    role: 'interest',
    topic: 'design',
    label: 'The craft of design',
    durationKey: 'CALIBRATION_CLIP_S',
    anim: `
      ctx.fillStyle='#070b16'; ctx.fillRect(0,0,W,H);
      // flowing translucent colour blobs morphing + slow drift (palette feel)
      const cols=['#38bdf8','#818cf8','#34d399','#f59e0b','#0ea5e9','#6366f1'];
      for(let i=0;i<6;i++){
        const px=W*(0.5+0.3*Math.sin(t*0.2+i*1.05));
        const py=H*(0.5+0.28*Math.cos(t*0.17+i*0.9));
        const r=160+50*Math.sin(t*0.3+i);
        const rg=ctx.createRadialGradient(px,py,0,px,py,r);
        rg.addColorStop(0, hexA(cols[i],0.30)); rg.addColorStop(1, hexA(cols[i],0));
        ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(px,py,r,0,7); ctx.fill();
      }
      // a row of palette swatches easing in along the bottom
      const sw=90, gap=22, startX=(W-(6*sw+5*gap))/2, y=H*0.76;
      for(let i=0;i<6;i++){
        const ap=Math.min(1,Math.max(0,t*0.7 - i*0.2));
        ctx.globalAlpha=0.9*ap; ctx.fillStyle=cols[i];
        rr(ctx,startX+i*(sw+gap), y+(1-ap)*20, sw, 90, 16); ctx.fill();
      }
      ctx.globalAlpha=1;
    `,
  },
  {
    file: 'probe-visual.mp4',
    role: 'probe',
    variant: 'visual',
    label: 'Explained visually',
    durationKey: 'STYLE_PROBE_CLIP_S',
    anim: `
      ctx.fillStyle='#070b16'; ctx.fillRect(0,0,W,H);
      // "How a plant grows" as a smooth animated diagram (no text).
      const cx=W*0.5, ground=H*0.82;
      // soft sun
      const sunx=W*0.78, suny=H*0.22, sr=70+6*Math.sin(t*0.8);
      const sg=ctx.createRadialGradient(sunx,suny,0,sunx,suny,sr*2.4);
      sg.addColorStop(0,'rgba(245,158,11,0.35)'); sg.addColorStop(1,'rgba(245,158,11,0)');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sunx,suny,sr*2.4,0,7); ctx.fill();
      ctx.fillStyle='rgba(245,158,11,0.55)'; ctx.beginPath(); ctx.arc(sunx,suny,sr,0,7); ctx.fill();
      // stem grows
      const grow=Math.min(1,t/14);
      const stemTop=ground - (H*0.5)*grow;
      ctx.strokeStyle='#34d399'; ctx.lineWidth=10; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(cx,ground);
      for(let s=0;s<=20;s++){ const f=s/20; const y=ground+(stemTop-ground)*f; const x=cx+Math.sin(f*3+t*0.3)*14*f; ctx.lineTo(x,y);} ctx.stroke();
      // leaves sprout at stages
      for(let k=0;k<4;k++){
        const stage=Math.min(1,Math.max(0,(grow*4 - k)));
        if(stage<=0) continue;
        const ly=ground - (H*0.5)*grow*((k+1)/5);
        const side=k%2?1:-1;
        ctx.fillStyle='rgba(52,211,153,'+(0.5+0.4*stage)+')';
        ctx.beginPath(); ctx.ellipse(cx+side*50*stage, ly, 46*stage, 22*stage, side*0.6, 0, 7); ctx.fill();
      }
      // ground line
      ctx.fillStyle='rgba(99,102,241,0.18)'; rr(ctx,0,ground,W,H-ground,0); ctx.fill();
    `,
  },
  {
    file: 'probe-practical.mp4',
    role: 'probe',
    variant: 'practical',
    label: 'Learned by doing',
    durationKey: 'STYLE_PROBE_CLIP_S',
    anim: `
      ctx.fillStyle='#070b16'; ctx.fillRect(0,0,W,H);
      // Same topic, "hands-on": a cursor carries out steps on a stylized bench.
      const ground=H*0.72;
      ctx.fillStyle='#0b1324'; rr(ctx,W*0.1,ground,W*0.8,H*0.16,18); ctx.fill(); // bench
      // three slots: seed -> water -> sprout, completed one by one
      const slots=[{x:W*0.28,c:'#f59e0b'},{x:W*0.5,c:'#38bdf8'},{x:W*0.72,c:'#34d399'}];
      for(let i=0;i<slots.length;i++){
        const done=Math.min(1,Math.max(0,(t - 1 - i*5)/3));
        ctx.globalAlpha=0.25+0.6*done; ctx.fillStyle=slots[i].c;
        const r=28+22*done;
        ctx.beginPath(); ctx.arc(slots[i].x, ground-10-40*done, r, 0, 7); ctx.fill();
        // a little "pot" under each
        ctx.globalAlpha=0.5; ctx.fillStyle='#1e293b';
        rr(ctx,slots[i].x-40, ground-6, 80, 30, 8); ctx.fill();
      }
      ctx.globalAlpha=1;
      // moving cursor/pointer visiting each slot in turn
      const seg=5, idx=Math.min(2,Math.floor(t/seg)), frac=(t%seg)/seg;
      const from = idx===0?{x:W*0.14,y:H*0.3}:slots[idx-1];
      const to = slots[idx];
      const cxp=from.x+(to.x-from.x)*ease3(frac);
      const cyp=(from.y||ground-70)+((ground-70)-(from.y||ground-70))*ease3(frac);
      ctx.fillStyle='#e2e8f0'; ctx.beginPath();
      ctx.moveTo(cxp,cyp); ctx.lineTo(cxp,cyp+26); ctx.lineTo(cxp+7,cyp+19); ctx.lineTo(cxp+16,cyp+30); ctx.lineTo(cxp+20,cyp+27); ctx.lineTo(cxp+11,cyp+16); ctx.lineTo(cxp+20,cyp+14); ctx.closePath(); ctx.fill();
    `,
  },
];

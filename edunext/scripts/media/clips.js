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
      // Deterministic, smooth helpers (no per-frame randomness => no flicker). No text.
      const R=(i)=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
      const sm=(x)=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x);};
      const cols=['#38bdf8','#818cf8','#34d399','#f59e0b','#fb7185','#22d3ee'];
      // Moving gradient background (subtle, continuously shifting).
      const bg=ctx.createLinearGradient(0,0,W,H);
      bg.addColorStop(0,'#0c1529'); bg.addColorStop(1,'#0a1120'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
      const gx=W*(0.35+0.22*Math.sin(t*0.1)), gy=H*(0.45+0.2*Math.cos(t*0.08));
      const gg=ctx.createRadialGradient(gx,gy,0,gx,gy,540);
      gg.addColorStop(0,'rgba(56,189,248,0.12)'); gg.addColorStop(1,'rgba(10,17,32,0)');
      ctx.fillStyle=gg; ctx.fillRect(0,0,W,H);

      // LEFT: code editor — lines type in and the file continuously scrolls up.
      const padL=W*0.075, edW=W*0.40, edTop=H*0.11, edH=H*0.78, lh=40;
      ctx.fillStyle='rgba(3,8,20,0.62)'; rr(ctx,padL-22,edTop-18,edW+44,edH+36,16); ctx.fill();
      for(let d=0;d<3;d++){ctx.fillStyle=['#fb7185','#f59e0b','#34d399'][d]; ctx.beginPath(); ctx.arc(padL-4+d*16,edTop-2,5,0,7); ctx.fill();}
      const cur=t*1.0+9;                 // fractional current global line
      const scroll=Math.max(0,cur-9)*lh; // keep the caret in view
      ctx.save(); ctx.beginPath(); rr(ctx,padL-8,edTop+12,edW+16,edH-16,10); ctx.clip();
      for(let k=0;k<=Math.floor(cur)+1;k++){
        const y=edTop+26+k*lh-scroll;
        if(y<edTop||y>edTop+edH) continue;
        const x=padL+Math.floor(R(k)*4)*24;
        const segs=1+Math.floor(R(k*3.1)*4);
        let typed=1; if(k===Math.floor(cur)) typed=cur-Math.floor(cur);
        let cx=x;
        for(let s=0;s<segs;s++){
          const w=26+R(k*7.3+s*2.1)*120;
          const st=Math.max(0,Math.min(1,typed*segs-s));
          if(st<=0) break;
          ctx.globalAlpha=0.6; ctx.fillStyle=cols[(k+s)%cols.length];
          rr(ctx,cx,y,Math.max(4,w*st),15,7); ctx.fill();
          cx+=w*st+9; if(st<1) break;
        }
        if(k===Math.floor(cur)){ctx.globalAlpha=0.9; ctx.fillStyle='#e2e8f0'; ctx.fillRect(cx+2,y-3,3,20);}
      }
      ctx.restore(); ctx.globalAlpha=1;

      // RIGHT: a live browser preview that builds in sync, then stays alive.
      const pX=W*0.55, pY=H*0.12, pW=W*0.38, pH=H*0.76;
      ctx.fillStyle='rgba(15,23,42,0.80)'; rr(ctx,pX,pY,pW,pH,16); ctx.fill();
      ctx.fillStyle='#1e293b'; rr(ctx,pX,pY,pW,34,16); ctx.fill(); ctx.fillRect(pX,pY+20,pW,14);
      for(let d=0;d<3;d++){ctx.fillStyle='#475569'; ctx.beginPath(); ctx.arc(pX+20+d*16,pY+17,5,0,7); ctx.fill();}
      const navP=sm(Math.min(1,t*0.7));
      ctx.save(); ctx.globalAlpha=navP;
      ctx.fillStyle='#172033'; rr(ctx,pX+14,pY+44-(1-navP)*18,pW-28,28,8); ctx.fill();
      ctx.fillStyle='#38bdf8'; rr(ctx,pX+24,pY+51-(1-navP)*18,64,12,6); ctx.fill();
      for(let n=0;n<3;n++){ctx.fillStyle='#64748b'; rr(ctx,pX+pW-150+n*42,pY+52-(1-navP)*18,32,10,5); ctx.fill();}
      ctx.restore();
      const heroP=sm(Math.min(1,(t-1.1)*0.6));
      ctx.save(); ctx.globalAlpha=heroP*0.82;
      const hg=ctx.createLinearGradient(pX,pY+84,pX+pW,pY+184); hg.addColorStop(0,'#0ea5e9'); hg.addColorStop(1,'#6366f1');
      ctx.fillStyle=hg; rr(ctx,pX+14,pY+84,pW-28,100,12); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.85)'; rr(ctx,pX+30,pY+110,(pW-28)*0.45,13,6); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)'; rr(ctx,pX+30,pY+132,(pW-28)*0.6,9,5); ctx.fill();
      const bx=pX+30,by=pY+152,bw=94,bh=22;
      ctx.fillStyle='#38bdf8'; rr(ctx,bx,by,bw,bh,8); ctx.fill();
      ctx.save(); rr(ctx,bx,by,bw,bh,8); ctx.clip();
      const sgx=bx+((t*0.35)%1.4-0.2)*bw;
      const sgr=ctx.createLinearGradient(sgx-26,0,sgx+26,0); sgr.addColorStop(0,'rgba(255,255,255,0)'); sgr.addColorStop(0.5,'rgba(255,255,255,0.5)'); sgr.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sgr; ctx.fillRect(bx,by,bw,bh); ctx.restore();
      ctx.restore();
      // Cards appear one by one; colours cycle and a highlight travels (continuous life).
      const gTop=pY+200, gw=(pW-28-2*12)/3, gh=(pH-210-12)/2;
      const hot=(t*0.5)%6;
      for(let c=0;c<6;c++){
        const appear=sm(Math.min(1,(t-2.3-c*0.35)*0.9));
        if(appear<=0) continue;
        const col=c%3, row=Math.floor(c/3);
        const x=pX+14+col*(gw+12);
        const y=gTop+row*(gh+12)+(1-appear)*14+3*Math.sin(t*0.9+c);
        const ci=(c+Math.floor(t*0.25))%cols.length, ni=(ci+1)%cols.length;
        ctx.globalAlpha=0.52*appear; ctx.fillStyle=cols[ci]; rr(ctx,x,y,gw,gh,10); ctx.fill();
        ctx.globalAlpha=0.72*appear; ctx.fillStyle=cols[ni]; rr(ctx,x,y,gw,10,6); ctx.fill();
        const near=1-Math.min(1,Math.abs(((hot-c+6)%6))*0.85);
        if(near>0.02){ ctx.globalAlpha=0.55*near*appear; ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=2; rr(ctx,x-2,y-2,gw+4,gh+4,12); ctx.stroke(); }
      }
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
      // Smooth deterministic data that changes every few seconds (lerp between
      // batches => no flicker, always evolving). No text.
      const R=(i)=>{const x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
      const sm=(x)=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x);};
      const lp=(a,b,u)=>a+(b-a)*u;
      const P=3.5, batch=Math.floor(t/P), fr=sm((t/P)-batch);
      const data=(i)=>lp(R(batch*31+i), R((batch+1)*31+i), fr);
      ctx.fillStyle='#0a1324'; ctx.fillRect(0,0,W,H);
      const gx=W*(0.5+0.25*Math.sin(t*0.08));
      const gg=ctx.createRadialGradient(gx,H*0.3,0,gx,H*0.3,640); gg.addColorStop(0,'rgba(14,165,233,0.09)'); gg.addColorStop(1,'rgba(10,19,36,0)');
      ctx.fillStyle=gg; ctx.fillRect(0,0,W,H);
      const panel=(x,y,w,h)=>{ctx.fillStyle='rgba(15,23,42,0.5)'; rr(ctx,x,y,w,h,14); ctx.fill();};

      // Bars (top-left) — animate up/down as data changes.
      const q1x=W*0.06,q1y=H*0.09,q1w=W*0.42,q1h=H*0.37; panel(q1x,q1y,q1w,q1h);
      const nb=8, bwid=(q1w-40)/nb;
      for(let i=0;i<nb;i++){ const v=0.12+0.82*data(i); const bh=(q1h-46)*v; const x=q1x+20+i*bwid;
        const g=ctx.createLinearGradient(x,q1y+q1h-18,x,q1y+q1h-18-bh); g.addColorStop(0,'#0ea5e9'); g.addColorStop(1,'#818cf8');
        ctx.fillStyle=g; rr(ctx,x,q1y+q1h-18-bh,bwid-9,bh,5); ctx.fill(); }

      // Line chart (top-right) — draws + updates continuously.
      const q2x=W*0.52,q2y=H*0.09,q2w=W*0.42,q2h=H*0.37; panel(q2x,q2y,q2w,q2h);
      ctx.save(); rr(ctx,q2x,q2y,q2w,q2h,14); ctx.clip();
      ctx.strokeStyle='#34d399'; ctx.lineWidth=3; ctx.beginPath();
      for(let px=0;px<=q2w;px+=5){ const u=px/q2w; const yy=q2y+q2h*0.5+(q2h*0.33)*Math.sin(u*6.2+t*1.0)*(0.55+0.45*Math.sin(u*3.1-t*0.5)); if(px===0)ctx.moveTo(q2x+px,yy); else ctx.lineTo(q2x+px,yy);}
      ctx.stroke(); ctx.lineTo(q2x+q2w,q2y+q2h); ctx.lineTo(q2x,q2y+q2h); ctx.closePath();
      ctx.fillStyle='rgba(52,211,153,0.12)'; ctx.fill(); ctx.restore();

      // Scatter (bottom-left) — points drift and clusters re-form each batch.
      const q3x=W*0.06,q3y=H*0.51,q3w=W*0.42,q3h=H*0.4; panel(q3x,q3y,q3w,q3h);
      const colr=['#38bdf8','#f59e0b','#fb7185'];
      for(let i=0;i<42;i++){ const ci=i%3;
        const cxp=lp(q3x+q3w*(0.25+0.5*R(batch*7+ci*3)), q3x+q3w*(0.25+0.5*R((batch+1)*7+ci*3)), fr);
        const cyp=lp(q3y+q3h*(0.25+0.5*R(batch*7+ci*3+1)), q3y+q3h*(0.25+0.5*R((batch+1)*7+ci*3+1)), fr);
        const rad=18+R(i*13)*42; const x=cxp+Math.cos(i*2.4)*rad*(0.5+0.5*Math.sin(t*0.5+i)); const y=cyp+Math.sin(i*2.4)*rad*(0.5+0.5*Math.cos(t*0.4+i));
        ctx.globalAlpha=0.75; ctx.fillStyle=colr[ci]; ctx.beginPath(); ctx.arc(x,y,4,0,7); ctx.fill(); }
      ctx.globalAlpha=1;

      // Donut / progress ring (bottom-right) — fills, with an inner sweeping ring.
      const q4x=W*0.52,q4y=H*0.51,q4w=W*0.42,q4h=H*0.4; panel(q4x,q4y,q4w,q4h);
      const cx=q4x+q4w*0.5, cy=q4y+q4h*0.5, r0=Math.min(q4w,q4h)*0.3;
      ctx.lineWidth=22; ctx.lineCap='round';
      ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx,cy,r0,0,7); ctx.stroke();
      const fill=0.12+0.82*data(99);
      ctx.strokeStyle='#38bdf8'; ctx.beginPath(); ctx.arc(cx,cy,r0,-Math.PI/2,-Math.PI/2+fill*2*Math.PI); ctx.stroke();
      ctx.lineWidth=8; ctx.strokeStyle='#f59e0b'; ctx.beginPath(); ctx.arc(cx,cy,r0*0.62,t*0.9,t*0.9+1.8); ctx.stroke();
      ctx.lineWidth=6; ctx.strokeStyle='#34d399'; ctx.beginPath(); ctx.arc(cx,cy,r0*0.42,-t*1.3,-t*1.3+1.2); ctx.stroke();
    `,
  },
  {
    file: 'design-interest.mp4',
    role: 'interest',
    topic: 'design',
    label: 'The craft of design',
    durationKey: 'CALIBRATION_CLIP_S',
    anim: `
      const sm=(x)=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x);};
      const lp=(a,b,u)=>a+(b-a)*u;
      const pal=['#38bdf8','#818cf8','#34d399','#f59e0b','#fb7185','#22d3ee'];
      const hx=(c)=>{const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];};
      const blend=(a,b,u)=>{const A=hx(a),B=hx(b);return 'rgb('+Math.round(lp(A[0],B[0],u))+','+Math.round(lp(A[1],B[1],u))+','+Math.round(lp(A[2],B[2],u))+')';};
      // Shifting gradient background.
      const ang=t*0.12;
      const bg=ctx.createLinearGradient(0,H*0.5-H*0.5*Math.cos(ang),W,H*0.5+H*0.5*Math.cos(ang));
      bg.addColorStop(0,'#111c33'); bg.addColorStop(1,'#0a1120'); ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
      // Drifting palette glow blobs (colours cycle).
      for(let i=0;i<5;i++){ const px=W*(0.5+0.32*Math.sin(t*0.18+i*1.2)); const py=H*(0.5+0.28*Math.cos(t*0.15+i)); const r=160+45*Math.sin(t*0.3+i);
        const col=pal[(i+Math.floor(t*0.2))%pal.length]; const rg=ctx.createRadialGradient(px,py,0,px,py,r);
        rg.addColorStop(0,hexA(col,0.18)); rg.addColorStop(1,hexA(col,0)); ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(px,py,r,0,7); ctx.fill(); }

      // Layered cards that rearrange (positions ease continuously).
      for(let i=0;i<3;i++){ const base=W*(0.3+i*0.2); const x=base+40*Math.sin(t*0.3+i*1.6); const y=H*(0.4+0.12*Math.sin(t*0.25+i*2.1));
        ctx.save(); ctx.translate(x,y); ctx.rotate(0.1*Math.sin(t*0.2+i));
        ctx.globalAlpha=0.16; ctx.fillStyle=pal[(i+2)%pal.length]; rr(ctx,-120,-80,240,160,20); ctx.fill(); ctx.restore(); }
      ctx.globalAlpha=1;

      // Centre shape morphing circle <-> square <-> blob (smooth).
      const ccx=W*0.5, ccy=H*0.42, baseR=132;
      const toSquare=(Math.sin(t*0.45)+1)/2*0.7, toBlob=(Math.sin(t*0.3+1.5)+1)/2*0.6;
      ctx.beginPath();
      for(let d=0;d<=72;d++){ const a=d/72*Math.PI*2;
        const circ=baseR;
        const sq=baseR/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));
        const blob=baseR*(1+0.20*Math.sin(a*3+t*1.1)+0.11*Math.sin(a*5-t*0.8));
        let rad=lp(circ,sq,toSquare); rad=lp(rad,blob,toBlob);
        const x=ccx+Math.cos(a)*rad, y=ccy+Math.sin(a)*rad*0.92;
        if(d===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.closePath();
      const c1=pal[Math.floor(t*0.3)%pal.length], c2=pal[(Math.floor(t*0.3)+2)%pal.length];
      const sg=ctx.createLinearGradient(ccx-baseR,ccy-baseR,ccx+baseR,ccy+baseR);
      sg.addColorStop(0,hexA(c1,0.60)); sg.addColorStop(1,hexA(c2,0.60)); ctx.fillStyle=sg; ctx.fill();

      // Pen/path being drawn — a continuous Lissajous that lengthens and recedes.
      ctx.strokeStyle='rgba(226,232,240,0.55)'; ctx.lineWidth=3; ctx.lineCap='round'; ctx.beginPath();
      const seg=220, len=Math.floor(seg*(0.5+0.5*((Math.sin(t*0.5)+1)/2)));
      let tipx=ccx,tipy=ccy;
      for(let s=0;s<=len;s++){ const u=s/seg; const px=ccx+Math.cos(u*6.283*2+t*0.3)*W*0.3; const py=ccy+Math.sin(u*6.283*3-t*0.2)*H*0.22; if(s===0)ctx.moveTo(px,py); else ctx.lineTo(px,py); tipx=px; tipy=py; }
      ctx.stroke();
      ctx.fillStyle='#e2e8f0'; ctx.beginPath(); ctx.arc(tipx,tipy,5,0,7); ctx.fill();

      // Palette swatches along the bottom, colours blending between neighbours.
      const sw=86, gap=18, n=6, startX=(W-(n*sw+(n-1)*gap))/2, y=H*0.8;
      ctx.globalAlpha=0.72;
      for(let i=0;i<n;i++){ const phase=t*0.3+i*0.5; const idx=Math.floor(phase)%pal.length, nx=(idx+1)%pal.length; const f=sm(phase-Math.floor(phase));
        ctx.fillStyle=blend(pal[idx],pal[nx],f); rr(ctx,startX+i*(sw+gap), y+7*Math.sin(t*0.8+i), sw, 80, 14); ctx.fill(); }
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

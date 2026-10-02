import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
SR=44100; DUR=23.5; N=int(SR*DUR)
rng=np.random.default_rng(7)
def T(n): return np.arange(n)/SR
def midi(m): return 440*2**((m-69)/12)
def lp(x,f,o=2): return sosfilt(butter(o,f,'low',fs=SR,output='sos'),x)
def hp(x,f,o=2): return sosfilt(butter(o,f,'high',fs=SR,output='sos'),x)
def bp(x,a,b,o=2): return sosfilt(butter(o,[a,b],'band',fs=SR,output='sos'),x)
def add(buf,sig,t,g=1.0):
    i=int(t*SR); j=min(len(buf),i+len(sig))
    if j>i: buf[i:j]+=sig[:j-i]*g
def env(n,a=0.005,r=0.3):
    t=T(n); e=np.minimum(1,t/a)*np.exp(-t/r); return e
def pluck(f,dur=0.9,bright=0.5):
    n=int(SR*dur); p=int(SR/f); buf=rng.uniform(-1,1,p); out=np.zeros(n)
    b=lp(buf,2000+6000*bright,1) if p>10 else buf
    b=b.copy(); i=0
    for k in range(n):
        out[k]=b[i]; nx=(i+1)%p; b[i]=0.996*0.5*(b[i]+b[nx]); i=nx
    return out*env(n,0.002,dur*0.45)
_pl={}
def pl(m,dur=0.9,bright=0.5):
    k=(m,dur,bright)
    if k not in _pl: _pl[k]=pluck(midi(m),dur,bright)
    return _pl[k]
def bell(m,dur=1.2):
    n=int(SR*dur);t=T(n);f=midi(m)
    s=np.sin(2*np.pi*f*t)+0.35*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*6)+0.2*np.sin(2*np.pi*f*5.4*t)*np.exp(-t*12)
    return s*env(n,0.002,dur*0.35)
def kick():
    n=int(SR*0.35);t=T(n);f=48+90*np.exp(-t*30);ph=2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*9)*1.0
def clap():
    n=int(SR*0.25);x=rng.standard_normal(n);x=bp(x,900,3500)
    t=T(n);e=np.exp(-t*22)+0.5*np.exp(-np.maximum(0,t-0.012)*25)*(t>0.012)
    return x*e*0.5
def shaker():
    n=int(SR*0.08);x=hp(rng.standard_normal(n),6000);return x*env(n,0.004,0.025)*0.25
def bass(m,dur):
    n=int(SR*dur);t=T(n);f=midi(m)
    s=np.sin(2*np.pi*f*t)+0.3*np.sin(2*np.pi*2*f*t)+0.12*np.sign(np.sin(2*np.pi*f*t))
    s=lp(s,700)
    e=np.minimum(1,t/0.006)*np.minimum(1,np.maximum(0,(dur-t))/0.04)*(0.75+0.25*np.exp(-t*4))
    return s*e
def pad(ms,dur):
    n=int(SR*dur);t=T(n);s=np.zeros(n)
    for m in ms:
        for d in (-0.08,0.08):
            f=midi(m)*2**(d/12); s+=2*((t*f)%1)-1
    s=lp(s,1400,2)/len(ms)/2
    e=np.minimum(1,t/0.4)*np.minimum(1,np.maximum(0,dur-t)/0.5)
    return s*e
def noise_sweep(dur,f0,f1,rev=False):
    n=int(SR*dur);x=rng.standard_normal(n);out=np.zeros(n);blk=512
    for i in range(0,n,blk):
        fr=i/n; fr=1-fr if rev else fr
        fc=f0*(f1/f0)**fr
        seg=x[max(0,i-2048):i+blk]
        y=bp(seg,max(60,fc*0.7),min(SR/2-100,fc*1.4))
        out[i:i+blk]=y[-len(out[i:i+blk]):]
    t=T(n); e=np.sin(np.pi*np.clip(t/dur,0,1))**1.5
    return out*e

music=np.zeros(N); drums=np.zeros(N); sfx=np.zeros(N)
B=0.5 # beat
# chords: (bass root midi, chord tones)
Am=(45,[57,60,64]); F=(41,[53,57,60]); C=(48,[55,60,64]); G=(43,[55,59,62])
# HOOK 0-4: soft pad + sparse bells, Am -> F
add(music,pad([57,60,64],2.2),0.0,0.32); add(music,pad([53,57,60],2.2),2.0,0.32)
for t,m in [(0.25,76),(1.0,72),(1.5,74),(2.25,72),(3.0,69),(3.5,71)]:
    add(music,bell(m,1.4),t,0.16)
for t,m in [(0,45),(2,41)]: add(music,bass(m,1.9),t,0.18)
# riser into drop
add(sfx,noise_sweep(1.0,500,7000),3.0,0.10)
# MAIN 4-22: C G Am F x2, then C (outro)
prog=[C,G,Am,F,C,G,Am,F,C]
pat=[0,1,2,1, 2,1,0,1]  # arp index per 8th (0=low)
for bi,(root,tones) in enumerate(prog):
    t0=4+bi*2
    for k in range(16 if bi<8 else 8):
        tt=t0+k*0.25
        if tt>=22: break
        if bi==8 and k>=4: break
        ts=tones+[tones[0]+12]
        m=ts[[0,2,1,3,2,1,3,2][k%8]]+12
        add(music,pl(m,0.7,0.55),tt+(0.012 if k%2 else 0),0.30 if k%4==0 else 0.22)
    # bass: 1, &2, 3 (skip in last bar after half)
    for off,d in [(0,0.45),(0.75,0.2),(1.0,0.45),(1.5,0.4)]:
        if bi==8 and off>0.9: break
        add(music,bass(root-12+12 if root<44 else root-12,d),t0+off,0.42)
    add(music,pad(tones,2.1),t0,0.10)
# drums 4-20, lighter in chat section, stop for outro hit
for bt in np.arange(4,20,B):
    beat=int(round((bt-4)/B))%4
    if beat in (0,2): add(drums,kick(),bt,0.62)
    if beat in (1,3): add(drums,clap(),bt,0.36 if bt<14 else 0.26)
for st in np.arange(4,20,0.25):
    add(drums,shaker(),st+(0.02 if int(st*4)%2 else 0),0.7 if int(st*4)%2 else 0.45)
# outro 20-23.5: final C chord strum + bells
for i,m in enumerate([60,64,67,72,76]): add(music,pl(m,2.6,0.6),20.0+i*0.03,0.26)
add(music,bass(36,2.8),20.0,0.45); add(drums,kick(),20.0,0.6)
add(music,pad([60,64,67,72],3.4),20.0,0.14)
for i,m in enumerate([72,76,79,84]): add(music,bell(m,2.0),20.3+i*0.12,0.13)
add(music,bell(88,2.5),22.0,0.10); add(music,pl(48,1.4,0.5),22.0,0.25)

# SFX (in key, soft)
add(sfx,noise_sweep(0.45,4000,300,False),3.82,0.06)          # iris wipe whoosh
add(sfx,noise_sweep(1.3,300,2500),4.15,0.045)                 # plane pass
for t in (6.85,10.85,13.85,19.85): add(sfx,noise_sweep(0.35,1200,5000),t,0.04)
for i,m in enumerate([72,76,79,84]): add(sfx,bell(m,0.8),7.5+i*0.5,0.16)   # ticks on beat, rising C arpeggio
def tok(m):
    n=int(SR*0.18);t=T(n);s=np.sin(2*np.pi*midi(m)*t)*np.exp(-t*30)+0.4*bp(rng.standard_normal(n),800,2500)*np.exp(-t*60)
    return s
for i,m in enumerate([60,64,67,62,65,72]): add(sfx,tok(m),11.12+i*0.25+0.12,0.14)   # boards knock in
def blip(m):
    n=int(SR*0.16);t=T(n);f=midi(m)*(1+0.25*np.minimum(1,t/0.05));return np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,0.003,0.05)
add(sfx,blip(79),14.95,0.10)
for t,m in [(15.55,72),(16.1,76),(16.75,79)]: add(sfx,blip(m),t,0.10)
for i in range(10): add(sfx,shaker()*0.5,14.3+i*0.055,0.25)   # typing ticks
add(sfx,noise_sweep(0.5,600,4000),20.0,0.035)

def reverb(x,sec=1.6,mix=0.18):
    n=int(SR*sec);t=T(n);ir=rng.standard_normal(n)*np.exp(-t*4.5);ir=lp(ir,5000);ir/=np.sqrt((ir**2).sum())
    w=fftconvolve(x,ir)[:len(x)];return x+mix*w
music=reverb(music,1.8,0.22); sfx=reverb(sfx,1.8,0.30)
mix=music*1.0+drums*0.9+sfx*0.9
mix=hp(mix,30)
# glue: gentle soft clip + normalize
mix=mix/np.max(np.abs(mix))*1.1; mix=np.tanh(mix)*0.9
fade=np.ones(N); fl=int(SR*1.2); fade[-fl:]=np.linspace(1,0,fl)**1.5; mix*=fade
st=np.stack([mix,mix],1)
# slight stereo width on music via delay
d=int(SR*0.011); st[d:,1]=0.85*mix[d:]+0.15*mix[:-d]
import wave
pcm=(np.clip(st,-1,1)*32000).astype(np.int16)
with wave.open('music.wav','wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
print('ok',np.sqrt((mix**2).mean()))

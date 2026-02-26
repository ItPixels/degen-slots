import { useState, useEffect, useRef, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const INITIAL_BALANCE = 100;
const REEL_DELAYS     = [900, 1100, 1350];
const FLICKER_MS      = 75;
const FLASH_MS        = 750;
const DOUBLE_HOLD_MS  = 500;

const SYMBOLS = [
  { id:"degen",   label:"🎩", name:"$DEGEN",   color:"#9945FF", bg:"#1a0a33", weight:5  },
  { id:"brett",   label:"🐸", name:"$BRETT",   color:"#00D2FF", bg:"#001f2e", weight:8  },
  { id:"miggles", label:"🐱", name:"$MIGGLES", color:"#FF6B9D", bg:"#2a0015", weight:11 },
  { id:"toshi",   label:"🐶", name:"$TOSHI",   color:"#FF9500", bg:"#1f1200", weight:15 },
  { id:"base",    label:"🔵", name:"BASE",     color:"#0052FF", bg:"#000d2e", weight:19 },
  { id:"rug",     label:"💀", name:"RUG",      color:"#444",    bg:"#0c0c0c", weight:28 },
];

const POOL = SYMBOLS.flatMap(s => Array(s.weight).fill(s));
const PAY3 = { degen:60, brett:25, miggles:15, toshi:8, base:5, rug:0 };
const PAY2 = { degen:6,  brett:3,  miggles:2,  toshi:1, base:0, rug:0 };

const PHRASES = {
  win:     ["ser, you actually did it 👀","ngmi but this time it worked","small win, big ego. gm.","bullish on your clicking skills","ok ok, respectable. don't push it.","screenshot before it reverses"],
  bigwin:  ["SER. THIS IS NOT A DRILL 🚀","based and pilled, actually","you: 1  |  market: 0","don't tell your financial advisor","wen lambo? actually wen."],
  jackpot: ["HOLY BASED. 🎩🎩🎩","MAX PAIN REVERSED. GG SER.","this hit different. we're so back.","NGMI → GMI speedrun complete"],
  loss:    ["rekt. classic.","market is humbling you. gn.","it do be like that sometimes","ngmi confirmed. retry?","the house always wins. gg.","at least it wasn't real money. ...yet.","your portfolio moment","even your ex is up today","bro spent his gas fees for this","L + ratio + no jpegs"],
  rug:     ["💀 RUG PULL. cooked.","ser your vibes got rugged","the founders fled. again.","exit liquidity secured. (by you)","your whitepaper lied"],
  streak:  ["STREAK MODE ACTIVATED 🔥","the vibes are immaculate rn","based run. don't get greedy.","you're the airdrop now"],
  double_w:["doubled up. legend behavior.","2x and rising. ser.","this is the way 🔵"],
  double_l:["you had it and gave it back. degen certified.","greed is eternal. so is loss.","bro had the bag and dropped it"],
};

function getDailySeed() {
  const s = new Date().toDateString();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pickPhrase(pool, spin) { return pool[(getDailySeed() + spin) % pool.length]; }
function getMemePhrase({ kind, streak, balance, spin }) {
  if (spin === 69)                     return "spin #69 👀 based.";
  if (balance === 69)                  return "balance = $69. nice. don't spend it.";
  if (Math.abs(balance - 6.9) < 0.05) return "nice.";
  if (streak <= -10)                   return "10 losses? virgin hands confirmed.";
  if (streak >= 3 && kind === "win")   return pickPhrase(PHRASES.streak, spin);
  switch (kind) {
    case "jackpot":  return pickPhrase(PHRASES.jackpot, spin);
    case "bigwin":   return pickPhrase(PHRASES.bigwin, spin);
    case "win":      return pickPhrase(PHRASES.win, spin);
    case "rug":      return pickPhrase(PHRASES.rug, spin);
    case "double_w": return pickPhrase(PHRASES.double_w, spin);
    case "double_l": return pickPhrase(PHRASES.double_l, spin);
    default:         return pickPhrase(PHRASES.loss, spin);
  }
}

function randSym() { return POOL[Math.floor(Math.random() * POOL.length)]; }
function spinReels() { return [randSym(), randSym(), randSym()]; }
function calcPayout(reels, bet) {
  const ids = reels.map(r => r.id);
  const counts = {};
  ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  const [topId, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  let mult = 0, kind = "miss";
  if (topCount === 3) {
    mult = PAY3[topId] ?? 0;
    kind = topId === "rug" ? "rug" : mult >= 60 ? "jackpot" : mult >= 15 ? "bigwin" : "win";
  } else if (topCount === 2) {
    mult = PAY2[topId] ?? 0;
    kind = mult > 0 ? "win" : "miss";
  }
  return { payout: bet * mult, mult, kind, topId };
}

const FD = "'Orbitron', sans-serif";
const FM = "'Share Tech Mono', monospace";

export default function App() {
  const INIT = [SYMBOLS[4], SYMBOLS[4], SYMBOLS[4]];

  const [balance,     setBalance]    = useState(INITIAL_BALANCE);
  const [bet,         setBetRaw]     = useState(5);
  const [phase,       setPhase]      = useState("idle");
  const [reelDisplay, setReelDisplay]= useState(INIT);
  const [spinning,    setSpinning]   = useState([false, false, false]);
  const [result,      setResult]     = useState(null);
  const [history,     setHistory]    = useState([]);
  const [streak,      setStreak]     = useState(0);
  const [totalSpins,  setTotalSpins] = useState(0);
  const [flash,       setFlash]      = useState(null);
  const [shake,       setShake]      = useState(false);
  const [sessW,       setSessW]      = useState(0);
  const [sessL,       setSessL]      = useState(0);
  const [maxStreak,   setMaxStreak]  = useState(0);
  const [holdPct,     setHoldPct]    = useState(0);
  const [holding,     setHolding]    = useState(false);

  const iRefs     = useRef([null, null, null]);
  const tRefs     = useRef([]);
  const holdRaf   = useRef(null);
  const holdStart = useRef(null);

  const isIdle     = phase === "idle";
  const isSpinning = phase === "spinning";

  const setBet = v => { if (!isIdle) return; setBetRaw(Math.max(1, Math.min(v, balance))); };

  const triggerSpin = useCallback(() => {
    if (phase !== "idle") return;
    if (balance < bet) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    const balAfterBet = balance - bet;
    setBalance(balAfterBet); setPhase("spinning"); setResult(null); setFlash(null); setSpinning([true, true, true]);
    const final = spinReels();
    [0, 1, 2].forEach(i => {
      iRefs.current[i] = setInterval(() => {
        setReelDisplay(prev => { const n = [...prev]; n[i] = randSym(); return n; });
      }, FLICKER_MS);
    });
    REEL_DELAYS.forEach((delay, i) => {
      const tid = setTimeout(() => {
        clearInterval(iRefs.current[i]); iRefs.current[i] = null;
        setReelDisplay(prev => { const n = [...prev]; n[i] = final[i]; return n; });
        setSpinning(prev => { const n = [...prev]; n[i] = false; return n; });
        if (i === 2) {
          const newSpins = totalSpins + 1; setTotalSpins(newSpins);
          const { payout, mult, kind } = calcPayout(final, bet);
          const won = payout > 0;
          const newBal = balAfterBet + payout;
          const newStreak = won ? Math.max(streak, 0) + 1 : Math.min(streak, 0) - 1;
          setBalance(newBal); setStreak(newStreak); setMaxStreak(ms => Math.max(ms, newStreak));
          if (won) setSessW(w => w + 1); else setSessL(l => l + 1);
          const phrase = getMemePhrase({ kind, streak: newStreak, balance: newBal, spin: newSpins });
          setResult({ payout, mult, kind, phrase, reels: final, bet });
          setHistory(h => [{ syms: final, payout, bet }, ...h].slice(0, 6));
          setFlash(won ? "win" : "loss"); setTimeout(() => setFlash(null), FLASH_MS);
          if (newBal <= 0) setTimeout(() => setPhase("gameover"), 600); else setPhase("result");
        }
      }, delay);
      tRefs.current.push(tid);
    });
  }, [phase, balance, bet, streak, totalSpins]);

  useEffect(() => {
    const h = e => { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); triggerSpin(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [triggerSpin]);

  const startHold = () => {
    if (!result || result.payout <= 0 || result.isDouble) return;
    setHolding(true); holdStart.current = Date.now();
    const tick = () => {
      const pct = Math.min(((Date.now() - holdStart.current) / DOUBLE_HOLD_MS) * 100, 100);
      setHoldPct(pct);
      if (pct < 100) { holdRaf.current = requestAnimationFrame(tick); } else { resolveDouble(); }
    };
    holdRaf.current = requestAnimationFrame(tick);
  };
  const cancelHold = () => { setHolding(false); setHoldPct(0); if (holdRaf.current) cancelAnimationFrame(holdRaf.current); };
  const resolveDouble = useCallback(() => {
    if (!result) return;
    const won = Math.random() < 0.5; const kind = won ? "double_w" : "double_l";
    const delta = won ? result.payout : -result.payout; const newBal = balance + delta;
    const phrase = getMemePhrase({ kind, streak, balance: newBal, spin: totalSpins });
    setBalance(newBal); setResult(r => ({ ...r, payout: won ? r.payout * 2 : 0, kind, phrase, isDouble: true }));
    setFlash(won ? "win" : "loss"); setTimeout(() => setFlash(null), FLASH_MS);
    setHolding(false); setHoldPct(0); if (holdRaf.current) cancelAnimationFrame(holdRaf.current);
    if (newBal <= 0) setTimeout(() => setPhase("gameover"), 600);
  }, [result, balance, streak, totalSpins]);

  const dismiss = () => { if (phase === "result") setPhase("idle"); };
  const reset = () => {
    setBalance(INITIAL_BALANCE); setBetRaw(5); setPhase("idle"); setReelDisplay(INIT);
    setSpinning([false,false,false]); setResult(null); setHistory([]); setStreak(0);
    setTotalSpins(0); setFlash(null); setSessW(0); setSessL(0); setMaxStreak(0);
  };

  const total    = sessW + sessL;
  const winRate  = total > 2 ? sessW / total : null;
  const moodColor = winRate === null ? "#0052ff" : winRate > 0.4 ? "#00ff88" : winRate < 0.2 ? "#ff4444" : "#ff9500";
  const moodLabel = winRate === null ? null : winRate > 0.4 ? "BULLISH" : winRate < 0.2 ? "BEARISH" : "COPING";

  const isWinner = i => {
    if (!result || phase !== "result" || result.payout <= 0) return false;
    const id = result.reels[i]?.id;
    return result.reels.filter(r => r.id === id).length >= 2;
  };

  const share = () => {
    if (!result) return;
    const syms = result.reels.map(r => r.label).join(" ");
    const delta = result.payout > 0 ? `+$${result.payout}` : `-$${result.bet}`;
    const stkTxt = streak >= 2 ? ` 🔥${streak} streak` : "";
    const txt = `${result.phrase}\n\n${syms}  ${delta}${stkTxt}\n\nDegen Slots on Base → degenslots.xyz`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  };

  const machineGlow = winRate === null ? "0 0 40px rgba(0,82,255,0.12)"
    : winRate > 0.4 ? "0 0 40px rgba(0,255,136,0.1)" : winRate < 0.2 ? "0 0 40px rgba(255,68,68,0.1)" : "0 0 40px rgba(255,149,0,0.1)";

  return (
    <div style={R.root}>
      <style>{CSS}</style>

      {flash && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,
          background: flash==="win"
            ? "radial-gradient(ellipse at 50% 30%, rgba(0,255,136,0.1) 0%, transparent 70%)"
            : "radial-gradient(ellipse at 50% 30%, rgba(255,68,68,0.1) 0%, transparent 70%)"
        }}/>
      )}

      <div style={R.container}>

        {/* HEADER */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,paddingTop:8}}>
          <div style={R.logo}>🎰 DEGEN SLOTS</div>
          <div style={R.tagline}>on Base L2</div>
        </div>

        {/* BALANCE CARD */}
        <div style={R.glassCard}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={R.statLabel}>BALANCE</span>
              <span style={{...R.statVal, color:balance<15?"#ff4444":"#00ff88", textShadow:balance<15?"0 0 12px rgba(255,68,68,0.5)":"0 0 12px rgba(0,255,136,0.4)"}}>
                ${balance % 1 === 0 ? balance : balance.toFixed(1)}
              </span>
            </div>
            <div style={{flex:1,display:"flex",justifyContent:"center"}}>
              {streak >= 2  && <div style={{...R.badge,background:"linear-gradient(135deg,#ff6b00,#ff0066)",boxShadow:"0 0 16px rgba(255,107,0,0.4)"}}>🔥 {streak} STREAK</div>}
              {streak <= -3 && <div style={{...R.badge,background:"linear-gradient(135deg,#ff2222,#880000)",boxShadow:"0 0 16px rgba(255,34,34,0.4)"}}>💀 {Math.abs(streak)} L-STREAK</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={R.statLabel}>BET</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button style={R.nudge} disabled={!isIdle} onClick={()=>setBet(bet-1)}>−</button>
                <span style={{...R.statVal,color:"#00ff88"}}>$  {bet}</span>
                <button style={R.nudge} disabled={!isIdle} onClick={()=>setBet(bet+1)}>+</button>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:6,marginTop:10}}>
            {[1,5,10,25].map(v=>(
              <button key={v} style={{...R.presetBtn,borderColor:bet===v?"#00ff88":"#1a1a2e",color:bet===v?"#00ff88":"#555",boxShadow:bet===v?"0 0 8px rgba(0,255,136,0.2)":"none"}}
                disabled={!isIdle} onClick={()=>setBet(v)}>${v}</button>
            ))}
            <button style={{...R.presetBtn,borderColor:"#1a1a2e",color:"#555"}} disabled={!isIdle} onClick={()=>setBet(balance)}>MAX</button>
          </div>
        </div>

        {/* MACHINE */}
        <div style={{...R.machine, boxShadow:machineGlow,
          border: phase==="result"&&result?.payout>0 ? "2px solid rgba(0,255,136,0.25)"
                : phase==="result"&&result?.payout===0 ? "2px solid rgba(255,68,68,0.2)"
                : "2px solid rgba(26,26,58,0.8)"}}>

          {/* Top lights */}
          <div style={R.lightsRow}>
            {[...Array(9)].map((_,i)=>(
              <div key={i} style={{
                width:10,height:10,borderRadius:"50%",
                background: isSpinning?(i%2===0?"#ffdd00":"#ff8800"):(i%2?"#ff0066":"#00ccff"),
                boxShadow: `0 0 ${isSpinning?8:4}px ${isSpinning?(i%2===0?"#ffdd00":"#ff8800"):(i%2?"#ff006688":"#00ccff88")}`,
                animation: isSpinning?`spinLight ${0.2+i*0.03}s infinite alternate`:`chaseLight ${1.8+i*0.1}s ${i*0.2}s infinite`,
                transition:"background 0.3s",
              }}/>
            ))}
          </div>

          {/* Reels */}
          <div style={{display:"flex",gap:10,padding:"16px"}}>
            {[0,1,2].map(i=>{
              const sym=reelDisplay[i], spin=spinning[i], win=isWinner(i);
              return (
                <div key={i} style={{
                  flex:1,aspectRatio:"1/1.15",borderRadius:12,
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  userSelect:"none",position:"relative",overflow:"hidden",
                  background:`radial-gradient(ellipse at 50% 25%, ${sym.bg}ee 0%, ${sym.bg} 100%)`,
                  border:`2px solid ${win?"rgba(255,255,255,0.9)":spin?"rgba(255,255,255,0.04)":sym.color}`,
                  boxShadow: win ? `0 0 32px ${sym.color}, 0 0 64px ${sym.color}44, inset 0 0 20px ${sym.color}22`
                                 : spin ? "none" : `0 0 16px ${sym.color}22, inset 0 0 12px rgba(0,0,0,0.5)`,
                  transform: win?"scale(1.07)":spin?"scale(0.95)":"scale(1)",
                  filter: spin?"blur(0.5px) brightness(0.75)":"none",
                  transition:"transform 0.15s,border-color 0.2s,box-shadow 0.25s,filter 0.15s",
                  animation: win?"winPop 0.45s cubic-bezier(.36,1.5,.6,.9)":"none",
                }}>
                  {/* Top glare */}
                  <div style={{position:"absolute",top:0,left:0,right:0,height:"38%",background:"linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 100%)",pointerEvents:"none",borderRadius:"12px 12px 0 0"}}/>
                  <div style={{fontSize:spin?34:46,lineHeight:1,marginBottom:5,filter:"drop-shadow(0 2px 4px rgba(0,0,0,0.6))",transition:"font-size 0.1s"}}>
                    {sym.label}
                  </div>
                  <div style={{fontFamily:FD,fontSize:8,fontWeight:700,letterSpacing:2,color:spin?"rgba(255,255,255,0.08)":sym.color+"cc",transition:"color 0.2s"}}>
                    {spin?"···":sym.name}
                  </div>
                  {/* Win shimmer */}
                  {win && <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(255,255,255,0.1) 0%,transparent 50%,rgba(255,255,255,0.05) 100%)",animation:"shimmer 0.6s ease forwards",borderRadius:"inherit"}}/>}
                </div>
              );
            })}
          </div>

          {/* Bottom lights */}
          <div style={R.lightsRow}>
            {[...Array(9)].map((_,i)=>(
              <div key={i} style={{
                width:10,height:10,borderRadius:"50%",
                background: isSpinning?(i%2===0?"#00ccff":"#0066ff"):(i%2?"#00ccff":"#ff0066"),
                boxShadow: `0 0 ${isSpinning?8:4}px ${isSpinning?(i%2===0?"#00ccff":"#0066ff"):(i%2?"#00ccff88":"#ff006688")}`,
                animation: isSpinning?`spinLight ${0.2+i*0.03}s infinite alternate`:`chaseLight ${1.8+i*0.1}s ${(8-i)*0.2}s infinite`,
                transition:"background 0.3s",
              }}/>
            ))}
          </div>
        </div>

        {/* RESULT */}
        {phase==="result"&&result&&(
          <div style={{
            width:"100%",borderRadius:14,padding:"18px 16px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:10,
            animation:"popIn 0.4s cubic-bezier(.34,1.56,.64,1)",
            background: result.payout>0?"rgba(0,12,8,0.9)":"rgba(12,4,4,0.9)",
            border: result.payout>0?"1px solid rgba(0,255,136,0.3)":"1px solid rgba(255,68,68,0.22)",
            boxShadow: result.payout>0?"0 0 40px rgba(0,255,136,0.07),inset 0 1px 0 rgba(0,255,136,0.07)":"0 0 30px rgba(255,68,68,0.06)",
          }}>
            <div style={{
              fontFamily:FD,fontWeight:900,letterSpacing:1,lineHeight:1,
              fontSize: result.kind==="jackpot"||result.kind==="double_w"?36:30,
              color: result.payout>0?"#00ff88":"#ff4444",
              textShadow: result.payout>0
                ? result.kind==="jackpot"?"0 0 30px rgba(0,255,136,0.8),0 0 60px rgba(153,69,255,0.4)":"0 0 20px rgba(0,255,136,0.6)"
                : "0 0 16px rgba(255,68,68,0.5)",
              animation: result.kind==="jackpot"?"jackpotPulse 0.8s ease-in-out infinite alternate":"none",
            }}>
              {result.payout>0?(result.kind==="jackpot"?"🎩 JACKPOT  ":"")+`+$${result.payout}`:"💀 REKT"}
            </div>
            <div style={{fontFamily:FM,fontSize:13,color:"#555",textAlign:"center",lineHeight:1.5}}>
              {result.phrase}
            </div>
            <div style={{display:"flex",gap:8,width:"100%",flexWrap:"wrap",justifyContent:"center",marginTop:4}}>
              {result.payout>0&&!result.isDouble&&(
                <button style={{
                  flex:2,padding:"12px 10px",border:"1px solid rgba(255,149,0,0.55)",borderRadius:10,
                  color:"#ff9500",fontFamily:FD,fontSize:11,fontWeight:700,letterSpacing:1,
                  touchAction:"none",minHeight:48,transition:"box-shadow 0.2s",
                  boxShadow:holding?"0 0 20px rgba(255,149,0,0.3)":"none",
                  background:holding?`linear-gradient(90deg,rgba(255,149,0,0.2) ${holdPct}%,rgba(26,16,0,0.9) ${holdPct}%)`:"rgba(26,16,0,0.9)",
                }} onPointerDown={startHold} onPointerUp={cancelHold} onPointerLeave={cancelHold}>
                  {holding?`DOUBLING ${Math.round(holdPct)}%`:`DOUBLE ($${result.payout*2})?`}
                </button>
              )}
              <button style={{flex:1,padding:"12px 6px",background:"rgba(13,13,26,0.9)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,color:"#555",fontFamily:FD,fontSize:10,fontWeight:700,letterSpacing:1,touchAction:"manipulation",minHeight:48}} onClick={share}>POST 𝕏</button>
              <button style={{flex:1,padding:"12px 6px",background:"linear-gradient(135deg,#0052ff,#0033cc)",borderRadius:10,color:"#fff",fontFamily:FD,fontSize:10,fontWeight:700,letterSpacing:1,touchAction:"manipulation",minHeight:48,boxShadow:"0 4px 16px rgba(0,82,255,0.3)"}} onClick={dismiss}>
                {result.payout>0?"TAKE IT →":"RETRY →"}
              </button>
            </div>
          </div>
        )}

        {/* SPIN BUTTON */}
        <button onClick={triggerSpin} disabled={phase!=="idle"} style={{
          width:"100%",padding:"18px",borderRadius:14,color:"#fff",
          fontFamily:FD,fontSize:16,fontWeight:900,letterSpacing:4,
          touchAction:"manipulation",minHeight:58,position:"relative",overflow:"hidden",
          background:"linear-gradient(135deg,#0052ff,#003acc)",
          boxShadow: isIdle
            ? "0 4px 24px rgba(0,82,255,0.4),0 0 0 1px rgba(0,82,255,0.2),inset 0 1px 0 rgba(255,255,255,0.1)"
            : "0 2px 8px rgba(0,82,255,0.2)",
          opacity:phase!=="idle"?0.55:1,
          transition:"transform 0.1s,opacity 0.15s,box-shadow 0.2s",
          animation:shake?"shake 0.4s ease":isIdle?"spinBtnGlow 2s ease-in-out infinite alternate":"none",
        }}>
          {isSpinning?"SPINNING...":phase==="result"?"CLOSE RESULT FIRST":balance<bet?"NOT ENOUGH $":"SPIN  [SPACE]"}
        </button>

        {/* MOOD */}
        {moodLabel&&(
          <div style={{fontFamily:FM,fontSize:9,color:moodColor,opacity:0.5,letterSpacing:3,textAlign:"center"}}>
            SESSION: {moodLabel} · {Math.round(winRate*100)}% WR · {total} SPINS
          </div>
        )}

        {/* PAY TABLE */}
        <div style={{width:"100%",background:"rgba(5,5,12,0.8)",border:"1px solid rgba(26,26,46,0.8)",borderRadius:12,padding:"10px 14px"}}>
          <div style={{fontFamily:FM,fontSize:9,color:"#2a2a3a",letterSpacing:4,textAlign:"center",marginBottom:8}}>PAY TABLE</div>
          <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
            {SYMBOLS.filter(s=>PAY3[s.id]>0).map(s=>(
              <div key={s.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,minWidth:52,padding:4,borderRadius:6,cursor:"default",transition:"background 0.2s,transform 0.15s"}}>
                <span style={{color:s.color,fontSize:15,filter:`drop-shadow(0 0 4px ${s.color}66)`}}>{s.label}{s.label}{s.label}</span>
                <span style={{fontFamily:FD,fontSize:9,color:s.color+"88"}}>×{PAY3[s.id]}</span>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center",fontFamily:FM,fontSize:9,color:"#2a2a3a",marginTop:8,letterSpacing:2}}>2-of-a-kind pays ×1–×6</div>
        </div>

        {/* HISTORY */}
        {history.length>0&&(
          <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2}}>
            {history.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,letterSpacing:1,padding:"3px 4px",borderRadius:4,
                color:h.payout>0?"rgba(0,255,136,0.4)":"rgba(255,68,68,0.3)",opacity:1-i*0.14}}>
                <span style={{letterSpacing:5}}>{h.syms.map(s=>s.label).join("")}</span>
                <span style={{fontFamily:FD,fontSize:10}}>{h.payout>0?`+$${h.payout}`:`−$${h.bet}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GAME OVER */}
      {phase==="gameover"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,backdropFilter:"blur(12px)",animation:"fadeIn 0.3s ease"}}>
          <div style={{background:"rgba(10,10,18,0.96)",border:"2px solid rgba(255,0,0,0.14)",borderRadius:24,padding:"44px 48px",textAlign:"center",
            boxShadow:"0 0 80px rgba(255,0,0,0.14),0 24px 64px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.03)",
            display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <div style={{fontSize:60,animation:"skullPulse 1.2s ease-in-out infinite alternate"}}>💀</div>
            <div style={{fontFamily:FD,fontSize:52,fontWeight:900,color:"#ff4444",letterSpacing:6,textShadow:"0 0 40px rgba(255,0,0,0.7)"}}>REKT</div>
            <div style={{fontFamily:FM,fontSize:13,color:"rgba(255,68,68,0.45)",letterSpacing:2}}>you lost everything, degen.</div>
            <div style={{display:"flex",gap:20,fontFamily:FM,fontSize:11,color:"#333",marginTop:4}}>
              <span>spins: {totalSpins}</span><span>best streak: {maxStreak}</span>
            </div>
            <button style={{marginTop:6,background:"linear-gradient(135deg,#ff0044,#cc0033)",borderRadius:12,padding:"15px 36px",color:"#fff",
              fontFamily:FD,fontSize:13,fontWeight:900,letterSpacing:2,boxShadow:"0 4px 24px rgba(255,0,68,0.3)",touchAction:"manipulation",minHeight:50}} onClick={reset}>
              NGMI → TRY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const R = {
  root:{
    minHeight:"100dvh",
    background:`
      radial-gradient(ellipse 80% 60% at 15% 10%, rgba(0,82,255,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 85% 85%, rgba(153,69,255,0.1) 0%, transparent 55%),
      #04040a`,
    display:"flex",alignItems:"flex-start",justifyContent:"center",
    padding:"16px 0 48px",position:"relative",
  },
  container:{width:"100%",maxWidth:400,padding:"0 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:14,position:"relative",zIndex:1},
  logo:{fontFamily:"'Orbitron',sans-serif",fontSize:26,fontWeight:900,color:"#fff",letterSpacing:3,textShadow:"0 0 20px rgba(0,82,255,0.8),0 0 40px rgba(0,82,255,0.4)"},
  tagline:{fontSize:10,color:"#0052ff",letterSpacing:5,opacity:0.7,fontFamily:"'Share Tech Mono',monospace"},
  glassCard:{
    width:"100%",
    background:"rgba(13,13,22,0.72)",
    backdropFilter:"blur(20px)",
    WebkitBackdropFilter:"blur(20px)",
    border:"1px solid rgba(0,82,255,0.15)",
    borderRadius:14,padding:"12px 16px 10px",
    boxShadow:"0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.05)",
  },
  statLabel:{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"#2a2a44",letterSpacing:3},
  statVal:{fontFamily:"'Orbitron',sans-serif",fontSize:24,fontWeight:700,lineHeight:1},
  nudge:{
    background:"rgba(26,26,46,0.8)",border:"1px solid rgba(0,82,255,0.2)",color:"#666",
    width:32,height:32,borderRadius:6,fontSize:18,
    display:"flex",alignItems:"center",justifyContent:"center",
    minWidth:44,minHeight:44,touchAction:"manipulation",transition:"background 0.15s,color 0.15s,transform 0.1s",
  },
  badge:{color:"#fff",fontSize:10,fontWeight:700,fontFamily:"'Orbitron',sans-serif",padding:"4px 12px",borderRadius:20,letterSpacing:1,whiteSpace:"nowrap"},
  presetBtn:{
    flex:1,padding:"7px 0",background:"rgba(8,8,16,0.8)",borderRadius:6,
    fontFamily:"'Share Tech Mono',monospace",fontSize:12,touchAction:"manipulation",
    border:"1px solid",minHeight:38,transition:"border-color 0.15s,color 0.15s,background 0.15s",
  },
  machine:{
    width:"100%",
    background:"linear-gradient(180deg,rgba(13,13,24,0.96) 0%,rgba(5,5,10,0.99) 100%)",
    borderRadius:18,overflow:"hidden",position:"relative",transition:"box-shadow 1.5s ease,border-color 0.5s",
  },
  lightsRow:{display:"flex",justifyContent:"space-around",padding:"8px 14px",background:"rgba(3,3,8,0.95)"},
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:#04040a;overflow-x:hidden;}
  button{border:none;cursor:pointer;}
  button:disabled{cursor:not-allowed;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#0a0a14;}
  ::-webkit-scrollbar-thumb{background:#0052ff44;border-radius:2px;}

  /* Background grid */
  body::before{
    content:'';position:fixed;inset:0;
    background-image:linear-gradient(rgba(0,82,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,82,255,0.025) 1px,transparent 1px);
    background-size:44px 44px;pointer-events:none;z-index:0;
  }

  @keyframes fadeIn   {from{opacity:0}to{opacity:1}}
  @keyframes popIn    {from{opacity:0;transform:scale(.85) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes shake    {0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
  @keyframes winPop   {0%{transform:scale(1)}40%{transform:scale(1.1)}70%{transform:scale(1.04)}100%{transform:scale(1.07)}}
  @keyframes shimmer  {from{transform:translateX(-100%);opacity:0}50%{opacity:1}to{transform:translateX(100%);opacity:0}}
  @keyframes spinBtnGlow {
    from{box-shadow:0 4px 20px rgba(0,82,255,0.3),0 0 0 1px rgba(0,82,255,0.15);}
    to  {box-shadow:0 4px 40px rgba(0,82,255,0.65),0 0 0 1px rgba(0,82,255,0.35),0 0 60px rgba(0,82,255,0.15);}
  }
  @keyframes jackpotPulse {
    from{text-shadow:0 0 20px rgba(0,255,136,0.6),0 0 40px rgba(0,255,136,0.3);}
    to  {text-shadow:0 0 40px rgba(0,255,136,1),0 0 80px rgba(153,69,255,0.5);}
  }
  @keyframes spinLight  {from{opacity:0.3}to{opacity:1}}
  @keyframes chaseLight {0%,100%{opacity:0.25}50%{opacity:1}}
  @keyframes skullPulse {
    from{transform:scale(1);filter:drop-shadow(0 0 8px rgba(255,68,68,0.4));}
    to  {transform:scale(1.08);filter:drop-shadow(0 0 22px rgba(255,68,68,0.9));}
  }

  @media (prefers-reduced-motion: reduce) {
    *,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important;}
  }
`;

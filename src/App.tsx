import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

const GAME_DURATION = 30;
const BUBBLE_SPAWN_RATE = 700;
const SWING_RANGE = 90;
const SWING_DURATION_MS = 350;

// Game area aspect ratio (portrait, phone-like)
const GAME_W = 420;
const GAME_H = 760;

interface Bubble {
  id: number;
  x: number;
  y: number;
  radius: number;
  speed: number;
  isPopping: boolean;
  popFrame: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

interface ScorePopup {
  x: number;
  y: number;
  value: number;
  life: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

const PARTICLE_COLORS = ["#FACC15", "#FEF3C7", "#67E8F9", "#FFFFFF", "#FCD34D"];

const getRandom = (min: number, max: number) => Math.random() * (max - min) + min;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);

  const bubblesRef = useRef<Bubble[]>([]);
  const bubbleImgRef = useRef<HTMLImageElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const popupsRef = useRef<ScorePopup[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const bgmStopRef = useRef<(() => void) | null>(null);
  const [bgmOn, setBgmOn] = useState(true);
  const lastSpawnRef = useRef(0);
  const bubbleIdCounter = useRef(0);
  const animationFrameRef = useRef(0);
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const mouseRef = useRef({ x: GAME_W / 2, y: GAME_H / 2 });
  const [charPos, setCharPos] = useState({ x: GAME_W / 2, y: GAME_H / 2 });
  const [facingLeft, setFacingLeft] = useState(false);
  const lastFlipXRef = useRef(GAME_W / 2);
  const FLIP_THRESHOLD = 40;
  const [swingPhase, setSwingPhase] = useState<"idle" | "mid" | "down">("idle");
  const swingPhaseTimersRef = useRef<number[]>([]);
  const [swinging, setSwinging] = useState(false);
  const swingTimerRef = useRef<number | null>(null);

  const [highScore, setHighScore] = useState(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bubble_pop_high_score", "50");
    }
    return 50;
  });

  // Force high score to 50 (catches HMR cases where state was preserved)
  useEffect(() => {
    localStorage.setItem("bubble_pop_high_score", "50");
    setHighScore(50);
  }, []);

  const startGame = () => {
    setGameState("playing");
    setTimeLeft(GAME_DURATION);
    setScore(0);
    if (bgmOn) startBgm();
    bubblesRef.current = [];
    particlesRef.current = [];
    popupsRef.current = [];
    shockwavesRef.current = [];
    lastSpawnRef.current = 0;
    mouseRef.current = { x: GAME_W / 2, y: GAME_H / 2 };
    lastFlipXRef.current = GAME_W / 2;
    setFacingLeft(false);
    setSwingPhase("idle");
    swingPhaseTimersRef.current.forEach((t) => window.clearTimeout(t));
    swingPhaseTimersRef.current = [];
    setCharPos({ x: GAME_W / 2, y: GAME_H / 2 });
  };

  const endGame = useCallback(() => {
    setGameState("gameover");
    stopBgm();
    setScore((s) => {
      if (s > highScore) {
        setHighScore(s);
        localStorage.setItem("bubble_pop_high_score", s.toString());
      }
      return s;
    });
  }, [highScore]);

  const spawnBubble = () => {
    const radius = getRandom(32, 58);
    bubblesRef.current.push({
      id: bubbleIdCounter.current++,
      x: getRandom(radius, GAME_W - radius),
      y: GAME_H + radius * 2,
      radius,
      speed: getRandom(1.1, 2.2),
      isPopping: false,
      popFrame: 0,
    });
  };

  const ensureAudio = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  // Underwater chiptune BGM: bass + melody pattern, loops forever
  const startBgm = () => {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (bgmStopRef.current) return; // already running

    // Master gain for BGM (separate from pop SFX)
    const master = ctx.createGain();
    master.gain.value = 0.06;
    master.connect(ctx.destination);
    bgmGainRef.current = master;

    // 16-step pattern @ ~140 BPM (8th notes = 214ms each)
    const STEP_MS = 214;
    // Melody (Hz): C minor pentatonic underwater feel
    const melody = [
      523.25, 622.25, 783.99, 622.25, 523.25, 466.16, 392.00, 466.16,
      523.25, 622.25, 783.99, 932.33, 783.99, 622.25, 523.25, 0,
    ];
    // Bass (one note every 4 steps)
    const bass = [130.81, 174.61, 130.81, 196.00];

    let step = 0;
    let stopped = false;

    const playNote = (freq: number, type: OscillatorType, duration: number, volume: number) => {
      if (freq === 0) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(volume, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + duration);
    };

    const tick = () => {
      if (stopped) return;
      // Melody
      playNote(melody[step], "square", 0.18, 0.55);
      // Bass: every 4 steps
      if (step % 4 === 0) {
        playNote(bass[(step / 4) % bass.length], "triangle", 0.5, 0.9);
      }
      step = (step + 1) % melody.length;
      setTimeout(tick, STEP_MS);
    };
    tick();

    bgmStopRef.current = () => {
      stopped = true;
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0, ctx.currentTime);
        master.disconnect();
      } catch { /* noop */ }
    };
  };

  const stopBgm = () => {
    if (bgmStopRef.current) {
      bgmStopRef.current();
      bgmStopRef.current = null;
    }
    // Belt and suspenders: if any master gain still attached, kill it
    if (bgmGainRef.current) {
      try {
        bgmGainRef.current.gain.cancelScheduledValues(0);
        bgmGainRef.current.gain.value = 0;
        bgmGainRef.current.disconnect();
      } catch { /* noop */ }
      bgmGainRef.current = null;
    }
  };

  const playPopSound = (pitch: number) => {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Main pop oscillator (descending pitch for "bloop")
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900 + pitch * 80, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    // Noise burst for "spark"
    const noiseDur = 0.06;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;
    noiseGain.gain.setValueAtTime(0.06, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);
    noise.buffer = buffer;
    noise.connect(hp).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
  };

  const spawnPopEffects = (x: number, y: number, radius: number) => {
    // Particle explosion (18 sparkles flying outward + gravity)
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.5 + Math.random() * 3.5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // slight upward bias
        size: 2 + Math.floor(Math.random() * 3),
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        life: 1,
      });
    }
    // Score popup floating up
    popupsRef.current.push({ x, y: y - radius * 0.5, value: 1, life: 1 });
    // Expanding shockwave ring
    shockwavesRef.current.push({
      x, y,
      radius: radius * 0.5,
      maxRadius: radius * 3.2,
      life: 1,
    });
  };

  const swing = () => {
    if (gameStateRef.current !== "playing") return;
    setSwinging(true);
    if (swingTimerRef.current) window.clearTimeout(swingTimerRef.current);
    swingTimerRef.current = window.setTimeout(() => setSwinging(false), SWING_DURATION_MS);

    // 3-phase swing animation: mid → down → idle (fast return)
    swingPhaseTimersRef.current.forEach((t) => window.clearTimeout(t));
    swingPhaseTimersRef.current = [];
    setSwingPhase("mid");
    swingPhaseTimersRef.current.push(
      window.setTimeout(() => setSwingPhase("down"), 90),
      window.setTimeout(() => setSwingPhase("idle"), 240),
    );

    let popped = 0;
    bubblesRef.current.forEach((b) => {
      if (b.isPopping) return;
      const dx = b.x - mouseRef.current.x;
      const dy = b.y - mouseRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) < SWING_RANGE + b.radius) {
        b.isPopping = true;
        spawnPopEffects(b.x, b.y, b.radius);
        playPopSound(popped);
        popped++;
      }
    });
    if (popped > 0) setScore((s) => s + popped);
  };

  const drawPixelBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    const img = bubbleImgRef.current;
    const size = b.radius * 2.2; // sprite is slightly bigger than the radius circle
    if (img && img.complete) {
      ctx.drawImage(img, b.x - size / 2, b.y - size / 2, size, size);
    } else {
      // Fallback while image loads
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 4;
      ctx.fillStyle = "rgba(140, 180, 230, 0.35)";
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  };

  const drawPixelPop = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    const progress = b.popFrame / 12;
    ctx.fillStyle = progress < 0.5 ? "#FACC15" : "white";
    ctx.globalAlpha = 1 - progress;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + progress * 2;
      const d = b.radius * (0.5 + progress * 1.5);
      const size = 5 * (1 - progress);
      ctx.fillRect(b.x + Math.cos(angle) * d - size / 2, b.y + Math.sin(angle) * d - size / 2, size, size);
    }
    ctx.restore();
  };

  const drawPixelBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = "#0a3470";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#1e56a0";
    ctx.fillRect(0, height * 0.18, width, height);
    ctx.fillStyle = "#2168b8";
    ctx.fillRect(0, height * 0.5, width, height);

    // Light rays
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 5; i++) {
      const rx = (width / 5) * i + 10;
      ctx.fillRect(rx, 0, 14, height * 0.55);
    }

    // BG bubbles
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const bgBubbles: [number, number, number][] = [
      [0.12, 0.15, 3], [0.85, 0.22, 4], [0.45, 0.12, 3],
      [0.7, 0.42, 3], [0.25, 0.38, 3], [0.92, 0.55, 3],
      [0.08, 0.62, 3], [0.55, 0.28, 4], [0.38, 0.55, 3],
    ];
    bgBubbles.forEach(([fx, fy, r]) => {
      const x = fx * width;
      const y = fy * height;
      ctx.fillRect(x, y, r, r);
      ctx.fillRect(x - 1, y + 1, 1, r - 2);
      ctx.fillRect(x + r, y + 1, 1, r - 2);
    });

    // Distant fish
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    const drawFish = (fx: number, fy: number, dir: number) => {
      const x = fx * width;
      const y = fy * height;
      ctx.fillRect(x, y, 12 * dir, 3);
      ctx.fillRect(x + 3 * dir, y - 2, 5 * dir, 3);
      ctx.fillRect(x - 3 * dir, y - 1, 3 * dir, 5);
    };
    drawFish(0.2, 0.32, 1);
    drawFish(0.75, 0.5, -1);
    drawFish(0.45, 0.7, 1);

    const groundY = height - 90;
    ctx.fillStyle = "#5dbcae";
    ctx.fillRect(0, groundY, width, 90);
    ctx.fillStyle = "#4ba798";
    ctx.fillRect(0, groundY, width, 4);
    ctx.fillStyle = "#7dd5c9";
    for (let i = 0; i < 22; i++) {
      const sx = (i * 41 + 13) % width;
      const sy = groundY + 8 + ((i * 29) % 70);
      ctx.fillRect(sx, sy, 3, 2);
    }
    ctx.fillStyle = "#3d8c80";
    for (let i = 0; i < 14; i++) {
      const sx = (i * 67 + 5) % width;
      const sy = groundY + 18 + ((i * 23) % 60);
      ctx.fillRect(sx, sy, 2, 2);
    }

    const drawSeaweed = (x: number, h: number, swayPhase: number) => {
      const sway = Math.sin((Date.now() / 600) + swayPhase) * 3;
      ctx.fillStyle = "#0d3b2f";
      ctx.fillRect(x, groundY - h, 12, h);
      ctx.fillStyle = "#1b4d3e";
      ctx.fillRect(x + 2, groundY - h + 2, 8, h - 4);
      ctx.fillStyle = "#266a55";
      ctx.fillRect(x + 4 + sway, groundY - h + 6, 5, 10);
      ctx.fillRect(x + 4 + sway, groundY - h + 22, 5, 12);
      ctx.fillRect(x + 4 + sway, groundY - h + 38, 5, 12);
      ctx.fillRect(x - 5 + sway, groundY - h + 16, 5, 12);
      ctx.fillRect(x + 12 - sway, groundY - h + 32, 5, 12);
    };
    drawSeaweed(15, 120, 0);
    drawSeaweed(45, 90, 1.2);
    drawSeaweed(80, 140, 2.4);
    drawSeaweed(width - 40, 110, 6);
    drawSeaweed(width - 80, 85, 7.2);
    drawSeaweed(width - 120, 130, 8.4);

    // Red coral
    const cx = width - 100;
    const cy = groundY;
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(cx, cy - 65, 14, 65);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cx + 2, cy - 63, 10, 63);
    ctx.fillStyle = "#fb7185";
    ctx.fillRect(cx + 4, cy - 55, 3, 50);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cx - 18, cy - 45, 50, 10);
    ctx.fillRect(cx - 26, cy - 70, 10, 40);

    // Purple coral
    const px = width - 160;
    ctx.fillStyle = "#7e22ce";
    ctx.fillRect(px, cy - 35, 10, 35);
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(px + 2, cy - 33, 6, 33);
    ctx.fillRect(px - 8, cy - 28, 10, 8);
    ctx.fillRect(px + 10, cy - 26, 10, 8);

    // Pink coral
    const drawPinkCoral = (x: number) => {
      ctx.fillStyle = "#be185d";
      ctx.fillRect(x, cy - 20, 7, 20);
      ctx.fillStyle = "#ec4899";
      ctx.fillRect(x + 1, cy - 18, 5, 18);
      ctx.fillRect(x - 4, cy - 14, 4, 5);
      ctx.fillRect(x + 7, cy - 12, 4, 5);
    };
    drawPinkCoral(width * 0.3);

    // Treasure
    const tx = width - 50;
    ctx.fillStyle = "#9a3412";
    ctx.fillRect(tx, cy - 22, 22, 22);
    ctx.fillStyle = "#f97316";
    ctx.fillRect(tx + 1, cy - 20, 20, 20);
    ctx.fillStyle = "#fed7aa";
    ctx.fillRect(tx + 3, cy - 17, 16, 3);
    ctx.fillStyle = "#ea580c";
    ctx.fillRect(tx + 8, cy - 13, 5, 9);

    // Anchor
    ctx.fillStyle = "#854d0e";
    const ax = width * 0.4;
    const ay = cy + 30;
    ctx.fillRect(ax - 1, ay - 1, 5, 18);
    ctx.fillRect(ax - 7, ay - 3, 17, 5);
    ctx.fillRect(ax - 11, ay + 12, 25, 4);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(ax, ay, 3, 16);
    ctx.fillRect(ax - 6, ay - 2, 15, 3);
    ctx.fillRect(ax - 10, ay + 13, 23, 3);

    // Starfish
    const stx = width * 0.5;
    const sty = cy + 55;
    ctx.fillStyle = "#facc15";
    ctx.fillRect(stx - 2, sty - 5, 4, 10);
    ctx.fillRect(stx - 5, sty - 2, 10, 4);

    // Sparkles
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    [
      [0.15, 0.42], [0.72, 0.31], [0.5, 0.58], [0.88, 0.5],
      [0.3, 0.65], [0.6, 0.45], [0.4, 0.25],
    ].forEach(([fx, fy]) => {
      const x = fx * width;
      const y = fy * height;
      ctx.fillRect(x, y, 2, 2);
    });
  };

  const update = useCallback((timestamp: number) => {
    if (gameStateRef.current !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (timestamp - lastSpawnRef.current > BUBBLE_SPAWN_RATE) {
      spawnBubble();
      lastSpawnRef.current = timestamp;
    }

    // Clear canvas (background is now CSS image on stage div)
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    setCharPos((prev) => {
      const dx = mouseRef.current.x - prev.x;
      const dy = mouseRef.current.y - prev.y;
      return { x: prev.x + dx * 0.2, y: prev.y + dy * 0.2 };
    });

    bubblesRef.current = bubblesRef.current.filter((b) => {
      if (b.isPopping) {
        b.popFrame++;
        drawPixelPop(ctx, b);
        return b.popFrame < 12;
      }
      b.y -= b.speed;
      drawPixelBubble(ctx, b);
      return b.y + b.radius > -50;
    });

    // Shockwave rings
    shockwavesRef.current = shockwavesRef.current.filter((sw) => {
      sw.radius += (sw.maxRadius - sw.radius) * 0.18;
      sw.life -= 0.06;
      if (sw.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = sw.life * 0.8;
      ctx.strokeStyle = "#FACC15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      // Inner ring
      ctx.globalAlpha = sw.life * 0.5;
      ctx.strokeStyle = "#FEF3C7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return true;
    });

    // Particles
    particlesRef.current = particlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
      p.vx *= 0.97;
      p.vy *= 0.99;
      p.life -= 0.025;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.floor(p.x - s / 2), Math.floor(p.y - s / 2), s, s);
      // Cross sparkle for bigger particles
      if (s >= 3) {
        ctx.fillRect(Math.floor(p.x - s / 2 - 1), Math.floor(p.y - 0.5), 1, 1);
        ctx.fillRect(Math.floor(p.x + s / 2), Math.floor(p.y - 0.5), 1, 1);
      }
      ctx.restore();
      return true;
    });

    // Score popups
    popupsRef.current = popupsRef.current.filter((p) => {
      p.y -= 1.4;
      p.life -= 0.022;
      if (p.life <= 0) return false;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.3);
      ctx.font = "bold 16px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#000";
      ctx.strokeText(`+${p.value}`, p.x, p.y);
      ctx.fillStyle = "#FACC15";
      ctx.fillText(`+${p.value}`, p.x, p.y);
      ctx.restore();
      return true;
    });

    animationFrameRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = GAME_W;
      canvasRef.current.height = GAME_H;
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    // Preload bubble sprite
    const img = new Image();
    img.src = "/bubble.png";
    img.onload = () => { bubbleImgRef.current = img; };
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;
    animationFrameRef.current = requestAnimationFrame(update);
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.clearInterval(timer);
    };
  }, [gameState, endGame, update]);

  useEffect(() => () => {
    if (swingTimerRef.current) window.clearTimeout(swingTimerRef.current);
    swingPhaseTimersRef.current.forEach((t) => window.clearTimeout(t));
    stopBgm();
  }, []);

  // React to bgmOn toggle during gameplay
  useEffect(() => {
    if (gameState === "playing") {
      if (bgmOn) startBgm();
      else stopBgm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgmOn, gameState]);

  const stageToGameCoords = (clientX: number, clientY: number) => {
    if (!stageRef.current) return { x: 0, y: 0 };
    const rect = stageRef.current.getBoundingClientRect();
    const scaleX = GAME_W / rect.width;
    const scaleY = GAME_H / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    mouseRef.current = stageToGameCoords(e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    mouseRef.current = stageToGameCoords(e.clientX, e.clientY);
    swing();
  };

  const timePercent = (timeLeft / GAME_DURATION) * 100;
  const isLowTime = timeLeft <= 5;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-2 sm:p-6 font-pixel">
      {/* Phone-like portrait frame */}
      <div
        className="relative w-full max-w-[420px] bg-black rounded-[36px] sm:rounded-[44px] p-2 sm:p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] border-[3px] border-zinc-700"
        style={{ aspectRatio: `${GAME_W} / ${GAME_H}`, maxHeight: "95vh" }}
      >
        {/* Notch */}
        <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 w-28 h-5 sm:h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
        </div>

        {/* Game stage */}
        <div
          ref={stageRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          className="relative w-full h-full overflow-hidden rounded-[28px] sm:rounded-[34px] cursor-none touch-none select-none"
          style={{
            aspectRatio: `${GAME_W} / ${GAME_H}`,
            backgroundColor: "#0d4daa",
            backgroundImage: "url('/background.png')",
            backgroundSize: "cover",
            backgroundPosition: "bottom center",
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
          }}
        >
          {/* CRT scanlines */}
          <div className="absolute inset-0 z-40 pointer-events-none opacity-15 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_2px]" />

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ imageRendering: "pixelated" }}
          />

          {gameState === "playing" && (
            <>
              {/* Character — swaps between idle and swing pose */}
              <motion.div
                animate={{
                  left: `${(charPos.x / GAME_W) * 100}%`,
                  top: `${(charPos.y / GAME_H) * 100}%`,
                }}
                transition={{
                  type: "spring", stiffness: 280, damping: 20,
                }}
                style={{
                  position: "absolute",
                  width: "27%",
                  marginLeft: "-13.5%",
                  marginTop: "-13.5%",
                  zIndex: 20,
                  pointerEvents: "none",
                }}
              >
                {/* Preload all sprites to avoid flicker on phase change */}
                <img src="/midswing.png" alt="" style={{ display: "none" }} />
                <img src="/swing.png" alt="" style={{ display: "none" }} />

                {swingPhase === "idle" && (
                  <motion.img
                    src="/character.png"
                    alt="character"
                    draggable={false}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    style={{ imageRendering: "pixelated", width: "100%", height: "auto", display: "block" }}
                    className="drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]"
                  />
                )}
                {swingPhase === "mid" && (
                  <img
                    src="/midswing.png"
                    alt="mid-swing"
                    draggable={false}
                    style={{ imageRendering: "pixelated", width: "115%", height: "auto", display: "block", marginLeft: "-7%" }}
                    className="drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]"
                  />
                )}
                {swingPhase === "down" && (
                  <img
                    src="/swing.png"
                    alt="swing"
                    draggable={false}
                    style={{ imageRendering: "pixelated", width: "100%", height: "auto", display: "block" }}
                    className="drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]"
                  />
                )}
              </motion.div>

              {/* Bat impact — white flash burst at impact point (below character) */}
              {swinging && (
                <>
                  {/* Brief white flash overlay */}
                  <motion.div
                    key={`flash-${Date.now()}`}
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="absolute inset-0 bg-white pointer-events-none z-[14]"
                  />
                  {/* Impact starburst at bat-hit location (below-front of character) */}
                  <motion.div
                    key={`impact-${Date.now()}`}
                    initial={{ scale: 0, opacity: 1, rotate: -10 }}
                    animate={{ scale: [0, 1.8, 2.2], opacity: [1, 1, 0], rotate: 20 }}
                    transition={{ duration: SWING_DURATION_MS / 1000, times: [0, 0.35, 1] }}
                    style={{
                      position: "absolute",
                      left: `${(charPos.x / GAME_W) * 100}%`,
                      top: `${((charPos.y + 40) / GAME_H) * 100}%`,
                      width: "26%",
                      aspectRatio: "1",
                      marginLeft: "-13%",
                      marginTop: "-13%",
                      zIndex: 19,
                      pointerEvents: "none",
                    }}
                  >
                    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ shapeRendering: "crispEdges" }}>
                      <polygon points="50,0 60,30 92,20 68,42 100,50 68,58 92,80 60,70 50,100 40,70 8,80 32,58 0,50 32,42 8,20 40,30" fill="#FACC15" stroke="#000" strokeWidth="4" />
                      <polygon points="50,15 57,32 80,25 65,43 85,50 65,57 80,75 57,68 50,85 43,68 20,75 35,57 15,50 35,43 20,25 43,32" fill="#FEF3C7" />
                      <polygon points="50,32 55,46 65,50 55,54 50,68 45,54 35,50 45,46" fill="#FFFFFF" />
                    </svg>
                  </motion.div>
                  {/* Lightning crack lines radiating from impact */}
                  <motion.svg
                    key={`crack-${Date.now()}`}
                    initial={{ scale: 0.3, opacity: 1 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: SWING_DURATION_MS / 1000 }}
                    viewBox="0 0 100 100"
                    style={{
                      position: "absolute",
                      left: `${(charPos.x / GAME_W) * 100}%`,
                      top: `${((charPos.y + 40) / GAME_H) * 100}%`,
                      width: "40%",
                      aspectRatio: "1",
                      marginLeft: "-20%",
                      marginTop: "-20%",
                      zIndex: 18,
                      pointerEvents: "none",
                    }}
                  >
                    <g stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round">
                      <polyline points="50,50 70,40 78,46 90,38" />
                      <polyline points="50,50 30,42 22,48 8,40" />
                      <polyline points="50,50 60,30 56,20 66,10" />
                      <polyline points="50,50 38,72 44,82 36,94" />
                      <polyline points="50,50 72,62 80,58 92,68" />
                      <polyline points="50,50 28,62 22,58 10,68" />
                    </g>
                    <g stroke="#FACC15" strokeWidth="1.5" fill="none" strokeLinecap="round">
                      <polyline points="50,50 70,40 78,46 90,38" />
                      <polyline points="50,50 30,42 22,48 8,40" />
                      <polyline points="50,50 60,30 56,20 66,10" />
                      <polyline points="50,50 38,72 44,82 36,94" />
                      <polyline points="50,50 72,62 80,58 92,68" />
                      <polyline points="50,50 28,62 22,58 10,68" />
                    </g>
                  </motion.svg>
                </>
              )}

              {/* HUD top bar */}
              <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none">
                <div className="flex items-center justify-between gap-2">
                  {/* Score chip */}
                  <div className="bg-black/60 backdrop-blur-sm border-2 border-white/30 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                    <span className="text-[8px] text-yellow-300">SCORE</span>
                    <span className="text-base text-white font-bold">{score}</span>
                  </div>
                  {/* High score chip */}
                  <div className="bg-black/60 backdrop-blur-sm border-2 border-white/30 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                    <span className="text-[8px] text-yellow-300">★</span>
                    <span className="text-xs text-white">{highScore}</span>
                  </div>
                </div>
                {/* Time progress bar */}
                <div className="mt-2 bg-black/60 backdrop-blur-sm rounded-full h-3 border-2 border-white/30 overflow-hidden">
                  <motion.div
                    animate={{ width: `${timePercent}%` }}
                    transition={{ duration: 0.3 }}
                    className={`h-full ${isLowTime ? "bg-red-500" : "bg-gradient-to-r from-cyan-400 to-blue-500"}`}
                  />
                </div>
                <div className="text-center mt-1">
                  <span className={`text-[10px] ${isLowTime ? "text-red-400 animate-pulse" : "text-white"} drop-shadow-[1px_1px_0_rgba(0,0,0,0.8)]`}>
                    ⏱ {timeLeft}s
                  </span>
                </div>
              </div>

              {/* Bottom-right controls: BGM toggle + Restart */}
              <div className="absolute bottom-3 right-3 z-30 pointer-events-auto flex gap-2">
                <button
                  onClick={() => setBgmOn((v) => !v)}
                  aria-label="toggle music"
                  className="bg-black/70 backdrop-blur-sm border-2 border-white/50 text-white w-11 h-11 rounded-full flex items-center justify-center text-base hover:bg-white/20 active:scale-95 transition"
                >
                  {bgmOn ? "🎵" : "🔇"}
                </button>
                <button
                  onClick={endGame}
                  aria-label="restart"
                  className="bg-black/70 backdrop-blur-sm border-2 border-white/50 text-white w-11 h-11 rounded-full flex items-center justify-center text-base hover:bg-white/20 active:scale-95 transition"
                >
                  ⟲
                </button>
              </div>
            </>
          )}

          <AnimatePresence>
            {(gameState === "menu" || gameState === "gameover") && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-6"
              >
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  className="w-full bg-gradient-to-b from-blue-800 to-blue-950 border-4 border-cyan-400 rounded-3xl p-6 shadow-[0_20px_50px_-10px_rgba(34,211,238,0.4)] text-center"
                >
                  {gameState === "menu" ? (
                    <>
                      <div className="text-[9px] sm:text-[10px] text-cyan-300 tracking-[0.25em] mb-2">by codiumlab</div>
                      <h1 className="text-3xl sm:text-4xl text-white tracking-tight leading-tight drop-shadow-[3px_3px_0_rgba(0,0,0,0.5)] mb-2">
                        BUBBLE
                      </h1>
                      <h1 className="text-3xl sm:text-4xl text-yellow-300 tracking-tight leading-tight drop-shadow-[3px_3px_0_rgba(0,0,0,0.5)] mb-8">
                        POP
                      </h1>

                      <div className="bg-black/40 rounded-2xl p-5 mb-6 border border-white/10">
                        <ul className="text-sm text-blue-100 leading-loose space-y-1.5 text-center tracking-tight">
                          <li>🖱️ 마우스로 이동</li>
                          <li>💥 클릭으로 휘두르기</li>
                          <li>🫧 물방울 터뜨리기!</li>
                        </ul>
                      </div>

                      <div className="flex items-center justify-center gap-2 mb-6 text-sm text-cyan-300">
                        <span>최고 점수</span>
                        <span className="text-yellow-300 text-base">★</span>
                        <span className="text-white font-bold text-base">{highScore}</span>
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        whileHover={{ scale: 1.03 }}
                        onClick={startGame}
                        className="w-full bg-gradient-to-b from-yellow-300 to-yellow-500 text-black px-8 py-5 font-bold text-2xl border-b-4 border-yellow-700 rounded-2xl shadow-[0_6px_0_rgba(0,0,0,0.3)] tracking-widest"
                      >
                        START
                      </motion.button>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-red-300 tracking-[0.3em] mb-2">FINISHED</div>
                      <h1 className="text-4xl sm:text-5xl text-white tracking-[0.15em] mb-6 drop-shadow-[3px_3px_0_rgba(0,0,0,0.5)]">
                        GAME OVER
                      </h1>

                      <div className="bg-black/40 rounded-2xl p-5 mb-6 border border-white/10">
                        <div className="text-sm text-cyan-300 mb-2">SCORE</div>
                        <div className="text-6xl text-yellow-300 font-bold tracking-widest drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
                          {score}
                        </div>
                        {score > 0 && score >= highScore && (
                          <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 0.6, repeat: Infinity }}
                            className="text-yellow-300 text-base mt-4"
                          >
                            ⭐ NEW HIGH SCORE ⭐
                          </motion.div>
                        )}
                      </div>

                      <div className="flex items-center justify-center gap-2 mb-6 text-sm text-cyan-300">
                        <span>최고 점수</span>
                        <span className="text-yellow-300 text-base">★</span>
                        <span className="text-white font-bold text-base">{highScore}</span>
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        whileHover={{ scale: 1.03 }}
                        onClick={startGame}
                        className="w-full bg-gradient-to-b from-cyan-300 to-cyan-500 text-black px-8 py-5 font-bold text-2xl border-b-4 border-cyan-700 rounded-2xl shadow-[0_6px_0_rgba(0,0,0,0.3)] tracking-widest"
                      >
                        REPLAY
                      </motion.button>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

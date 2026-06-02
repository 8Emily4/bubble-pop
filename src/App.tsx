/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

// --- Constants & Types ---
const GAME_DURATION = 15;
const BUBBLE_SPAWN_RATE = 1000;
const KKABI_AI_SPEED = 3.5;

interface Bubble {
  id: number;
  x: number;
  y: number;
  radius: number;
  speed: number;
  isPopping: boolean;
  popFrame: number;
}

interface KkabiState {
  x: number;
  y: number;
  targetId: number | null;
  isSwinging: boolean;
  swingTimer: number;
}

// --- Helper Functions ---
const getRandom = (min: number, max: number) => Math.random() * (max - min) + min;

const KkabiSprite = ({ isSwinging }: { isSwinging: boolean }) => (
  <div className="relative scale-[1.3]">
    {/* Body - Rounded / Organic shape instead of Square */}
    <div className="w-[70px] h-[85px] bg-[#539ba0] border-[4px] border-black relative rounded-[40%_40%_30%_30%] shadow-[inset_-6px_-6px_0_rgba(0,0,0,0.15)]">
      {/* Eyes - Precise Grumpy Arcade Look (integrated into rounded head) */}
      <div className="absolute top-[22px] left-[12px] w-5 h-4 flex flex-col">
        <div className="w-full h-[5px] bg-[#2b5155] border-b-[2px] border-black" />
        <div className="w-full h-full bg-white border-x-[2px] border-b-[2px] border-black flex items-center justify-center">
          <div className="w-2.5 h-2.5 bg-black" />
        </div>
      </div>
      <div className="absolute top-[22px] right-[12px] w-5 h-4 flex flex-col">
        <div className="w-full h-[5px] bg-[#2b5155] border-b-[2px] border-black" />
        <div className="w-full h-full bg-white border-x-[2px] border-b-[2px] border-black flex items-center justify-center">
          <div className="w-2.5 h-2.5 bg-black" />
        </div>
      </div>
      
      {/* Mouth - Simple dark line */}
      <div className="absolute top-[48px] left-1/2 -translate-x-1/2 w-8 h-[3px] bg-black" />

      {/* Leopard Cloth - Rounded bottom to match body */}
      <div className="absolute bottom-0 w-full h-[35px] bg-[#cc8a2a] border-t-[3px] border-black rounded-b-[25%] overflow-hidden">
        <div className="absolute top-2 left-3 w-3 h-2 bg-black opacity-40 rounded-full" />
        <div className="absolute top-5 right-4 w-4 h-3 bg-black opacity-40 rounded-full" />
        <div className="absolute bottom-3 left-8 w-3 h-4 bg-black opacity-40 rounded-full" />
      </div>
    </div>
    
    {/* Horns - Small points */}
    <div className="absolute -top-[8px] left-[22px] w-3 h-5 bg-[#2b5155] border-[3px] border-black rounded-t-full" />
    <div className="absolute -top-[8px] right-[22px] w-3 h-5 bg-[#2b5155] border-[3px] border-black rounded-t-full" />

    {/* Ears w/ Yellow Earrings */}
    <div className="absolute top-[30px] -left-[14px] w-5 h-6 bg-[#539ba0] border-[3px] border-black rounded-l-full">
      <div className="absolute bottom-[-2px] right-0 w-2.5 h-2.5 bg-yellow-400 border-[2px] border-black" />
    </div>
    <div className="absolute top-[30px] -right-[14px] w-5 h-6 bg-[#539ba0] border-[3px] border-black rounded-r-full">
      <div className="absolute bottom-[-2px] left-0 w-2.5 h-2.5 bg-yellow-400 border-[2px] border-black" />
    </div>
    
    {/* Club (Bat) - Brown with spikes */}
    <motion.div 
      animate={isSwinging ? { rotate: [0, 125, 0], y: [0, 10, 0] } : { rotate: 18 }}
      transition={{ duration: 0.22 }}
      className="absolute top-6 -right-16 w-9 h-24 bg-[#a66a2d] border-[4px] border-black rounded-b-md origin-bottom shadow-lg"
    >
      <div className="absolute top-4 left-2 w-2 h-2 bg-black opacity-20" />
      <div className="absolute top-12 right-2 w-2 h-2 bg-black opacity-20" />
      <div className="absolute top-20 left-3 w-2 h-2 bg-black opacity-20" />
    </motion.div>
  </div>
);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [userScore, setUserScore] = useState(0);
  const [kkabiScore, setKkabiScore] = useState(0);
  
  const bubblesRef = useRef<Bubble[]>([]);
  const kkabiRef = useRef<KkabiState>({ x: 0, y: 0, targetId: null, isSwinging: false, swingTimer: 0 });
  const lastSpawnRef = useRef(0);
  const bubbleIdCounter = useRef(0);
  const animationFrameRef = useRef(0);
  
  const [kkabiPos, setKkabiPos] = useState({ x: 0, y: 0 });
  const [isKkabiSwinging, setIsKkabiSwinging] = useState(false);

  const startGame = () => {
    setGameState("playing");
    setTimeLeft(GAME_DURATION);
    setUserScore(0);
    setKkabiScore(0);
    bubblesRef.current = [];
    kkabiRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 3, targetId: null, isSwinging: false, swingTimer: 0 };
    setKkabiPos({ x: kkabiRef.current.x, y: kkabiRef.current.y });
  };

  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem("bubble_pang_high_score");
    return saved ? parseInt(saved, 10) : 0;
  });

  const endGame = useCallback(() => {
    setGameState("gameover");
    setUserScore(s => {
      if (s > highScore) {
        setHighScore(s);
        localStorage.setItem("bubble_pang_high_score", s.toString());
      }
      return s;
    });
  }, [highScore]);

  const spawnBubble = (width: number, height: number) => {
    const radius = getRandom(25, 40);
    const newBubble: Bubble = {
      id: bubbleIdCounter.current++,
      x: getRandom(radius, width - radius),
      y: height + radius * 2,
      radius,
      speed: getRandom(2, 4),
      isPopping: false,
      popFrame: 0,
    };
    bubblesRef.current.push(newBubble);
  };

  const popBubble = (id: number, byUser: boolean) => {
    const bubble = bubblesRef.current.find((b) => b.id === id);
    if (bubble && !bubble.isPopping) {
      bubble.isPopping = true;
      if (byUser) {
        setUserScore((s) => s + 1);
      } else {
        setKkabiScore((s) => s + 1);
        kkabiRef.current.isSwinging = true;
        kkabiRef.current.swingTimer = 12;
        setIsKkabiSwinging(true);
      }
    }
  };

  const update = (timestamp: number) => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;

    if (timestamp - lastSpawnRef.current > BUBBLE_SPAWN_RATE) {
      spawnBubble(width, height);
      lastSpawnRef.current = timestamp;
    }

    const kkabi = kkabiRef.current;
    if (kkabi.swingTimer > 0) {
      kkabi.swingTimer--;
      if (kkabi.swingTimer === 0) {
        kkabi.isSwinging = false;
        setIsKkabiSwinging(false);
        kkabi.targetId = null;
      }
    }

    if (!kkabi.isSwinging) {
      if (kkabi.targetId === null) {
        const targets = bubblesRef.current.filter(b => !b.isPopping && b.y < height * 0.8 && b.y > 100);
        if (targets.length > 0) {
          const nearest = targets.reduce((prev, curr) => (prev.y < curr.y ? prev : curr));
          kkabi.targetId = nearest.id;
        }
      } else {
        const target = bubblesRef.current.find(b => b.id === kkabi.targetId);
        if (target && !target.isPopping) {
          const dx = target.x - kkabi.x;
          const dy = (target.y - 12) - kkabi.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 15) {
            popBubble(target.id, false);
          } else {
            kkabi.x += (dx / dist) * KKABI_AI_SPEED;
            kkabi.y += (dy / dist) * KKABI_AI_SPEED;
          }
        } else {
          kkabi.targetId = null;
        }
      }
    }
    setKkabiPos({ x: kkabi.x, y: kkabi.y });

    // Pixel Art Background Rendering
    drawPixelBackground(ctx, width, height);

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

    animationFrameRef.current = requestAnimationFrame(update);
  };

  const drawPixelBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    // Clear blue translucent fill
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(173, 216, 230, 0.4)"; 
    ctx.stroke();
    ctx.fill();

    // Prominent Pixel Glint
    ctx.fillStyle = "white";
    ctx.fillRect(b.x - b.radius * 0.4, b.y - b.radius * 0.4, 8, 8);
    ctx.restore();
  };

  const drawPixelPop = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    const progress = b.popFrame / 12;
    // Sparkle dust effect like in the image
    ctx.fillStyle = progress < 0.5 ? "#FACC15" : "white";
    const opacity = 1 - progress;
    ctx.globalAlpha = opacity;
    
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + progress * 2;
        const d = b.radius * (0.5 + progress * 1.5);
        const size = 4 * (1 - progress);
        ctx.fillRect(b.x + Math.cos(angle) * d - size/2, b.y + Math.sin(angle) * d - size/2, size, size);
    }
    ctx.restore();
  };

  const drawPixelBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Solid Deep Blue Ocean
    ctx.fillStyle = "#1e56a0";
    ctx.fillRect(0, 0, width, height);

    // Light Teal Seabed Floor
    ctx.fillStyle = "#5dbcae"; 
    ctx.fillRect(0, height - 70, width, 70);
    
    // Seaweed - Simple pixel clusters
    ctx.fillStyle = "#1b4d3e";
    const drawSeaweed = (x: number, h: number) => {
      ctx.fillRect(x, height - 70 - h, 12, h);
      ctx.fillRect(x - 4, height - 70 - h + 20, 4, 15);
      ctx.fillRect(x + 12, height - 70 - h + 40, 4, 15);
    };

    drawSeaweed(40, 100);
    drawSeaweed(80, 140);
    drawSeaweed(140, 80);
    drawSeaweed(width - 100, 120);
    drawSeaweed(width - 160, 90);

    // Coral - Red branched
    ctx.fillStyle = "#ef4444";
    const cx = width - 120;
    const cy = height - 70;
    ctx.fillRect(cx, cy - 60, 15, 60);
    ctx.fillRect(cx - 20, cy - 40, 50, 10);
    ctx.fillRect(cx - 30, cy - 70, 10, 40);
    ctx.fillRect(cx + 30, cy - 55, 10, 25);

    // Small rocks/treasure
    ctx.fillStyle = "#cc8a2a";
    ctx.fillRect(width * 0.4, cy + 20, 15, 10);
    ctx.fillRect(width * 0.6, cy + 40, 10, 8);
  };

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (gameState === "playing") {
      animationFrameRef.current = requestAnimationFrame(update);
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            endGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        cancelAnimationFrame(animationFrameRef.current);
        clearInterval(timer);
      };
    }
  }, [gameState, endGame]);

  const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

    const clicked = bubblesRef.current.find(b => {
      if (b.isPopping) return false;
      const d = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
      return d < b.radius + 15;
    });

    if (clicked) {
      popBubble(clicked.id, true);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black select-none font-pixel uppercase">
      {/* CRT Scanline Effect Overlay */}
      <div className="absolute inset-0 z-40 pointer-events-none opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
      
      <canvas
        ref={canvasRef}
        onMouseDown={handleInteraction}
        onTouchStart={handleInteraction}
        className="w-full h-full cursor-crosshair"
      />

      {/* --- HUD --- */}
      <AnimatePresence>
        {gameState === "playing" && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Top Bar HUD */}
            <div className="absolute top-8 w-full flex flex-col items-center gap-1 text-white">
              <div className="text-[10px] text-yellow-400 drop-shadow-md">HIGH SCORE: {highScore.toString().padStart(5, '0')}</div>
              <div className="text-2xl drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]">TIME: {timeLeft}s</div>
              <div className="text-xl drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)] flex gap-4">
                <span className="text-blue-300">ME:{userScore}</span> 
                <span>VS</span> 
                <span className="text-red-400">KKABI:{kkabiScore}</span>
              </div>
            </div>

            {/* Kkabi Character Overlay */}
            <div 
              style={{ 
                position: 'absolute', 
                left: kkabiPos.x, 
                top: kkabiPos.y, 
                transform: 'translate(-50%, -50%)',
                zIndex: 10
              }}
            >
              <div className="relative">
                <KkabiSprite isSwinging={isKkabiSwinging} />
                
                {/* Impact Effect Cloud when swinging */}
                {isKkabiSwinging && (
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1.3, opacity: 0.9, y: [0, -5, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-28 h-18 pointer-events-none"
                  >
                    {/* Retro Impact Smoke */}
                    <div className="w-full h-full bg-[#cc8a2a] rounded-full border-2 border-white/50" />
                  </motion.div>
                )}
              </div>
            </div>

            {/* Restart Button */}
            <div className="absolute bottom-6 left-6 pointer-events-auto">
              <button
                onClick={() => endGame()}
                className="bg-black border-2 border-white text-white px-5 py-2 text-[10px] tracking-widest uppercase hover:bg-white hover:text-black transition-all active:scale-95"
              >
                RESTART
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Overlay (Menu/Gameover) --- */}
      <AnimatePresence>
        {(gameState === "menu" || gameState === "gameover") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <div className="text-center p-12 bg-blue-900 border-8 border-white shadow-[12px_12px_0_rgba(0,0,0,0.5)] max-w-lg w-full relative">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-6 py-2 font-bold text-xs border-4 border-black">
                ARCADE CLASSIC
              </div>

              <h1 className="text-4xl text-white mb-12 tracking-[0.2em] leading-relaxed drop-shadow-[4px_4px_0_rgba(0,0,0,0.5)]">
                {gameState === "menu" ? "BUBBLE\nPANG PANG" : "GAME OVER"}
              </h1>

              {gameState === "gameover" && (
                <div className="mb-12 space-y-6">
                  <div className="text-xl text-blue-200">
                    FINAL SCORE: {userScore}
                  </div>
                  <div className="text-4xl text-white font-bold tracking-widest border-y-4 border-white/20 py-4">
                    {userScore > kkabiScore ? "USER WIN!" : userScore === kkabiScore ? "DRAW GAME!" : "KKABI WIN!"}
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startGame}
                  className="bg-white text-black px-12 py-4 font-bold text-xl border-4 border-black shadow-[6px_6px_0_#000]"
                >
                  {gameState === "menu" ? "PLAYER 1 START" : "REPLAY"}
                </motion.button>
                
                <p className="text-[10px] text-yellow-400 tracking-widest animate-pulse mt-4">
                  - PRESS BUTTON TO START -
                </p>
              </div>
              
              <div className="mt-10 pt-6 border-t-2 border-white/10 flex justify-between items-center text-[10px] text-blue-300">
                <span>© 2026 USER MADE</span>
                <span>KKABI LEGACY</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

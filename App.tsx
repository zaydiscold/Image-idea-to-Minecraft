
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { generateImage, generateVoxelScene } from './services/gemini';
import { extractHtmlFromText, hideBodyText, zoomCamera } from './utils/html';

// --- Constants & Types ---

const SAMPLE_PROMPTS = [
    "A modern house with a pool",
    "A giant diamond sword in a stone",
    "A nether fortress tower",
    "A cozy cottage in a flower forest",
    "A futuristic redstone machine",
    "A statue of a dragon"
];

const SPLASH_PHRASES = [
    "Follow the train, CJ!",
    "Creeper? Aww man!",
    "Also try Terraria!",
    "100% pure voxels!",
    "Procedural generation!",
    "Look at the blocks!",
    "Now with 50% more AI!",
    "Build it yourself!",
    "Pixels galore!",
    "Don't dig straight down!",
    "Herobrine removed!",
    "Uses Google Gemini!",
    "Infinite possibilities!",
    "Diamonds inside!",
    "Punch the wood!",
    "Construct your dreams!",
    "Blocks, blocks, blocks!"
];

interface Example {
  img: string;
  html: string;
}

const EXAMPLES: Example[] = [
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example1.png', html: '/examples/example1.html' },
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example2.png', html: '/examples/example2.html' },
  { img: 'https://www.gstatic.com/aistudio/starter-apps/image_to_voxel/example3.png', html: '/examples/example3.html' },
];

// --- Helper Components ---

const McButton: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    variant?: 'stone' | 'wood' | 'grass' | 'sand';
    children: React.ReactNode;
}> = ({ onClick, disabled, className = '', variant = 'stone', children }) => {
    let bgClass = "bg-[#7d7d7d] text-[#ddd]";
    let borderLight = "border-[#a8a8a8]";
    let borderDark = "border-[#555555]";
    let hoverClass = "hover:bg-[#8b8b8b]";

    if (variant === 'wood') {
        bgClass = "bg-[#5c3c22] text-[#ffedcc]";
        borderLight = "border-[#7a5332]";
        borderDark = "border-[#382313]";
        hoverClass = "hover:bg-[#6b4628]";
    } else if (variant === 'grass') {
        bgClass = "bg-[#5b8a3c] text-white";
        borderLight = "border-[#75ad4f]";
        borderDark = "border-[#3e5e28]";
        hoverClass = "hover:bg-[#669c44]";
    } else if (variant === 'sand') {
        bgClass = "bg-[#dbd3a0] text-[#5c3c22]";
        borderLight = "border-[#fdf6c9]";
        borderDark = "border-[#9e966e]";
        hoverClass = "hover:bg-[#e6deb1]";
    }

    if (disabled) {
        bgClass = "bg-[#333] text-[#555]";
        borderLight = "border-[#444]";
        borderDark = "border-[#222]";
        hoverClass = "cursor-not-allowed";
    }

    return (
        <button 
            onClick={onClick} 
            disabled={disabled} 
            className={`
                relative font-minecraft text-base uppercase px-4 py-2 
                border-4 ${borderDark} border-t-${borderLight} border-l-${borderLight}
                active:border-t-[#222] active:border-l-[#222] active:border-b-[#aaa] active:border-r-[#aaa]
                ${bgClass} ${hoverClass} transition-none
                ${className}
            `}
            style={{
                imageRendering: 'pixelated',
                boxShadow: 'inset -2px -2px 0px 0px rgba(0,0,0,0.3)',
                textShadow: variant === 'sand' ? 'none' : '2px 2px 0px #000'
            }}
        >
            <span className="drop-shadow-md">{children}</span>
        </button>
    );
};

const McCard: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => (
    <div className="relative bg-[#333333] border-4 border-[#1a1a1a] p-0.5 shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] mt-3">
        <div className={`border-2 border-[#4d4d4d] border-b-[#222] border-r-[#222] p-2 bg-[#333333] h-full text-[#e0e0e0]`}>
             {title && (
                 <div className="absolute -top-3 left-2 bg-[#1a1a1a] border-2 border-[#333] border-b-[#000] border-r-[#000] px-2 py-0 z-10">
                     <span className="font-minecraft text-sm text-[#eee] uppercase tracking-widest drop-shadow-md">{title}</span>
                 </div>
             )}
             <div className={className}>{children}</div>
        </div>
    </div>
);

const McSlider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (val: number) => void }> = ({ label, value, min, max, step, onChange }) => (
    <div className="space-y-0">
        <div className="flex justify-between text-[#aaa] font-minecraft text-base uppercase font-bold">
            <span>{label}</span>
            <span>{Math.round(value * 100)}%</span>
        </div>
        <input 
            type="range" 
            min={min} max={max} step={step} 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-4 bg-[#1a1a1a] border-2 border-[#555] appearance-none outline-none cursor-pointer"
            style={{
                accentColor: '#5b8a3c'
            }}
        />
    </div>
);

// --- End Portal Background ---

const EndPortalBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    const uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    };

    // End Portal Shader
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScroll;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float random (in vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        float noise (in vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
            vec2 st = gl_FragCoord.xy/uResolution.xy;
            // SLOWER PARALLAX
            st.y += uScroll * 0.00005; 
            
            // Slow drift - even slower
            st.x += uTime * 0.001;

            // Layers of noise - SIGNIFICANTLY SLOWER TIMINGS
            float n1 = noise(st * 3.0 + uTime * 0.0005);
            float n2 = noise(st * 6.0 - uTime * 0.001);
            float n3 = noise(st * 12.0 + uTime * 0.002);
            
            float combined = n1 * 0.5 + n2 * 0.25 + n3 * 0.125;
            
            // End Portal Palette
            vec3 col1 = vec3(0.05, 0.1, 0.1); // Dark Teal
            vec3 col2 = vec3(0.2, 0.0, 0.3); // Purple
            vec3 col3 = vec3(0.8, 0.9, 1.0); // White specs
            
            vec3 color = mix(col1, col2, combined * 2.0);
            
            // Specs / Glitch
            if (random(st + uTime * 0.0005) > 0.985) {
                color += col3 * 0.5;
            }

            gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const handleResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };
    const handleScroll = () => {
        uniforms.uScroll.value = window.scrollY;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);

    const animate = (time: number) => {
      uniforms.uTime.value = time * 0.001;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return <div ref={containerRef} className="fixed top-0 left-0 w-full h-full z-1 pointer-events-none" />;
};

// --- Bouncing DVD Text ---

const BouncingDVDText = ({ parentRef }: { parentRef: React.RefObject<HTMLDivElement> }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  // Use refs for animation state to avoid re-renders
  const pos = useRef({ x: 20, y: 20 });
  const vel = useRef({ x: 2, y: 2 });
  
  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      if (parentRef.current && elementRef.current) {
        // Use parent's dimensions
        const parentWidth = parentRef.current.clientWidth;
        const parentHeight = parentRef.current.clientHeight;
        
        // Use element's own dimensions for collision
        const elRect = elementRef.current.getBoundingClientRect();
        const elWidth = elRect.width;
        const elHeight = elRect.height;

        const maxX = parentWidth - elWidth;
        const maxY = parentHeight - elHeight;

        // Update Position
        pos.current.x += vel.current.x;
        pos.current.y += vel.current.y;

        // Bounce X
        if (pos.current.x >= maxX) {
            pos.current.x = maxX;
            vel.current.x *= -1;
        } else if (pos.current.x <= 0) {
            pos.current.x = 0;
            vel.current.x *= -1;
        }

        // Bounce Y
        if (pos.current.y >= maxY) {
            pos.current.y = maxY;
            vel.current.y *= -1;
        } else if (pos.current.y <= 0) {
            pos.current.y = 0;
            vel.current.y *= -1;
        }

        // Apply transform
        elementRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [parentRef]);

  return (
    <div 
      ref={elementRef} 
      className="absolute top-0 left-0 select-none pointer-events-none font-minecraft text-xl font-bold w-max z-10"
      style={{ willChange: 'transform' }}
    >
      <div className="flex flex-col items-center justify-center p-4 text-center animate-[rgb-cycle_8s_infinite]">
          <span className="text-3xl drop-shadow-[3px_3px_0_#000]">SELECT OR CREATE</span>
          <span className="text-sm opacity-80 drop-shadow-[1px_1px_0_#000]">to begin</span>
      </div>
    </div>
  );
};


// --- MAIN APP ---

const App = () => {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [voxelHtml, setVoxelHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string>("IDLE"); // IDLE, PAINTING, CRAFTING
  const [splashText, setSplashText] = useState("Creeper? Aww man!");
  
  // Settings
  const [sunlight, setSunlight] = useState(0.2);
  const [godrays, setGodrays] = useState(0.5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Achievement Toast
  const [achievement, setAchievement] = useState(false);

  useEffect(() => {
    setSplashText(SPLASH_PHRASES[Math.floor(Math.random() * SPLASH_PHRASES.length)]);
  }, []);

  // Send settings to iframe
  useEffect(() => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
              type: 'environment',
              sunlight,
              godrays
          }, '*');
      }
  }, [sunlight, godrays, voxelHtml]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImage(base64String);
        setGeneratedImage(null);
        setVoxelHtml(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePromptGenerate = async () => {
      if (!prompt) return;
      setLoading(true);
      setStatus("PAINTING");
      setError(null);
      setImage(null);
      setVoxelHtml(null);
      setGeneratedImage(null);

      try {
          const imgBase64 = await generateImage(prompt);
          setGeneratedImage(imgBase64);
          setImage(imgBase64);
      } catch (e: any) {
          setError(e.message || "Failed to generate image");
      } finally {
          setLoading(false);
          setStatus("IDLE");
      }
  };

  const handleVoxelize = async () => {
    if (!image) return;
    setLoading(true);
    setStatus("CRAFTING");
    setError(null);

    try {
      const html = await generateVoxelScene(image, (thought) => {
         // Optional thinking stream
      });
      
      const zoomedHtml = zoomCamera(html, 0.7);
      const finalHtml = hideBodyText(zoomedHtml);
      
      setVoxelHtml(finalHtml);
      
      // Trigger Achievement
      setAchievement(true);
      setTimeout(() => setAchievement(false), 5000);

    } catch (err: any) {
      setError(err.message || "Failed to generate voxel scene");
    } finally {
      setLoading(false);
      setStatus("IDLE");
    }
  };

  const handleExampleClick = (ex: Example) => {
      setImage(ex.img);
      setGeneratedImage(null);
      setVoxelHtml(null);
      // Use pre-rendered example
      fetch(ex.html).then(r => r.text()).then(html => {
          const final = hideBodyText(html);
          setVoxelHtml(final);
      });
  };

  const toggleInstructions = () => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: 'toggleInstructions' }, '*');
      }
  };

  return (
    <div className="relative min-h-screen text-[#e0e0e0] font-sans selection:bg-[#ff00ff] selection:text-white overflow-x-hidden">
      
      <style>{`
        @keyframes swing {
          0% { transform: translateX(-50%) rotate(0deg); }
          25% { transform: translateX(-50%) rotate(3deg); }
          50% { transform: translateX(-50%) rotate(-3deg); }
          75% { transform: translateX(-50%) rotate(1deg); }
          100% { transform: translateX(-50%) rotate(0deg); }
        }
        @keyframes rgb-cycle {
            0% { color: #ff3333; filter: hue-rotate(0deg); }
            100% { color: #ff3333; filter: hue-rotate(360deg); }
        }
        @keyframes minecraft-scale {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        /* Force hide common overlay IDs that might leak from generated content or examples */
        #info, #loading, #ui, #instructions, #description {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
      `}</style>

      {/* Backgrounds */}
      <div className="fixed top-0 left-0 w-full h-full z-0 mc-dirt-bg"></div>
      <div className="fixed top-0 left-0 w-full h-full z-1">
          <EndPortalBackground />
      </div>
      <div className="fixed top-0 left-0 w-full h-full z-2 pointer-events-none bg-gradient-to-b from-transparent to-black opacity-50"></div>
      
      {/* Achievement Toast */}
      <div className={`fixed top-4 right-4 z-50 transition-transform duration-500 ${achievement ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="bg-[#222] border-2 border-white p-4 flex items-center gap-4 shadow-lg" style={{imageRendering: 'pixelated'}}>
              <div className="w-10 h-10 bg-[#5b8a3c] flex items-center justify-center border-2 border-[#333]">
                  <div className="w-6 h-6 bg-white"></div> {/* Mock Icon */}
              </div>
              <div>
                  <div className="text-yellow-400 font-minecraft text-sm">Achievement Get!</div>
                  <div className="text-white font-minecraft">Getting Wood</div>
              </div>
          </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 flex flex-col min-h-screen">
        
        {/* Header */}
        {/* Added z-40 to ensure sign layers over inventory, and reduced mb to 4 to overlap */}
        <header className="text-center mb-4 relative select-none pt-8 z-40">
          <div className="relative inline-block">
              <h1 className="font-minecraft text-7xl md:text-9xl text-[#A8A8A8] tracking-widest leading-none relative z-10"
                  style={{ 
                      // Extremely deep stone-like shadow stack
                      textShadow: `
                        0px 6px 0px #5f5f5f, 
                        0px 12px 0px #3f3f3f, 
                        0px 18px 0px #2f2f2f,
                        0px 24px 0px #1f1f1f,
                        6px 6px 0px #222,
                        -6px 6px 0px #222
                      `
                  }}>
                BLOCK BUILDER
              </h1>
              
              {/* Splash Text - Layered on top of title, tilted, offset to right corner */}
              {/* Separate rotation wrapper from animation wrapper to avoid conflict */}
              <div 
                className="absolute z-50 pointer-events-none origin-bottom-left"
                style={{ 
                    top: '15px',
                    right: '-55px',
                    transform: 'rotate(-20deg)' 
                }}
              >
                  {/* Inner pulsing animation */}
                  <div className="animate-[minecraft-scale_0.5s_infinite]">
                    <span className="font-minecraft text-yellow-400 text-2xl md:text-4xl drop-shadow-[3px_3px_0_#3f3f00] whitespace-nowrap font-bold">
                        {splashText}
                    </span>
                  </div>
              </div>

              {/* Hanging Sign - Swinging from the letters */}
              <div 
                className="absolute top-[100%] left-1/2 -translate-x-1/2 flex flex-col items-center z-0 mt-[-24px]"
                style={{ animation: 'swing 3s ease-in-out infinite', transformOrigin: 'top center' }}
              >
                  {/* Chains - Widen gap to attach to the larger letters */}
                  <div className="flex gap-48 md:gap-64 mb-[-6px]">
                      <div className="w-1.5 h-16 bg-[#222] border-l-2 border-r-2 border-[#444]"></div>
                      <div className="w-1.5 h-16 bg-[#222] border-l-2 border-r-2 border-[#444]"></div>
                  </div>
                  {/* Sign Board */}
                  <div className="relative bg-[#5c3c22] px-8 py-3 shadow-2xl border-4 border-[#3e2723]">
                       {/* Wood grain effect */}
                       <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 5px, #000 5px, #000 6px)'}}></div>
                       
                       {/* Inner Bevel */}
                      <div className="border-2 border-[#7a5332] px-4 py-1 relative z-10">
                          <span className="text-[#ffedcc] font-minecraft text-2xl tracking-widest drop-shadow-[2px_2px_0_#000]">
                              CREATIVE MODE
                          </span>
                      </div>
                  </div>
              </div>
          </div>
        </header>

        {/* Main Content Stack - CHANGED TO VERTICAL FLEX FOR ALL SCREENS */}
        <div className="flex flex-col gap-6 mt-6 w-full max-w-4xl mx-auto z-10">
            
            {/* Builder Area */}
            <div className="w-full space-y-4">
                
                {/* Image Hotbar - GRID LAYOUT */}
                <div className="bg-[#c6c6c6] border-4 border-[#555] p-1 shadow-xl w-full">
                    <div className="grid grid-cols-4 gap-1 w-full">
                        {/* Example Slots */}
                        {EXAMPLES.map((ex, i) => (
                            <div key={i} 
                                 onClick={() => handleExampleClick(ex)}
                                 className={`
                                    relative w-full aspect-square bg-[#8b8b8b] cursor-pointer group p-1
                                    /* Inventory Slot Bevel */
                                    border-[3px] border-t-[#373737] border-l-[#373737] border-b-[#fff] border-r-[#fff]
                                    hover:bg-[#9b9b9b]
                                 `}
                            >
                                <div className="w-full h-full relative">
                                    <img src={ex.img} className="w-full h-full object-cover image-pixelated" alt="example" />
                                </div>
                                {/* Selection Highlight (White Border OUTSIDE) */}
                                {image === ex.img && (
                                    <div className="absolute -inset-[4px] border-4 border-white pointer-events-none z-20"></div>
                                )}
                            </div>
                        ))}
                        
                        {/* Upload Slot */}
                        <div className={`
                            relative w-full aspect-square bg-[#8b8b8b] cursor-pointer overflow-hidden p-1
                            border-[3px] border-t-[#373737] border-l-[#373737] border-b-[#fff] border-r-[#fff]
                            hover:bg-[#9b9b9b]
                        `}>
                             <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer z-20"
                             />
                             {image && !EXAMPLES.find(e => e.img === image) ? (
                                 <>
                                    <div className="w-full h-full relative">
                                        <img src={image} className="w-full h-full object-cover image-pixelated" alt="upload" />
                                    </div>
                                    <div className="absolute -inset-[4px] border-4 border-white pointer-events-none z-20"></div>
                                 </>
                             ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-[#444]">
                                     <span className="text-4xl font-bold opacity-50">+</span>
                                     <span className="text-xs font-minecraft mt-1 opacity-70">CREATE</span>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>

                {/* Viewport */}
                <div className="relative aspect-square lg:aspect-[4/3] bg-[#111] border-8 border-[#333] shadow-2xl" ref={previewContainerRef}>
                    {/* 3D Viewer */}
                    {voxelHtml ? (
                        <iframe 
                            ref={iframeRef}
                            srcDoc={voxelHtml}
                            className="w-full h-full border-none"
                            title="Voxel Output"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
                             {/* Show selected image if no voxel yet */}
                             {image && !loading ? (
                                 <img src={image} className="w-full h-full object-contain opacity-50" alt="preview" />
                             ) : null}
                             
                             {/* Bouncing Text when Idle */}
                             {!image && !loading && (
                                 <BouncingDVDText parentRef={previewContainerRef} />
                             )}
                        </div>
                    )}

                    {/* Loading Overlay */}
                    {loading && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                            {/* Tumbling Block Animation */}
                            <div className="animate-[spin_2s_linear_infinite] mb-6">
                                <div className="w-16 h-16 bg-[#5b8a3c] border-4 border-[#3e5e28] shadow-[inset_-4px_-4px_0_rgba(0,0,0,0.3)]"></div>
                            </div>
                            <div className="font-minecraft text-2xl text-yellow-400 animate-pulse">
                                {status === "PAINTING" ? "Painting..." : "Crafting..."}
                            </div>
                        </div>
                    )}
                    
                    {/* Error Overlay */}
                    {error && (
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-8 text-center">
                            <div className="text-red-500 font-minecraft text-3xl mb-4">Connection Lost</div>
                            <div className="text-gray-400 font-mono mb-6">{error}</div>
                            <McButton onClick={() => setError(null)}>Respawn</McButton>
                        </div>
                    )}
                </div>
                
                {/* Prompt Input */}
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Or describe what to build..."
                        className="flex-1 bg-[#1a1a1a] border-4 border-[#333] p-3 font-minecraft text-white focus:border-[#777] outline-none text-base"
                    />
                    <McButton onClick={handlePromptGenerate} disabled={!prompt || loading} className="text-sm py-3">
                        Paint
                    </McButton>
                </div>
            </div>

            {/* Controls Area - Now stacked below Builder Area */}
            <div className="w-full space-y-2">
                
                {/* Actions */}
                <McCard title="Tools" className="flex flex-col gap-1 pt-2 pb-1">
                    <McButton 
                        variant="grass" 
                        className="w-full py-3 text-xl"
                        onClick={handleVoxelize}
                        disabled={!image || loading}
                    >
                        Re-Build World
                    </McButton>
                    
                    <div className="flex gap-2">
                        <McButton className="flex-1 text-base py-2 px-2" onClick={() => window.open(image || '', '_blank')} disabled={!image}>
                            View 2D
                        </McButton>
                        <McButton className="flex-1 text-base py-2 px-2" onClick={() => {
                            const blob = new Blob([voxelHtml || ''], {type: 'text/html'});
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'world.html';
                            a.click();
                        }} disabled={!voxelHtml}>
                            Save File
                        </McButton>
                    </div>
                    
                    <McButton variant="wood" className="w-full py-2 text-base" onClick={toggleInstructions} disabled={!voxelHtml}>
                        Open Block Guide
                    </McButton>
                </McCard>

                {/* Environment Settings */}
                <McCard title="Atmosphere" className="space-y-1 pt-2 pb-1">
                    <McSlider 
                        label="Time of Day" 
                        value={sunlight} min={0} max={1} step={0.01} 
                        onChange={setSunlight} 
                    />
                    <McSlider 
                        label="God Rays" 
                        value={godrays} min={0} max={1} step={0.01} 
                        onChange={setGodrays} 
                    />
                </McCard>

                {/* Guide */}
                <McCard title="How to Play:" className="text-[#aaa] py-2">
                    <ol className="list-decimal list-inside space-y-0.5 font-mono text-base font-bold leading-tight">
                        <li>Create an Image</li>
                        <li>Click "Build 3D World"</li>
                        <li>Use Mouse to Spin 3D Model</li>
                        <li>Open "Block Guide" to see parts!</li>
                    </ol>
                </McCard>
                
            </div>
        </div>
        
      </div>
    </div>
  );
};

export default App;


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three'; // Import THREE for the background
import { generateImage, generateVoxelScene } from './services/gemini';
import { extractHtmlFromText, hideBodyText, zoomCamera } from './utils/html';

type AppStatus = 'idle' | 'generating_image' | 'generating_voxels' | 'error';

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];

const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif'
];

const SAMPLE_PROMPTS = [
    "A modern house with a pool",
    "A giant diamond sword in a stone",
    "A nether fortress tower",
    "A cozy cottage in a flower forest",
    "A futuristic redstone machine",
    "A statue of a dragon"
];

const SPLASH_PHRASES = [
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
    "Follow the train, CJ!",
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

// --- Minecraft UI Components ---

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
                relative font-minecraft text-xl uppercase px-6 py-3 
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
    <div className={`relative bg-[#333333] border-4 border-[#1a1a1a] p-1 shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] ${className}`}>
        {/* Inner Bevel */}
        <div className="border-2 border-[#4d4d4d] border-b-[#222] border-r-[#222] p-4 bg-[#333333] h-full text-[#e0e0e0]">
             {title && (
                 <div className="absolute -top-5 left-4 bg-[#1a1a1a] border-2 border-[#333] border-b-[#000] border-r-[#000] px-4 py-1">
                     <span className="font-minecraft text-xl text-[#eee] uppercase tracking-widest drop-shadow-md">{title}</span>
                 </div>
             )}
             {children}
        </div>
    </div>
);

const McSlider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (val: number) => void }> = ({ label, value, min, max, step, onChange }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[#aaa] font-minecraft text-lg uppercase font-bold">
            <span>{label}</span>
            <span>{Math.round(value * 100)}%</span>
        </div>
        <input 
            type="range" 
            min={min} max={max} step={step} 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full appearance-none h-4 bg-[#1a1a1a] border-2 border-b-[#555] border-r-[#555] border-t-[#000] border-l-[#000] outline-none"
            style={{
                imageRendering: 'pixelated'
            }}
        />
        <style>{`
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 24px;
                background: #7d7d7d;
                border: 2px solid #fff;
                border-right: 2px solid #555;
                border-bottom: 2px solid #555;
                cursor: pointer;
            }
            input[type=range]::-webkit-slider-thumb:hover {
                background: #a0a0a0;
            }
        `}</style>
    </div>
);

const McCraftingLoader: React.FC = () => (
    <div className="flex justify-center items-center gap-6 mb-8 h-24">
        <style>{`
            @keyframes tumble-fall {
                0% { transform: translateY(-20px) rotateX(0deg) rotateZ(0deg); }
                25% { transform: translateY(0px) rotateX(90deg) rotateZ(45deg); }
                50% { transform: translateY(-10px) rotateX(180deg) rotateZ(90deg); }
                75% { transform: translateY(0px) rotateX(270deg) rotateZ(135deg); }
                100% { transform: translateY(-20px) rotateX(360deg) rotateZ(180deg); }
            }
            .cube-wrapper {
                width: 48px; height: 48px;
                perspective: 400px;
            }
            .cube {
                width: 100%; height: 100%;
                position: relative;
                transform-style: preserve-3d;
                animation: tumble-fall 1.5s infinite ease-in-out;
            }
            .face {
                position: absolute; width: 48px; height: 48px;
                border: 2px solid rgba(0,0,0,0.5);
                image-rendering: pixelated;
            }
            .face.front { transform: translateZ(24px); }
            .face.back { transform: rotateY(180deg) translateZ(24px); }
            .face.right { transform: rotateY(90deg) translateZ(24px); }
            .face.left { transform: rotateY(-90deg) translateZ(24px); }
            .face.top { transform: rotateX(90deg) translateZ(24px); }
            .face.bottom { transform: rotateX(-90deg) translateZ(24px); }
            
            .c-craft .face { background-color: #5c3c22; } /* Base wood */
            .c-craft .face.top { background-color: #bcaaa4; }
            .c-craft .face.front::after { content:''; position:absolute; inset:4px; background:#3e2723; opacity:0.5; }

            .c-grass .face { background-color: #5b8a3c; } /* Side grass */
            .c-grass .face.top { background-color: #75ad4f; }
            .c-grass .face.bottom { background-color: #5c3c22; }

            .c-stone .face { background-color: #7d7d7d; }
            
            /* Simulate rudimentary texture details with CSS gradients/shadows */
            .c-stone .face {
                background-image: radial-gradient(circle at 20% 20%, rgba(0,0,0,0.2) 10%, transparent 10%),
                                  radial-gradient(circle at 80% 80%, rgba(0,0,0,0.2) 10%, transparent 10%);
            }
        `}</style>
        
        {/* Cube 1: Crafting Table */}
        <div className="cube-wrapper">
            <div className="cube c-craft" style={{ animationDelay: '0s' }}>
                <div className="face front"></div><div className="face back"></div>
                <div className="face right"></div><div className="face left"></div>
                <div className="face top"></div><div className="face bottom"></div>
            </div>
        </div>
         {/* Cube 2: Grass Block */}
         <div className="cube-wrapper">
            <div className="cube c-grass" style={{ animationDelay: '0.25s' }}>
                <div className="face front"></div><div className="face back"></div>
                <div className="face right"></div><div className="face left"></div>
                <div className="face top"></div><div className="face bottom"></div>
            </div>
        </div>
         {/* Cube 3: Stone Block */}
         <div className="cube-wrapper">
            <div className="cube c-stone" style={{ animationDelay: '0.5s' }}>
                <div className="face front"></div><div className="face back"></div>
                <div className="face right"></div><div className="face left"></div>
                <div className="face top"></div><div className="face bottom"></div>
            </div>
        </div>
    </div>
);

const BouncingDVDText: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    
    // Use refs for mutable state to avoid React render cycle overhead for 60fps animation
    const state = useRef({
        x: 50,
        y: 50,
        vx: 1.5, // velocity x
        vy: 1.5, // velocity y
        width: 0,
        height: 0,
        parentWidth: 0,
        parentHeight: 0
    });

    useEffect(() => {
        const update = () => {
            if (!containerRef.current || !textRef.current) return;
            
            const s = state.current;
            
            // Initialize dimensions if needed
            if (s.parentWidth === 0) {
                 s.parentWidth = containerRef.current.clientWidth;
                 s.parentHeight = containerRef.current.clientHeight;
                 s.width = textRef.current.offsetWidth;
                 s.height = textRef.current.offsetHeight;
                 
                 // Initialize random position inside bounds if just loaded
                 if (s.x === 50 && s.y === 50) {
                     s.x = Math.random() * (s.parentWidth - s.width);
                     s.y = Math.random() * (s.parentHeight - s.height);
                 }
            }

            // Move
            s.x += s.vx;
            s.y += s.vy;

            // Bounce X
            if (s.x <= 0) {
                s.x = 0;
                s.vx = Math.abs(s.vx);
            } else if (s.x + s.width >= s.parentWidth) {
                s.x = s.parentWidth - s.width;
                s.vx = -Math.abs(s.vx);
            }

            // Bounce Y
            if (s.y <= 0) {
                s.y = 0;
                s.vy = Math.abs(s.vy);
            } else if (s.y + s.height >= s.parentHeight) {
                s.y = s.parentHeight - s.height;
                s.vy = -Math.abs(s.vy);
            }

            textRef.current.style.transform = `translate(${s.x}px, ${s.y}px)`;
            requestAnimationFrame(update);
        };
        
        const animationId = requestAnimationFrame(update);
        
        // Handle resize by resetting dims (next frame will re-measure)
        const handleResize = () => {
            if (containerRef.current) {
                state.current.parentWidth = containerRef.current.clientWidth;
                state.current.parentHeight = containerRef.current.clientHeight;
            }
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none z-10">
            <style>{`
                @keyframes rgb-cycle {
                    0% { filter: hue-rotate(0deg); }
                    100% { filter: hue-rotate(360deg); }
                }
            `}</style>
            <div 
                ref={textRef} 
                className="absolute top-0 left-0 flex flex-col items-center justify-center"
                style={{ willChange: 'transform' }}
            >
                <div style={{ animation: 'rgb-cycle 8s linear infinite' }}>
                    <p className="text-3xl uppercase drop-shadow-md text-[#ff3333] font-bold" style={{ textShadow: '3px 3px 0px #1a1a1a' }}>
                        Select or Create
                    </p>
                    <p className="text-xl opacity-90 text-[#ff3333] mt-1 text-center" style={{ textShadow: '2px 2px 0px #1a1a1a' }}>to begin</p>
                </div>
            </div>
        </div>
    );
};

const SplashText: React.FC = () => {
    const [splash, setSplash] = useState("");

    useEffect(() => {
        const randomSplash = SPLASH_PHRASES[Math.floor(Math.random() * SPLASH_PHRASES.length)];
        setSplash(randomSplash);
    }, []);

    return (
        // Adjusted position to overlay on the title with a jaunty angle
        <div className="absolute right-[-120px] top-[-40px] z-50 origin-center pointer-events-none select-none">
             <style>{`
                @keyframes splash-pulse {
                    0% { transform: scale(1) rotate(-20deg); }
                    50% { transform: scale(1.1) rotate(-20deg); }
                    100% { transform: scale(1) rotate(-20deg); }
                }
                .splash-text-anim {
                    animation: splash-pulse 0.6s infinite ease-in-out alternate;
                    font-smooth: never;
                    -webkit-font-smoothing: none;
                }
             `}</style>
            <span className="splash-text-anim block text-[#FFFF55] text-3xl font-minecraft drop-shadow-[4px_4px_0_rgba(0,0,0,0.75)] whitespace-nowrap" 
                  style={{ textShadow: '3px 3px 0px #3f3f3f' }}>
                {splash}
            </span>
        </div>
    );
};

const EndPortalBackground: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // 1. Setup Scene
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 2. End Portal Shader Material
        // Mimics the layered, scrolling parallax of the Minecraft End Portal
        const uniforms = {
            uTime: { value: 0 },
            uScroll: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        };

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform float uScroll;
            uniform vec2 uResolution;
            varying vec2 vUv;

            // Simple pseudo-random
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            // Value Noise
            float noise(vec2 st) {
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
                // Correct Aspect Ratio
                vec2 st = gl_FragCoord.xy / uResolution.xy;
                st.x *= uResolution.x / uResolution.y;

                // Colors (End Portal Palette)
                vec3 c1 = vec3(0.05, 0.02, 0.10); // Deep void
                vec3 c2 = vec3(0.12, 0.45, 0.35); // Teal/Greenish
                vec3 c3 = vec3(0.30, 0.10, 0.40); // Purple
                vec3 c4 = vec3(0.80, 0.90, 0.70); // White/Green specs

                vec3 color = c1;

                // Simulate Layers
                // We scroll layers at different speeds/rotations
                float scroll = uScroll * 0.001;
                
                for(float i = 1.0; i <= 4.0; i++) {
                    float t = uTime * 0.1 + scroll * i; // Movement
                    
                    // Rotation logic
                    float ang = i * 1.0; 
                    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
                    
                    vec2 pos = st * (2.0 + i); // Scale based on layer
                    pos += vec2(t, t * 0.5);   // Drift
                    pos = rot * pos;           // Rotate

                    float n = noise(pos);
                    
                    // Thresholding for "portal" look
                    float layerIntensity = smoothstep(0.4, 0.8, n);
                    
                    // Mix colors based on layer index
                    vec3 layerColor = mix(c2, c3, fract(i * 0.5));
                    if (i == 4.0) layerColor = c4; // Top specs

                    color = mix(color, layerColor, layerIntensity * 0.4);
                }
                
                // Vignette
                float dist = distance(vUv, vec2(0.5));
                color *= 1.0 - dist * 0.6;

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms
        });

        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);

        // 3. Animation Loop
        const animate = () => {
            requestAnimationFrame(animate);
            uniforms.uTime.value += 0.02;
            uniforms.uScroll.value = window.scrollY;
            renderer.render(scene, camera);
        };
        animate();

        // 4. Handlers
        const handleResize = () => {
            renderer.setSize(window.innerWidth, window.innerHeight);
            uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if(rendererRef.current) {
                rendererRef.current.dispose();
                rendererRef.current.domElement.remove();
            }
            geometry.dispose();
            material.dispose();
        };
    }, []);

    return (
        <div 
            ref={containerRef} 
            style={{ 
                position: 'fixed', 
                top: 0, left: 0, width: '100%', height: '100%', 
                zIndex: 1, // Middle layer
                pointerEvents: 'none'
            }} 
        />
    );
};

// ---------------------------

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  
  const [imageData, setImageData] = useState<string | null>(null);
  const [voxelCode, setVoxelCode] = useState<string | null>(null);
  
  const [userContent, setUserContent] = useState<{
      image: string;
      voxel: string | null;
      prompt: string;
  } | null>(null);

  const [selectedTile, setSelectedTile] = useState<number | 'user' | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const [status, setStatus] = useState<AppStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [useOptimization, setUseOptimization] = useState(true);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [viewMode, setViewMode] = useState<'image' | 'voxel'>('image');
  
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Record<string, string>>({});

  // Environment Settings
  const [sunlight, setSunlight] = useState(0.5);
  const [godRays, setGodRays] = useState(0.5);

  const [isDragging, setIsDragging] = useState(false);
  const [isViewerVisible, setIsViewerVisible] = useState(true);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update Iframe environment when settings change
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
            type: 'environment',
            sunlight,
            godrays: godRays
        }, '*');
    }
  }, [sunlight, godRays]);

  // Rotate placeholders
  useEffect(() => {
    const interval = setInterval(() => {
        setPlaceholderIndex((prev) => (prev + 1) % SAMPLE_PROMPTS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const createdUrls: string[] = [];
    const loadThumbnails = async () => {
      const loaded: Record<string, string> = {};
      await Promise.all(EXAMPLES.map(async (ex) => {
        try {
          const response = await fetch(ex.img);
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            loaded[ex.img] = url;
          }
        } catch (e) {
          console.error("Failed to load thumbnail:", ex.img, e);
        }
      }));
      setLoadedThumbnails(loaded);
    };
    loadThumbnails();

    return () => {
        createdUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handleError = (err: any) => {
    setStatus('error');
    setErrorMsg(err.message || 'An unexpected error occurred.');
    console.error(err);
  };

  const handleImageGenerate = async () => {
    if (!prompt.trim()) return;
    
    setStatus('generating_image');
    setErrorMsg('');
    setImageData(null);
    setVoxelCode(null);
    setThinkingText(null);
    setViewMode('image');
    setIsViewerVisible(true);

    try {
      const imageUrl = await generateImage(prompt, aspectRatio, useOptimization);
      const newUserContent = {
          image: imageUrl,
          voxel: null,
          prompt: prompt
      };
      setUserContent(newUserContent);
      setImageData(imageUrl);
      setVoxelCode(null);
      setSelectedTile('user');
      setStatus('idle');
      setShowGenerator(false);
    } catch (err) {
      handleError(err);
    }
  };

  const processFile = (file: File) => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      handleError(new Error("Invalid file type. Please upload PNG, JPEG, WEBP, HEIC, or HEIF."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const newUserContent = {
          image: result,
          voxel: null,
          prompt: ''
      };
      setUserContent(newUserContent);
      setImageData(result);
      setVoxelCode(null);
      setViewMode('image');
      setStatus('idle');
      setErrorMsg('');
      setSelectedTile('user');
      setShowGenerator(false);
      setIsViewerVisible(true);
    };
    reader.onerror = () => handleError(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
        processFile(file);
    }
  };

  const handleExampleClick = async (example: Example, index: number) => {
    if (status !== 'idle' && status !== 'error') return;
    
    setSelectedTile(index);
    setShowGenerator(false);
    setErrorMsg('');
    setThinkingText(null);
    setIsViewerVisible(true);
    
    try {
      const imgResponse = await fetch(example.img);
      if (!imgResponse.ok) throw new Error(`Failed to load example image: ${imgResponse.statusText}`);
      const imgBlob = await imgResponse.blob();
      
      const base64Img = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imgBlob);
      });

      let htmlText = '';
      try {
        const htmlResponse = await fetch(example.html);
        if (htmlResponse.ok) {
            const rawText = await htmlResponse.text();
            htmlText = zoomCamera(hideBodyText(extractHtmlFromText(rawText)));
        } else {
            htmlText = `<html><body><p>${example.html} not found.</p></body></html>`;
        }
      } catch (e) {
          htmlText = "<html><body>Error loading example scene.</body></html>";
      }

      setImageData(base64Img);
      setVoxelCode(htmlText);
      setViewMode('voxel');
      setStatus('idle');

    } catch (err) {
      handleError(err);
    }
  };

  const handleUserTileClick = () => {
      if (status !== 'idle' && status !== 'error') return;

      if (selectedTile === 'user') {
          const willShow = !showGenerator;
          setShowGenerator(willShow);
          if (willShow) {
            setIsViewerVisible(false);
          } else {
            setIsViewerVisible(true);
            if (!userContent) {
              setSelectedTile(null);
            }
          }
      } else {
          setSelectedTile('user');
          setShowGenerator(true); 
          setIsViewerVisible(false);

          if (userContent) {
              setImageData(userContent.image);
              setVoxelCode(userContent.voxel);
              setPrompt(userContent.prompt);
              setViewMode(userContent.voxel ? 'voxel' : 'image');
          } else {
              setImageData(null);
              setVoxelCode(null);
              setViewMode('image');
          }
      }
  };

  const handleVoxelize = async () => {
    if (!imageData) return;
    setStatus('generating_voxels');
    setErrorMsg('');
    setThinkingText(null);
    setIsViewerVisible(true);
    
    let thoughtBuffer = "";

    try {
      const code = await generateVoxelScene(imageData, (thoughtFragment) => {
          thoughtBuffer += thoughtFragment;
          const matches = thoughtBuffer.match(/\*\*([^*]+)\*\*/g);
          if (matches && matches.length > 0) {
              const lastMatch = matches[matches.length - 1];
              const header = lastMatch.replace(/\*\*/g, '').trim();
              setThinkingText(prev => prev === header ? prev : header);
          }
      });
      
      // The code is now a robust HTML string from our new template logic
      setVoxelCode(code);
      
      if (selectedTile === 'user') {
          setUserContent(prev => prev ? ({...prev, voxel: code}) : null);
      }
      
      setViewMode('voxel');
      setStatus('idle');
      setThinkingText(null);
      
      // Trigger initial settings
      setTimeout(() => {
         if (iframeRef.current && iframeRef.current.contentWindow) {
             iframeRef.current.contentWindow.postMessage({
                 type: 'environment',
                 sunlight,
                 godrays: godRays
             }, '*');
         }
      }, 1000);

    } catch (err) {
      handleError(err);
    }
  };

  const handleDownload = () => {
    if (viewMode === 'image' && imageData) {
      const a = document.createElement('a');
      a.href = imageData;
      const ext = imageData.includes('image/jpeg') ? 'jpg' : 'png';
      a.download = `minecraft-concept-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (viewMode === 'voxel' && voxelCode) {
      const a = document.createElement('a');
      a.href = `data:text/html;charset=utf-8,${encodeURIComponent(voxelCode)}`;
      a.download = `minecraft-build-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleToggleInstructions = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'toggleInstructions' }, '*');
    }
  };

  const isLoading = status !== 'idle' && status !== 'error';

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-minecraft text-[#e0e0e0] relative overflow-hidden">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
          .mc-dirt-bg {
            /* Fallback texture */
          }
        `}
      </style>
      
      {/* New Three.js End Portal Background */}
      <EndPortalBackground />
      
      {/* Layer 0: Fallback Dirt - Bottom (Optional, but kept for extreme redundancy if JS fails) */}
      <div className="fixed inset-0 z-0 mc-dirt-bg opacity-10" />
      
      {/* Content - Higher Z-Index (Relative) */}
      <div className="w-full max-w-5xl space-y-8 z-10 relative">
        
        {/* Header */}
        <div className="text-center relative mb-24 mt-12">
          <div className="relative inline-block whitespace-nowrap group">
             {/* Main 3D Text */}
             <h1 className="text-9xl tracking-tighter leading-none select-none relative z-10" 
                style={{ 
                    fontFamily: '"VT323", monospace',
                    color: '#AFAFAF',
                    fontSize: '9rem',
                    transform: 'scaleY(1.1)',
                    letterSpacing: '-4px',
                    textShadow: `
                        4px 4px 0px #5A5A5A,
                        4px 6px 0px #4A4A4A,
                        4px 8px 0px #3A3A3A,
                        4px 10px 0px #2A2A2A,
                        4px 12px 0px #1A1A1A,
                        4px 16px 24px rgba(0,0,0,0.7)
                    `
                }}>
                BLOCK BUILDER
             </h1>
             
             <h1 className="absolute top-0 left-0 w-full text-9xl tracking-tighter leading-none select-none z-20 pointer-events-none" 
                 style={{
                    fontFamily: '"VT323", monospace',
                    color: 'transparent',
                    fontSize: '9rem',
                    WebkitTextStroke: '2px rgba(0,0,0,0.2)',
                    transform: 'scaleY(1.1)',
                    letterSpacing: '-4px'
                 }}>
                BLOCK BUILDER
             </h1>

             {/* Creative Mode Hanging Sign */}
             <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 z-20">
                 <div className="relative hover:rotate-1 transition-transform origin-top duration-300 ease-in-out">
                     <div className="absolute -top-4 left-4 w-1 h-8 bg-[#1a1a1a] z-0"></div>
                     <div className="absolute -top-4 right-4 w-1 h-8 bg-[#1a1a1a] z-0"></div>
                     
                     <div className="bg-[#5c3c22] border-4 border-[#382313] px-6 py-2 shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
                        <div className="border-2 border-[#7a5332] border-b-[#382313] border-r-[#382313] p-1 bg-[#5c3c22]">
                             <span className="font-minecraft text-2xl text-[#ffedcc] uppercase tracking-widest drop-shadow-md block leading-none">
                                Creative Mode
                             </span>
                        </div>
                    </div>
                 </div>
             </div>
             
             <SplashText />
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            
            {/* Left Column */}
            <div className="space-y-6">
                 <McCard className="bg-[#333333]">
                    {/* Tiles Container - Hotbar Style */}
                    <div className="bg-[#1e1e1e] p-2 border-4 border-[#555] border-t-[#111] border-l-[#111] border-b-[#888] border-r-[#888] mb-8 shadow-xl">
                        <div className="grid grid-cols-4 gap-2">
                            {/* Example Slots */}
                            {EXAMPLES.map((ex, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleExampleClick(ex, idx)}
                                    disabled={isLoading}
                                    className={`
                                        aspect-square relative group outline-none
                                        transition-all duration-75
                                    `}
                                >
                                    {/* Slot Border/Background (Recessed) */}
                                    <div className={`
                                        absolute inset-0 
                                        border-4 border-[#8b8b8b] border-t-[#373737] border-l-[#373737] border-b-[#fff] border-r-[#fff]
                                        bg-[#8b8b8b] z-0
                                    `}></div>

                                    {/* Image Content */}
                                    <div className="absolute inset-[4px] z-10 overflow-hidden bg-[#222]">
                                        {loadedThumbnails[ex.img] ? (
                                            <img 
                                                src={loadedThumbnails[ex.img]} 
                                                alt={`Example ${idx + 1}`} 
                                                className={`
                                                    w-full h-full object-cover rendering-pixelated
                                                    ${selectedTile === idx ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}
                                                `}
                                            />
                                        ) : (
                                             <div className="w-full h-full flex items-center justify-center text-[#555]">?</div>
                                        )}
                                    </div>

                                    {/* Selection Overlay (White Box) */}
                                    {selectedTile === idx && (
                                        <div className="absolute -inset-2 border-[6px] border-white z-20 pointer-events-none shadow-sm"></div>
                                    )}
                                </button>
                            ))}
                            
                            {/* User Slot */}
                            <button
                                type="button"
                                onClick={handleUserTileClick}
                                disabled={isLoading}
                                className={`
                                    aspect-square relative group outline-none
                                `}
                            >
                                 {/* Slot Border/Background (Recessed) */}
                                 <div className={`
                                    absolute inset-0 
                                    border-4 border-[#8b8b8b] border-t-[#373737] border-l-[#373737] border-b-[#fff] border-r-[#fff]
                                    bg-[#8b8b8b] z-0
                                `}></div>

                                <div className="absolute inset-[4px] z-10 overflow-hidden bg-[#8b8b8b] flex flex-col items-center justify-center">
                                    {userContent ? (
                                        <>
                                            <img src={userContent.image} alt="My Generation" className="w-full h-full object-cover rendering-pixelated" />
                                             {selectedTile !== 'user' && (
                                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="text-[#373737] flex flex-col items-center transition-transform group-hover:scale-110">
                                            <span className={`text-5xl leading-none ${showGenerator ? 'rotate-45' : ''} transition-transform duration-300`}>+</span>
                                            <span className="text-xs font-bold uppercase mt-1">Create</span>
                                        </div>
                                    )}
                                </div>

                                {/* Selection Overlay */}
                                {selectedTile === 'user' && (
                                    <div className="absolute -inset-2 border-[6px] border-white z-20 pointer-events-none shadow-sm"></div>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generator Input */}
                    {showGenerator && (
                        <div className="bg-[#222] border-4 border-[#111] p-4 space-y-4 mb-6 animate-in fade-in slide-in-from-top-2 shadow-inner">
                        
                        <div>
                            <div 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`
                                    w-full h-24 border-4 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
                                    ${isDragging ? 'border-[#5b8a3c] bg-[#1e3b1f]' : 'border-[#555] hover:border-[#888] bg-[#333]'}
                                `}
                            >
                                <input
                                    type="file"
                                    accept={ALLOWED_MIME_TYPES.join(',')}
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <p className="text-lg text-[#aaa] font-bold uppercase">Drop Image File Here</p>
                            </div>
                        </div>
                        
                        <div className="text-center text-[#555] text-sm uppercase tracking-widest font-bold">- OR -</div>

                        <div className="flex gap-2">
                                <input
                                    id="prompt"
                                    type="text"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder={SAMPLE_PROMPTS[placeholderIndex]}
                                    className="flex-1 px-4 py-2 text-xl border-2 border-b-[#555] border-r-[#555] border-t-[#111] border-l-[#111] bg-[#1a1a1a] text-white font-minecraft placeholder-[#555] outline-none"
                                    disabled={isLoading}
                                />
                                <McButton
                                    onClick={handleImageGenerate}
                                    disabled={isLoading || !prompt.trim()}
                                    variant="grass"
                                >
                                    Go!
                                </McButton>
                        </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {errorMsg && (
                    <div className="p-4 mb-4 bg-[#aa0000] border-4 border-[#550000] text-white text-xl flex items-center gap-2 shadow-inner">
                        <span className="text-2xl">!</span>
                        {errorMsg}
                    </div>
                    )}

                    {/* Viewer */}
                    {isViewerVisible && (
                    <div className="w-full aspect-square bg-[#1a1a1a] border-4 border-[#222] border-b-[#4d4d4d] border-r-[#4d4d4d] relative overflow-hidden shadow-inner group">
                        
                        {isLoading && (
                            <div className="absolute inset-0 bg-[#000]/85 z-20 flex flex-col items-center justify-center p-8 text-center text-white">
                                <McCraftingLoader />
                                <h3 className="text-4xl mb-2 text-[#ffd700]" style={{ textShadow: '2px 2px 0 #000'}}>
                                    Crafting...
                                </h3>
                                <div className="w-full max-w-md mt-4 font-mono text-[#aaa] text-sm text-left bg-black/50 p-2 border border-[#555]">
                                    {thinkingText ? (
                                        <span className="animate-pulse text-[#5b8a3c]">&gt; {thinkingText}</span>
                                    ) : (
                                        <span className="animate-pulse text-[#aaa]">
                                            {status === 'generating_image' ? '> Designing pixels...' : '> Stacking blocks...'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {!imageData && !isLoading && status !== 'error' && (
                            <BouncingDVDText />
                        )}

                        {imageData && viewMode === 'image' && (
                            <img src={imageData} alt="Generated" className="w-full h-full object-contain rendering-pixelated" />
                        )}

                        {voxelCode && viewMode === 'voxel' && (
                            <iframe
                                ref={iframeRef}
                                title="Voxel Scene"
                                srcDoc={voxelCode}
                                className="w-full h-full border-0"
                                sandbox="allow-scripts allow-same-origin allow-popups"
                            />
                        )}
                    </div>
                    )}
                 </McCard>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                
                {/* Tools Panel */}
                <McCard title="Tools" className="bg-[#333333]">
                     <div className="flex flex-col gap-3 min-h-[100px]">
                        {!imageData && (
                             <div className="text-center text-[#777] py-4 italic">
                                 Generate an image to unlock tools
                             </div>
                        )}

                        {imageData && (
                            <McButton
                                onClick={handleVoxelize}
                                disabled={isLoading}
                                variant="grass"
                                className="w-full py-4"
                            >
                                {voxelCode ? 'Re-Build World' : 'Build 3D World'}
                            </McButton>
                        )}

                        {imageData && voxelCode && (
                            <div className="grid grid-cols-2 gap-2">
                                <McButton
                                    onClick={() => setViewMode(viewMode === 'image' ? 'voxel' : 'image')}
                                    disabled={isLoading}
                                    className="text-sm px-2"
                                    variant="stone"
                                >
                                    {viewMode === 'image' ? 'View 3D' : 'View 2D'}
                                </McButton>
                                <McButton
                                    onClick={handleDownload}
                                    disabled={isLoading}
                                    className="text-sm px-2"
                                    variant="stone"
                                >
                                    Save File
                                </McButton>
                            </div>
                        )}

                        {viewMode === 'voxel' && voxelCode && (
                            <McButton
                                onClick={handleToggleInstructions}
                                disabled={isLoading}
                                className="w-full text-sm mt-2"
                                variant="wood"
                            >
                                Open Block Guide
                            </McButton>
                        )}
                     </div>
                </McCard>

                {/* Settings Panel */}
                {viewMode === 'voxel' && voxelCode && (
                    <McCard title="Atmosphere" className="bg-[#333333] animate-in slide-in-from-right-4">
                        <div className="space-y-6 py-2">
                            <McSlider 
                                label="Time of Day" 
                                value={sunlight} 
                                min={0} max={1} step={0.05} 
                                onChange={setSunlight} 
                            />
                            <McSlider 
                                label="God Rays" 
                                value={godRays} 
                                min={0} max={1} step={0.1} 
                                onChange={setGodRays} 
                            />
                        </div>
                    </McCard>
                )}

                {/* Instructions */}
                <div className="bg-[#2d2d2d] p-4 border-4 border-[#111] text-[#ccc] text-sm font-minecraft leading-relaxed shadow-lg">
                    <p className="mb-2 text-[#ffd700] text-lg border-b border-[#444] pb-1">HOW TO PLAY:</p>
                    <ol className="list-decimal list-inside space-y-1 opacity-90">
                        <li>Create an Image</li>
                        <li>Click "Build 3D World"</li>
                        <li>Use Mouse to Spin 3D Model</li>
                        <li>Open "Block Guide" to see parts!</li>
                    </ol>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default App;

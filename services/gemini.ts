/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI, Modality } from "@google/genai";
import { extractHtmlFromText } from "../utils/html";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const IMAGE_SYSTEM_PROMPT = "Generate a high-quality screenshot or render of a Minecraft build. The image should be blocky, use standard Minecraft textures visually, and be on a simple background. Focus on a single distinct structure or object.";

// --- THE ROBUST TEMPLATE ---
// We inject the AI's code into this template.
// CRITICAL: All backticks inside the template string MUST be escaped as \` to avoid breaking the TS string.
// Also, variable interpolations intended for the runtime JS (client-side) MUST be escaped as \${var}.
const VOXEL_TEMPLATE = (aiCode: string) => `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { margin: 0; overflow: hidden; background-color: #87CEEB; font-family: 'Courier New', monospace; user-select: none; }
        
        /* ERROR BOX */
        #error-box { position:absolute; top:10px; left:10px; background:rgba(200,0,0,0.8); color:white; padding:15px; border: 2px solid white; display:none; z-index: 10000; pointer-events:none;}
        
        /* RECIPE BOOK UI */
        #mc-build-instructions {
            display:none; 
            position:absolute; top:50%; left:50%; transform:translate(-50%, -50%);
            width: 380px; height: 500px; 
            background: #C6C6C6; /* Minecraft GUI Grey */
            border: 4px solid #373737;
            box-shadow: 10px 10px 0 rgba(0,0,0,0.5); 
            display: flex; flex-direction: column;
            z-index: 9000;
        }
        .mc-header {
            background: #8b8b8b; border-bottom: 4px solid #373737; padding: 10px;
            color: #373737; font-weight: bold; font-size: 20px; text-align: center;
            text-shadow: 2px 2px 0 #fff;
        }
        .mc-tabs { display: flex; border-bottom: 4px solid #373737; background: #8b8b8b; }
        .mc-tab {
            flex: 1; padding: 8px; text-align: center; cursor: pointer; border-right: 2px solid #555;
            background: #C6C6C6; color: #555; font-weight: bold;
        }
        .mc-tab.active { background: #E6E6E6; color: #000; }
        
        .mc-content { flex: 1; overflow-y: auto; padding: 10px; background: #E6E6E6; }
        
        /* List Styles */
        .layer-group { margin-bottom: 15px; border: 2px solid #999; background: #fff; padding: 5px; }
        .layer-title { background: #ddd; padding: 5px; font-weight: bold; border-bottom: 2px solid #999; margin: -5px -5px 5px -5px; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { padding: 4px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
        li:last-child { border-bottom: none; }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #C6C6C6; }
        ::-webkit-scrollbar-thumb { background: #555; border: 2px solid #C6C6C6; }

    </style>
    <!-- IMPORT MAP (Using esm.sh for reliability) -->
    <script type="importmap">
      { "imports": { "three": "https://esm.sh/three@0.160.0", "three/addons/": "https://esm.sh/three@0.160.0/examples/jsm/" } }
    </script>
</head>
<body>
    <div id="error-box"></div>
    
    <!-- BOOK UI -->
    <div id="mc-build-instructions" style="display:none;">
       <div class="mc-header">Construct Guide</div>
       <div class="mc-tabs">
           <div class="mc-tab active" onclick="switchTab('summary')">Total Materials</div>
           <div class="mc-tab" onclick="switchTab('layers')">Layer Guide</div>
       </div>
       <div id="view-summary" class="mc-content">
           <ul id="list-summary"></ul>
       </div>
       <div id="view-layers" class="mc-content" style="display:none;">
           <div style="text-align:center; color:#666; margin-bottom:10px;">Build from bottom up!</div>
           <div id="list-layers"></div>
       </div>
    </div>

    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        // GLOBALS
        let camera, scene, renderer, controls, sunLight, moonLight, godRayMesh, instancedMesh;
        const voxels = []; // {x,y,z,type}
        const matCache = {}; // Store textures to reuse
        
        // 1. AUTHENTIC PIXEL ART TEXTURE GENERATOR
        // Using 16x16 canvas to ensure it looks exactly like Minecraft texture resolution
        function createBlockTexture(type, side='all') {
            const size = 16;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // --- Helper: Fill with noise ---
            const fillNoise = (baseColor, variance=10) => {
                ctx.fillStyle = baseColor;
                ctx.fillRect(0,0,size,size);
                const id = ctx.getImageData(0,0,size,size);
                const d = id.data;
                for(let i=0; i<d.length; i+=4) {
                    const noise = (Math.random()-0.5) * variance;
                    d[i] = Math.max(0, Math.min(255, d[i]+noise));
                    d[i+1] = Math.max(0, Math.min(255, d[i+1]+noise));
                    d[i+2] = Math.max(0, Math.min(255, d[i+2]+noise));
                }
                ctx.putImageData(id, 0, 0);
            };

            // --- Helper: Draw Pixels ---
            const drawPixel = (x, y, color) => {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
            }

            // --- Colors ---
            const C = {
                grass_top: '#5b8a3c', grass_dark: '#4a6b2e',
                dirt: '#866043', dirt_dark: '#6b4d35',
                stone: '#7d7d7d', stone_dark: '#666666',
                planks: '#a07040', planks_dark: '#7c5531',
                log_side: '#382618', log_dark: '#261910', log_top: '#5c3c22',
                leaves: '#4a8f28', leaves_dark: '#366923',
                cherry_planks: '#e0a3ad', cherry_dark: '#c48e97',
                cherry_log: '#2d1e2d', cherry_top: '#4a2e3d',
                sand: '#dbd3a0', water: '#3f76e4',
                brick: '#966c4a', brick_dark: '#78563b',
                cobble_base: '#6b6b6b', cobble_light: '#808080'
            };

            // --- Logic ---
            if (type === 'grass') {
                if (side === 'top') {
                    fillNoise(C.grass_top, 20);
                    // Add some "texture" dots
                    for(let i=0; i<10; i++) drawPixel(Math.random()*16, Math.random()*16, C.grass_dark);
                } else if (side === 'bottom') {
                    fillNoise(C.dirt, 30);
                } else {
                    // Side: Dirt with Grass overlay
                    fillNoise(C.dirt, 30);
                    ctx.fillStyle = C.grass_top;
                    ctx.fillRect(0,0,16,3); // Top strip
                    // Dripping grass
                    for(let x=0; x<16; x++) {
                        if(Math.random()>0.5) drawPixel(x, 3, C.grass_top);
                        if(Math.random()>0.8) drawPixel(x, 4, C.grass_top);
                    }
                }
            }
            else if (type === 'dirt') {
                fillNoise(C.dirt, 30);
            }
            else if (type === 'stone') {
                fillNoise(C.stone, 15);
                // Random specs
                for(let i=0; i<8; i++) drawPixel(Math.random()*16, Math.random()*16, C.stone_dark);
            }
            else if (type === 'cobblestone') {
                fillNoise(C.cobble_base, 20);
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                // Draw rudimentary stones
                const stones = [[2,2,6,6], [8,2,6,4], [1,8,5,6], [7,7,8,7]];
                stones.forEach(r => ctx.strokeRect(r[0],r[1],r[2],r[3]));
            }
            else if (type.includes('planks')) {
                const color = type.includes('cherry') ? C.cherry_planks : C.planks;
                const dark = type.includes('cherry') ? C.cherry_dark : C.planks_dark;
                fillNoise(color, 10);
                // 4 Horizontal boards
                for(let y=0; y<16; y+=4) {
                    ctx.fillStyle = dark;
                    ctx.fillRect(0, y, 16, 1); // Dark line between boards
                    // Nail holes
                    drawPixel(2, y+2, dark);
                    drawPixel(13, y+2, dark);
                }
            }
            else if (type.includes('log')) {
                const isCherry = type.includes('cherry');
                if (side === 'top' || side === 'bottom') {
                    const c = isCherry ? C.cherry_top : C.log_top;
                    fillNoise(c, 20);
                    // Rings
                    ctx.strokeStyle = isCherry ? '#2d1e2d' : '#382618';
                    ctx.strokeRect(2,2,12,12);
                    ctx.strokeRect(5,5,6,6);
                } else {
                    const c = isCherry ? C.cherry_log : C.log_side;
                    fillNoise(c, 20);
                    // Vertical streaks
                    ctx.fillStyle = isCherry ? '#1a111a' : '#261910';
                    for(let i=0; i<6; i++) ctx.fillRect(Math.floor(Math.random()*16), 0, 1, 16);
                }
            }
            else if (type === 'brick') {
                fillNoise(C.brick, 15);
                ctx.fillStyle = '#bd9a7a'; // Mortar
                // Rows
                for(let y=0; y<16; y+=4) {
                    ctx.fillRect(0, y+3, 16, 1);
                    // Staggered vertical lines
                    let off = (y%8===0) ? 0 : 8;
                    ctx.fillRect(4+off, y, 1, 3);
                    ctx.fillRect(12+off, y, 1, 3);
                }
            }
            else if (type === 'glass') {
                ctx.fillStyle = '#e0f0ff';
                ctx.strokeStyle = 'white';
                ctx.strokeRect(1,1,14,14);
                drawPixel(3,3, 'white');
                drawPixel(4,4, 'white');
                drawPixel(12,12, 'white');
            }
            else if (type.includes('leaves')) {
                 const c = type.includes('cherry') ? '#f79ec6' : C.leaves;
                 fillNoise(c, 40);
                 // Transparent holes for fancy leaves? (Optional, keeping opaque for performance/style)
            }
            else {
                 // Default fallback
                 let color = '#ff00ff';
                 if(C[type]) color = C[type];
                 else if(type.includes('wool_')) {
                     const map = {white:'#fff', orange:'#f9801d', red:'#b02e26', black:'#1d1d21'};
                     const t = type.replace('wool_','');
                     if(map[t]) color = map[t];
                 }
                 else if(type === 'gold') color = '#fcee4b';
                 else if(type === 'iron') color = '#e6e6e6';
                 else if(type === 'diamond') color = '#3de0d5';
                 else if(type === 'bedrock') color = '#333333';
                 else if(type === 'obsidian') color = '#140e1f';
                 
                 fillNoise(color, 30);
            }

            const tex = new THREE.CanvasTexture(canvas);
            // CRITICAL: Nearest filter gives the sharp pixel art look
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        }

        function getBlockMaterial(type) {
            if (matCache[type]) return matCache[type];

            let mat;
            // Multi-sided blocks
            if (type === 'grass') {
                const top = new THREE.MeshStandardMaterial({ map: createBlockTexture('grass', 'top'), roughness: 1.0, metalness: 0 });
                const side = new THREE.MeshStandardMaterial({ map: createBlockTexture('grass', 'side'), roughness: 1.0, metalness: 0 });
                const bottom = new THREE.MeshStandardMaterial({ map: createBlockTexture('grass', 'bottom'), roughness: 1.0, metalness: 0 });
                mat = [side, side, top, bottom, side, side];
            } 
            else if (type === 'log_oak' || type === 'cherry_log') {
                const top = new THREE.MeshStandardMaterial({ map: createBlockTexture(type, 'top'), roughness: 1.0, metalness: 0 });
                const side = new THREE.MeshStandardMaterial({ map: createBlockTexture(type, 'side'), roughness: 1.0, metalness: 0 });
                mat = [side, side, top, top, side, side];
            }
            else {
                const tex = createBlockTexture(type);
                let transparent = false;
                if (type === 'glass' || type.includes('leaves')) transparent = true;
                
                mat = new THREE.MeshStandardMaterial({ 
                    map: tex, 
                    transparent: transparent, 
                    opacity: (type==='glass' ? 0.4 : 1.0),
                    alphaTest: (type.includes('leaves') ? 0.5 : 0),
                    roughness: 1.0, // Minecraft blocks are matte
                    metalness: 0.0
                });
            }
            
            matCache[type] = mat;
            return mat;
        }

        function addBlock(x, y, z, type) {
            type = (type || 'stone').toLowerCase().replace(/ /g, '_');
            voxels.push({x, y, z, type});
        }
        window.addBlock = addBlock;

        // 3. SAKURA ENVIRONMENT
        function generateSakuraClearing() {
            const groundGeo = new THREE.PlaneGeometry(200, 200);
            const groundTex = createBlockTexture('grass', 'top');
            groundTex.wrapS = THREE.RepeatWrapping; groundTex.wrapT = THREE.RepeatWrapping;
            groundTex.repeat.set(200,200);
            const groundMat = new THREE.MeshStandardMaterial({map:groundTex, roughness:1});
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI/2;
            ground.position.y = -0.5; 
            ground.receiveShadow = true;
            scene.add(ground);

            const treeCount = 12;
            const ringRadius = 25;
            
            const buildTree = (bx, by, bz) => {
                const h = 4 + Math.floor(Math.random()*2);
                for(let i=0; i<h; i++) {
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), getBlockMaterial('cherry_log'));
                    mesh.position.set(bx, by+i, bz);
                    mesh.castShadow = true; mesh.receiveShadow = true;
                    scene.add(mesh);
                }
                for(let x=-2; x<=2; x++) {
                    for(let y=0; y<=2; y++) {
                        for(let z=-2; z<=2; z++) {
                            if(Math.abs(x)===2 && Math.abs(z)===2) continue;
                            if(Math.random()>0.8) continue;
                            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), getBlockMaterial('cherry_leaves'));
                            mesh.position.set(bx+x, by+h-1+y, bz+z);
                            mesh.castShadow = true; mesh.receiveShadow = true;
                            scene.add(mesh);
                        }
                    }
                }
            };

            for(let i=0; i<treeCount; i++) {
                const angle = (i / treeCount) * Math.PI * 2;
                const dist = ringRadius + (Math.random()-0.5) * 10;
                const tx = Math.cos(angle) * dist;
                const tz = Math.sin(angle) * dist;
                buildTree(Math.floor(tx), 0, Math.floor(tz));
                
                for(let k=0; k<5; k++) {
                    const gx = tx + (Math.random()-0.5)*6;
                    const gz = tz + (Math.random()-0.5)*6;
                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshBasicMaterial({color:0x5b8a3c}));
                    mesh.position.set(gx, 0, gz);
                    scene.add(mesh);
                }
            }
        }

        // 4. UI LOGIC
        window.switchTab = function(tab) {
            document.getElementById('view-summary').style.display = tab==='summary'?'block':'none';
            document.getElementById('view-layers').style.display = tab==='layers'?'block':'none';
            document.querySelectorAll('.mc-tab').forEach(el => el.classList.remove('active'));
            document.querySelector('.mc-tab[onclick*="'+tab+'"]').classList.add('active');
        }

        function generateRecipeBook() {
            const counts = {};
            voxels.forEach(v => counts[v.type] = (counts[v.type]||0)+1);
            const listSummary = document.getElementById('list-summary');
            listSummary.innerHTML = '';
            for (const [t, c] of Object.entries(counts)) {
                // ESCAPED BACKTICKS AND INTERPOLATION HERE
                listSummary.innerHTML += \`<li><span style="text-transform:capitalize">\${t.replace(/_/g,' ')}</span> <span>x\${c}</span></li>\`;
            }

            const layers = {};
            let minY = Infinity;
            voxels.forEach(v => {
                if(!layers[v.y]) layers[v.y] = {};
                layers[v.y][v.type] = (layers[v.y][v.type]||0)+1;
                if(v.y < minY) minY = v.y;
            });

            const sortedYs = Object.keys(layers).sort((a,b) => parseInt(a)-parseInt(b));
            const listLayers = document.getElementById('list-layers');
            listLayers.innerHTML = '';
            
            sortedYs.forEach((y, idx) => {
                const group = document.createElement('div');
                group.className = 'layer-group';
                // ESCAPED BACKTICKS AND INTERPOLATION HERE
                let html = \`<div class="layer-title">Layer \${idx+1} (Y=\${y})</div><ul>\`;
                for (const [t, c] of Object.entries(layers[y])) {
                     // ESCAPED BACKTICKS AND INTERPOLATION HERE
                     html += \`<li><span style="text-transform:capitalize">\${t.replace(/_/g,' ')}</span> <span>x\${c}</span></li>\`;
                }
                html += '</ul>';
                group.innerHTML = html;
                listLayers.appendChild(group);
            });
        }

        // 5. INIT
        function init() {
            try {
                scene = new THREE.Scene();
                const skyColor = 0x9AD3FF; 
                scene.background = new THREE.Color(skyColor);
                // REDUCED FOG FOR CLARITY (Subject Area Cleared)
                scene.fog = new THREE.Fog(skyColor, 100, 500);

                camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
                
                renderer = new THREE.WebGLRenderer({antialias:true});
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                renderer.outputColorSpace = THREE.SRGBColorSpace; // Better colors
                document.body.appendChild(renderer.domElement);

                controls = new OrbitControls(camera, renderer.domElement);
                
                // LIGHTING IMPROVEMENTS
                // Hemisphere light approximates sky bounce (Ambient Occlusion feel)
                const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
                scene.add(hemiLight);
                
                const amb = new THREE.AmbientLight(0x404040, 0.2); // Low base ambient
                scene.add(amb);
                
                // SUN & MOON
                sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
                sunLight.position.set(50, 80, 30);
                sunLight.castShadow = true;
                sunLight.shadow.mapSize.width = 2048;
                sunLight.shadow.mapSize.height = 2048;
                // Improve shadow bias to remove acne
                sunLight.shadow.bias = -0.0005;
                scene.add(sunLight);
                
                moonLight = new THREE.DirectionalLight(0x6688aa, 0.5);
                moonLight.position.set(-50, -80, -30);
                moonLight.castShadow = false; // Only sun casts shadows for performance
                scene.add(moonLight);

                // GOD RAYS MESH
                const grGeo = new THREE.ConeGeometry(30, 300, 32, 1, true);
                const grMat = new THREE.MeshBasicMaterial({
                    color: 0xffddaa, 
                    transparent: true, 
                    opacity: 0.0, 
                    side: THREE.DoubleSide, 
                    depthWrite: false, 
                    blending: THREE.AdditiveBlending 
                });
                godRayMesh = new THREE.Mesh(grGeo, grMat);
                godRayMesh.position.copy(sunLight.position);
                godRayMesh.lookAt(0,0,0);
                scene.add(godRayMesh);

                generateSakuraClearing();

                // --- EXECUTE INJECTED AI CODE SAFELY ---
                // Wrapped in a closure to allow both raw code and function definitions
                (() => {
                    ${aiCode}
                    
                    // If the AI defined a function but didn't call it, call it now.
                    if (typeof generateWorld === 'function') {
                        generateWorld();
                    }
                })();
                // ---------------------------------------

                // FALLBACK: If no voxels generated, create a bedrock platform
                if (voxels.length === 0) {
                    console.warn("No voxels generated. Creating fallback.");
                    for(let x=-2; x<=2; x++) {
                        for(let z=-2; z<=2; z++) {
                            addBlock(x, 0, z, 'bedrock');
                        }
                    }
                    // Add a simple sign-post (Fence + Planks)
                    addBlock(0, 1, 0, 'planks_oak');
                    addBlock(0, 2, 0, 'planks_oak');
                }

                const geo = new THREE.BoxGeometry(1,1,1);
                const root = new THREE.Group();
                scene.add(root);

                let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;

                voxels.forEach(v => {
                    const mat = getBlockMaterial(v.type);
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(v.x, v.y, v.z);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    root.add(mesh);

                    if(v.x<minX) minX=v.x; if(v.x>maxX) maxX=v.x;
                    if(v.y<minY) minY=v.y; if(v.y>maxY) maxY=v.y;
                    if(v.z<minZ) minZ=v.z; if(v.z>maxZ) maxZ=v.z;
                });

                if(voxels.length > 0) {
                    const cx = (minX+maxX)/2;
                    const cy = (minY+maxY)/2;
                    const cz = (minZ+maxZ)/2;
                    const size = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
                    controls.target.set(cx, cy, cz);
                    camera.position.set(cx + size + 15, cy + size + 10, cz + size + 15);
                    controls.update();
                } else {
                    camera.position.set(20,20,20);
                    controls.target.set(0,0,0);
                }

                generateRecipeBook();
                animate();

            } catch (err) {
                const errBox = document.getElementById('error-box');
                errBox.style.display = 'block';
                errBox.innerHTML = "<strong>Render Error:</strong><br>" + err.message + "<br><br>See console for details.";
                console.error("Render crash:", err);
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- ENVIRONMENT & TIME CYCLE ---
        window.addEventListener('message', (e) => {
             if(e.data.type === 'toggleInstructions') {
                 const el = document.getElementById('mc-build-instructions');
                 el.style.display = el.style.display === 'none' ? 'flex' : 'none';
             }
             
             if(e.data.type === 'environment' && sunLight) {
                 // Time: 0.0 (Dawn) -> 0.25 (Noon) -> 0.5 (Sunset) -> 0.75 (Midnight) -> 1.0 (Dawn)
                 // Slider (0-1) maps to full 24 hour cycle
                 const time = e.data.sunlight;
                 const godRayInt = e.data.godrays;
                 
                 // Calculate Sun Position (Orbiting over X axis)
                 // Angle: 0 = Dawn (Left), PI/2 = Noon (Up), PI = Dusk (Right), 3PI/2 = Midnight (Down)
                 const angle = (time * Math.PI * 2) - Math.PI/2;
                 const radius = 120;
                 
                 const sx = Math.cos(angle) * radius;
                 const sy = Math.sin(angle) * radius;
                 
                 // Position Sun and Moon opposite each other
                 sunLight.position.set(sx, sy, 20);
                 moonLight.position.set(-sx, -sy, 20); // Moon opposite
                 
                 // Handle Intensities
                 const isDay = sy > -10; 
                 sunLight.intensity = isDay ? 1.2 : 0;
                 moonLight.intensity = isDay ? 0 : 0.5;
                 
                 // God Rays follow Sun
                 if(godRayMesh) {
                     godRayMesh.position.copy(sunLight.position);
                     godRayMesh.lookAt(0,0,0);
                     // Only visible when sun is above horizon
                     godRayMesh.visible = sy > 0;
                     godRayMesh.material.opacity = (sy > 0) ? godRayInt * 0.3 : 0;
                 }
                 
                 // --- DYNAMIC SKY COLORS ---
                 const sky = new THREE.Color();
                 const fog = new THREE.Color();
                 
                 if (time < 0.1) { // Dawn (Dark -> Orange)
                    sky.setHSL(0.05, 0.8, 0.5); // Orange
                 } else if (time < 0.4) { // Morning/Noon (Blue)
                    sky.setHSL(0.6, 0.7, 0.8); // Sky Blue
                 } else if (time < 0.55) { // Sunset (Purple/Orange)
                    sky.setHSL(0.85, 0.6, 0.6); // Purpleish
                 } else if (time < 0.9) { // Night (Black/Dark Blue)
                    sky.setHSL(0.65, 0.5, 0.05); // Deep Dark Blue
                 } else { // Sunrise
                    sky.setHSL(0.05, 0.8, 0.5);
                 }
                 
                 // Smooth interpolation could be added, but HSL steps work well for Minecraft style
                 scene.background = sky;
                 scene.fog.color = sky;
             }
        });
        
        // Listen for runtime errors and show them on screen
        window.onerror = function(msg, url, lineNo, columnNo, error) {
            const errBox = document.getElementById('error-box');
            errBox.style.display = 'block';
            errBox.innerHTML = "<strong>Script Error:</strong><br>" + msg + "<br>Line: " + lineNo;
            return false;
        };

        init();
    </script>
</body>
</html>`;

// The actual instruction for the AI
const AI_INSTRUCTION = `
Analyze the provided image carefully.
Your task is to reconstruct the structure in the image as accurately as possible using standard Minecraft blocks.
Focus heavily on matching the **colors** and **shapes** of the image.

**Instructions:**
1.  Generate Javascript code that calls \`addBlock(x, y, z, type)\` to build the structure.
2.  **DO NOT** wrap your code in a function or use imports. Just write the list of \`addBlock\` calls (loops are fine).
3.  **Palette**: 
    - WOOD: 'planks_oak', 'log_oak', 'cherry_planks', 'cherry_log'
    - STONE: 'stone', 'cobblestone', 'brick', 'obsidian', 'bedrock'
    - COLOR: 'wool_white', 'wool_orange', 'wool_red', 'wool_black', 'gold', 'iron', 'diamond'
    - NATURE: 'grass', 'dirt', 'leaves', 'cherry_leaves', 'sand', 'water'
    - MISC: 'glass'
4.  Center your build around 0,0,0.
5.  If you see a house, build walls, roof, windows. If you see a character, match their skin colors using wool.

**Example:**
for(let y=0; y<5; y++) {
  addBlock(0, y, 0, 'log_oak');
}
addBlock(1, 0, 0, 'wool_red');
`;

export const generateImage = async (prompt: string, aspectRatio: string = '1:1', optimize: boolean = true): Promise<string> => {
  try {
    let finalPrompt = prompt;
    if (optimize) {
      finalPrompt = `${IMAGE_SYSTEM_PROMPT}\n\nSubject: ${prompt}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: finalPrompt,
          },
        ],
      },
      config: {
        responseModalities: [
            Modality.IMAGE,
        ],
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData) {
        const base64ImageBytes = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${base64ImageBytes}`;
    } else {
      throw new Error("No image generated.");
    }
  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
};

export const generateVoxelScene = async (
  imageBase64: string, 
  onThoughtUpdate?: (thought: string) => void
): Promise<string> => {
  const base64Data = imageBase64.split(',')[1] || imageBase64;
  const mimeMatch = imageBase64.match(/^data:(.*?);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  let aiCode = "";

  try {
    // Guidelines: do not use thinking config with models other than 2.5 series.
    // 'gemini-3-pro-preview' is powerful but does not support thinking config in the same way as 2.5 series 
    // or it might be restricted. The error report doesn't flag this, but guidelines do.
    // For safety and compliance with guidelines, we will use gemini-2.5-flash if we want thinking, 
    // or remove thinking config for gemini-3-pro.
    // However, the user code used 'gemini-3-pro-preview'.
    // The prompt instructions say: "Complex Text Tasks (e.g., advanced reasoning, coding, math, and STEM): 'gemini-3-pro-preview'"
    // So keeping 'gemini-3-pro-preview' is correct for coding tasks.
    // The prompt instructions also say: "The Thinking Config is only available for the Gemini 2.5 series models. Do not use it with other models."
    // Therefore, we MUST remove thinkingConfig from gemini-3-pro-preview.
    
    const response = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: AI_INSTRUCTION
          }
        ]
      },
      // Config removed as thinkingConfig is not supported on gemini-3-pro-preview per guidelines
    });

    for await (const chunk of response) {
      const candidates = chunk.candidates;
      if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
            if (part.text) {
              aiCode += part.text;
            }
        }
      }
    }
    
    // Clean markdown code blocks
    const cleanCode = aiCode.replace(/```javascript/g, '').replace(/```/g, '');

    // Inject into the robust template
    const finalHtml = VOXEL_TEMPLATE(cleanCode);

    return finalHtml;

  } catch (error) {
    console.error("Voxel scene generation failed:", error);
    throw error;
  }
};
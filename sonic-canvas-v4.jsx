import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Type, Settings, Mic, Eraser, X, Activity, ChevronDown, ChevronUp, Check } from 'lucide-react';

// AirPlay icon component styled like Apple's
const AirPlayIcon = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path 
      d="M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      fill="none"
    />
    <polygon points="12,22 6,15 18,15" fill="currentColor" />
  </svg>
);

// Font options for IG-style font picker
const FONT_OPTIONS = [
  { id: 'classic', name: 'Classic', family: 'system-ui, -apple-system, sans-serif', weight: '600' },
  { id: 'modern', name: 'Modern', family: 'SF Pro Display, -apple-system, sans-serif', weight: '700' },
  { id: 'neon', name: 'Neon', family: 'Courier New, monospace', weight: 'bold' },
  { id: 'typewriter', name: 'Type', family: 'American Typewriter, Courier, monospace', weight: 'normal' },
  { id: 'strong', name: 'Strong', family: 'Impact, Haettenschweiler, sans-serif', weight: 'normal' },
  { id: 'cursive', name: 'Script', family: 'Snell Roundhand, cursive', weight: 'normal' },
];

// Canvas dimensions - vertical for phone, will letterbox to 16:9 for AirPlay
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export default function AudioReactiveCanvas() {
  const canvasRef = useRef(null);
  const staticCanvasRef = useRef(null);
  const airplayCanvasRef = useRef(null); // Separate canvas for 16:9 AirPlay output
  const containerRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const strokesRef = useRef([]);
  const waveformRef = useRef(new Float32Array(128));
  const videoRef = useRef(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState('draw');
  const [color, setColor] = useState('#a855f7');
  const [brushSize, setBrushSize] = useState(4);
  const [isListening, setIsListening] = useState(false);
  const [audioContext, setAudioContext] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [dataArray, setDataArray] = useState(null);
  
  const [texts, setTexts] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [draggingTextId, setDraggingTextId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedFont, setSelectedFont] = useState(FONT_OPTIONS[0]);
  const [isTextMode, setIsTextMode] = useState(false);
  
  // Two-finger gesture state
  const [gestureState, setGestureState] = useState(null);
  
  const [currentStroke, setCurrentStroke] = useState([]);
  const [touchStart, setTouchStart] = useState(null);
  const [expandedEffect, setExpandedEffect] = useState(null);
  const [isAirPlayActive, setIsAirPlayActive] = useState(false);
  
  const [audioParams, setAudioParams] = useState({
    volume: 0, pitch: 0, lowFreq: 0, midFreq: 0, highFreq: 0,
    spectralCentroid: 0, spectralFlux: 0, zeroCrossing: 0, bassHit: 0
  });
  
  // Enhanced mappings
  const [mappings, setMappings] = useState({
    scale: { param: 'volume', min: 0.95, max: 1.12, enabled: true, amplify: 3.5, label: 'Pulse/Scale' },
    rotation: { param: 'spectralCentroid', min: -4, max: 4, enabled: true, amplify: 2.5, label: 'Rotation' },
    hueShift: { param: 'pitch', min: -60, max: 60, enabled: true, amplify: 3, label: 'Hue Shift' },
    brightness: { param: 'volume', min: 0.85, max: 1.5, enabled: true, amplify: 3.5, label: 'Brightness' },
    saturation: { param: 'midFreq', min: 0.8, max: 2.0, enabled: true, amplify: 3, label: 'Saturation' },
    contrast: { param: 'lowFreq', min: 0.9, max: 1.3, enabled: true, amplify: 2.5, label: 'Contrast' },
    xOffset: { param: 'spectralFlux', min: -12, max: 12, enabled: true, amplify: 5, label: 'Horizontal Shake' },
    yOffset: { param: 'bassHit', min: -18, max: 18, enabled: true, amplify: 6, label: 'Vertical Bounce' },
    squiggle: { param: 'volume', min: 0, max: 20, enabled: true, amplify: 4.5, label: 'Line Squiggle' },
    lineWidth: { param: 'lowFreq', min: 0.7, max: 1.6, enabled: true, amplify: 3.5, label: 'Line Thickness' },
    glow: { param: 'highFreq', min: 8, max: 50, enabled: true, amplify: 4, label: 'Glow Intensity' },
    textScale: { param: 'volume', min: 0.9, max: 1.25, enabled: true, amplify: 4, label: 'Text/Emoji Scale' },
    textRotation: { param: 'highFreq', min: -8, max: 8, enabled: true, amplify: 3, label: 'Text/Emoji Rotate' },
    textGlow: { param: 'volume', min: 5, max: 40, enabled: true, amplify: 4, label: 'Text/Emoji Glow' },
  });

  const colorPresets = ['#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'];
  const audioParamOptions = [
    { value: 'volume', label: 'Volume' },
    { value: 'pitch', label: 'Pitch' },
    { value: 'lowFreq', label: 'Bass' },
    { value: 'midFreq', label: 'Mids' },
    { value: 'highFreq', label: 'Treble' },
    { value: 'bassHit', label: 'Bass Hit' },
    { value: 'spectralCentroid', label: 'Brightness' },
    { value: 'spectralFlux', label: 'Change' },
    { value: 'zeroCrossing', label: 'Noise' },
  ];

  // Initialize canvases
  const initCanvases = useCallback(() => {
    const staticCanvas = staticCanvasRef.current;
    const displayCanvas = canvasRef.current;
    const airplayCanvas = airplayCanvasRef.current;
    
    if (staticCanvas && (staticCanvas.width !== CANVAS_WIDTH || staticCanvas.height !== CANVAS_HEIGHT)) {
      staticCanvas.width = CANVAS_WIDTH;
      staticCanvas.height = CANVAS_HEIGHT;
      const ctx = staticCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
    
    if (displayCanvas && (displayCanvas.width !== CANVAS_WIDTH || displayCanvas.height !== CANVAS_HEIGHT)) {
      displayCanvas.width = CANVAS_WIDTH;
      displayCanvas.height = CANVAS_HEIGHT;
    }
    
    // AirPlay canvas is 16:9 landscape
    if (airplayCanvas && (airplayCanvas.width !== 1920 || airplayCanvas.height !== 1080)) {
      airplayCanvas.width = 1920;
      airplayCanvas.height = 1080;
    }
  }, []);

  useEffect(() => {
    initCanvases();
  }, [initCanvases]);

  // Redraw strokes
  const redrawStrokes = useCallback((ctx, effects = null, waveform = null) => {
    if (!ctx) return;
    
    strokesRef.current.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      
      let lineWidth = stroke.size;
      if (effects?.lineWidth) lineWidth *= effects.lineWidth;
      ctx.lineWidth = lineWidth;
      
      ctx.shadowBlur = effects?.glow || 15;
      ctx.shadowColor = stroke.color;
      
      const squiggleAmount = effects?.squiggle || 0;
      const waveData = waveform || waveformRef.current;
      
      const points = stroke.points;
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        let x = points[i].x;
        let y = points[i].y;
        
        if (squiggleAmount > 0 && waveData?.length > 0) {
          const waveIndex = Math.floor((i / points.length) * waveData.length);
          const waveValue = waveData[waveIndex] || 0;
          
          const prevPoint = points[i - 1];
          const dx = x - prevPoint.x;
          const dy = y - prevPoint.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          
          if (len > 0) {
            const perpX = -dy / len;
            const perpY = dx / len;
            x += perpX * waveValue * squiggleAmount;
            y += perpY * waveValue * squiggleAmount;
          }
        }
        
        ctx.lineTo(x, y);
      }
      
      ctx.stroke();
    });
  }, []);

  // Draw texts
  const drawTexts = useCallback((ctx, textsArray, effects = null, isEditing = false) => {
    textsArray.forEach(t => {
      if (!t.text && t.id !== editingTextId) return;
      const font = FONT_OPTIONS.find(f => f.id === t.fontId) || FONT_OPTIONS[0];
      
      const baseScale = t.scale || 1;
      const baseRotation = t.rotation || 0;
      
      const textScaleEffect = effects?.textScale || 1;
      const textRotationEffect = effects?.textRotation || 0;
      const textGlowEffect = effects?.textGlow || 15;
      const hueShiftEffect = effects?.hueShift || 0;
      
      const finalScale = baseScale * textScaleEffect;
      const finalRotation = baseRotation + textRotationEffect;
      
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(finalScale, finalScale);
      ctx.rotate((finalRotation * Math.PI) / 180);
      
      ctx.shadowBlur = textGlowEffect;
      ctx.shadowColor = t.color;
      
      if (hueShiftEffect !== 0) {
        ctx.filter = `hue-rotate(${hueShiftEffect}deg)`;
      }
      
      ctx.font = `${font.weight} 72px ${font.family}`;
      ctx.fillStyle = t.color;
      
      const displayText = t.text || (t.id === editingTextId ? textInput : '');
      if (displayText) {
        ctx.fillText(displayText, 0, 0);
      }
      
      // Show cursor for editing text
      if (isEditing && t.id === editingTextId) {
        const metrics = ctx.measureText(displayText);
        ctx.fillStyle = t.color;
        ctx.globalAlpha = Math.sin(Date.now() / 300) > 0 ? 1 : 0;
        ctx.fillRect(metrics.width + 4, -50, 3, 60);
        ctx.globalAlpha = 1;
      }
      
      ctx.restore();
    });
  }, [editingTextId, textInput]);

  // Redraw static canvas
  const redrawStaticCanvas = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    redrawStrokes(ctx);
    drawTexts(ctx, texts, null, !!editingTextId);
  }, [texts, editingTextId, redrawStrokes, drawTexts]);

  // Update static canvas when texts change
  useEffect(() => {
    if (!isListening) {
      redrawStaticCanvas();
    }
  }, [texts, textInput, editingTextId, isListening, redrawStaticCanvas]);

  // Blinking cursor effect during text editing
  useEffect(() => {
    if (editingTextId && !isListening) {
      const interval = setInterval(redrawStaticCanvas, 300);
      return () => clearInterval(interval);
    }
  }, [editingTextId, isListening, redrawStaticCanvas]);

  const mapValue = (value, min, max, amplify = 1) => {
    const clampedValue = Math.max(0, Math.min(1, value * amplify));
    return min + clampedValue * (max - min);
  };

  const getCoords = (e, canvas = staticCanvasRef.current) => {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (mode !== 'draw' || isTextMode) return;
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    setCurrentStroke([{ x, y }]);
  };

  const draw = (e) => {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    
    const canvas = staticCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    const { x, y } = getCoords(e);
    
    const lastPoint = currentStroke[currentStroke.length - 1];
    if (lastPoint) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    
    setCurrentStroke(prev => [...prev, { x, y }]);
  };

  const stopDrawing = () => {
    if (isDrawing && currentStroke.length > 1) {
      strokesRef.current.push({
        points: [...currentStroke],
        color: color,
        size: brushSize * 2
      });
    }
    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const getTextAtPosition = (x, y) => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d');
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      if (!t.text) continue;
      
      const font = FONT_OPTIONS.find(f => f.id === t.fontId) || FONT_OPTIONS[0];
      ctx.font = `${font.weight} ${72 * (t.scale || 1)}px ${font.family}`;
      const metrics = ctx.measureText(t.text);
      const textWidth = metrics.width;
      const textHeight = 72 * (t.scale || 1);
      
      const padding = 50;
      if (x >= t.x - padding && x <= t.x + textWidth + padding &&
          y >= t.y - textHeight - padding && y <= t.y + padding) {
        return t;
      }
    }
    return null;
  };

  // Instagram-style: Enter text mode
  const enterTextMode = () => {
    setIsTextMode(true);
    setMode('text');
  };

  // Add new text at center
  const addNewText = () => {
    const newId = Date.now();
    const centerX = CANVAS_WIDTH / 2 - 100;
    const centerY = CANVAS_HEIGHT / 2;
    
    setEditingTextId(newId);
    setTextInput('');
    setTexts(prev => [...prev, { 
      id: newId, 
      text: '', 
      x: centerX, 
      y: centerY, 
      color, 
      scale: 1, 
      rotation: 0,
      fontId: selectedFont.id 
    }]);
  };

  // Finish editing current text
  const finishTextEditing = () => {
    if (editingTextId) {
      if (textInput.trim()) {
        setTexts(prev => prev.map(t => 
          t.id === editingTextId ? { ...t, text: textInput } : t
        ));
        setSelectedTextId(editingTextId);
      } else {
        // Remove empty text
        setTexts(prev => prev.filter(t => t.id !== editingTextId));
      }
      setEditingTextId(null);
      setTextInput('');
    }
  };

  // Exit text mode entirely
  const exitTextMode = () => {
    finishTextEditing();
    setIsTextMode(false);
    setSelectedTextId(null);
    setMode('draw');
  };

  // Handle canvas tap in text mode
  const handleTextModeCanvasTap = (e) => {
    if (!isTextMode) return;
    
    const { x, y } = getCoords(e);
    const clickedText = getTextAtPosition(x, y);
    
    if (clickedText) {
      // Tapped existing text - select it
      if (editingTextId && editingTextId !== clickedText.id) {
        finishTextEditing();
      }
      setSelectedTextId(clickedText.id);
      setDraggingTextId(clickedText.id);
      setDragOffset({ x: x - clickedText.x, y: y - clickedText.y });
    } else if (!editingTextId) {
      // Tapped empty space - add new text here
      const newId = Date.now();
      setEditingTextId(newId);
      setTextInput('');
      setSelectedTextId(null);
      setTexts(prev => [...prev, { 
        id: newId, 
        text: '', 
        x, 
        y, 
        color, 
        scale: 1, 
        rotation: 0,
        fontId: selectedFont.id 
      }]);
    }
  };

  // Two-finger gesture handlers
  const handleTouchStartGesture = (e) => {
    if (!isTextMode) {
      if (mode === 'draw') startDrawing(e);
      return;
    }
    
    if (e.touches.length === 2 && selectedTextId) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const angle = Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) * 180 / Math.PI;
      
      const selectedText = texts.find(t => t.id === selectedTextId);
      
      setGestureState({
        initialDistance: distance,
        initialAngle: angle,
        initialScale: selectedText?.scale || 1,
        initialRotation: selectedText?.rotation || 0,
      });
    } else if (e.touches.length === 1) {
      handleTextModeCanvasTap(e);
    }
  };

  const handleTouchMoveGesture = (e) => {
    if (!isTextMode) {
      if (mode === 'draw') draw(e);
      return;
    }
    
    if (e.touches.length === 2 && gestureState && selectedTextId) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const angle = Math.atan2(touch2.clientY - touch1.clientY, touch2.clientX - touch1.clientX) * 180 / Math.PI;
      
      const scaleChange = distance / gestureState.initialDistance;
      const rotationChange = angle - gestureState.initialAngle;
      
      setTexts(prev => prev.map(t => 
        t.id === selectedTextId 
          ? { 
              ...t, 
              scale: Math.max(0.3, Math.min(4, gestureState.initialScale * scaleChange)),
              rotation: gestureState.initialRotation + rotationChange
            }
          : t
      ));
    } else if (e.touches.length === 1 && draggingTextId) {
      e.preventDefault();
      const { x, y } = getCoords(e);
      setTexts(prev => prev.map(t => 
        t.id === draggingTextId 
          ? { ...t, x: x - dragOffset.x, y: y - dragOffset.y }
          : t
      ));
    }
  };

  const handleTouchEndGesture = () => {
    if (mode === 'draw') stopDrawing();
    setGestureState(null);
    setDraggingTextId(null);
  };

  const handleTextFontChange = (fontId) => {
    setSelectedFont(FONT_OPTIONS.find(f => f.id === fontId) || FONT_OPTIONS[0]);
    if (editingTextId) {
      setTexts(prev => prev.map(t => 
        t.id === editingTextId ? { ...t, fontId } : t
      ));
    } else if (selectedTextId) {
      setTexts(prev => prev.map(t => 
        t.id === selectedTextId ? { ...t, fontId } : t
      ));
    }
  };

  const handleTextColorChange = (newColor) => {
    setColor(newColor);
    if (editingTextId) {
      setTexts(prev => prev.map(t => 
        t.id === editingTextId ? { ...t, color: newColor } : t
      ));
    } else if (selectedTextId) {
      setTexts(prev => prev.map(t => 
        t.id === selectedTextId ? { ...t, color: newColor } : t
      ));
    }
  };

  const deleteSelectedText = () => {
    if (selectedTextId) {
      setTexts(prev => prev.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
    }
  };

  const clearCanvas = () => {
    const canvas = staticCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        strokesRef.current = [];
        setTexts([]);
      }
    }
  };

  // Render to AirPlay canvas (16:9 with letterboxing)
  const renderToAirPlayCanvas = useCallback((effects = null) => {
    const airplayCanvas = airplayCanvasRef.current;
    const sourceCanvas = isListening ? canvasRef.current : staticCanvasRef.current;
    
    if (!airplayCanvas || !sourceCanvas) return;
    
    const ctx = airplayCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear with black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1920, 1080);
    
    // Calculate letterbox dimensions for 9:16 content in 16:9 frame
    const sourceAspect = CANVAS_WIDTH / CANVAS_HEIGHT; // 9:16 = 0.5625
    const targetAspect = 16 / 9; // ~1.78
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    // Source is taller than target, so fit to height
    drawHeight = 1080;
    drawWidth = drawHeight * sourceAspect;
    offsetX = (1920 - drawWidth) / 2;
    offsetY = 0;
    
    // Draw the source canvas centered with letterboxing
    ctx.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
  }, [isListening]);

  // Setup AirPlay with proper canvas streaming
  const setupAirPlay = useCallback(() => {
    const airplayCanvas = airplayCanvasRef.current;
    if (!airplayCanvas) return;
    
    try {
      // Initial render
      renderToAirPlayCanvas();
      
      // Create video stream from airplay canvas
      const stream = airplayCanvas.captureStream(30);
      
      // Create or reuse video element
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.muted = false; // Allow audio routing
        video.autoplay = true;
        video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);
        videoRef.current = video;
      }
      
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
      
      setIsAirPlayActive(true);
      
      return videoRef.current;
    } catch (err) {
      console.error('AirPlay setup failed:', err);
      return null;
    }
  }, [renderToAirPlayCanvas]);

  const triggerAirPlay = useCallback(() => {
    const video = setupAirPlay();
    
    if (video) {
      if (video.webkitShowPlaybackTargetPicker) {
        video.webkitShowPlaybackTargetPicker();
      } else if ('remote' in video) {
        video.remote.prompt().catch(() => {
          alert('Use Screen Mirroring from Control Center for AirPlay.');
        });
      } else {
        alert('Use Screen Mirroring from Control Center for AirPlay.');
      }
    }
  }, [setupAirPlay]);

  // Cleanup function for stopping everything
  const cleanupAudio = useCallback(() => {
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop all media stream tracks
    if (mediaStreamRef.current) {
      const tracks = mediaStreamRef.current.getTracks();
      tracks.forEach(track => {
        track.stop();
        track.enabled = false;
      });
      mediaStreamRef.current = null;
    }
    
    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(console.error);
    }
    
    // Clear audio state
    setAudioContext(null);
    setAnalyser(null);
    setDataArray(null);
  }, [audioContext]);

  const startListening = async () => {
    try {
      // Clean up any existing audio first
      cleanupAudio();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      mediaStreamRef.current = stream;
      
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const source = actx.createMediaStreamSource(stream);
      const analyserNode = actx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.3;
      source.connect(analyserNode);
      
      setAudioContext(actx);
      setAnalyser(analyserNode);
      setDataArray(new Uint8Array(analyserNode.frequencyBinCount));
      setIsListening(true);
      
      // Setup AirPlay canvas
      setTimeout(setupAirPlay, 100);
    } catch (err) {
      console.error('Mic access error:', err);
      alert('Microphone access denied');
    }
  };

  const stopListening = useCallback(() => {
    // Stop everything
    cleanupAudio();
    
    // Reset state
    setIsListening(false);
    setIsAirPlayActive(false);
    
    // Redraw static canvas to restore original view
    setTimeout(() => {
      const canvas = staticCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0a0a12';
          ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          redrawStrokes(ctx);
          drawTexts(ctx, texts);
        }
      }
      setMode('draw');
    }, 50);
  }, [cleanupAudio, texts, redrawStrokes, drawTexts]);

  const handleSwipeTouchStart = (e) => {
    if (isListening && e.touches.length === 1) {
      setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleSwipeTouchMove = (e) => {
    if (!isListening || !touchStart) return;
    const deltaY = e.touches[0].clientY - touchStart.y;
    if (deltaY > 100) {
      stopListening();
      setTouchStart(null);
    }
  };

  const prevLowFreqRef = useRef(0);
  
  const analyzeAudio = useCallback(() => {
    if (!analyser || !dataArray) return {};
    
    analyser.getByteFrequencyData(dataArray);
    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);
    
    const waveform = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      const idx = Math.floor((i / 128) * timeData.length);
      waveform[i] = (timeData[idx] - 128) / 128;
    }
    waveformRef.current = waveform;
    
    const volume = Math.sqrt(dataArray.reduce((a, b) => a + b * b, 0) / dataArray.length) / 255;
    const third = Math.floor(dataArray.length / 3);
    const lowFreq = dataArray.slice(0, third).reduce((a, b) => a + b, 0) / (third * 255);
    const midFreq = dataArray.slice(third, third * 2).reduce((a, b) => a + b, 0) / (third * 255);
    const highFreq = dataArray.slice(third * 2).reduce((a, b) => a + b, 0) / (third * 255);
    
    const bassIncrease = lowFreq - prevLowFreqRef.current;
    const bassHit = bassIncrease > 0.05 ? Math.min(1, bassIncrease * 4) : 0;
    prevLowFreqRef.current = lowFreq * 0.8 + prevLowFreqRef.current * 0.2;
    
    let maxIndex = 0, maxValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > maxValue) { maxValue = dataArray[i]; maxIndex = i; }
    }
    const pitch = maxIndex / dataArray.length;
    
    let weightedSum = 0, sum = 0;
    for (let i = 0; i < dataArray.length; i++) { weightedSum += i * dataArray[i]; sum += dataArray[i]; }
    const spectralCentroid = sum > 0 ? (weightedSum / sum) / dataArray.length : 0;
    
    const spectralFlux = dataArray.reduce((acc, val, i) => 
      acc + Math.abs(val - (i > 0 ? dataArray[i - 1] : 0)), 0) / (dataArray.length * 255);
    
    let zeroCrossings = 0;
    for (let i = 1; i < timeData.length; i++) {
      if ((timeData[i] >= 128 && timeData[i - 1] < 128) || (timeData[i] < 128 && timeData[i - 1] >= 128)) {
        zeroCrossings++;
      }
    }
    
    const params = { volume, pitch, lowFreq, midFreq, highFreq, spectralCentroid, spectralFlux, zeroCrossing: zeroCrossings / timeData.length, bassHit };
    setAudioParams(params);
    return params;
  }, [analyser, dataArray]);

  const renderReactiveCanvas = useCallback(() => {
    if (!isListening) return;
    
    const params = analyzeAudio();
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return;
    
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const effects = {};
    Object.entries(mappings).forEach(([effect, config]) => {
      if (config.enabled) {
        effects[effect] = mapValue(params[config.param] || 0, config.min, config.max, config.amplify);
      }
    });
    
    ctx.save();
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    
    ctx.translate(displayCanvas.width / 2, displayCanvas.height / 2);
    if (effects.rotation) ctx.rotate((effects.rotation * Math.PI) / 180);
    if (effects.scale) ctx.scale(effects.scale, effects.scale);
    ctx.translate(
      -displayCanvas.width / 2 + (effects.xOffset || 0), 
      -displayCanvas.height / 2 + (effects.yOffset || 0)
    );

    let filterString = '';
    if (effects.brightness) filterString += `brightness(${effects.brightness}) `;
    if (effects.saturation) filterString += `saturate(${effects.saturation}) `;
    if (effects.contrast) filterString += `contrast(${effects.contrast}) `;
    if (effects.hueShift) filterString += `hue-rotate(${effects.hueShift}deg) `;
    ctx.filter = filterString || 'none';

    redrawStrokes(ctx, effects, waveformRef.current);
    ctx.filter = 'none';
    drawTexts(ctx, texts, effects);
    ctx.restore();
    
    // Update AirPlay canvas
    if (isAirPlayActive) {
      renderToAirPlayCanvas(effects);
    }
    
    animationFrameRef.current = requestAnimationFrame(renderReactiveCanvas);
  }, [isListening, analyzeAudio, mappings, texts, redrawStrokes, drawTexts, isAirPlayActive, renderToAirPlayCanvas]);

  useEffect(() => {
    if (isListening && analyser) {
      initCanvases();
      renderReactiveCanvas();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening, analyser, initCanvases, renderReactiveCanvas]);

  const updateMapping = (key, field, value) => {
    setMappings(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  return (
    <div className="h-screen bg-black relative overflow-hidden flex">
      {/* Main Layout - Landscape friendly */}
      {!isListening && (
        <>
          {/* Left side - Canvas */}
          <div className="flex-1 flex items-center justify-center p-2 relative min-w-0">
            <canvas 
              ref={staticCanvasRef} 
              className="border border-purple-900/30 touch-none shadow-2xl shadow-purple-900/20 max-h-full" 
              style={{ 
                aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
                backgroundColor: '#0a0a12',
                maxWidth: '100%',
              }}
              onMouseDown={isTextMode ? handleTextModeCanvasTap : (mode === 'draw' ? startDrawing : undefined)}
              onMouseMove={mode === 'draw' ? draw : undefined}
              onMouseUp={mode === 'draw' ? stopDrawing : undefined}
              onMouseLeave={mode === 'draw' ? stopDrawing : undefined}
              onTouchStart={handleTouchStartGesture}
              onTouchMove={handleTouchMoveGesture}
              onTouchEnd={handleTouchEndGesture}
            />
            
            {/* Hidden canvases */}
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={airplayCanvasRef} className="hidden" />
            
            {/* Instagram-style text mode overlay */}
            {isTextMode && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Done button */}
                <button 
                  onClick={exitTextMode}
                  className="absolute top-3 right-3 px-4 py-2 bg-purple-600 text-white rounded-full font-semibold text-sm pointer-events-auto z-20"
                >
                  Done
                </button>
                
                {/* Font picker - bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
                  <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
                    {FONT_OPTIONS.map(font => (
                      <button
                        key={font.id}
                        onClick={() => handleTextFontChange(font.id)}
                        className={`px-3 py-2 rounded-full text-sm whitespace-nowrap transition-all ${
                          selectedFont.id === font.id
                            ? 'bg-white text-black'
                            : 'bg-white/20 text-white'
                        }`}
                        style={{ fontFamily: font.family, fontWeight: font.weight }}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                  
                  {/* Color picker */}
                  <div className="flex gap-2 justify-center mt-2">
                    {colorPresets.slice(0, 8).map(c => (
                      <button 
                        key={c} 
                        onClick={() => handleTextColorChange(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-125' : 'border-transparent'}`} 
                        style={{ backgroundColor: c }} 
                      />
                    ))}
                  </div>
                </div>
                
                {/* Delete button for selected text */}
                {selectedTextId && !editingTextId && (
                  <button 
                    onClick={deleteSelectedText}
                    className="absolute top-3 left-3 w-10 h-10 bg-red-600/80 text-white rounded-full flex items-center justify-center pointer-events-auto"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            
            {/* Hidden text input for keyboard */}
            {editingTextId && (
              <input
                autoFocus
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishTextEditing();
                  if (e.key === 'Escape') {
                    setTexts(prev => prev.filter(t => t.id !== editingTextId));
                    setEditingTextId(null);
                    setTextInput('');
                  }
                }}
                className="absolute opacity-0 pointer-events-none"
                style={{ top: -1000 }}
              />
            )}
          </div>
          
          {/* Right side - Controls (sidebar in landscape) */}
          <div className="w-16 md:w-20 flex flex-col bg-gray-900/50 border-l border-purple-900/30">
            {/* Logo/Title */}
            <div className="p-2 border-b border-purple-900/30 flex flex-col items-center">
              <Activity size={20} className="text-purple-400" />
              <span className="text-[8px] text-purple-300 mt-1 hidden md:block">SONIC</span>
            </div>
            
            {/* Mode buttons */}
            <div className="flex-1 flex flex-col items-center py-2 gap-2">
              <button 
                onClick={() => { setMode('draw'); setIsTextMode(false); }}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${mode === 'draw' && !isTextMode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-purple-300'}`}
              >
                <Pencil size={18} />
                <span className="text-[9px]">Draw</span>
              </button>
              
              <button 
                onClick={enterTextMode}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${isTextMode ? 'bg-purple-600 text-white' : 'bg-gray-800 text-purple-300'}`}
              >
                <Type size={18} />
                <span className="text-[9px]">Text</span>
              </button>
              
              <button 
                onClick={() => { setMode('settings'); setIsTextMode(false); }}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${mode === 'settings' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-purple-300'}`}
              >
                <Settings size={18} />
                <span className="text-[9px]">FX</span>
              </button>
              
              <div className="flex-1" />
              
              <button 
                onClick={clearCanvas}
                className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 bg-gray-800 text-red-400 hover:bg-red-900/50 transition-all"
              >
                <Eraser size={18} />
                <span className="text-[9px]">Clear</span>
              </button>
            </div>
            
            {/* Sonic Mode button */}
            <div className="p-2 border-t border-purple-900/30">
              <button 
                onClick={startListening}
                className="w-full aspect-square rounded-xl bg-green-600 text-white flex flex-col items-center justify-center gap-1 hover:bg-green-500 transition-all"
              >
                <Mic size={20} />
                <span className="text-[8px] font-semibold">GO</span>
              </button>
            </div>
          </div>
          
          {/* Draw mode - color/size picker (bottom overlay) */}
          {mode === 'draw' && !isTextMode && (
            <div className="absolute bottom-0 left-0 right-16 md:right-20 p-2 bg-gradient-to-t from-black/90 to-transparent">
              <div className="flex items-center gap-3 justify-center">
                <div className="flex gap-1">
                  {colorPresets.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setColor(c)} 
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-white scale-110' : 'border-gray-700'}`} 
                      style={{ backgroundColor: c }} 
                    />
                  ))}
                </div>
                <input 
                  type="range" min="1" max="20" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(parseInt(e.target.value))} 
                  className="w-16 accent-purple-500" 
                />
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <div className="rounded-full bg-white" style={{ width: `${4 + brushSize/2}px`, height: `${4 + brushSize/2}px` }} />
                </div>
              </div>
            </div>
          )}
          
          {/* Settings panel */}
          {mode === 'settings' && !isTextMode && (
            <div className="absolute bottom-0 left-0 right-16 md:right-20 max-h-[60vh] overflow-y-auto bg-gray-900/95 border-t border-purple-900/30 p-3">
              <h3 className="text-sm font-bold mb-2 text-purple-300">Audio → Visual</h3>
              <div className="space-y-1">
                {Object.entries(mappings).map(([key, config]) => (
                  <div key={key} className="border border-purple-800/30 rounded-lg bg-gray-800/50 overflow-hidden">
                    <div 
                      className="flex items-center gap-2 p-2 cursor-pointer"
                      onClick={() => setExpandedEffect(expandedEffect === key ? null : key)}
                    >
                      <input 
                        type="checkbox" 
                        checked={config.enabled}
                        onChange={(e) => { e.stopPropagation(); updateMapping(key, 'enabled', e.target.checked); }} 
                        className="w-4 h-4 accent-purple-500" 
                      />
                      <span className="text-purple-300 text-xs flex-1">{config.label}</span>
                      {expandedEffect === key ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                    </div>
                    
                    {expandedEffect === key && config.enabled && (
                      <div className="p-2 pt-0 space-y-2 border-t border-purple-800/20">
                        <select 
                          value={config.param}
                          onChange={(e) => updateMapping(key, 'param', e.target.value)}
                          className="w-full p-1 text-xs border border-purple-600/30 rounded bg-gray-700 text-white"
                        >
                          {audioParamOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">Min</span>
                            <input type="number" step="0.1" value={config.min} onChange={(e) => updateMapping(key, 'min', parseFloat(e.target.value))} className="w-full p-1 bg-gray-700 rounded text-white" />
                          </div>
                          <div>
                            <span className="text-gray-400">Max</span>
                            <input type="number" step="0.1" value={config.max} onChange={(e) => updateMapping(key, 'max', parseFloat(e.target.value))} className="w-full p-1 bg-gray-700 rounded text-white" />
                          </div>
                          <div>
                            <span className="text-gray-400">Amp</span>
                            <input type="number" step="0.5" value={config.amplify} onChange={(e) => updateMapping(key, 'amplify', parseFloat(e.target.value))} className="w-full p-1 bg-gray-700 rounded text-white" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Sonic Mode - Fullscreen */}
      {isListening && (
        <div 
          className="fixed inset-0 bg-black z-50" 
          onTouchStart={handleSwipeTouchStart} 
          onTouchMove={handleSwipeTouchMove}
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold tracking-wider text-sm">SONIC MODE</span>
              <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={triggerAirPlay}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isAirPlayActive ? 'bg-blue-500' : 'bg-white/10 hover:bg-white/20'}`}
                title="AirPlay"
              >
                <AirPlayIcon size={18} className="text-white" />
              </button>
              <button 
                onClick={stopListening}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs z-10">
            Swipe down to exit
          </div>
          
          {/* Fullscreen canvas */}
          <div ref={containerRef} className="w-full h-full flex items-center justify-center">
            <canvas 
              ref={canvasRef} 
              className="max-w-full max-h-full"
              style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

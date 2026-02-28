'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Link2, Sparkles, CheckCircle2, AlertTriangle, 
  Info, Download, Trash2, Zap, Eye, FileJson, FileText,
  Palette, Type, Layout, Box, Ruler, Search, X, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

interface Correction {
  field: string;
  expected: string;
  found: string;
  severity: 'error' | 'warning' | 'info';
  category?: string;
  location?: string;
  suggestion?: string;
}

interface AIComparison {
  summary: string;
  match_percentage: number;
  differences: Array<{
    category: string;
    severity: string;
    location: string;
    expected: string;
    found: string;
    suggestion?: string;
  }>;
}

const MotionCard = motion.create(Card);

export default function Home() {
  const [cardText, setCardText] = useState('');
  const [figmaText, setFigmaText] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [figmaImagePreview, setFigmaImagePreview] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [aiComparison, setAIComparison] = useState<AIComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isLoadingFigma, setIsLoadingFigma] = useState(false);
  const [comparisonDone, setComparisonDone] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');
  const [figmaData, setFigmaData] = useState<any>(null);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [dragOver, setDragOver] = useState<'piece' | 'figma' | null>(null);
  
  const pieceInputRef = useRef<HTMLInputElement>(null);
  const figmaInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent, type: 'piece' | 'figma') => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'piece') {
          setImagePreview(reader.result as string);
        } else {
          setFigmaImagePreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'piece' | 'figma') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'piece') {
          setImagePreview(reader.result as string);
        } else {
          setFigmaImagePreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchFromFigma = async () => {
    if (!figmaUrl) return;
    setIsLoadingFigma(true);
    try {
      const response = await fetch('/api/figma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl, accessToken: figmaToken || undefined }),
      });
      const data = await response.json();
      if (response.ok) {
        setFigmaData(data);
        if (data.node?.textContent?.length > 0) {
          setFigmaText(data.node.textContent.map((t: string, i: number) => `Texto ${i + 1}: ${t}`).join('\n'));
        }
        if (data.node?.imageUrl) {
          setFigmaImagePreview(data.node.imageUrl);
        }
      }
    } catch (error) {
      console.error('Figma error:', error);
    } finally {
      setIsLoadingFigma(false);
    }
  };

  const extractFieldsFromText = (text: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    text.split('\n').filter(l => l.trim()).forEach(line => {
      const match = line.match(/^([^:=\-]+)[:\-=]\s*(.+)$/);
      if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
    });
    return fields;
  };

  const compareFields = (cardFields: Record<string, string>, figmaFields: Record<string, string>): Correction[] => {
    const corrections: Correction[] = [];
    Object.keys(cardFields).forEach(key => {
      const cardValue = cardFields[key];
      const figmaValue = figmaFields[key];
      if (!figmaValue) {
        corrections.push({ field: key, expected: cardValue, found: '(no encontrado)', severity: 'warning' });
      } else if (cardValue.toLowerCase() !== figmaValue.toLowerCase()) {
        corrections.push({ field: key, expected: figmaValue, found: cardValue, severity: 'error' });
      }
    });
    Object.keys(figmaFields).forEach(key => {
      if (!cardFields[key]) {
        corrections.push({ field: key, expected: figmaFields[key], found: '(falta)', severity: 'error' });
      }
    });
    return corrections;
  };

  const compareWithAI = async () => {
    if (!imagePreview || !figmaImagePreview) return null;
    try {
      const response = await fetch('/api/compare-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image1: imagePreview, image2: figmaImagePreview, apiKey: openaiKey || undefined }),
      });
      const data = await response.json();
      return response.ok ? data.comparison as AIComparison : null;
    } catch { return null; }
  };

  const handleCompare = async () => {
    setIsComparing(true);
    setCorrections([]);
    setAIComparison(null);

    const cardFields = extractFieldsFromText(cardText);
    const figmaFields = extractFieldsFromText(figmaText);
    const textCorrections = compareFields(cardFields, figmaFields);
    
    let aiResult: AIComparison | null = null;
    if (imagePreview && figmaImagePreview) {
      aiResult = await compareWithAI();
      if (aiResult) {
        setAIComparison(aiResult);
        const aiCorrections: Correction[] = aiResult.differences.map(diff => ({
          field: diff.location || diff.category,
          expected: diff.expected,
          found: diff.found,
          severity: diff.severity as 'error' | 'warning' | 'info',
          category: diff.category,
          suggestion: diff.suggestion,
        }));
        setCorrections([...textCorrections, ...aiCorrections]);
      } else {
        setCorrections(textCorrections);
      }
    } else {
      setCorrections(textCorrections);
    }

    setComparisonDone(true);
    setIsComparing(false);
  };

  const getCategoryIcon = (category?: string) => {
    const icons: Record<string, React.ReactNode> = {
      'TEXTO': <Type className="w-4 h-4" />,
      'COLORES': <Palette className="w-4 h-4" />,
      'TIPOGRAFÍA': <Type className="w-4 h-4" />,
      'LAYOUT': <Layout className="w-4 h-4" />,
      'ELEMENTOS': <Box className="w-4 h-4" />,
      'PROPORCIONES': <Ruler className="w-4 h-4" />,
    };
    return icons[category?.toUpperCase() || ''] || <Search className="w-4 h-4" />;
  };

  const exportReport = (format: 'txt' | 'json') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify({ date: new Date().toISOString(), matchPercentage: aiComparison?.match_percentage, corrections }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qa-report-${Date.now()}.json`;
      a.click();
    } else {
      const text = corrections.map(c => `[${c.severity.toUpperCase()}] ${c.field}\nEsperado: ${c.expected}\nEncontrado: ${c.found}\n`).join('\n');
      const blob = new Blob([`QA VISUAL CHECKER REPORT\n${'='.repeat(40)}\n\n${text || 'Sin correcciones'}`], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qa-report-${Date.now()}.txt`;
      a.click();
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/15 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-fuchsia-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <motion.div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6"
            whileHover={{ scale: 1.02 }}
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm text-white/70">Powered by AI Vision</span>
          </motion.div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-white via-white to-white/50 bg-clip-text text-transparent">QA Visual</span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">Checker</span>
          </h1>
          
          <p className="text-lg text-white/50 max-w-xl mx-auto">
            Compara piezas gráficas con diseños de Figma usando inteligencia artificial
          </p>

          <motion.button
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="mt-6 text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-2 mx-auto"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Zap className="w-4 h-4" />
            {showApiConfig ? 'Ocultar configuración' : 'Configurar APIs'}
          </motion.button>

          <AnimatePresence>
            {showApiConfig && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 max-w-2xl mx-auto overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 rounded-2xl bg-white/5 border border-white/10">
                  <div>
                    <label className="block text-sm text-white/50 mb-2">Figma Token</label>
                    <Input
                      type="password"
                      placeholder="figd_xxxx..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      value={figmaToken}
                      onChange={(e) => setFigmaToken(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/50 mb-2">OpenAI API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-xxxx..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Piece Input */}
          <MotionCard
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="group bg-white/[0.03] border-white/10 backdrop-blur-xl overflow-hidden hover:bg-white/[0.05] hover:border-orange-500/30 transition-all duration-500"
            whileHover={{ y: -4 }}
          >
            <CardHeader className="border-b border-white/5 relative overflow-hidden">
              {/* Animated glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/10 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardTitle className="text-2xl font-bold flex items-center gap-3 relative">
                <motion.div 
                  className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/25"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Eye className="w-6 h-6 text-white" />
                </motion.div>
                <span className="bg-gradient-to-r from-orange-300 via-orange-200 to-white bg-clip-text text-transparent drop-shadow-lg">
                  Pieza Gráfica
                </span>
              </CardTitle>
              <CardDescription className="text-white/60 text-base mt-2">
                Sube la imagen o pega el texto de la pieza actual
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Drop Zone */}
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver('piece'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, 'piece')}
                onClick={() => pieceInputRef.current?.click()}
                className={`relative h-56 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden ${
                  dragOver === 'piece' 
                    ? 'border-orange-500 bg-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.3)]' 
                    : imagePreview 
                      ? 'border-transparent' 
                      : 'border-white/20 hover:border-orange-400/50 hover:bg-white/[0.03] bg-white/[0.02]'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={dragOver === 'piece' ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {/* Animated border gradient */}
                {!imagePreview && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500/0 via-orange-500/20 to-orange-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none" />
                )}
                <input
                  ref={pieceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, 'piece')}
                />
                {imagePreview ? (
                  <>
                    <motion.img 
                      src={imagePreview} 
                      alt="Pieza" 
                      className="w-full h-full object-contain rounded-xl"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', damping: 20 }}
                    />
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); setImagePreview(null); }}
                      className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-red-500 transition-colors shadow-lg"
                      whileHover={{ scale: 1.15, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                    <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-green-500/90 text-xs font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" />
                      Imagen cargada
                    </div>
                  </>
                ) : (
                  <motion.div 
                    className="flex flex-col items-center gap-4"
                    animate={dragOver === 'piece' ? { y: [0, -5, 0] } : {}}
                    transition={{ repeat: dragOver === 'piece' ? Infinity : 0, duration: 0.5 }}
                  >
                    <motion.div
                      className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20"
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Upload className="w-8 h-8 text-orange-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-white/70 font-medium">Arrastra tu imagen aquí</p>
                      <p className="text-white/40 text-sm mt-1">o haz clic para seleccionar</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              <motion.div
                whileFocus={{ scale: 1.01 }}
                className="relative"
              >
                <Textarea
                  placeholder="O pega el texto de la pieza aquí:&#10;Título: Oferta Especial&#10;Precio: $99.99"
                  className="min-h-[120px] bg-white/[0.02] border-white/10 text-white placeholder:text-white/30 resize-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all"
                  value={cardText}
                  onChange={(e) => setCardText(e.target.value)}
                />
                {cardText && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md bg-orange-500/20 text-orange-300 text-xs"
                  >
                    {cardText.split('\n').filter(l => l.trim()).length} líneas
                  </motion.div>
                )}
              </motion.div>
            </CardContent>
          </MotionCard>

          {/* Figma Input */}
          <MotionCard
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="group bg-white/[0.03] border-white/10 backdrop-blur-xl overflow-hidden hover:bg-white/[0.05] hover:border-violet-500/30 transition-all duration-500"
            whileHover={{ y: -4 }}
          >
            <CardHeader className="border-b border-white/5 relative overflow-hidden">
              {/* Animated glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/10 to-violet-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardTitle className="text-2xl font-bold flex items-center gap-3 relative">
                <motion.div 
                  className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25"
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Palette className="w-6 h-6 text-white" />
                </motion.div>
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-white bg-clip-text text-transparent drop-shadow-lg">
                  Diseño Figma
                </span>
              </CardTitle>
              <CardDescription className="text-white/60 text-base mt-2">
                Conecta con Figma o sube la referencia
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full grid grid-cols-2 bg-white/5 p-1 rounded-xl">
                  <TabsTrigger value="manual" className="rounded-lg data-[state=active]:bg-white/10">Manual</TabsTrigger>
                  <TabsTrigger value="figma" className="rounded-lg data-[state=active]:bg-white/10">Figma API</TabsTrigger>
                </TabsList>
                
                <TabsContent value="figma" className="mt-4 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://figma.com/design/..."
                      className="bg-white/[0.02] border-white/10 text-white placeholder:text-white/20 flex-1"
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                    />
                    <Button 
                      onClick={fetchFromFigma}
                      disabled={isLoadingFigma || !figmaUrl}
                      className="bg-violet-600 hover:bg-violet-500 px-6"
                    >
                      {isLoadingFigma ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    </Button>
                  </div>
                  {figmaData && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3"
                    >
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <div>
                        <p className="text-green-400 font-medium">{figmaData.file?.name}</p>
                        <p className="text-white/50 text-sm">{figmaData.node?.textContent?.length || 0} textos encontrados</p>
                      </div>
                    </motion.div>
                  )}
                </TabsContent>
                
                <TabsContent value="manual" className="mt-4">
                  <p className="text-white/30 text-sm mb-2">Sube o pega la referencia</p>
                </TabsContent>
              </Tabs>

              {/* Drop Zone */}
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver('figma'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, 'figma')}
                onClick={() => figmaInputRef.current?.click()}
                className={`relative h-56 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden ${
                  dragOver === 'figma' 
                    ? 'border-violet-500 bg-violet-500/20 shadow-[0_0_30px_rgba(139,92,246,0.3)]' 
                    : figmaImagePreview 
                      ? 'border-transparent' 
                      : 'border-white/20 hover:border-violet-400/50 hover:bg-white/[0.03] bg-white/[0.02]'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={dragOver === 'figma' ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {/* Animated border gradient */}
                {!figmaImagePreview && (
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500/0 via-violet-500/20 to-violet-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none" />
                )}
                <input
                  ref={figmaInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, 'figma')}
                />
                {figmaImagePreview ? (
                  <>
                    <motion.img 
                      src={figmaImagePreview} 
                      alt="Figma" 
                      className="w-full h-full object-contain rounded-xl"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', damping: 20 }}
                    />
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); setFigmaImagePreview(null); }}
                      className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-red-500 transition-colors shadow-lg"
                      whileHover={{ scale: 1.15, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                    <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-violet-500/90 text-xs font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" />
                      Referencia cargada
                    </div>
                  </>
                ) : (
                  <motion.div 
                    className="flex flex-col items-center gap-4"
                    animate={dragOver === 'figma' ? { y: [0, -5, 0] } : {}}
                    transition={{ repeat: dragOver === 'figma' ? Infinity : 0, duration: 0.5 }}
                  >
                    <motion.div
                      className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20"
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Upload className="w-8 h-8 text-violet-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-white/70 font-medium">Arrastra tu imagen aquí</p>
                      <p className="text-white/40 text-sm mt-1">o haz clic para seleccionar</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              <motion.div
                whileFocus={{ scale: 1.01 }}
                className="relative"
              >
                <Textarea
                  placeholder="Texto del diseño Figma:&#10;Título: Oferta Especial&#10;Precio: $89.99"
                  className="min-h-[120px] bg-white/[0.02] border-white/10 text-white placeholder:text-white/30 resize-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  value={figmaText}
                  onChange={(e) => setFigmaText(e.target.value)}
                />
                {figmaText && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md bg-violet-500/20 text-violet-300 text-xs"
                  >
                    {figmaText.split('\n').filter(l => l.trim()).length} líneas
                  </motion.div>
                )}
              </motion.div>
            </CardContent>
          </MotionCard>
        </div>

        {/* Compare Button */}
        <motion.div 
          className="flex flex-col items-center gap-4 mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {/* Status indicator */}
          <motion.div 
            className="flex items-center gap-6 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className={`flex items-center gap-2 ${imagePreview ? 'text-green-400' : 'text-white/30'}`}>
              <div className={`w-2 h-2 rounded-full ${imagePreview ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
              Pieza
            </div>
            <div className={`flex items-center gap-2 ${figmaImagePreview ? 'text-green-400' : 'text-white/30'}`}>
              <div className={`w-2 h-2 rounded-full ${figmaImagePreview ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
              Figma
            </div>
            <div className={`flex items-center gap-2 ${(imagePreview && figmaImagePreview) ? 'text-violet-400' : 'text-white/30'}`}>
              <div className={`w-2 h-2 rounded-full ${(imagePreview && figmaImagePreview) ? 'bg-violet-400 animate-pulse' : 'bg-white/20'}`} />
              IA Ready
            </div>
          </motion.div>

          <motion.button
            onClick={handleCompare}
            disabled={isComparing || (!cardText && !figmaText && !imagePreview)}
            className="group relative px-14 py-6 rounded-2xl font-semibold text-xl overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={(imagePreview && figmaImagePreview && !isComparing) ? { 
              boxShadow: ['0 0 20px rgba(139,92,246,0.3)', '0 0 40px rgba(139,92,246,0.5)', '0 0 20px rgba(139,92,246,0.3)']
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* Animated Background */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600"
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              style={{ backgroundSize: '200% 200%' }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 blur-2xl opacity-50 group-hover:opacity-80 transition-opacity" />
            
            {/* Sparkle effects */}
            {!isComparing && (
              <>
                <motion.div 
                  className="absolute top-2 left-4 w-1 h-1 bg-white rounded-full"
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                />
                <motion.div 
                  className="absolute bottom-3 right-6 w-1.5 h-1.5 bg-white rounded-full"
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
                <motion.div 
                  className="absolute top-4 right-10 w-1 h-1 bg-white rounded-full"
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                />
              </>
            )}
            
            {/* Button Content */}
            <span className="relative flex items-center gap-3">
              {isComparing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Analizando con IA...</span>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-6 h-6" />
                  </motion.div>
                  <span>Comparar y Generar Reporte</span>
                </>
              )}
            </span>
          </motion.button>

          {(imagePreview && figmaImagePreview) && (
            <motion.p 
              className="text-white/40 text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              La comparación con IA analizará diferencias visuales automáticamente
            </motion.p>
          )}
        </motion.div>

        {/* Results */}
        <AnimatePresence>
          {comparisonDone && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25 }}
            >
              <MotionCard className="bg-white/[0.03] border-white/10 backdrop-blur-xl overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20">
                        <Search className="w-5 h-5 text-cyan-400" />
                      </div>
                      Reporte de QA
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      {aiComparison && (
                        <Badge className="bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border-violet-500/30 text-violet-300 px-4 py-2">
                          {aiComparison.match_percentage}% match
                        </Badge>
                      )}
                      <Badge variant={corrections.filter(c => c.severity === 'error').length > 0 ? 'destructive' : 'default'} className="px-4 py-2">
                        {corrections.filter(c => c.severity === 'error').length} errores
                      </Badge>
                      <Badge variant="secondary" className="px-4 py-2">
                        {corrections.filter(c => c.severity === 'warning').length} warnings
                      </Badge>
                    </div>
                  </div>
                  {aiComparison?.summary && (
                    <CardDescription className="text-white/50 mt-3 text-base">
                      {aiComparison.summary}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent className="p-6">
                  {corrections.length === 0 ? (
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="py-12 text-center"
                    >
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="inline-block"
                      >
                        <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-4" />
                      </motion.div>
                      <h3 className="text-2xl font-bold text-green-400 mb-2">Todo correcto</h3>
                      <p className="text-white/50">No se encontraron diferencias entre la pieza y el diseño</p>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
                      {corrections.map((correction, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`p-5 rounded-2xl border backdrop-blur-sm ${
                            correction.severity === 'error'
                              ? 'bg-red-500/10 border-red-500/20'
                              : correction.severity === 'warning'
                              ? 'bg-yellow-500/10 border-yellow-500/20'
                              : 'bg-blue-500/10 border-blue-500/20'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-xl ${
                              correction.severity === 'error'
                                ? 'bg-red-500/20'
                                : correction.severity === 'warning'
                                ? 'bg-yellow-500/20'
                                : 'bg-blue-500/20'
                            }`}>
                              {correction.severity === 'error' ? (
                                <X className="w-5 h-5 text-red-400" />
                              ) : correction.severity === 'warning' ? (
                                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                              ) : (
                                <Info className="w-5 h-5 text-blue-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getCategoryIcon(correction.category)}
                                <span className={`font-semibold ${
                                  correction.severity === 'error' ? 'text-red-400' :
                                  correction.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                                }`}>
                                  {correction.field}
                                </span>
                                {correction.category && (
                                  <Badge variant="outline" className="text-xs">{correction.category}</Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-white/40">Esperado:</span>
                                  <p className="text-green-400 mt-1">{correction.expected}</p>
                                </div>
                                <div>
                                  <span className="text-white/40">Encontrado:</span>
                                  <p className="text-red-400 mt-1">{correction.found}</p>
                                </div>
                              </div>
                              {correction.suggestion && (
                                <div className="mt-3 p-3 rounded-xl bg-white/5">
                                  <span className="text-white/40 text-sm">Sugerencia: </span>
                                  <span className="text-cyan-400 text-sm">{correction.suggestion}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Visual Comparison */}
                  {(imagePreview && figmaImagePreview) && (
                    <div className="mt-8 pt-8 border-t border-white/10">
                      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <Eye className="w-5 h-5 text-white/50" />
                        Comparación Visual
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <p className="text-sm text-white/40">Pieza Actual</p>
                          <div className="rounded-2xl overflow-hidden border border-white/10">
                            <img src={imagePreview} alt="Pieza" className="w-full" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-white/40">Diseño Figma</p>
                          <div className="rounded-2xl overflow-hidden border border-white/10">
                            <img src={figmaImagePreview} alt="Figma" className="w-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Export Buttons */}
                  <div className="mt-8 pt-8 border-t border-white/10 flex justify-end gap-4">
                    <Button
                      variant="outline"
                      onClick={() => exportReport('txt')}
                      className="border-white/10 hover:bg-white/5"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Exportar TXT
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => exportReport('json')}
                      className="border-white/10 hover:bg-white/5"
                    >
                      <FileJson className="w-4 h-4 mr-2" />
                      Exportar JSON
                    </Button>
                  </div>
                </CardContent>
              </MotionCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

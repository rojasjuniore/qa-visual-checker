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
            className="bg-white/[0.03] border-white/10 backdrop-blur-xl overflow-hidden"
          >
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-xl flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20">
                  <Eye className="w-5 h-5 text-orange-400" />
                </div>
                Pieza Gráfica
              </CardTitle>
              <CardDescription className="text-white/40">
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
                className={`relative h-48 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  dragOver === 'piece' 
                    ? 'border-orange-500 bg-orange-500/10' 
                    : imagePreview 
                      ? 'border-transparent' 
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                }`}
                whileHover={{ scale: imagePreview ? 1 : 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <input
                  ref={pieceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, 'piece')}
                />
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="Pieza" className="w-full h-full object-contain rounded-xl" />
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); setImagePreview(null); }}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-red-500/80 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-white/20" />
                    <span className="text-white/40">Arrastra o haz clic para subir</span>
                  </>
                )}
              </motion.div>

              <Textarea
                placeholder="O pega el texto de la pieza aquí:&#10;Título: Oferta Especial&#10;Precio: $99.99"
                className="min-h-[120px] bg-white/[0.02] border-white/10 text-white placeholder:text-white/20 resize-none"
                value={cardText}
                onChange={(e) => setCardText(e.target.value)}
              />
            </CardContent>
          </MotionCard>

          {/* Figma Input */}
          <MotionCard
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.03] border-white/10 backdrop-blur-xl overflow-hidden"
          >
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-xl flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
                  <Palette className="w-5 h-5 text-violet-400" />
                </div>
                Diseño Figma
              </CardTitle>
              <CardDescription className="text-white/40">
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
                className={`relative h-48 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  dragOver === 'figma' 
                    ? 'border-violet-500 bg-violet-500/10' 
                    : figmaImagePreview 
                      ? 'border-transparent' 
                      : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
                }`}
                whileHover={{ scale: figmaImagePreview ? 1 : 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <input
                  ref={figmaInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, 'figma')}
                />
                {figmaImagePreview ? (
                  <>
                    <img src={figmaImagePreview} alt="Figma" className="w-full h-full object-contain rounded-xl" />
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); setFigmaImagePreview(null); }}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-red-500/80 transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-white/20" />
                    <span className="text-white/40">Arrastra o haz clic para subir</span>
                  </>
                )}
              </motion.div>

              <Textarea
                placeholder="Texto del diseño Figma:&#10;Título: Oferta Especial&#10;Precio: $89.99"
                className="min-h-[120px] bg-white/[0.02] border-white/10 text-white placeholder:text-white/20 resize-none"
                value={figmaText}
                onChange={(e) => setFigmaText(e.target.value)}
              />
            </CardContent>
          </MotionCard>
        </div>

        {/* Compare Button */}
        <motion.div 
          className="flex justify-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button
            onClick={handleCompare}
            disabled={isComparing || (!cardText && !figmaText && !imagePreview)}
            className="group relative px-12 py-5 rounded-2xl font-semibold text-lg overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Button Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
            
            {/* Button Content */}
            <span className="relative flex items-center gap-3">
              {isComparing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analizando con IA...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Comparar y Generar Reporte
                </>
              )}
            </span>
          </motion.button>
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

'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Link2, Sparkles, CheckCircle2, AlertTriangle, 
  Info, Trash2, Zap, Eye, FileJson, FileText,
  Palette, Type, Layout, Box, Ruler, Search, X, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

// Brand Colors
const COLORS = {
  black: '#000000',
  blue: '#0042A9',
  orange: '#F45325',
  white: '#FFFFFF',
};

interface Correction {
  field: string;
  expected: string;
  found: string;
  severity: 'error' | 'warning' | 'info';
  category?: string;
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

  const [aiError, setAiError] = useState<string | null>(null);
  const [needsManualReview, setNeedsManualReview] = useState(false);

  const compareWithAI = async () => {
    if (!imagePreview || !figmaImagePreview) return null;
    setAiError(null);
    setNeedsManualReview(false);
    
    try {
      const response = await fetch('/api/compare-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image1: imagePreview, image2: figmaImagePreview, apiKey: openaiKey || undefined }),
      });
      const data = await response.json();
      
      if (data.noApiKey) {
        setNeedsManualReview(true);
        return data.comparison as AIComparison;
      }
      
      if (!response.ok) {
        setAiError(data.error || 'Error al analizar con IA');
        return null;
      }
      
      return data.comparison as AIComparison;
    } catch (error) {
      setAiError('Error de conexión con el servicio de IA');
      return null;
    }
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
    <main className="min-h-[100dvh] text-white overflow-x-hidden" style={{ backgroundColor: COLORS.black }}>
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[128px] animate-pulse" style={{ backgroundColor: `${COLORS.blue}20` }} />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full blur-[128px] animate-pulse" style={{ backgroundColor: `${COLORS.orange}15`, animationDelay: '1s' }} />
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-6"
            style={{ backgroundColor: `${COLORS.blue}15`, borderColor: `${COLORS.blue}40` }}
            whileHover={{ scale: 1.02 }}
          >
            <Sparkles className="w-4 h-4" style={{ color: COLORS.orange }} />
            <span className="text-sm" style={{ color: `${COLORS.white}99` }}>Powered by AI Vision</span>
          </motion.div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4">
            <span style={{ color: COLORS.white }}>QA Visual</span>
            <br />
            <span style={{ 
              background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>Checker</span>
          </h1>
          
          <p className="text-lg max-w-xl mx-auto" style={{ color: `${COLORS.white}70` }}>
            Compara piezas gráficas con diseños de Figma usando inteligencia artificial
          </p>

          <motion.button
            onClick={() => setShowApiConfig(!showApiConfig)}
            className="mt-6 text-sm flex items-center gap-2 mx-auto transition-colors"
            style={{ color: `${COLORS.white}50` }}
            whileHover={{ scale: 1.02, color: COLORS.white }}
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
                <div 
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 rounded-2xl border"
                  style={{ backgroundColor: `${COLORS.white}05`, borderColor: `${COLORS.white}10` }}
                >
                  <div>
                    <label className="block text-sm mb-2" style={{ color: `${COLORS.white}60` }}>Figma Token</label>
                    <Input
                      type="password"
                      placeholder="figd_xxxx..."
                      className="border text-white placeholder:opacity-30"
                      style={{ backgroundColor: `${COLORS.white}05`, borderColor: `${COLORS.white}15` }}
                      value={figmaToken}
                      onChange={(e) => setFigmaToken(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2" style={{ color: `${COLORS.white}60` }}>OpenAI API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-xxxx..."
                      className="border text-white placeholder:opacity-30"
                      style={{ backgroundColor: `${COLORS.white}05`, borderColor: `${COLORS.white}15` }}
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
            className="group border backdrop-blur-xl overflow-hidden transition-all duration-500"
            style={{ 
              backgroundColor: `${COLORS.white}03`,
              borderColor: `${COLORS.white}10`
            }}
            whileHover={{ y: -4, borderColor: `${COLORS.orange}50` }}
          >
            <CardHeader className="border-b relative overflow-hidden" style={{ borderColor: `${COLORS.white}05` }}>
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${COLORS.orange}10, transparent)` }}
              />
              <CardTitle className="text-2xl font-bold flex items-center gap-3 relative">
                <motion.div 
                  className="p-3 rounded-xl shadow-lg"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.orange}CC)`,
                    boxShadow: `0 8px 24px ${COLORS.orange}40`
                  }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Eye className="w-6 h-6" style={{ color: COLORS.white }} />
                </motion.div>
                <span style={{ color: COLORS.white }}>Pieza Gráfica</span>
              </CardTitle>
              <CardDescription style={{ color: `${COLORS.white}60` }} className="text-base mt-2">
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
                className="relative h-56 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden"
                style={{
                  borderColor: dragOver === 'piece' ? COLORS.orange : imagePreview ? 'transparent' : `${COLORS.white}20`,
                  backgroundColor: dragOver === 'piece' ? `${COLORS.orange}20` : `${COLORS.white}02`,
                  boxShadow: dragOver === 'piece' ? `0 0 30px ${COLORS.orange}30` : 'none'
                }}
                whileHover={{ scale: 1.02, borderColor: `${COLORS.orange}50` }}
                whileTap={{ scale: 0.98 }}
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
                      className="absolute top-3 right-3 p-2.5 rounded-full transition-colors shadow-lg"
                      style={{ backgroundColor: `${COLORS.black}90` }}
                      whileHover={{ scale: 1.15, rotate: 90, backgroundColor: COLORS.orange }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" style={{ color: COLORS.white }} />
                    </motion.button>
                    <div 
                      className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
                      style={{ backgroundColor: COLORS.orange, color: COLORS.white }}
                    >
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
                      className="p-4 rounded-2xl border"
                      style={{ 
                        backgroundColor: `${COLORS.orange}15`,
                        borderColor: `${COLORS.orange}30`
                      }}
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Upload className="w-8 h-8" style={{ color: COLORS.orange }} />
                    </motion.div>
                    <div className="text-center">
                      <p className="font-medium" style={{ color: `${COLORS.white}80` }}>Arrastra tu imagen aquí</p>
                      <p className="text-sm mt-1" style={{ color: `${COLORS.white}40` }}>o haz clic para seleccionar</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              <motion.div className="relative">
                <Textarea
                  placeholder="O pega el texto de la pieza aquí:&#10;Título: Oferta Especial&#10;Precio: $99.99"
                  className="min-h-[120px] border text-white resize-none transition-all"
                  style={{ 
                    backgroundColor: `${COLORS.white}02`,
                    borderColor: `${COLORS.white}15`
                  }}
                  value={cardText}
                  onChange={(e) => setCardText(e.target.value)}
                />
                {cardText && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs"
                    style={{ backgroundColor: `${COLORS.orange}30`, color: COLORS.orange }}
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
            className="group border backdrop-blur-xl overflow-hidden transition-all duration-500"
            style={{ 
              backgroundColor: `${COLORS.white}03`,
              borderColor: `${COLORS.white}10`
            }}
            whileHover={{ y: -4, borderColor: `${COLORS.blue}50` }}
          >
            <CardHeader className="border-b relative overflow-hidden" style={{ borderColor: `${COLORS.white}05` }}>
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(90deg, transparent, ${COLORS.blue}10, transparent)` }}
              />
              <CardTitle className="text-2xl font-bold flex items-center gap-3 relative">
                <motion.div 
                  className="p-3 rounded-xl shadow-lg"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.blue}CC)`,
                    boxShadow: `0 8px 24px ${COLORS.blue}40`
                  }}
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Palette className="w-6 h-6" style={{ color: COLORS.white }} />
                </motion.div>
                <span style={{ color: COLORS.white }}>Diseño Figma</span>
              </CardTitle>
              <CardDescription style={{ color: `${COLORS.white}60` }} className="text-base mt-2">
                Conecta con Figma o sube la referencia
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList 
                  className="w-full grid grid-cols-2 p-1.5 rounded-xl"
                  style={{ backgroundColor: `${COLORS.white}10` }}
                >
                  <TabsTrigger 
                    value="manual" 
                    className="rounded-lg font-semibold py-2.5 transition-all"
                    style={{ 
                      color: activeTab === 'manual' ? COLORS.white : `${COLORS.white}70`,
                      backgroundColor: activeTab === 'manual' ? COLORS.blue : 'transparent'
                    }}
                  >
                    Manual
                  </TabsTrigger>
                  <TabsTrigger 
                    value="figma" 
                    className="rounded-lg font-semibold py-2.5 transition-all"
                    style={{ 
                      color: activeTab === 'figma' ? COLORS.white : `${COLORS.white}70`,
                      backgroundColor: activeTab === 'figma' ? COLORS.blue : 'transparent'
                    }}
                  >
                    Figma API
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="figma" className="mt-4 space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://figma.com/design/..."
                      className="border text-white flex-1"
                      style={{ backgroundColor: `${COLORS.white}02`, borderColor: `${COLORS.white}15` }}
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                    />
                    <Button 
                      onClick={fetchFromFigma}
                      disabled={isLoadingFigma || !figmaUrl}
                      className="px-6"
                      style={{ backgroundColor: COLORS.blue }}
                    >
                      {isLoadingFigma ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    </Button>
                  </div>
                  {figmaData && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl flex items-center gap-3"
                      style={{ backgroundColor: `${COLORS.blue}15`, border: `1px solid ${COLORS.blue}30` }}
                    >
                      <CheckCircle2 className="w-5 h-5" style={{ color: COLORS.blue }} />
                      <div>
                        <p className="font-medium" style={{ color: COLORS.blue }}>{figmaData.file?.name}</p>
                        <p className="text-sm" style={{ color: `${COLORS.white}50` }}>{figmaData.node?.textContent?.length || 0} textos encontrados</p>
                      </div>
                    </motion.div>
                  )}
                </TabsContent>
                
                <TabsContent value="manual" className="mt-4">
                  <p className="text-sm mb-2" style={{ color: `${COLORS.white}40` }}>Sube o pega la referencia</p>
                </TabsContent>
              </Tabs>

              {/* Drop Zone */}
              <motion.div
                onDragOver={(e) => { e.preventDefault(); setDragOver('figma'); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, 'figma')}
                onClick={() => figmaInputRef.current?.click()}
                className="relative h-56 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden"
                style={{
                  borderColor: dragOver === 'figma' ? COLORS.blue : figmaImagePreview ? 'transparent' : `${COLORS.white}20`,
                  backgroundColor: dragOver === 'figma' ? `${COLORS.blue}20` : `${COLORS.white}02`,
                  boxShadow: dragOver === 'figma' ? `0 0 30px ${COLORS.blue}30` : 'none'
                }}
                whileHover={{ scale: 1.02, borderColor: `${COLORS.blue}50` }}
                whileTap={{ scale: 0.98 }}
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
                      className="absolute top-3 right-3 p-2.5 rounded-full transition-colors shadow-lg"
                      style={{ backgroundColor: `${COLORS.black}90` }}
                      whileHover={{ scale: 1.15, rotate: 90, backgroundColor: COLORS.orange }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Trash2 className="w-4 h-4" style={{ color: COLORS.white }} />
                    </motion.button>
                    <div 
                      className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
                      style={{ backgroundColor: COLORS.blue, color: COLORS.white }}
                    >
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
                      className="p-4 rounded-2xl border"
                      style={{ 
                        backgroundColor: `${COLORS.blue}15`,
                        borderColor: `${COLORS.blue}30`
                      }}
                      whileHover={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 0.5 }}
                    >
                      <Upload className="w-8 h-8" style={{ color: COLORS.blue }} />
                    </motion.div>
                    <div className="text-center">
                      <p className="font-medium" style={{ color: `${COLORS.white}80` }}>Arrastra tu imagen aquí</p>
                      <p className="text-sm mt-1" style={{ color: `${COLORS.white}40` }}>o haz clic para seleccionar</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              <motion.div className="relative">
                <Textarea
                  placeholder="Texto del diseño Figma:&#10;Título: Oferta Especial&#10;Precio: $89.99"
                  className="min-h-[120px] border text-white resize-none transition-all"
                  style={{ 
                    backgroundColor: `${COLORS.white}02`,
                    borderColor: `${COLORS.white}15`
                  }}
                  value={figmaText}
                  onChange={(e) => setFigmaText(e.target.value)}
                />
                {figmaText && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs"
                    style={{ backgroundColor: `${COLORS.blue}30`, color: COLORS.blue }}
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
            <div className="flex items-center gap-2" style={{ color: imagePreview ? COLORS.orange : `${COLORS.white}40` }}>
              <div 
                className="w-2 h-2 rounded-full"
                style={{ 
                  backgroundColor: imagePreview ? COLORS.orange : `${COLORS.white}30`,
                  boxShadow: imagePreview ? `0 0 8px ${COLORS.orange}` : 'none'
                }}
              />
              Pieza
            </div>
            <div className="flex items-center gap-2" style={{ color: figmaImagePreview ? COLORS.blue : `${COLORS.white}40` }}>
              <div 
                className="w-2 h-2 rounded-full"
                style={{ 
                  backgroundColor: figmaImagePreview ? COLORS.blue : `${COLORS.white}30`,
                  boxShadow: figmaImagePreview ? `0 0 8px ${COLORS.blue}` : 'none'
                }}
              />
              Figma
            </div>
            <div className="flex items-center gap-2" style={{ color: (imagePreview && figmaImagePreview) ? COLORS.orange : `${COLORS.white}40` }}>
              <div 
                className="w-2 h-2 rounded-full"
                style={{ 
                  backgroundColor: (imagePreview && figmaImagePreview) ? COLORS.orange : `${COLORS.white}30`,
                  boxShadow: (imagePreview && figmaImagePreview) ? `0 0 8px ${COLORS.orange}` : 'none'
                }}
              />
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
              boxShadow: [`0 0 20px ${COLORS.blue}30`, `0 0 40px ${COLORS.blue}50`, `0 0 20px ${COLORS.blue}30`]
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div 
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})` }}
            />
            <div 
              className="absolute inset-0 blur-2xl opacity-50 group-hover:opacity-80 transition-opacity"
              style={{ background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.orange})` }}
            />
            
            {/* Sparkle effects */}
            {!isComparing && (
              <>
                <motion.div 
                  className="absolute top-2 left-4 w-1 h-1 rounded-full"
                  style={{ backgroundColor: COLORS.white }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                />
                <motion.div 
                  className="absolute bottom-3 right-6 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: COLORS.white }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
              </>
            )}
            
            <span className="relative flex items-center gap-3" style={{ color: COLORS.white }}>
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
              className="text-sm"
              style={{ color: `${COLORS.white}50` }}
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
              <MotionCard 
                className="border backdrop-blur-xl overflow-hidden"
                style={{ backgroundColor: `${COLORS.white}03`, borderColor: `${COLORS.white}10` }}
              >
                <CardHeader className="border-b" style={{ borderColor: `${COLORS.white}05` }}>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <CardTitle className="text-2xl flex items-center gap-3" style={{ color: COLORS.white }}>
                      <div 
                        className="p-2 rounded-xl"
                        style={{ backgroundColor: `${COLORS.blue}20`, border: `1px solid ${COLORS.blue}30` }}
                      >
                        <Search className="w-5 h-5" style={{ color: COLORS.blue }} />
                      </div>
                      Reporte de QA
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      {aiComparison && (
                        <Badge 
                          className="px-4 py-2"
                          style={{ 
                            background: `linear-gradient(135deg, ${COLORS.blue}20, ${COLORS.orange}20)`,
                            borderColor: `${COLORS.blue}30`,
                            color: COLORS.white
                          }}
                        >
                          {aiComparison.match_percentage}% match
                        </Badge>
                      )}
                      <Badge 
                        className="px-4 py-2"
                        style={{ 
                          backgroundColor: corrections.filter(c => c.severity === 'error').length > 0 ? `${COLORS.orange}20` : `${COLORS.blue}20`,
                          color: corrections.filter(c => c.severity === 'error').length > 0 ? COLORS.orange : COLORS.blue
                        }}
                      >
                        {corrections.filter(c => c.severity === 'error').length} errores
                      </Badge>
                    </div>
                  </div>
                  {aiComparison?.summary && (
                    <CardDescription className="mt-3 text-base" style={{ color: `${COLORS.white}60` }}>
                      {aiComparison.summary}
                    </CardDescription>
                  )}
                </CardHeader>
                
                <CardContent className="p-6">
                  {/* Warning when no API key */}
                  {needsManualReview && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-4 rounded-xl flex items-start gap-3"
                      style={{ backgroundColor: `${COLORS.orange}15`, border: `1px solid ${COLORS.orange}30` }}
                    >
                      <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: COLORS.orange }} />
                      <div>
                        <p className="font-semibold" style={{ color: COLORS.orange }}>Análisis con IA no disponible</p>
                        <p className="text-sm mt-1" style={{ color: `${COLORS.white}70` }}>
                          Para habilitar la comparación automática con IA, configura tu API Key de OpenAI en la sección de configuración de APIs.
                        </p>
                        <button
                          onClick={() => setShowApiConfig(true)}
                          className="mt-2 text-sm font-medium underline"
                          style={{ color: COLORS.blue }}
                        >
                          Configurar API Key
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* AI Error message */}
                  {aiError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-4 rounded-xl flex items-start gap-3"
                      style={{ backgroundColor: `${COLORS.orange}15`, border: `1px solid ${COLORS.orange}30` }}
                    >
                      <X className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: COLORS.orange }} />
                      <div>
                        <p className="font-semibold" style={{ color: COLORS.orange }}>Error en análisis con IA</p>
                        <p className="text-sm mt-1" style={{ color: `${COLORS.white}70` }}>{aiError}</p>
                      </div>
                    </motion.div>
                  )}

                  {corrections.length === 0 && !needsManualReview ? (
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
                        <CheckCircle2 className="w-20 h-20 mx-auto mb-4" style={{ color: COLORS.blue }} />
                      </motion.div>
                      <h3 className="text-2xl font-bold mb-2" style={{ color: COLORS.blue }}>Todo correcto</h3>
                      <p style={{ color: `${COLORS.white}50` }}>No se encontraron diferencias entre la pieza y el diseño</p>
                    </motion.div>
                  ) : corrections.length === 0 && needsManualReview ? (
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="py-8 text-center"
                    >
                      <Eye className="w-16 h-16 mx-auto mb-4" style={{ color: COLORS.blue }} />
                      <h3 className="text-xl font-bold mb-2" style={{ color: COLORS.white }}>Revisión Manual Requerida</h3>
                      <p style={{ color: `${COLORS.white}50` }}>
                        Compara las imágenes visualmente a continuación para identificar diferencias.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="space-y-4">
                      {corrections.map((correction, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="p-5 rounded-2xl border backdrop-blur-sm"
                          style={{
                            backgroundColor: correction.severity === 'error' ? `${COLORS.orange}10` : `${COLORS.blue}10`,
                            borderColor: correction.severity === 'error' ? `${COLORS.orange}25` : `${COLORS.blue}25`
                          }}
                        >
                          <div className="flex items-start gap-4">
                            <div 
                              className="p-2 rounded-xl"
                              style={{ backgroundColor: correction.severity === 'error' ? `${COLORS.orange}20` : `${COLORS.blue}20` }}
                            >
                              {correction.severity === 'error' ? (
                                <X className="w-5 h-5" style={{ color: COLORS.orange }} />
                              ) : correction.severity === 'warning' ? (
                                <AlertTriangle className="w-5 h-5" style={{ color: COLORS.orange }} />
                              ) : (
                                <Info className="w-5 h-5" style={{ color: COLORS.blue }} />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getCategoryIcon(correction.category)}
                                <span 
                                  className="font-semibold"
                                  style={{ color: correction.severity === 'error' ? COLORS.orange : COLORS.blue }}
                                >
                                  {correction.field}
                                </span>
                                {correction.category && (
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs"
                                    style={{ borderColor: `${COLORS.white}20`, color: `${COLORS.white}60` }}
                                  >
                                    {correction.category}
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span style={{ color: `${COLORS.white}50` }}>Esperado:</span>
                                  <p className="mt-1" style={{ color: COLORS.blue }}>{correction.expected}</p>
                                </div>
                                <div>
                                  <span style={{ color: `${COLORS.white}50` }}>Encontrado:</span>
                                  <p className="mt-1" style={{ color: COLORS.orange }}>{correction.found}</p>
                                </div>
                              </div>
                              {correction.suggestion && (
                                <div 
                                  className="mt-3 p-3 rounded-xl"
                                  style={{ backgroundColor: `${COLORS.white}05` }}
                                >
                                  <span className="text-sm" style={{ color: `${COLORS.white}50` }}>Sugerencia: </span>
                                  <span className="text-sm" style={{ color: COLORS.blue }}>{correction.suggestion}</span>
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
                    <div className="mt-8 pt-8" style={{ borderTop: `1px solid ${COLORS.white}10` }}>
                      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2" style={{ color: COLORS.white }}>
                        <Eye className="w-5 h-5" style={{ color: `${COLORS.white}60` }} />
                        Comparación Visual
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <p className="text-sm" style={{ color: `${COLORS.white}50` }}>Pieza Actual</p>
                          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: `${COLORS.orange}30` }}>
                            <img src={imagePreview} alt="Pieza" className="w-full" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm" style={{ color: `${COLORS.white}50` }}>Diseño Figma</p>
                          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: `${COLORS.blue}30` }}>
                            <img src={figmaImagePreview} alt="Figma" className="w-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Export Buttons */}
                  <div className="mt-8 pt-8 flex justify-end gap-4" style={{ borderTop: `1px solid ${COLORS.white}10` }}>
                    <Button
                      variant="outline"
                      onClick={() => exportReport('txt')}
                      className="border"
                      style={{ borderColor: `${COLORS.white}15`, color: COLORS.white }}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Exportar TXT
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => exportReport('json')}
                      className="border"
                      style={{ borderColor: `${COLORS.white}15`, color: COLORS.white }}
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

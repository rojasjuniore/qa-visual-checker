'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

export default function Home() {
  const [cardText, setCardText] = useState('');
  const [figmaText, setFigmaText] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [figmaImageFile, setFigmaImageFile] = useState<File | null>(null);
  const [figmaImagePreview, setFigmaImagePreview] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [aiComparison, setAIComparison] = useState<AIComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isLoadingFigma, setIsLoadingFigma] = useState(false);
  const [comparisonDone, setComparisonDone] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');
  const [figmaData, setFigmaData] = useState<any>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'example' | 'figma') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'example') {
          setImageFile(file);
          setImagePreview(reader.result as string);
        } else {
          setFigmaImageFile(file);
          setFigmaImagePreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchFromFigma = async () => {
    if (!figmaUrl) {
      alert('Por favor ingresa una URL de Figma');
      return;
    }

    setIsLoadingFigma(true);
    try {
      const response = await fetch('/api/figma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figmaUrl,
          accessToken: figmaToken || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Error al obtener datos de Figma');
        return;
      }

      setFigmaData(data);

      // Set text content from Figma
      if (data.node?.textContent?.length > 0) {
        const formattedText = data.node.textContent
          .map((text: string, i: number) => `Texto ${i + 1}: ${text}`)
          .join('\n');
        setFigmaText(formattedText);
      }

      // Set image from Figma
      if (data.node?.imageUrl) {
        setFigmaImagePreview(data.node.imageUrl);
      }

    } catch (error) {
      console.error('Error:', error);
      alert('Error al conectar con Figma');
    } finally {
      setIsLoadingFigma(false);
    }
  };

  const extractFieldsFromText = (text: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    const lines = text.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        fields[colonMatch[1].trim().toLowerCase()] = colonMatch[2].trim();
        return;
      }
      
      const equalMatch = line.match(/^([^=]+)=\s*(.+)$/);
      if (equalMatch) {
        fields[equalMatch[1].trim().toLowerCase()] = equalMatch[2].trim();
        return;
      }
      
      const dashMatch = line.match(/^([^-]+)-\s*(.+)$/);
      if (dashMatch) {
        fields[dashMatch[1].trim().toLowerCase()] = dashMatch[2].trim();
      }
    });
    
    return fields;
  };

  const compareFields = (cardFields: Record<string, string>, figmaFields: Record<string, string>): Correction[] => {
    const corrections: Correction[] = [];
    
    Object.keys(cardFields).forEach(key => {
      const cardValue = cardFields[key];
      const figmaValue = figmaFields[key];
      
      if (!figmaValue) {
        corrections.push({
          field: key,
          expected: cardValue,
          found: '(no encontrado en Figma)',
          severity: 'warning'
        });
      } else if (cardValue.toLowerCase() !== figmaValue.toLowerCase()) {
        corrections.push({
          field: key,
          expected: figmaValue,
          found: cardValue,
          severity: 'error'
        });
      }
    });
    
    Object.keys(figmaFields).forEach(key => {
      if (!cardFields[key]) {
        corrections.push({
          field: key,
          expected: figmaFields[key],
          found: '(falta en la tarjeta)',
          severity: 'error'
        });
      }
    });
    
    return corrections;
  };

  const compareWithAI = async () => {
    if (!imagePreview || !figmaImagePreview) {
      return null;
    }

    try {
      const response = await fetch('/api/compare-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image1: imagePreview,
          image2: figmaImagePreview,
          apiKey: openaiKey || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('AI comparison error:', data.error);
        return null;
      }

      return data.comparison as AIComparison;
    } catch (error) {
      console.error('Error comparing with AI:', error);
      return null;
    }
  };

  const handleCompare = async () => {
    setIsComparing(true);
    setCorrections([]);
    setAIComparison(null);

    // Text comparison
    const cardFields = extractFieldsFromText(cardText);
    const figmaFields = extractFieldsFromText(figmaText);
    const textCorrections = compareFields(cardFields, figmaFields);
    
    // AI Image comparison
    let aiResult: AIComparison | null = null;
    if (imagePreview && figmaImagePreview) {
      aiResult = await compareWithAI();
      if (aiResult) {
        setAIComparison(aiResult);
        
        // Convert AI differences to corrections format
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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category?.toUpperCase()) {
      case 'TEXTO': return '📝';
      case 'COLORES': return '🎨';
      case 'TIPOGRAFÍA': return '🔤';
      case 'LAYOUT': return '📐';
      case 'ELEMENTOS': return '🧩';
      case 'PROPORCIONES': return '📏';
      default: return '📋';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            QA Visual Checker
          </h1>
          <p className="text-slate-400">
            Compara piezas gráficas con información de tarjetas, textos e imágenes de Figma
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <Badge variant="outline" className="text-blue-400 border-blue-400">Figma API</Badge>
            <Badge variant="outline" className="text-green-400 border-green-400">AI Vision</Badge>
          </div>
        </div>

        {/* API Keys Section */}
        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              🔐 Configuración de APIs (opcional)
            </CardTitle>
            <CardDescription>
              Las claves se pueden configurar aquí o como variables de entorno
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Figma Access Token</label>
                <Input
                  type="password"
                  placeholder="figd_xxxx..."
                  className="bg-slate-900 border-slate-600 text-white"
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">OpenAI API Key</label>
                <Input
                  type="password"
                  placeholder="sk-xxxx..."
                  className="bg-slate-900 border-slate-600 text-white"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Card/Text Input */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                📋 Información de la Tarjeta/Texto
              </CardTitle>
              <CardDescription>
                Pega o escribe la información que aparece en la pieza gráfica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Ejemplo:
Título: Oferta Especial
Precio: $99.99
Descripción: Producto de alta calidad
Fecha: 15 de marzo 2024"
                className="min-h-[200px] bg-slate-900 border-slate-600 text-white"
                value={cardText}
                onChange={(e) => setCardText(e.target.value)}
              />
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Imagen de la pieza
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  className="bg-slate-900 border-slate-600 text-white"
                  onChange={(e) => handleImageUpload(e, 'example')}
                />
                {imagePreview && (
                  <div className="mt-4 relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-48 rounded-lg border border-slate-600"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Figma/Reference Input */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                🎨 Información de Figma/Referencia
              </CardTitle>
              <CardDescription>
                Conecta con Figma o pega la información manualmente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 bg-slate-900">
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                  <TabsTrigger value="figma">Desde Figma</TabsTrigger>
                </TabsList>
                
                <TabsContent value="figma" className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">URL de Figma</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://www.figma.com/design/xxxxx?node-id=1234"
                        className="bg-slate-900 border-slate-600 text-white flex-1"
                        value={figmaUrl}
                        onChange={(e) => setFigmaUrl(e.target.value)}
                      />
                      <Button 
                        onClick={fetchFromFigma}
                        disabled={isLoadingFigma}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {isLoadingFigma ? '⏳' : '🔗'} Conectar
                      </Button>
                    </div>
                  </div>
                  
                  {figmaData && (
                    <Alert className="bg-green-900/30 border-green-700">
                      <AlertTitle className="text-green-400">✅ Conectado a Figma</AlertTitle>
                      <AlertDescription className="text-green-300">
                        Archivo: {figmaData.file?.name}
                        {figmaData.node?.textContent?.length > 0 && (
                          <span className="block mt-1">
                            {figmaData.node.textContent.length} textos encontrados
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </TabsContent>

                <TabsContent value="manual">
                  <p className="text-sm text-slate-500 mb-2">
                    Pega la información del diseño
                  </p>
                </TabsContent>
              </Tabs>

              <Textarea
                placeholder="Ejemplo:
Título: Oferta Especial
Precio: $89.99
Descripción: Producto premium de alta calidad
Fecha: 15 de marzo 2024"
                className="min-h-[150px] bg-slate-900 border-slate-600 text-white"
                value={figmaText}
                onChange={(e) => setFigmaText(e.target.value)}
              />
              
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Imagen de Figma {figmaImagePreview && figmaData?.node?.imageUrl && '(desde API)'}
                </label>
                <Input
                  type="file"
                  accept="image/*"
                  className="bg-slate-900 border-slate-600 text-white"
                  onChange={(e) => handleImageUpload(e, 'figma')}
                />
                {figmaImagePreview && (
                  <div className="mt-4 relative">
                    <img
                      src={figmaImagePreview}
                      alt="Figma Preview"
                      className="max-h-48 rounded-lg border border-slate-600"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setFigmaImageFile(null);
                        setFigmaImagePreview(null);
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compare Button */}
        <div className="flex justify-center mb-8">
          <Button
            size="lg"
            className="px-12 py-6 text-lg bg-blue-600 hover:bg-blue-700"
            onClick={handleCompare}
            disabled={isComparing || (!cardText && !figmaText && !imagePreview)}
          >
            {isComparing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                {imagePreview && figmaImagePreview ? 'Analizando con IA...' : 'Comparando...'}
              </>
            ) : (
              <>
                🔍 Comparar y Generar Reporte
                {imagePreview && figmaImagePreview && ' (con IA)'}
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {comparisonDone && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>📊 Reporte de Correcciones</span>
                <div className="flex gap-2">
                  {aiComparison && (
                    <Badge variant="default" className="bg-purple-600">
                      {aiComparison.match_percentage}% coincidencia
                    </Badge>
                  )}
                  <Badge variant={corrections.filter(c => c.severity === 'error').length > 0 ? 'destructive' : 'default'}>
                    {corrections.filter(c => c.severity === 'error').length} errores
                  </Badge>
                  <Badge variant="secondary">
                    {corrections.filter(c => c.severity === 'warning').length} advertencias
                  </Badge>
                </div>
              </CardTitle>
              {aiComparison?.summary && (
                <CardDescription className="text-slate-300 mt-2">
                  {aiComparison.summary}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {corrections.length === 0 ? (
                <Alert className="bg-green-900/30 border-green-700">
                  <AlertTitle className="text-green-400">✅ Sin correcciones</AlertTitle>
                  <AlertDescription className="text-green-300">
                    Toda la información coincide correctamente entre la tarjeta y el diseño de Figma.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {corrections.map((correction, index) => (
                    <Alert
                      key={index}
                      className={`${
                        correction.severity === 'error'
                          ? 'bg-red-900/30 border-red-700'
                          : correction.severity === 'warning'
                          ? 'bg-yellow-900/30 border-yellow-700'
                          : 'bg-blue-900/30 border-blue-700'
                      }`}
                    >
                      <AlertTitle className={`${
                        correction.severity === 'error'
                          ? 'text-red-400'
                          : correction.severity === 'warning'
                          ? 'text-yellow-400'
                          : 'text-blue-400'
                      }`}>
                        {getSeverityIcon(correction.severity)} {getCategoryIcon(correction.category)} {correction.field}
                      </AlertTitle>
                      <AlertDescription className="mt-2 space-y-1">
                        <div className="text-slate-300">
                          <span className="font-semibold">Esperado (Figma):</span>{' '}
                          <span className="text-green-400">{correction.expected}</span>
                        </div>
                        <div className="text-slate-300">
                          <span className="font-semibold">Encontrado (Pieza):</span>{' '}
                          <span className="text-red-400">{correction.found}</span>
                        </div>
                        {correction.suggestion && (
                          <div className="text-slate-300 mt-2 p-2 bg-slate-800 rounded">
                            <span className="font-semibold">💡 Sugerencia:</span>{' '}
                            <span className="text-blue-300">{correction.suggestion}</span>
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Image Comparison Side by Side */}
              {(imagePreview || figmaImagePreview) && (
                <div className="mt-8">
                  <h3 className="text-white font-semibold mb-4">Comparación Visual</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {imagePreview && (
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Pieza Gráfica</p>
                        <img
                          src={imagePreview}
                          alt="Pieza gráfica"
                          className="w-full rounded-lg border border-slate-600"
                        />
                      </div>
                    )}
                    {figmaImagePreview && (
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Diseño Figma</p>
                        <img
                          src={figmaImagePreview}
                          alt="Diseño Figma"
                          className="w-full rounded-lg border border-slate-600"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Export Button */}
              <div className="mt-6 flex justify-end gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    const report = [
                      'REPORTE DE CORRECCIONES QA',
                      '=' .repeat(40),
                      '',
                      aiComparison ? `Coincidencia: ${aiComparison.match_percentage}%` : '',
                      aiComparison?.summary ? `Resumen: ${aiComparison.summary}` : '',
                      '',
                      'CORRECCIONES:',
                      '',
                      ...corrections.map(c => 
                        `${getSeverityIcon(c.severity)} [${c.category || 'TEXTO'}] ${c.field}\n  Esperado: ${c.expected}\n  Encontrado: ${c.found}${c.suggestion ? `\n  Sugerencia: ${c.suggestion}` : ''}`
                      ),
                    ].filter(Boolean).join('\n');
                    
                    const blob = new Blob([report || 'Sin correcciones - Todo OK'], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `reporte-qa-${new Date().toISOString().split('T')[0]}.txt`;
                    a.click();
                  }}
                >
                  📥 Exportar TXT
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const jsonReport = {
                      date: new Date().toISOString(),
                      matchPercentage: aiComparison?.match_percentage || null,
                      summary: aiComparison?.summary || null,
                      totalCorrections: corrections.length,
                      errors: corrections.filter(c => c.severity === 'error').length,
                      warnings: corrections.filter(c => c.severity === 'warning').length,
                      corrections: corrections,
                    };
                    
                    const blob = new Blob([JSON.stringify(jsonReport, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `reporte-qa-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                  }}
                >
                  📥 Exportar JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

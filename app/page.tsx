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
}

export default function Home() {
  const [cardText, setCardText] = useState('');
  const [figmaText, setFigmaText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [figmaImageFile, setFigmaImageFile] = useState<File | null>(null);
  const [figmaImagePreview, setFigmaImagePreview] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonDone, setComparisonDone] = useState(false);

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

  const extractFieldsFromText = (text: string): Record<string, string> => {
    const fields: Record<string, string> = {};
    const lines = text.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      // Try to extract key: value pairs
      const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        fields[colonMatch[1].trim().toLowerCase()] = colonMatch[2].trim();
        return;
      }
      
      // Try to extract key = value pairs
      const equalMatch = line.match(/^([^=]+)=\s*(.+)$/);
      if (equalMatch) {
        fields[equalMatch[1].trim().toLowerCase()] = equalMatch[2].trim();
        return;
      }
      
      // Try to extract key - value pairs
      const dashMatch = line.match(/^([^-]+)-\s*(.+)$/);
      if (dashMatch) {
        fields[dashMatch[1].trim().toLowerCase()] = dashMatch[2].trim();
      }
    });
    
    return fields;
  };

  const compareFields = (cardFields: Record<string, string>, figmaFields: Record<string, string>): Correction[] => {
    const corrections: Correction[] = [];
    
    // Check fields in card against figma
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
    
    // Check fields in figma that are not in card
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

  const handleCompare = async () => {
    setIsComparing(true);
    setCorrections([]);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const cardFields = extractFieldsFromText(cardText);
    const figmaFields = extractFieldsFromText(figmaText);
    
    const newCorrections = compareFields(cardFields, figmaFields);
    
    // If no text corrections but we have images, add a note
    if (newCorrections.length === 0 && (imagePreview || figmaImagePreview)) {
      if (imagePreview && figmaImagePreview) {
        newCorrections.push({
          field: 'Imágenes',
          expected: 'Verificar visualmente',
          found: 'Ambas imágenes cargadas - comparar manualmente',
          severity: 'info'
        });
      }
    }
    
    setCorrections(newCorrections);
    setComparisonDone(true);
    setIsComparing(false);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
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
        </div>

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
                  Imagen de la pieza (opcional)
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
                Pega la información que debería tener según el diseño en Figma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Ejemplo:
Título: Oferta Especial
Precio: $89.99
Descripción: Producto premium de alta calidad
Fecha: 15 de marzo 2024"
                className="min-h-[200px] bg-slate-900 border-slate-600 text-white"
                value={figmaText}
                onChange={(e) => setFigmaText(e.target.value)}
              />
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Imagen de Figma (opcional)
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
            disabled={isComparing || (!cardText && !figmaText)}
          >
            {isComparing ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Comparando...
              </>
            ) : (
              <>
                🔍 Comparar y Generar Reporte
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
                  <Badge variant={corrections.filter(c => c.severity === 'error').length > 0 ? 'destructive' : 'default'}>
                    {corrections.filter(c => c.severity === 'error').length} errores
                  </Badge>
                  <Badge variant="secondary">
                    {corrections.filter(c => c.severity === 'warning').length} advertencias
                  </Badge>
                </div>
              </CardTitle>
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
                        {getSeverityIcon(correction.severity)} Campo: {correction.field}
                      </AlertTitle>
                      <AlertDescription className="mt-2 space-y-1">
                        <div className="text-slate-300">
                          <span className="font-semibold">Esperado (Figma):</span>{' '}
                          <span className="text-green-400">{correction.expected}</span>
                        </div>
                        <div className="text-slate-300">
                          <span className="font-semibold">Encontrado (Tarjeta):</span>{' '}
                          <span className="text-red-400">{correction.found}</span>
                        </div>
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
              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    const report = corrections.map(c => 
                      `${getSeverityIcon(c.severity)} ${c.field}\n  Esperado: ${c.expected}\n  Encontrado: ${c.found}`
                    ).join('\n\n');
                    
                    const blob = new Blob([`REPORTE DE CORRECCIONES QA\n${'='.repeat(40)}\n\n${report || 'Sin correcciones - Todo OK'}`], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'reporte-qa.txt';
                    a.click();
                  }}
                >
                  📥 Exportar Reporte
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

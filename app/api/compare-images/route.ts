import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { image1, image2, apiKey } = await request.json();

    if (!image1 || !image2) {
      return NextResponse.json({ error: 'Both images are required' }, { status: 400 });
    }

    const openaiKey = apiKey || process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      // Return a message indicating manual review is needed
      return NextResponse.json({ 
        success: true,
        noApiKey: true,
        comparison: {
          summary: 'No se pudo realizar análisis automático con IA. Se requiere revisión manual.',
          match_percentage: null,
          differences: [{
            category: 'REVISIÓN MANUAL',
            severity: 'warning',
            location: 'General',
            expected: 'Análisis automático con IA',
            found: 'API Key de OpenAI no configurada',
            suggestion: 'Configura tu API Key de OpenAI en la sección de configuración para habilitar el análisis automático con IA. Mientras tanto, revisa las imágenes manualmente.'
          }]
        }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en QA de diseño gráfico. Tu trabajo es comparar dos imágenes y encontrar TODAS las diferencias.

Analiza:
1. TEXTO: Diferencias en contenido, ortografía, mayúsculas/minúsculas
2. COLORES: Diferencias en colores de fondo, texto, elementos
3. TIPOGRAFÍA: Diferencias en fuentes, tamaños, pesos
4. LAYOUT: Diferencias en posición, alineación, espaciado
5. ELEMENTOS: Elementos faltantes o adicionales
6. PROPORCIONES: Diferencias en tamaños relativos

Responde en JSON con este formato exacto:
{
  "summary": "Resumen breve de las diferencias encontradas",
  "match_percentage": 85,
  "differences": [
    {
      "category": "TEXTO|COLORES|TIPOGRAFÍA|LAYOUT|ELEMENTOS|PROPORCIONES",
      "severity": "error|warning|info",
      "location": "Descripción de dónde está la diferencia",
      "expected": "Lo que debería ser (imagen de referencia/Figma)",
      "found": "Lo que se encontró (imagen de la pieza)",
      "suggestion": "Cómo corregirlo"
    }
  ]
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Compara estas dos imágenes. La PRIMERA imagen es la pieza gráfica actual. La SEGUNDA imagen es el diseño de referencia (Figma). Encuentra todas las diferencias y genera el reporte de correcciones necesarias.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: image1,
                  detail: 'high'
                }
              },
              {
                type: 'image_url',
                image_url: {
                  url: image2,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json({ error: `OpenAI API error: ${response.status}` }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    // Parse the JSON response
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          comparison: result,
        });
      } else {
        // If no JSON found, return the raw text
        return NextResponse.json({
          success: true,
          comparison: {
            summary: content,
            match_percentage: 0,
            differences: [],
            raw: true,
          },
        });
      }
    } catch (parseError) {
      return NextResponse.json({
        success: true,
        comparison: {
          summary: content,
          match_percentage: 0,
          differences: [],
          raw: true,
        },
      });
    }

  } catch (error) {
    console.error('Compare images error:', error);
    return NextResponse.json({ error: 'Failed to compare images' }, { status: 500 });
  }
}

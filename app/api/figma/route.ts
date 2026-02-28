import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { figmaUrl, accessToken } = await request.json();

    if (!figmaUrl) {
      return NextResponse.json({ error: 'Figma URL is required' }, { status: 400 });
    }

    // Extract file key and node ID from Figma URL
    // Formats: 
    // https://www.figma.com/file/FILE_KEY/File-Name?node-id=NODE_ID
    // https://www.figma.com/design/FILE_KEY/File-Name?node-id=NODE_ID
    const urlMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
    const nodeMatch = figmaUrl.match(/node-id=([^&]+)/);

    if (!urlMatch) {
      return NextResponse.json({ error: 'Invalid Figma URL format' }, { status: 400 });
    }

    const fileKey = urlMatch[2];
    const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : null;

    const token = accessToken || process.env.FIGMA_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json({ 
        error: 'Figma access token required. Provide it in the request or set FIGMA_ACCESS_TOKEN env var.' 
      }, { status: 401 });
    }

    // Fetch file info
    const fileResponse = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: {
        'X-Figma-Token': token,
      },
    });

    if (!fileResponse.ok) {
      const error = await fileResponse.text();
      return NextResponse.json({ error: `Figma API error: ${error}` }, { status: fileResponse.status });
    }

    const fileData = await fileResponse.json();

    // If node ID is provided, get specific node
    let nodeData = null;
    let imageUrl = null;

    if (nodeId) {
      const nodesResponse = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
        {
          headers: {
            'X-Figma-Token': token,
          },
        }
      );

      if (nodesResponse.ok) {
        const nodesData = await nodesResponse.json();
        nodeData = nodesData.nodes[nodeId];
      }

      // Get image export
      const imageResponse = await fetch(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
        {
          headers: {
            'X-Figma-Token': token,
          },
        }
      );

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        imageUrl = imageData.images[nodeId];
      }
    }

    // Extract text content from the node
    const extractText = (node: any): string[] => {
      const texts: string[] = [];
      
      if (node.type === 'TEXT' && node.characters) {
        texts.push(node.characters);
      }
      
      if (node.children) {
        for (const child of node.children) {
          texts.push(...extractText(child));
        }
      }
      
      return texts;
    };

    const textContent = nodeData?.document ? extractText(nodeData.document) : [];

    // Extract styles and properties
    const extractProperties = (node: any): Record<string, any> => {
      const props: Record<string, any> = {};
      
      if (node.name) props.name = node.name;
      if (node.type) props.type = node.type;
      if (node.characters) props.text = node.characters;
      if (node.style) {
        if (node.style.fontFamily) props.fontFamily = node.style.fontFamily;
        if (node.style.fontSize) props.fontSize = node.style.fontSize;
        if (node.style.fontWeight) props.fontWeight = node.style.fontWeight;
      }
      if (node.fills && node.fills[0]?.color) {
        const c = node.fills[0].color;
        props.color = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a || 1})`;
      }
      if (node.absoluteBoundingBox) {
        props.width = node.absoluteBoundingBox.width;
        props.height = node.absoluteBoundingBox.height;
      }
      
      return props;
    };

    const properties = nodeData?.document ? extractProperties(nodeData.document) : {};

    return NextResponse.json({
      success: true,
      file: {
        name: fileData.name,
        lastModified: fileData.lastModified,
      },
      node: nodeData ? {
        id: nodeId,
        properties,
        textContent,
        imageUrl,
      } : null,
    });

  } catch (error) {
    console.error('Figma API error:', error);
    return NextResponse.json({ error: 'Failed to fetch from Figma' }, { status: 500 });
  }
}

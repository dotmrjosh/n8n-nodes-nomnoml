import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import * as nomnoml from 'nomnoml';
import { createCanvas, loadImage } from 'canvas';
import { Buffer } from 'buffer';

export class Nomnoml implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nomnoml',
    name: 'nomnoml',
    icon: 'file:nomnoml.svg',
    group: ['transform'],
    version: 1,
    description: 'Generate SVG diagrams from nomnoml text',
    defaults: {
      name: 'Nomnoml',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    usableAsTool: true,
    properties: [
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          {
            name: 'SVG',
            value: 'svg',
          },
          {
            name: 'PNG',
            value: 'png',
          },
        ],
        default: 'svg',
        description: 'The format to output the diagram in',
      },
      {
        displayName: 'Nomnoml Text',
        name: 'nomnomlText',
        type: 'string',
        typeOptions: {
          rows: 10,
        },
        default:
          '[Pirate|eyeCount: Int|raid();pillage()|\n  [beard]--[parrot]\n  [beard]-:>[foul mouth]\n]\n\n[<abstract>Marauder]<:--[Pirate]\n[Pirate]- 0..7[mischief]\n[jollyness]->[Pirate]\n[jollyness]->[rum]\n[jollyness]->[singing]\n[Pirate]-> *[rum|tastiness: Int|swig()]\n[Pirate]->[singing]\n[singing]<->[rum]\n\n[<start>st]->[<state>plunder]\n[plunder]->[<choice>more loot]\n[more loot]->[st]\n[more loot] no ->[<end>e]',
        placeholder: 'Enter nomnoml diagram text',
        description: 'The nomnoml text to convert to diagram',
      },
      {
        displayName: 'Output Field Name',
        name: 'outputField',
        type: 'string',
        default: 'diagram',
        description: 'The field name to store the generated diagram',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const nomnomlText = this.getNodeParameter('nomnomlText', itemIndex, '') as string;
        const outputField = this.getNodeParameter('outputField', itemIndex, 'diagram') as string;
        const outputFormat = this.getNodeParameter('outputFormat', itemIndex, 'svg') as string;

        if (!nomnomlText) {
          throw new NodeOperationError(this.getNode(), 'Nomnoml text is required', {
            itemIndex,
          });
        }

        if (outputFormat === 'png') {
          // Generate SVG first to get dimensions
          const svg = nomnoml.renderSvg(nomnomlText);

          // Extract dimensions from SVG
          const widthMatch = svg.match(/width="([^"]+)"/);
          const heightMatch = svg.match(/height="([^"]+)"/);

          if (!widthMatch || !heightMatch) {
            throw new NodeOperationError(this.getNode(), 'Could not extract dimensions from SVG', {
              itemIndex,
            });
          }

          const width = Math.ceil(parseFloat(widthMatch[1]));
          const height = Math.ceil(parseFloat(heightMatch[1]));

          // Create canvas and render
          const canvas = createCanvas(width, height);
          const ctx = canvas.getContext('2d');

          // Set white background
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);

          // Convert SVG to image and draw on canvas
          const svgBuffer = Buffer.from(svg);
          const img = await loadImage(svgBuffer);
          ctx.drawImage(img, 0, 0);

          // Get PNG buffer
          const pngBuffer = canvas.toBuffer('image/png');

          // Prepare binary data for PNG
          const binaryData = await this.helpers.prepareBinaryData(
            pngBuffer,
            'diagram.png',
            'image/png',
          );

          const newItem: INodeExecutionData = {
            json: {
              ...items[itemIndex].json,
            },
            binary: {
              [outputField]: binaryData,
            },
            pairedItem: itemIndex,
          };

          returnData.push(newItem);
        } else {
          // SVG output - store as text in JSON
          const svg = nomnoml.renderSvg(nomnomlText);

          const newItem: INodeExecutionData = {
            json: {
              ...items[itemIndex].json,
              [outputField]: svg,
            },
            pairedItem: itemIndex,
          };

          returnData.push(newItem);
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: items[itemIndex].json,
            error,
            pairedItem: itemIndex,
          });
        } else {
          if (error.context) {
            error.context.itemIndex = itemIndex;
            throw error;
          }
          throw new NodeOperationError(this.getNode(), error, {
            itemIndex,
          });
        }
      }
    }

    return [returnData];
  }
}

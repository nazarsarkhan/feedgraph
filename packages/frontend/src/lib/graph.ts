import { api } from './api';
import type { EntityType } from './entities';

export interface GraphNode {
  id: string;
  canonicalName: string;
  type: EntityType;
  aliases: string[];
  firstSeen: string;
  lastSeen: string;
  mentionCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const graphApi = {
  get: (): Promise<GraphData> => api.get<GraphData>('/graph'),
};

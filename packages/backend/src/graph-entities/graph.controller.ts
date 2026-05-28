import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { GraphEdge, GraphNode, GraphService } from './graph.service';

// Filters are parsed inline from raw query params rather than via a DTO
// — only two scalar inputs, both optional, both validated by the
// service's own SQL (Postgres rejects bad type values; minMentions is
// clamped at the service layer).
const ENTITY_TYPES: ReadonlySet<string> = new Set([
  'person',
  'company',
  'product',
  'technology',
  'location',
]);

@Controller('graph')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: string,
    @Query('minMentions') minMentionsRaw?: string,
    @Query('includeArticles') includeArticlesRaw?: string,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const safeType = type && ENTITY_TYPES.has(type) ? type : undefined;
    const parsed = minMentionsRaw ? parseInt(minMentionsRaw, 10) : NaN;
    const minMentions = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    // Strict 'true' parsing — any other value (including a stray
    // ?includeArticles=false) opts out so the default response stays
    // entity-only.
    const includeArticles = includeArticlesRaw === 'true';
    return this.graph.getGraph(user.id, { type: safeType, minMentions, includeArticles });
  }
}

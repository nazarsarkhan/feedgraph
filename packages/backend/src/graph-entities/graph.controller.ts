import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { GraphEdge, GraphNode, GraphService } from './graph.service';

@Controller('graph')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return this.graph.getGraph(user.id);
  }
}

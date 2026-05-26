import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailConfirmedGuard } from '../auth/email-confirmed.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types';
import { AxesService } from './axes.service';
import { Axis } from './axis.entity';
import { AxisValue } from './axis-value.entity';
import { AddValueDto } from './dto/add-value.dto';
import { CreateAxisDto } from './dto/create-axis.dto';
import { RenameAxisDto } from './dto/rename-axis.dto';
import { RenameValueDto } from './dto/rename-value.dto';

@Controller('axes')
@UseGuards(JwtAuthGuard, EmailConfirmedGuard)
export class AxesController {
  constructor(private readonly axes: AxesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAxisDto): Promise<Axis> {
    return this.axes.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Axis[]> {
    return this.axes.findAllForUser(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Axis> {
    return this.axes.findOneForUser(user.id, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameAxisDto,
  ): Promise<Axis> {
    return this.axes.rename(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.axes.remove(user.id, id);
  }

  @Post(':id/values')
  addValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddValueDto,
  ): Promise<AxisValue> {
    return this.axes.addValue(user.id, id, dto);
  }

  @Patch(':id/values/:valueId')
  renameValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
    @Body() dto: RenameValueDto,
  ): Promise<AxisValue> {
    return this.axes.renameValue(user.id, id, valueId, dto);
  }

  @Delete(':id/values/:valueId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('valueId', ParseUUIDPipe) valueId: string,
  ): Promise<void> {
    return this.axes.removeValue(user.id, id, valueId);
  }
}

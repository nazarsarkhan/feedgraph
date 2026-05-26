import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { Axis } from './axis.entity';
import { AxisValue } from './axis-value.entity';
import { AddValueDto } from './dto/add-value.dto';
import { CreateAxisDto } from './dto/create-axis.dto';
import { RenameAxisDto } from './dto/rename-axis.dto';
import { RenameValueDto } from './dto/rename-value.dto';

export const DEFAULT_AXES: ReadonlyArray<{ name: string; values: readonly string[] }> = [
  { name: 'Content type', values: ['news', 'analysis', 'tutorial', 'release', 'opinion'] },
  { name: 'Reader level', values: ['junior', 'middle', 'senior'] },
  { name: 'Region', values: ['UA', 'EU', 'US', 'global'] },
  { name: 'Tone', values: ['neutral', 'promotional', 'critical'] },
];

/**
 * Multi-tenant contract: every public method takes userId, every axis
 * lookup filters by user_id, and value lookups go through their parent
 * axis so cross-tenant access via direct value id is impossible.
 */
@Injectable()
export class AxesService {
  private readonly logger = new Logger(AxesService.name);

  constructor(
    @InjectRepository(Axis) private readonly axes: Repository<Axis>,
    @InjectRepository(AxisValue) private readonly values: Repository<AxisValue>,
  ) {}

  async findAllForUser(userId: string): Promise<Axis[]> {
    const list = await this.axes.find({ where: { userId }, order: { name: 'ASC' } });
    for (const axis of list) sortValues(axis);
    return list;
  }

  async findOneForUser(userId: string, axisId: string): Promise<Axis> {
    const axis = await this.axes.findOne({ where: { id: axisId, userId } });
    if (!axis) {
      throw new NotFoundException('Axis not found');
    }
    sortValues(axis);
    return axis;
  }

  async create(userId: string, dto: CreateAxisDto): Promise<Axis> {
    const axis = this.axes.create({
      userId,
      name: dto.name,
      values: dto.values.map((value, position) => ({ value, position })),
    });
    try {
      const saved = await this.axes.save(axis);
      this.logger.log(
        `axis created user=${userId} axis=${saved.id} name=${saved.name} values=${dto.values.length}`,
      );
      sortValues(saved);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Axis with this name already exists');
      }
      throw err;
    }
  }

  async rename(userId: string, axisId: string, dto: RenameAxisDto): Promise<Axis> {
    const axis = await this.findOneForUser(userId, axisId);
    axis.name = dto.name;
    try {
      const saved = await this.axes.save(axis);
      this.logger.log(`axis renamed user=${userId} axis=${axisId} name=${saved.name}`);
      sortValues(saved);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Axis with this name already exists');
      }
      throw err;
    }
  }

  async remove(userId: string, axisId: string): Promise<void> {
    const axis = await this.findOneForUser(userId, axisId);
    await this.axes.remove(axis);
    this.logger.log(`axis deleted user=${userId} axis=${axisId}`);
  }

  async addValue(userId: string, axisId: string, dto: AddValueDto): Promise<AxisValue> {
    const axis = await this.findOneForUser(userId, axisId);
    const nextPosition =
      axis.values.length === 0 ? 0 : Math.max(...axis.values.map((v) => v.position)) + 1;
    const newValue = this.values.create({
      axisId: axis.id,
      value: dto.value,
      position: nextPosition,
    });
    try {
      const saved = await this.values.save(newValue);
      this.logger.log(`axis value added user=${userId} axis=${axisId} value=${saved.id}`);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Value already exists on this axis');
      }
      throw err;
    }
  }

  async renameValue(
    userId: string,
    axisId: string,
    valueId: string,
    dto: RenameValueDto,
  ): Promise<AxisValue> {
    // Loading the axis verifies userId ownership; finding the value within
    // that axis verifies the value really belongs to this axis. Two checks
    // collapse into one round-trip thanks to eager loading.
    const axis = await this.findOneForUser(userId, axisId);
    const value = axis.values.find((v) => v.id === valueId);
    if (!value) {
      throw new NotFoundException('Axis value not found');
    }
    value.value = dto.value;
    try {
      const saved = await this.values.save(value);
      this.logger.log(`axis value renamed user=${userId} axis=${axisId} value=${valueId}`);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Value already exists on this axis');
      }
      throw err;
    }
  }

  async removeValue(userId: string, axisId: string, valueId: string): Promise<void> {
    const axis = await this.findOneForUser(userId, axisId);
    const value = axis.values.find((v) => v.id === valueId);
    if (!value) {
      throw new NotFoundException('Axis value not found');
    }
    await this.values.remove(value);
    this.logger.log(`axis value deleted user=${userId} axis=${axisId} value=${valueId}`);
  }

  /**
   * Seeds the default axis set for a user. Idempotent — no-op if any axes
   * already exist for the user. Accepts an optional EntityManager so the
   * caller can include the seed in a larger transaction (used by
   * AuthService.register so user+axes commit or roll back together).
   */
  async seedDefaultsForUser(userId: string, manager?: EntityManager): Promise<void> {
    const axisRepo = manager ? manager.getRepository(Axis) : this.axes;
    const existing = await axisRepo.count({ where: { userId } });
    if (existing > 0) return;

    for (const def of DEFAULT_AXES) {
      const axis = axisRepo.create({
        userId,
        name: def.name,
        values: def.values.map((value, position) => ({ value, position })),
      });
      await axisRepo.save(axis);
    }
    this.logger.log(`seeded ${DEFAULT_AXES.length} default axes for user=${userId}`);
  }
}

function sortValues(axis: Axis): void {
  axis.values.sort((a, b) => a.position - b.position);
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string } | undefined;
  return driver?.code === '23505';
}

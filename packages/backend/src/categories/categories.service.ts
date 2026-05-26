import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { RenameCategoryDto } from './dto/rename-category.dto';

/**
 * Multi-tenant contract: every public method in this service takes
 * userId as a parameter, and every WHERE clause MUST filter by user_id.
 * Users never see other users' categories. Enforced at the data-access
 * layer per Principle 4 of the spec.
 */
@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(@InjectRepository(Category) private readonly categories: Repository<Category>) {}

  findAllForUser(userId: string): Promise<Category[]> {
    return this.categories.find({ where: { userId }, order: { name: 'ASC' } });
  }

  async findOneForUser(userId: string, categoryId: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id: categoryId, userId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    const category = this.categories.create({ userId, name: dto.name });
    try {
      const saved = await this.categories.save(category);
      this.logger.log(`category created user=${userId} category=${saved.id} name=${saved.name}`);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Category with this name already exists');
      }
      throw err;
    }
  }

  async rename(userId: string, categoryId: string, dto: RenameCategoryDto): Promise<Category> {
    const category = await this.findOneForUser(userId, categoryId);
    category.name = dto.name;
    try {
      const saved = await this.categories.save(category);
      this.logger.log(`category renamed user=${userId} category=${categoryId} name=${saved.name}`);
      return saved;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Category with this name already exists');
      }
      throw err;
    }
  }

  async remove(userId: string, categoryId: string): Promise<void> {
    const category = await this.findOneForUser(userId, categoryId);
    await this.categories.remove(category);
    this.logger.log(`category deleted user=${userId} category=${categoryId}`);
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string } | undefined;
  return driver?.code === '23505';
}

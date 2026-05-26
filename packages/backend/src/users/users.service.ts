import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  emailConfirmationToken: string;
  emailConfirmationExpiresAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByConfirmationToken(token: string): Promise<User | null> {
    return this.users.findOne({ where: { emailConfirmationToken: token } });
  }

  create(input: CreateUserInput): Promise<User> {
    const user = this.users.create({
      email: input.email,
      passwordHash: input.passwordHash,
      emailConfirmationToken: input.emailConfirmationToken,
      emailConfirmationExpiresAt: input.emailConfirmationExpiresAt,
      emailConfirmedAt: null,
    });
    return this.users.save(user);
  }

  async confirmEmail(userId: string): Promise<void> {
    await this.users.update(
      { id: userId },
      {
        emailConfirmedAt: new Date(),
        emailConfirmationToken: null,
        emailConfirmationExpiresAt: null,
      },
    );
  }

  async regenerateConfirmationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await this.users.update(
      { id: userId },
      {
        emailConfirmationToken: token,
        emailConfirmationExpiresAt: expiresAt,
      },
    );
  }
}

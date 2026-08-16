import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { users, type NewUserRow, type UserRow } from '../../database/schema/index';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async findById(id: string): Promise<UserRow | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async create(data: NewUserRow): Promise<UserRow> {
    const [user] = await this.db.insert(users).values(data).returning();
    if (!user) {
      throw new Error('Falha ao criar usuário');
    }
    return user;
  }
}

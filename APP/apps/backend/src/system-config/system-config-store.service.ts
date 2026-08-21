import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemConfigStoreService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prismaService.systemConfig.findMany();
    const result: Record<string, string> = {};

    for (const row of rows) {
      result[row.key] = row.value;
    }

    return result;
  }

  async getValue(key: string): Promise<string | undefined> {
    const row = await this.prismaService.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });

    return row?.value;
  }

  async getValues(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.prismaService.systemConfig.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }

    return result;
  }

  async upsert(key: string, value: string): Promise<void> {
    await this.prismaService.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async upsertMany(values: Record<string, string | undefined>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }

      await this.upsert(key, value);
    }
  }
}

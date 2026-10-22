import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database: 'up' | 'down' = 'down';
    let dbLatencyMs: number | null = null;

    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
      database = 'up';
    } catch {
      database = 'down';
    }

    const body = {
      status: database === 'up' ? 'ok' : 'error',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: { status: database, latencyMs: dbLatencyMs },
    };

    if (database === 'down') {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}

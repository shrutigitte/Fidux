import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  async getHealth() {
    const timestamp = new Date().toISOString();

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp,
        environment: this.configService.get<string>('NODE_ENV') || 'development',
        database: 'down',
      });
    }

    return {
      status: 'ok',
      timestamp,
      environment: this.configService.get<string>('NODE_ENV') || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      database: 'ok',
    };
  }
}

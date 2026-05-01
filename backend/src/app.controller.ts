import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  constructor() {}

  @Get()
  getHello(): string {
    return 'expense tracker backend is running';
  }
}

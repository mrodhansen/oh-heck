import { Controller, Get } from '@nestjs/common';
import { RulesService } from './rules.service';

@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  getRules() {
    return this.rules.getRules();
  }
}

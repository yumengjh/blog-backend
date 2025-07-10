import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { Throttle } from './decorators/throttle-debounce.decorator';


@Controller('')
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello() {
    return '<h1>鱼梦江湖</h1><h2>鱼梦江湖</h2><h3>鱼梦江湖</h3><h4>鱼梦江湖</h4><h5>鱼梦江湖</h5><h6>鱼梦江湖</h6>';
  }
}

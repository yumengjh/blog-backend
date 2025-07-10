import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseQueryService } from './databaseOperation';
import { HttpExceptionFilter } from './filters/all-exceptions.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 全局配置，所有模块都可以使用
      envFilePath: '.env', // 指定 .env 文件路径
      cache: true, // 缓存环境变量
    }),
  ],
  controllers: [AppController],
  providers: [AppService, SupabaseQueryService, {
    provide: APP_FILTER,
    useClass: HttpExceptionFilter,
  }],
})
export class AppModule { }

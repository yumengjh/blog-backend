import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseQueryService } from './databaseOperation';
import { HttpExceptionFilter } from './filters/all-exceptions.filter';
import { APP_FILTER } from '@nestjs/core';
import { BookmarkModule } from './bookmark/bookmark.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    BookmarkModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SupabaseQueryService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    }
  ],
  // exports: [SupabaseQueryService]
})
export class AppModule { }

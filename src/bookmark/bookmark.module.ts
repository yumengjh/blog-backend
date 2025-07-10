import { Module } from '@nestjs/common';
import { BookmarkController } from './bookmark.controller';
import { BookmarkService } from './bookmark.service';
import { SupabaseQueryService } from '../databaseOperation';

@Module({
  controllers: [BookmarkController],
  providers: [BookmarkService, SupabaseQueryService],
  exports: [BookmarkService]
})
export class BookmarkModule {} 
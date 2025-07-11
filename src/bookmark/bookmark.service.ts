import { Injectable } from '@nestjs/common';
import { SupabaseQueryService } from '../databaseOperation';

@Injectable()
export class BookmarkService {
  constructor(private readonly supabaseQueryService: SupabaseQueryService) { }

  async getResourcesCategoriesList(enabledStatus?: boolean) {
    let sql = 'SELECT * FROM categories';
    if (enabledStatus !== undefined && enabledStatus !== null) {
      sql += ` WHERE enabled = ${enabledStatus}`;
    }
    sql += ' ORDER BY sort_order ASC';
    return await this.supabaseQueryService.executeSQL(sql);
  }

  async getResourcesList(categoryId: string, enabledStatus?: boolean) {
    let sql = `SELECT * FROM resources_${categoryId}`;
    if (enabledStatus !== undefined && enabledStatus !== null) {
      sql += ` WHERE enabled = ${enabledStatus}`;
    }
    sql += ' ORDER BY updated_at DESC';
    return await this.supabaseQueryService.executeSQL(sql);
  }
} 
import { Injectable } from '@nestjs/common';
import { SupabaseQueryService } from './databaseOperation';

@Injectable()
export class AppService {
  constructor(private readonly supabaseQueryService: SupabaseQueryService) { }

 


}

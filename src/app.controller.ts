import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { Throttle } from './decorators/throttle-debounce.decorator';


@Controller('bookmark')
export class AppController {
  constructor(private readonly appService: AppService) { }
  // 资源列表
  private resourcesCategoriesList = []


  @Get('resources-categories-list')
  @Throttle({
    wait: 2000,
    errorMessage: '获取资源分类列表操作太频繁，请稍后再试',
    errorStatus: HttpStatus.TOO_MANY_REQUESTS
  })
  async getResourcesCategoriesList(@Query('enabledStatus') enabledStatus?: boolean) {
    const res = await this.appService.getResourcesCategoriesList(enabledStatus);
    if (res.error) {
      throw new HttpException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: res.error.message,
        data: null
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    this.resourcesCategoriesList = res.data;
    return {
      statusCode: 200,
      message: 'success',
      data: this.resourcesCategoriesList
    }
  }

  @Get('resources-list')
  async getResourcesList(@Query('categoryId') categoryId: string, @Query('enabledStatus') enabledStatus?: boolean) {
    if (!categoryId) {
      throw new HttpException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'categoryId 不能为空',
        data: null
      }, HttpStatus.BAD_REQUEST);
    }
    const res = await this.appService.getResourcesList(categoryId, enabledStatus);
    if (res.error || res.data.length === 0) {
      throw new HttpException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: res.error ? res.error.message : '数据为空，请检查字段是否正确',
        data: null
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return {
      statusCode: 200,
      message: 'success',
      data: res.data
    }
  }


}

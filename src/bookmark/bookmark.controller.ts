import { Controller, Get, HttpException, HttpStatus, Query, UseGuards, Req } from '@nestjs/common';
import { BookmarkService } from './bookmark.service';
import { Throttle } from '../decorators/throttle-debounce.decorator';
import { DynamicAuthGuard } from '../guards/dynamic-auth.guard';
import { Request } from 'express';

@Controller('bookmark')
@UseGuards(DynamicAuthGuard)
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) { }
  // 资源列表
  private resourcesCategoriesList = []


  // resources
  // resources/:id
  @Get('resources-categories-list')
  @Throttle({
    wait: 3000,
    errorMessage: '获取资源分类列表操作太频繁，请稍后再试',
    errorStatus: HttpStatus.TOO_MANY_REQUESTS
  })
  async getResourcesCategoriesList(
    // 此参数用于 @Throttle 装饰器获取请求信息，用于 IP 限流
    @Req() req: Request,
    @Query('enabledStatus') enabledStatus?: boolean
  ) {
    const res = await this.bookmarkService.getResourcesCategoriesList(enabledStatus);
    if (res.data.length === 0) {
      throw new HttpException({
        statusCode: HttpStatus.NOT_FOUND,
        message: '数据为空，请检查字段是否正确',
        data: null
      }, HttpStatus.NOT_FOUND);
    }
    else if (res.error) {
      throw new HttpException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: res.error.message,
        data: null
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    this.resourcesCategoriesList = res.data;
    // return new Promise(resolve => {
    //   setTimeout(() => {
    //     resolve({
    //       statusCode: 200,
    //       message: 'success',
    //       data: this.resourcesCategoriesList
    //     })
    //   }, 1000);
    // });
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
    const res = await this.bookmarkService.getResourcesList(categoryId, enabledStatus);

    if (res.error || res.data.length === 0) {
      throw new HttpException({
        statusCode: res.error ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.NOT_FOUND,
        message: res.error ? res.error.message : '数据为空，请检查字段是否正确',
        data: null
      }, res.error ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.NOT_FOUND);
    }
    return {
      statusCode: 200,
      message: 'success',
      data: res.data
    }
  }
} 
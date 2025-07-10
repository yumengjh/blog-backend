import { HttpException, HttpStatus } from '@nestjs/common';

interface SupabaseResponse {
  data: any;
  error: {
    message: string;
    statusCode?: number;  // 添加状态码字段
  } | null;
}

interface DecoratorOptions {
  successMessage?: string;
  errorMessage?: string;
  defaultErrorStatus?: HttpStatus;
}

/**
 * 处理 Supabase 查询结果的装饰器
 * @param options 配置选项
 * - successMessage: 成功时的消息
 * - errorMessage: 错误时的默认消息
 * - defaultErrorStatus: 默认错误状态码
 */
export function HandleSupabaseQuery(options: DecoratorOptions = {}) {
  const {
    successMessage = '操作成功',
    errorMessage = '操作失败',
    defaultErrorStatus = HttpStatus.INTERNAL_SERVER_ERROR
  } = options;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        const result: SupabaseResponse = await originalMethod.apply(this, args);

        // 检查是否是 Promise
        if (result instanceof Promise) {
          const awaitedResult = await result;
          if (awaitedResult.error) {
            throw new HttpException(
              awaitedResult.error.message,
              awaitedResult.error.statusCode || defaultErrorStatus
            );
          }
          return {
            success: true,
            data: awaitedResult.data,
            message: successMessage
          };
        }

        // 处理直接返回的结果
        if (result.error) {
          throw new HttpException(
            result.error.message,
            result.error.statusCode || defaultErrorStatus
          );
        }

        return {
          success: true,
          data: result.data,
          message: successMessage
        };
      } catch (error) {
        // 如果是 HttpException，直接抛出
        if (error instanceof HttpException) {
          throw error;
        }
        
        // 其他错误使用默认状态码
        throw new HttpException(
          error.message || errorMessage,
          defaultErrorStatus
        );
      }
    };

    return descriptor;
  };
} 
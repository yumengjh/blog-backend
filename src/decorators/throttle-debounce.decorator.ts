import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface ThrottleOptions {
  /**
   * 节流时间（毫秒）
   */
  wait?: number;
  /**
   * 自定义错误消息
   */
  errorMessage?: string;
  /**
   * 自定义错误状态码
   */
  errorStatus?: HttpStatus;
}

interface DebounceOptions extends ThrottleOptions {
  /**
   * 是否在开始时执行
   */
  leading?: boolean;
  /**
   * 是否在结束时执行
   */
  trailing?: boolean;
}

// 存储每个 IP 最后执行时间的 Map
// key 格式: `${ip}-${methodId}`
const lastExecutionTimeMap = new Map<string, number>();
// 存储定时器的 Map
const debounceTimerMap = new Map<string, NodeJS.Timeout>();

/**
 * 获取请求的真实 IP 地址
 * @param request Express Request 对象
 */
function getClientIP(request: Request): string {
  // 如果在代理后面，可能需要从 X-Forwarded-For 获取真实 IP
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    // 取第一个 IP（最原始的客户端 IP）
    return Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0].trim();
  }
  // 如果没有代理，直接获取 IP
  return request.ip || request.connection.remoteAddress || 'unknown';
}

/**
 * 节流装饰器
 * 限制同一 IP 在指定时间内只能执行一次
 * @param options 配置选项
 */
export function Throttle(options: ThrottleOptions = {}) {
  const {
    wait = 1000,
    errorMessage = '请求过于频繁，请稍后再试',
    errorStatus = HttpStatus.TOO_MANY_REQUESTS
  } = options;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodId = `${target.constructor.name}-${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // 获取请求对象
      const request = args[0];
      if (!request || !request.ip) {
        throw new Error('无法获取请求对象，请确保装饰器用于控制器方法');
      }

      const clientIP = getClientIP(request);
      const ipMethodKey = `${clientIP}-${methodId}`;
      const now = Date.now();
      const lastTime = lastExecutionTimeMap.get(ipMethodKey) || 0;

      if (now - lastTime < wait) {
        throw new HttpException({
          statusCode: errorStatus,
          message: errorMessage,
          timestamp: now,
          path: request.url,
          ip: clientIP,
          waitTime: Math.ceil((wait - (now - lastTime)) / 1000) // 剩余等待时间（秒）
        }, errorStatus);
      }

      lastExecutionTimeMap.set(ipMethodKey, now);

      // 设置自动清理，避免内存泄漏
      setTimeout(() => {
        lastExecutionTimeMap.delete(ipMethodKey);
      }, wait * 2); // 在限制时间的两倍后清理

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 防抖装饰器
 * 将同一 IP 的多次执行合并为一次执行
 * @param options 配置选项
 */
export function Debounce(options: DebounceOptions = {}) {
  const {
    wait = 1000,
    leading = false,
    trailing = true,
    errorMessage = '请求正在处理中，请稍后再试',
    errorStatus = HttpStatus.TOO_MANY_REQUESTS
  } = options;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodId = `${target.constructor.name}-${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // 获取请求对象
      const request = args[0];
      if (!request || !request.ip) {
        throw new Error('无法获取请求对象，请确保装饰器用于控制器方法');
      }

      const clientIP = getClientIP(request);
      const ipMethodKey = `${clientIP}-${methodId}`;

      return new Promise((resolve, reject) => {
        const shouldExecuteLeading = leading && !debounceTimerMap.has(ipMethodKey);

        // 清除现有定时器
        const existingTimer = debounceTimerMap.get(ipMethodKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
          if (!trailing) {
            reject(new HttpException({
              statusCode: errorStatus,
              message: errorMessage,
              timestamp: Date.now(),
              path: request.url,
              ip: clientIP
            }, errorStatus));
            return;
          }
        }

        // leading 执行
        if (shouldExecuteLeading) {
          resolve(originalMethod.apply(this, args));
          debounceTimerMap.set(ipMethodKey, setTimeout(() => {
            debounceTimerMap.delete(ipMethodKey);
          }, wait));
          return;
        }

        // trailing 执行
        if (trailing) {
          debounceTimerMap.set(ipMethodKey, setTimeout(async () => {
            debounceTimerMap.delete(ipMethodKey);
            try {
              const result = await originalMethod.apply(this, args);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }, wait));
        } else {
          reject(new HttpException({
            statusCode: errorStatus,
            message: errorMessage,
            timestamp: Date.now(),
            path: request.url,
            ip: clientIP
          }, errorStatus));
        }
      });
    };

    return descriptor;
  };
}

/**
 * 清除特定 IP 和方法的防抖节流状态
 * @param ip 客户端 IP
 * @param target 目标类
 * @param propertyKey 方法名
 */
export function clearIPThrottleDebounceState(ip: string, target: any, propertyKey: string) {
  const methodId = `${target.constructor.name}-${propertyKey}`;
  const ipMethodKey = `${ip}-${methodId}`;
  lastExecutionTimeMap.delete(ipMethodKey);
  const timer = debounceTimerMap.get(ipMethodKey);
  if (timer) {
    clearTimeout(timer);
    debounceTimerMap.delete(ipMethodKey);
  }
}

/**
 * 清除所有防抖节流状态
 */
export function clearAllThrottleDebounceState() {
  lastExecutionTimeMap.clear();
  debounceTimerMap.forEach(timer => clearTimeout(timer));
  debounceTimerMap.clear();
} 
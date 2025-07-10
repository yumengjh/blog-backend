import { HttpException, HttpStatus } from '@nestjs/common';

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

// 存储最后执行时间的 Map
const lastExecutionTimeMap = new Map<string, number>();
// 存储定时器的 Map
const debounceTimerMap = new Map<string, NodeJS.Timeout>();

/**
 * 节流装饰器
 * 限制方法在指定时间内只能执行一次
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
      const now = Date.now();
      const lastTime = lastExecutionTimeMap.get(methodId) || 0;

      if (now - lastTime < wait) {
        throw new HttpException(errorMessage, errorStatus);
      }

      lastExecutionTimeMap.set(methodId, now);
      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * 防抖装饰器
 * 将多次执行合并为一次执行
 * @param options 配置选项
 */
export function Debounce(options: DebounceOptions = {}) {
  const {
    wait = 1000,    // 等待时间
    leading = false,    // 是否在开始时执行
    trailing = true,    // 是否在结束时执行
    errorMessage = '请求正在处理中，请稍后再试',    // 错误消息
    errorStatus = HttpStatus.TOO_MANY_REQUESTS    // 错误状态码
  } = options;

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const methodId = `${target.constructor.name}-${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return new Promise((resolve, reject) => {
        const shouldExecuteLeading = leading && !debounceTimerMap.has(methodId);

        // 清除现有定时器
        const existingTimer = debounceTimerMap.get(methodId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          if (!trailing) {
            reject(new HttpException(errorMessage, errorStatus));
            return;
          }
        }

        // leading 执行
        if (shouldExecuteLeading) {
          resolve(originalMethod.apply(this, args));
          debounceTimerMap.set(methodId, setTimeout(() => {
            debounceTimerMap.delete(methodId);
          }, wait));
          return;
        }

        // trailing 执行
        if (trailing) {
          debounceTimerMap.set(methodId, setTimeout(async () => {
            debounceTimerMap.delete(methodId);
            try {
              const result = await originalMethod.apply(this, args);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }, wait));
        } else {
          reject(new HttpException(errorMessage, errorStatus));
        }
      });
    };

    return descriptor;
  };
}

/**
 * 清除特定方法的防抖节流状态
 * @param target 目标类
 * @param propertyKey 方法名
 */
export function clearThrottleDebounceState(target: any, propertyKey: string) {
  const methodId = `${target.constructor.name}-${propertyKey}`;
  lastExecutionTimeMap.delete(methodId);
  const timer = debounceTimerMap.get(methodId);
  if (timer) {
    clearTimeout(timer);
    debounceTimerMap.delete(methodId);
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
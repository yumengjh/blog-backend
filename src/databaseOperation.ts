import { Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { Parser } from 'node-sql-parser';

@Injectable()
export class SupabaseQueryService {
  private supabase;
  private parser;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration is missing in environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.parser = new Parser();
  }

  private handleError(message: string, statusCode?: number) {
    return { 
      data: null, 
      error: { 
        message: message || 'Failed to execute query',
        statusCode
      } 
    };
  }

  /**
   * 执行 MySQL 风格的 SQL 查询，转换为 Supabase API 调用
   * @param sqlQuery MySQL 风格的 SQL 语句
   */
  async executeSQL<T>(sqlQuery: string) {
    try {
      // 预处理 SQL，处理可能的解析问题
      const processedSQL = this.preprocessSQL(sqlQuery);
      
      // 检查是否为简单的 DELETE 语句
      if (this.isSimpleDelete(processedSQL)) {
        return await this.handleSimpleDelete<T>(processedSQL);
      }
      
      // 检查是否为简单的 UPDATE 语句
      if (this.isSimpleUpdate(processedSQL)) {
        return await this.handleSimpleUpdate<T>(processedSQL);
      }
      
      // 检查是否为简单的 INSERT 语句
      if (this.isSimpleInsert(processedSQL)) {
        return await this.handleSimpleInsert<T>(processedSQL);
      }
      
      // 检查是否为简单的 SELECT 语句
      if (this.isSimpleSelect(processedSQL)) {
        return await this.handleSimpleSelect<T>(processedSQL);
      }
      
      const ast = this.parser.astify(processedSQL, { database: 'mysql' });
      
      if (!ast || typeof ast !== 'object') {
        throw new Error('Failed to parse SQL query');
      }

      const { type } = ast;

      switch (type) {
        case 'select':
          return await this.handleSelect<T>(ast);
        case 'insert':
          return await this.handleInsert<T>(ast);
        case 'update':
          return await this.handleUpdate<T>(ast);
        case 'delete':
          return await this.handleDelete(ast);
        default:
          throw new Error(`Unsupported query type: ${type}`);
      }
    } catch (error) {
      // 如果解析失败且是 SELECT 查询，尝试简单的模式匹配作为后备
      if (error.message.includes('Expected') && sqlQuery.toLowerCase().includes('select')) {
        console.log('Using fallback simple SELECT parser');
        return await this.handleSimpleSelect<T>(sqlQuery);
      }
      
      // 如果解析失败且是 INSERT 查询，尝试简单的模式匹配作为后备
      if (error.message.includes('Expected') && sqlQuery.toLowerCase().includes('insert')) {
        console.log('Using fallback simple INSERT parser');
        return await this.handleSimpleInsert<T>(sqlQuery);
      }

      // 如果解析失败且是 UPDATE 查询，尝试简单的模式匹配作为后备
      if (error.message.includes('Expected') && sqlQuery.toLowerCase().includes('update')) {
        console.log('Using fallback simple UPDATE parser');
        return await this.handleSimpleUpdate<T>(sqlQuery);
      }

      // 如果解析失败且是 DELETE 查询，尝试简单的模式匹配作为后备
      if (error.message.includes('Expected') && sqlQuery.toLowerCase().includes('delete')) {
        console.log('Using fallback simple DELETE parser');
        return await this.handleSimpleDelete<T>(sqlQuery);
      }
      
      console.error('SQL Parse/Execute Error:', error.message);
      return this.handleError(error.message);
    }
  }

  /**
   * 检查是否为简单的 DELETE 语句
   */
  private isSimpleDelete(sql: string): boolean {
    const deleteRegex = /^DELETE\s+FROM\s+\w+(?:\s+WHERE\s+.+)?$/i;
    return deleteRegex.test(sql.trim());
  }

  /**
   * 检查是否为简单的 UPDATE 语句
   */
  private isSimpleUpdate(sql: string): boolean {
    const updateRegex = /^UPDATE\s+\w+\s+SET\s+\w+\s*=\s*('[^']*'|"[^"]*"|\d+|\w+)\s*(WHERE\s+.+)?$/i;
    return updateRegex.test(sql.trim());
  }

  /**
   * 检查是否为简单的 INSERT 语句
   */
  private isSimpleInsert(sql: string): boolean {
    const insertRegex = /^INSERT\s+INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\([^)]+\)$/i;
    return insertRegex.test(sql.trim());
  }

  /**
   * 检查是否为简单的 SELECT 查询
   */
  private isSimpleSelect(sql: string): boolean {
    // 检查是否包含逗号分隔的字段列表
    const hasCommaFields = /SELECT\s+[^*][^,]*,/.test(sql);
    // 检查是否为基本的 SELECT 语句格式
    const isBasicSelect = /^SELECT\s+.*\s+FROM\s+\w+(\s+ORDER\s+BY\s+\w+(\s+(ASC|DESC))?)?$/i.test(sql.trim());
    
    return hasCommaFields || isBasicSelect;
  }

  /**
   * 预处理 SQL 语句
   */
  private preprocessSQL(sql: string): string {
    // 移除多余的空格
    return sql.replace(/\s+/g, ' ').trim();
  }

  /**
   * 处理 SELECT 查询
   */
  private async handleSelect<T>(ast: any) {
    const { from, columns, where, orderby, limit } = ast;
    
    if (!from || !from[0] || !from[0].table) {
      throw new Error('Invalid table name in query');
    }

    const tableName = from[0].table;
    let query = this.supabase.from(tableName);

    // 处理 SELECT 字段
    if (columns === '*') {
      query = query.select('*');
    } else if (Array.isArray(columns)) {
      const selectFields = columns.map(col => {
        if (col.expr && col.expr.column) {
          return col.as ? `${col.expr.column}:${col.as}` : col.expr.column;
        }
        return col.expr.column || '*';
      }).join(',');
      query = query.select(selectFields);
    }

    // 处理 WHERE 条件
    if (where) {
      query = this.applyWhereConditions(query, where);
    }

    // 处理 ORDER BY
    if (orderby && Array.isArray(orderby)) {
      orderby.forEach(order => {
        const column = order.expr.column;
        const ascending = order.type === 'ASC' || !order.type; // 默认升序
        query = query.order(column, { ascending });
      });
    }

    // 处理 LIMIT
    if (limit && limit.value) {
      const limitValue = parseInt(limit.value[0].value);
      query = query.limit(limitValue);
    }

    const { data, error } = await query;
    return { data, error };
  }

  /**
   * 处理 INSERT 查询
   */
  private async handleInsert<T>(ast: any) {
    const { table, columns, values } = ast;
    
    if (!table || !table[0] || !table[0].table) {
      throw new Error('Invalid table name in INSERT query');
    }

    const tableName = table[0].table;
    
    if (!columns || !values || !values[0]) {
      throw new Error('Invalid INSERT statement');
    }

    // 构建插入数据
    const insertData = {};
    columns.forEach((col, index) => {
      const value = values[0].value[index];
      insertData[col] = this.parseValue(value);
    });

    const { data, error } = await this.supabase
      .from(tableName)
      .insert(insertData)
      .select();

    return { data, error };
  }

  /**
   * 处理 UPDATE 查询
   */
  private async handleUpdate<T>(ast: any) {
    const { table, set, where } = ast;
    
    if (!table || !table[0] || !table[0].table) {
      throw new Error('Invalid table name in UPDATE query');
    }

    const tableName = table[0].table;
    
    if (!set || !Array.isArray(set)) {
      throw new Error('Invalid UPDATE statement');
    }

    // 构建更新数据
    const updateData = {};
    set.forEach(item => {
      updateData[item.column] = this.parseValue(item.value);
    });

    let query = this.supabase.from(tableName).update(updateData);

    // 处理 WHERE 条件
    if (where) {
      query = this.applyWhereConditions(query, where);
    }

    const { data, error } = await query.select();
    return { data, error };
  }

  /**
   * 处理 DELETE 查询
   */
  private async handleDelete(ast: any) {
    const { from, where } = ast;
    
    if (!from || !from[0] || !from[0].table) {
      throw new Error('Invalid table name in DELETE query');
    }

    const tableName = from[0].table;
    let query = this.supabase.from(tableName).delete();

    // 处理 WHERE 条件
    if (where) {
      query = this.applyWhereConditions(query, where);
    }

    const { data, error } = await query;
    return { data, error };
  }

  /**
   * 应用 WHERE 条件
   */
  private applyWhereConditions(query: any, where: any): any {
    if (where.type === 'binary_expr') {
      const { operator, left, right } = where;
      
      if (operator === 'AND') {
        query = this.applyWhereConditions(query, left);
        return this.applyWhereConditions(query, right);
      } else if (operator === 'OR') {
        // 对于 OR 条件，需要使用 Supabase 的 or() 方法
        const leftCondition = this.buildConditionString(left);
        const rightCondition = this.buildConditionString(right);
        return query.or(`${leftCondition},${rightCondition}`);
      } else {
        // 处理单个比较条件
        const column = left.column;
        const value = this.parseValue(right);

        switch (operator) {
          case '=':
            return query.eq(column, value);
          case '!=':
          case '<>':
            return query.neq(column, value);
          case '>':
            return query.gt(column, value);
          case '>=':
            return query.gte(column, value);
          case '<':
            return query.lt(column, value);
          case '<=':
            return query.lte(column, value);
          case 'LIKE':
            return query.like(column, value);
          case 'ILIKE':
            return query.ilike(column, value);
          case 'IN':
            return query.in(column, Array.isArray(value) ? value : [value]);
          case 'IS':
            return query.is(column, value);
          default:
            throw new Error(`Unsupported operator: ${operator}`);
        }
      }
    }
    
    return query;
  }

  /**
   * 构建条件字符串（用于 OR 查询）
   */
  private buildConditionString(condition: any): string {
    if (condition.type === 'binary_expr') {
      const { operator, left, right } = condition;
      const column = left.column;
      const value = this.parseValue(right);

      switch (operator) {
        case '=':
          return `${column}.eq.${value}`;
        case '!=':
        case '<>':
          return `${column}.neq.${value}`;
        case '>':
          return `${column}.gt.${value}`;
        case '>=':
          return `${column}.gte.${value}`;
        case '<':
          return `${column}.lt.${value}`;
        case '<=':
          return `${column}.lte.${value}`;
        case 'LIKE':
          return `${column}.like.${value}`;
        case 'ILIKE':
          return `${column}.ilike.${value}`;
        case 'IN':
          const inValue = Array.isArray(value) ? value.join(',') : value;
          return `${column}.in.(${inValue})`;
        case 'IS':
          return `${column}.is.${value === null ? 'null' : value}`;
        default:
          throw new Error(`Unsupported operator in OR condition: ${operator}`);
      }
    }
    
    throw new Error('Invalid condition format');
  }

  /**
   * 解析值
   */
  private parseValue(value: any): any {
    if (!value) return null;
    
    switch (value.type) {
      case 'string':
        return value.value;
      case 'number':
        return value.value;
      case 'bool':
        return value.value;
      case 'null':
        return null;
      case 'expr_list':
        return value.value.map(v => this.parseValue(v));
      default:
        return value.value || value;
    }
  }

  /**
   * 处理简单的 INSERT 语句（作为后备方案）
   */
  private async handleSimpleInsert<T>(sqlQuery: string) {
    try {
      // 使用正则表达式解析简单的 INSERT 语句
      // 匹配：INSERT INTO table_name (col1, col2, ...) VALUES (val1, val2, ...)
      const insertMatch = sqlQuery.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      
      if (!insertMatch) {
        throw new Error('Invalid INSERT statement format');
      }

      const [, tableName, columnStr, valueStr] = insertMatch;
      
      // 解析列名和值
      const columns = columnStr.split(',').map(col => col.trim());
      const values = this.parseInsertValues(valueStr);

      if (columns.length !== values.length) {
        throw new Error('Column count does not match value count');
      }

      // 构建插入数据对象
      const insertData = {};
      columns.forEach((col, index) => {
        insertData[col] = values[index];
      });

      const { data, error } = await this.supabase
        .from(tableName)
        .insert(insertData)
        .select();

      return { data, error };
    } catch (error) {
      return this.handleError(error.message || 'Failed to execute simple insert', 400);
    }
  }

  /**
   * 解析 INSERT 语句中的值
   */
  private parseInsertValues(valueStr: string): (string | number | boolean | null)[] {
    const values: (string | number | boolean | null)[] = [];
    let currentValue = '';
    let inQuote = false;
    let quoteChar = '';

    // 遍历字符串解析值
    for (let i = 0; i < valueStr.length; i++) {
      const char = valueStr[i];
      
      if ((char === '"' || char === "'") && (!inQuote || quoteChar === char)) {
        if (!inQuote) {
          quoteChar = char;
        }
        inQuote = !inQuote;
        continue;
      }

      if (char === ',' && !inQuote) {
        values.push(this.parseInsertValue(currentValue.trim()));
        currentValue = '';
        continue;
      }

      currentValue += char;
    }

    // 添加最后一个值
    if (currentValue.trim()) {
      values.push(this.parseInsertValue(currentValue.trim()));
    }

    return values;
  }

  /**
   * 解析单个 INSERT 值
   */
  private parseInsertValue(value: string): string | number | boolean | null {
    // 移除首尾引号
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 处理数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 处理布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // 处理 NULL
    if (value.toLowerCase() === 'null') return null;

    // 如果没有引号但是看起来是字符串，直接返回
    return value;
  }

  /**
   * 处理简单的 UPDATE 语句（作为后备方案）
   */
  private async handleSimpleUpdate<T>(sqlQuery: string) {
    try {
      // 使用正则表达式解析简单的 UPDATE 语句
      // 匹配：UPDATE table_name SET column = value WHERE condition
      const updateMatch = sqlQuery.match(/UPDATE\s+(\w+)\s+SET\s+(\w+)\s*=\s*('[^']*'|"[^"]*"|\d+|\w+)(?:\s+WHERE\s+(.+))?/i);
      
      if (!updateMatch) {
        throw new Error('Invalid UPDATE statement format');
      }

      const [, tableName, column, rawValue, whereClause] = updateMatch;
      
      // 解析值
      const value = this.parseUpdateValue(rawValue);

      // 构建更新数据对象
      const updateData = {
        [column]: value
      };

      let query = this.supabase.from(tableName).update(updateData);

      // 处理 WHERE 条件
      if (whereClause) {
        query = this.parseSimpleWhere(query, whereClause.trim());
      }

      const { data, error } = await query.select();
      return { data, error };
    } catch (error) {
      return this.handleError(error.message || 'Failed to execute simple update', 400);
    }
  }

  /**
   * 解析 UPDATE 语句中的值
   */
  private parseUpdateValue(value: string): string | number | boolean | null {
    // 移除首尾引号
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }

    // 处理数字
    if (/^-?\d+$/.test(value)) {
      return parseInt(value);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 处理布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // 处理 NULL
    if (value.toLowerCase() === 'null') return null;

    // 如果没有引号但是看起来是字符串，直接返回
    return value;
  }

  /**
   * 处理简单的 DELETE 语句（作为后备方案）
   */
  private async handleSimpleDelete<T>(sqlQuery: string) {
    try {
      // 使用正则表达式解析简单的 DELETE 语句
      // 匹配：DELETE FROM table_name WHERE condition
      const deleteMatch = sqlQuery.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
      
      if (!deleteMatch) {
        throw new Error('Invalid DELETE statement format');
      }

      const [, tableName, whereClause] = deleteMatch;
      
      let query = this.supabase.from(tableName).delete();

      // 处理 WHERE 条件
      if (whereClause) {
        query = this.parseSimpleWhere(query, whereClause.trim());
      }

      const { data, error } = await query;
      return { data, error };
    } catch (error) {
      return this.handleError(error.message || 'Failed to execute simple delete', 400);
    }
  }

  /**
   * 简单的 SELECT 查询处理（作为后备方案）
   */
  private async handleSimpleSelect<T>(sqlQuery: string) {
    try {
      // 使用正则表达式解析简单的 SELECT 语句
      const selectMatch = sqlQuery.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?$/i);
      
      if (!selectMatch) {
        throw new Error('Invalid SELECT statement format');
      }

      const [, fields, tableName, whereClause, orderColumn, orderDirection] = selectMatch;
      let query = this.supabase.from(tableName);

      // 处理字段选择
      if (fields.trim() === '*') {
        query = query.select('*');
      } else {
        // 清理字段名，移除空格
        const cleanFields = fields.split(',').map(f => f.trim()).join(',');
        query = query.select(cleanFields);
      }

      // 处理简单的 WHERE 条件
      if (whereClause) {
        query = this.parseSimpleWhere(query, whereClause.trim());
      }

      // 处理排序
      if (orderColumn) {
        const ascending = !orderDirection || orderDirection.toUpperCase() === 'ASC';
        query = query.order(orderColumn, { ascending });
      }

      const { data, error } = await query;
      return { data, error };
    } catch (error) {
      return this.handleError(error.message || 'Failed to execute simple query', 400);
    }
  }

  /**
   * 解析简单的 WHERE 条件
   */
  private parseSimpleWhere(query: any, whereClause: string): any {
    // 1. 匹配带引号的字符串条件: column = 'value' 或 column = "value"
    const quotedCondition = whereClause.match(/(\w+)\s*=\s*(['"])(.*?)\2/);
    if (quotedCondition) {
      const [, column, quote, value] = quotedCondition;
      return query.eq(column, value);
    }
    
    // 2. 匹配数字条件: column = 123
    const numberCondition = whereClause.match(/(\w+)\s*=\s*(\d+)/);
    if (numberCondition) {
      const [, column, value] = numberCondition;
      return query.eq(column, parseInt(value));
    }
    
    // 3. 匹配不带引号的字符串条件: column = value (没有空格、特殊字符的简单值)
    const unquotedCondition = whereClause.match(/(\w+)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (unquotedCondition) {
      const [, column, value] = unquotedCondition;
      return query.eq(column, value);
    }
    
    // 4. 匹配其他比较操作符（带引号）
    const quotedComparisonMatch = whereClause.match(/(\w+)\s*(!=|<>|>|>=|<|<=)\s*(['"])(.*?)\3/);
    if (quotedComparisonMatch) {
      const [, column, operator, quote, value] = quotedComparisonMatch;
      return this.applyOperator(query, column, operator, value);
    }
    
    // 5. 匹配其他比较操作符（不带引号）
    const unquotedComparisonMatch = whereClause.match(/(\w+)\s*(!=|<>|>|>=|<|<=)\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)/);
    if (unquotedComparisonMatch) {
      const [, column, operator, value] = unquotedComparisonMatch;
      // 判断是数字还是字符串
      const finalValue = /^\d+$/.test(value) ? parseInt(value) : value;
      return this.applyOperator(query, column, operator, finalValue);
    }
    
    console.log(`Unable to parse WHERE clause: ${whereClause}`);
    // 如果无法解析，返回原查询
    return query;
  }

  /**
   * 应用操作符
   */
  private applyOperator(query: any, column: string, operator: string, value: any): any {
    switch (operator) {
      case '=':
        return query.eq(column, value);
      case '!=':
      case '<>':
        return query.neq(column, value);
      case '>':
        return query.gt(column, value);
      case '>=':
        return query.gte(column, value);
      case '<':
        return query.lt(column, value);
      case '<=':
        return query.lte(column, value);
      default:
        return query;
    }
  }

  /**
   * 专门的获取配置方法（保持向后兼容）
   */
  async getAppConfig() {
    return await this.executeSQL('SELECT * FROM app_config ORDER BY id ASC');
  }
}

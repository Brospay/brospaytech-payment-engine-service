import { SortColumns } from '../enums/sort-columns.enum';
import { SortDirection } from '../enums/sort-direction.enum';

/**
 * Valid sort field options
 */
const VALID_SORT_FIELDS = [
  'amount',
  'createdAt',
  'created_at',
  'status',
  'transactionId',
  'merchantId',
];

/**
 * Valid sort order options
 */
const VALID_SORT_ORDERS = ['asc', 'desc'];

/**
 * Extract and normalize a field value from gRPC data (handles both camelCase and snake_case)
 */
export function extractGrpcField(
  data: any,
  snakeCaseKey: string,
  camelCaseKey: string,
): string | undefined {
  const snakeCaseValue = data[snakeCaseKey];
  const camelCaseValue = data[camelCaseKey];

  if (snakeCaseValue !== undefined && snakeCaseValue !== null && snakeCaseValue !== '') {
    return String(snakeCaseValue).trim();
  }

  if (camelCaseValue !== undefined && camelCaseValue !== null && camelCaseValue !== '') {
    return String(camelCaseValue).trim();
  }

  return undefined;
}

/**
 * Determines sort parameters from raw values with validation
 * Handles cases where sortBy and sortOrder might be swapped
 */
function determineSortParams(
  rawSortBy?: string,
  rawSortOrder?: string,
  isSortByField?: (v: string) => boolean,
  isSortOrder?: (v: string) => boolean,
): { sortBy?: string; sortOrder: 'asc' | 'desc' } {
  let sortBy: string | undefined;
  let sortOrder: 'asc' | 'desc' = 'desc';

  const toOrder = (v: string): 'asc' | 'desc' => v.toLowerCase() as 'asc' | 'desc';

  if (rawSortBy && isSortOrder(rawSortBy)) {
    if (rawSortOrder && isSortByField(rawSortOrder)) {
      sortBy = rawSortOrder;
      sortOrder = toOrder(rawSortBy);
    } else {
      sortBy = undefined;
      sortOrder = rawSortOrder && isSortOrder(rawSortOrder)
        ? toOrder(rawSortOrder)
        : toOrder(rawSortBy);
    }
  } 
  
  else if (rawSortBy && isSortByField(rawSortBy)) {
    sortBy = rawSortBy;
    if (rawSortOrder && isSortOrder(rawSortOrder)) {
      sortOrder = toOrder(rawSortOrder);
    } else if (rawSortOrder && isSortByField(rawSortOrder)) {
      sortBy = rawSortOrder;
      sortOrder = 'desc';
    }
  } 
  
  else {
    if (rawSortOrder && isSortByField(rawSortOrder)) {
      sortBy = rawSortOrder;
      sortOrder = 'desc';
    } else if (rawSortOrder && isSortOrder(rawSortOrder)) {
      sortOrder = toOrder(rawSortOrder);
    }
  }

  return { sortBy, sortOrder };
}

/**
 * Extract and normalize sortBy and sortOrder from gRPC data with validation
 * Handles cases where sortBy and sortOrder might be swapped
 */
export function extractAndValidateSortParams(data: any): {
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
} {
  const rawSortBy = extractGrpcField(data, 'sort_by', 'sortBy');
  const rawSortOrder = extractGrpcField(data, 'sort_order', 'sortOrder');

  const isSortByField = (value: string) => VALID_SORT_FIELDS.includes(value);
  const isSortOrder = (value: string) => VALID_SORT_ORDERS.includes(value.toLowerCase());

  return determineSortParams(rawSortBy, rawSortOrder, isSortByField, isSortOrder);
}

/**
 * Extract and normalize a simple string field from gRPC data
 */
export function extractStringField(
  data: any,
  snakeCaseKey: string,
  camelCaseKey: string,
): string | undefined {
  const value = extractGrpcField(data, snakeCaseKey, camelCaseKey);
  return value && value !== '' ? value : undefined;
}


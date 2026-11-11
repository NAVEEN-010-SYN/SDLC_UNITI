import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

export type PageRequest = z.infer<typeof PaginationQuery>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function toLimitOffset(req: PageRequest): { limit: number; offset: number } {
  return { limit: req.pageSize, offset: (req.page - 1) * req.pageSize };
}

export function pageOf<T>(items: T[], req: PageRequest, total: number): Page<T> {
  return { items, page: req.page, pageSize: req.pageSize, total };
}

export function mapPage<T, U>(page: Page<T>, fn: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(fn) };
}

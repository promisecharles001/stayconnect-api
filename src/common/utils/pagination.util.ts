export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export class PaginationUtil {
  static readonly DEFAULT_PAGE = 1;
  static readonly DEFAULT_LIMIT = 10;
  static readonly MAX_LIMIT = 100;

  static normalizeOptions(options: PaginationOptions): Required<PaginationOptions> {
    const page = Math.max(1, options.page || this.DEFAULT_PAGE);
    const limit = Math.min(
      this.MAX_LIMIT,
      Math.max(1, options.limit || this.DEFAULT_LIMIT),
    );

    return { page, limit };
  }

  static calculateSkip(options: PaginationOptions): number {
    const { page, limit } = this.normalizeOptions(options);
    return (page - 1) * limit;
  }

  static createMeta(total: number, options: PaginationOptions): PaginationMeta {
    const { page, limit } = this.normalizeOptions(options);
    const totalPages = Math.ceil(total / limit);

    return {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  static createResult<T>(data: T[], total: number, options: PaginationOptions): PaginatedResult<T> {
    return {
      data,
      meta: this.createMeta(total, options),
    };
  }
}

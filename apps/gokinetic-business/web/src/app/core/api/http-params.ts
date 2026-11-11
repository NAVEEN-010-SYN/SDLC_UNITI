import { HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type QueryValue = string | number | boolean | null | undefined;

/** Builds query params, dropping empty values so filters left blank are not sent as "". */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query) as Array<[string, QueryValue]>) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}

export const api = (path: string): string => `${environment.apiBaseUrl}${path}`;

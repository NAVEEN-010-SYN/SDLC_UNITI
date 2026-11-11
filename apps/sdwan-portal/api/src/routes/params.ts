import { z } from 'zod';

/** Path identifiers are opaque but bounded and restricted to the characters our id formats use. */
export const idParam = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/, 'invalid identifier');

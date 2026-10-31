import { createParser } from "nuqs";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseAsDay = createParser({
  parse: (value: string) => (DAY_PATTERN.test(value) ? value : null),
  serialize: (value: string) => value,
});

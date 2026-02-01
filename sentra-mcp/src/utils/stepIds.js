import { ulid } from 'ulid';

export function newStepId(prefix = 's_') {
  return `${String(prefix || '')}${ulid()}`;
}

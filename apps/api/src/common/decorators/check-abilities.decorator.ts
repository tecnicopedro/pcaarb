import { SetMetadata } from '@nestjs/common';
import type { Action, Subject } from '../casl/ability.factory';

export interface AbilityRequirement {
  action: Action;
  subject: Subject;
}

export const CHECK_ABILITIES_KEY = 'checkAbilities';

export const CheckAbilities = (...requirements: AbilityRequirement[]) =>
  SetMetadata(CHECK_ABILITIES_KEY, requirements);

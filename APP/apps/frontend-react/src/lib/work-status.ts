import {
  compareWorkStatusPriority,
  getWorkStatusNames,
  getWorkStatusPriority,
  normalizeGroupWorkStatus,
  resolveWorkStatusTextTone,
  resolveWorkStatusTone,
  WORK_STATUS_PRIORITY_ORDER,
  WORK_STATUS_VALUES,
  type WorkStatusDef,
} from '@sekerchat/shared';
import type { WorkStatusValue } from '@sekerchat/shared';

export {
  compareWorkStatusPriority,
  getWorkStatusNames,
  getWorkStatusPriority,
  normalizeGroupWorkStatus,
  resolveWorkStatusTextTone,
  resolveWorkStatusTone,
  WORK_STATUS_PRIORITY_ORDER,
  WORK_STATUS_VALUES,
};
export { WORK_STATUS_VALUES as DISPLAY_GROUP_WORK_STATUSES };
export type { WorkStatusValue as DisplayGroupWorkStatus } from '@sekerchat/shared';
export type { WorkStatusDef } from '@sekerchat/shared';

export type { WorkStatusValue } from '@sekerchat/shared';

export function getWorkStatusTone(value: string | null | undefined, defs?: WorkStatusDef[]): string {
  return resolveWorkStatusTone(normalizeGroupWorkStatus(value, defs), defs);
}

export function getWorkStatusTextTone(value: string | null | undefined, defs?: WorkStatusDef[]): string {
  return resolveWorkStatusTextTone(normalizeGroupWorkStatus(value, defs), defs);
}

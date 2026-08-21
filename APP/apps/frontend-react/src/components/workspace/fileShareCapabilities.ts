import type { GroupResponse } from '../../lib/groups-api';

type ShareGroup = Pick<GroupResponse, 'archivedAt'>;

export function canManageAttachmentShare(group: ShareGroup | null | undefined): boolean {
  return Boolean(group && !group.archivedAt);
}

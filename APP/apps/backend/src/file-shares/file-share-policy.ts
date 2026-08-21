type FileSharePolicyInput = {
  membershipRole: string | null;
  archivedAt: Date | null;
};

export function canManageFileShare(input: FileSharePolicyInput): boolean {
  return !input.archivedAt && input.membershipRole !== null;
}

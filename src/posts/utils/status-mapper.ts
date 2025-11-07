import { PostStatus } from '../../common/interfaces';
import { PlatformPostStatus } from '../../database/entities';

/**
 * Maps PostStatus from platform adapters to PlatformPostStatus for database entities
 * @param status - The status from a platform adapter
 * @returns The corresponding database entity status
 */
export function mapPostStatusToEntityStatus(
  status: PostStatus,
): PlatformPostStatus {
  switch (status) {
    case PostStatus.QUEUED:
      return PlatformPostStatus.QUEUED;
    case PostStatus.POSTED:
      return PlatformPostStatus.POSTED;
    case PostStatus.FAILED:
      return PlatformPostStatus.FAILED;
    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

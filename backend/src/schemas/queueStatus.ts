export enum QueueStatus {
  Draft = 'Draft',
  EnrollmentOpen = 'EnrollmentOpen',
  EnrollmentClosed = 'EnrollmentClosed',
  AdvancementActive = 'AdvancementActive',
  Closed = 'Closed'
}

export const transitionQueueStatus = (current: QueueStatus, next: QueueStatus): void => {
  if (current === next) return;
  const validTransitions: Record<QueueStatus, QueueStatus[]> = {
    [QueueStatus.Draft]: [QueueStatus.EnrollmentOpen, QueueStatus.Closed],
    [QueueStatus.EnrollmentOpen]: [QueueStatus.EnrollmentClosed, QueueStatus.Closed],
    [QueueStatus.EnrollmentClosed]: [QueueStatus.AdvancementActive, QueueStatus.Closed],
    [QueueStatus.AdvancementActive]: [QueueStatus.Closed],
    [QueueStatus.Closed]: []
  };
  
  if (!validTransitions[current]?.includes(next)) {
    throw new Error(`Invalid status transition from ${current} to ${next}`);
  }
};

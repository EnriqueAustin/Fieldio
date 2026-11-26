type Assignees = { techId: string | null; vanId: string | null };

/**
 * Who a job was taken away from, for job:updated / schedule:updated payloads:
 * socket routing also delivers the event to these people so the job drops off
 * their screen live. Empty when nothing changed.
 */
export const previousAssignees = (before: Assignees, after: Assignees) => ({
    ...(before.techId && before.techId !== after.techId ? { previousTechId: before.techId } : {}),
    ...(before.vanId && before.vanId !== after.vanId ? { previousVanId: before.vanId } : {}),
});

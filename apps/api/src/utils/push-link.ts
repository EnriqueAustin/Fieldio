/**
 * Web-push target for a job notification: opens the job in the tech console
 * (which handles `/?job=<id>`) and tags the push per job so updates replace
 * each other instead of stacking.
 */
export const jobPushLink = (jobId: string) => ({ jobId, url: `/?job=${encodeURIComponent(jobId)}` });

/** For "no longer on your schedule": tag per job, but open the console home. */
export const jobRemovedPushLink = (jobId: string) => ({ jobId, url: '/' });

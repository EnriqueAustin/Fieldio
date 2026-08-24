"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { JobCard } from "./job-card";
import { groupJobs, JOB_GROUP_LABELS, type TechnicianJob } from "./types";

interface JobListProps {
    jobs: TechnicianJob[];
    activeJobId: string;
    onSelectJob: (jobId: string) => void;
}

/** Desktop sidebar job list: grouped Overdue / Today / Upcoming, time-sorted. */
export function JobList({ jobs, activeJobId, onSelectJob }: JobListProps) {
    const sections = groupJobs(jobs);

    return (
        <Card className="h-fit">
            <CardHeader>
                <CardTitle>Your jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {sections.map(({ group, jobs: groupJobsList }) => (
                    <div key={group} className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {JOB_GROUP_LABELS[group]} · {groupJobsList.length}
                        </div>
                        <div className="space-y-2">
                            {groupJobsList.map((job) => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    active={job.id === activeJobId}
                                    onSelect={onSelectJob}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

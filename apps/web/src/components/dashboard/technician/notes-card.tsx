"use client";

import type { Dispatch, SetStateAction } from "react";
import { format } from "date-fns";
import { StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { Avatar, AvatarFallback } from "../../ui/avatar";
import type { TechnicianJob } from "./types";

interface NotesCardProps {
    job: TechnicianJob;
    noteDraft: string;
    setNoteDraft: Dispatch<SetStateAction<string>>;
    onSaveNote: () => void;
}

export function NotesCard({ job, noteDraft, setNoteDraft, onSaveNote }: NotesCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Internal notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3 rounded-xl border p-4">
                    <Textarea
                        placeholder="Add arrival notes, access details, customer updates, or blockers..."
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                    />
                    <div className="flex justify-end">
                        <Button onClick={onSaveNote} disabled={!noteDraft.trim()}>
                            <StickyNote className="mr-2 h-4 w-4" />
                            Save note
                        </Button>
                    </div>
                </div>
                <div className="space-y-3">
                    {job.notes.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                            No notes yet for this job.
                        </div>
                    ) : (
                        job.notes.map((note) => (
                            <div key={note.id} className="rounded-xl border p-4">
                                <div className="flex items-start gap-3">
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback>
                                            {note.author?.email?.[0]?.toUpperCase() ?? "?"}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">
                                                {note.author?.email?.split("@")[0] ?? "Team"}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(note.createdAt), "MMM d, p")}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-700">{note.message}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

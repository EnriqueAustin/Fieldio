"use client";

import { useEffect, useRef, useState } from "react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import { Textarea } from "../../../../components/ui/textarea";
import {
    NOTIFICATION_CHANNELS,
    NOTIFICATION_EVENTS,
    defaultNotificationSettings,
    type NotificationChannel,
    type NotificationEventKey,
    type NotificationSettings,
    type NotificationTemplate,
} from "../../../../lib/company-settings";

export default function NotificationSettingsPage() {
    const [settings, setSettings] = useState<NotificationSettings>({
        ...defaultNotificationSettings,
        // Messages are on unless a company switches them off (matches the server default).
        enabled: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Refs to each event's body textarea, so a placeholder chip inserts at the caret.
    const bodyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await api.get("/notification-templates");
                setSettings(res.data.data.notifications);
            } catch (e) {
                console.error(e);
                setError("Could not load notification settings.");
            } finally {
                setLoading(false);
            }
        };
        fetchTemplates();
    }, []);

    const updateTemplate = (key: NotificationEventKey, patch: Partial<NotificationTemplate>) => {
        setSettings((prev) => ({
            ...prev,
            templates: { ...prev.templates, [key]: { ...prev.templates[key], ...patch } },
        }));
    };

    const insertPlaceholder = (key: NotificationEventKey, token: string) => {
        const el = bodyRefs.current[key];
        const current = settings.templates[key].body;
        const snippet = `{{${token}}}`;
        if (!el) {
            updateTemplate(key, { body: current + snippet });
            return;
        }
        const start = el.selectionStart ?? current.length;
        const end = el.selectionEnd ?? current.length;
        const next = current.slice(0, start) + snippet + current.slice(end);
        updateTemplate(key, { body: next });
        // Restore the caret just after the inserted token.
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + snippet.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const onSave = async () => {
        try {
            setSaving(true);
            setSuccess(null);
            setError(null);
            const res = await api.put("/notification-templates", settings);
            setSettings(res.data.data.notifications);
            setSuccess("Notification settings saved.");
        } catch (err: any) {
            console.error(err);
            setError(err?.response?.data?.message ?? "Could not save notification settings.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Notification Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure the automated messages your customers receive as a job moves through booking,
                    the visit, and billing.
                </p>
            </div>

            <Card className="surface-card">
                <CardHeader>
                    <CardTitle>Automated customer notifications</CardTitle>
                    <CardDescription>
                        On by default: booking confirmations, reminders, en-route and completion messages are sent
                        automatically. Turn this off to stop all of them — the office then communicates manually.
                        Edited text and channel apply once you save.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <label className="flex items-start gap-3">
                        <Switch
                            id="notifications-enabled"
                            checked={settings.enabled}
                            onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
                        />
                        <span>
                            <span className="block font-medium">Send automated customer notifications</span>
                            <span className="block text-xs text-muted-foreground">
                                On by default. Each message type below also has its own switch; a message only goes
                                out when both are on. Unedited messages use our standard wording.
                            </span>
                        </span>
                    </label>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {NOTIFICATION_EVENTS.map((event) => {
                    const tpl = settings.templates[event.key];
                    const isEmail = tpl.channel === "EMAIL";
                    return (
                        <Card key={event.key} className={settings.enabled ? "" : "opacity-70"}>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <CardTitle>{event.label}</CardTitle>
                                        <CardDescription>{event.description}</CardDescription>
                                    </div>
                                    <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                                        <Switch
                                            checked={tpl.enabled}
                                            onCheckedChange={(checked) => updateTemplate(event.key, { enabled: checked })}
                                        />
                                        <span>Enabled</span>
                                    </label>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-2 max-w-xs">
                                    <Label>Channel</Label>
                                    <select
                                        value={tpl.channel}
                                        onChange={(e) =>
                                            updateTemplate(event.key, { channel: e.target.value as NotificationChannel })
                                        }
                                        className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                    >
                                        {NOTIFICATION_CHANNELS.map((c) => (
                                            <option key={c} value={c}>
                                                {c === "EMAIL" ? "Email" : c === "SMS" ? "SMS" : "WhatsApp"}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {isEmail && (
                                    <div className="grid gap-2">
                                        <Label>Email subject</Label>
                                        <Input
                                            value={tpl.subject}
                                            onChange={(e) => updateTemplate(event.key, { subject: e.target.value })}
                                        />
                                    </div>
                                )}

                                <div className="grid gap-2">
                                    <Label>Message body</Label>
                                    <Textarea
                                        className="h-28"
                                        value={tpl.body}
                                        ref={(el) => {
                                            bodyRefs.current[event.key] = el;
                                        }}
                                        onChange={(e) => updateTemplate(event.key, { body: e.target.value })}
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <span className="text-xs text-muted-foreground">Insert:</span>
                                        {event.placeholders.map((token) => (
                                            <button
                                                key={token}
                                                type="button"
                                                onClick={() => insertPlaceholder(event.key, token)}
                                                className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted/70"
                                            >
                                                {`{{${token}}}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {success && <p className="text-sm text-green-600">{success}</p>}
                {error && <p className="text-sm text-rose-600">{error}</p>}

                <div className="flex justify-end">
                    <Button onClick={onSave} disabled={loading || saving}>
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

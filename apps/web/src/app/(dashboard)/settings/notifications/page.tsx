"use client";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import { Textarea } from "../../../../components/ui/textarea";

export default function NotificationSettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Notification Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure how and when your customers receive updates.
                </p>
            </div>

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Job Created</CardTitle>
                        <CardDescription>Sent when a new job is booked.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <Switch id="job-created-email" defaultChecked />
                            <Label htmlFor="job-created-email">Enable Email</Label>
                        </div>
                        <div className="grid gap-2">
                            <Label>Email Subject</Label>
                            <Input defaultValue="Your appointment with Fieldio has been booked" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Email Body Template</Label>
                            <Textarea className="h-20" defaultValue="Hi {{customerName}}, your job is scheduled for {{date}}." />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Technician En Route</CardTitle>
                        <CardDescription>Sent when the technician is on the way.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <Switch id="en-route-sms" defaultChecked />
                            <Label htmlFor="en-route-sms">Enable SMS</Label>
                        </div>
                        <div className="grid gap-2">
                            <Label>SMS Template</Label>
                            <Textarea className="h-20" defaultValue="Hi! {{techName}} from Fieldio is en route to your location. ETA: {{eta}} minutes." />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button>Save Changes</Button>
                </div>
            </div>
        </div>
    );
}


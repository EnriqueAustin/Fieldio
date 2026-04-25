"use client";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Switch } from "../../../../components/ui/switch";

const DAYS = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
];

export default function BusinessHoursPage() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Business Hours</h3>
                <p className="text-sm text-muted-foreground">
                    Set your operating hours for scheduling.
                </p>
            </div>

            <Card>
                <CardContent className="p-6 space-y-4">
                    {DAYS.map((day) => (
                        <div key={day} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center space-x-4 w-32">
                                <Switch id={`open-${day}`} defaultChecked={day !== "Sunday"} />
                                <Label htmlFor={`open-${day}`} className={day === "Sunday" ? "text-muted-foreground" : ""}>{day}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Input type="time" defaultValue="08:00" className="w-32" disabled={day === "Sunday"} />
                                <span className="text-muted-foreground">-</span>
                                <Input type="time" defaultValue="17:00" className="w-32" disabled={day === "Sunday"} />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button>Save Hours</Button>
            </div>
        </div>
    );
}


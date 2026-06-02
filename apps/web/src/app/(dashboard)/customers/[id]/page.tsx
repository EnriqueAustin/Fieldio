"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Avatar, AvatarFallback } from "../../../../components/ui/avatar";
import { MapPin, Phone, Mail, Wrench } from "lucide-react";

interface Asset {
    id: string;
    name: string;
    category: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    lastServicedAt: string | null;
    status: string;
}

interface Property {
    id: string;
    addressLine1: string;
    city: string;
    state: string;
    zip: string;
    assets: Asset[];
}

interface Customer {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    properties: Property[];
    notes: string | null;
}

export default function CustomerDetailPage() {
    const { id } = useParams();
    const [customer, setCustomer] = useState<Customer | null>(null);

    useEffect(() => {
        const fetchCustomer = async () => {
            try {
                const res = await api.get(`/customers/${id}`);
                setCustomer(res.data.data.customer);
            } catch (e) {
                console.error(e);
            }
        };
        if (id) fetchCustomer();
    }, [id]);

    if (!customer) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 text-xl">
                        <AvatarFallback>{customer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
                        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                            {customer.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</div>}
                            {customer.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</div>}
                        </div>
                    </div>
                </div>
                <Button>Create Job</Button>
            </div>

            {/* Content */}
            <Tabs defaultValue="properties" className="w-full">
                <TabsList>
                    <TabsTrigger value="properties">Properties</TabsTrigger>
                    <TabsTrigger value="history">Job History</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="properties" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {customer.properties.map((prop) => (
                            <Card key={prop.id}>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Service Address</CardTitle>
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl font-bold pt-2">{prop.addressLine1}</div>
                                    <p className="text-sm text-muted-foreground">{prop.city}, {prop.state} {prop.zip}</p>
                                    <div className="mt-4 space-y-2">
                                        {prop.assets?.length ? (
                                            prop.assets.map((asset) => (
                                                <div key={asset.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-medium">{asset.name}</span>
                                                        <span className="text-xs text-muted-foreground">{asset.status}</span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                        {[asset.manufacturer, asset.model, asset.serialNumber].filter(Boolean).join(" / ") || asset.category || "Tracked asset"}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                                                <Wrench className="h-3 w-3" />
                                                No equipment tracked yet
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-4">
                                        <Button variant="outline" size="sm" className="w-full">Create Job Here</Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        <Button variant="outline" className="h-auto min-h-[150px] border-dashed">
                            + Add Property
                        </Button>
                    </div>
                </TabsContent>

                <TabsContent value="history">
                    <div className="border rounded-md p-8 text-center text-muted-foreground">
                        No job history found.
                    </div>
                </TabsContent>

                <TabsContent value="notes">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="whitespace-pre-wrap">{customer.notes || "No notes added."}</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

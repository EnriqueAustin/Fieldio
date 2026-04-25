"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "../../../../lib/api";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";

const customerSchema = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    property: z.object({
        addressLine1: z.string().min(3, "Address is required"),
        city: z.string().min(2),
        state: z.string().min(2),
        zip: z.string().min(4),
    }),
});

type CustomerForm = z.infer<typeof customerSchema>;

export default function NewCustomerPage() {
    const router = useRouter();
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerForm>({
        resolver: zodResolver(customerSchema),
    });

    const onSubmit = async (data: CustomerForm) => {
        try {
            const res = await api.post("/customers", data);
            router.push(`/customers/${res.data.data.customer.id}`);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h3 className="text-lg font-medium">New Customer</h3>
                <p className="text-sm text-muted-foreground">
                    Create a new customer profile and add their primary service address.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Contact Information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name or Company</Label>
                            <Input id="name" placeholder="John Doe" {...register("name")} />
                            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" placeholder="john@example.com" {...register("email")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" placeholder="(555) 123-4567" {...register("phone")} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Primary Property</CardTitle>
                        <CardDescription>Address where service will be performed.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="address">Address Line 1</Label>
                            <Input id="address" placeholder="123 Main St" {...register("property.addressLine1")} />
                            {errors.property?.addressLine1 && <p className="text-sm text-destructive">{errors.property.addressLine1.message}</p>}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="city">City</Label>
                                <Input id="city" placeholder="Johannesburg" {...register("property.city")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="state">Province / State</Label>
                                <Input id="state" placeholder="Gauteng" {...register("property.state")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="zip">Postal Code</Label>
                                <Input id="zip" placeholder="2000" {...register("property.zip")} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating..." : "Create Customer"}
                    </Button>
                </div>
            </form>
        </div>
    );
}


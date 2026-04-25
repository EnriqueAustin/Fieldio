"use client";

import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Plus, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    minLevel: number;
    location: string;
}

const createItemSchema = z.object({
    name: z.string().min(2),
    quantity: z.string().transform(v => parseInt(v)),
    minLevel: z.string().transform(v => parseInt(v)).optional(),
});

export default function InventoryPage() {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { register, handleSubmit, reset } = useForm({
        resolver: zodResolver(createItemSchema)
    });

    const fetchItems = async () => {
        try {
            const res = await api.get('/operations/inventory');
            setItems(res.data.data.items);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const onSubmit = async (data: any) => {
        try {
            await api.post('/operations/inventory', { ...data, minLevel: data.minLevel || 5 });
            fetchItems();
            setIsDialogOpen(false);
            reset();
        } catch (e) {
            console.error(e);
        }
    };

    const updateQuantity = async (id: string, newQty: number) => {
        try {
            await api.patch(`/operations/inventory/${id}`, { quantity: newQty });
            fetchItems();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Inventory</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage warehouse and van stock.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Item</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Inventory Item</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Item Name</Label>
                                <Input {...register("name")} placeholder="e.g. Copper Pipe 1/2" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Quantity</Label>
                                    <Input type="number" {...register("quantity")} defaultValue="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Min Level</Label>
                                    <Input type="number" {...register("minLevel")} defaultValue="5" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Create</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Item Name</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No inventory items found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>{item.sku || '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{item.location}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="w-6 h-6 rounded flex items-center justify-center border hover:bg-muted"
                                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                            >-</button>
                                            <span className="w-8 text-center">{item.quantity}</span>
                                            <button
                                                className="w-6 h-6 rounded flex items-center justify-center border hover:bg-muted"
                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                            >+</button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {item.quantity <= item.minLevel ? (
                                            <Badge variant="destructive" className="gap-1">
                                                <AlertTriangle className="h-3 w-3" /> Low Stock
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200">OK</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm">Edit</Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}


'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    CheckCircle2, Circle, Plus, Trash2, Loader2,
    ChevronDown, ChevronUp, Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

type LineItem = { name: string; quantity: number; unitPrice: number; total: number; type: string };
type EstimateOption = {
    id: string;
    name: string;
    description?: string;
    items: LineItem[];
    total: number;
    accepted: boolean;
};

function formatCurrency(val: number) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);
}

const TIER_STYLES = [
    { ring: 'ring-slate-200',  badge: 'bg-slate-100 text-slate-700',  icon: null,  label: 'Basic'   },
    { ring: 'ring-blue-300',   badge: 'bg-blue-100 text-blue-700',    icon: null,  label: 'Better'  },
    { ring: 'ring-yellow-300', badge: 'bg-yellow-100 text-yellow-700', icon: Star, label: 'Best'   },
];

interface Props {
    estimateId: string;
}

export function EstimateOptionsPanel({ estimateId }: Props) {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false);
    const [newOption, setNewOption] = useState({ name: '', description: '', items: [{ name: '', quantity: 1, unitPrice: 0 }] });

    const { data, isLoading } = useQuery({
        queryKey: ['estimate-options', estimateId],
        queryFn: () => api.get(`/estimates/${estimateId}/options`).then(r => r.data.data.options),
        enabled: !!estimateId,
    });

    const addOption = useMutation({
        mutationFn: (payload: typeof newOption) => {
            const items = payload.items.map(item => ({
                ...item,
                total: item.quantity * item.unitPrice,
                type: 'SERVICE',
            }));
            const total = items.reduce((acc, i) => acc + i.total, 0);
            return api.post(`/estimates/${estimateId}/options`, { ...payload, items, total });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['estimate-options', estimateId] });
            setAdding(false);
            setNewOption({ name: '', description: '', items: [{ name: '', quantity: 1, unitPrice: 0 }] });
        },
    });

    const acceptOption = useMutation({
        mutationFn: (optionId: string) =>
            api.post(`/estimates/${estimateId}/options/${optionId}/accept`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['estimate-options', estimateId] }),
    });

    const options: EstimateOption[] = data ?? [];
    const acceptedOption = options.find(o => o.accepted);

    const addItem = () =>
        setNewOption(f => ({ ...f, items: [...f.items, { name: '', quantity: 1, unitPrice: 0 }] }));
    const removeItem = (idx: number) =>
        setNewOption(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
    const updateItem = (idx: number, field: string, value: string | number) =>
        setNewOption(f => ({
            ...f,
            items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
        }));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold">Good · Better · Best Options</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Present multiple pricing tiers to your customer.
                    </p>
                </div>
                {!adding && (
                    <Button size="sm" variant="outline" id="add-option-btn" onClick={() => setAdding(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Option
                    </Button>
                )}
            </div>

            {/* Accepted banner */}
            {acceptedOption && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Customer accepted: <strong>{acceptedOption.name}</strong> — {formatCurrency(acceptedOption.total)}
                </div>
            )}

            {/* Options Grid */}
            {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading options...
                </div>
            ) : options.length === 0 && !adding ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                    No options yet. Add your first pricing tier to upsell your customer.
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-3">
                    {options.map((option, index) => {
                        const style = TIER_STYLES[Math.min(index, TIER_STYLES.length - 1)];
                        const Icon = style.icon;
                        return (
                            <Card
                                key={option.id}
                                id={`option-card-${option.id}`}
                                className={cn(
                                    'ring-2 transition-all relative',
                                    style.ring,
                                    option.accepted && 'ring-green-400'
                                )}
                            >
                                {option.accepted && (
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-green-500 text-white text-xs px-2 py-0.5">
                                            ✓ Accepted
                                        </Badge>
                                    </div>
                                )}
                                <CardHeader className="pb-2 pt-5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            {Icon && <Icon className="h-4 w-4 text-yellow-500" />}
                                            <CardTitle className="text-base">{option.name}</CardTitle>
                                        </div>
                                        <Badge variant="outline" className={style.badge}>
                                            {style.label}
                                        </Badge>
                                    </div>
                                    {option.description && (
                                        <CardDescription className="text-xs mt-1">{option.description}</CardDescription>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Collapsible>
                                        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full">
                                            {option.items?.length ?? 0} line item{option.items?.length !== 1 ? 's' : ''}
                                            <ChevronDown className="h-3 w-3 ml-auto" />
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="mt-2 space-y-1">
                                            {option.items?.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between text-xs py-0.5">
                                                    <span className="text-muted-foreground truncate">{item.name} × {item.quantity}</span>
                                                    <span>{formatCurrency(item.total)}</span>
                                                </div>
                                            ))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                    <div className="border-t pt-2 flex items-center justify-between">
                                        <span className="text-xl font-bold">{formatCurrency(option.total)}</span>
                                        {!acceptedOption && (
                                            <Button
                                                size="sm"
                                                variant={option.accepted ? 'default' : 'outline'}
                                                id={`accept-option-${option.id}`}
                                                onClick={() => acceptOption.mutate(option.id)}
                                                disabled={acceptOption.isPending}
                                                className="text-xs"
                                            >
                                                {acceptOption.isPending && acceptOption.variables === option.id
                                                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                    : <Circle className="h-3 w-3 mr-1" />
                                                }
                                                Select
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Option Form */}
            {adding && (
                <Card className="border-dashed border-2">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">New Pricing Option</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="option-name">Option Name *</Label>
                                <Input
                                    id="option-name"
                                    placeholder='e.g. "Premium Replacement"'
                                    value={newOption.name}
                                    onChange={e => setNewOption(f => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="option-desc">Description</Label>
                                <Input
                                    id="option-desc"
                                    placeholder="Short description..."
                                    value={newOption.description}
                                    onChange={e => setNewOption(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Line Items</Label>
                            {newOption.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                    <Input
                                        className="col-span-5"
                                        placeholder="Item name"
                                        value={item.name}
                                        onChange={e => updateItem(idx, 'name', e.target.value)}
                                    />
                                    <Input
                                        className="col-span-2"
                                        type="number"
                                        placeholder="Qty"
                                        min={1}
                                        value={item.quantity}
                                        onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                                    />
                                    <Input
                                        className="col-span-3"
                                        type="number"
                                        placeholder="Unit price"
                                        min={0}
                                        value={item.unitPrice}
                                        onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))}
                                    />
                                    <div className="col-span-1 text-xs text-right text-muted-foreground">
                                        {formatCurrency(item.quantity * item.unitPrice)}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="col-span-1 h-8 w-8 text-destructive"
                                        disabled={newOption.items.length === 1}
                                        onClick={() => removeItem(idx)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={addItem} className="text-xs">
                                <Plus className="mr-1 h-3 w-3" /> Add item
                            </Button>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t">
                            <div className="font-semibold text-sm">
                                Total: {formatCurrency(newOption.items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                                <Button
                                    size="sm"
                                    id="save-option-btn"
                                    disabled={!newOption.name || addOption.isPending}
                                    onClick={() => addOption.mutate(newOption)}
                                >
                                    {addOption.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                                    Save Option
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

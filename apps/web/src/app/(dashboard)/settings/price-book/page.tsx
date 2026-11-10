"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Upload, Download, FileUp, AlertTriangle, CheckCircle2, Pencil, Archive, Package } from "lucide-react";
import api from "../../../../lib/api";
import { formatZAR } from "../../../../lib/utils";
import { useAuthStore } from "../../../../store/auth";
import { toast } from "../../../../components/ui/use-toast";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../../../components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../../../components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemType = "SERVICE" | "MATERIAL" | "LABOR";
const ITEM_TYPES: ItemType[] = ["SERVICE", "MATERIAL", "LABOR"];

interface PriceBookItem {
    id: string;
    name: string;
    description?: string | null;
    sku?: string | null;
    category?: string | null;
    type: ItemType;
    active: boolean;
    // Absent for technicians (stripped server-side); office/admin see both.
    unitPrice?: number;
    costPrice?: number | null;
}

interface ListResponse {
    items: PriceBookItem[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

const PAGE_SIZE = 50;

const TYPE_BADGE: Record<ItemType, string> = {
    SERVICE: "bg-sky-100 text-sky-800",
    MATERIAL: "bg-violet-100 text-violet-800",
    LABOR: "bg-amber-100 text-amber-800",
};

// Margin % on sell price, or null when either figure is missing.
function marginPct(unitPrice?: number, costPrice?: number | null): number | null {
    if (unitPrice == null || !costPrice || unitPrice <= 0) return null;
    return Math.round(((unitPrice - costPrice) / unitPrice) * 100);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PriceBookPage() {
    const queryClient = useQueryClient();
    const role = useAuthStore((s) => s.user?.role);
    // Writes and cost/margin visibility mirror the API's restrictTo('ADMIN','OFFICE').
    const canManage = role === "ADMIN" || role === "OFFICE";

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string>("all");
    const [type, setType] = useState<string>("all");
    const [page, setPage] = useState(1);

    const [editing, setEditing] = useState<PriceBookItem | null | "new">(null);
    const [archiveTarget, setArchiveTarget] = useState<PriceBookItem | null>(null);
    const [importOpen, setImportOpen] = useState(false);

    const { data: categories } = useQuery({
        queryKey: ["price-book", "categories"],
        queryFn: () => api.get("/price-book/categories").then((r) => r.data.data.categories as string[]),
    });

    const listKey = ["price-book", { search, category, type, page }] as const;
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: listKey,
        queryFn: () => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (category !== "all") params.set("category", category);
            if (type !== "all") params.set("type", type);
            params.set("page", String(page));
            params.set("limit", String(PAGE_SIZE));
            return api.get(`/price-book?${params.toString()}`).then((r) => r.data.data as ListResponse);
        },
        placeholderData: (prev) => prev,
    });

    const items = data?.items ?? [];
    const total = data?.count ?? 0;
    const totalPages = data?.totalPages ?? 1;

    const archiveMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/price-book/${id}`),
        onSuccess: () => {
            toast({ title: "Item archived" });
            queryClient.invalidateQueries({ queryKey: ["price-book"] });
            setArchiveTarget(null);
        },
        onError: (e: any) => toast({ title: e?.response?.data?.message || "Could not archive item", variant: "destructive" }),
    });

    const runSearch = () => {
        setSearch(searchInput.trim());
        setPage(1);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="page-title">Price Book</h1>
                    <p className="page-subtitle">
                        {total > 0
                            ? `${total} ${total === 1 ? "item" : "items"} — services, materials and labour used across quotes and jobs.`
                            : "Your standard services, materials and labour rates."}
                    </p>
                </div>
                {canManage && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
                            <Upload className="h-4 w-4" /> Import CSV
                        </Button>
                        <Button className="gap-2" onClick={() => setEditing("new")}>
                            <Plus className="h-4 w-4" /> Add item
                        </Button>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name, SKU…"
                            className="pl-9"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && runSearch()}
                        />
                    </div>
                    <Button variant="outline" onClick={runSearch}>Search</Button>
                </div>
                <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {(categories ?? []).map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="All types" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {ITEM_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-slate-50/60 text-left">
                            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                            <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                            {canManage && (
                                <>
                                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price (excl. VAT)</th>
                                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</th>
                                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {isLoading && (
                            <tr><td colSpan={canManage ? 8 : 4} className="text-center h-24 text-muted-foreground">Loading…</td></tr>
                        )}
                        {isError && !isLoading && (
                            <tr>
                                <td colSpan={canManage ? 8 : 4} className="text-center h-24 text-muted-foreground">
                                    Couldn&apos;t load the price book.{" "}
                                    <button className="underline" onClick={() => refetch()}>Retry</button>
                                </td>
                            </tr>
                        )}
                        {!isLoading && !isError && items.length === 0 && (
                            <tr>
                                <td colSpan={canManage ? 8 : 4} className="text-center h-32 text-muted-foreground">
                                    <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                    <p className="font-medium">No items yet</p>
                                    <p className="text-xs">
                                        {canManage ? "Add your first item or import a CSV to get started." : "Nothing in the price book yet."}
                                    </p>
                                </td>
                            </tr>
                        )}
                        {!isLoading && !isError && items.map((item) => {
                            const m = marginPct(item.unitPrice, item.costPrice);
                            return (
                                <tr key={item.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.sku || "—"}</td>
                                    <td className="px-4 py-2 font-medium">{item.name}</td>
                                    <td className="px-4 py-2">{item.category || "—"}</td>
                                    <td className="px-4 py-2">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[item.type]}`}>
                                            {item.type.charAt(0) + item.type.slice(1).toLowerCase()}
                                        </span>
                                    </td>
                                    {canManage && (
                                        <>
                                            <td className="px-4 py-2 text-right tabular-nums">{formatZAR(item.unitPrice)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                                {item.costPrice != null ? formatZAR(item.costPrice) : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">
                                                {m != null ? <span className={m < 0 ? "text-rose-600" : "text-emerald-600"}>{m}%</span> : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-right whitespace-nowrap">
                                                <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(item)}>
                                                    <Archive className="h-3.5 w-3.5" />
                                                </Button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <span className="text-muted-foreground">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
            )}

            {canManage && editing !== null && (
                <ItemDialog
                    item={editing === "new" ? null : editing}
                    categories={categories ?? []}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        queryClient.invalidateQueries({ queryKey: ["price-book"] });
                    }}
                />
            )}

            {/* Archive confirm */}
            <Dialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Archive item?</DialogTitle>
                        <DialogDescription>
                            &ldquo;{archiveTarget?.name}&rdquo; will be hidden from new quotes and jobs. Existing documents keep their lines. You can restore it later by editing it.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={archiveMutation.isPending}
                            onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
                        >
                            {archiveMutation.isPending ? "Archiving…" : "Archive"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {canManage && (
                <ImportDialog
                    open={importOpen}
                    onClose={() => setImportOpen(false)}
                    onImported={() => queryClient.invalidateQueries({ queryKey: ["price-book"] })}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Add / edit dialog
// ---------------------------------------------------------------------------

function ItemDialog({
    item,
    categories,
    onClose,
    onSaved,
}: {
    item: PriceBookItem | null;
    categories: string[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!item;
    const [name, setName] = useState(item?.name ?? "");
    const [sku, setSku] = useState(item?.sku ?? "");
    const [category, setCategory] = useState(item?.category ?? "");
    const [type, setType] = useState<ItemType>(item?.type ?? "SERVICE");
    const [unitPrice, setUnitPrice] = useState(item?.unitPrice != null ? String(item.unitPrice) : "");
    const [costPrice, setCostPrice] = useState(item?.costPrice != null ? String(item.costPrice) : "");
    const [description, setDescription] = useState(item?.description ?? "");

    const save = useMutation({
        mutationFn: () => {
            const body: Record<string, unknown> = {
                name: name.trim(),
                type,
                unitPrice: Number(unitPrice),
            };
            if (sku.trim()) body.sku = sku.trim();
            if (category.trim()) body.category = category.trim();
            if (costPrice.trim()) body.costPrice = Number(costPrice);
            if (description.trim()) body.description = description.trim();
            return isEdit
                ? api.patch(`/price-book/${item!.id}`, body)
                : api.post("/price-book", body);
        },
        onSuccess: () => {
            toast({ title: isEdit ? "Item updated" : "Item added" });
            onSaved();
        },
        onError: (e: any) => toast({ title: e?.response?.data?.message || "Could not save item", variant: "destructive" }),
    });

    const valid = name.trim().length > 0 && unitPrice.trim() !== "" && Number(unitPrice) >= 0;

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit item" : "Add price book item"}</DialogTitle>
                    <DialogDescription>
                        Prices are entered excluding VAT.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Geyser replacement" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>SKU</Label>
                            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select value={type} onValueChange={(v) => setType(v as ItemType)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ITEM_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>Category</Label>
                        <Input
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            placeholder="e.g. Geysers"
                            list="pb-categories"
                        />
                        <datalist id="pb-categories">
                            {categories.map((c) => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label>Price (excl. VAT)</Label>
                            <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Cost</Label>
                            <Input type="number" min="0" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="Optional" />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>Description</Label>
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
                        {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Add item"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// CSV import dialog
// ---------------------------------------------------------------------------

const IMPORT_FIELDS = ["name", "sku", "category", "type", "unit", "unitPrice", "costPrice", "description", "taxable"] as const;
type ImportField = (typeof IMPORT_FIELDS)[number];

const FIELD_LABELS: Record<ImportField, string> = {
    name: "Name",
    sku: "SKU",
    category: "Category",
    type: "Type",
    unit: "Unit",
    unitPrice: "Price (excl. VAT)",
    costPrice: "Cost",
    description: "Description",
    taxable: "Taxable",
};

const HEADER_SYNONYMS: Record<string, ImportField> = {
    name: "name", item: "name", itemname: "name", service: "name", description2: "name", product: "name",
    sku: "sku", code: "sku", itemcode: "sku", partnumber: "sku", part: "sku",
    category: "category", group: "category", cat: "category",
    type: "type", kind: "type",
    unit: "unit", uom: "unit", unitofmeasure: "unit",
    unitprice: "unitPrice", price: "unitPrice", sellprice: "unitPrice", sell: "unitPrice", rate: "unitPrice", exclvat: "unitPrice",
    costprice: "costPrice", cost: "costPrice", buyprice: "costPrice", buy: "costPrice", supplierprice: "costPrice",
    description: "description", notes: "description", detail: "description",
    taxable: "taxable", vat: "taxable", vatable: "taxable",
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field); field = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(field); field = "";
            rows.push(row); row = [];
        } else field += c;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const TEMPLATE_HEADERS = "name,sku,category,type,unit,unitPrice,costPrice,description,taxable";
const TEMPLATE_SAMPLE = 'Geyser 150L,GEY-150,Geysers,MATERIAL,each,4999.00,3200.00,Kwikot 150L electric geyser,true';

interface ImportResult {
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; message: string }[];
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<(ImportField | "")[]>([]);
    const [result, setResult] = useState<ImportResult | null>(null);

    const reset = () => {
        setFileName(null); setHeaders([]); setRows([]); setMapping([]); setResult(null);
    };

    const handleFile = async (file: File) => {
        setResult(null);
        const parsed = parseCsv(await file.text());
        if (parsed.length < 2) {
            toast({ title: "That file has no data rows", variant: "destructive" });
            return;
        }
        const [hdr, ...body] = parsed;
        setFileName(file.name);
        setHeaders(hdr);
        setRows(body);
        setMapping(hdr.map((h) => HEADER_SYNONYMS[normalizeHeader(h)] ?? ""));
    };

    // Build row objects from the current mapping; a row needs a name to count.
    const mappedRows = useMemo(() => {
        const nameCol = mapping.indexOf("name");
        if (nameCol === -1) return [];
        return rows
            .filter((cells) => (cells[nameCol] ?? "").trim() !== "")
            .map((cells) => {
                const rec: Record<string, string> = {};
                mapping.forEach((field, col) => {
                    if (field) rec[field] = (cells[col] ?? "").trim();
                });
                return rec;
            });
    }, [rows, mapping]);

    const hasNameMapped = mapping.includes("name");
    const hasPriceMapped = mapping.includes("unitPrice");

    const importMutation = useMutation({
        mutationFn: () => api.post("/price-book/bulk", { rows: mappedRows }).then((r) => r.data.data as ImportResult),
        onSuccess: (data) => {
            setResult(data);
            onImported();
            toast({ title: `Imported ${data.created + data.updated} item${data.created + data.updated === 1 ? "" : "s"}` });
        },
        onError: (e: any) => toast({ title: e?.response?.data?.message || "Import failed", variant: "destructive" }),
    });

    const downloadTemplate = () => {
        const blob = new Blob([`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}\n`], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "price-book-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import price book from CSV</DialogTitle>
                    <DialogDescription>
                        One row per item. Items are matched by SKU (or name + category) and updated in place, so re-importing is safe.
                    </DialogDescription>
                </DialogHeader>

                {!result && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Up to 2000 rows.</p>
                            <button
                                onClick={downloadTemplate}
                                className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50"
                            >
                                <Download className="h-4 w-4" /> Download template
                            </button>
                        </div>

                        <div
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-8 cursor-pointer hover:border-slate-400 transition"
                        >
                            <FileUp className="h-7 w-7 text-muted-foreground" />
                            <p className="text-sm font-medium">{fileName ?? "Click to choose a CSV, or drag it here"}</p>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                            />
                        </div>

                        {headers.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium">Match your columns</p>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {headers.map((h, col) => (
                                        <div key={col} className="space-y-1">
                                            <label className="text-xs font-medium text-muted-foreground truncate block" title={h}>
                                                {h || `Column ${col + 1}`}
                                            </label>
                                            <select
                                                value={mapping[col] ?? ""}
                                                onChange={(e) => {
                                                    const next = [...mapping];
                                                    next[col] = e.target.value as ImportField | "";
                                                    setMapping(next);
                                                }}
                                                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                                            >
                                                <option value="">— Ignore —</option>
                                                {IMPORT_FIELDS.map((f) => (
                                                    <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>

                                {(!hasNameMapped || !hasPriceMapped) && (
                                    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                        <AlertTriangle className="h-4 w-4" />
                                        Map a column to <strong>Name</strong> and <strong>Price (excl. VAT)</strong> to continue.
                                    </div>
                                )}

                                <p className="text-sm text-muted-foreground">
                                    <strong className="text-foreground">{mappedRows.length}</strong> ready to import
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {result && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <p className="font-medium">Import complete</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Stat label="Created" value={result.created} tone="emerald" />
                            <Stat label="Updated" value={result.updated} tone="sky" />
                            <Stat label="Failed" value={result.errors.length} tone={result.errors.length > 0 ? "rose" : undefined} />
                        </div>
                        {result.errors.length > 0 && (
                            <div className="rounded-lg border border-border overflow-hidden">
                                <div className="bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">Rows that couldn&apos;t be imported</div>
                                <ul className="divide-y divide-border/60 text-sm max-h-48 overflow-y-auto">
                                    {result.errors.map((err, i) => (
                                        <li key={i} className="px-3 py-2 flex gap-3">
                                            <span className="text-muted-foreground shrink-0">Row {err.row}</span>
                                            <span>{err.message}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {result ? (
                        <>
                            <Button variant="outline" onClick={reset}>Import another</Button>
                            <Button onClick={() => { reset(); onClose(); }}>Done</Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
                            <Button
                                disabled={!hasNameMapped || !hasPriceMapped || mappedRows.length === 0 || importMutation.isPending}
                                onClick={() => importMutation.mutate()}
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                {importMutation.isPending ? "Importing…" : `Import ${mappedRows.length} item${mappedRows.length === 1 ? "" : "s"}`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "sky" | "rose" }) {
    const color =
        tone === "emerald" ? "text-emerald-600" :
        tone === "sky" ? "text-sky-600" :
        tone === "rose" ? "text-rose-600" : "text-foreground";
    return (
        <div className="rounded-lg border border-border p-3">
            <p className={`text-2xl font-semibold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
        </div>
    );
}

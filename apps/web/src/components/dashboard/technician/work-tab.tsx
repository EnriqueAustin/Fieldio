"use client";

import { ChecklistCard } from "./checklist-card";
import { LineItemsCard } from "./line-items-card";
import { QuoteCard } from "./quote-card";
import { ExpensesCard } from "./expenses-card";
import type { useLineItems } from "./use-line-items";
import type { useFieldQuote } from "./use-field-quote";
import type { useExpenses } from "./use-expenses";
import type { PriceBookItem, TechnicianJob } from "./types";

interface WorkTabProps {
    job: TechnicianJob;
    priceBookItems: PriceBookItem[];
    lineItems: ReturnType<typeof useLineItems>;
    quote: ReturnType<typeof useFieldQuote>;
    expenses: ReturnType<typeof useExpenses>;
    onToggleChecklist: (checkId: string, isCompleted: boolean) => void;
    onSendQuote: () => void;
    isSendingQuote: boolean;
}

export function WorkTab({
    job,
    priceBookItems,
    lineItems,
    quote,
    expenses,
    onToggleChecklist,
    onSendQuote,
    isSendingQuote,
}: WorkTabProps) {
    return (
        <>
            <ChecklistCard job={job} onToggle={onToggleChecklist} />

            <LineItemsCard
                job={job}
                pbSearch={lineItems.pbSearch}
                setPbSearch={lineItems.setPbSearch}
                newItem={lineItems.newItem}
                setNewItem={lineItems.setNewItem}
                filteredPB={lineItems.filteredPB}
                onSelectPBItem={lineItems.selectPBItem}
                onAddLineItem={() => lineItems.addLineItem(job.id)}
                onRemoveLineItem={(itemId) => lineItems.removeLineItem(job.id, itemId)}
            />

            <QuoteCard
                job={job}
                priceBookItems={priceBookItems}
                quoteSearch={quote.quoteSearch}
                setQuoteSearch={quote.setQuoteSearch}
                quoteItems={quote.quoteItems}
                setQuoteItems={quote.setQuoteItems}
                onAddQuoteItem={quote.addQuoteItem}
                onSendQuote={onSendQuote}
                isSending={isSendingQuote}
            />

            <ExpensesCard
                newExpense={expenses.newExpense}
                setNewExpense={expenses.setNewExpense}
                setExpenseReceipt={expenses.setExpenseReceipt}
                onSubmit={() => expenses.submitExpense(job.id)}
            />
        </>
    );
}

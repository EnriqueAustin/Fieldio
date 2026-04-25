'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function BookPage() {
    const { companyId } = useParams<{ companyId: string }>();
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        const body: Record<string, any> = Object.fromEntries(fd.entries());
        if (body.preferredDate) body.preferredDate = new Date(body.preferredDate).toISOString();
        try {
            const res = await fetch(`${API}/public/bookings/${companyId}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message ?? 'Submission failed');
            setDone(true);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
                    <h1 className="text-xl font-semibold">Request received</h1>
                    <p className="text-slate-600 mt-2">
                        We'll be in touch shortly to confirm your appointment.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <h1 className="text-2xl font-semibold">Request service</h1>
                <p className="text-slate-600 text-sm mt-1">
                    Tell us what you need — we'll get back to you within one business day.
                </p>

                <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                    <Field label="Your name" name="name" required />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Email" name="email" type="email" />
                        <Field label="Phone" name="phone" type="tel" />
                    </div>
                    <Field label="Service address" name="addressLine1" />
                    <div className="grid grid-cols-3 gap-4">
                        <Field label="City" name="city" />
                        <Field label="State" name="state" />
                        <Field label="ZIP" name="zip" />
                    </div>
                    <Field label="Type of service" name="serviceType" placeholder="e.g. plumbing, HVAC" />
                    <Field label="Preferred date" name="preferredDate" type="datetime-local" />
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            What's going on?
                        </label>
                        <textarea
                            name="description"
                            required
                            rows={4}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                    </div>

                    {error && <div className="text-sm text-rose-700 bg-rose-50 p-3 rounded-lg">{error}</div>}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition disabled:opacity-60"
                    >
                        {submitting ? 'Sending…' : 'Request service'}
                    </button>
                </form>
            </div>
        </div>
    );
}

function Field({
    label,
    name,
    type = 'text',
    required,
    placeholder,
}: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
                {label} {required && <span className="text-rose-600">*</span>}
            </label>
            <input
                name={name}
                type={type}
                required={required}
                placeholder={placeholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
        </div>
    );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hands-free note entry (audit P2 #14). Wraps the browser SpeechRecognition API
 * so a tech can dictate a note instead of typing with gloves on. Emits finalized
 * transcript chunks via `onResult` (the caller appends them to the note draft).
 * `supported` is false where the API is unavailable, so the UI can hide the mic.
 */
export function useDictation(onResult: (text: string) => void) {
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    // Keep the latest callback without re-creating the recognition instance.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    useEffect(() => {
        if (typeof window === "undefined") return;
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        setSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-ZA";

        recognition.onresult = (event: any) => {
            let finalText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
            }
            if (finalText.trim()) onResultRef.current(finalText.trim());
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);

        recognitionRef.current = recognition;
        return () => {
            try {
                recognition.stop();
            } catch {
                /* already stopped */
            }
        };
    }, []);

    const toggle = () => {
        const recognition = recognitionRef.current;
        if (!recognition) return;
        if (listening) {
            recognition.stop();
            setListening(false);
        } else {
            try {
                recognition.start();
                setListening(true);
            } catch {
                /* start() throws if already started — ignore */
            }
        }
    };

    return { supported, listening, toggle };
}

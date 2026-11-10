"use client";

import { io } from "socket.io-client";
import { useAuthStore } from "../store/auth";

// Ensure this matches your API URL
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// The API rejects sockets without an access token. `auth` as a callback is
// re-read on every (re)connect, so a rotated token is picked up automatically.
export const socket = io(SOCKET_URL, {
    path: "/socket.io",
    withCredentials: true,
    autoConnect: false, // We connect explicitly in components or layout
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken ?? "" }),
});

// Reconnect with the new token when it rotates; drop the socket on logout.
if (typeof window !== "undefined") {
    let lastToken = useAuthStore.getState().accessToken;
    useAuthStore.subscribe((state) => {
        if (state.accessToken === lastToken) return;
        lastToken = state.accessToken;
        if (!state.accessToken) {
            socket.disconnect();
        } else if (socket.connected || socket.active) {
            socket.disconnect().connect();
        }
    });
}

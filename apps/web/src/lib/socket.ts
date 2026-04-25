"use client";

import { io } from "socket.io-client";

// Ensure this matches your API URL
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const socket = io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false, // We connect explicitly in components or layout
});

"use client"

import { useAuthStore } from "../../store/auth"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ensureFreshSession } from "../../lib/api"

export default function ProtectedRoute({
    children,
    allowedRoles,
}: {
    children: React.ReactNode
    allowedRoles?: string[]
}) {
    const { isAuthenticated, user, accessToken, sessionStatus } = useAuthStore()
    const router = useRouter()
    const [isBootstrapping, setIsBootstrapping] = useState(true)

    useEffect(() => {
        const bootstrap = async () => {
            if (accessToken && isAuthenticated) {
                setIsBootstrapping(false)
                return
            }

            // Shared single-flight refresh — hydrates the store on success.
            const token = await ensureFreshSession()
            // Only redirect to /login when the session was genuinely lost. If the
            // refresh failed for a network reason (offline / timeout / 5xx), the
            // persisted user survives (sessionStatus becomes 'unverified') and we
            // render the cached UI below instead of bouncing the tech to login.
            if (!token && !useAuthStore.getState().user) {
                router.push("/login")
            }
            setIsBootstrapping(false)
        }

        void bootstrap()
    }, [accessToken, isAuthenticated, router])

    useEffect(() => {
        if (!isBootstrapping && allowedRoles && user && !allowedRoles.includes(user.role)) {
            router.push("/")
        }
    }, [allowedRoles, isBootstrapping, router, user])

    // Render when we hold a live token (verified online) OR when we have a
    // persisted user but couldn't confirm the session due to a network failure
    // (offline). The offline banner (separate component) surfaces the state.
    const hasVerifiedSession = isAuthenticated && !!accessToken
    const hasOfflineSession = !!user && sessionStatus === "unverified"

    if (!hasVerifiedSession && !hasOfflineSession) {
        // Still bootstrapping, or no session at all (bootstrap pushes to /login).
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-lg">Loading access...</div>
            </div>
        )
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return null
    }

    return <>{children}</>
}


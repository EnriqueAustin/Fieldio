"use client"

import { useAuthStore } from "../../store/auth"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import api from "../../lib/api"

export default function ProtectedRoute({
    children,
    allowedRoles,
}: {
    children: React.ReactNode
    allowedRoles?: string[]
}) {
    const { isAuthenticated, user, accessToken, hydrateSession, logout } = useAuthStore()
    const router = useRouter()
    const [isBootstrapping, setIsBootstrapping] = useState(true)

    useEffect(() => {
        const bootstrap = async () => {
            if (accessToken && isAuthenticated) {
                setIsBootstrapping(false)
                return
            }

            try {
                const response = await api.post("/auth/refresh")
                const { user, accessToken } = response.data.data
                hydrateSession(user, accessToken)
            } catch {
                logout()
                router.push("/login")
            } finally {
                setIsBootstrapping(false)
            }
        }

        void bootstrap()
    }, [accessToken, hydrateSession, isAuthenticated, logout, router])

    useEffect(() => {
        if (!isBootstrapping && allowedRoles && user && !allowedRoles.includes(user.role)) {
            router.push("/")
        }
    }, [allowedRoles, isBootstrapping, router, user])

    if (isBootstrapping || !isAuthenticated || !accessToken) {
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


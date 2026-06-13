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
    const { isAuthenticated, user, accessToken } = useAuthStore()
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
            if (!token) {
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


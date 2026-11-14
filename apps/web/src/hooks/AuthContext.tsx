import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/auth'
import type { User, UserRole } from '../api/types'

type AuthContextValue = {
  user: User | null
  role: UserRole | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const authGeneration = useRef(0)

  useEffect(() => {
    const generation = authGeneration.current
    let active = true

    void getCurrentUser()
      .then((currentUser) => {
        if (active && generation === authGeneration.current) setUser(currentUser)
      })
      .catch(() => {
        if (active && generation === authGeneration.current) setUser(null)
      })
      .finally(() => {
        if (active && generation === authGeneration.current) setIsLoading(false)
      })

    function handleUnauthorized() {
      authGeneration.current += 1
      setUser(null)
      setIsLoading(false)
    }

    window.addEventListener('autohire:unauthorized', handleUnauthorized)
    return () => {
      active = false
      window.removeEventListener('autohire:unauthorized', handleUnauthorized)
    }
  }, [])

  async function login(email: string, password: string) {
    const signedInUser = await loginRequest(email, password)
    authGeneration.current += 1
    setUser(signedInUser)
    setIsLoading(false)
    return signedInUser
  }

  async function logout() {
    authGeneration.current += 1
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
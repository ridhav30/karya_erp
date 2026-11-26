import { createContext, useContext } from 'react'

export const ToastContext = createContext({ toast: () => {} })
/** toast({ title, description?, tone?: 'success' | 'error' | 'info' }) */
export const useToast = () => useContext(ToastContext).toast

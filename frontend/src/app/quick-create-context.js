import { createContext, useContext } from 'react'

export const QuickCreateContext = createContext(null)
/** openQuickCreate({ doctype, initial?: string | object, onCreated?: (name, doc) => void }) */
export const useQuickCreate = () => useContext(QuickCreateContext)

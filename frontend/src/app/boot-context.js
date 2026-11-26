import { createContext, useContext } from 'react'

export const BootContext = createContext(null)
/** { user, full_name, user_image, roles[], company, currency, can_read{}, is_system_manager, employee, employee_name, is_hr, employee_only, refresh() } */
export const useBoot = () => useContext(BootContext)

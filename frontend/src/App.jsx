import { FrappeProvider } from 'frappe-react-sdk'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from './app/ThemeProvider.jsx'
import { BootProvider } from './app/BootProvider.jsx'
import { ToastProvider } from './app/ToastProvider.jsx'
import { router } from './app/router.jsx'
import DialogHost from './components/DialogHost.jsx'

export default function App() {
  return (
    <FrappeProvider enableSocket={false}>
      <ThemeProvider>
        <ToastProvider>
          <BootProvider>
            <RouterProvider router={router} />
            <DialogHost />
          </BootProvider>
        </ToastProvider>
      </ThemeProvider>
    </FrappeProvider>
  )
}

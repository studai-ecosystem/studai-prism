// Thin application root: providers + router. Routes live in src/app/AppRouter.jsx.
import { AppProviders } from './app/providers/index.jsx'
import AppRouter from './app/AppRouter.jsx'

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}

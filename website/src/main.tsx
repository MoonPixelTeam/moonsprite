import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountProvider } from './account/store'
import { StudioProvider } from './studio/store'
import { DataProvider } from './data/store'
import { Root } from './Root'
import './styles.css'

/*
 * Provider order: accounts, then the studio (both read the api), then the page data that
 * the studio and support screens use, then Root — which needs the catalogue to build the
 * cart, so the cart has to sit inside it.
 */
createRoot(document.getElementById('root')!).render(<StrictMode>
  <AccountProvider>
    <StudioProvider>
      <DataProvider>
        <Root />
      </DataProvider>
    </StudioProvider>
  </AccountProvider>
</StrictMode>)

import { App } from './App'
import { CartProvider } from './market/cart'
import { CatalogueProvider, useCatalogue } from './market/catalogue'

/**
 * Sits between the data providers and the app so the cart can be built from the live
 * catalogue — the built-in packs plus anything published from the studio. The cart
 * resolves product ids against that list, so it has to exist above the cart.
 */
export function Root() {
  return <CatalogueProvider><RootContent /></CatalogueProvider>
}

function RootContent() {
  const { products } = useCatalogue()
  return <CartProvider products={products}>
    <App />
  </CartProvider>
}

import './globals.css'

export const metadata = {
  title: 'Smart Student Budget',
  description: 'Live monthly budget simulation for new university students.'
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}

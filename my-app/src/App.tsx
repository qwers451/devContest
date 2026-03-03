import { useEffect, useState } from 'react'
import './App.css'

type RoutePath = '/' | '/about'

function normalizePath(pathname: string): RoutePath {
  if (pathname === '/about') {
    return '/about'
  }

  return '/'
}

function navigate(path: RoutePath) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

function HomePage() {
  return (
    <section className="card">
      <h1>Home</h1>
      <p>Это главная страница базового роутинга без дополнительных библиотек.</p>
    </section>
  )
}

function AboutPage() {
  return (
    <section className="card">
      <h1>About</h1>
      <p>Этот экран показывает второй маршрут: <code>/about</code>.</p>
    </section>
  )
}

function App() {
  const [path, setPath] = useState<RoutePath>(() => normalizePath(window.location.pathname))

  useEffect(() => {
    const handleRouteChange = () => {
      setPath(normalizePath(window.location.pathname))
    }

    window.addEventListener('popstate', handleRouteChange)

    return () => {
      window.removeEventListener('popstate', handleRouteChange)
    }
  }, [])

  return (
    <>
      <nav className="nav">
        <button
          className={path === '/' ? 'active' : ''}
          onClick={() => navigate('/')}
          type="button"
        >
          Home
        </button>
        <button
          className={path === '/about' ? 'active' : ''}
          onClick={() => navigate('/about')}
          type="button"
        >
          About
        </button>
      </nav>

      {path === '/' ? <HomePage /> : <AboutPage />}
    </>
  )
}

export default App
